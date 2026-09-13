cmake_minimum_required(VERSION 3.14)

project(AuroraInputWindows)

option(AURORA_INPUT_WINDOWS_BUILD_TESTS "Build this plugin's own tests" TRUE)

include(FetchContent)

# Aurora core -- SOURCE_DIR points at the local sibling checkout for now;
# swap for GIT_REPOSITORY + GIT_TAG once Aurora core has a real remote.
# Suppress its own test suite -- we only want its libraries here.
set(BUILD_TESTS FALSE CACHE BOOL "" FORCE)
FetchContent_Declare(
  AuroraCore
  SOURCE_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../Aurora/core
)
FetchContent_MakeAvailable(AuroraCore)

add_library(AuroraInputWindows STATIC
  src/DummyGrabber.cpp
)

target_include_directories(AuroraInputWindows PUBLIC
  ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_link_libraries(AuroraInputWindows PUBLIC
  AuroraContracts
  AuroraInputInterface
)

target_compile_features(AuroraInputWindows PUBLIC cxx_std_20)

# WindowsGrabber (DXGI Desktop Duplication) lands here once written -- see
# Analysis/WindowsInputAnalysis.md. No vcpkg/find_package needed for it:
# d3d11/dxgi/dxguid are Windows SDK import libraries, not external packages.

if(AURORA_INPUT_WINDOWS_BUILD_TESTS)
  enable_testing()
  add_subdirectory(tests)
endif()
