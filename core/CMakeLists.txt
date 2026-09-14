cmake_minimum_required(VERSION 3.14)

project(AuroraCore)

set(BUILD_TESTS TRUE CACHE BOOL "Build tests")

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

# Contracts first (no internal deps), then Processing (depends on Contracts).
add_subdirectory(Contracts)
add_subdirectory(Processing)
add_subdirectory(AudioProcessing)

# Interface-only -- concrete plugins (Aurora-Input-Linux, Aurora-Output-Hue,
# ...) live in their own repos and depend on these, not the other way round.
# See Analysis/ModuleSplitPlan.md's repo-split section.
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
