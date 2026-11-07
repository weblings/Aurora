# Source-less effects run with no inputs configured

Id: zl32-no-input-running

`Aurora-zl32`. Picks "Idle plus an applied source-less graph builds anyway", so
there is no new config value.

## State

- `Pipeline::build` returns null only when no inputs are set and no source-less
  effect is applied. An unreadable effect with no inputs now throws (Failed).
- `GET /api/effects` and `/api/v1/effects` report `inputs` per effect, null when
  the file is unreadable, through the now public `effectInputs`.
- `isModeConfigValid` accepts a source-less active effect, read from the effect
  list because `/api/state` has no `graphInputs` while no pipeline runs.
- Capture source no longer replaces a custom effect. Only a Video or Audio click
  picks a built-in. Landing and device edits save the input alone.
- The tray label reads host state only, so it needed no change.
- Capture source is reachable only while `nuxCompleted` is false: `app.js` sends
  a completed user straight to the Dashboard. So the overwrite was limited to an
  effect applied before onboarding finished.
- A save that kept a custom effect is confirmed by `isApplyConfirmed`, because
  `isSwitchConfirmed` rejects any running custom effect and left the monitor list
  unfetched.

## Live check

Fake-Hue stack on Windows, real WebUI through `tools/browser-check`.

- No inputs, source-less effect, app restarted: Running, frames flow, and with
  `nuxCompleted` false the WebUI lands on the Dashboard with the config intact.
- Same flow on `HEAD` web files: both a source-less and a source-needing custom
  effect were replaced by `builtin.video`, with the `windows` input saved.
- Source-needing custom effect, no inputs: Capture source saves the input only,
  and the effect runs. A device edit keeps it. An Audio click picks the built-in.

## Open

- A startup failure with null `graphInputs` was not reproduced: with the fake
  bridge stopped the app stayed Running.
- A source-less effect reports `usesVideoInput` and `samplesZones` true, so the
  Dashboard shows Zone Mapping for it.
- With a failed effect list, Capture source still opens and saves an input, but
  the custom effect is kept.

## Resume

`Aurora-dh1p`.

- Lessons: none.
