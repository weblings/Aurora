cmake_minimum_required(VERSION 3.14)

project(AuroraAppMac)

option(AURORA_APP_BUILD_TESTS "Build this app's own tests" TRUE)
# Which plugin repos this particular app binary is compiled with -- the
# compile-time half of the two-level plugin-selection design; the run-time
# half is Config's activeInputName/activeOutputNames, looked up in the
# Registry these build. No audio toggle yet -- Mac tier 1 has no audio
# input at all (docs/MacSupport.md, "Deferred: audio").
option(AURORA_APP_ENABLE_MAC_INPUT "Link in input/mac" TRUE)
option(AURORA_APP_ENABLE_HUE_OUTPUT "Link in output/hue" TRUE)

include(FetchContent)

# Aurora core -- needed directly (Config/Orchestrator/Contracts) regardless
# of which plugins below are enabled, not just transitively through them.
# No audio pipeline -- Mac tier 1 has no audio input to drive it.
set(BUILD_TESTS FALSE CACHE BOOL "" FORCE)
set(AURORA_CORE_ENABLE_AUDIO FALSE CACHE BOOL "" FORCE)
FetchContent_Declare(
  AuroraCore
  SOURCE_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../../core
)
FetchContent_MakeAvailable(AuroraCore)

# web/ui -- the one shared static frontend every app serves identically via
# HttpServer::serveStaticFiles(). Unconditional, unlike the plugin blocks
# below -- this is the product's one control surface, not a swappable/
# optional dependency. Has no CMakeLists.txt of its own (plain static
# files).
FetchContent_Declare(
  AuroraWebUI
  SOURCE_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../../web/ui
)
FetchContent_MakeAvailable(AuroraWebUI)

# NOT TARGET guard: the root superbuild may have added this dir already;
# FetchContent dedups by name but NOT against a manual add_subdirectory.
if(AURORA_APP_ENABLE_MAC_INPUT AND NOT TARGET AuroraInputMac)
  set(AURORA_INPUT_MAC_BUILD_TESTS FALSE CACHE BOOL "" FORCE)
  FetchContent_Declare(
    AuroraInputMac
    SOURCE_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../../input/mac
  )
  FetchContent_MakeAvailable(AuroraInputMac)
endif()

# NOT TARGET guard: the root superbuild may have added this dir already;
# FetchContent dedups by name but NOT against a manual add_subdirectory.
if(AURORA_APP_ENABLE_HUE_OUTPUT AND NOT TARGET AuroraOutputHue)
  set(AURORA_OUTPUT_HUE_BUILD_TESTS FALSE CACHE BOOL "" FORCE)
  FetchContent_Declare(
    AuroraOutputHue
    SOURCE_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../../output/hue
  )
  FetchContent_MakeAvailable(AuroraOutputHue)
endif()

# Registry as its own library (not folded into the executable) so tests can
# link it without pulling in main()'s own main() symbol. No TrayIcon.cpp
# here, unlike app/linux -- see "Tray-parity" in docs/MacSupport.md for
# what a later tier adds (a .app bundle + NSStatusItem, needing AppKit).
add_library(AuroraApp STATIC
  src/Registry.cpp
  src/InstanceLock.cpp
)

target_include_directories(AuroraApp PUBLIC
  ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_link_libraries(AuroraApp PUBLIC
  AuroraInputInterface
  AuroraOutputInterface
)

target_compile_features(AuroraApp PUBLIC cxx_std_20)

# Embedded webroot: generated from the fetched web/ui checkout above. The
# binary serves it only as the last probe-order fallback (env override >
# baked source dir > embedded), so dev hot-edit keeps working; a moved
# tree without the checkout still serves full UI.
include("${auroracore_SOURCE_DIR}/Network/cmake/EmbedWebroot.cmake")
set(_AURORA_EMBEDDED_WEBROOT_HEADER "${CMAKE_CURRENT_BINARY_DIR}/EmbeddedWebRoot.hpp")
aurora_embed_webroot("${_AURORA_EMBEDDED_WEBROOT_HEADER}" "${aurorawebui_SOURCE_DIR}")

# Version single truth is the superbuild project() above; a standalone
# slice configure is dev-only and reports "dev". Determined here (ahead of
# the bundle Info.plist below) rather than down by target_compile_definitions
# since the bundle's CFBundleVersion/CFBundleShortVersionString need it too.
if(DEFINED AuroraMonorepo_VERSION)
  set(_AURORA_VERSION "${AuroraMonorepo_VERSION}")
else()
  set(_AURORA_VERSION "dev")
endif()

# Minimal .app bundle Info.plist (Aurora-8mk.11) -- just enough bundle
# identity (CFBundleIdentifier) for a `open`/double-click launch to hold its
# own TCC grant; no LSUIElement/tray keys yet, see docs/MacSupport.md.
configure_file(
  "${CMAKE_CURRENT_SOURCE_DIR}/Info.plist.in"
  "${CMAKE_CURRENT_BINARY_DIR}/Info.plist"
  @ONLY
)

# Bundle icon: built from the multi-resolution icon set already shipped for
# the Linux tray icon (app/linux/icons/hicolor/*/apps/aurora.png, same "A"
# logo), not a fresh asset -- see make_icns.sh for the size mapping/why.
set(_AURORA_ICNS_SRC_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../linux/icons/hicolor")
set(_AURORA_ICNS_OUT "${CMAKE_CURRENT_BINARY_DIR}/Aurora.icns")
add_custom_command(
  OUTPUT "${_AURORA_ICNS_OUT}"
  COMMAND /bin/sh "${CMAKE_CURRENT_SOURCE_DIR}/make_icns.sh"
          "${_AURORA_ICNS_SRC_DIR}" "${_AURORA_ICNS_OUT}" "${CMAKE_CURRENT_BINARY_DIR}"
  DEPENDS
    "${CMAKE_CURRENT_SOURCE_DIR}/make_icns.sh"
    "${_AURORA_ICNS_SRC_DIR}/16x16/apps/aurora.png"
    "${_AURORA_ICNS_SRC_DIR}/32x32/apps/aurora.png"
    "${_AURORA_ICNS_SRC_DIR}/64x64/apps/aurora.png"
    "${_AURORA_ICNS_SRC_DIR}/128x128/apps/aurora.png"
    "${_AURORA_ICNS_SRC_DIR}/256x256/apps/aurora.png"
  COMMENT "Building Aurora.icns from the Linux tray icon set"
  VERBATIM
)
set_source_files_properties("${_AURORA_ICNS_OUT}" PROPERTIES MACOSX_PACKAGE_LOCATION "Resources")

add_executable(aurora-app-mac MACOSX_BUNDLE
  src/main.cpp
  "${_AURORA_EMBEDDED_WEBROOT_HEADER}"
  "${_AURORA_ICNS_OUT}"
)

# Product binary is Aurora; build-tree output goes to bin/ directly under
# the build root instead of app/<slice>/[...] -- matches Linux/Windows.
# MACOSX_BUNDLE wraps it as bin/Aurora.app/Contents/MacOS/Aurora rather than
# a bare bin/Aurora -- required so a launch via `open`/double-click goes
# through LaunchServices and Aurora itself (not Terminal) holds the Screen
# Recording TCC grant (Aurora-8mk.4's probe confirmed a bare binary, even
# with an embedded Info.plist section, still attributes to Terminal when
# exec'd directly -- see docs/MacSupport.md "Load-bearing risk"). Direct
# invocation of the inner binary (build/mac-app/bin/Aurora.app/Contents/
# MacOS/Aurora) still works unchanged for scripted/CI use, it just won't
# hold its own grant that way.
set_target_properties(aurora-app-mac PROPERTIES
  OUTPUT_NAME "Aurora"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin"
  MACOSX_BUNDLE_INFO_PLIST "${CMAKE_CURRENT_BINARY_DIR}/Info.plist"
)

find_package(Threads REQUIRED)

target_link_libraries(aurora-app-mac PRIVATE
  AuroraApp
  AuroraRuntime
  AuroraNetwork
  Threads::Threads
)

if(AURORA_APP_ENABLE_MAC_INPUT)
  target_link_libraries(aurora-app-mac PRIVATE AuroraInputMac)
endif()

if(AURORA_APP_ENABLE_HUE_OUTPUT)
  target_link_libraries(aurora-app-mac PRIVATE AuroraOutputHue)
endif()

# AURORA_WEBUI_SOURCE_DIR: the fetched sibling checkout's absolute path,
# baked in at configure time -- a dev-stage placeholder, matching Linux/
# Windows (a real install/distribution story is deferred; see
# "Tray-parity"/Gatekeeper notes in docs/MacSupport.md). _AURORA_VERSION set
# above, ahead of the bundle Info.plist.
target_compile_definitions(aurora-app-mac PRIVATE
  AURORA_WEBUI_SOURCE_DIR="${aurorawebui_SOURCE_DIR}"
  AURORA_VERSION="${_AURORA_VERSION}"
)

target_include_directories(aurora-app-mac PRIVATE
  ${CMAKE_CURRENT_BINARY_DIR}
)

# Ad-hoc codesign (free, local, no Apple Developer account) -- required for
# a bundle to run at all under Gatekeeper's baseline check, and for its TCC
# identity to stay stable across rebuilds instead of re-prompting each time
# (an unsigned/differently-signed bundle looks like a new app to TCC). Real
# Developer ID signing + notarization is Aurora-8mk.10, still deferred --
# this only covers "runs locally, holds a TCC grant reliably," not
# distribution to a second machine.
add_custom_command(TARGET aurora-app-mac POST_BUILD
  COMMAND codesign --force --deep --sign - "$<TARGET_BUNDLE_DIR:aurora-app-mac>"
  COMMENT "Ad-hoc signing Aurora.app"
  VERBATIM
)

# No install()/packaging rules yet, unlike app/linux -- no LSUIElement,
# NSStatusItem, or SMAppService (tray-parity tier). This tier is "build it,
# launch build/bin/Aurora.app via `open`" -- see docs/MacSupport.md's
# build-sequencing (Phase 3b).

target_compile_features(aurora-app-mac PRIVATE cxx_std_20)

if(AURORA_APP_BUILD_TESTS)
  enable_testing()
  add_subdirectory(tests)
endif()
