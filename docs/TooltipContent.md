# Tooltip content draft (Aurora WebUI)

Status: draft for review. Not yet wired -- every tooltip still serves the
literal `Test` until this copy is approved, then each line replaces the
`Test` in its module's descriptor table (no plumbing changes needed).

Framing rule: each tooltip says what the control means for the visible
color output. Generic "color output" phrasing for video/audio pipeline
controls (not lights); Hue-tied controls may name bridge/area specifics.
Cap: 6 words max per tooltip. Counts verified in parentheses.

## Video pipeline

- `video.refreshRate`: "Color updates per second" (4)
- `video.subsampleWidth`: "Captured image detail level" (4)
- `video.interpolation`: "How sampled colors blend" (4)
- `video.transitionSmoothing`: "Easing between color changes" (4)

## Audio pipeline

- `audio.bounceSmoothTime`: "Bounce reaction speed" (3)
- `audio.brightnessSmoothTime`: "Brightness reaction speed" (3)
- `audio.driftBaseRateDegPerSec`: "Idle color drift speed" (4)
- `audio.vibrancySaturation`: "Color saturation level" (3)
- `audio.vibrancyValue`: "Maximum color brightness" (3)
- `audio.fixedHueEnabled`: "Drift starts at chosen hue" (5)
- `audio.fixedAnchorHue`: "Drift's starting hue" (3)
- `audio.dynamismFloor`: "Bounce on quiet sounds" (4)
- `audio.centroidStrength`: "Pitch influence on drift" (4)
- `audio.referenceRms`: "Loudness for full brightness" (4)
- `audio.brightnessFloor`: "Darkest output when quiet" (4)
- `audio.centroidRangeHz`: "Pitch span affecting drift" (4)

## Zones

- `zones.gamma`: "Zone brightness curve" (3)
- `zones.select`: "Zone to edit" (3)
- `zones.active`: "Include zone in output" (4)
- `zones.autoArrange`: "Automatically arrange zone layout" (4)

## App

- `app.mode`: "Video or audio reactive mode" (5)

## Hue output

- `output.hue.bridgeAddress`: "Bridge network address" (3)
- `output.hue.autodetect`: "Find bridge automatically" (3)
- `output.hue.changeBridge`: "Switch to another bridge" (4)
- `output.hue.entertainmentConfig`: "Entertainment area to use" (4)

## Input

- `input.monitor`: "Which display to capture" (4)
- `input.sink`: "Audio source to react to" (5)

26 keys plus `zones.select` (zone picker, added after the first live
pass showed it undescribed) -- matches the live `/api/descriptors`
payload count.
