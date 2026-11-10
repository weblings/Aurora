// Pan rule that keeps a node clear of a drawer (Aurora-daaa.29.2). One axis at a
// time so the bottom dock (Aurora-daaa.29.4) can reuse it with the drawer's top
// edge instead of its left edge. All numbers are canvas-relative pixels.

export const CLEAR_MARGIN = 16

// How far to pan along one axis so the node's box [start, end] lies before
// `limit` (the drawer's near edge) with `margin` to spare. Returns 0 when it is
// already clear. A negative result moves the view toward the start. Never pushes
// the node's start past `margin` from the canvas edge: a box too big to fit
// shows its start, not its end.
export function clearShift(start: number, end: number, limit: number, margin = CLEAR_MARGIN): number {
  const over = end - (limit - margin)
  if (over <= 0) return 0
  const room = start - margin // how far the start may still travel
  const shift = Math.min(over, Math.max(room, 0))
  return shift === 0 ? 0 : -shift
}
