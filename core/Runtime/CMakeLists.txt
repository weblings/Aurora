# Generic Config/ZoneMap/compositing pieces from RuntimeAnalysis.md, plus
# Orchestrator -- allowed to depend on both Input and Output interfaces,
# since gluing them together is their entire job. AudioOrchestrator is
# added below, only if AuroraAudioProcessing (and the aubio it requires)
# is actually being built -- see core/CMakeLists.txt's
# AURORA_CORE_ENABLE_AUDIO option.
add_library(AuroraRuntime STATIC
  src/Config.cpp
  src/ConfigStore.cpp
  src/ZoneMapStore.cpp
  src/ZoneReconciler.cpp
  src/FrameCompositor.cpp
  src/Smoother.cpp
  src/SubsampleDefaults.cpp
  src/MonitorSelector.cpp
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

if(TARGET AuroraAudioProcessing)
  target_sources(AuroraRuntime PRIVATE src/AudioFrameCompositor.cpp src/AudioOrchestrator.cpp)
  target_link_libraries(AuroraRuntime PUBLIC AuroraAudioProcessing)
  # Lets a consumer's main.cpp #ifdef around AudioOrchestrator.hpp, same
  # pattern as AURORA_INPUT_WINDOWS_AUDIO_AVAILABLE.
  target_compile_definitions(AuroraRuntime PUBLIC AURORA_RUNTIME_AUDIO_AVAILABLE=1)
endif()
