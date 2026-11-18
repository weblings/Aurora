cmake_minimum_required(VERSION 3.14)

project(AuroraCore)

set(BUILD_TESTS TRUE CACHE BOOL "Build tests")

# Off by default for a consumer with no audio input plugin of its own yet
# (e.g. Aurora-App-Linux) -- AudioProcessing hard-requires aubio via
# find_package(CONFIG REQUIRED), which shouldn't block a video-only build.
option(AURORA_CORE_ENABLE_AUDIO "Build the audio-reactive pipeline (AudioProcessing + Runtime's audio graph nodes); requires aubio" TRUE)

# Only AuroraGraphEngine and what it links: no Network, Secrets, httplib, AuroraRuntime
# or tests. The Emscripten build requires it (see Wasm/README.md).
option(AURORA_CORE_GRAPH_ONLY "Build only the graph engine target, for the WASM build" FALSE)
if(EMSCRIPTEN AND NOT AURORA_CORE_GRAPH_ONLY)
  message(FATAL_ERROR "Emscripten builds need -DAURORA_CORE_GRAPH_ONLY=ON")
endif()
if(AURORA_CORE_GRAPH_ONLY)
  set(BUILD_TESTS FALSE)
endif()

# Compile aubio from AURORA_AUBIO_SRC with its built-in FFT instead of finding an install.
# The WASM build and the parity reference need it, so Emscripten defaults it ON.
if(EMSCRIPTEN)
  set(AURORA_AUBIO_FROM_SOURCE_DEFAULT ON)
else()
  set(AURORA_AUBIO_FROM_SOURCE_DEFAULT OFF)
endif()
option(AURORA_AUBIO_FROM_SOURCE "Build aubio from AURORA_AUBIO_SRC (see Wasm/README.md)" ${AURORA_AUBIO_FROM_SOURCE_DEFAULT})
set(AURORA_AUBIO_SRC "" CACHE PATH "aubio source root, used when AURORA_AUBIO_FROM_SOURCE is ON")

include(FetchContent)

if(EMSCRIPTEN)
  # Prebuilt OpenCV archives and aubio from source, defined before the modules that need them.
  include(Wasm/WasmDeps.cmake)
else()
  find_package(OpenCV REQUIRED COMPONENTS imgproc)
endif()
if(AURORA_AUBIO_FROM_SOURCE AND AURORA_CORE_ENABLE_AUDIO)
  include(Wasm/AubioFromSource.cmake)
endif()

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

if(NOT AURORA_CORE_GRAPH_ONLY)
  # Fetched deps must not pollute consumers' install trees with their own
  # install rules (headers, cmake configs, licenses). The apps' portable
  # install tree (StandaloneApps P3) would otherwise ship httplib's files
  # alongside the binary -- observed live via cmake --install. Off here, at
  # the single point that owns the fetch, so slice, superbuild, and plugin
  # configures are all covered regardless of add_subdirectory order.
  set(HTTPLIB_INSTALL OFF CACHE BOOL "" FORCE)

  # cpp-httplib -- same fetch-if-missing pattern as glm/nlohmann_json; also
  # huenicorn's own choice for the same job (see docs/HttpServerAnalysis.md).
  # No TLS feature enabled here -- plain HTTP only, for now (see that doc's
  # note on the vendored vcpkg port's httplib features not including mbedtls,
  # unlike the raw header itself; revisit when phase 4's HTTPS need is real).
  # Version floor: 0.46 is the first release with httplib::ws::WebSocketClient
  # (Home Assistant output). An older system copy is ignored and the fetched
  # one is used instead.
  find_package(httplib 0.46 QUIET)
  if(NOT httplib_FOUND)
    message(STATUS "httplib is not installed. Now fetching online...")
    FetchContent_Declare(
      httplib
      URL https://github.com/yhirose/cpp-httplib/archive/refs/tags/v0.46.0.tar.gz
      DOWNLOAD_EXTRACT_TIMESTAMP TRUE
    )
    FetchContent_MakeAvailable(httplib)
  else()
    message(STATUS "httplib is installed")
  endif()

  # Network has no internal-module dependency, so it can be added anywhere --
  # kept first since nothing else here depends on it either.
  add_subdirectory(Network)

  # Secrets likewise has no internal-module dependency (Aurora-2dz).
  add_subdirectory(Secrets)
endif()

# Contracts first (no internal deps), then Processing (depends on Contracts).
add_subdirectory(Contracts)
add_subdirectory(Processing)
if(AURORA_CORE_ENABLE_AUDIO)
  add_subdirectory(AudioProcessing)
endif()

# Interface-only -- concrete plugins (Aurora-Input-Linux, Aurora-Output-Hue,
# ...) live in their own repos and depend on these, not the other way round.
# See docs/ModuleSplitPlan.md's repo-split section.
add_subdirectory(Input)
add_subdirectory(Output)

# Runtime last -- its GraphRunner depends on Contracts/Processing/Input/Output.
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

# BrowserEngine (JSON engine behind the WASM exports): built natively with the tests (or the
# graph-only configure) so the sample generator can drive it, and under Emscripten for the module.
if(EMSCRIPTEN OR BUILD_TESTS OR AURORA_CORE_GRAPH_ONLY)
  add_subdirectory(Wasm/bindings)
endif()

if(BUILD_TESTS)
  add_subdirectory(tools)
endif()

if(EMSCRIPTEN)
  add_subdirectory(Wasm)
elseif(AURORA_CORE_GRAPH_ONLY)
  # Native reference for the WASM parity check, and the sample generator for its --check.
  add_subdirectory(Wasm/parity)
  add_subdirectory(tools)
endif()
