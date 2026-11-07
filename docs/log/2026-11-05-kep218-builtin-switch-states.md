# Built-in picks use the panel's switch states

Id: kep218-builtin-switch-states

`Aurora-kep2.18`, under `Aurora-kep2`.

## State

- `_onEffectPicked` passes the built-in's effect id to `_switchMode`. The mode
  patch still sends, so a built-in lands on the device shown.
- The pending line, the success announcement and the rejected line all take the
  effect title, for example "Switching to Screen colors" and "Music pulse didn't
  start.". "Couldn't switch to Video/Audio." is gone.
- `.db-controls` and its CSS rule are removed. Only the old Video/Audio error
  wrote to it, so nothing renders there now.
- Checked by unit tests only, not in a running app.
- Lessons: none.
