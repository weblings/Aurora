# trigger.envelope node

Id: q66y-trigger-envelope

`Aurora-q66y`. `trigger.envelope` is a stateful Trigger to Float node in `TimeNodes.cpp`. A trigger rises to the peak over `attack`, holds it for `hold`, then falls linearly to 0 over `decay`. A wired `amount` sets the peak, else the `amount` param does. The firing tick is time 0 and later ticks add the tick dt, so timings do not depend on tick rate and attack 0 shows the peak on the firing tick. A retrigger rises from the current level, and a peak below that level holds the level instead of jumping down. The three times clamp to 0..60 at load, which is right because 0 is a valid instant. A negative wired `amount` fails the node at evaluate like `math.clamp`, because the loader clamps the param to its min. It replaces the `trigger.flash` and gate or hold entries in [[node-graph-pipeline]], noted in [[node-conversion-gaps]]. Catalog sample and `validate-errors.json` regenerated with `GenServerSamples`.

## Verification
- Seven `trigger.envelope` Catch2 cases plus a beat flash graph case (real audio.capture and audio.features onset into trigger.envelope into frame.brightnessScale.factor) by exact name, full `ctest -j8 -C Release`.
- Found by the agent: the real onset also fires on the first hops at startup and about two ticks after a click.
- Fake lights (dummy video, loopback audio, click track): all four zones pulsed 0 to 1 and `reacting` was true over a 3 s preview (coordinator, rebuilt `windows-app`). A 6 s preview dropped the MCP connection twice while the app stayed up, 3 s worked.
- PENDING: the WASM demo preview, which can only be checked on the next CI WASM build.

## Lessons
- none
