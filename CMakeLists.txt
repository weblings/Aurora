cmake_minimum_required(VERSION 3.14)

project(AuroraInputLinux)

option(AURORA_INPUT_LINUX_BUILD_TESTS "Build this plugin's own tests" TRUE)
# X11 and Wayland aren't a user-facing choice -- SessionDispatch picks the
# right one automatically at runtime. These toggles exist purely for
# dependency isolation (skip libX11/libpipewire dev packages you don't have),
# same reasoning huenicorn's own X11_GRABBER_AVAILABLE/PIPEWIRE_GRABBER_AVAILABLE
# flags used, kept in one repo rather than split into two.
option(AURORA_INPUT_LINUX_ENABLE_X11 "Build X11 capture support" TRUE)
option(AURORA_INPUT_LINUX_ENABLE_PIPEWIRE "Build Pipewire/Wayland capture support" FALSE) # not ported yet

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

add_library(AuroraInputLinux STATIC
  src/DummyGrabber.cpp
  src/SessionDispatch.cpp
)

target_include_directories(AuroraInputLinux PUBLIC
  ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_link_libraries(AuroraInputLinux PUBLIC
  AuroraContracts
  AuroraInputInterface
)

target_compile_features(AuroraInputLinux PUBLIC cxx_std_20)

if(AURORA_INPUT_LINUX_ENABLE_X11)
  find_package(X11 REQUIRED COMPONENTS Xext Xrandr)

  target_sources(AuroraInputLinux PRIVATE src/X11Grabber.cpp)
  target_compile_definitions(AuroraInputLinux PUBLIC AURORA_INPUT_LINUX_X11_AVAILABLE=1)
  target_link_libraries(AuroraInputLinux PUBLIC X11::X11 X11::Xext X11::Xrandr)
endif()

if(AURORA_INPUT_LINUX_ENABLE_PIPEWIRE)
  message(FATAL_ERROR "Pipewire/Wayland capture isn't ported yet -- see Analysis/LinuxCaptureAnalysis.md")
endif()

if(AURORA_INPUT_LINUX_BUILD_TESTS)
  enable_testing()
  add_subdirectory(tests)
endif()
