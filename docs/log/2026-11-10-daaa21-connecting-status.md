# Graph editor: status spot reads Connecting before the first draft

Id: daaa21-connecting-status

`Aurora-daaa.21`, split from [[daaa19-name-dialog]]. Before the first draft was accepted the status spot said "No draft yet", which read as an error for the first moment after the editor opened.

## State

- `loop.ts`: `summarize` returns "Connecting" for a closed stream with no draft yet; "Preview off" is unchanged once a draft exists.
- `loop.test.ts`, `status.test.ts` and the Graph editor cleanup plan doc match.

## Verification

- `tsc --noEmit` clean; vitest 114 passed.
- Not run here: a browser check of the first moment after the editor opens.

## Lessons

- Lessons: none.
