# Local Network stale entries: remove button verified, banner copy ruled out (closed)

Id: lswm-local-network-stale-entry

`Aurora-lswm` (closed, P3; 1.1.4, 1.2.0, 1.2.1). Closes the Local Network stale-grant thread started by the 1.1.3 Mac verification (2026-10-23) and continued by [[e2j4-local-network-update-grant]].

- (1) Banner copy: not changed. `renderLocalNetworkBanner` (`web/ui/MacPermissionRecovery.js`) stays "Aurora can't reach devices on your network. In Settings, click Local Network and allow Aurora." The Mac permission banners are a bold problem sentence plus one working action; the probe returns the same errno 65 for toggle off, stale entry and prompt pending, so there is no separate stale-entry state to show; and the remedy (the remove button) only exists on macOS 27.2+, while 27.0 and 27.1 have no reset and the README calls older macOS untested. A hint that fails for some users breaks the banners' rule of offering only actions that work.
- (2) Stable identity for dev rebuilds: no build change. Ad-hoc rebuilds drop identity (2026-11-19 notes), so each looks like a new app. A Developer ID signature kept the grant across a changed `LC_UUID` and a reboot in [[e2j4-local-network-update-grant]] (those copies had hardened runtime on; a dev build needs it off, see [[lesson-macos-gui]]), so signing a dev build with the Developer ID identity should also keep it, not tested without hardened runtime. Otherwise use `tools/mac/make-fresh-localnet-copy.sh` or the remove button.
- (3) Notarized or Developer ID updates: checked in [[e2j4-local-network-update-grant]]; a new UUID and a reboot kept the grant.
- (4) Remove button on macOS 27.2.1: verified with `tools/mac/remove-entry-test.sh`. A throwaway app (`com.aurora.app.removetest...`, Developer ID signed, new UUID) was allowed, quit, its entry removed with the minus button in System Settings > Privacy & Security > Local Network, then relaunched: the condition went blocked, the owner saw the prompt again and allowed it, and it cleared. One run on one Mac; the owner's own report that the prompt returned is the main evidence, the single `blocked` read is the same as the first-grant run.
- Housekeeping: the script and the two `removetest` and `updatetest` throwaway entries in System Settings; the state folder `~/Library/Application Support/AuroraRemoveEntryTest` was removed by `remove-entry-test.sh clean`.

## Lessons
- Updated the reset entry in [[lesson-macos-gui]] ("Resetting the Local Network permission") with the 27.2.1 verification.
- New entry in [[lesson-macos-gui]]: a permission banner gets a hint variant only for a state the app can detect and a fix that works on every supported macOS (the banner-copy decision above).
