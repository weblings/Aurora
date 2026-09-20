# web/ui — agent notes

Static HTML/CSS/JS setup/control UI, served by the app shells. No build
step, no npm. Screen design lives in
`docs/WebUI/WebUI_Design_1stPass.md`, not here.

- Never add a file under `api/` — the static mount shadows API routes.
- Tasks (`bd`) and lessons (`docs/lessons/`) live at the repo root.
