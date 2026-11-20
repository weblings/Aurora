# Demo, editor and recipes deploy to Pages from a tag workflow

Id: 51nv3-pages-deploy

`Aurora-51nv.3`, with `Aurora-51nv.14` and the `Aurora-51nv` epic closed in the same pass. `.github/workflows/pages.yml` runs on `v*` tags, calls the reusable `wasm.yml`, builds the editor and recipes, assembles `web/demo` into a site and publishes it with `actions/deploy-pages`. It replaces the gh-pages subtree push.

## What shipped
- Jobs: `wasm` (reusable call), `build` (demo unit tests, `fetch-engine.py`, `build-recipes.py`, site assembly with file checks, `upload-pages-artifact`) and `deploy` (`github-pages` environment). The site ships the commit's own WASM module plus `build-info.json`.
- `engine-worker.js` imports `./vendor/engine/engine.js`, and `fetch-engine.py` copies `web/engine/engine.js` there in both modes. The old `../engine/engine.js` import has no parent at the site root.
- Setup done by the owner: Pages source set to GitHub Actions and a `v*` tag rule on the `github-pages` environment.
- First run: tag `v1.2.0.dev-1` (commit `660a69f7`), run 44680580721, succeeded. The demo, graph editor and recipes were checked live by the owner. The recipes URL `https://weblings.github.io/Aurora/recipes/` resolves, which settles the `Aurora-hzjf` placeholder.
- Dev builds use tags `v1.2.0.dev-N`, incremented instead of force pushed. No release tooling reads tags, and the demo footer version is the constant in `demo-shim.js`.

## Findings
- No workflow, CMake file or script reads git tags, so a dev tag only triggers the Pages deploy.
- `actionlint` and a scratchpad copy of the site assembly caught nothing before the first run. `rsync` is not installed on the owner's machine but is on the runner.

## Left open
- `origin/gh-pages` still exists. Deleting it was deferred by the owner. Its environment rule can go with it.
- `Aurora-51nv.14` was closed by the owner without the code work. The JS `inputsFromVerdict` fallback in `engine-feeds.js` stays, and `engine.test.mjs` still treats `inputs` as optional.
- `Aurora-51nv.12` (end-to-end check in three browsers at desktop and phone widths) moved out of the epic to 1.2.1. `Aurora-x2om` (recipes manual checks) moved to 1.2.1.
- `Aurora-ifkn.8` stays in progress, and the Pages verification it waited on is now done through this path.

## Verification
- `actionlint` clean on `pages.yml` and `wasm.yml`. `web/demo/*.test.mjs` pass.
- Live URLs for the demo, `graph-editor/`, `recipes/` and `build-info.json` returned 200 after the run.

## Lessons
- none
