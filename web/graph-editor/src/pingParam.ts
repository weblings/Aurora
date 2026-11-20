// Pings a param's row on its node (Show on node): sets data-ping, which editor.css animates, and clears it
// when the animation ends. Set by hand, since the row's React props do not change.
export function pingParam(root: ParentNode | null, node: string, param: string) {
  const row = root?.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(node)}"] .param[data-param="${CSS.escape(param)}"]`)
  if (!row) return
  row.removeAttribute('data-ping')
  void row.offsetWidth
  row.setAttribute('data-ping', '')
  row.addEventListener('animationend', () => row.removeAttribute('data-ping'), { once: true })
}
