# Open 1.2.1 beads move to 1.2.2, three more to 1.2.3

Id: release-label-retriage-1-2-2

Beads triage only (owner, 2026-11-25). No code changed and no bead closed.

- To 1.2.3: `Aurora-x0tw`, `Aurora-z9vu`, `Aurora-g5mz`. The last two also dropped `1.2.1`.
- From 1.2.1 to 1.2.2, all still open: `Aurora-5ipy.27`, `Aurora-70gs`, `Aurora-fruw`, `Aurora-51w7`, `Aurora-e4bi.21`, `Aurora-h5gr`, `Aurora-i6cj`, `Aurora-kep2.22`, `Aurora-ppko`, `Aurora-qhsw`, `Aurora-zbvu`, `Aurora-0ofk`, `Aurora-kep2.14`.
- Older `1.1.4` and `1.2.0` labels were kept. No open bead is labelled `1.2.1`.
- `Aurora-fruw` now gates 1.2.2 and covers the React error shell and Dashboard accordion headers.
- `Aurora-70gs` now places its trust-mode toggle with the React screen ports (`Aurora-4nqt.8`, `.10`).
- `Aurora-0ofk` is retitled for the React Dashboard.
- `Aurora-4nqt.10` no longer depends on `Aurora-0ofk`, whose work it folds in. They are linked as related and close together.

## Verification
- Rewritten bead fields were read back and compared.
- `bd dep cycles` reported none.

## Lessons
- none
