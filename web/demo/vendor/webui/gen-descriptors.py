"""Regenerate vendor/webui/descriptors.json from the C++ descriptor tables.

The Dashboard reads GET /api/descriptors as {descriptors: [{key,
description}]} (see Tooltips.js); the shim serves this file verbatim. Sources
mirror the backend's own merge: core tables + Hue + both Input plugins.
Re-run on any re-vendor or tooltip-copy change, from the workspace root:

  python3 Aurora-Demo-Web/vendor/webui/gen-descriptors.py
"""
import json
import os
import re
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))  # .../Aurora-Demo-Web/vendor/webui
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(SCRIPT_DIR)))  # workspace root
SOURCES = [
    'Aurora/core/Runtime/src/ControlDescriptorTables.cpp',
    'Aurora-Output-Hue/src/HueControlDescriptors.cpp',
    'Aurora-Input-Linux/src/InputControlDescriptors.cpp',
    'Aurora-Input-Windows/src/InputControlDescriptors.cpp',
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

out = os.path.join(ROOT, 'Aurora-Demo-Web', 'vendor', 'webui', 'descriptors.json')
with open(out, 'w') as f:
    json.dump({'descriptors': [{'key': k, 'description': v} for k, v in sorted(entries.items())]}, f, indent=2)
    f.write('\n')
print(f'wrote {len(entries)} descriptors to {out}')
