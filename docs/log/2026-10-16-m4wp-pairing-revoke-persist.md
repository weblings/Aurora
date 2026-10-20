# Pairing revoke may not persist on Windows (Aurora-m4wp)

Id: m4wp-pairing-revoke-persist

Closed 2026-10-16. Found reviewing [[5ipy5-lan-pairing-backend]]. The 5ipy.3 and
5ipy.8 logs reported the failing persist test as a Windows temp-dir lock. The
first failed check was the revoked token still authenticating after a reload.

## Cause

- `PairingService::saveLocked` writes `paired-devices.json` via temp file and
  rename, and ignored a failed rename. On Windows an open handle on the store
  blocks the rename and the remove fallback, so `revoke()` returned true and the
  device came back after a restart. The test held an `ifstream` open on the store.

## Done

- `saveLocked()` returns whether the store was written.
- `revoke()` returns `RevokeResult` (`Revoked`, `NotFound`, `NotPersisted`). The
  in-memory revoke holds either way. `DELETE /api/pairing/devices/:id` answers
  500 `store_write_failed` for `NotPersisted` so the admin can retry.
- The persist test closes its stream. New Windows-only test holds the store open
  and expects `NotPersisted` with the token already rejected.

## Verification

- Core suite 367/367 (MSVC Debug, `build-core-test-win`), `[Pairing]` 6/6.

## Not done

- A failed save on mint (approval) is still silent. The device works until a
  restart, then needs pairing again, which fails closed.

## Lessons

- 1 filed in windows-env: write-then-rename fails while a handle is open.
