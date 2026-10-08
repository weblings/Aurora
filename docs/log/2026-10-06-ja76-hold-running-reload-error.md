# Aurora-ja76: hold a failed reload on a running host (closed)

Id: ja76-hold-running-reload-error

2026-10-06. Core half of [[error-overlay]]'s shell-by-cause revision
(decisions 10-12, 15). Unblocks Aurora-98pr (WebUI) and Aurora-h457 (Mac
audio row). Core suite and CI green on Mac, Linux and Windows.

## Done

- `PipelineHost` holds a `reload` error while a pipeline runs; `state` stays
  `running`, so clients read `state`, never "errors non-empty", for failed.
  Reload while paused holds nothing; `pause()` and any successful build clear
  everything.
- `HostError.id`: host-wide counter, stamped when an entry is created or
  replaced (an identical repeat failure gets a new id), never restamped by an
  unrelated publish. `setError`/`removeError` merge by source (h457's
  `audio_permission` needs them; `setError` only while running).
- Stale-failure guard: `m_buildEpoch`, bumped on each successful reload or
  resume swap; a failing reload records it before its build and stores only
  if unchanged. The d3ec late-failure test is the mutant check, unchanged.
- `POST /api/state/dismiss {source, id}` in `registerStateRoute` (shared, not
  per app): 200 `dismissed:true`, 200 `dismissed:false` for a stale id, 409
  `not_running` when paused/failed/idle, 400 bad body. `GET /api/state`
  carries each error's `id`.
- Lesson "A failed reload on a running host..." rewritten for the new rule.

## Found while building

- Plain merge-by-source held `startup` and `reload` together after a failed
  retry of a failed startup (two rows, one cause). A build failure
  (`startup`/`resume`/`reload`) now supersedes earlier build entries; other
  sources merge. Recorded as ErrorOverlay decision 15.
- A mutant that held errors while paused survived until a test landed a pause
  inside a failing build (a paused `reload()` returns before building, so
  that guard is only reachable that way).
- A restored source file with a newer mtime than its object was not rebuilt
  after a mutant run, so a stale binary failed a correct test; touch before
  rebuilding when swapping files back.

## Verified

- Mutants each fail a test: no epoch guard, dismiss ignoring id, dismiss
  allowed while paused, hold while paused, entry not getting a new id.
- Live on Mac (isolated config dir, fake bridge, `dummy` input; not devstack,
  whose `find_webui` takes the first server from 8215 and would have
  reconfigured a running real instance): bogus `activeInputName` +
  `POST /api/reload` -> `running` with one `reload` error and an id; stale
  dismiss 200 `false`, matching dismiss clears it, dismiss on a paused host
  after a failed resume 409; fixing the input and resuming clears all.
- Rebuilding `Aurora.app` in place while a copy ran from it ended that
  process (ad-hoc re-sign); do not rebuild a bundle someone is running.

## Not done

- Aurora-98pr (banner X, inline copies removed), Aurora-h457 (grabber
  publisher on the Mac main loop, edge-detected), Aurora-k73j (must key on
  state, not errors).
