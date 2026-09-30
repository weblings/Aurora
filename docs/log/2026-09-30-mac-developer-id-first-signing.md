# Mac Developer ID: identity and notary profile set up, first real-identity dry run (2026-09-30)

Beads: Aurora-qy5 (epic, 7/8 children closed), Aurora-8mk.10, Aurora-qps.5, Aurora-qps.6 (all still open, none closed here). Branch `feat/MacSupportV2`. No code changed; this closes the "never run with a real cert" gap from [2026-09-30 cert prep log](2026-09-30-mac-cert-prep-bundle.md) only as far as the dry-run line.

## Done

- Developer ID Application certificate created in Xcode (Settings > Accounts > Manage Certificates). Identity: `Developer ID Application: ANDREW BUTE GWINNER (464U3WR286)`; `security find-identity -v -p codesigning` went from 0 to 1 valid identity.
- notarytool keychain profile `aurora-notary` stored by the user in their own terminal (app-specific password, Team ID 464U3WR286). `notarytool history --keychain-profile aurora-notary` returns an empty history, exit 0. Nothing secret is in the repo or was passed through the agent session.
- `tools/mac/sign-notarize.sh build/mac-app/bin/Aurora.app --identity <above> --keychain-profile aurora-notary --dry-run` (output to `$TMPDIR`): copy, bundle 28 dylibs + 17 licence packages, sign inside-out, verify-bundle PASS (all 29 Mach-O files signed with the same identity, `codesign --verify --strict` ok, no Homebrew links), zip, stopped before `notarytool submit`. Input bundle unchanged.

## Not verified / open

- Notarization itself: `notarytool submit`, staple, `spctl`, the failure-log path. Still never executed.
- The 1.0.3-labelled bundle is what was signed; the WARN stands: dylibs need macOS 27 while the plist says 14.2 (Aurora-qy5.8). A notarized zip from this bundle would only launch on 27+.
- Whether `disable-library-validation` can be dropped with one Team ID (Aurora-qy5.6.4 was written for a Personal Team cert; a Developer ID identity can test it directly). Not tried.
- Aurora-qps.6 / qps.5 (SMAppService, UNUserNotificationCenter) are written around a free Personal Team cert. A Developer ID identity should give the stable Team ID they need, but neither spike was re-run.
- `aurora-notary` was not visible to the agent session's keychain lookup before the user's second `store-credentials` run; the first run's failure cause was not captured. After the second run the agent did not re-check; the dry run never touches the profile.

## Surprises

- Repeated "login keychain password" dialogs during the dry run were per-`codesign` key-access prompts (29 signatures), not a wrong password; one throwaway sign with Always Allow removed them. The run was interrupted twice before that was understood.
- Lessons: docs/lessons/macos-gui.md (per-signature key prompts; verify identity and notary profile with read-only commands first).
