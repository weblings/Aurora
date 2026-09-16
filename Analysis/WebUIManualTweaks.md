# WebUI manual tweaks

Follow-up to `WebUIAnalysis.md`. That doc's 19-step build order is done and
each screen passed its own jsdom/live verification, but "verified" isn't
the same as "actually usable" — this doc tracks the gap between the AI-built
first pass and a human sitting down and using it, found by hands-on use
after the build order closed out.

Keep entries short: what's wrong, why it matters, a proposed fix if one's
obvious. Full investigation/fix details belong in the commit or PR that
closes the task, not here — see `Analysis/lessons/engineering-hygiene.md`'s
entry on build-log doc density for why.

## Open tasks

- [ ] **Fresh install: HTTP server never binds at all.** `Pipeline::build()`
  throws when zero outputs are registered, and that happens *before*
  `httpServer.bind()` — so Output Connect is unreachable on a real first
  run (confirmed live: double-click with no prior config, nothing listens
  on the port). Root cause is output-agnostic, not Hue-specific — keep the
  fix that way (bind unconditionally; `Pipeline` absent until a reload
  first succeeds), matching huenicorn's separate-setup-server pattern.
  Also needed for pairing to ever be picked up without a restart:
  `registerOutputs()`'s Hue factory captures credentials by value once at
  boot, never re-read.
- [x] **Pairing persistence — resolved, not a real bug.** Live repro with
  temp `[pairing-debug]` logging confirmed the full flow (validate →
  register retry after button press → entertainment configs → save) works
  and persists correctly. Earlier "never saved" reports were real attempts
  that likely never completed the register retry, not a persistence bug.
  Debug logging since stripped from `CredentialsStore.cpp`/
  `PairingRoutes.cpp` (the `configRoot` line in `main.cpp` stays until the
  double-click crash below is root-caused).
- [ ] **No way to discover the WebUI's URL.** Root cause found: the printed
  line was `config.boundBackendIP()` verbatim, which defaults to `"0.0.0.0"`
  — a bind-all address, not something a browser can reliably navigate to
  (behavior varies by browser/OS, matching the flaky "0.0.0.0 worked/didn't
  work" reports). Fix in progress: `browsableAddress()` substitutes
  `127.0.0.1` for that case; auto-launch the browser on first setup only,
  print a clickable link (not auto-launch) otherwise. Same bug existed
  identically in both `Aurora-App-Windows` and `Aurora-App-Linux`.
- [ ] **Back navigates to the previous onboarding *step*, not "undo this
  screen's own choice" — surprising, not necessarily wrong.** Hit while on
  Tuning (audio mode, mistaken for the Dashboard) wanting to switch back to
  video; Back instead returned to Output Connect (the actual previous
  chain step), several steps earlier than expected. The toggle to actually
  do what was wanted (Mode+Device Select's or the Dashboard's own
  Video/Audio segment) was reachable without Back at all. Worth deciding
  whether Back's semantics need to change or this is just discoverability.
- [x] **Fixed: clicking a Dropdown entry looked broken but wasn't.**
  `Dropdown._commit()` closed the menu and called the caller's `onSelect`,
  but never updated its own trigger label or `aria-selected` — the
  committed value was always correct (confirmed via the real PUT/POST body
  sent) but the label never visibly changed, indistinguishable from a
  broken click. Fixed in `Dropdown.js`; regression coverage added to
  `dropdown_test.mjs`. Neither real call site (`OutputConnectScreen`,
  `ModeDeviceScreen`) needed changes — both already just stash the value.
  Re-reported as still broken once — served file confirmed correct via
  direct curl; likely a stale ES-module cache in an already-open tab, not
  reopened as a task unless a hard-refreshed repro still shows it.
- [x] **Fixed: entertainment config pickable without redoing physical
  pairing.** `OutputConnectScreen` had no path to `configSelect` except the
  full `entry → pairing → configSelect` sequence, even with valid
  credentials already saved. Matches huenicorn's own real design
  (`WebUI.js`'s entertainment-config `<select>` lives on its main
  zone-mapping page, decoupled from setup) — added the picker to Zone
  Mapping instead of special-casing Output Connect, hidden at exactly one
  config same as elsewhere. `POST /api/hue/connection` is now merge-style
  (PATCH), same convention `/api/config`/`/api/zones` already use, since
  the frontend never has `username`/`clientkey` to resend a full body;
  `PUT /api/hue/entertainment-configurations` falls back to the persisted
  connection when the body omits bridgeAddress/username. Verified live
  against the real bridge (switched "TV area" → "TV" and back with no
  re-pairing); jsdom regression coverage added to `zone_mapping_test.mjs`.
  `[pairing-debug]` logging stripped from `PairingRoutes.cpp`/
  `CredentialsStore.cpp` now that the persistence question is resolved
  (the `configRoot` line in `main.cpp` stays until the double-click crash
  is root-caused).
- [ ] **No single-instance enforcement — a second launch can silently run
  headless.** `httpServer.bind()` failing (port in use) just logs to
  stderr and the process keeps running with no WebUI at all; nothing tells
  the user which of possibly several running copies is the real one. Real
  design constraint: must scope the lock to the resolved config root, not
  globally — this session's own testing runs multiple instances at once
  against different `AURORA_CONFIG_DIR`s, and a real future setup might
  legitimately run two instances for two different bridges. A named mutex
  derived from the config-root path, not a global one. Related: a
  double-click-launched console closes instantly on exit, so even a
  correct error message is never seen — worth fixing together (log to a
  file, or keep the window open on error).
