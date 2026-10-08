# Aurora-dwvu: two Local Network prompts on first Mac launch (closed)

Id: dwvu-double-local-network-prompt

2026-10-08. After Aurora-o1qt and Aurora-rbp3, a first launch of a fresh
test copy showed two macOS Local Network dialogs back to back, same system
wording. Result: an artifact of ad-hoc test copies. A notarized Developer ID
build shows one. No code change; the redundant Bonjour browse is filed as
Aurora-awcg.

## Runs (each a never-seen identity)

| Build | Signing | Launch-time LAN traffic | Prompts |
|---|---|---|---|
| feat, both probes, no `--fresh` (Dashboard) | ad hoc | browse, 2 s send, bridge connect | 2 |
| feat, both probes, `--fresh` (Welcome) | ad hoc | browse, send, Welcome mDNS query | 2 |
| feat, browse commented out, `--fresh` | ad hoc | send, Welcome mDNS query | 2 |
| `dev` (pre-o1qt), `--fresh` | ad hoc | none (cloud discovery only) | 0 |
| feat HEAD release, both probes, `--fresh` | Developer ID, notarized, stapled | browse, send, Welcome mDNS query | 1 |

Ad-hoc copies came from `tools/mac/make-fresh-localnet-copy.sh` (new bundle ID
and `LC_UUID`, re-signed ad hoc). The notarized run: `build/mac-release`
(deployment target 27) -> that script without `--launch` -> `sign-notarize.sh`
on the copy (Developer ID replaces the ad-hoc signature; submission
`a4416f55-c437-47d1-a86e-623e10ace669`, Accepted) -> installed as
`~/Applications/Aurora LocalNet Test.app`, launched with `open --args --fresh`.
Not quarantined, so the Gatekeeper first-launch path was not exercised.

## Findings

- The doubling is not one prompt per operation: the send repeats every 2 s on
  a new socket and the Dashboard run had three or more operations, yet every
  ad-hoc run showed exactly two. Cause inside macOS not established; TN3179
  says identity is tracked by code signature plus main-executable UUID and
  calls ad-hoc identity unreliable.
- The `dev` zero was no evidence about one-vs-two: that build did no local
  traffic at all.
- TN3179 lists a UDP multicast send and a Bonjour browse each as a local
  network operation, so the browse is not needed to raise the prompt. The
  browse-off run still prompted, consistent with that.
- TN3179 (rev. 2026-10-06): macOS 27.2 adds +/- buttons to the Local Network
  list as a per-app reset. This Mac is 27.0.1, so the fresh-copy script stays
  necessary here.
- Apple forum thread 809211: repeat prompts from a kernel-to-daemon IPC
  failure, FB21858319, fixed in macOS 26.5. Not shown to apply.

## Open

- Aurora-awcg: remove the browse, `NSBonjourServices` and the header comment
  saying Bonjour is what prompts; acceptance on a notarized build.

## Follow-up: banner flash on first run

On first run the banner showed briefly under the prompt and then hid: sends
fail like a denial until the user answers. `LocalNetworkConditionPublisher`
now needs 2 denials in a row (about 4 s at the 2 s interval) before it sets
the condition; one grant or unknown resets the count and clearing is still
immediate. Threshold is a constructor argument (default 2). Mac app tests
84/84 (one new, killed by setting the default back to 1).

Verified live on notarized fresh-identity builds of HEAD (cde5df2): Allow on
first run, no banner flash (an ad-hoc copy of the same code still flashed,
like its two dialogs, so judge this only on a notarized build); Don't Allow on first
run, banner appeared about 4 s later; allowing in System Settings cleared it
with no relaunch. Each run needed its own `sign-notarize.sh` pass for a
never-seen identity (a prior run's answer is recorded per bundle ID).

Bead for the flash fix: Aurora-fjo7.

Lessons: macos-gui (notarized vs ad-hoc prompt count; browse correction and
27.2 reset folded into existing entries), debugging-method (rule out the test
artifact).
