"""Regenerate vendor/webui/descriptors.json from the C++ descriptor tables.

The Dashboard reads GET /api/descriptors as {descriptors: [{key,
description}]} (see Tooltips.js); the shim serves this file verbatim. Sources
mirror the backend's own merge: core tables + Hue + both Input plugins.
Re-run on any re-vendor or tooltip-copy change, from the repo root:

  python3 web/demo/vendor/webui/gen-descriptors.py
"""
import json
import os
import re
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))  # .../web/demo/vendor/webui
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(SCRIPT_DIR))))  # repo root
SOURCES = [
    'core/Runtime/src/ControlDescriptorTables.cpp',
    'output/hue/src/HueControlDescriptors.cpp',
    'input/linux/src/InputControlDescriptors.cpp',
    'input/windows/src/InputControlDescriptors.cpp',
]
ENTRY_RE = re.compile(r'"([A-Za-z][A-Za-z.]*)", "[a-z]*", "([^"]*)"')

entries = {}
for source in SOURCES:
    path = os.path.join(ROOT, source)
    if not os.path.exists(path):
        print(f'skipping missing {source}', file=sys.stderr)
        continue
    for key, description in ENTRY_RE.findall(open(path).read()):
        entries[key] = description

out = os.path.join(ROOT, 'web', 'demo', 'vendor', 'webui', 'descriptors.json')
with open(out, 'w') as f:
    json.dump({'descriptors': [{'key': k, 'description': v} for k, v in sorted(entries.items())]}, f, indent=2)
    f.write('\n')
print(f'wrote {len(entries)} descriptors to {out}')
