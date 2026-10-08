"""Re-vendor web/ui into web/demo/vendor/webui (Aurora-ifkn.7).

Copies every MANIFEST.json modules/styles/icons path byte-verbatim from the
source tree (default: this repo's web/ui; pass a sibling Aurora-WebUI
checkout for closure parity), stamps sourceCommit, and regenerates
descriptors.json via gen-descriptors.py. Vendor files are never hand-edited:
upstream a seam (ifkn.1-6 pattern) or fix web/ui, then re-run this.

Usage, from the repo root:

  python3 web/demo/vendor/sync-webui.py [path-to-Aurora-WebUI]
"""
import json
import os
import re
import shutil
import subprocess
import sys

FILE_DIR = os.path.dirname(os.path.abspath(__file__))  # .../web/demo/vendor
VENDOR_DIR = os.path.join(FILE_DIR, 'webui')
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(FILE_DIR)))  # repo root


def source_commit(source_root):
    try:
        return subprocess.check_output(
            ['git', '-C', source_root, 'rev-parse', '--short', 'HEAD'],
            stderr=subprocess.DEVNULL).decode('utf-8').strip()
    except (subprocess.CalledProcessError, OSError):
        return 'unversioned'


def main():
    source_ui = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(ROOT, 'web', 'ui')
    manifest_path = os.path.join(VENDOR_DIR, 'MANIFEST.json')
    with open(manifest_path, encoding='utf-8') as f:
        manifest = json.load(f)

    copied = 0
    for rel in manifest['modules'] + manifest['styles'] + manifest['icons']:
        src = os.path.join(source_ui, *rel.split('/'))
        dst = os.path.join(VENDOR_DIR, *rel.split('/'))
        if not os.path.exists(src):
            print(f'missing source file: {src}', file=sys.stderr)
            return 1
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        with open(src, 'rb') as fsrc, open(dst, 'wb') as fdst:
            shutil.copyfileobj(fsrc, fdst)
        copied += 1

    with open(manifest_path, encoding='utf-8') as f:
        text = f.read()
    stamped, count = re.subn(
        r'"sourceCommit": "[^"]*"', '"sourceCommit": "%s"' % source_commit(source_ui), text, count=1)
    assert count == 1
    with open(manifest_path, 'w', encoding='utf-8', newline='') as f:
        f.write(stamped)

    gen = os.path.join(VENDOR_DIR, 'gen-descriptors.py')
    result = subprocess.run([sys.executable, gen], cwd=ROOT)
    if result.returncode != 0:
        return result.returncode
    print(f'vendored {copied} files from {source_ui}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
