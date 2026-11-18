// One #room-status line shared by the room model loader and the engine.
const lines = new Map();

export function setStatusLine(key, text) {
  lines.set(key, text);
  const node = document.getElementById('room-status');
  if (!node) return;
  const shown = [...lines.values()].filter(Boolean);
  node.textContent = shown.join('\n');
  node.hidden = shown.length === 0;
}
