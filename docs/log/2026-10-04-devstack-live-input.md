# Fake light stack defaults to live capture

No bead closed; follow-up to the Video-toggle question (Aurora-m2c, open).

- "Video on, lights bouncing" in the stack was `dummy`, not audio:
  `devstack.py` set `activeInputName: "dummy"` on Mac/Linux, and
  `DummyGrabber` fills one colour from sines (periods ~12.6/18.8/31.4s).
  The toggle was accurate; m2c's startup symptom is not explained by this.
- `devstack.py up` now takes `--input` (default `live`: `windows`/`mac`/
  `linux`; `dummy` on request). Skill updated to match.
- Live `up` on Ubuntu GNOME Wayland: first run died on the 3s config-PUT
  timeout while the portal dialog was open; PUT and first-frame waits are
  now 120s for live. Second run: `linux` input, per-zone colours, dialog
  accepted both times. Mac/Windows live default not re-verified.
- Doc/bead corrections: `input/linux/README.md` no longer says Wayland
  capture is unverified (GNOME Wayland verified; KDE, gamescope, X11 not).
  Notes added to Aurora-moq and Aurora-3ee (3ee's "Linux not started" is
  stale, likely closable).
- No new lessons.
