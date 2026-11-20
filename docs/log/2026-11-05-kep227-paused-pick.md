# A pick while paused says it starts on resume

Id: kep227-paused-pick

`Aurora-kep2.27`: a pick while paused saves but only builds on resume, so the
panel closed with no visible change (read as a failed tap on an iPhone).

- Fix: a saved, unbuilt pick while paused shows and announces "X starts when you
  resume" under the trigger. It clears on resume or the next pick
  (`DashboardScreen.js`, `EffectPanel.js`, `resumeLine` in `EffectPanelModel.js`).
- Test: `resumeLine` wording in `EffectPanelModel.test.mjs`. The flow itself was
  not run in the app. Demo vendor copy re-synced.

- Lessons: none.
