cmake_minimum_required(VERSION 3.14)

project(AuroraAppMac)

# TrayIcon.mm (Aurora-qps.2) is Objective-C++.
enable_language(OBJCXX)

option(AURORA_APP_BUILD_TESTS "Build this app's own tests" TRUE)
# Which plugin repos this particular app binary is compiled with -- the
# compile-time half of the two-level plugin-selection design; the run-time
# half is Config's activeInputName/activeOutputNames, looked up in the
# Registry these build.
option(AURORA_APP_ENABLE_MAC_INPUT "Link in input/mac" TRUE)
option(AURORA_APP_ENABLE_HUE_OUTPUT "Link in output/hue" TRUE)
# Drives both AURORA_CORE_ENABLE_AUDIO and AURORA_INPUT_MAC_ENABLE_AUDIO
# below -- Core fetches before input/mac does, so Core's own
# add_subdirectory(AudioProcessing) decision must be set here, not left for
# input/mac's own (later) default to decide. Mirrors
# AURORA_APP_ENABLE_LINUX_AUDIO_INPUT (app/linux/CMakeLists.txt).
option(AURORA_APP_ENABLE_MAC_AUDIO_INPUT "Link in input/mac audio capture (Core Audio process taps)" TRUE)

include(FetchContent)

# Aurora core -- needed directly (Config/Orchestrator/Contracts) regardless
# of which plugins below are enabled, not just transitively through them.
set(BUILD_TESTS FALSE CACHE BOOL "" FORCE)
set(AURORA_CORE_ENABLE_AUDIO ${AURORA_APP_ENABLE_MAC_AUDIO_INPUT} CACHE BOOL "" FORCE)
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
  set(AURORA_INPUT_MAC_ENABLE_AUDIO ${AURORA_APP_ENABLE_MAC_AUDIO_INPUT} CACHE BOOL "" FORCE)
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

# App-side pieces as their own library (not folded into the executable) so tests can
# link them without pulling in main()'s own main() symbol (Registry lives in
# core/Runtime). TrayIcon.mm
# (Aurora-qps.2) matches app/linux's TrayIcon.cpp living here too.
add_library(AuroraApp STATIC
  src/InstanceLock.cpp
  src/LocalNetworkProbe.cpp
  src/LocalNetworkProbe.mm
  src/TrayClick.cpp
  src/TrayIcon.mm
)

target_include_directories(AuroraApp PUBLIC
  ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_link_libraries(AuroraApp PUBLIC
  AuroraInputInterface
  AuroraOutputInterface
  AuroraRuntime
)

find_library(FRAMEWORK_APPKIT AppKit REQUIRED)
find_library(FRAMEWORK_NETWORK Network REQUIRED)
target_link_libraries(AuroraApp PUBLIC ${FRAMEWORK_APPKIT} ${FRAMEWORK_NETWORK})

# ARC (retain/release for the AppKit object pointers held inside
# TrayIcon::Impl, a plain C++ struct -- ARC manages those the same as any
# other __strong Objective-C pointer member). Same precedent as
# ScreenCaptureKitGrabber.mm.
set_source_files_properties(src/TrayIcon.mm src/LocalNetworkProbe.mm PROPERTIES
  COMPILE_FLAGS "-fobjc-arc"
)

target_compile_features(AuroraApp PUBLIC cxx_std_20)

# Embedded webroot: generated from the fetched web/ui checkout above. The
# binary serves it only as the last probe-order fallback (env override >
# baked source dir > embedded), so dev hot-edit keeps working; a moved
# tree without the checkout still serves full UI.
include("${auroracore_SOURCE_DIR}/Network/cmake/EmbedWebroot.cmake")
set(_AURORA_EMBEDDED_WEBROOT_HEADER "${CMAKE_CURRENT_BINARY_DIR}/EmbeddedWebRoot.hpp")
aurora_embed_webroot("${_AURORA_EMBEDDED_WEBROOT_HEADER}" "${aurorawebui_SOURCE_DIR}")

# Graph editor (Aurora-lzj): opt-in (AURORA_ENABLE_GRAPH_EDITOR, OFF by
# default), so a default build needs no Node. When ON, the Vite bundle is
# built by npm and embedded as Aurora::GraphEditorWebRoot::files, served
# under /graph-editor/ in dev and standalone runs alike.
include("${CMAKE_CURRENT_SOURCE_DIR}/../../web/graph-editor/cmake/GraphEditor.cmake")
set(_AURORA_GRAPH_EDITOR_HEADER "")
if(AURORA_ENABLE_GRAPH_EDITOR)
  set(_AURORA_GRAPH_EDITOR_HEADER "${CMAKE_CURRENT_BINARY_DIR}/GraphEditorWebRoot.hpp")
  aurora_graph_editor_embed("${_AURORA_GRAPH_EDITOR_HEADER}")
endif()

# Version single truth is the superbuild project() above; a standalone
# slice configure is dev-only and reports "dev". Determined here (ahead of
# the bundle Info.plist below) rather than down by target_compile_definitions
# since the bundle's CFBundleVersion/CFBundleShortVersionString need it too.
if(DEFINED AuroraMonorepo_VERSION)
  set(_AURORA_VERSION "${AuroraMonorepo_VERSION}")
else()
  set(_AURORA_VERSION "dev")
endif()

# Minimum macOS: Core Audio process taps (MacAudioGrabber.mm) need 14.2, so
# that is the floor for our own code. Left unset, CMake targets the *host*
# OS and the binary refuses to launch anywhere older. The plist's
# LSMinimumSystemVersion must agree with the binary's LC_BUILD_VERSION minos
# (tools/mac/verify-bundle.sh checks both).
if(CMAKE_OSX_DEPLOYMENT_TARGET)
  set(_AURORA_MIN_OS "${CMAKE_OSX_DEPLOYMENT_TARGET}")
else()
  set(_AURORA_MIN_OS "14.2")
endif()

# .app bundle Info.plist (Aurora-8mk.11, notarization keys Aurora-qy5.3):
# CFBundleIdentifier so a `open`/double-click launch holds its own TCC
# grant, plus the identity/OS keys notarization and LaunchServices expect.
configure_file(
  "${CMAKE_CURRENT_SOURCE_DIR}/Info.plist.in"
  "${CMAKE_CURRENT_BINARY_DIR}/Info.plist"
  @ONLY
)

# Bundle icon: the dark "A" logo's 1024px transparent master
# (assets/brand/Logo_Square_Dark_1024.png), downsampled via sips for every
# smaller .iconset slot -- never upsampled, so nothing needs qlmanage's
# SVG rasterization (which flattened transparency onto an opaque white
# background and didn't preserve the SVG's own centering -- see
# make_icns.sh for the finding).
set(_AURORA_ICNS_SRC "${CMAKE_CURRENT_SOURCE_DIR}/../../assets/brand/Logo_Square_Dark_1024.png")
set(_AURORA_ICNS_OUT "${CMAKE_CURRENT_BINARY_DIR}/Aurora.icns")
add_custom_command(
  OUTPUT "${_AURORA_ICNS_OUT}"
  COMMAND /bin/sh "${CMAKE_CURRENT_SOURCE_DIR}/make_icns.sh"
          "${_AURORA_ICNS_SRC}" "${_AURORA_ICNS_OUT}" "${CMAKE_CURRENT_BINARY_DIR}"
  DEPENDS
    "${CMAKE_CURRENT_SOURCE_DIR}/make_icns.sh"
    "${_AURORA_ICNS_SRC}"
  COMMENT "Building Aurora.icns from the dark logo's 1024px master"
  VERBATIM
)
set_source_files_properties("${_AURORA_ICNS_OUT}" PROPERTIES MACOSX_PACKAGE_LOCATION "Resources")

# Menu-bar tray icon (Aurora-qps.2), same source master as Aurora.icns
# above, see make_tray_icon.sh for why this ships full-color (isTemplate
# discards RGB at load time, no separate monochrome asset needed).
set(_AURORA_TRAY_ICON_1X "${CMAKE_CURRENT_BINARY_DIR}/tray-icon.png")
set(_AURORA_TRAY_ICON_2X "${CMAKE_CURRENT_BINARY_DIR}/tray-icon@2x.png")
add_custom_command(
  OUTPUT "${_AURORA_TRAY_ICON_1X}" "${_AURORA_TRAY_ICON_2X}"
  COMMAND /bin/sh "${CMAKE_CURRENT_SOURCE_DIR}/make_tray_icon.sh"
          "${_AURORA_ICNS_SRC}" "${CMAKE_CURRENT_BINARY_DIR}"
  DEPENDS
    "${CMAKE_CURRENT_SOURCE_DIR}/make_tray_icon.sh"
    "${_AURORA_ICNS_SRC}"
  COMMENT "Building menu-bar tray icon (18px/36px) from the dark logo's 1024px master"
  VERBATIM
)
set_source_files_properties("${_AURORA_TRAY_ICON_1X}" "${_AURORA_TRAY_ICON_2X}" PROPERTIES MACOSX_PACKAGE_LOCATION "Resources")

add_executable(aurora-app-mac MACOSX_BUNDLE
  src/main.cpp
  "${_AURORA_EMBEDDED_WEBROOT_HEADER}"
  ${_AURORA_GRAPH_EDITOR_HEADER}
  "${_AURORA_ICNS_OUT}"
  "${_AURORA_TRAY_ICON_1X}"
  "${_AURORA_TRAY_ICON_2X}"
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

if(AURORA_ENABLE_GRAPH_EDITOR)
  target_compile_definitions(aurora-app-mac PRIVATE AURORA_GRAPH_EDITOR=1)
  # The editor's npm notice ships in Contents/Resources/Licenses, ahead of
  # the signing step below. tools/mac/bundle-licenses.sh keeps it when it
  # regenerates the dylib licenses for an identity-signed build.
  add_custom_command(TARGET aurora-app-mac POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E make_directory
            "$<TARGET_BUNDLE_DIR:aurora-app-mac>/Contents/Resources/Licenses/graph-editor"
    COMMAND ${CMAKE_COMMAND} -E copy_if_different "${AURORA_GRAPH_EDITOR_NOTICE}"
            "$<TARGET_BUNDLE_DIR:aurora-app-mac>/Contents/Resources/Licenses/graph-editor/THIRD-PARTY-NOTICES.md"
    COMMENT "Staging graph editor third-party notices into Aurora.app"
    VERBATIM
  )
endif()

target_include_directories(aurora-app-mac PRIVATE
  ${CMAKE_CURRENT_BINARY_DIR}
)

# Code signing. Default is ad-hoc ("-": free, local, no Apple Developer
# account) -- required for a bundle to run at all under Gatekeeper's
# baseline check, and for its TCC identity to stay stable across rebuilds
# instead of re-prompting each time (an unsigned/differently-signed bundle
# looks like a new app to TCC). That covers "runs locally, holds a TCC grant
# reliably," not distribution to a second machine.
#
# Aurora-qy5.5: AURORA_MAC_SIGN_IDENTITY selects a real identity by *name*
# (e.g. -DAURORA_MAC_SIGN_IDENTITY="Developer ID Application: Name (TEAMID)").
# Only a name is ever read here: no key, password or profile touches CMake,
# and the cert itself stays in the keychain. A non-ad-hoc identity runs
# tools/mac/bundle-dylibs.sh, which copies the Homebrew dylibs into
# Contents/Frameworks, rewrites their install names, and signs every nested
# Mach-O inside-out, then the app, with the hardened runtime, a secure
# timestamp and Aurora.entitlements (--deep is discouraged for Developer ID,
# so it is not used on that path). Notarization is tools/mac/sign-notarize.sh
# (Aurora-qy5.4); check the result with tools/mac/verify-bundle.sh.
set(AURORA_MAC_SIGN_IDENTITY "-" CACHE STRING
  "codesign identity name for Aurora.app; \"-\" (default) signs ad-hoc")

if(AURORA_MAC_SIGN_IDENTITY STREQUAL "-")
  # The relink that precedes this step restores the Homebrew-linked binary,
  # so drop any Frameworks/manifest a previous identity build (or manual
  # bundle-dylibs.sh run) left behind rather than ship a mixed bundle.
  add_custom_command(TARGET aurora-app-mac POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E rm -rf
            "$<TARGET_BUNDLE_DIR:aurora-app-mac>/Contents/Frameworks"
            "$<TARGET_BUNDLE_DIR:aurora-app-mac>/Contents/Resources/bundled-dylibs.tsv"
    COMMAND codesign --force --deep --sign - "$<TARGET_BUNDLE_DIR:aurora-app-mac>"
    COMMENT "Ad-hoc signing Aurora.app"
    VERBATIM
  )
else()
  add_custom_command(TARGET aurora-app-mac POST_BUILD
    COMMAND "${CMAKE_CURRENT_SOURCE_DIR}/../../tools/mac/bundle-dylibs.sh"
            "$<TARGET_BUNDLE_DIR:aurora-app-mac>"
            --identity "${AURORA_MAC_SIGN_IDENTITY}"
            --entitlements "${CMAKE_CURRENT_SOURCE_DIR}/Aurora.entitlements"
    COMMENT "Bundling dylibs and signing Aurora.app as \"${AURORA_MAC_SIGN_IDENTITY}\""
    VERBATIM
  )
endif()

# No install()/packaging rules yet, unlike app/linux. NSStatusItem lands
# above (Aurora-qps.2); LSUIElement/SMAppService are still later
# tray-parity phases (Aurora-qps.3/.6) -- see docs/MacSupport.md's
# "Tray-parity" section.

target_compile_features(aurora-app-mac PRIVATE cxx_std_20)

if(AURORA_APP_BUILD_TESTS)
  enable_testing()
  add_subdirectory(tests)
endif()
