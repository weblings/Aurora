# Graph editor cleanup stage 1: back link and Aurora styles

Id: daaa-graph-editor-stage1

`Aurora-daaa.1` and `Aurora-daaa.2`, stage 1 of
`docs/planning/WebUI/GraphEditorCleanup.md`. CSS and markup only, no structure
change, so every existing browser check runs unchanged.

- `.1`: the header's purple dot (`public/icon.svg`, deleted) is replaced by an
  `<a class="btn btn-secondary editor-back" href="/">` with
  `web/ui/icons/back-arrow.svg` (imported through Vite, 14px) and "Dashboard".
  A real link, so it works from a bookmark or reload. New check
  `graph-editor-back-link.mjs` (`npm run graph-editor:back-link`): link, label,
  arrow, no dot, and `/` is the Dashboard. The dev server only proxies `/api`,
  so a dev run loads the app origin; an embedded run clicks the link.
- `.2`: `forms.css` imported after `tokens.css`. `.btn btn-secondary` on every
  button (`btn-primary` on Save and apply), `.text-input` on text and number
  inputs, `.slider-input` on range inputs (`--slider-percent` set inline from
  value/min/max, since forms.css paints the fill from it). Selects stay native
  with an editor.css rule (same dark field as `.text-input`) rather than
  `.dropdown-trigger`, which is `display:flex; width:100%` and would stretch the
  header picker. `font-family: inherit` on controls fixes the Arial fallback
  (computed font was `Arial`, now `Inter, system-ui, sans-serif`). The editor's
  old per-control border/background rules were removed, since they beat the
  classes on specificity; sizing rules stay.
- CMake: the vite build now depends on `back-arrow.svg` and `forms.css`, so
  editing either rebuilds the embedded editor. Not exercised: an actual CMake
  rebuild (dev-server runs only).
- Always-visible control count unchanged: 97 (Screen colors), 160 (audio).
- Screenshots at 1470x900 on the fake-Hue stack, before and after, for Screen
  colors and builtin.audio: `2026-11-08-daaa-stage1-shots/`. The "before" ones
  already have the back link, unstyled.
- Checks: edit-loop, add-node, port-types, back-link and gate pass on the Vite
  dev server. `save-as-new` fails on the tree before this work as well (copy
  titled "(Copy)", check expects "copy"): filed as `Aurora-xr4c`.
- The checks need `AURORA_BROWSER` here: the Playwright cache holds
  `chromium_headless_shell-1248`, not the version `lib/browser.mjs` looks for.

- Lessons: none.
