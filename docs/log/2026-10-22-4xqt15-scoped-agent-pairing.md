# Aurora-4xqt.15: scoped agent pairing, Windows Sequence D pass

Id: 4xqt15-scoped-agent-pairing

Agents no longer need an admin token from the WebUI. Also records the Windows
gate rerun that [[4xqt13-optional-input-hold]] left open.

## Built

- `aurora-mcp --pair [--scope apply|draft|read] [--name N]` requests a token,
  waits for Approve in the WebUI banner and prints only the token. Default apply.
  Refuses admin and a loopback `AURORA_URL` (loopback needs no token).
- Default name is `aurora-mcp on <hostname> (<OS>)` from `GetComputerNameA` or
  `gethostname()`. The first version read `HOSTNAME`, which bash does not export,
  so a Linux client showed "this computer".
- Pending pairings carry the requester's address (`from`), seen by the server so
  the client cannot fake it. Held in memory only, not stored with the device.
- Banner is a labelled list: device, from, access (below admin only), code.
- Paired devices rows name a non-admin access level.
- 401 and 403 adapter errors split. A 403 names the scope the call needed and
  says to re-pair.
- `PipelineTests` pins the scope of every REST call the adapter makes, so a new
  write route without its own guard rule (admin by default) fails a test.

## Verified

- Windows: adapter 28/28, network 30/30, pipeline 118/118, shell and
  PairedDevices JS tests.
- Linux client against Aurora on Windows over the LAN: paired through `--pair`,
  device and address shown in the banner, `aurora_status` worked, token survived
  an Aurora restart, `try_on_lights` passed the apply guard (answered "no draft").
- `sequence_d_gate.py` 11/11 on Windows, `windows-audio`, fake-Hue stack, LAN
  phase on `192.168.0.224`. Covers the 4xqt.13 Windows rerun with the tightened
  dark checks.
- Mac (arm64, `mac-app`, `mac-audio`): `sequence_d_gate.py` 11/11, LAN phase on
  `192.168.0.198`. ctest 111/112 before the test rename below, 112/112 after.
- Mac helper under Gatekeeper (Aurora-4xqt.16): the dev bundle is ad-hoc signed,
  `codesign --verify --strict --deep` valid, `spctl --assess` rejects it (expected
  for ad-hoc). A copy with `com.apple.quarantine` set on `aurora-mcp` still ran
  from a shell and answered `initialize`. Claude Code in VS Code spawned the
  unquarantined helper earlier. No TCC prompt seen; the helper only makes HTTP calls.

## Open

- Not tested: a quarantined helper spawned by a GUI client, and a Developer ID
  signed and notarized bundle that contains `aurora-mcp` (the notarized 1.0.4
  bundle predates the helper). Aurora-4xqt.16 stays open for that.

- Gate rerun on Linux with this adapter.
- Gate pairs through the API, so `--pair` itself is covered by the Linux trial only.
- Paired devices does not show where a device paired from. Needs a stored field.

## Lessons

- A Catch test name that starts with `--` is parsed as an option when ctest passes
  it as the argument (`Unrecognised token: --pair`). It failed on Mac only;
  renamed to start with `aurora-mcp`.
- A `.status-text` paragraph keeps its dimmer grey over a later single-class rule
  because `forms.css` loads after `shell.css`. Scope the override.
- Dev error injection and `AURORA_WEBUI_SOURCE_DIR` make banner changes
  visible on refresh with no rebuild (see `light-viz-stack`).
