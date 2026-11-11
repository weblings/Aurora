# Graph editor stage 5: Grille mock switches decided

Id: s1t76-mock-switches-decided

`Aurora-s1t7.6`, `Aurora-s1t7.7`. Planning only, no code. The owner's choices on the Grille mock's four Decisions switches are recorded in [[graph-editor-cleanup]] (Decisions, Grille mock switches).

## Decided

- Back link and title boxed, Test on lights secondary: Grille's default `ui-button`, which `Aurora-s1t7.1` applies, so `Aurora-s1t7.7` closed as folded into it.
- Test split button + Zones island, Zones island without resize. Filed `Aurora-qjqy`: light test modes in core (Once 15 s, Live untimed; today one 120 s `confirmMs` cap shared by every test), MCP `try_on_lights` defaulting to Once with `keep` allowed after a timed-out test on an unchanged draft, and the editor split button.
- `Aurora-s1t7.2` rescoped to the problems chip only (the status pill goes in `Aurora-qjqy.3`); `Aurora-s1t7.4` rescoped to the Zones island (editor-only, stays in stage 5).
- Cannot reach Aurora banner: the editor's under-bar banners move to the Dashboard error shell in stage 6 (`Aurora-u68h`, `Aurora-s1t7.9`).

## Verification

- Read `LightTest.hpp`, `TestRoutes.cpp` and `McpServer.cpp` to confirm the 120 s cap is shared and `keep` refuses once a test has ended.
- Repo checks not run (planning only).

## Lessons

- none
