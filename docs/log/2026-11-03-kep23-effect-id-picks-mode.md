# Effect id picks the mode, both inputs kept, missing ones auto-picked

Id: kep23-effect-id-picks-mode

`Aurora-kep2.3`: a switch no longer blanks `activeInputName`, so a video or
mixed custom effect runs after Music pulse.

- `runsAudioMode()` (ConfigApply) reads the effect id: `builtin.audio` is audio,
  `builtin.video` is video. An unset id or a custom graph with no capture nodes
  keeps the old rule (audio when no video input is named). `_planMode`,
  `Pipeline::build` and `planConfigChange` share it.
- `planConfigChange` reloads on `builtin.video` to `builtin.audio`. Before, the
  blanked input name carried the mode change.
- `Pipeline::build` auto-picks a missing input of a kind the effect needs, so MCP
  `set_effect` gets it too. A registered backend name (`linux`, `windows`,
  `mac`, else the first non-dummy), never `dummy`. Saved only where the field is
  still empty, and not for a try-on-lights graph. No real backend fails the build.
- `ConfigStore::load` names `builtin.audio` on a legacy audio config (empty id,
  blank video name, audio name set).
- Web: `modeSwitchPatch('audio')` keeps the video name, `modeFromConfig` reads
  the effect id first. Demo shim, graph and tuning use `modeFromConfig`.
  `vendor/webui` resynced.
- Kept: `Pipeline::build` still returns idle when both names are empty. The
  onboarding screen saves a name on landing, and auto-picking there would start
  lights before the user confirms a source. An MCP effect set before then is
  saved and runs after onboarding.
- Tests: two old "missing input fails" tests now use a registry with no audio
  backend. New ones cover mode by effect id, auto-pick both ways, dummy, the
  mode-change reload and the migration. Core 476/476, web/ui and demo pass.
- Not checked: a live app run, and the Mac first-pick permission prompt.

- Lessons: none.
