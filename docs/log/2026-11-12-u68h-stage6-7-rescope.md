# Graph editor stage 6 rescoped, stage 7 filed

Id: u68h-stage6-7-rescope

`Aurora-u68h`, `Aurora-u8jx`. Planning only, no code. [[graph-editor-cleanup]] gains "Decisions (owner, stage 6 scope, 2026-11-12)"; follows [[s1t7-stage5-6-planning]].

## Findings that set the scope

- The editor's banner under the bar (`pickBanner`, graph/status.ts; DesktopNote renders a second one outside it) held five kinds of message: Aurora unreachable, Restore or Discard, refused Save clicks ("Fix the N problems before saving", App.tsx), test outcomes the user did not cause (lightTest.ts `describeTest`), and the window-size note. Only the first matches [[error-overlay]]'s by-cause rule for the shell.
- "Reload: …" after Save is host state that the Dashboard's shell already shows, so with both open one failure appeared twice.
- Every `GraphLoader` issue (34 codes) blocks: preview paused, Test off, Save refused. Only runtime preview errors (`PreviewIssue`) leave the draft valid. So error/warning tiers would show one tier.
- Problem messages are agent-voiced, and every Whole graph row offers `Add node…` whatever the code (ProblemsChip.tsx).
- New empty effects share one kept-copy slot (`BLANK_ID`), so a second one overwrites the first.
- "Reverted" after Stop comes from `quietEndToast`. It fires once per Stop; the confusion is the wording (the user pressed Stop). The toast is the editor's only live region, which is a reason to announce, not to show.
- `/api/dev/errors` is registered only with `AURORA_DEV_ERRORS` set (404 otherwise, tested both ways), behind the cross-origin write guard and LAN pairing. No change needed.
- Grille needs nothing for stage 6 except possibly scrolling on submenu popovers (`Aurora-iryq`). `MenuItem` already has `description`.

## Filed

- `Aurora-u68h` retitled "each message in its own place". Children: `.1` mock frame, `Aurora-s1t7.9` rescoped to 6a (React error shell, connection and host-state rows), `.2` 6b (silent restore, Revert to saved, unique new-effect ids), `.3` 6c (test outcomes on the Test button), `.4` 6d (Save keeps broken work, Open marks), `.5` 6e (Draft would not load to Problems, DesktopNote), `.6` 6g (toast audit, announcer, Undo), `.7` 6f close-out.
- `Aurora-u8jx` stage 7: `.1` copy per issue code, `.2` Whole graph actions, `.3` runtime error wording.
- Outside the stages: `Aurora-n0jm` kept copies stored in Aurora, `Aurora-ofzv` two browser tabs on one effect, `Aurora-4nqt` Dashboard and onboarding move to React (owner plan, not scoped), `Aurora-yrhp` editor tabs (idea).
- `Aurora-iryq` gained item 5: one `openEffect(id, where)` route.

## Verification

- Doc checks only (lessons, links). Repo builds and tests not run (planning only).

## Lessons

- `bd update --notes` replaces existing notes; use `--append-notes`. The owner's notes on `Aurora-u68h` were overwritten once and restored from the tracked export the same session.
