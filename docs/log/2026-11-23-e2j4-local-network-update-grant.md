# Local Network grant across a Developer ID update and a reboot

Id: e2j4-local-network-update-grant

`Aurora-e2j4` (closed, P3; 1.2.1), the Mac report that a 1.2.0 to 1.2.1 upgrade showed an old Local Network permission banner with poor copy. Closed as a stale Local Network entry, not reproduced. Related and still open: `Aurora-lswm` (banner copy for the stale-entry case, dev-rebuild workflow note, remove-entry reset on 27.2+).

- Question: does a notarized update that changes the executable UUID cost the app its Local Network grant (`Aurora-lswm` item 3)? TN3179 does not say; Apple forum threads disagree.
- Method: `tools/mac/update-grant-test.sh`. One source build (`build/notarize-out-1.1.2`) copied twice under one throwaway bundle ID, a different patched `LC_UUID` in each, both re-signed with the Developer ID identity (Team 464U3WR286), run with `--fresh`. The condition is read from `GET /api/state` (`local_network` source).
- Run 1, no reboot: A allowed by the owner, condition cleared in about 4 s. B swapped in at the same path: clear on 20 of 20 reads over 40 s, owner saw no prompt.
- Run 2, `--reboot` (real computer restart between): A allowed, Mac restarted, a login agent relaunched A (no update yet): clear 20 of 20. Then B swapped in: clear 20 of 20.
- Conclusion: on macOS 27.2.1 a UUID change and a reboot each left the Developer ID grant intact. The 1.2.1 banner is most likely a stale entry from an earlier ad-hoc or dev build (this Mac lists many Aurora entries), not the update. The copy for that case stays in `Aurora-lswm`.
- Fixed in the script: the login agent ran `launchctl bootout` before deleting its plist, so bootout stopped the job and the plist was left behind (removed by hand once). The fixed order was not run again.
- Not tried: a different install path, a quarantined first launch of the new build, Aurora's real updater, other macOS versions, more than one machine. Prompt visibility after the reboot was not asked of the owner for run 2 beyond the banner staying clear.
- Leftovers: two throwaway `com.aurora.app.updatetest...` entries in System Settings > Local Network, to remove with the 27.2 remove button; the copies and logs are in `~/Library/Application Support/AuroraUpdateGrantTest/`.

## Research
- TN3179 (fetched as JSON, the HTML page renders empty): identity is code signature, the main executable UUID is part of the implementation, 27.2 adds the remove button. Nothing on updates or stale entries.
- Non-destructive route chosen over the real `com.aurora.app` entry, a VM snapshot (Tart, Apple silicon only, guest not newer than host) or a throwaway user account.

## Lessons
- Two entries filed in [[lesson-macos-gui]]: the grant surviving a UUID change and a reboot (and how to test it), and a launchd job that boots itself out being killed before its next line.
