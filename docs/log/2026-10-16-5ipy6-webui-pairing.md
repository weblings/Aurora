# WebUI pairing screen (Aurora-5ipy.6)

Id: 5ipy6-webui-pairing

Closed 2026-10-16. EC 4b of [[external-control]], the UI half of
[[5ipy5-lan-pairing-backend]]. Code landed in commit 1a06cd2. This entry and
the end-to-end check were added when closing.

## Done

- `PairingScreen`: an unpaired LAN browser names itself, requests `admin`
  scope and shows the 5-character code, then polls until approved or denied.
- Boot asks `GET /api/pairing/status` first and routes to the pairing screen
  when required. A global fetch hook sends any later 401 (revoked device) back
  there, except the pairing handshake calls.
- Shell banner rows list pending requests with the code and Approve / Deny,
  shown only where pairing can be managed (loopback or a paired admin).
- Dashboard paired-devices list with revoke. A 500 `store_write_failed`
  ([[m4wp-pairing-revoke-persist]]) tells the user it is revoked until restart.
- CHANGELOG "Unreleased" note for upgrading LAN users.

## Verification

- Node tests: `Pairing`, `PairedDevices`, `PairingScreen`, `shell` pass.
- End to end on the Windows Release app (devstack, dummy input), requests sent
  to the machine's non-loopback IP: unpaired `/` and CSS 200, API reads and
  writes 401; request, approve from loopback, token collected, paired read 200;
  revoke then 401. Run together with [[5ipy19-lan-reads-paired]].

## Not verified

- Not clicked through in a browser on a phone.

## Lessons

- None.
