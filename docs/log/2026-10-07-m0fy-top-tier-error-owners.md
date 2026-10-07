# Aurora-m0fy: Dashboard inline errors get one owner per control (closed)

Id: m0fy-top-tier-error-owners

2026-10-07. Last WebUI bead of [[error-overlay]]'s shell-by-cause revision,
after [[98pr-webui-banner-x]] and [[h457-audio-permission-banner-row]] took the
host-state copies out of the same fields. Node tests with mutant checks; no
live check (WebUI-only, no daemon change).

## Done

- `topTierError` (one string) became `topTierErrors`, a map keyed by the
  control that raised it: `deviceSave`, `autoArrange`, `pause`,
  `entertainmentConfig`, `zoneToggle`, `zoneCanvas`. `_setTopTierError` and
  `_clearTopTierError` always repaint the top tier (a clear only when it
  removed a key). Every current key renders as its own row; a reworded retry
  updates its row in place. The device hint hides while any row shows.
- A key clears only on its own control's confirmed result. The click-time
  nulls in `_onAutoDivideClick` and `_onDeviceFieldChange` are gone, so a retry
  in flight keeps the old message until it succeeds. `_onEntertainmentConfigChange`
  no longer clears everyone's errors.
- `ZonePatchQueue` gained an optional `onSuccess`, passed through
  `ZoneCanvas` and `ZoneActiveToggleList`, so the zone rows can clear on a
  confirmed save.
- A confirmed pause or resume clears `pause`. Not in the bead's text, same
  field and same bug.
- `EntertainmentConfigSelect` no longer reports a saved-but-reload-failed
  switch through `onError`. It passes `{ reloadError }` through `onChange`;
  the Dashboard pokes the beat and shows no inline row (the daemon holds it as
  a `reload` error and the banner shows it). `onError` now means a rejected
  switch only.

## Found

- Auto-arrange's "No active zones to arrange." was set but never painted:
  the function re-rendered the zone content, not the top tier.
- The entertainment select called `onError("Saved, but ... couldn't reload")`
  and then `onChange`, which nulled the field. The message survived only
  because nothing repainted the top tier in between. On Zone Mapping
  (onboarding) the same pair set `error` and then cleared it and reloaded, so
  that message was already invisible.
- The Dashboard's select callback was `() => this._onEntertainmentConfigChange()`,
  dropping the new argument. Direct-call tests passed while the real wiring
  did nothing; caught by a test through the constructor-built select.
- `/api/hue/connection`'s reload runs `reloadPipelineFromDisk`, then
  `PipelineHost::reload`, which holds the failure as `reload` on a running
  host (read in code and `PipelineTests.cpp`; not run live).

## Verified

- All `web/ui` node tests pass. Mutants each caught: clear-all, no clear
  (auto-arrange, device save, pause), no repaint on set or clear, click-time
  clear, only the first row rendered, dropped `onChange` args, no beat poke,
  `onError` for a reload failure, select dropping the result.
- New `EntertainmentConfigSelect.test.mjs`.

## Lessons filed

components (one key per owner for a shared inline error slot; a callback that
reports two outcomes), webui-testing (a wrapper that drops arguments).

## Not done

- `ZoneMappingScreen` (onboarding only) still has one `error` string cleared
  by its entertainment `onChange` and never by a zone edit's success. Inline
  step errors are right for onboarding (plan decision 3); left alone.
- `ZoneActiveToggleSingle` has no callers and takes no `onSuccess`.
- Demo fork not re-vendored (plan decision 7).
