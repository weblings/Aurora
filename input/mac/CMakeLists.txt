cmake_minimum_required(VERSION 3.14)

project(AuroraInputMac)

option(AURORA_INPUT_MAC_BUILD_TESTS "Build this plugin's own tests" TRUE)

include(FetchContent)

# Aurora core -- SOURCE_DIR points into the monorepo tree.
# Suppress its own test suite -- we only want its libraries here.
# Video-only tier 1 (docs/MacSupport.md) needs no aubio/audio pipeline,
# unlike input/linux which ties this to its own audio-input toggle --
# Mac has no audio input option to tie it to yet.
set(BUILD_TESTS FALSE CACHE BOOL "" FORCE)
set(AURORA_CORE_ENABLE_AUDIO FALSE CACHE BOOL "" FORCE)
FetchContent_Declare(
  AuroraCore
  SOURCE_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../../core
)
FetchContent_MakeAvailable(AuroraCore)

add_library(AuroraInputMac STATIC
  src/DummyGrabber.cpp
  src/InputControlDescriptors.cpp
)

target_include_directories(AuroraInputMac PUBLIC
  ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_link_libraries(AuroraInputMac PUBLIC
  AuroraContracts
  AuroraInputInterface
)

target_compile_features(AuroraInputMac PUBLIC cxx_std_20)

if(AURORA_INPUT_MAC_BUILD_TESTS)
  enable_testing()
  add_subdirectory(tests)
endif()
