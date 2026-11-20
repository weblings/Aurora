"""Build the recipes page into web/demo/recipes/ (gitignored).

  python web/demo/vendor/build-recipes.py

Runs `npm run build:recipes` in web/graph-editor and copies dist-recipes/ here, so the
page ships next to the demo and the editor (Aurora-4g4d.2). The clips it shows and
copies are docs/recipes/*.clip.json, read at build time.
"""
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
EDITOR = os.path.normpath(os.path.join(HERE, '..', '..', 'graph-editor'))
DEST = os.path.normpath(os.path.join(HERE, '..', 'recipes'))


def main():
    npm = shutil.which('npm')
    if not npm:
        sys.exit('npm not found on PATH')
    if not os.path.isdir(os.path.join(EDITOR, 'node_modules')):
        subprocess.run([npm, 'ci'], cwd=EDITOR, check=True)
    subprocess.run([npm, 'run', 'build:recipes'], cwd=EDITOR, check=True)
    shutil.rmtree(DEST, ignore_errors=True)
    shutil.copytree(os.path.join(EDITOR, 'dist-recipes'), DEST)
    os.replace(os.path.join(DEST, 'recipes.html'), os.path.join(DEST, 'index.html'))
    print(f'recipes -> {DEST}')


main()
