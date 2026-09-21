cmake_minimum_required(VERSION 3.14)

project(AuroraCore)

set(BUILD_TESTS TRUE CACHE BOOL "Build tests")

# Off by default for a consumer with no audio input plugin of its own yet
# (e.g. Aurora-App-Linux) -- AudioProcessing hard-requires aubio via
# find_package(CONFIG REQUIRED), which shouldn't block a video-only build.
option(AURORA_CORE_ENABLE_AUDIO "Build the audio-reactive pipeline (AudioProcessing + Runtime's AudioOrchestrator); requires aubio" TRUE)

include(FetchContent)

find_package(OpenCV REQUIRED COMPONENTS imgproc)

# glm -- same fetch-if-missing pattern as huenicorn's own CMakeLists.txt
find_package(glm QUIET)
if(NOT glm_FOUND)
  message(STATUS "glm is not installed. Now fetching online...")
  FetchContent_Declare(
    glm
    URL https://github.com/g-truc/glm/archive/refs/tags/1.0.3.tar.gz
    DOWNLOAD_EXTRACT_TIMESTAMP TRUE
  )
  FetchContent_MakeAvailable(glm)
else()
  message(STATUS "glm is installed")
endif()

# nlohmann_json -- same fetch-if-missing pattern as glm; huenicorn already
# uses this exact library for its own config/profile persistence.
find_package(nlohmann_json QUIET)
if(NOT nlohmann_json_FOUND)
  message(STATUS "nlohmann_json is not installed. Now fetching online...")
  FetchContent_Declare(
    nlohmann_json
    URL https://github.com/nlohmann/json/releases/download/v3.11.3/json.tar.xz
    DOWNLOAD_EXTRACT_TIMESTAMP TRUE
  )
  FetchContent_MakeAvailable(nlohmann_json)
else()
  message(STATUS "nlohmann_json is installed")
endif()

# Fetched deps must not pollute consumers' install trees with their own
# install rules (headers, cmake configs, licenses). The apps' portable
# install tree (StandaloneApps P3) would otherwise ship httplib's files
# alongside the binary -- observed live via cmake --install. Off here, at
# the single point that owns the fetch, so slice, superbuild, and plugin
# configures are all covered regardless of add_subdirectory order.
set(HTTPLIB_INSTALL OFF CACHE BOOL "" FORCE)

# cpp-httplib -- same fetch-if-missing pattern as glm/nlohmann_json; also
# huenicorn's own choice for the same job (see docs/HttpServerAnalysis.md).
# No TLS feature enabled here -- plain HTTP only, for now (see that doc's
# note on the vendored vcpkg port's httplib features not including mbedtls,
# unlike the raw header itself; revisit when phase 4's HTTPS need is real).
find_package(httplib QUIET)
if(NOT httplib_FOUND)
  message(STATUS "httplib is not installed. Now fetching online...")
  FetchContent_Declare(
    httplib
    URL https://github.com/yhirose/cpp-httplib/archive/refs/tags/v0.46.0.tar.gz
    DOWNLOAD_EXTRACT_TIMESTAMP TRUE
  )
  FetchContent_MakeAvailable(httplib)
else()
  message(STATUS "httplib is installed")
endif()

# Network has no internal-module dependency, so it can be added anywhere --
# kept first since nothing else here depends on it either.
add_subdirectory(Network)

# Contracts first (no internal deps), then Processing (depends on Contracts).
add_subdirectory(Contracts)
add_subdirectory(Processing)
if(AURORA_CORE_ENABLE_AUDIO)
  add_subdirectory(AudioProcessing)
endif()

# Interface-only -- concrete plugins (Aurora-Input-Linux, Aurora-Output-Hue,
# ...) live in their own repos and depend on these, not the other way round.
# See docs/ModuleSplitPlan.md's repo-split section.
add_subdirectory(Input)
add_subdirectory(Output)

# Runtime last -- its Orchestrator depends on Contracts/Processing/Input/Output.
add_subdirectory(Runtime)

if(BUILD_TESTS)
  # enable_testing() must happen here, at the parent scope, *before*
  # add_subdirectory(tests) -- CTest only wires the top-level
  # CTestTestfile.cmake to descend into a subdirectory's tests if testing
  # was already enabled when that subdirectory was added. Calling it from
  # inside tests/CMakeLists.txt instead (the original bug here) builds the
  # test binary fine but leaves it undiscoverable by `ctest --test-dir build`.
  enable_testing()
  add_subdirectory(tests)
endif()
