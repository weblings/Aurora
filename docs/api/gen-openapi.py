"""Regenerate docs/api/openapi.json from docs/api/openapi.yaml.

C++ reads the JSON through nlohmann, so it needs no YAML parser. The spec is
also checked against the OpenAPI schema. From the repo root, in a venv built
from docs/api/requirements.txt:

  python docs/api/gen-openapi.py

Pass --check to write nothing and exit 1 when the JSON is stale or the spec
is invalid (CI).
"""
import json
import os
import sys

import yaml
from openapi_spec_validator import validate

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(HERE, 'openapi.yaml')
TARGET = os.path.join(HERE, 'openapi.json')


def main():
    with open(SOURCE, encoding='utf-8') as f:
        spec = yaml.safe_load(f)
    validate(spec)
    text = json.dumps(spec, indent=2, ensure_ascii=False) + '\n'
    if '--check' in sys.argv:
        current = ''
        if os.path.exists(TARGET):
            with open(TARGET, encoding='utf-8', newline='') as f:
                current = f.read().replace('\r\n', '\n')
        if current != text:
            print('docs/api/openapi.json is stale: run python docs/api/gen-openapi.py', file=sys.stderr)
            return 1
        return 0
    with open(TARGET, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    return 0


if __name__ == '__main__':
    sys.exit(main())
