# Pairing requests in the error shell: collapse, editor, baseline wait

Id: 9hqa4-shell-pairing

`Aurora-9hqa.4` (P2), stage 6 follow-up 2.5 under `Aurora-9hqa`, run before 2.3 (the pulse and announcement) by the owner's 2026-11-13 note. Working tree only at the time of writing; the coordinator commits and closes. Builds on [[9hqa1-shell-row-model]] and [[u8jx5-shell-collapse]]; design in [[error-overlay]] (The banner, Rows).

## What was built

- `web/ui/shellRows.js`: pairing rows are collapsible and notices (`isCollapsible` is every row but the toggle, `isNotice` is light test or pairing). `layoutRows` no longer pulls pairings out above the shell. The open row carries the circled-info like the light-test row (`pairingAccessText` is exported for the editor). `baselineReady({stateReplied, canApprove, pendingLoaded})`: ready once the state reply is in, `canApprove` is known (not `null`) and, when true, the first pending result is in.
- `web/ui/shell.js`: `_hasReplied` split into `_stateReplied` and `_baselined`; `_pendingLoaded` is set by the first pending read (a failed first read counts, so a broken route cannot hold the shell back); `_maybeBaseline()` runs after the state reply, each pending read and `setCanApprove`; the takeover resets all three. Nothing is drawn before the baseline.
- `web/ui/app.js`: `app.canApprove` starts `null` (not read) and bootstrap calls `app.setCanApprove(...)`, which fetches pending at once when true. The class default stays `false`, so tests and pages with no status read have nothing to wait for.
- Editor: `useHostState` reads `/api/pairing/status` once (again after a takeover) and `/api/pairing/pending` with each beat, single-flight, exposes `pairings` and `decidePairing` (POST then re-read, waiting out a read already in flight), and its `hasReplied` now means "the shell can take its baseline" (state reply, status answer, first pending result). `ErrorShell.tsx` has a `PairingRowView` with the Dashboard's markup; `ShellBannerProps` gained optional `pairings` and `onDecidePairing`; `App.tsx` wires them.
- Approve on the Dashboard still calls `onPairedDevicesChanged`; the editor has no device list.

## Checks

- Unit: `shellRows.test.mjs` (pairing counts as a notice, inside the collapse, `baselineReady`), `shell.test.mjs` (arrival re-opens, baseline waits for the pending result and the status, recovery re-baselines, cannot-approve and failed-read cases), `ErrorShell.test.tsx` (markup parity with the Dashboard for lone, paired, collapsed and mixed rows; baseline render).
- Browser, real requests: `POST /api/pairing/request` is scope None and a loopback browser is admin, so the checks raise real requests (`tools/browser-check/lib/pairing.mjs`, names prefixed `bc-9hqa4`, denied and revoked in cleanup). No route faking was needed. `dashboard-shell` and `graph-editor:error-shell`: a request pending at load with an error starts collapsed "1 notice 1 error" and stays so across polls; open, it shows device, code (matches the requester's) and access; one arriving re-opens a collapsed shell and the bar reads "2 notices 1 error"; Deny reaches the server (poll answers 403); Approve from the editor (poll 200, device created); a lone request at load starts open.

## Findings

- The 5-minute lapse of a collapsed request is accepted by the owner.
- The pulse and live-region announcement stay with `Aurora-9hqa.2`, which now includes pairing rows.
- Follow-up (owner, after the epic closed): the pairing logic is one implementation on every surface. The editor first read `canApprove` with its own copy of the rule, and both pages fetched the pending list and posted decisions with their own code. Now `web/ui/Pairing.js` holds `fetchPairingStatus`/`canManagePairing` (already shared), plus `fetchPendingPairings` and `decidePairing`, which `shell.js` (Dashboard and NUX) and `useHostState.ts` (editor) both import. `Pairing.test.mjs` covers the two new helpers. The rows were already identical (markup parity). A browser request reads Device and Code only: it always asks for admin, which has no Access line, and loopback has no From. That is the same on every surface.
- A screen-reader pass over the shell before 1.2.0 is `Aurora-fruw`.

## Lessons

- none
