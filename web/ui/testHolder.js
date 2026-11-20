// Who is holding the lights for a test, in words: the one phrase the Dashboard's
// shell row and the graph editor (graph/lightTest.ts) both use, so they never
// disagree. `holder` is /api/state's test.holder: {session, client}, where client
// is the X-Aurora-Client value ("mcp" for an agent, null for a WebUI tab).
export function testerName(holder) {
  if (!holder) return 'another session';
  return holder.client === 'mcp' ? 'an agent' : 'another editor tab or window';
}
