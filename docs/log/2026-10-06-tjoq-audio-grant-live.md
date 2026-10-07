# Aurora-tjoq: audio permission block copy vs. live grant

Id: tjoq-audio-grant-live

2026-10-06. Follow-up from [[cj11-shell-banner]] ([[error-overlay]]): the
Screen Recording banner row became Retry-only because a grant applies live,
while `renderAudioPermissionBanner` still said to quit and reopen.

## Mac check (macOS 27.0.1, `open`-launched ad-hoc Aurora.app)

1. `tccutil reset AudioCapture com.aurora.app` -> success (an entry existed).
2. Relaunched in Audio mode: `/api/mac/audio-status` `{"permissionLikelyDenied":true}`,
   `/api/state` running, no errors (no host error, so nothing for Retry to resend).
3. Granted Aurora under System Audio Recording Only without quitting; with
   nothing playing the flag stayed `true` for 25s (it only clears on a non-zero
   sample, `MacAudioGrabber::isLikelyPermissionDenied`).
4. Played audio: same pid, flag `false` on the first poll and for 30s after.

Answer: **a System Audio Recording grant applies live.** The flip itself was
not observed (first poll after starting audio already read `false`), and the
denied-with-audio-playing control was not run.

## Done

- `renderAudioPermissionBanner` copy: turn it on, play audio, the block clears
  by itself (the Dashboard polls the route); quit+reopen only if it doesn't.
  Settings link kept. No Retry/re-probe added: nothing to resend.
- New `web/ui/MacPermissionRecovery.test.mjs`; `shell.test.mjs` still green.
- Lesson appended to docs/lessons/input.md (the cj11 preflight entry).

## Lessons

- debugging-method.md: a denied flag inferred from silence needs a signal
  playing for the baseline and the after-reading (the 25s silent wait was
  inconclusive); run the denied-with-signal control.
- input.md: audio-tap grant applies live (extends the cj11 preflight entry).

## Not done

- Nothing committed.
- Vendored demo copy untouched (precedent: ewyz/cj11).
