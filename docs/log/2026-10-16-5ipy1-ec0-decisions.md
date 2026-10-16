# EC 0: open questions and cross-references (Aurora-5ipy.1)

Id: 5ipy1-ec0-decisions

Closed 2026-10-16. Phase 0 of [[external-control]]. Docs only, no code.

## What changed

- `ExternalControl.md` "Still open": brightness boost above 100% and the video brightness floor are deferred, not settled. Neither blocks the dimmer (Aurora-5ipy.7). Phase 0 text updated to match.
- `ImplementationPlan.md`: both "WebSockets deferred" and the stretch "Networking fork" no longer claim a new dependency. cpp-httplib 0.46 already ships `Server::WebSocket`, so Aurora-1jb needs none.
- `HomeAssistantOutput.md`: "Local API rules" intro points to [[external-control]] for the planned Host allowlist, LAN pairing and scoped access.

## Verification

- `check-links.py`: links OK.

## Lessons

- None.
