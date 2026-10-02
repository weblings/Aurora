# Catch2 v3, fetched the same way huenicorn fetches glm/nlohmann_json/httplib
# when not already installed -- keeps the dependency-management style
# consistent with the rest of this port.
find_package(Catch2 3 QUIET)
if(NOT Catch2_FOUND)
  message(STATUS "Catch2 is not installed. Now fetching online...")
  FetchContent_Declare(
    Catch2
    GIT_REPOSITORY https://github.com/catchorg/Catch2.git
    GIT_TAG v3.6.0
  )
  FetchContent_MakeAvailable(Catch2)
  # Fetched (not find_package-installed) Catch2 doesn't register its own
  # extras/ dir on CMAKE_MODULE_PATH the way an installed package config
  # does -- add it explicitly so `include(Catch)` below can find it.
  list(APPEND CMAKE_MODULE_PATH ${catch2_SOURCE_DIR}/extras)
else()
  message(STATUS "Catch2 is installed")
endif()

add_executable(AuroraNetworkTests
  NetworkTests.cpp
  WebSocketSmokeTests.cpp
)

target_link_libraries(AuroraNetworkTests PRIVATE
  AuroraNetwork
  httplib::httplib
  Catch2::Catch2WithMain
)

target_compile_features(AuroraNetworkTests PUBLIC cxx_std_20)

add_executable(AuroraProcessingTests
  ProcessingTests.cpp
)

target_link_libraries(AuroraProcessingTests PRIVATE
  AuroraProcessing
  Catch2::Catch2WithMain
)

target_compile_features(AuroraProcessingTests PUBLIC cxx_std_20)

add_executable(AuroraControlDescriptorTests
  ControlDescriptorTests.cpp
)

target_link_libraries(AuroraControlDescriptorTests PRIVATE
  AuroraRuntime
  Catch2::Catch2WithMain
)

target_compile_features(AuroraControlDescriptorTests PUBLIC cxx_std_20)

add_executable(AuroraRuntimeTests
  RuntimeTests.cpp
  RegistryTests.cpp
)

target_link_libraries(AuroraRuntimeTests PRIVATE
  AuroraRuntime
  Catch2::Catch2WithMain
)

target_compile_features(AuroraRuntimeTests PUBLIC cxx_std_20)

add_executable(AuroraOrchestratorTests
  OrchestratorTests.cpp
)

target_link_libraries(AuroraOrchestratorTests PRIVATE
  AuroraRuntime
  Catch2::Catch2WithMain
)

target_compile_features(AuroraOrchestratorTests PUBLIC cxx_std_20)

add_executable(AuroraDevFrameDumpTests
  DevFrameDumpTests.cpp
)

target_link_libraries(AuroraDevFrameDumpTests PRIVATE
  AuroraRuntime
  Catch2::Catch2WithMain
)

target_compile_features(AuroraDevFrameDumpTests PUBLIC cxx_std_20)

# Golden parity harness (Aurora-tft) -- fixtures live in the source tree so
# AURORA_UPDATE_GOLDEN=1 rewrites the committed files in place.
set(AURORA_GOLDEN_DIR "${CMAKE_CURRENT_SOURCE_DIR}/golden")

add_executable(AuroraVideoParityTests
  VideoParityTests.cpp
)

target_link_libraries(AuroraVideoParityTests PRIVATE
  AuroraRuntime
  nlohmann_json::nlohmann_json
  Catch2::Catch2WithMain
)

target_compile_definitions(AuroraVideoParityTests PRIVATE AURORA_GOLDEN_DIR="${AURORA_GOLDEN_DIR}")
target_compile_features(AuroraVideoParityTests PUBLIC cxx_std_20)

# All three gated on AURORA_CORE_ENABLE_AUDIO -- AuroraAudioProcessing
# (and the aubio it requires) may not exist in a video-only build.
if(TARGET AuroraAudioProcessing)
  add_executable(AuroraAudioProcessingTests
    AudioProcessingTests.cpp
  )

  target_link_libraries(AuroraAudioProcessingTests PRIVATE
    AuroraAudioProcessing
    Catch2::Catch2WithMain
  )

  target_compile_features(AuroraAudioProcessingTests PUBLIC cxx_std_20)

  add_executable(AuroraAudioOrchestratorTests
    AudioOrchestratorTests.cpp
  )

  target_link_libraries(AuroraAudioOrchestratorTests PRIVATE
    AuroraRuntime
    Catch2::Catch2WithMain
  )

  target_compile_features(AuroraAudioOrchestratorTests PUBLIC cxx_std_20)

  add_executable(AuroraAudioFeatureExtractorTests
    AudioFeatureExtractorTests.cpp
  )

  target_link_libraries(AuroraAudioFeatureExtractorTests PRIVATE
    AuroraAudioProcessing
    Catch2::Catch2WithMain
  )

  target_compile_features(AuroraAudioFeatureExtractorTests PUBLIC cxx_std_20)

  add_executable(AuroraAudioParityTests
    AudioParityTests.cpp
  )

  target_link_libraries(AuroraAudioParityTests PRIVATE
    AuroraRuntime
    nlohmann_json::nlohmann_json
    Catch2::Catch2WithMain
  )

  target_compile_definitions(AuroraAudioParityTests PRIVATE AURORA_GOLDEN_DIR="${AURORA_GOLDEN_DIR}")
  target_compile_features(AuroraAudioParityTests PUBLIC cxx_std_20)
endif()

# Aurora-lzj: round-trip embed_webroot.py over a generated webroot, including a
# 400 KB file past MSVC's believed ~64 KB concatenated-literal cap. Python is
# already required by every app's webroot embed; skipped without it here.
find_package(Python3 COMPONENTS Interpreter)
if(Python3_FOUND)
  set(_AURORA_EMBED_FIXTURE_DIR "${CMAKE_CURRENT_BINARY_DIR}/embed-fixture")
  set(_AURORA_EMBED_FIXTURE_HEADER "${CMAKE_CURRENT_BINARY_DIR}/EmbedFixture.hpp")
  set(_AURORA_EMBED_SCRIPT "${CMAKE_CURRENT_SOURCE_DIR}/../Network/tools/embed_webroot.py")

  add_custom_command(
    OUTPUT "${_AURORA_EMBED_FIXTURE_HEADER}"
    COMMAND Python3::Interpreter "${CMAKE_CURRENT_SOURCE_DIR}/make_embed_fixture.py" "${_AURORA_EMBED_FIXTURE_DIR}"
    COMMAND Python3::Interpreter "${_AURORA_EMBED_SCRIPT}" "${_AURORA_EMBED_FIXTURE_DIR}" "${_AURORA_EMBED_FIXTURE_HEADER}" EmbedFixture
    DEPENDS "${CMAKE_CURRENT_SOURCE_DIR}/make_embed_fixture.py" "${_AURORA_EMBED_SCRIPT}"
    COMMENT "Generating and embedding the embed_webroot.py round-trip fixture"
    VERBATIM
  )

  add_executable(AuroraEmbedWebrootTests
    EmbedWebrootTests.cpp
    "${_AURORA_EMBED_FIXTURE_HEADER}"
  )

  target_include_directories(AuroraEmbedWebrootTests PRIVATE "${CMAKE_CURRENT_BINARY_DIR}")
  target_link_libraries(AuroraEmbedWebrootTests PRIVATE Catch2::Catch2WithMain)
  target_compile_definitions(AuroraEmbedWebrootTests PRIVATE AURORA_EMBED_FIXTURE_DIR="${_AURORA_EMBED_FIXTURE_DIR}")
  target_compile_features(AuroraEmbedWebrootTests PUBLIC cxx_std_20)
else()
  message(STATUS "Python3 not found -- skipping AuroraEmbedWebrootTests")
endif()

# enable_testing() lives in the parent CMakeLists.txt now, not here -- see
# the comment there. Only need Catch2's own CTest-integration module here.
include(Catch)
catch_discover_tests(AuroraNetworkTests)
catch_discover_tests(AuroraProcessingTests)
catch_discover_tests(AuroraControlDescriptorTests)
catch_discover_tests(AuroraRuntimeTests)
catch_discover_tests(AuroraOrchestratorTests)
catch_discover_tests(AuroraDevFrameDumpTests)
catch_discover_tests(AuroraVideoParityTests)
if(TARGET AuroraEmbedWebrootTests)
  catch_discover_tests(AuroraEmbedWebrootTests)
endif()
if(TARGET AuroraAudioProcessing)
  catch_discover_tests(AuroraAudioProcessingTests)
  catch_discover_tests(AuroraAudioOrchestratorTests)
  catch_discover_tests(AuroraAudioFeatureExtractorTests)
  catch_discover_tests(AuroraAudioParityTests)
endif()
