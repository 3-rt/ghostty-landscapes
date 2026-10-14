import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

PROJECT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('installer', PROJECT / 'install.py')
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)

class InstallTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.config = self.root / 'config'
        self.config.mkdir()
        self.original = (PROJECT / 'tests/fixtures/config').read_bytes()
        (self.config / 'config').write_bytes(self.original)

    def root_link_case(self, name, entrypoint):
        case = self.root / f'{entrypoint}-{name}'
        case.mkdir()
        roots = {}
        for root_name in ('config', 'data', 'bin'):
            target = case / f'actual-{root_name}'
            target.mkdir()
            (target / 'marker').write_text(root_name)
            root = case / root_name
            if root_name == name:
                root.symlink_to(target, target_is_directory=True)
            else:
                root.mkdir()
                (root / 'marker').write_text(root_name)
            roots[root_name] = root
        config = roots['config'] / 'config'
        if not config.exists():
            config.write_bytes(self.original)
        return case, roots

    def tree_state(self, root):
        state = []
        for path in sorted(root.rglob('*')):
            relative = str(path.relative_to(root))
            if path.is_symlink():
                state.append((relative, 'symlink', os.readlink(path)))
            elif path.is_file():
                state.append((relative, 'file', path.read_bytes()))
            else:
                state.append((relative, 'directory', None))
        return state

    def test_install_then_use_different_scene(self):
        installer.install(self.config, self.root / 'data', self.root / 'bin', 'rain')
        catalog = json.loads((self.config / 'backgrounds/catalog.json').read_text())
        self.assertEqual(len(catalog), 10)
        self.assertTrue(all(item['animated'] for item in catalog.values()))
        self.assertTrue(all(Path(item['shader_template']).is_file() for item in catalog.values()))
        self.assertTrue(all((self.config / 'backgrounds' / item['preview_file']).is_file() for item in catalog.values()))
        env = dict(os.environ, GHOST_BG_DIR=str(self.config), GHOST_BG_DATA_DIR=str(self.root / 'data'))
        result = subprocess.run([str(self.root / 'bin/ghost-bg'), 'use', 'windmill'], env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn(catalog['windmill']['file'], (self.config / 'config').read_text())
        self.assertIn('font-size = 15', (self.config / 'config').read_text())

    def test_failed_validation_restores_existing_config_and_catalog(self):
        lib = self.config / 'backgrounds'
        lib.mkdir()
        old = b'{"previous": {"file": "old.png"}}\n'
        (lib / 'catalog.json').write_bytes(old)
        runtime = self.root / 'data/collection'
        runtime.mkdir(parents=True)
        (runtime / 'old.txt').write_text('old runtime')
        cli = self.root / 'bin/ghost-bg'
        cli.parent.mkdir()
        cli.write_text('old cli')
        with patch.object(installer.subprocess, 'run', return_value=subprocess.CompletedProcess([], 1)):
            with self.assertRaises(RuntimeError):
                installer.install(self.config, self.root / 'data', self.root / 'bin', 'rain')
        self.assertEqual((self.config / 'config').read_bytes(), self.original)
        self.assertEqual((lib / 'catalog.json').read_bytes(), old)
        self.assertEqual(set(lib.iterdir()), {lib / 'catalog.json'})
        self.assertEqual((runtime / 'old.txt').read_text(), 'old runtime')
        self.assertEqual(set(runtime.iterdir()), {runtime / 'old.txt'})
        self.assertEqual(cli.read_text(), 'old cli')
        self.assertFalse((self.config / '.ghost-bg-state.json').exists())
        self.assertFalse((self.config / 'shaders').exists())

    def test_symlinked_destinations_rejected_before_mutation(self):
        target = self.root / 'actual-library'
        target.mkdir()
        old = b'{"previous": {"file": "old.png"}}\n'
        (target / 'catalog.json').write_bytes(old)
        library = self.config / 'backgrounds'
        library.symlink_to(target, target_is_directory=True)
        with patch.object(installer.subprocess, 'run') as validate:
            with self.assertRaisesRegex(ValueError, 'symlink'):
                installer.install(self.config, self.root / 'data', self.root / 'bin', 'rain')
            validate.assert_not_called()
        self.assertTrue(library.is_symlink())
        self.assertEqual((target / 'catalog.json').read_bytes(), old)
        self.assertEqual(set(target.iterdir()), {target / 'catalog.json'})
        self.assertEqual((self.config / 'config').read_bytes(), self.original)
        self.assertFalse((self.root / 'data').exists())
        library.unlink()
        library.mkdir()
        (library / 'catalog.json').symlink_to(target / 'catalog.json')
        with self.assertRaisesRegex(ValueError, 'symlink'):
            installer.install(self.config, self.root / 'data', self.root / 'bin', 'rain')
        self.assertEqual((target / 'catalog.json').read_bytes(), old)
        self.assertEqual((self.config / 'config').read_bytes(), self.original)

    def test_symlinked_roots_rejected_by_install_before_mutation(self):
        for name in ('config', 'data', 'bin'):
            with self.subTest(name=name):
                case, roots = self.root_link_case(name, 'install')
                before = self.tree_state(case)
                with patch.object(installer.subprocess, 'run') as validate:
                    with self.assertRaisesRegex(ValueError, 'symlink'):
                        installer.install(roots['config'], roots['data'], roots['bin'], 'rain')
                    validate.assert_not_called()
                self.assertEqual(self.tree_state(case), before)

    def test_symlinked_roots_rejected_by_cli_before_mutation(self):
        for name in ('config', 'data', 'bin'):
            with self.subTest(name=name):
                case, roots = self.root_link_case(name, 'cli')
                before = self.tree_state(case)
                result = subprocess.run([
                    sys.executable,
                    str(PROJECT / 'install.py'),
                    '--config-dir', str(roots['config']),
                    '--data-dir', str(roots['data']),
                    '--bin-dir', str(roots['bin']),
                ], capture_output=True, text=True)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('symlink', result.stderr)
                self.assertEqual(self.tree_state(case), before)
