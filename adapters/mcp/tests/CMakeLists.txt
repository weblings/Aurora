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

add_executable(AuroraMcpTests McpServerTests.cpp)
target_link_libraries(AuroraMcpTests PRIVATE AuroraMcpCore Catch2::Catch2WithMain)

include(Catch)
catch_discover_tests(AuroraMcpTests)
