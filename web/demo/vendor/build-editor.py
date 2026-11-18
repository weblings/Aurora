"""Build the graph editor into web/demo/graph-editor/ (gitignored).

  python web/demo/vendor/build-editor.py

Runs `npm run build` in web/graph-editor, copies dist/ and inserts the iframe
stand-in script before the editor bundle. The demo Dashboard probes
graph-editor/, so without this output Edit graph stays hidden.
Wrap the build in the stack lock when other agents share the machine.
"""
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
EDITOR = os.path.normpath(os.path.join(HERE, '..', '..', 'graph-editor'))
DEST = os.path.normpath(os.path.join(HERE, '..', 'graph-editor'))
STAND_IN = '<script type="module" src="../demo-editor-entry.js"></script>'


def with_stand_in(html):
    """Insert the stand-in before the first module script (the editor bundle)."""
    match = re.search(r'^([ \t]*)<script type="module"', html, re.M)
    if not match:
        sys.exit('no module script found in the editor index.html')
    return html[:match.start()] + match.group(1) + STAND_IN + '\n' + html[match.start():]


def main():
    npm = shutil.which('npm')
    if not npm:
        sys.exit('npm not found on PATH')
    if not os.path.isdir(os.path.join(EDITOR, 'node_modules')):
        subprocess.run([npm, 'ci'], cwd=EDITOR, check=True)
    subprocess.run([npm, 'run', 'build'], cwd=EDITOR, check=True)
    dist = os.path.join(EDITOR, 'dist')
    shutil.rmtree(DEST, ignore_errors=True)
    shutil.copytree(dist, DEST)
    page = os.path.join(DEST, 'index.html')
    with open(page, encoding='utf8') as f:
        html = f.read()
    with open(page, 'w', encoding='utf8', newline='\n') as f:
        f.write(with_stand_in(html))
    print(f'editor -> {DEST}')


main()
