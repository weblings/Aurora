cmake_minimum_required(VERSION 3.14)

project(AuroraInputLinux)

option(AURORA_INPUT_LINUX_BUILD_TESTS "Build this plugin's own tests" TRUE)
# X11 and Wayland aren't a user-facing choice -- SessionDispatch picks the
# right one automatically at runtime. These toggles exist purely for
# dependency isolation (skip libX11/libpipewire dev packages you don't have),
# same reasoning huenicorn's own X11_GRABBER_AVAILABLE/PIPEWIRE_GRABBER_AVAILABLE
# flags used, kept in one repo rather than split into two.
option(AURORA_INPUT_LINUX_ENABLE_X11 "Build X11 capture support" TRUE)
option(AURORA_INPUT_LINUX_ENABLE_PIPEWIRE "Build Pipewire/Wayland capture support" TRUE)
# Same dependency-isolation reasoning as AURORA_INPUT_WINDOWS_ENABLE_AUDIO --
# off skips Core's aubio requirement entirely for a video-only build.
option(AURORA_INPUT_LINUX_ENABLE_AUDIO "Build Pipewire audio capture support" TRUE)

include(FetchContent)

# Aurora core -- SOURCE_DIR points into the monorepo tree.
# Suppress its own test suite -- we only want its libraries here.
set(BUILD_TESTS FALSE CACHE BOOL "" FORCE)
set(AURORA_CORE_ENABLE_AUDIO ${AURORA_INPUT_LINUX_ENABLE_AUDIO} CACHE BOOL "" FORCE)
FetchContent_Declare(
  AuroraCore
  SOURCE_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../../core
)
FetchContent_MakeAvailable(AuroraCore)

add_library(AuroraInputLinux STATIC
  src/DummyGrabber.cpp
  src/SessionDispatch.cpp
  src/InputControlDescriptors.cpp
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
  find_package(PkgConfig REQUIRED)
  pkg_check_modules(PIPEWIRE REQUIRED IMPORTED_TARGET libpipewire-0.3)
  pkg_check_modules(GLIB REQUIRED IMPORTED_TARGET glib-2.0 gio-2.0 gio-unix-2.0)

  target_sources(AuroraInputLinux PRIVATE
    src/XdgDesktopPortal.cpp
    src/PipewireGrabber.cpp
  )
  target_compile_definitions(AuroraInputLinux PUBLIC AURORA_INPUT_LINUX_PIPEWIRE_AVAILABLE=1)
  target_link_libraries(AuroraInputLinux PUBLIC PkgConfig::PIPEWIRE PkgConfig::GLIB)
endif()

# Shared process-wide pw_init() -- needed by PipewireGrabber and/or
# AudioGrabber; compiled when either is enabled since both overlap live
# instances during app reloads (see PipewireRuntime.hpp).
if(AURORA_INPUT_LINUX_ENABLE_PIPEWIRE OR AURORA_INPUT_LINUX_ENABLE_AUDIO)
  target_sources(AuroraInputLinux PRIVATE src/PipewireRuntime.cpp)
endif()

if(AURORA_INPUT_LINUX_ENABLE_AUDIO)
  # Independent of AURORA_INPUT_LINUX_ENABLE_PIPEWIRE -- audio capture needs
  # libpipewire but not glib/XdgDesktopPortal (no permission portal involved).
  find_package(PkgConfig REQUIRED)
  pkg_check_modules(PIPEWIRE REQUIRED IMPORTED_TARGET libpipewire-0.3)

  target_sources(AuroraInputLinux PRIVATE src/AudioGrabber.cpp)
  target_compile_definitions(AuroraInputLinux PUBLIC AURORA_INPUT_LINUX_AUDIO_AVAILABLE=1)
  target_link_libraries(AuroraInputLinux PUBLIC PkgConfig::PIPEWIRE)
endif()

if(AURORA_INPUT_LINUX_BUILD_TESTS)
  enable_testing()
  add_subdirectory(tests)
endif()
