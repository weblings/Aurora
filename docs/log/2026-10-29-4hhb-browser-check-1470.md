# Browser checks rerun at laptop width

Id: 4hhb-browser-check-1470

`Aurora-4hhb`: follow-up to [[fzzr-laptop-width-fit]], which did not rerun the
edit-loop and add-node checks after the layout change.

- Those two checks and save-as-new ran at 1500 px (not 2200); all three now use
  1470 px like the gate. The edit loop's 700 px dashboard page is unchanged.
- Edit-loop, add-node and save-as-new exit 0 on the dev server and the embedded
  editor.
- Surprise: embedded save-as-new timed out until `build/mac-app` was rebuilt;
  the app build predated the Aurora-lut9 distinct-title fix. It failed the same
  way at 1500 px, so it was a stale build, not the viewport. Rebuild before an
  embedded run after editor changes.

- Lessons: none.
