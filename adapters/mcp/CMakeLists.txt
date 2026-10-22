cmake_minimum_required(VERSION 3.14)

project(AuroraMcpAdapter)

option(AURORA_MCP_BUILD_TESTS "Build the MCP adapter's own tests" TRUE)

include(FetchContent)

# Same fetch-if-missing pattern as core/CMakeLists.txt. NOT TARGET guards: the
# superbuild may already have them from a slice that fetched core.
if(NOT TARGET nlohmann_json::nlohmann_json)
  find_package(nlohmann_json QUIET)
  if(NOT nlohmann_json_FOUND)
    FetchContent_Declare(
      nlohmann_json
      URL https://github.com/nlohmann/json/releases/download/v3.11.3/json.tar.xz
      DOWNLOAD_EXTRACT_TIMESTAMP TRUE
    )
    FetchContent_MakeAvailable(nlohmann_json)
  endif()
endif()

if(NOT TARGET httplib::httplib)
  set(HTTPLIB_INSTALL OFF CACHE BOOL "" FORCE)
  find_package(httplib 0.46 QUIET)
  if(NOT httplib_FOUND)
    FetchContent_Declare(
      httplib
      URL https://github.com/yhirose/cpp-httplib/archive/refs/tags/v0.46.0.tar.gz
      DOWNLOAD_EXTRACT_TIMESTAMP TRUE
    )
    FetchContent_MakeAvailable(httplib)
  endif()
endif()

# Protocol logic as a library so tests link it without main().
add_library(AuroraMcpCore STATIC src/McpServer.cpp)
target_include_directories(AuroraMcpCore PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/src)
target_link_libraries(AuroraMcpCore PUBLIC nlohmann_json::nlohmann_json)
target_compile_features(AuroraMcpCore PUBLIC cxx_std_20)

add_executable(aurora-mcp src/main.cpp)
target_link_libraries(aurora-mcp PRIVATE AuroraMcpCore httplib::httplib)
# Same portable getenv() the apps use, not MSVC's _dupenv_s.
target_compile_definitions(aurora-mcp PRIVATE _CRT_SECURE_NO_WARNINGS)
if(DEFINED AuroraMonorepo_VERSION)
  target_compile_definitions(aurora-mcp PRIVATE AURORA_VERSION="${AuroraMonorepo_VERSION}")
endif()
# Beside Aurora in the build tree, where the apps stage it for bundling.
set_target_properties(aurora-mcp PROPERTIES
  OUTPUT_NAME "aurora-mcp"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin"
)

include(GNUInstallDirs)
install(TARGETS aurora-mcp RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR})

if(AURORA_MCP_BUILD_TESTS)
  enable_testing()
  add_subdirectory(tests)
endif()
