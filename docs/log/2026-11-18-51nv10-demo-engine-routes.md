# Engine-backed editor routes in the demo

Id: 51nv10-demo-engine-routes

`Aurora-51nv.10`. The demo shim backs the editor with the room's own engine (`demo-graph-routes.js`, with ports of core's DraftStore `demo-drafts.js` and LightTest `demo-lighttest.js`, and the preview provider `demo-preview.js`). Routes: nodes and graph from the engine, effects/:id, drafts, the preview stream and layouts, save and apply, Test on lights with heartbeat, stop and revert, dismiss, reload, duplicate (real copies, fixes `Aurora-kep2.23`), `PUT /api/effects` and custom effect params. `PUT /api/effects` was the route missing behind the Dashboard's dead Music pulse choice. Previews ride the room's per-frame batch. `validate` now returns `inputs {video, audio}` (`graphSourceNeeds` moved from Pipeline.cpp into GraphValidation), stored with each custom effect. Until the CI module carries it, `engine-feeds.js` derives inputs in JS (marked for removal). Pairing stays 404.

## Verification
- Shim tests per route against a fake engine. Native test that validate reports inputs (its first premise was wrong and was fixed by the coordinator). Coordinator re-run: full `ctest -j8` 516 passed, web unit loop, closure, demo-graph check, engine test 13/13.
- Browser (agent, headless Chrome): edit a built-in with live preview, Test on lights dims and restores the room, save, apply, switch between built-ins and the custom effect, tune it, duplicate, every row menu item with no failure. Coordinator confirmed Music pulse and switching back to video.
- VS Code's built-in browser does not load the demo video (owner, 2026-11-18): test in a regular browser.

## Lessons
- [[lesson-agent-coordination]]: a case-sensitive `ctest -R` filter skipped the agent's own failing test.
