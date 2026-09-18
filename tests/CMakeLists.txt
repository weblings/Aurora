# Same Catch2 fetch pattern as Aurora core / Aurora-Output-Hue -- see
# Analysis/lessons/engineering-hygiene.md for why enable_testing() belongs
# in the parent CMakeLists.txt, not here.
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

add_executable(AuroraInputLinuxTests
  LinuxInputTests.cpp
  PipewireTests.cpp
  InputControlDescriptorTests.cpp
)

target_link_libraries(AuroraInputLinuxTests PRIVATE
  AuroraInputLinux
  Catch2::Catch2WithMain
)

target_compile_features(AuroraInputLinuxTests PUBLIC cxx_std_20)

include(Catch)
catch_discover_tests(AuroraInputLinuxTests)
