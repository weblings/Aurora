import { bannerHtml } from './shellRows.js';
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

const WRAPPER = '<div class="shell-banner"><div class="shell-banner-inner"><div class="shell-banner-rows"></div></div></div>';

// Draws `rows` (from shellRows.bannerRows) into `slot`. Each row's node is its html's one root
// element; its signature is kept on the node (data-sig) so the next poll can plan against the DOM.
// The rows go in the capped region (.shell-banner-rows), the toggle after it in .shell-banner-inner,
// each list patched on its own so a scrolled region keeps its scrollTop and the toggle keeps focus.
export function applyPatch(slot, rows) {
  if (rows.length === 0) {
    slot.innerHTML = '';
    return;
  }
  const doc = slot.ownerDocument;
  // No real DOM (a unit-test double): write the whole banner.
  if (!doc || typeof doc.createElement !== 'function') {
    slot.innerHTML = bannerHtml(rows);
    return;
  }
  let inner = slot.querySelector('.shell-banner-inner');
  if (!inner) {
    slot.innerHTML = WRAPPER;
    inner = slot.querySelector('.shell-banner-inner');
  }
  patchList(doc, inner.querySelector('.shell-banner-rows'), rows.filter((row) => row.kind !== 'toggle'));
  patchList(doc, inner, rows.filter((row) => row.kind === 'toggle'));
}

// Patches the keyed children of `container` to `rows`; a child without data-key (the region inside
// .shell-banner-inner) is left alone.
function patchList(doc, container, rows) {
  const children = [...container.children].filter((node) => node.hasAttribute('data-key'));
  const nodes = new Map(children.map((node) => [node.getAttribute('data-key'), node]));
  const prev = children.map((node) => ({ key: node.getAttribute('data-key'), sig: node.getAttribute('data-sig') }));
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const template = doc.createElement('template');
  const build = (row) => {
    template.innerHTML = row.html.trim();
    const node = template.content.firstElementChild;
    node.setAttribute('data-sig', row.sig);
    // A row new this render starts its one pulse (Aurora-9hqa.2); the page clears it on animationend.
    if (row.isNew) node.setAttribute('data-new', '');
    return node;
  };
  const ops = planPatch(prev, rows);
  for (const { op, key } of ops) {
    if (op === 'remove') {
      nodes.get(key).remove();
      nodes.delete(key);
    }
  }
  let cursor = [...container.children].find((node) => node.hasAttribute('data-key')) ?? null;
  for (const { op, key } of ops) {
    if (op === 'remove') continue;
    if (op === 'keep') {
      const node = nodes.get(key);
      if (node === cursor) cursor = cursor.nextElementSibling;
      else container.insertBefore(node, cursor);
      continue;
    }
    if (op === 'replace') {
      const old = nodes.get(key);
      // A row flagged inPlace (the shell's toggle button) is rewritten where it stands, so the same
      // node swaps its label and keeps keyboard focus; any other changed row is replaced.
      if (byKey.get(key).inPlace) {
        const fresh = build(byKey.get(key));
        for (const name of old.getAttributeNames()) if (!fresh.hasAttribute(name)) old.removeAttribute(name);
        for (const name of fresh.getAttributeNames()) old.setAttribute(name, fresh.getAttribute(name));
        old.innerHTML = fresh.innerHTML;
        if (old === cursor) cursor = cursor.nextElementSibling;
        else container.insertBefore(old, cursor);
        continue;
      }
      if (old === cursor) cursor = cursor.nextElementSibling;
      old.remove();
    }
    container.insertBefore(build(byKey.get(key)), cursor);
  }
}
