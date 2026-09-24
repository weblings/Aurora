cmake_minimum_required(VERSION 3.14)

# Single truth for the app version (Aurora-qdk): by convention it matches
# CHANGELOG.txt's hand-written top entry; the apps compile it into their
# /api/version route. Agents: bump the version only when asked, and never
# edit CHANGELOG.txt -- its entries are the maintainer's own notes, and
# nothing enforces the mirror.
project(AuroraMonorepo VERSION 1.0.2)

# Thin superbuild: selects slices, forwards nothing. Each slice pulls core/
# itself via FetchContent (SOURCE_DIR into this tree), so this file never
# calls add_subdirectory(core) directly -- FetchContent dedups AuroraCore by
# name across slices instead of adding it twice. The apps' plugin FetchContent
# blocks are guarded by NOT TARGET for the same reason: when this file adds
# a plugin dir below, the app reuses the already-built target.
#
# Core's own test suite is NOT part of any superbuild preset (slices force
# core BUILD_TESTS off when they fetch it). Build it standalone:
#   cmake -S core -B build-core-test
# Plugin-focused work likewise configures the plugin dir directly
# (cmake -S input/windows); presets below cover the full-app builds.

if(CMAKE_SYSTEM_NAME STREQUAL "Linux")
  set(_AURORA_ON_LINUX ON)
else()
  set(_AURORA_ON_LINUX OFF)
endif()
if(CMAKE_SYSTEM_NAME STREQUAL "Windows")
  set(_AURORA_ON_WINDOWS ON)
else()
  set(_AURORA_ON_WINDOWS OFF)
endif()

option(AURORA_ENABLE_INPUT_LINUX "Build input/linux (X11/PipeWire)" ${_AURORA_ON_LINUX})
option(AURORA_ENABLE_INPUT_WINDOWS "Build input/windows (DXGI/WASAPI)" ${_AURORA_ON_WINDOWS})
option(AURORA_ENABLE_OUTPUT_HUE "Build output/hue (needs libcurl, Mbed TLS)" ON)
option(AURORA_ENABLE_APP_LINUX "Build app/linux" ${_AURORA_ON_LINUX})
option(AURORA_ENABLE_APP_WINDOWS "Build app/windows" ${_AURORA_ON_WINDOWS})

# Unlike Linux/Windows above, NOT auto-set ON on Darwin: input/mac and
# app/mac don't exist yet (Aurora-8mk.2/.3), so add_subdirectory() below
# would fail the configure step the moment this defaulted on on a Mac.
# Flip the default once those slices land; until then this is here so
# CMakePresets.json's mac-app preset (and CI) have something to target.
option(AURORA_ENABLE_INPUT_MAC "Build input/mac (ScreenCaptureKit)" OFF)
option(AURORA_ENABLE_APP_MAC "Build app/mac" OFF)

include(CTest)

if(AURORA_ENABLE_INPUT_LINUX)
  add_subdirectory(input/linux)
endif()
if(AURORA_ENABLE_INPUT_WINDOWS)
  add_subdirectory(input/windows)
endif()
if(AURORA_ENABLE_INPUT_MAC)
  add_subdirectory(input/mac)
endif()
if(AURORA_ENABLE_OUTPUT_HUE)
  add_subdirectory(output/hue)
endif()
if(AURORA_ENABLE_APP_LINUX)
  add_subdirectory(app/linux)
endif()
if(AURORA_ENABLE_APP_WINDOWS)
  add_subdirectory(app/windows)
endif()
if(AURORA_ENABLE_APP_MAC)
  add_subdirectory(app/mac)
endif()
