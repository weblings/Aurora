# Graph editor problems chip moves before Undo

Id: s1t72-problems-chip-regroup

`Aurora-s1t7.2`. The problems chip now renders after the bar spacer, in the right group just before Undo (or More below 520 px), as in the Grille mock. Status and Reconnect stay in the left part until Aurora-qjqy.3. The `narrow` check, run with a problem showing, found the bar scrolling sideways by 19 px at 520 px; below 650 px the chip now reads `⚠ N` with an `aria-label` of "N problems". The `narrow` check now deletes a connection on a fresh page and, at 1470, 1100, 900, 700, 520 and 400 px, asserts: bar height unchanged (no wrap), chip inside the window, chip just before Undo/More, chip right of the status, no sideways scroll. The place may be temporary: stage 6 (Aurora-u68h) explores moving problems into the error shell.

## Verification

- `graph-editor:narrow`, `top-bar` and `gate` pass; `tsc --noEmit` clean.

## Lessons

- none
