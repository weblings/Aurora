# Empty graph as a Start from option

Id: kep216-empty-start

`Aurora-kep2.16`, under `Aurora-kep2`.

## State

- `startPoints` puts an Empty entry first, so the Start from menu always opens.
  `editorHref('empty')` is `/graph-editor/?new=empty`.
- The editor maps `?new=empty` to the sentinel id `@empty` (not a valid effect id)
  and opens a local blank document with no server fetch. It counts as a built-in,
  so Save asks for a name and writes a fresh effect, then the URL becomes `?effect=<id>`.
- A node-less graph is allowed in the editor. The server rejects it on save
  until it is valid, which the editor reports as "Fix the N problems".
- Checked by unit tests only, not in a running app.
- Lessons: none.
