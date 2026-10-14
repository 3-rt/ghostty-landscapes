#!/usr/bin/env python3
"""Check all animated scenes and the real picker against isolated configs."""
import json
import os
from pathlib import Path
import re
import runpy
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import pexpect

PROJECT = Path(__file__).resolve().parents[1]
CLI = str(PROJECT / 'bin/ghost-bg')
LIVE = PROJECT / 'tests/fixtures'
default_library = PROJECT / 'collection/build'
LIBRARY = Path(os.environ.get('GHOST_BG_TEST_LIBRARY', str(default_library)))
CATALOG = json.loads((LIBRARY / 'catalog.json').read_text())

class BackgroundTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='ghost-bg-test-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.config = self.root / 'config'
        text = (LIVE / 'config').read_text()
        text = re.sub(r'^background-image = .*$', 'background-image = ', text, flags=re.M)
        text = re.sub(r'^background-image-opacity = .*$', 'background-image-opacity = 0.18', text, flags=re.M)
        text = re.sub(r'^custom-shader = .*?/ghost-bg-[a-z]+(?:-[0-9a-f]{12})?\.glsl\n', '', text, flags=re.M)
        self.original = text
        self.config.write_text(text)
        (self.root / 'backgrounds').symlink_to(LIBRARY)
        self.env = dict(os.environ, GHOST_BG_DIR=str(self.root), TERM='xterm-256color')

    def run_cli(self, *args, success=True):
        r = subprocess.run([CLI, *args], env=self.env, text=True, capture_output=True)
        self.assertEqual(r.returncode == 0, success, r.stdout + r.stderr)
        return r

    def shader(self):
        return Path(re.search(r'^custom-shader = (.*ghost-bg-[a-z]+-[0-9a-f]{12}\.glsl)$', self.config.read_text(), re.M)[1])

    def test_catalog_and_select_every_scene(self):
        self.assertEqual(set(CATALOG), {'coast','lake','garden','winter','autumn','rain','desert','tropical','moon','windmill'})
        self.assertTrue(all(v['animated'] for v in CATALOG.values()))
        self.assertEqual(len({v['file'] for v in CATALOG.values()}), 10)
        shaders = set()
        for name, item in CATALOG.items():
            with self.subTest(name=name):
                before = self.config.read_text()
                self.run_cli('use', name)
                text = self.config.read_text()
                self.assertIn('background-image = ' + str((LIBRARY / item['file']).resolve()), text)
                self.assertIn('background-image-opacity = 0.18', text)
                self.assertIn('background-opacity = 0.8', text)
                self.assertIn('font-size = 15', text)
                self.assertEqual((self.root / 'config.before-ghost-bg').read_text(), before)
                shader = self.shader()
                self.assertTrue(shader.is_file())
                self.assertTrue(shader.name.startswith('ghost-bg-' + name + '-'))
                self.assertIn(Path(item['shader_template']).read_text(), shader.read_text())
                shaders.add(shader.name)
        self.assertEqual(len(shaders), 10)

    def test_strength_and_alias(self):
        self.run_cli('use', 'tropical')
        old = self.shader()
        self.run_cli('strength', '12')
        self.assertNotEqual(old, self.shader())
        self.assertIn('const float STRENGTH = 0.120000;', self.shader().read_text())
        self.assertIn(CATALOG['tropical']['file'], self.config.read_text())
        self.run_cli('use', 'rain-live')
        before = self.config.read_text()
        self.assertIn(CATALOG['rain']['file'], before)
        self.assertIn('Already saved.', self.run_cli('use', 'rain').stdout)
        self.assertEqual(self.config.read_text(), before)

    def test_off_preserves_other_shader_and_strength(self):
        other = self.root / 'other.glsl'
        other.write_text('void mainImage(out vec4 c,in vec2 p){c=texture(iChannel0,p/iResolution.xy);}')
        original = self.original.replace('background-image-fit = cover', 'background-image-fit = contain')
        original += f'background-image-position = bottom-right\ncustom-shader-animation = false\ncustom-shader = {other}\n'
        self.config.write_text(original)
        self.run_cli('use', 'moon')
        selected = self.config.read_text()
        self.assertIn('background-image-fit = cover', selected)
        self.assertIn('background-image-position = center', selected)
        self.assertIn('custom-shader-animation = true', selected)
        self.run_cli('strength', '12')
        self.run_cli('off')
        text = self.config.read_text()
        self.assertIn(f'custom-shader = {other}', text)
        self.assertNotRegex(text, r'custom-shader = .*/ghost-bg-[a-z]+-[0-9a-f]{12}\.glsl')
        self.assertIn('background-image = \n', text)
        self.assertIn('background-image-opacity = 0.12', text)
        self.assertIn('background-image-fit = contain', text)
        self.assertIn('background-image-position = bottom-right', text)
        self.assertIn('custom-shader-animation = false', text)
        self.assertFalse((self.root / '.ghost-bg-state.json').exists())
        self.run_cli('use', 'lake')
        self.assertIn('STRENGTH = 0.120000', self.shader().read_text())

    def test_invalid_inputs_and_config_do_not_mutate(self):
        for args in [('strength','nan'),('strength','-1'),('strength','101'),('use','../bad')]:
            self.run_cli(*args, success=False)
            self.assertEqual(self.config.read_text(), self.original)
        self.config.write_text(self.original + 'not-a-ghostty-option = nope\n')
        before = self.config.read_text()
        self.run_cli('use', 'coast', success=False)
        self.assertEqual(before, self.config.read_text())
        self.assertFalse(list((self.root / 'shaders').glob('*.glsl')))

    def manually_remove_collection(self):
        text = re.sub(r'^custom-shader = .*ghost-bg-.*\n', '', self.config.read_text(), flags=re.M)
        text = re.sub(r'^background-image-fit = .*$', 'background-image-fit = contain', text, flags=re.M)
        text = re.sub(r'^background-image-position = .*$', 'background-image-position = bottom-right', text, flags=re.M)
        text += 'custom-shader-animation = false\n'
        self.config.write_text(text)

    def test_reactivation_snapshots_new_manual_settings(self):
        self.run_cli('use', 'rain')
        self.manually_remove_collection()
        self.run_cli('use', 'moon')
        self.run_cli('off')
        text = self.config.read_text()
        self.assertIn('background-image-fit = contain', text)
        self.assertIn('background-image-position = bottom-right', text)
        self.assertIn('custom-shader-animation = false', text)
        self.assertFalse((self.root / '.ghost-bg-state.json').exists())

    def test_off_discards_stale_state_without_restoring_it(self):
        self.run_cli('use', 'rain')
        self.manually_remove_collection()
        text = re.sub(r'^background-image = .*$', 'background-image = ', self.config.read_text(), flags=re.M)
        self.config.write_text(text)
        self.run_cli('off')
        self.assertEqual(self.config.read_text(), text)
        self.assertFalse((self.root / '.ghost-bg-state.json').exists())

    def test_failed_strength_update_rolls_back(self):
        self.run_cli('use', 'rain')
        old = self.shader()
        content = old.read_bytes()
        self.config.write_text(self.config.read_text() + 'not-a-ghostty-option = nope\n')
        before = self.config.read_text()
        self.run_cli('strength', '30', success=False)
        self.assertEqual(self.config.read_text(), before)
        self.assertEqual(old.read_bytes(), content)
        self.assertEqual(list((self.root / 'shaders').glob('*.glsl')), [old])

    def test_opaque_background_rejected_without_mutation(self):
        self.config.write_text(self.original.replace('background-opacity = 0.8','background-opacity = 1'))
        before = self.config.read_text()
        self.run_cli('use', 'winter', success=False)
        self.assertEqual(self.config.read_text(), before)

    def test_legacy_managed_shader_is_removed(self):
        old = self.root / 'shaders/ghost-bg-city-123456789abc.glsl'
        old.parent.mkdir()
        old.write_text('void mainImage(out vec4 c,in vec2 p){c=texture(iChannel0,p/iResolution.xy);}')
        self.config.write_text(self.original + f'custom-shader = {old}\n')
        self.run_cli('use', 'windmill')
        self.assertNotIn(str(old), self.config.read_text())
        self.assertTrue(old.exists())

    def test_preview_and_full_preview_routes(self):
        for name in CATALOG:
            output = self.run_cli('preview', name, '--detail').stdout
            self.assertIn('artwork detail', output)
            self.assertIn('\x1b[', output)
        with patch.dict(os.environ, self.env):
            namespace = runpy.run_path(CLI, run_name='ghost_bg_test')
        with patch.object(namespace['subprocess'], 'run') as opened:
            for name in CATALOG:
                namespace['preview'](name, full=True)
                self.assertEqual(opened.call_args.args[0][-1], CATALOG[name]['preview_path'])
                self.assertTrue(CATALOG[name]['preview_path'].endswith('?scene=' + name))
        self.assertEqual(self.config.read_text(), self.original)

    def picker(self):
        child = pexpect.spawn(CLI, env=self.env, encoding='utf-8', timeout=15, dimensions=(36,140))
        self.addCleanup(child.close)
        child.expect('Background >')
        return child

    def test_picker_cancel_preserves_config(self):
        child = self.picker()
        child.sendcontrol('d')
        child.expect('artwork detail')
        child.sendcontrol('c')
        child.expect('Cancelled. Background unchanged.')
        child.expect(pexpect.EOF)
        self.assertEqual(self.config.read_text(), self.original)

    def test_picker_search_selects_correct_animation(self):
        for name in ['garden','rain']:
            with self.subTest(name=name):
                child = self.picker()
                child.send(CATALOG[name]['title'])
                child.expect(rf'(?<!\d)1/{len(CATALOG)}(?!\d)')
                child.send('\r')
                child.expect('Saved.')
                child.expect(pexpect.EOF)
                self.assertIn(CATALOG[name]['file'], self.config.read_text())
                self.assertTrue(self.shader().is_file())

if __name__ == '__main__':
    unittest.main(verbosity=2)
