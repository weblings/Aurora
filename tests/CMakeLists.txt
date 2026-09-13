# Same Catch2 fetch pattern as Aurora core's own tests -- see that repo's
# core/tests/CMakeLists.txt and Analysis/lessons/engineering-hygiene.md for
# why enable_testing() belongs in the parent CMakeLists.txt, not here.
find_package(Catch2 3 QUIET)
if(NOT Catch2_FOUND)
  message(STATUS "Catch2 is not installed. Now fetching online...")
  FetchContent_Declare(
    Catch2
    GIT_REPOSITORY https://github.com/catchorg/Catch2.git
    GIT_TAG v3.6.0
  )
  FetchContent_MakeAvailable(Catch2)
  list(APPEND CMAKE_MODULE_PATH ${catch2_SOURCE_DIR}/extras)
else()
  message(STATUS "Catch2 is installed")
endif()

add_executable(AuroraOutputHueTests
  HueOutputTests.cpp
)

target_link_libraries(AuroraOutputHueTests PRIVATE
  AuroraOutputHue
  Catch2::Catch2WithMain
)

target_compile_features(AuroraOutputHueTests PUBLIC cxx_std_20)

include(Catch)
catch_discover_tests(AuroraOutputHueTests)
