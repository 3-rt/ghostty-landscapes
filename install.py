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

def install(config_dir, data_dir, bin_dir, scene):
    build = PROJECT / 'collection/build'
    catalog = json.loads((build / 'catalog.json').read_text())
    if scene not in catalog:
        raise ValueError(f'Unknown scene: {scene}')
    config_dir.mkdir(parents=True, exist_ok=True)
    library = config_dir / 'backgrounds'
    library.mkdir(exist_ok=True)
    runtime = data_dir / 'collection'
    (runtime / 'build').mkdir(parents=True, exist_ok=True)
    for name in ['index.html', 'gallery.js', 'gallery.css']:
        shutil.copy2(PROJECT / 'collection' / name, runtime / name)
    shutil.copy2(build / 'gallery-data.js', runtime / 'build/gallery-data.js')
    for name, item in catalog.items():
        for key in ['file', 'preview_file']:
            shutil.copy2(build / item[key], library / item[key])
        folder = runtime / 'scenes' / name
        folder.mkdir(parents=True, exist_ok=True)
        template = folder / 'scene.template.glsl'
        shutil.copy2(PROJECT / 'collection/scenes' / name / 'scene.template.glsl', template)
        item['shader_template'] = str(template)
        item['preview_path'] = runtime.joinpath('index.html').as_uri() + '?scene=' + name
    config = config_dir / 'config'
    original_config = config.read_bytes() if config.exists() else None
    catalog_path = library / 'catalog.json'
    original_catalog = catalog_path.read_bytes() if catalog_path.exists() else None
    if original_config is None:
        config.write_text('background-opacity = 0.8\nbackground-image-opacity = 0.18\nbackground-image-fit = cover\n')
    fd, candidate = tempfile.mkstemp(prefix='.catalog-', dir=library)
    try:
        with os.fdopen(fd, 'w') as output:
            json.dump(catalog, output, indent=2)
            output.write('\n')
        os.replace(candidate, catalog_path)
        environment = dict(os.environ, GHOST_BG_DIR=str(config_dir), GHOST_BG_DATA_DIR=str(data_dir))
        result = subprocess.run([sys.executable, str(PROJECT / 'bin/ghost-bg'), 'use', scene], env=environment)
        if result.returncode:
            raise RuntimeError('Ghostty rejected the installation')
    except BaseException:
        if original_config is None:
            config.unlink(missing_ok=True)
        else:
            config.write_bytes(original_config)
        if original_catalog is None:
            catalog_path.unlink(missing_ok=True)
        else:
            catalog_path.write_bytes(original_catalog)
        raise
    finally:
        Path(candidate).unlink(missing_ok=True)
    bin_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(PROJECT / 'bin/ghost-bg', bin_dir / 'ghost-bg')
    (bin_dir / 'ghost-bg').chmod(0o755)
    print(f'Installed ten animated scenes. CLI: {bin_dir / "ghost-bg"}')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config-dir', type=Path, default=Path.home() / '.config/ghostty')
    parser.add_argument('--data-dir', type=Path, default=Path.home() / '.local/share/ghost-bg')
    parser.add_argument('--bin-dir', type=Path, default=Path.home() / '.local/bin')
    parser.add_argument('--scene', default='rain')
    args = parser.parse_args()
    install(args.config_dir.expanduser().resolve(), args.data_dir.expanduser().resolve(), args.bin_dir.expanduser().resolve(), args.scene)
