cmake_minimum_required(VERSION 3.14)

project(AuroraAppWindows)

option(AURORA_APP_BUILD_TESTS "Build this app's own tests" TRUE)
# Which plugin repos this particular app binary is compiled with -- the
# compile-time half of the two-level plugin-selection design (see
# Analysis/DistributedArchitecturePlan.md); the run-time half is Config's
# activeInputName/activeOutputNames, looked up in the Registry these build.
option(AURORA_APP_ENABLE_WINDOWS_INPUT "Link in Aurora-Input-Windows" TRUE)
option(AURORA_APP_ENABLE_HUE_OUTPUT "Link in Aurora-Output-Hue" TRUE)

include(FetchContent)

# Aurora core -- needed directly (Config/Orchestrator/Contracts) regardless
# of which plugins below are enabled, not just transitively through them.
set(BUILD_TESTS FALSE CACHE BOOL "" FORCE)
FetchContent_Declare(
  AuroraCore
  SOURCE_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../Aurora/core
)
FetchContent_MakeAvailable(AuroraCore)

if(AURORA_APP_ENABLE_WINDOWS_INPUT)
  set(AURORA_INPUT_WINDOWS_BUILD_TESTS FALSE CACHE BOOL "" FORCE)
  FetchContent_Declare(
    AuroraInputWindows
    SOURCE_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../Aurora-Input-Windows
  )
  FetchContent_MakeAvailable(AuroraInputWindows)
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

add_executable(aurora-app-windows
  src/main.cpp
)

find_package(Threads REQUIRED)

target_link_libraries(aurora-app-windows PRIVATE
  AuroraApp
  AuroraRuntime
  Threads::Threads
)

if(AURORA_APP_ENABLE_WINDOWS_INPUT)
  target_link_libraries(aurora-app-windows PRIVATE AuroraInputWindows)
endif()

if(AURORA_APP_ENABLE_HUE_OUTPUT)
  target_link_libraries(aurora-app-windows PRIVATE AuroraOutputHue)
endif()

target_compile_features(aurora-app-windows PRIVATE cxx_std_20)

# MSVC flags std::getenv as deprecated in favor of _dupenv_s -- keeping the
# same portable getenv() the Linux app uses rather than diverging per-platform.
target_compile_definitions(aurora-app-windows PRIVATE _CRT_SECURE_NO_WARNINGS)

if(AURORA_APP_BUILD_TESTS)
  enable_testing()
  add_subdirectory(tests)
endif()
