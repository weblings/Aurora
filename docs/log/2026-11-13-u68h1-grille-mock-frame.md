# Graph editor stage 6.0: Grille mock frame, owner review applied

Id: u68h1-grille-mock-frame

`Aurora-u68h.1`. The Grille mock (`web/ui/Static_GraphEditor_Mocks_Grille/`) shows where each editor message lives once the banner under the bar is retired. Owner review is complete and recorded on the bead; the mock now matches it. Anchors are mock frames.

- **Error shell** (`#s6-shell`, 6a): the Dashboard's shell reused exactly, above the bar, rows in a 640 px column; host-state rows are identical on both pages and dismiss through `POST /api/state/dismiss`; the editor reads `GET /api/state` on load and at the Dashboard's poll cadence. The editor's own `Reload: <reason>` is dropped: a failed reload is already in `/api/state` errors (`_recordFailure("reload", ...)`, `Pipeline.cpp`), so no core change. Collapsed "2 problems" / "Show less" as the Dashboard (drawn with the reload row + the too-many-editors row). Network failure, including a failed draft send, is the "Aurora has stopped" takeover (no Cannot reach / Lost contact rows).
- **Draft not sent, split by the draft PUT's error code** (`DraftRoutes.cpp`): `too_many_drafts` (429) is the shell row "Couldn't check your last edit: too many editors are open. Close one to continue."; `invalid_session` / `invalid_body` (400) is "Couldn't check your last edit."; `draft_too_large` (413) is not a shell row but a Whole graph problem on the problems chip, "Couldn't check your last edit: the graph is too large (over 256 KB)." (drawn as a popover panel). No Retry, no dismiss X on any; rows clear when a later send succeeds; editor-only.
- **Test button** (`#s6-test`, 6c): options A, B and A + B rejected; no mark, outline or label change for outcomes the user did not cause. Another session holds the lights: the shell's light-test row ("An agent is testing an effect on the lights." / "Another editor tab is testing ...", with Stop test) and the existing Take over label. A test ended for a reason the user did not cause: button at rest, reason announced through 6g's live region and the first line of the caret menu until the next test, Save or edit. Test failed to start: a toast.
- **Prompt** (`#s6-prompt`, 6b): option A (title and one line); dialog buttons centred, to match the naming dialog (`.editor-name-dialog-actions`; the mock's Name field is a popover with no buttons).
- **Title menu / Open** (`#s6-menu`, `#s6-openpath`, `#s6-apply`): Save and apply never disabled for problems; refused saves close the menu, show "Couldn't save. Fix N problems first." on the chip, then ping the chip (6d). Open marks unsaved copies with a dot only (no problem count); in Not saved yet the group heading ends with the dot and its items have none, Custom and Built-in keep per-item dots. The "Dots in Not saved yet" switch is removed.

## Verification

- Headless Chromium over `#s6`, `#s6-shell`, `#s6-test`, `#s6-prompt`, `#s6-menu`, `#s6-openpath`: zero console and page errors; every screenshot inspected after the last change.

## Lessons

- none
