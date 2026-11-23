# React Dashboard and NUX: build and delivery decision

Id: 4nqt1-react-dashboard-delivery

`Aurora-4nqt.1`. Decision note [[react-dashboard-delivery]]: Dashboard and NUX pages join the `web/graph-editor` Vite project (option A), one dist embedded and served under `/graph-editor/`.

- The main page loads a stable-named island entry (`islands.js`), since the build uses a relative base. `Aurora-4nqt.3` proves it.
- Node policy is unchanged until the router flip (`Aurora-4nqt.11`), when the bundle becomes mandatory for app builds and the CMake options are renamed with aliases.
- The demo already builds the bundle (`build-editor.py`, `pages.yml`), so the island entry rides along. `vendor/webui` stays until the flip.
- Open for the owner: whether Node-less app builds stay supported from `Aurora-4nqt.4`, and a later directory rename.

## Verification
- Docs only. Claims were read from `GraphEditor.cmake`, `Building.md`, `build-editor.py` and `pages.yml`. No build was run.

## Lessons
- none
