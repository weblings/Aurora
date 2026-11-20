# Audio recipes retuned for real loudness and smoothed

Id: ppqo-audio-recipes-tuned

`Aurora-ppqo`, from owner feedback on the pasted audio recipes: dull next to Candles and Complementary colors, unclear what was happening, and the audio-over-screen mix barely swung.

## What shipped
- **Bands as RGB**: three `frame.brightnessScale` boosts (4, 4, 2) after the final mix, color values 0.3, 0.6 and 1 to balance the bands, `frame.smoothTime` at 0.18 s, and a Color smoothing control.
- **Loudness switch**: `smooth.exp` at 0.4 s on rms, edge 0.05, hysteresis 0.008, `frame.smoothTime` at 0.15 s, quiet look at full saturation and value 0.6.
- **VU meter**: `smooth.exp` at 0.5 s, rms range 0.01 to 0.11, softness 0.3, a "Loudness for a full bar" control, lit color at full saturation.
- **Audio over screen**: `normal` mix instead of `screen`, `math.mapRange` (0.01 to 0.11 into 0.1 to 0.9) for the mix amount, `smooth.exp` at 0.3 s, `frame.smoothTime` at 0.15 s, bounce `referenceRms` 0.1 and `brightnessFloor` 0.6, a "Loudness for full audio color" control.
- **Beat-stepped chase**: unchanged.
- **MCP server instructions** (`adapters/mcp/src/McpServer.cpp`): three sentences on small audio levels, measuring them, and smoothing. Not built or run.

## Findings
- Audio levels are small. On the owner's music rms sat at 0.02 to 0.11 (mean 0.05) and the bands at bass 0.04, mid 0.03, treble 0.008 (peaks about 0.1, 0.05, 0.025). The recipes fed these straight into brightness, mix amount and thresholds, so they came out near black and never swung. The built-in audio graph hides this behind `referenceRms` 0.5 and a 0.4 brightness floor.
- Raw rms and band levels jump every tick, so each recipe strobed on the lights until smoothed. Smooth the Float (`smooth.exp`) before it drives a bar or threshold, and the frame (`frame.smoothTime`) at the end.
- The owner's loudness sits near 0.04 to 0.055 once smoothed, so the switch edge is tuned to this music and volume. Other setups will need the Loudness threshold control.
- Per-band `math.mapRange` nodes made the bands diagram 474 px wide in the turned outline (limit 340), because each band's color chain adds a skipping wire. Boosts after the mix keep it narrow. The new `calm` and `strength` nodes sit first in audio-over-screen's node list because node order decided 340 against 344.
- `try_on_lights` on a real app only previews colors that change, so `preview` on real lights is patchy.

## Verification
- `npx vitest run src/recipes` passes (44 tests).
- Each of the five recipes was run on the owner's real lights and accepted, after the smoothing changes above. Preview samples of the first retune were taken on the fake-lights stack with the owner's audio.

## Lessons
- none
