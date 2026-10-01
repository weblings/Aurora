# Mac release zip: Aurora 1.0.4 notarized without disable-library-validation (2026-09-30)

Beads: none (Aurora-8mk.10 was dropped earlier the same day; this is its manual release step). Branch `feat/MacSupportV2`. Builds on `2026-09-30-mac-developer-id-first-signing.md`.

## Done

- Release build from this tree: `cmake --preset mac-app -B build/mac-release -DCMAKE_OSX_DEPLOYMENT_TARGET=27`; Info.plist 1.0.4, `LSMinimumSystemVersion` 27, binary `minos 27.0`, tip-screen GIF embedded.
- Run 2: `tools/mac/sign-notarize.sh` with the Developer ID and `aurora-notary` profile, entitlements unchanged. Submission `f146849d-283e-4d35-a852-b206f4189579` Accepted; stapled; `spctl` Notarized Developer ID; `verify-bundle.sh` PASS (29 Mach-O, one identity, no Homebrew links). Superseded by run 3.
- Run 3: `app/mac/Aurora.entitlements` emptied (only key was `disable-library-validation`; the default ad-hoc dev build never read the file). No rebuild needed, only re-sign. Submission `fc89af97-f64e-4609-8401-b4897cb9a614` Accepted; signed app has an empty entitlements dict; staple valid; hardened runtime on; `codesign --verify --strict --deep` ok.
- Final zip `build/notarize-out-3/Aurora_Mac_v1.0.4.zip` (renamed from the script's `Aurora-1.0.4-notarized.zip`; name is not part of notarization), 19,982,841 bytes, sha256 `f93266e85b3b0b3d946728504865de10c67c4d9f84665044e243b89bc899e496`. Gitignored (under `build/`); not published.

## Verified

- Extracted-zip smoke launch (dummy input): stayed up, 28 bundled dylibs mapped, none from `/opt/homebrew`, `/api/capabilities` platform `mac`.
- Embedded webroot: with `web/ui` temporarily moved aside (so neither the baked path nor the env override exists), the notarized app served `/icons/MacTray.gif` 200 `image/gif` 32,192 bytes (same as the source file), `index.html` linked `mac-tray-tip.css`, and `MacTrayTipScreen.js` was served. `web/ui` restored; tree unchanged.
- Fake light-viz stack (`devstack.py up --app build/notarize-out-3/Aurora.app/Contents/MacOS/Aurora`): SSE frames drifting on the dummy input; user confirmed it worked and macOS asked for no new permissions. `down` left no listeners.

## Not verified

- Real Screen Recording, audio capture and Hue streaming on the no-entitlement build.
- Quarantined-download first-launch flow for this build (the earlier build was tested on one Mac).
- The 1.0.4 zip is not attached to a GitHub Release, so the README's Mac section describes a zip that does not exist yet.

## Findings

- Forcing the embedded webroot on a dev machine: `resolveWebRoot` only falls back when neither `AURORA_WEBUI_DIR` nor the baked checkout path is a directory; an env var naming a nonexistent dir does not force it. Moving `web/ui` aside does. Noted in `docs/lessons/web-testing.md`.
- Removal of the entitlement needed re-signing only, not a rebuild: the binary is unchanged and `sign-notarize.sh` copies and re-signs the input bundle.
