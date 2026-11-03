# kep2 effect panel mocks

Static mocks for `Aurora-kep2.2`. Open `index.html` to see every frame.

The frames load the real `../styles` and `../icons`, so serve from `web/ui`, not this
folder: `python -m http.server 3001` there, then open `/Static_kep2_Mocks/index.html`.
Opening the files directly (`file://`) also works.

- `gen.py` writes every `frame*.html` and `index.html`. Edit it, not the HTML.
  `mock.css`, `frame8.js` and `frame9.js` (the working keyboard models for
  frames 8 and 9) are hand-written. Run `python gen.py` and check that `git diff`
  shows only the change you meant.
- `render.mjs <out_dir>` screenshots the index and each frame at 390 px.
- `measure.mjs <frame.html> <selector>...` prints computed type, color and
  box metrics so elements can be aligned by numbers.
- Both `.mjs` helpers use `tools/browser-check` (`npm install` there first).
