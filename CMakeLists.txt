cmake_minimum_required(VERSION 3.14)

project(AuroraOutputHue)

option(AURORA_OUTPUT_HUE_BUILD_TESTS "Build this plugin's own tests" TRUE)
# The I/O layer (REST discovery + DTLS streaming) is one interdependent unit
# -- a Hue plugin isn't useful with only one half -- so it's one toggle, not
# per-dependency like Aurora-Input-Linux's X11/Pipewire backends.
option(AURORA_OUTPUT_HUE_ENABLE_IO "Build the REST/DTLS I/O layer (needs libcurl, Mbed TLS)" TRUE)

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

# nlohmann_json -- same fetch-if-missing pattern as Aurora core's own.
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

add_library(AuroraOutputHue STATIC
  src/Colorimetry.cpp
  src/Channel.cpp
  src/HuestreamHeader.cpp
  src/BridgeAddress.cpp
  src/Credentials.cpp
)

target_include_directories(AuroraOutputHue PUBLIC
  ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_link_libraries(AuroraOutputHue PUBLIC
  AuroraContracts
  AuroraOutputInterface
  nlohmann_json::nlohmann_json
)

target_compile_features(AuroraOutputHue PUBLIC cxx_std_20)

if(AURORA_OUTPUT_HUE_ENABLE_IO)
  find_package(CURL REQUIRED)
  find_package(PkgConfig REQUIRED)
  pkg_check_modules(MBEDTLS QUIET IMPORTED_TARGET mbedtls mbedx509 mbedcrypto)

  if(NOT MBEDTLS_FOUND)
    # Ubuntu's libmbedtls-dev (2.28.x) ships no .pc files at all -- fall
    # back to a manual find of the same three libraries pkg-config would
    # have located.
    find_library(MBEDTLS_LIB mbedtls REQUIRED)
    find_library(MBEDX509_LIB mbedx509 REQUIRED)
    find_library(MBEDCRYPTO_LIB mbedcrypto REQUIRED)
    add_library(PkgConfig::MBEDTLS INTERFACE IMPORTED)
    target_link_libraries(PkgConfig::MBEDTLS INTERFACE ${MBEDTLS_LIB} ${MBEDX509_LIB} ${MBEDCRYPTO_LIB})
  endif()

  target_sources(AuroraOutputHue PRIVATE
    src/HttpClient.cpp
    src/ApiTools.cpp
    src/EntertainmentConfigurationSelector.cpp
    src/DtlsClient.cpp
    src/Streamer.cpp
    src/HueOutput.cpp
  )
  target_compile_definitions(AuroraOutputHue PUBLIC AURORA_OUTPUT_HUE_IO_AVAILABLE=1)
  target_link_libraries(AuroraOutputHue PUBLIC CURL::libcurl PkgConfig::MBEDTLS)
endif()

if(AURORA_OUTPUT_HUE_BUILD_TESTS)
  enable_testing()
  add_subdirectory(tests)
endif()
