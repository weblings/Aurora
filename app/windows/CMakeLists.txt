cmake_minimum_required(VERSION 3.14)

project(AuroraAppWindows)

option(AURORA_APP_BUILD_TESTS "Build this app's own tests" TRUE)
# Which plugin repos this particular app binary is compiled with -- the
# compile-time half of the two-level plugin-selection design (see
# docs/DistributedArchitecturePlan.md); the run-time half is Config's
# activeInputName/activeOutputNames, looked up in the Registry these build.
option(AURORA_APP_ENABLE_WINDOWS_INPUT "Link in input/windows" TRUE)
option(AURORA_APP_ENABLE_HUE_OUTPUT "Link in output/hue" TRUE)

include(FetchContent)

# Aurora core -- needed directly (Config/Orchestrator/Contracts) regardless
# of which plugins below are enabled, not just transitively through them.
set(BUILD_TESTS FALSE CACHE BOOL "" FORCE)
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
if(AURORA_APP_ENABLE_WINDOWS_INPUT AND NOT TARGET AuroraInputWindows)
  set(AURORA_INPUT_WINDOWS_BUILD_TESTS FALSE CACHE BOOL "" FORCE)
  FetchContent_Declare(
    AuroraInputWindows
    SOURCE_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../../input/windows
  )
  FetchContent_MakeAvailable(AuroraInputWindows)
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
  src/LogSink.cpp
)

target_include_directories(AuroraApp PUBLIC
  ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_link_libraries(AuroraApp PUBLIC
  AuroraInputInterface
  AuroraOutputInterface
)

target_compile_features(AuroraApp PUBLIC cxx_std_20)

# Embedded webroot (StandaloneApps P1): generated from the fetched web/ui
# checkout above. The binary serves it only as the last probe-order
# fallback (env override > baked source dir > embedded), so dev hot-edit
# keeps working; a moved tree without the checkout still serves full UI.
include("${auroracore_SOURCE_DIR}/Network/cmake/EmbedWebroot.cmake")
set(_AURORA_EMBEDDED_WEBROOT_HEADER "${CMAKE_CURRENT_BINARY_DIR}/EmbeddedWebRoot.hpp")
aurora_embed_webroot("${_AURORA_EMBEDDED_WEBROOT_HEADER}" "${aurorawebui_SOURCE_DIR}")

# Aurora-05r: app.rc embeds app.ico (generated from
# docs/README/Logo_Square_Light.png) as the exe icon. Side-by-side in
# this dir, so rc.exe/windres resolve ICON "app.ico" with no extra
# include path.
add_executable(aurora-app-windows
  src/main.cpp
  app.rc
  "${_AURORA_EMBEDDED_WEBROOT_HEADER}"
)

# Aurora-e3d: product binary is Aurora; build-tree output goes to
# bin/ directly under the build root instead of app/<slice>/[...].
# (Multi-config generators still append <Config> under bin/.) The
# CMake target name is unchanged, so link deps, the DLL copy, and
# install(TARGETS) rules are unaffected.
# 7l1.6: dual-mode launch. WIN32_EXECUTABLE links /SUBSYSTEM:WINDOWS so an
# Explorer double-click shows no console; main() re-acquires the parent
# console (AttachConsole/CONOUT$, --console) when there is one. Deliberately
# keeps plain int main() instead of WinMain -- argv parsing is unchanged and
# no CommandLineToArgvW shim is needed.
set_target_properties(aurora-app-windows PROPERTIES
  OUTPUT_NAME "Aurora"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin"
  WIN32_EXECUTABLE TRUE
)

find_package(Threads REQUIRED)

target_link_libraries(aurora-app-windows PRIVATE
  AuroraApp
  AuroraRuntime
  AuroraNetwork
  Threads::Threads
  Shell32
)

if(AURORA_APP_ENABLE_WINDOWS_INPUT)
  target_link_libraries(aurora-app-windows PRIVATE AuroraInputWindows)

  # Separate target from AuroraInputWindows -- link it too if the plugin
  # repo's own option built it (default TRUE, see its CMakeLists.txt).
  if(TARGET AuroraInputWindowsAudio)
    target_link_libraries(aurora-app-windows PRIVATE AuroraInputWindowsAudio)
  endif()
endif()

if(AURORA_APP_ENABLE_HUE_OUTPUT)
  target_link_libraries(aurora-app-windows PRIVATE AuroraOutputHue)
endif()

target_include_directories(aurora-app-windows PRIVATE
  ${CMAKE_CURRENT_BINARY_DIR}
  # Aurora-x2o.1: resource.h lives next to this file, not in include/.
  ${CMAKE_CURRENT_SOURCE_DIR}
)

# StandaloneApps P2: copy runtime DLLs (OpenCV, ...) next to the exe at
# build time. Resolved from imported targets, so choco and vcpkg OpenCV
# layouts both work with no hardcoded paths. Needs CMake 3.21+; older
# CMake configures fine and just skips the copy (root minimum is 3.14).
# The MSVC redist itself is NOT vendored -- it is a documented
# prerequisite (central deployment), see README.md.
if(CMAKE_VERSION VERSION_GREATER_EQUAL "3.21")
  add_custom_command(TARGET aurora-app-windows POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
      $<TARGET_RUNTIME_DLLS:aurora-app-windows>
      $<TARGET_FILE_DIR:aurora-app-windows>
    COMMAND_EXPAND_LISTS
  )
endif()

target_compile_features(aurora-app-windows PRIVATE cxx_std_20)

# MSVC flags std::getenv as deprecated in favor of _dupenv_s -- keeping the
# same portable getenv() the Linux app uses rather than diverging per-platform.
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
target_compile_definitions(aurora-app-windows PRIVATE
  _CRT_SECURE_NO_WARNINGS
  AURORA_WEBUI_SOURCE_DIR="${aurorawebui_SOURCE_DIR}"
  AURORA_VERSION="${_AURORA_VERSION}"
)

if(AURORA_APP_BUILD_TESTS)
  enable_testing()
  add_subdirectory(tests)
endif()
