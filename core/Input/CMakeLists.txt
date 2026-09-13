# Aurora::Input's stable interface -- header-only, no concrete plugins here.
# Plugin repos (Aurora-Input-Linux, etc.) depend on this + AuroraContracts,
# not on each other or on the app.

add_library(AuroraInputInterface INTERFACE)

target_include_directories(AuroraInputInterface INTERFACE
  ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_link_libraries(AuroraInputInterface INTERFACE
  AuroraContracts
  glm::glm
)

target_compile_features(AuroraInputInterface INTERFACE cxx_std_20)
