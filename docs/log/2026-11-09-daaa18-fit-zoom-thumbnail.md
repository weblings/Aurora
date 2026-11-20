# Graph editor: fit view keeps a readable zoom, thumbnail hidden until a frame arrives

Id: daaa18-fit-zoom-thumbnail

`Aurora-daaa.18`. `builtin.audio` opened at 37% with unreadable node text, and with the preview paused the top-right thumbnail was an empty dark box ([[daaa13-embedded-run]]).

## State

- `FIT_OPTIONS` (`minZoom: 0.6`, `maxZoom: 1`) in `ViewMenu.tsx` is used for the initial fit (`fitViewOptions` in `App.tsx`) and for View > Fit view. A long chain overflows the canvas and is panned. React Flow centres the fit, so the chain's ends may start off-screen.
- `ZoneThumbnail.tsx` hides the canvas until the first preview frame arrives. A "Preview paused" label was not added.

## Verification

- `tsc --noEmit` clean; vitest 114 passed.
- Not run: the browser or embedded build at 1470x900, so the 60% result on `builtin.audio` is unseen.

## Lessons

- Lessons: none.
