# Aurora-o1qt: Mac Local Network permission detection (closed)

Id: o1qt-local-network-probe

2026-10-07/08. After a rebuild and a config wipe on Mac, the Connect Hue
Bridge screen said "Couldn't reach a bridge" for a bridge that `curl` reached
fine. Cause: macOS Local Network was off for the rebuilt ad-hoc app, so every
LAN connect failed in about 1 ms. Fix: detect it and say so.

## Built

- `LocalNetworkProbe` (`app/mac`): at launch, a background probe browses
  Bonjour (`_aurora-preflight._tcp`, listed in `NSBonjourServices`) to raise
  the permission prompt, and decides the verdict from a UDP send to
  224.0.0.251:5353 (success = granted, `EHOSTUNREACH` = denied, other errno =
  unknown). `GET /api/mac/local-network` re-probes (up to 3 s) on every call.
- `OutputConnectScreen.js`: on a failed bridge check it asks that route and
  shows the System Settings steps when `denied`. Demo vendor copy re-synced.
- `tools/mac/make-fresh-localnet-copy.sh`: test copy with a new bundle ID and
  `LC_UUID`, re-signed ad hoc, for a first-run prompt on demand.
- Audio banner text: "Aurora can't hear any audio. If needed, check Aurora's
  audio permission in System Settings."

## Dead end: trusting NWBrowser

The first probe called `NWBrowser` `ready` "granted" and a PolicyDenied
`waiting` state "denied". Live, with the permission off, it reported granted.
A second version (advertise a service, browse for it) failed the same way:
macOS 27 never surfaced a denied browser state, and the browser saw its own
advertisement. Logging both a TCP connect to the bridge and the multicast
send showed the real signal: both fail at once with errno 65. See the
macos-gui lessons.

## Found on the way

- Autodetect still failed after the permission was fixed: `discovery.meethue.com`
  returned 429 with an empty body (rate limited after repeated test runs) and
  `ApiTools::autodetectedBridge` threw parsing it, a bare 500 that the UI
  shows as "Could not reach the discovery service". Now returns
  `succeeded: false` with a retry/manual-entry message. See the output lessons.
- Reset research: Local Network is not in TCC; state is in
  `/Library/Preferences/com.apple.networkextension.plist`; Apple documents no
  reset. `tccutil reset` worked for ScreenCapture and AudioCapture.

## Verified

- 77/77 tests pass (3 new: send-result mapping).
- Live: route reports `denied` with the toggle off and `granted` after
  allowing; a fresh test copy raised the prompt; owner confirmed the Connect
  screen advanced after Allow.
- Not verified: the Connect-screen "macOS is blocking" copy was not seen
  rendered; an offline Mac (expected `unknown`) was not tried.

## Open

- Autodetect depends on the Hue cloud service; a local mDNS lookup would not.
  Filed as a separate bead.
