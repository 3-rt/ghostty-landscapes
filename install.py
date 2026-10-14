#!/usr/bin/env python3
"""Install the built collection without replacing unrelated Ghostty settings."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

PROJECT = Path(__file__).resolve().parent

def remove(path):
    if path.is_symlink() or path.is_file():
        path.unlink(missing_ok=True)
    elif path.is_dir():
        shutil.rmtree(path)

def snapshot(paths, backup):
    saved = []
    for index, path in enumerate(paths):
        copy = backup / str(index)
        if path.is_symlink():
            copy.symlink_to(os.readlink(path), target_is_directory=path.is_dir())
            kind = 'symlink'
        elif path.is_dir():
            shutil.copytree(path, copy, symlinks=True)
            kind = 'directory'
        elif path.exists():
            shutil.copy2(path, copy, follow_symlinks=False)
            kind = 'file'
        else:
            kind = 'missing'
        saved.append((path, copy, kind))
    return saved

def restore(saved):
    for path, copy, kind in reversed(saved):
        remove(path)
        if kind == 'missing':
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        if kind == 'directory':
            shutil.copytree(copy, path, symlinks=True)
        elif kind == 'symlink':
            path.symlink_to(os.readlink(copy), target_is_directory=copy.is_dir())
        else:
            shutil.copy2(copy, path, follow_symlinks=False)

def install(config_dir, data_dir, bin_dir, scene):
    roots = tuple(Path(path).expanduser() for path in (config_dir, data_dir, bin_dir))
    linked_root = next((path for path in roots if path.is_symlink()), None)
    if linked_root is not None:
        raise ValueError(f'Installation destination contains a symlink: {linked_root}. Choose ordinary directories and files with --config-dir, --data-dir, and --bin-dir.')
    config_dir, data_dir, bin_dir = (path.resolve() for path in roots)
    build = PROJECT / 'collection/build'
    catalog = json.loads((build / 'catalog.json').read_text())
    if scene not in catalog:
        raise ValueError(f'Unknown scene: {scene}')
    library = config_dir / 'backgrounds'
    runtime = data_dir / 'collection'
    config = config_dir / 'config'
    cli = bin_dir / 'ghost-bg'
    destinations = [
        config,
        config_dir / 'config.before-ghost-bg',
        config_dir / '.ghost-bg-state.json',
        library,
        config_dir / 'shaders',
        runtime,
        cli,
    ]
    # Following an existing link could mutate files outside the rollback snapshot.
    # Refuse before staging or touching any installation destination.
    for destination in destinations:
        candidates = [destination]
        if destination.is_dir() and not destination.is_symlink():
            candidates.extend(destination.rglob('*'))
        linked = next((path for path in candidates if path.is_symlink()), None)
        if linked is not None:
            raise ValueError(f'Installation destination contains a symlink: {linked}. Choose ordinary directories and files with --config-dir, --data-dir, and --bin-dir.')
    with tempfile.TemporaryDirectory(prefix='ghost-bg-install-') as temporary:
        stage = Path(temporary) / 'stage'
        staged_library = stage / 'backgrounds'
        staged_runtime = stage / 'collection'
        staged_library.mkdir(parents=True)
        (staged_runtime / 'build').mkdir(parents=True)
        for name in ['index.html', 'gallery.js', 'gallery.css']:
            shutil.copy2(PROJECT / 'collection' / name, staged_runtime / name)
        shutil.copy2(build / 'gallery-data.js', staged_runtime / 'build/gallery-data.js')
        for name, item in catalog.items():
            for key in ['file', 'preview_file']:
                shutil.copy2(build / item[key], staged_library / item[key])
            folder = staged_runtime / 'scenes' / name
            folder.mkdir(parents=True)
            template = folder / 'scene.template.glsl'
            shutil.copy2(PROJECT / 'collection/scenes' / name / 'scene.template.glsl', template)
            item['shader_template'] = str(runtime / 'scenes' / name / 'scene.template.glsl')
            item['preview_path'] = runtime.joinpath('index.html').as_uri() + '?scene=' + name
        (staged_library / 'catalog.json').write_text(json.dumps(catalog, indent=2) + '\n')
        staged_cli = stage / 'ghost-bg'
        shutil.copy2(PROJECT / 'bin/ghost-bg', staged_cli)
        staged_cli.chmod(0o755)
        backup = Path(temporary) / 'backup'
        backup.mkdir()
        saved = snapshot(destinations, backup)
        try:
            config_dir.mkdir(parents=True, exist_ok=True)
            if not config.exists():
                config.write_text('background-opacity = 0.8\nbackground-image-opacity = 0.18\nbackground-image-fit = cover\nbackground-image-position = center\n')
            library.mkdir(exist_ok=True)
            shutil.copytree(staged_library, library, dirs_exist_ok=True)
            remove(runtime)
            shutil.copytree(staged_runtime, runtime)
            bin_dir.mkdir(parents=True, exist_ok=True)
            shutil.copy2(staged_cli, cli)
            cli.chmod(0o755)
            environment = dict(os.environ, GHOST_BG_DIR=str(config_dir), GHOST_BG_DATA_DIR=str(data_dir))
            result = subprocess.run([sys.executable, str(PROJECT / 'bin/ghost-bg'), 'use', scene], env=environment)
            if result.returncode:
                raise RuntimeError('Ghostty rejected the installation')
        except BaseException:
            restore(saved)
            raise
    print(f'Installed ten animated scenes. CLI: {bin_dir / "ghost-bg"}')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config-dir', type=Path, default=Path.home() / '.config/ghostty')
    parser.add_argument('--data-dir', type=Path, default=Path.home() / '.local/share/ghost-bg')
    parser.add_argument('--bin-dir', type=Path, default=Path.home() / '.local/bin')
    parser.add_argument('--scene', default='rain')
    args = parser.parse_args()
    install(args.config_dir, args.data_dir, args.bin_dir, args.scene)
