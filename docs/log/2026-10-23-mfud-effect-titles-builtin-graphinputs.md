# Mfud + 5ipy.26: effect titles and descriptions, graphInputs for built-ins (Aurora-mfud, Aurora-5ipy.26)

Id: mfud-effect-titles-builtin-graphinputs

Closed 2026-10-23. Plan A6 in [[api-v1-plan]], both before the v1 freeze. The dropdown that shows the text is
Aurora-kep2 (still open), so the "dropdown shows title with description" criterion moves there.

## Shipped

- Graph schema: optional top-level `title` (1 to 60 bytes), `description` (1 to 280 bytes) and `minorVersion`
  (integer >= 0, any value accepted, `version` stays 1). Bad values are `title_invalid`, `description_invalid`,
  `minor_version_invalid` issues. Limits are `kMaxTitleLength` / `kMaxDescriptionLength` in `GraphLoader.hpp`.
- Persistence needed no change: draft, apply and keep store the whole document. `get_preset` graphs now carry
  `minorVersion: 1` plus the preset's title and description, and the MCP `put_draft` and server text ask agents
  to set them.
- `effectInfo(configRoot, id)` (`EffectStore.hpp`): built-ins have fixed text ("Screen colors", "Music pulse"),
  customs read the file, title falls back to the id, description to empty.
- `GET /api/effects` entries gain `title` (always a string) and `description` (string or null). `GET /api/state`
  gains `effectTitle` and `effectDescription` for the running effect (null when idle).
- `graphInputs` is filled for built-ins from the pipeline mode (video, audio, or dual capture), set at build and
  when a test reverts, so it is null only when no pipeline runs. The WebUI rule is unchanged: it already prefers
  `graphInputs` in MCP mode.
- Demo shim mirrors both: built-in `graphInputs`, `effectTitle`/`effectDescription`, built-ins in `/api/effects`.

## Verification

- Core suite 438/438, MCP adapter 29/29, `DashboardScreen` and `demo-shim` web tests pass. New cases cover the
  schema limits, the effects list text, state text and built-in `graphInputs` (running, reverted test).
- Not run live: no UI consumes the new fields yet.

## Findings

- A `title` over the limit is refused at the draft, so an agent sees the error from `put_draft` rather than at apply.

Lessons: none
