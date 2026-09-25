# TCC-identity probe resolved: Aurora.app bundle wrapper unblocks the Mac track

Closed `Aurora-8mk.4` (TCC-identity probe) and its follow-on
`Aurora-8mk.11` (minimal `.app` bundle wrapper), both `1.0.3`/
`MacVideoTerminal`. `8mk.4` had stopped mid-session previously, blocked
twice by the auto-mode permission classifier on TCC.db/System-Settings-
adjacent actions — resumed here with the user present, compiling and
running the probe by hand.

Built a throwaway Mach-O calling `SCShareableContent` two ways: bare, and
with an embedded `Info.plist`/`CFBundleIdentifier` via `-sectcreate __TEXT
__info_plist`. Both, run directly from Terminal, attributed the Screen
Recording grant to Terminal itself in System Settings, not the probe --
confirming the risk `docs/MacSupport.md` had flagged but not yet tested.
Scope call (user-confirmed after establishing bundling needs no Xcode/paid
Apple Developer account, just a free local `codesign`): pull a minimal
`.app` bundle forward into tier 1 rather than accept Terminal-attribution,
filed as `Aurora-8mk.11`.

Wrapped the same probe binary as a real bundle
(`tcc-probe-app.app/Contents/{Info.plist,MacOS/tcc-probe-app}`),
ad-hoc-signed, launched via `open` -- confirmed by the user in System
Settings: `tcc-probe-app` now lists as its own entry, not Terminal. Ported
the fix into the real target: `app/mac/CMakeLists.txt`'s `aurora-app-mac`
is now `add_executable(... MACOSX_BUNDLE ...)`, producing
`bin/Aurora.app/Contents/MacOS/Aurora` + a generated `Info.plist`
(`app/mac/Info.plist.in`, `CFBundleIdentifier com.aurora.app`), ad-hoc
signed post-build. Verified end to end: built, launched via `open`, hit
`/api/capabilities` over the real REST port and got `platform: "mac"`
back.

Picked up a bundle icon for free while here: `app/mac/make_icns.sh` builds
`Aurora.icns` from the multi-resolution icon set already shipped for the
Linux tray icon (`app/linux/icons/hicolor/*/apps/aurora.png`, same "A"
logo) rather than a fresh asset or a single upsampled PNG -- only the two
largest `.iconset` slots (512/1024) are upsampled from the 256px source,
the rest reuse the pre-rendered sizes directly. Wired via CMake's
`MACOSX_PACKAGE_LOCATION "Resources"` mechanism.

Surprise: once `Aurora.app` held its own TCC identity, a second prompt
appeared on launch -- "Aurora wants to access your Documents folder" --
unrelated to Screen Recording. Cause: this repo checkout lives under
`~/Documents/Coding/Aurora/Aurora`, and the dev-mode WebUI fallback
(`AURORA_WEBUI_SOURCE_DIR`) is baked to a path inside it, so serving
static files from the repo counts as touching Documents. Not a product
bug -- a real install won't live under Documents -- but worth knowing before
chasing it as a capture-permission issue. Two lessons filed in
`docs/lessons/input.md` (bundle-vs-embedded-plist attribution;
protected-folder gating once an app has its own identity), one in
`docs/lessons/build-toolchain.md` (CMake bundle-wiring ordering:
Info.plist variables before `configure_file()`, generated Resources need
`MACOSX_PACKAGE_LOCATION` + a real custom-command `OUTPUT`, not
`POST_BUILD`).

State: `Aurora-8mk.4`/`.11` closed. `Aurora-8mk.5` (ScreenCaptureKit
grabber, single display) is now the epic's ready item -- the real capture
implementation, which also unblocks `Aurora-gj0.8` (Mac validation of the
light-viz pipeline) once it lands.
