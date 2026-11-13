// The error shell's keyed patch (Aurora-9hqa.1). A poll used to rewrite the banner's innerHTML, which
// dropped keyboard focus on Retry, Dismiss and Stop test every 3 s. Now each poll plans against the
// rows already drawn and touches only what changed. planPatch is pure (shellPatch.test.mjs);
// applyPatch is the thin DOM half, covered by the browser check dashboard-shell.

// prev: [{key, sig}] in drawn order. next: [{key, sig, ...}] in wanted order.
// Returns the ops to run in order: every 'remove' first, then one op per next row, in order:
//   keep (same key, same sig: leave the node alone), replace (same key, new sig), insert (new key).
// A kept row that is out of place is moved by the applier, so a reorder needs no extra op.
export function planPatch(prev, next) {
  const before = new Map(prev.map((row) => [row.key, row.sig]));
  const after = new Set(next.map((row) => row.key));
  const ops = prev.filter((row) => !after.has(row.key)).map((row) => ({ op: 'remove', key: row.key }));
  for (const row of next) {
    if (!before.has(row.key)) ops.push({ op: 'insert', key: row.key });
    else ops.push({ op: before.get(row.key) === row.sig ? 'keep' : 'replace', key: row.key });
  }
  return ops;
}

const WRAPPER = '<div class="shell-banner"><div class="shell-banner-inner"></div></div>';

// Draws `rows` (from shellRows.bannerRows) into `slot`. Each row's node is its html's one root
// element; its signature is kept on the node (data-sig) so the next poll can plan against the DOM.
export function applyPatch(slot, rows) {
  if (rows.length === 0) {
    slot.innerHTML = '';
    return;
  }
  const doc = slot.ownerDocument;
  // No real DOM (a unit-test double): write the whole banner.
  if (!doc || typeof doc.createElement !== 'function') {
    slot.innerHTML = `<div class="shell-banner"><div class="shell-banner-inner">${rows.map((row) => row.html).join('')}</div></div>`;
    return;
  }
  let inner = slot.querySelector('.shell-banner-inner');
  if (!inner) {
    slot.innerHTML = WRAPPER;
    inner = slot.querySelector('.shell-banner-inner');
  }
  const nodes = new Map();
  for (const node of inner.children) nodes.set(node.getAttribute('data-key'), node);
  const prev = [...inner.children].map((node) => ({ key: node.getAttribute('data-key'), sig: node.getAttribute('data-sig') }));
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const template = doc.createElement('template');
  const build = (row) => {
    template.innerHTML = row.html.trim();
    const node = template.content.firstElementChild;
    node.setAttribute('data-sig', row.sig);
    return node;
  };
  let cursor = null;
  const ops = planPatch(prev, rows);
  for (const { op, key } of ops) {
    if (op === 'remove') {
      nodes.get(key).remove();
      nodes.delete(key);
    }
  }
  cursor = inner.firstElementChild;
  for (const { op, key } of ops) {
    if (op === 'remove') continue;
    if (op === 'keep') {
      const node = nodes.get(key);
      if (node === cursor) cursor = cursor.nextElementSibling;
      else inner.insertBefore(node, cursor);
      continue;
    }
    if (op === 'replace') {
      const old = nodes.get(key);
      if (old === cursor) cursor = cursor.nextElementSibling;
      old.remove();
    }
    inner.insertBefore(build(byKey.get(key)), cursor);
  }
}
