# Generic Config/ZoneMap/compositing pieces from RuntimeAnalysis.md, plus
# Orchestrator/AudioOrchestrator -- the pieces here allowed to depend on
# both Input and Output interfaces, since gluing them together is their
# entire job. AuroraAudioProcessing is harmless to link unconditionally
# today (zero external deps beyond AuroraContracts) -- but once aubio gets
# wired into it, every AuroraRuntime consumer (even video-only ones) would
# be forced to link aubio too. Revisit then: likely split AudioOrchestrator
# into its own optional target, same CMake-option-gating pattern
# Aurora-Input-Linux already uses for X11 vs. Pipewire.
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
  src/AudioFrameCompositor.cpp
  src/AudioOrchestrator.cpp
)

target_include_directories(AuroraRuntime PUBLIC
  ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_link_libraries(AuroraRuntime PUBLIC
  AuroraContracts
  AuroraProcessing
  AuroraAudioProcessing
  AuroraInputInterface
  AuroraOutputInterface
  nlohmann_json::nlohmann_json
)

target_compile_features(AuroraRuntime PUBLIC cxx_std_20)
