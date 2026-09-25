cmake_minimum_required(VERSION 3.14)

project(AuroraInputMac)

# ScreenCaptureKitGrabber.mm (Aurora-8mk.5) is Objective-C++.
enable_language(OBJCXX)

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
  src/ScreenCaptureKitGrabber.mm
)

target_include_directories(AuroraInputMac PUBLIC
  ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_link_libraries(AuroraInputMac PUBLIC
  AuroraContracts
  AuroraInputInterface
)

find_library(FRAMEWORK_SCREENCAPTUREKIT ScreenCaptureKit REQUIRED)
find_library(FRAMEWORK_COREMEDIA CoreMedia REQUIRED)
find_library(FRAMEWORK_COREVIDEO CoreVideo REQUIRED)
find_library(FRAMEWORK_APPKIT AppKit REQUIRED)

target_link_libraries(AuroraInputMac PUBLIC
  ${FRAMEWORK_SCREENCAPTUREKIT}
  ${FRAMEWORK_COREMEDIA}
  ${FRAMEWORK_COREVIDEO}
  ${FRAMEWORK_APPKIT}
)

# ARC (retain/release for the ScreenCaptureKit/AppKit object pointers held
# inside ScreenCaptureKitGrabber::Impl, a plain C++ struct -- ARC manages
# those the same as any other __strong Objective-C pointer member).
set_source_files_properties(src/ScreenCaptureKitGrabber.mm PROPERTIES
  COMPILE_FLAGS "-fobjc-arc"
)

target_compile_features(AuroraInputMac PUBLIC cxx_std_20)

if(AURORA_INPUT_MAC_BUILD_TESTS)
  enable_testing()
  add_subdirectory(tests)
endif()
