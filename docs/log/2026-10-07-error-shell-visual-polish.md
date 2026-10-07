# Aurora-x1lh: error shell visual polish (closed)

Id: x1lh-error-shell-visual-polish

2026-10-07. Follow-on to Aurora-7ybx's dev-error injection tooling: with a
Windows devstack build showing the 2-row collapsed banner on demand, the
owner iterated live on the banner's CSS/markup.

## Done

- `.shell-banner-row`: bordered card (`border-radius: var(--aurora-radius-
  panel)`, 2px border) with padding between rows instead of a line
  separator; the old `border-top` divider removed.
- Dismiss `x` switched from absolute-positioned pixel offsets to a flex
  row (`align-items: flex-start`) with text wrapped in a new
  `.shell-banner-content` div -- aligns to the top of whatever content is
  there regardless of 1 vs. 2+ wrapped lines, rather than a fixed offset
  tuned for one specific line count.
- Found and fixed a margin-collapse bug surfaced by the border/flex change:
  `.status-text`'s own `margin-top` (forms.css) stopped collapsing away once
  the row gained a border/became a flex item, so it stacked on the row's own
  padding and pushed text below the x. Fixed with `.shell-banner-content >
  :first-child { margin-top: 0 }`. One new lesson ([[lesson-layout-css]]).
- Re-collapse control added: the expanded "N problems" banner had no way
  back to the collapsed summary. A "Show less" button at the bottom now
  sets `_bannerExpanded = false`; both it and the summary button reuse
  `.accordion-chevron` (the same masked `chevron-down.svg` the Dashboard's
  accordions use), rotated 180deg for the collapse direction, instead of the
  old `▾` text glyph.
- Bolded the `⚠` glyph in every banner-row branch (`shell.js`'s generic row,
  all of `MacPermissionRecovery.js`'s `renderReloadError`/
  `renderAudioPermissionBanner`).
- `.shell-banner-row`'s border and `.shell-banner`'s own `border-bottom`
  thickness tried in tandem (2px each) for a consistent divider weight; the
  bottom divider was reverted back to 1px by the owner afterward, row border
  stays 2px.
- Checked, rejected: thickening `.segmented-btn.pending`'s outline (the
  Dashboard's Video/Audio toggle mid-switch state) -- that was a
  miscommunication (owner meant it only as a thickness reference for the
  error-row border), reverted to its original 2px/-2px.
- Audited every real banner resolve-action against `docs/planning/
  ErrorOverlay.md`'s three-way model (Retry / Open Settings / no button):
  no currently-built source (`startup`/`resume`/`reload`, Mac permission,
  `audio_permission`) actually renders without an action today -- "no
  button" is a reserved category for a future error type, not reachable
  through the real sources, so no no-action row was built.

## Verification

- `node --test web/ui/shell.test.mjs web/ui/MacPermissionRecovery.test.mjs`
  green throughout.
- Checked live against a Windows devstack build (`windows-app` Release,
  rebuilt once this session after a stray prior `Aurora.exe` was found
  locking the link step) via dev-injected 1/2-line and 3-line-wrapped
  errors (`POST /api/dev/errors`); CSS/JS served from the checkout directly
  (`AURORA_WEBUI_SOURCE_DIR` resolves to the real `web/ui`, no rebuild
  needed per edit).

## Open

- No commit made (conservative profile); diff is CSS/JS only, no core
  changes, no rebuild needed to pick it up again.
- `docs/planning/ErrorOverlay.md`'s own open "Retry feedback when a retry
  fails identically" proposal (2026-10-07, agent-proposed) is unrelated and
  still unresolved.
