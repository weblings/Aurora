cmake_minimum_required(VERSION 3.14)

project(AuroraAppLinux)

option(AURORA_APP_BUILD_TESTS "Build this app's own tests" TRUE)
# Which plugin repos this particular app binary is compiled with -- the
# compile-time half of the two-level plugin-selection design (see
# Analysis/DistributedArchitecturePlan.md); the run-time half is Config's
# activeInputName/activeOutputNames, looked up in the Registry these build.
option(AURORA_APP_ENABLE_LINUX_INPUT "Link in Aurora-Input-Linux" TRUE)
option(AURORA_APP_ENABLE_HUE_OUTPUT "Link in Aurora-Output-Hue" TRUE)
# Drives both AURORA_CORE_ENABLE_AUDIO and AURORA_INPUT_LINUX_ENABLE_AUDIO
# below -- Core fetches before Aurora-Input-Linux does, so Core's own
# add_subdirectory(AudioProcessing) decision must be set here, not left for
# Aurora-Input-Linux's own (later) default to decide.
option(AURORA_APP_ENABLE_LINUX_AUDIO_INPUT "Link in Aurora-Input-Linux's audio capture (requires aubio)" TRUE)

include(FetchContent)

# Aurora core -- needed directly (Config/Orchestrator/Contracts) regardless
# of which plugins below are enabled, not just transitively through them.
set(BUILD_TESTS FALSE CACHE BOOL "" FORCE)
set(AURORA_CORE_ENABLE_AUDIO ${AURORA_APP_ENABLE_LINUX_AUDIO_INPUT} CACHE BOOL "" FORCE)
FetchContent_Declare(
  AuroraCore
  SOURCE_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../Aurora/core
)
FetchContent_MakeAvailable(AuroraCore)

# Aurora-WebUI -- the one shared static frontend both apps serve identically
# via HttpServer::serveStaticFiles(). Unconditional, unlike the plugin blocks
# below -- this is the product's one control surface, not a swappable/optional
# dependency. Has no CMakeLists.txt of its own (plain static files); confirmed
# via CMake's own docs that MakeAvailable just populates it without erroring
# or calling add_subdirectory() when none exists.
FetchContent_Declare(
  AuroraWebUI
  SOURCE_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../Aurora-WebUI
)
FetchContent_MakeAvailable(AuroraWebUI)

if(AURORA_APP_ENABLE_LINUX_INPUT)
  set(AURORA_INPUT_LINUX_BUILD_TESTS FALSE CACHE BOOL "" FORCE)
  set(AURORA_INPUT_LINUX_ENABLE_AUDIO ${AURORA_APP_ENABLE_LINUX_AUDIO_INPUT} CACHE BOOL "" FORCE)
  FetchContent_Declare(
    AuroraInputLinux
    SOURCE_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../Aurora-Input-Linux
  )
  FetchContent_MakeAvailable(AuroraInputLinux)
endif()

if(AURORA_APP_ENABLE_HUE_OUTPUT)
  set(AURORA_OUTPUT_HUE_BUILD_TESTS FALSE CACHE BOOL "" FORCE)
  FetchContent_Declare(
    AuroraOutputHue
    SOURCE_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../Aurora-Output-Hue
  )
  FetchContent_MakeAvailable(AuroraOutputHue)
endif()

# Registry as its own library (not folded into the executable) so tests can
# link it without pulling in main()'s own main() symbol.
add_library(AuroraApp STATIC
  src/Registry.cpp
)

target_include_directories(AuroraApp PUBLIC
  ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_link_libraries(AuroraApp PUBLIC
  AuroraInputInterface
  AuroraOutputInterface
)

target_compile_features(AuroraApp PUBLIC cxx_std_20)

add_executable(aurora-app-linux
  src/main.cpp
)

find_package(Threads REQUIRED)

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
target_compile_definitions(aurora-app-linux PRIVATE
  AURORA_WEBUI_SOURCE_DIR="${aurorawebui_SOURCE_DIR}"
)

target_compile_features(aurora-app-linux PRIVATE cxx_std_20)

if(AURORA_APP_BUILD_TESTS)
  enable_testing()
  add_subdirectory(tests)
endif()
