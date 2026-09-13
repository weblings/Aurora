# Aurora::Output's stable interface -- header-only, no concrete plugins here.
# Plugin repos (Aurora-Output-Hue, etc.) depend on this + AuroraContracts,
# not on each other or on the app.

add_library(AuroraOutputInterface INTERFACE)

target_include_directories(AuroraOutputInterface INTERFACE
  ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_link_libraries(AuroraOutputInterface INTERFACE
  AuroraContracts
)

target_compile_features(AuroraOutputInterface INTERFACE cxx_std_20)
