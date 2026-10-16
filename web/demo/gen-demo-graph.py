"""Regenerate web/demo/demo-graph.js from the C++ built-in graphs.

The demo shim answers GET /api/graph and GET /api/nodes from that file, so the
Tuning panel shows the controls the app does. Sources:
  - core/Runtime/src/Graph/BuiltInGraphs.cpp: control-bearing nodes, their
    types and the `controls` lists (Video and Audio)
  - core/Runtime/src/Graph/{VideoNodes,FrameNodes,AudioNodes}.cpp: each node
    type's param declarations and descriptions
  - web/demo/vendor/webui/descriptors.json: slider ranges for paramSchema(key)
    params (run gen-descriptors.py first when the tables changed)

The demo has one output, "hue", so per-output node ids resolve to ease_hue.

Re-run on any controls or node-param change, from the repo root:

  python3 web/demo/gen-demo-graph.py
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
GRAPH_DIR = 'core/Runtime/src/Graph'
BUILTIN = f'{GRAPH_DIR}/BuiltInGraphs.cpp'
NODE_SOURCES = [f'{GRAPH_DIR}/{n}.cpp' for n in ('VideoNodes', 'FrameNodes', 'AudioNodes')]
DESCRIPTORS = 'web/demo/vendor/webui/descriptors.json'
DEMO_OUTPUT = 'hue'

STR = r'"((?:[^"\\]|\\.)*)"'
STRS = r'((?:\s*"(?:[^"\\]|\\.)*")+)'


def read(rel):
    with open(os.path.join(ROOT, rel), encoding='utf-8') as f:
        return f.read()


def join_literals(text):
    """Concatenate adjacent C++ string literals into one Python string."""
    return ''.join(json.loads('"%s"' % m) for m in re.findall(STR, text))


def per_output_id(prefix):
    return prefix + '_' + re.sub(r'[^A-Za-z0-9]', '_', DEMO_OUTPUT)


def function_body(text, signature_re):
    """Text of the brace-balanced body following the first signature match."""
    match = re.search(signature_re, text)
    if not match:
        sys.exit(f'no match for {signature_re}')
    start = text.index('{', match.end())
    depth = 0
    for i in range(start, len(text)):
        depth += {'{': 1, '}': -1}.get(text[i], 0)
        if depth == 0:
            return text[start:i + 1]
    sys.exit(f'unbalanced braces after {signature_re}')


def num(value):
    value = float(value)
    return int(value) if value.is_integer() else value


def parse_graph(body, ease_ids):
    """(nodes, controls, tickHz) of one builtIn*Graph function body."""
    tunable = {}
    types = {}
    for m in re.finditer(r'nodeDoc\(\s*([^,]+?),\s*"([a-z.A-Z]+)",\s*[^{]*?(?:\{[^}]*\}|json::object\(\)),\s*\{([^}]*)\}', body):
        raw_id, node_type, names = m.groups()
        node_id = raw_id.strip('"') if raw_id.startswith('"') else None
        if node_id is None:
            continue  # per-output nodes are matched below
        types[node_id] = node_type
        tunable[node_id] = re.findall(STR, names)
    for m in re.finditer(r'const std::string (ease) = perOutputNodeId\("ease"', body):
        types[per_output_id('ease')] = 'frame.smooth'
        tunable[per_output_id('ease')] = ['smoothing']
    controls = []
    for m in re.finditer(r'control\(\s*(perOutputNodeId\("ease",[^)]*\)\)?|"[^"]+"),\s*"([^"]+)",\s*"([^"]+)"(?:,\s*"([^"]+)")?\s*\)', body):
        node, param, config, section = m.groups()
        node = per_output_id('ease') if node.startswith('perOutputNodeId') else node.strip('"')
        entry = {'node': node, 'param': param, 'config': config}
        if section:
            entry['section'] = section
        controls.append(entry)
    tick = re.search(r'\{"tickHz",\s*(\d+)\}', body)
    return types, tunable, controls, int(tick.group(1)) if tick else None


def helper_param(text, func):
    """Param schema parsed from a `ParamDecl func()` helper body."""
    body = function_body(text, r'ParamDecl %s\(\)' % func)
    kind = re.search(r'ParamKind::(\w+)', body).group(1)
    desc = join_literals(re.search(r'decl\.description =' + STRS, body).group(1))
    name = join_literals(re.search(r'decl\.name = ' + STRS, body).group(1))
    out = {'name': name, 'kind': kind.lower(), 'description': desc}
    if kind == 'Float':
        field = lambda f: re.search(r'decl\.schema\.%s = ([^;]+?)f?;' % f, body).group(1)
        out.update(
            label=join_literals(re.search(r'decl\.schema\.label =' + STRS, body).group(1)),
            min=num(field('min').rstrip('f')), max=num(field('max').rstrip('f')),
            step=num(field('step').rstrip('f')),
            unit=join_literals(re.search(r'decl\.schema\.unit =' + STRS, body).group(1)),
            default=num(field('defaultValue').rstrip('f')), allowsUnset=False)
    elif kind == 'Enum':
        out['options'] = re.findall(STR, re.search(r'enumOptions = \{([^}]*)\}', body).group(1))
        out['default'] = join_literals(re.search(r'defaultEnum = ' + STRS, body).group(1))
    return out


def schema_param(name, kind, description, key, descriptors):
    p = descriptors.get(key, {}).get('param')
    if p is None:
        sys.exit(f'descriptor {key} has no slider param (rerun gen-descriptors.py)')
    return {'name': name, 'kind': kind, 'description': description, **p}


def node_type_params(texts, node_type, descriptors):
    """Ordered param list of one registerType(...) block."""
    for text in texts:
        m = re.search(r'registerType\(\s*"%s"' % re.escape(node_type), text)
        if not m:
            continue
        block = text[m.start():]
        block = block[:block.index('.factory')]
        params_src = block[block.index('.params'):]
        params = []
        # Tokens in declaration order: floatParam(...), helper calls, locals.
        for t in re.finditer(
                r'floatParam\(\s*"([^"]+)",\s*"([^"]+)",' + STRS + r'\s*\)|(fixedAnchorParam|widthParam|interpolationParam)\(\)|\b(smoothing)\b',
                params_src):
            fname, key, fdesc, helper, local = t.groups()
            if fname:
                params.append(schema_param(fname, 'float', join_literals(fdesc), key, descriptors))
            elif helper == 'fixedAnchorParam':
                src = function_body(text, r'ParamDecl fixedAnchorParam\(\)')
                pkey = re.search(r'paramSchema\("([^"]+)"\)', src).group(1)
                desc = join_literals(re.search(r'decl\.description =' + STRS, src).group(1))
                params.append(schema_param('fixedAnchorHue', 'optional-float', desc, pkey, descriptors))
            elif helper:
                params.append(helper_param(text, helper))
            elif local:
                pkey = re.search(r'smoothing\.schema = paramSchema\("([^"]+)"\)', text).group(1)
                desc = join_literals(re.search(r'smoothing\.description =' + STRS, text).group(1))
                params.append(schema_param('smoothing', 'float', desc, pkey, descriptors))
        return params
    sys.exit(f'registerType("{node_type}") not found')


def main():
    descriptors = {d['key']: d for d in json.loads(read(DESCRIPTORS))['descriptors']}
    builtin = read(BUILTIN)
    texts = [read(p) for p in NODE_SOURCES]

    graphs = {}
    for label, func in (('video', 'builtInVideoGraph'), ('audio', 'builtInAudioGraph')):
        body = function_body(builtin, r'json %s\(' % func)
        types, tunable, controls, tick = parse_graph(body, None)
        used = []
        for c in controls:
            if c['node'] not in used:
                used.append(c['node'])
        nodes = [{'id': n, 'type': types[n],
                  'params': {c['param']: c['config'] for c in controls if c['node'] == n}} for n in used]
        for n in used:
            missing = {c['param'] for c in controls if c['node'] == n} - set(tunable[n])
            if missing:
                sys.exit(f'{n}: controls on params not in the tunable list: {sorted(missing)}')
        graphs[label] = {'nodes': nodes, 'controls': controls, 'tickHz': tick}

    node_types = []
    for graph in graphs.values():
        for node in graph['nodes']:
            if node['type'] not in [t['type'] for t in node_types]:
                node_types.append({'type': node['type'], 'params': node_type_params(texts, node['type'], descriptors)})
    param_kinds = {(t['type'], p['name']): p['kind'] for t in node_types for p in t['params']}
    for graph in graphs.values():
        for node in graph['nodes']:
            node['kinds'] = {p: param_kinds[(node['type'], p)] for p in node['params']}

    dump = lambda v: json.dumps(v, indent=2, ensure_ascii=False)
    out = f"""// GENERATED by gen-demo-graph.py from core's built-in graphs. Do not edit;
// rerun `python3 web/demo/gen-demo-graph.py` after a controls or node-param
// change in C++. Serves the demo's GET /api/graph and GET /api/nodes.

const GRAPHS = {dump(graphs)};

const NODE_TYPES = {dump(node_types)};

// Config spells an unset optional float as a negative number; the graph spells it null.
const paramValue = (kind, value) => (kind === 'optional-float' && value < 0 ? null : value);

export function demoGraph(config) {{
  const audio = !config.activeInputName && !!config.activeAudioInputName;
  const {{ nodes, controls, tickHz }} = GRAPHS[audio ? 'audio' : 'video'];
  return {{
    version: 1,
    ...(tickHz ? {{ tickHz }} : {{}}),
    nodes: nodes.map((n) => ({{
      id: n.id,
      type: n.type,
      params: Object.fromEntries(Object.entries(n.params).map(([p, key]) => [p, paramValue(n.kinds[p], config[key])])),
    }})),
    edges: [],
    controls,
  }};
}}

export function demoNodes() {{
  return {{ nodes: NODE_TYPES }};
}}
"""
    with open(os.path.join(HERE, 'demo-graph.js'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(out)
    print('wrote web/demo/demo-graph.js')


main()
