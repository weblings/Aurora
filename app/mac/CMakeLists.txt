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

add_executable(aurora-app-mac
  src/main.cpp
  "${_AURORA_EMBEDDED_WEBROOT_HEADER}"
)

# Product binary is Aurora; build-tree output goes to bin/ directly under
# the build root instead of app/<slice>/[...] -- matches Linux/Windows.
set_target_properties(aurora-app-mac PROPERTIES
  OUTPUT_NAME "Aurora"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin"
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
# "Tray-parity"/Gatekeeper notes in docs/MacSupport.md). Version single
# truth is the superbuild project() above; a standalone slice configure is
# dev-only and reports "dev".
if(DEFINED AuroraMonorepo_VERSION)
  set(_AURORA_VERSION "${AuroraMonorepo_VERSION}")
else()
  set(_AURORA_VERSION "dev")
endif()
target_compile_definitions(aurora-app-mac PRIVATE
  AURORA_WEBUI_SOURCE_DIR="${aurorawebui_SOURCE_DIR}"
  AURORA_VERSION="${_AURORA_VERSION}"
)

target_include_directories(aurora-app-mac PRIVATE
  ${CMAKE_CURRENT_BINARY_DIR}
)

# No install()/packaging rules yet, unlike app/linux -- no .app bundle, no
# codesigning/notarization (Aurora-8mk.10, deferred), no launcher/icon
# integration (tray-parity tier). This tier is "build it, run it from
# build/bin/Aurora" only; see docs/MacSupport.md's build-sequencing.

target_compile_features(aurora-app-mac PRIVATE cxx_std_20)

if(AURORA_APP_BUILD_TESTS)
  enable_testing()
  add_subdirectory(tests)
endif()
