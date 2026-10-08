# Aurora-cyee + Aurora-rbp3: local bridge discovery and host conditions (closed)

Id: cyee-rbp3-mdns-and-host-conditions

2026-10-08. Follow-up to Aurora-o1qt. Autodetect still failed for a first-run
user while the Hue cloud service rate-limited us, and the Local Network
message lived inline on one screen. Owner wanted Autodetect to work without
typing an IP, and the message in the error shell.

## Aurora-cyee: mDNS bridge discovery

- `output/hue` `MdnsDiscovery`: one PTR query for `_hue._tcp.local` sent from
  an ephemeral port to 224.0.0.251:5353 (so responders answer by legacy
  unicast to that port), one resend at 500 ms, 1.5 s window. Parser follows
  PTR -> SRV target -> A, takes `bridgeid` from TXT, tolerates compression
  pointers, truncation and loops. `autodetectedBridge()` tries it first and
  keeps `discovery.meethue.com` as the fallback.
- Verified: standalone run found 192.168.0.154 and its bridge id in 1.6 s;
  owner confirmed Autodetect in the app once Local Network was allowed.
  Four parser tests. Windows (WSAStartup/WSAPoll) and Linux not compiled.

## Aurora-rbp3: host conditions channel

- Design review changed the first proposal. It bent `HostError` twice (let
  `setError` hold while idle; re-assert after builds clear it). Both meant
  the thing was not an error, so core got a separate list: `HostCondition`
  on `PipelineHost` (`setCondition`/`clearCondition`/`conditions()`, own
  leaf lock), never touched by builds, pause or state, exposed as
  `conditions` on `GET /api/state`. Also dropped a planned
  `local_network_blocked` validate-route code: the banner is the one
  surface, Connect hides its inline line while the condition is active
  (avoids Aurora-tazx's two-messages problem).
- Mac: `LocalNetworkConditionPublisher` in the tick loop sends one empty
  UDP datagram every 2 s and sets/clears `local_network` (Unknown clears).
  `/api/mac/local-network` and the 30 s cached probe removed.
- Shell: `CONDITION_ROWS` maps source -> renderer; condition rows have no
  Retry and no X. Local Network row: Open Settings plus "In Settings, click
  Local Network and allow Aurora." `text-wrap: pretty` on banner text and a
  non-breaking space in that line fix an orphaned last word.
- Deep link: no anchor reaches the Local Network list on macOS 27; see the
  macos-gui lesson. The link opens Privacy & Security.
- Verified: core 181/181 (new conditions test), mac app 83/83 (publisher
  throttle/set/clear tests), web suites green with two mutants killed; owner
  saw the banner on Connect while idle, saw it clear after allowing access
  with no relaunch, and checked the Settings link.

## Open

- `audio_permission` is also a standing condition and could move to the
  conditions list.
- A second LAN output (Home Assistant) may want a shared "blocked" verdict
  on its own connect routes; not built until it exists.
