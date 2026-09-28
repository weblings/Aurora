cmake_minimum_required(VERSION 3.14)

project(AuroraInputMac)

# ScreenCaptureKitGrabber.mm (Aurora-8mk.5) is Objective-C++.
enable_language(OBJCXX)

option(AURORA_INPUT_MAC_BUILD_TESTS "Build this plugin's own tests" TRUE)
# Same dependency-isolation reasoning as AURORA_INPUT_WINDOWS_ENABLE_AUDIO/
# AURORA_INPUT_LINUX_ENABLE_AUDIO -- off skips Core's aubio requirement
# entirely for a video-only build. Folded into AuroraInputMac itself
# (one target, not a separate AuroraInputMacAudio), matching what
# input/linux actually shipped rather than docs/AudioAnalysis.md's
# original separate-target sketch -- simpler, and the real precedent now.
option(AURORA_INPUT_MAC_ENABLE_AUDIO "Build Core Audio process-tap capture support" TRUE)

include(FetchContent)

# Aurora core -- SOURCE_DIR points into the monorepo tree.
# Suppress its own test suite -- we only want its libraries here.
set(BUILD_TESTS FALSE CACHE BOOL "" FORCE)
set(AURORA_CORE_ENABLE_AUDIO ${AURORA_INPUT_MAC_ENABLE_AUDIO} CACHE BOOL "" FORCE)
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

if(AURORA_INPUT_MAC_ENABLE_AUDIO)
  # Only CoreAudio (process taps, aggregate devices, the HAL IOProc) +
  # Foundation (CATapDescription's NSArray/NSUUID/NSDictionary use) are
  # actually needed -- confirmed by a standalone link check, not assumed;
  # AudioToolbox is not required for this API surface.
  find_library(FRAMEWORK_COREAUDIO CoreAudio REQUIRED)

  target_sources(AuroraInputMac PRIVATE src/MacAudioGrabber.mm)
  target_compile_definitions(AuroraInputMac PUBLIC AURORA_INPUT_MAC_AUDIO_AVAILABLE=1)
  target_link_libraries(AuroraInputMac PUBLIC ${FRAMEWORK_COREAUDIO})

  set_source_files_properties(src/MacAudioGrabber.mm PROPERTIES
    COMPILE_FLAGS "-fobjc-arc"
  )
endif()

if(AURORA_INPUT_MAC_BUILD_TESTS)
  enable_testing()
  add_subdirectory(tests)
endif()
