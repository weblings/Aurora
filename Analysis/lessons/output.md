# Output — streaming/protocol gotchas

Hue and any later DMX/Art-Net/sACN/OPC targets. See [`README.md`](README.md) for how
entries get routed here vs. elsewhere.

---

## A bridge having more than one entertainment configuration over the same lights is normal, not an edge case — "empty ID selects the only one" doesn't hold

`HueOutput`'s empty-`entertainmentConfigurationId` default picks
`m_entertainmentConfigurations.begin()` on an `unordered_map` — fine if a
bridge only ever has one. The first real bridge tested against had two
("TV" and "TV area"), both with 6 channels over the identical 6 physical
lights but different channel-to-light wiring — an entirely ordinary result
of setting up more than one entertainment area in the Hue app, not a
misconfigured test rig. `begin()`'s hash-order pick is silent and
consistent-per-build, not "the first one created" or "the only one" —
confirmed live by polling both configs' `/clip/v2/resource/
entertainment_configuration/<id>` while the app ran: one showed `status:
active`, the other stayed `inactive`, and it wasn't the one the hand-written
zone map was transcribed from.

**Fix:** added `AURORA_HUE_ENTERTAINMENT_CONFIG_ID` (optional env var, same
stopgap shape as `AURORA_HUE_BRIDGE_ADDRESS`/`_USERNAME`/`_CLIENTKEY`) so the
ambiguity is resolvable without a real picker UI. Once a UI exists (phase 3),
it needs to list all configurations and let the user choose, not assume a
bridge has exactly one.

---

## `DtlsClient`'s handshake failure is swallowed by design — a clean `HueOutput::init()` is not proof a connection exists

`Streamer`'s constructor calls `m_dtlsClient->init()` inside a `try/catch`
that deliberately swallows any exception (matching huenicorn: "connection
failure is observable via `isConnected()`, caller decides whether to
retry"). Nothing upstream (`HueOutput::init()`, `Orchestrator::init()`,
`main()`) checks `isConnected()` today, so a full app run printing "Aurora
running" and streaming with no errors is consistent with *either* a working
DTLS session *or* a silently-failed handshake — the log output alone can't
tell them apart.

**Fix:** not changed (retry/surfacing logic is out of scope for this pass,
matching huenicorn) — but verifying a real run needs an explicit check
beyond "no exception thrown": call `isConnected()` directly, or check for a
real socket from the outside (`ss -u -a -n -p | grep <bridge>:2100` against
the running process). Worth revisiting once `Aurora core` gets a logger (see
`engineering-hygiene.md`'s note on that) — this is exactly the kind of
swallowed failure a log line would have surfaced immediately instead of
needing an external probe.
