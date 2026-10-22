# Aurora-w6no: portal restore token is actually stored now (closed)

Id: w6no-restore-token

Wayland captures re-showed the portal monitor picker on every pipeline
build: `persist_mode=2` was requested and the token handled in memory, but
no `IRestoreTokenStore` existed outside tests, so nothing persisted.

## Built

- New `FileRestoreTokenStore` (`input/linux`): `<configRoot>/portal-restore-token`,
  user-only permissions (explicit chmod, umask-proof), mutex-guarded,
  trims whitespace, skips identical rewrites, empty token clears.
- `app/linux` `registerInputs` takes `configRoot`, builds one store shared
  by the `pipewire` and `linux`-Wayland factories (shared_ptr held by the
  factories; Registry outlives every Pipeline). Gamescope keeps the null
  store — no portal there. Rotation still lands via the existing Start
  handler; last-write-wins under concurrent reloads (Aurora-5t2, rechecked
  via bead note, fix options still stand).
- Docs: [[external-control]] and [[future-steamos-support]] claims now true;
  [[mac-permissions]] annotated with a dated correction (archive, not
  rewritten); the rerun-skips-picker lesson's Aurora half corrected
  (file, not `config.json`).

## Verified

- `PortalTokenTests` +7 cases (missing file, round-trip, 0600, overwrite,
  clear, trim, fake-portal persist-and-replay): input suite 65/65,
  `aurora-app-linux` builds, `check-links.py` / `check-lessons.sh` clean.
- Real GNOME/KDE honoring the replayed token stays a manual per-desktop
  check — fake portal pins what is sent/stored, not backend behavior.

## Lessons

- New entry in [[lesson-input]]: "A tested handshake can still be dead in
  the shipped app" — persist wired through interfaces and covered by tests
  is not persistence until production code constructs the store.
