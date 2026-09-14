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

add_executable(AuroraProcessingTests
  ProcessingTests.cpp
)

target_link_libraries(AuroraProcessingTests PRIVATE
  AuroraProcessing
  Catch2::Catch2WithMain
)

target_compile_features(AuroraProcessingTests PUBLIC cxx_std_20)

add_executable(AuroraRuntimeTests
  RuntimeTests.cpp
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

add_executable(AuroraAudioProcessingTests
  AudioProcessingTests.cpp
)

target_link_libraries(AuroraAudioProcessingTests PRIVATE
  AuroraAudioProcessing
  Catch2::Catch2WithMain
)

target_compile_features(AuroraAudioProcessingTests PUBLIC cxx_std_20)

# enable_testing() lives in the parent CMakeLists.txt now, not here -- see
# the comment there. Only need Catch2's own CTest-integration module here.
include(Catch)
catch_discover_tests(AuroraProcessingTests)
catch_discover_tests(AuroraRuntimeTests)
catch_discover_tests(AuroraOrchestratorTests)
catch_discover_tests(AuroraAudioProcessingTests)
