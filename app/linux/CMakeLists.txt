cmake_minimum_required(VERSION 3.14)

project(AuroraAppLinux)

option(AURORA_APP_BUILD_TESTS "Build this app's own tests" TRUE)
# Which plugin repos this particular app binary is compiled with -- the
# compile-time half of the two-level plugin-selection design (see
# docs/DistributedArchitecturePlan.md); the run-time half is Config's
# activeInputName/activeOutputNames, looked up in the Registry these build.
option(AURORA_APP_ENABLE_LINUX_INPUT "Link in input/linux" TRUE)
option(AURORA_APP_ENABLE_HUE_OUTPUT "Link in output/hue" TRUE)
# Drives both AURORA_CORE_ENABLE_AUDIO and AURORA_INPUT_LINUX_ENABLE_AUDIO
# below -- Core fetches before input/linux does, so Core's own
# add_subdirectory(AudioProcessing) decision must be set here, not left for
# input/linux own (later) default to decide.
option(AURORA_APP_ENABLE_LINUX_AUDIO_INPUT "Link in input/linux audio capture (requires aubio)" TRUE)

include(FetchContent)

# Aurora core -- needed directly (Config/Orchestrator/Contracts) regardless
# of which plugins below are enabled, not just transitively through them.
set(BUILD_TESTS FALSE CACHE BOOL "" FORCE)
set(AURORA_CORE_ENABLE_AUDIO ${AURORA_APP_ENABLE_LINUX_AUDIO_INPUT} CACHE BOOL "" FORCE)
FetchContent_Declare(
  AuroraCore
  SOURCE_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../../core
)
FetchContent_MakeAvailable(AuroraCore)

# web/ui -- the one shared static frontend both apps serve identically
# via HttpServer::serveStaticFiles(). Unconditional, unlike the plugin blocks
# below -- this is the product's one control surface, not a swappable/optional
# dependency. Has no CMakeLists.txt of its own (plain static files); confirmed
# via CMake's own docs that MakeAvailable just populates it without erroring
# or calling add_subdirectory() when none exists.
FetchContent_Declare(
  AuroraWebUI
  SOURCE_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../../web/ui
)
FetchContent_MakeAvailable(AuroraWebUI)

# NOT TARGET guard: the root superbuild may have added this dir already;
# FetchContent dedups by name but NOT against a manual add_subdirectory.
if(AURORA_APP_ENABLE_LINUX_INPUT AND NOT TARGET AuroraInputLinux)
  set(AURORA_INPUT_LINUX_BUILD_TESTS FALSE CACHE BOOL "" FORCE)
  set(AURORA_INPUT_LINUX_ENABLE_AUDIO ${AURORA_APP_ENABLE_LINUX_AUDIO_INPUT} CACHE BOOL "" FORCE)
  FetchContent_Declare(
    AuroraInputLinux
    SOURCE_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../../input/linux
  )
  FetchContent_MakeAvailable(AuroraInputLinux)
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
# link it without pulling in main()'s own main() symbol.
add_library(AuroraApp STATIC
  src/Registry.cpp
  src/InstanceLock.cpp
  src/TrayIcon.cpp
)

target_include_directories(AuroraApp PUBLIC
  ${CMAKE_CURRENT_SOURCE_DIR}/include
)

# gio-2.0 (GDBus tray icon) is already a required system package
# (README apt line, CI); linking it here keeps the tray code in
# the testable AuroraApp lib with no new dependency.
target_link_libraries(AuroraApp PUBLIC
  AuroraInputInterface
  AuroraOutputInterface
  PkgConfig::GIO
)

target_compile_features(AuroraApp PUBLIC cxx_std_20)

# Embedded webroot (StandaloneApps P1): generated from the fetched web/ui
# checkout above. The binary serves it only as the last probe-order
# fallback (env override > baked source dir > embedded), so dev hot-edit
# keeps working; a moved tree without the checkout still serves full UI.
include("${auroracore_SOURCE_DIR}/Network/cmake/EmbedWebroot.cmake")
set(_AURORA_EMBEDDED_WEBROOT_HEADER "${CMAKE_CURRENT_BINARY_DIR}/EmbeddedWebRoot.hpp")
aurora_embed_webroot("${_AURORA_EMBEDDED_WEBROOT_HEADER}" "${aurorawebui_SOURCE_DIR}")

add_executable(aurora-app-linux
  src/main.cpp
  "${_AURORA_EMBEDDED_WEBROOT_HEADER}"
)

# Aurora-e3d: product binary is Aurora; build-tree output goes to
# bin/ directly under the build root instead of app/<slice>/[...].
# (Multi-config generators still append <Config> under bin/.) The
# CMake target name is unchanged, so link deps, the DLL copy, and
# install(TARGETS) rules are unaffected.
set_target_properties(aurora-app-linux PROPERTIES
  OUTPUT_NAME "Aurora"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin"
)

find_package(Threads REQUIRED)
find_package(PkgConfig REQUIRED)
pkg_check_modules(GIO REQUIRED IMPORTED_TARGET gio-2.0)

target_link_libraries(aurora-app-linux PRIVATE
  AuroraApp
  AuroraRuntime
  AuroraNetwork
  Threads::Threads
)

if(AURORA_APP_ENABLE_LINUX_INPUT)
  target_link_libraries(aurora-app-linux PRIVATE AuroraInputLinux)
endif()

if(AURORA_APP_ENABLE_HUE_OUTPUT)
  target_link_libraries(aurora-app-linux PRIVATE AuroraOutputHue)
endif()

# AURORA_WEBUI_SOURCE_DIR: the fetched sibling checkout's absolute path, baked
# in at configure time -- a dev-stage placeholder (a real install/distribution
# story, like huenicorn's own embedded-webroot release build, is explicitly
# out of scope for now; see HttpServer.hpp's serveStaticFiles() comment).
# Version single truth is the superbuild project() above; a standalone
# slice configure is dev-only and reports "dev".
if(DEFINED AuroraMonorepo_VERSION)
  set(_AURORA_VERSION "${AuroraMonorepo_VERSION}")
else()
  set(_AURORA_VERSION "dev")
endif()
target_compile_definitions(aurora-app-linux PRIVATE
  AURORA_WEBUI_SOURCE_DIR="${aurorawebui_SOURCE_DIR}"
  AURORA_VERSION="${_AURORA_VERSION}"
)

target_include_directories(aurora-app-linux PRIVATE
  ${CMAKE_CURRENT_BINARY_DIR}
)

# StandaloneApps P2: the install tree ships app-level shared libs next to
# the binary (lib/); $ORIGIN-relative RPATH finds them with no
# LD_LIBRARY_PATH. BUILD_WITH_INSTALL_RPATH keeps the build tree behaving
# like the install tree. System integration libs (X11/PipeWire/glib) and,
# per the Aurora-b9q decision, system OpenCV stay system dependencies.
set_target_properties(aurora-app-linux PROPERTIES
  INSTALL_RPATH "$ORIGIN/../lib:$ORIGIN"
  BUILD_WITH_INSTALL_RPATH TRUE
)

include(GNUInstallDirs)

# StandaloneApps P3: portable install tree (bin/ + doc/, CPack
# deliberately deferred). Under the Aurora-b9q decision every native dep
# stays a system package for 1.0.1, so no bundled .so set ships yet --
# the $ORIGIN RPATH above is ready when one does.
install(TARGETS aurora-app-linux RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR})

# Aurora-05r: launcher integration. aurora.desktop + hicolor icons are
# checked-in assets generated from docs/README/Logo_Square_Light.png (see
# Aurora-05r bead comment). Anchored at CMAKE_CURRENT_SOURCE_DIR so both the
# standalone-slice and superbuild configures resolve them.
install(FILES "${CMAKE_CURRENT_SOURCE_DIR}/aurora.desktop"
  DESTINATION ${CMAKE_INSTALL_DATADIR}/applications
)
foreach(_AURORA_ICON_SIZE 16 22 24 32 48 64 128 256)
  install(FILES
    "${CMAKE_CURRENT_SOURCE_DIR}/icons/hicolor/${_AURORA_ICON_SIZE}x${_AURORA_ICON_SIZE}/apps/aurora.png"
    DESTINATION ${CMAKE_INSTALL_DATADIR}/icons/hicolor/${_AURORA_ICON_SIZE}x${_AURORA_ICON_SIZE}/apps
  )
endforeach()
if(EXISTS "${CMAKE_SOURCE_DIR}/LICENSE")
  install(FILES "${CMAKE_SOURCE_DIR}/LICENSE"
    DESTINATION ${CMAKE_INSTALL_DOCDIR}/aurora-app-linux
    RENAME copyright
  )
endif()

target_compile_features(aurora-app-linux PRIVATE cxx_std_20)

if(AURORA_APP_BUILD_TESTS)
  enable_testing()
  add_subdirectory(tests)
endif()
