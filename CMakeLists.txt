cmake_minimum_required(VERSION 3.14)

project(AuroraOutputHue)

option(AURORA_OUTPUT_HUE_BUILD_TESTS "Build this plugin's own tests" TRUE)

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

add_library(AuroraOutputHue STATIC
  src/Colorimetry.cpp
  src/Channel.cpp
  src/HuestreamHeader.cpp
  src/BridgeAddress.cpp
  src/Credentials.cpp
)

target_include_directories(AuroraOutputHue PUBLIC
  ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_link_libraries(AuroraOutputHue PUBLIC
  AuroraContracts
  AuroraOutputInterface
)

target_compile_features(AuroraOutputHue PUBLIC cxx_std_20)

if(AURORA_OUTPUT_HUE_BUILD_TESTS)
  enable_testing()
  add_subdirectory(tests)
endif()
