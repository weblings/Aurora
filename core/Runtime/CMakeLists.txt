# Generic Config/ZoneMap/compositing pieces from RuntimeAnalysis.md, plus
# Orchestrator -- the one piece here allowed to depend on both Input and
# Output interfaces, since gluing them together is its entire job.
add_library(AuroraRuntime STATIC
  src/Config.cpp
  src/ConfigStore.cpp
  src/ZoneMapStore.cpp
  src/ZoneReconciler.cpp
  src/FrameCompositor.cpp
  src/Smoother.cpp
  src/SubsampleDefaults.cpp
  src/Orchestrator.cpp
)

target_include_directories(AuroraRuntime PUBLIC
  ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_link_libraries(AuroraRuntime PUBLIC
  AuroraContracts
  AuroraProcessing
  AuroraInputInterface
  AuroraOutputInterface
  nlohmann_json::nlohmann_json
)

target_compile_features(AuroraRuntime PUBLIC cxx_std_20)
