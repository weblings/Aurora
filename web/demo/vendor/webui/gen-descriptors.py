"""Regenerate vendor/webui/descriptors.json from the C++ descriptor tables.

The Dashboard reads GET /api/descriptors as {descriptors: [{key, kind,
description, param?}]} (see Tooltips.js); the shim serves this file verbatim.
Sources mirror the backend's own merge: core tables + Hue + both Input plugins.
Only the core video/audio tables carry slider params (Aurora-ta5); every other
table is kind + description. Param defaults resolve from Config.hpp's in-class
initializers -- the same single source the C++ tables read via defaults().

Floats serialize in float32-shortest form, mirroring the backend's
shortestDecimal (ControlDescriptors.cpp): 0.01f goes out as 0.01, never
0.009999999776482582 -- the WebUI derives a slider's displayed decimals from
its step's digits. Integral values keep the backend's trailing .0 (8000.0).

Re-run on any re-vendor or tooltip-copy change, from the repo root:

  python3 web/demo/vendor/webui/gen-descriptors.py
"""
import json
import os
import re
import struct
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))  # .../web/demo/vendor/webui
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(SCRIPT_DIR))))  # repo root
CONFIG = 'core/Runtime/include/Aurora/Runtime/Config.hpp'
SOURCES = [
    'core/Runtime/src/ControlDescriptorTables.cpp',
    'output/hue/src/HueControlDescriptors.cpp',
    'input/linux/src/InputControlDescriptors.cpp',
    'input/windows/src/InputControlDescriptors.cpp',
]

FLOAT_LIT = r'-?[0-9]+(?:\.[0-9]*)?f'
PLAIN_RE = re.compile(r'\{\s*"([A-Za-z][A-Za-z.]*)",\s*"([a-z]+)",\s*"([^"]*)"\s*\}')
SLIDER_RE = re.compile(
    r'slider\(\s*"([A-Za-z][A-Za-z.]*)",\s*"([^"]*)",\s*'
    r'\{\s*"([^"]*)",\s*(' + FLOAT_LIT + r'),\s*(' + FLOAT_LIT + r'),\s*(' + FLOAT_LIT + r'),\s*'
    r'"([^"]*)",\s*defaults\(\)\.([A-Za-z]+?)(?:\s*,\s*/\*allowsUnset\*/\s*(true))?\s*\}\s*\)')
DEFAULT_RE = re.compile(r'float\s+([A-Za-z]+)\s*\{\s*(' + FLOAT_LIT + r')\s*\}\s*;')


def f32_of(literal):
    """float32 value of a C++ decimal literal (trailing f stripped)."""
    return struct.unpack('<f', struct.pack('<f', float(literal.rstrip('f'))))[0]


def shortest(value):
    """Shortest decimal text that parses back to the same float32 value.

    Mirrors the backend's shortestDecimal (std::to_chars shortest round-trip):
    fixed notation wins ties, so 8000.f is "8000", never "8e+03".
    """
    ref = struct.pack('<f', value)
    best = None
    for prec in range(0, 13):
        for cand in ('%.*f' % (prec, value), '%.*g' % (prec + 1, value)):
            if '.' in cand:
                cand = cand.rstrip('0').rstrip('.')
            if struct.pack('<f', float(cand)) != ref:
                continue
            if best is None or len(cand) < len(best) or (len(cand) == len(best) and 'e' not in cand and 'e' in best):
                best = cand
    assert best is not None, value
    if '.' not in best and 'e' not in best:
        best += '.0'  # backend dumps integral doubles as 8000.0, not 8000
    return best


with open(os.path.join(ROOT, CONFIG), encoding='utf-8') as f:
    defaults = {name: f32_of(lit) for name, lit in DEFAULT_RE.findall(f.read())}

entries = {}
short = {}
for source in SOURCES:
    path = os.path.join(ROOT, source)
    if not os.path.exists(path):
        print(f'skipping missing {source}', file=sys.stderr)
        continue
    with open(path, encoding='utf-8') as f:
        text = f.read()
    sliders = {}
    for key, description, label, minimum, maximum, step, unit, field, unset in SLIDER_RE.findall(text):
        if field not in defaults:
            print(f'{source}: no Config default for {field}', file=sys.stderr)
            sys.exit(1)
        numbers = {
            'min': f32_of(minimum),
            'max': f32_of(maximum),
            'step': f32_of(step),
            'default': defaults[field],
        }
        for value in numbers.values():
            short.setdefault(repr(value), shortest(value))
        sliders[key] = {
            'key': key,
            'kind': 'slider',
            'description': description,
            'param': {
                'label': label,
                'min': numbers['min'],
                'max': numbers['max'],
                'step': numbers['step'],
                'unit': unit,
                'default': numbers['default'],
                'allowsUnset': unset == 'true',
            },
        }
    text = SLIDER_RE.sub('', text)  # plain parse must not see param braces
    for key, kind, description in PLAIN_RE.findall(text):
        if key not in sliders:
            entries[key] = {'key': key, 'kind': kind, 'description': description}
    entries.update(sliders)

# Payload first with full-precision floats, then rewrite each param number in
# place: the `"key": <repr>` context makes the substitution exact, so prose
# carrying digit strings can never match.
payload = json.dumps({'descriptors': [entries[k] for k in sorted(entries)]}, indent=2, ensure_ascii=False)
for name in ('min', 'max', 'step', 'default'):
    for emitted, compact in short.items():
        payload = re.sub(r'("%s": )%s(?![0-9.eE])' % (name, re.escape(emitted)), r'\g<1>%s' % compact, payload)
payload += '\n'

out = os.path.join(ROOT, 'web', 'demo', 'vendor', 'webui', 'descriptors.json')
# CRLF on purpose: the checked-in file is CRLF, so the write is
# newline-explicit -- a plain text-mode newline would regen LF on Linux
# and never be byte-identical.
with open(out, 'wb') as f:
    f.write(payload.replace('\n', '\r\n').encode('utf-8'))
print(f'wrote {len(entries)} descriptors to {out}')
