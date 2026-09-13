# Generic Config/ZoneMap/compositing pieces from RuntimeAnalysis.md -- the
# actual orchestrating Runtime lifecycle class is a later pass (see the doc).
add_library(AuroraRuntime STATIC
  src/Config.cpp
  src/ConfigStore.cpp
  src/ZoneMapStore.cpp
  src/ZoneReconciler.cpp
  src/FrameCompositor.cpp
  src/Smoother.cpp
)

target_include_directories(AuroraRuntime PUBLIC
  ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_link_libraries(AuroraRuntime PUBLIC
  AuroraContracts
  AuroraProcessing
  nlohmann_json::nlohmann_json
)

target_compile_features(AuroraRuntime PUBLIC cxx_std_20)
