# 5ipy.41: v1 graph and pairing routes (Aurora-5ipy.41)
Id: v1-graph-pairing-routes

Plan B5 in [[api-v1-plan]].

## Shipped

- `HttpServer::aliasRoute` serves an existing route at a second path, sharing its handler state.
- `registerPublicApiRoutes` aliases an explicit list under `/api/v1`: `graph/drafts/:session` (PUT, GET, DELETE),
  `graph/validate`, `graph/test` (POST, GET), `test/heartbeat`, `test/revert`, `test/confirm`, `graph/apply`,
  `pairing/status`, `pairing/request` and `pairing/request/:pollKey`. It must run after those routes exist.
- Guard rules copied by hand: drafts and validate at Draft (writes), test and apply at Apply (writes), the two
  pairing prefixes open. An Admin write rule on `graph/test/stop` keeps it off the test prefix if it is ever added.
- `graph/test/stop` and the pairing admin routes are not served under v1.
- Spec entries and schemas, `security: []` on the three pairing operations. The route-walk now skips path-level
  `parameters` and registers the draft, apply, test and pairing routes first.
- Catch2: scope table per v1 route, absent routes, route-walk both ways.

- Lessons: none
