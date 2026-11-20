// The one rule for what a node is called on screen, shared by the node header and the Problems
// popover so the two cannot drift apart.

// The title the node header shows: the catalog title, else the type name.
export function nodeTitle(info: { title: string } | undefined, type: string): string {
  return info?.title || type
}

type TitledNode = { id: string; type: string; info: { title: string } | undefined }

// How the Problems popover labels each node: the header's title; with the id added when another
// node shares that title ("Rescale image (rescale2)"); a type the catalog lacks falls back to the id.
export function nodeLabels(nodes: readonly TitledNode[]): Map<string, string> {
  const count = new Map<string, number>()
  for (const n of nodes) {
    if (!n.info) continue
    const t = nodeTitle(n.info, n.type)
    count.set(t, (count.get(t) ?? 0) + 1)
  }
  return new Map(
    nodes.map((n) => {
      if (!n.info) return [n.id, n.id]
      const t = nodeTitle(n.info, n.type)
      return [n.id, (count.get(t) ?? 0) > 1 ? `${t} (${n.id})` : t]
    }),
  )
}
