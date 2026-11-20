"""Copy the WASM engine module into web/demo/vendor/engine/ (gitignored).

  python web/demo/vendor/fetch-engine.py <dir holding aurora-engine.mjs and .wasm>
  python web/demo/vendor/fetch-engine.py --editor-only

The module is a CI artifact (wasm.yml, aurora-engine-wasm), never committed.
Either form also builds the graph editor into web/demo/graph-editor/
(build-editor.py), so one command sets up the demo's gitignored pieces.
"""
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
FILES = ('aurora-engine.mjs', 'aurora-engine.wasm')
WRAPPER = os.path.join(HERE, '..', '..', 'engine', 'engine.js')


def build_editor():
    subprocess.run([sys.executable, os.path.join(HERE, 'build-editor.py')], check=True)


def copy_wrapper():
    dest = os.path.join(HERE, 'engine')
    os.makedirs(dest, exist_ok=True)
    shutil.copyfile(WRAPPER, os.path.join(dest, 'engine.js'))
    print(f'copied engine.js -> {dest}')


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    if sys.argv[1] == '--editor-only':
        copy_wrapper()
        build_editor()
        return
    src = sys.argv[1]
    missing = [f for f in FILES if not os.path.isfile(os.path.join(src, f))]
    if missing:
        sys.exit(f'missing in {src}: {", ".join(missing)}')
    dest = os.path.join(HERE, 'engine')
    os.makedirs(dest, exist_ok=True)
    for f in FILES:
        shutil.copyfile(os.path.join(src, f), os.path.join(dest, f))
        print(f'copied {f} -> {dest}')
    copy_wrapper()
    build_editor()


main()
