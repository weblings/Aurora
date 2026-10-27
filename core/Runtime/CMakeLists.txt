# Generic Config/ZoneMap/compositing pieces from RuntimeAnalysis.md, plus
# GraphRunner -- allowed to depend on both Input and Output interfaces,
# since gluing them together is their entire job. The audio nodes are
# added below, only if AuroraAudioProcessing (and the aubio it requires)
# is actually being built -- see core/CMakeLists.txt's
# AURORA_CORE_ENABLE_AUDIO option.
add_library(AuroraRuntime STATIC
  src/Config.cpp
  src/ConfigApply.cpp
  src/ConfigStore.cpp
  src/EffectStore.cpp
  src/EffectsRoutes.cpp
  src/DraftStore.cpp
  src/DraftRoutes.cpp
  src/ApplyRoutes.cpp
  src/LightTest.cpp
  src/TestRoutes.cpp
  src/GraphPreview.cpp
  src/PreviewRoutes.cpp
  src/ControlDescriptors.cpp
  src/ControlDescriptorTables.cpp
  src/ZoneMapStore.cpp
  src/ZoneReconciler.cpp
  src/FrameCompositor.cpp
  src/Smoother.cpp
  src/BrightnessFloor.cpp
  src/SubsampleDefaults.cpp
  src/MonitorSelector.cpp
  src/Registry.cpp
  src/Graph/GraphTypes.cpp
  src/Graph/NodeRegistry.cpp
  src/Graph/VideoNodes.cpp
  src/Graph/FrameNodes.cpp
  src/Graph/MathNodes.cpp
  src/Graph/TimeNodes.cpp
  src/Graph/ColorNodes.cpp
  src/Graph/BlendNodes.cpp
  src/Graph/SpatialNodes.cpp
  src/Graph/AllNodes.cpp
  src/Graph/BuiltInGraphs.cpp
  src/Graph/Graph.cpp
  src/Graph/GraphLoader.cpp
  src/GraphRoutes.cpp
  src/PresetRoutes.cpp
  src/GraphRunner.cpp
  src/Pipeline.cpp
  src/PipelineRoutes.cpp
  src/PublicApiRoutes.cpp
  src/HostRoutes.cpp
  src/SettingsRoutes.cpp
  src/ZoneRoutes.cpp
  src/DevFrameDump.cpp
)

target_include_directories(AuroraRuntime PUBLIC
  ${CMAKE_CURRENT_SOURCE_DIR}/include
)

# AuroraNetwork comes from core/CMakeLists.txt's own add_subdirectory(Network),
# already added before this directory -- SettingsRoutes.cpp is the first
# thing in Runtime to register HTTP routes of its own.
target_link_libraries(AuroraRuntime PUBLIC
  AuroraContracts
  AuroraProcessing
  AuroraInputInterface
  AuroraOutputInterface
  AuroraNetwork
  nlohmann_json::nlohmann_json
)

target_compile_features(AuroraRuntime PUBLIC cxx_std_20)

if(WIN32)
  # DevFrameDump's Winsock sender (static lib, so consumers -- including
  # core's own test exes -- must resolve the symbols).
  target_link_libraries(AuroraRuntime PUBLIC ws2_32)
endif()

if(TARGET AuroraAudioProcessing)
  target_sources(AuroraRuntime PRIVATE src/AudioFrameCompositor.cpp src/Graph/AudioNodes.cpp)
  target_link_libraries(AuroraRuntime PUBLIC AuroraAudioProcessing)
  # Lets a consumer's main.cpp #ifdef around audio code, same
  # pattern as AURORA_INPUT_WINDOWS_AUDIO_AVAILABLE.
  target_compile_definitions(AuroraRuntime PUBLIC AURORA_RUNTIME_AUDIO_AVAILABLE=1)
endif()
