# Graph editor: narrow top bar mock, Test drops to its icon

Id: u8jx9-narrow-bar-mock

`Aurora-u8jx.9` (P3). Mock only, no editor code changed. Decided by the owner 2026-11-15. The build is `Aurora-u8jx.9.1`, done together with `Aurora-u8jx.8`'s chip chevron.

## What was built

`#s9-narrow` ("Narrow top bar") in `web/ui/Static_GraphEditor_Mocks_Grille` (`narrowBar`, `narrowFrame`, `narrowSection` in `mock.js`, two rules in `mock.css`). Static frames at 520, 450, 420, 400 and 360 px: the label form, the icon form, a long name, and the stop, take over and reconnect states. Every chevron is Grille's own (`gChev`, `chevronDownIcon`). Each caption appends the title width measured live in the mock.

`tools/browser-check/checks/graph-editor-narrow.mjs` also logs each bar control's width at every width (the "bar widths" line), which is where the table below came from.

## Findings

Real editor, 31 px buttons, 1 problem showing:

| Viewport | Back | Title | Chip | Undo + Redo | Test |
|---|---|---|---|---|---|
| 1470 to 700 | 92 | 123 | 89 | 31 + 31 | 108 |
| 520 | 92 | 116 | 40 | 31 + 31 | 108 |
| 400 | 28 | 95 | 40 | 31 + 31 | 108 |
| 360 | 28 | 55 | 40 | 31 + 31 | 108 |

- The title is the only flexible control, so it absorbs all the squeeze. Nothing overflows down to 360 px. The question was only how short the title may get.
- The widest fixed control is Test (a 77 px label plus a 31 px caret). Its idle label as an icon returns about 46 px: the title is 123 px at 400 and 92 px at 360 in the mock, against 67 and 49 as built with the chip chevron kept.
- Folding Undo and Redo saves little: one History button keeps its own chevron (about 12 px), and a split `[Undo | caret]` saves about nothing, since it is still two 31 px buttons. Neither was built. Owner: keep both buttons.
- Grille has no effect or graph icon, so a title fallback would be the dots icon (`menuHorizontalIcon`). It was drawn and dropped: at 360 px the title is still about 92 px and below 360 px is not a target.

## Decision

- The title truncates first. When it would drop under about 100 px, idle Test shows only its play icon. A container query on the bar, not a breakpoint, because the switch depends on the chip and the name (between 450 and 400 px in the mock).
- The state moves to aria-label and tooltip: `Test (15s)` or `Test (Live)`, `Stop the test` with the time left (the countdown leaves the bar), `Take over the test`, `Reconnect`. Take over and Reconnect use the play icon: the shell row already says why another view is testing.
- Undo and Redo stay two buttons, no title fallback, the chip chevron stays at every width (this settles `Aurora-u8jx.8`'s compact form).

## Caveats

- Mock widths come from its own flex layout. They matched the editor's measured widths to within 6 px (67 against 69 expected at 400 with the chevron, 49 against 55 at 360), which is why the captions show the live width. The editor's own widths are checked at build time.
- The chip chevron's cost (about 26 px) is from `Aurora-u8jx.8`'s 32 px measurements, not re-measured on the 31 px button, because the chevron is not built yet.
- One-click Take over now relies on the tooltip and the shell row to say it replaces another test. The owner accepted this.
