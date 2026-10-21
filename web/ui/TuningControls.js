// Tuning's field list comes from the running graph's `controls` (Aurora-id8j.10):
// GET /api/graph names each control's node and param, GET /api/nodes gives that
// param's kind, range and options. Pure functions, no DOM -- see
// TuningControls.test.mjs.

// Registry key of the toggle tooltip for an optional param, by node type and param
// (not config key) so any graph using that node gets it.
const TOGGLE_TOOLTIP_KEYS = { 'audio.drift': { fixedAnchorHue: 'audio.fixedHueEnabled' } };

// Built-in effect ids start with "builtin."; ids a user names cannot contain a dot.
export function isCustomEffect(effectId) {
  return typeof effectId === 'string' && effectId !== '' && !effectId.startsWith('builtin.');
}

// Widgets Tuning can draw. Other kinds (gradient) are skipped, not shown as text.
const WIDGET_KINDS = new Set(['float', 'optional-float', 'enum']);

// One entry per drawable control, in the graph's order:
// { id, node, param, configKey, section, kind, label, description, min, max, step, unit,
//   options, value, allowsUnset, tooltip, toggleTooltipKey }. tooltip is the controls
// entry's own override (null when absent), taking precedence over registry keys.
// configKey (the PUT /api/config key) is null for a
// control the host has no write path for; it renders read-only. On a custom effect
// (effectId given) every control is writable and commits into the effect's own file,
// so configKey is always null there. `writable` says which case a control is in.
export function resolveControls(graph, nodeTypes, { effectId = null } = {}) {
  if (!graph || !Array.isArray(graph.controls)) return [];
  const custom = isCustomEffect(effectId);
  const typeByName = new Map((nodeTypes ?? []).map((type) => [type.type, type]));
  const nodeById = new Map((graph.nodes ?? []).map((node) => [node.id, node]));
  const resolved = [];
  for (const control of graph.controls) {
    const node = nodeById.get(control.node);
    const decl = typeByName.get(node?.type)?.params?.find((param) => param.name === control.param);
    if (!decl || !WIDGET_KINDS.has(decl.kind)) continue;
    const stored = node.params?.[control.param];
    resolved.push({
      id: `${control.node}-${control.param}`,
      node: control.node,
      param: control.param,
      configKey: !custom && typeof control.config === 'string' ? control.config : null,
      writable: custom || typeof control.config === 'string',
      section: control.section ?? '',
      kind: decl.kind,
      label: control.label ?? decl.label ?? decl.name,
      description: decl.description ?? '',
      min: decl.min,
      max: decl.max,
      step: decl.step,
      unit: decl.unit ?? '',
      options: decl.options ?? [],
      tooltip: typeof control.tooltip === 'string' && control.tooltip.trim() ? control.tooltip : null,
      toggleTooltipKey: TOGGLE_TOOLTIP_KEYS[node.type]?.[control.param] ?? null,
      allowsUnset: decl.allowsUnset === true || decl.kind === 'optional-float',
      value: stored === undefined ? decl.default : stored,
    });
  }
  return resolved;
}

// Consecutive controls sharing a section name, in order: [{ section, controls }].
export function groupBySection(controls) {
  const groups = [];
  for (const control of controls) {
    const last = groups[groups.length - 1];
    if (last && last.section === control.section) last.controls.push(control);
    else groups.push({ section: control.section, controls: [control] });
  }
  return groups;
}

// The reads in parallel. Resolves to { graph, nodeTypes, effectId } or null when the
// graph or node list is unavailable (no pipeline running gives graph: null; an old
// binary has no routes). effectId is the running effect, null when unknown.
export async function fetchTuningGraph(fetchImpl = fetch) {
  try {
    const [graphBody, nodesBody, effectsBody] = await Promise.all([
      fetchImpl('/api/graph').then((r) => r.json()),
      fetchImpl('/api/nodes').then((r) => r.json()),
      fetchImpl('/api/effects').then((r) => r.json()).catch(() => null),
    ]);
    if (!graphBody?.graph || !Array.isArray(nodesBody?.nodes)) return null;
    const effectId = typeof effectsBody?.effect === 'string' ? effectsBody.effect : null;
    return { graph: graphBody.graph, nodeTypes: nodesBody.nodes, effectId };
  } catch {
    return null;
  }
}
