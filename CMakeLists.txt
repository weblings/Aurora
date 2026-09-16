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

target_compile_features(aurora-app-linux PRIVATE cxx_std_20)

if(AURORA_APP_BUILD_TESTS)
  enable_testing()
  add_subdirectory(tests)
endif()
