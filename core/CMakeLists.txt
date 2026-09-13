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
  )
  FetchContent_MakeAvailable(glm)
else()
  message(STATUS "glm is installed")
endif()

# Contracts first (no internal deps), then Processing (depends on Contracts).
add_subdirectory(Contracts)
add_subdirectory(Processing)

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
