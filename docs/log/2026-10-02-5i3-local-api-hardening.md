# Aurora-5i3: local API hardening before any HA credential exists

Id: 5i3-local-api-hardening

Closed `Aurora-5i3` (HA prep 8). Done across two sessions; the first one
couldn't run `bd`, so the claim and close were handed off. Rules are recorded
once, in the "Local API rules" section of [[home-assistant-output]].

## Done

- **Origin/Host gate** (`HttpLibServerImpl.hpp`, `_wrapHandler`, commit
  `c35e7c2`):
  - Non-GET with a foreign Origin (else Referer) gets 403
    `cross_origin_forbidden`, and the handler never runs.
  - No header passes; same host passes; null or malformed fails closed.
  - Compares host only, not port. Not a DNS-rebinding defense.
- **Secrets audit:**
  - No response carries a stored secret. The exception is the newly issued
    creds from `PUT /api/hue/register`, which needs the link button.
  - Found a real leak instead:
    - `PUT /api/hue/entertainment-configurations` and
      `POST /api/hue/test-pulse` sent the stored username to whatever
      `bridgeAddress` the body named.
    - `POST /api/hue/connection` could repoint the address and keep the
      creds.
  - Fixed with `_resolveTarget` (stored creds go only to the stored
    address); repointing now clears creds.
  - WebUI bodies (`{}` or the full address + creds) are unaffected.
- **Decisions:**
  - `0.0.0.0` stays the default; the LAN WebUI needs it.
  - The HA URL change clears the token (rule for Aurora-4zr.5).
- **Docs:** credential-rules section in `output/hue/README.md`. No single
  API reference file exists, so that README plus the HA doc stand in for it.

## Verification (Linux)

- `AuroraNetworkTests`: 13 cases, 117 assertions (gate cases on port 18227).
- `AuroraOutputHueTests`: 47 cases, 208 assertions. Three new `[PairingRoutes]`
  cases (ports 18237-18239). The retarget and repoint cases fail on the
  pre-fix `PairingRoutes.cpp`, which was checked.
- web/ui + web/demo node tests: 12/13. `demo-shim.test.mjs` fails on a
  pre-existing version drift (shim 1.0.4 vs. drafted CHANGELOG 1.0.5),
  unrelated.
- Not done: live WebUI/demo run, Windows/Mac builds.

## Lessons

- "A never-return-secrets audit must also follow where each stored secret
  is sent" (architecture-process.md).
- "The Origin-vs-Host write gate 403s the WebUI if a dev proxy rewrites
  Host" (web-testing.md).
