# OS secret store (Aurora-2dz) -- own library so only outputs that hold
# credentials link it, and Linux's libsecret stays out of everything else.
# One platform backend per build; Linux without libsecret builds a stub that
# reports Unavailable rather than failing configure.
option(AURORA_SECRETS_ENABLE_LIBSECRET "Linux: use libsecret (Secret Service) when found; needs libsecret-1-dev" TRUE)

add_library(AuroraSecrets STATIC
  src/SecretStore.cpp
  src/FileSecretStore.cpp
)

target_include_directories(AuroraSecrets PUBLIC
  ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_link_libraries(AuroraSecrets PRIVATE
  nlohmann_json::nlohmann_json
)

target_compile_features(AuroraSecrets PUBLIC cxx_std_20)

if(APPLE)
  target_sources(AuroraSecrets PRIVATE src/KeychainSecretStore.cpp)
  target_link_libraries(AuroraSecrets PUBLIC "-framework Security" "-framework CoreFoundation")
  set(AURORA_SECRETS_BACKEND "Keychain")
elseif(WIN32)
  target_sources(AuroraSecrets PRIVATE src/CredentialManagerSecretStore.cpp)
  target_link_libraries(AuroraSecrets PUBLIC advapi32)
  set(AURORA_SECRETS_BACKEND "Credential Manager")
else()
  # QUIET + IMPORTED_TARGET: a missing dev package downgrades to the stub
  # with a warning, not a configure failure (lesson: "A distro dev package
  # can lack the .pc file ..." in build-toolchain.md).
  if(AURORA_SECRETS_ENABLE_LIBSECRET)
    find_package(PkgConfig QUIET)
    if(PKG_CONFIG_FOUND)
      pkg_check_modules(LIBSECRET QUIET IMPORTED_TARGET libsecret-1)
    endif()
  endif()

  if(TARGET PkgConfig::LIBSECRET)
    target_sources(AuroraSecrets PRIVATE src/LibsecretSecretStore.cpp)
    target_link_libraries(AuroraSecrets PRIVATE PkgConfig::LIBSECRET)
    set(AURORA_SECRETS_BACKEND "Secret Service (libsecret ${LIBSECRET_VERSION})")
  else()
    target_sources(AuroraSecrets PRIVATE src/UnavailableSecretStore.cpp)
    set(AURORA_SECRETS_BACKEND "none")
    if(AURORA_SECRETS_ENABLE_LIBSECRET)
      message(WARNING "libsecret-1 not found (install libsecret-1-dev): AuroraSecrets builds without an OS secret store")
    endif()
  endif()
endif()

# Lets the opt-in real-backend test skip cleanly where there is no store.
if(AURORA_SECRETS_BACKEND STREQUAL "none")
  target_compile_definitions(AuroraSecrets PUBLIC AURORA_SECRETS_HAS_OS_STORE=0)
else()
  target_compile_definitions(AuroraSecrets PUBLIC AURORA_SECRETS_HAS_OS_STORE=1)
endif()

message(STATUS "AuroraSecrets backend: ${AURORA_SECRETS_BACKEND}")
