# Web demo landscape split is 2/3 room, 1/3 Dashboard

Id: 5duz-demo-landscape-split

`Aurora-5duz`. In landscape the demo gave the room and the Dashboard half each. The room now takes the remainder of a 1/3 Dashboard, and the split goes back to 50:50 while the graph editor is open. Portrait stays a 50:50 stack.

## What shipped
- `#dashboard-pane` is 33.333% wide in landscape and 50% with the existing `.editing` class. `#scene-pane` is `flex: 1 1 0`, so it takes what is left. CSS only, no JS.
- The jump is a snap, not a transition. Every frame of a transition would fire the scene's `ResizeObserver`, which re-runs `frameCameraToRoom` and `applySpawnPose`.
- A draggable divider was considered and left out (owner chose the fixed split).

## Findings
- At 1280px wide the Dashboard is about 427px. The existing ellipsis rules for narrow panes cope, and the owner judged the result good on a desktop window. No `min-width` clamp was added.

## Verification
- `node web/demo/demo-layout.test.mjs` passes.
- Checked by the owner in a regular browser on the served demo. Portrait was not changed.

## Lessons
- none
