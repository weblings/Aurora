# AuroraGraphEngine: the node graph and everything it evaluates, with no HTTP,
# filesystem or thread use (Aurora-51nv.5). The WASM build compiles this target
# alone (AURORA_CORE_GRAPH_ONLY). Sources and headers stay under src/ and include/.
add_library(AuroraGraphEngine STATIC
  src/Config.cpp
  src/ControlDescriptors.cpp
  src/ControlDescriptorTables.cpp
  src/FrameCompositor.cpp
  src/Smoother.cpp
  src/BrightnessFloor.cpp
  src/GraphValidation.cpp
  src/NodeCatalog.cpp
  src/PreviewEvaluator.cpp
  src/ZoneMapJson.cpp
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
)

target_include_directories(AuroraGraphEngine PUBLIC
  ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_link_libraries(AuroraGraphEngine PUBLIC
  AuroraContracts
  AuroraProcessing
  AuroraInputInterface
  AuroraOutputInterface
  nlohmann_json::nlohmann_json
)

target_compile_features(AuroraGraphEngine PUBLIC cxx_std_20)

if(TARGET AuroraAudioProcessing)
  target_sources(AuroraGraphEngine PRIVATE src/AudioFrameCompositor.cpp src/Graph/AudioNodes.cpp)
  target_link_libraries(AuroraGraphEngine PUBLIC AuroraAudioProcessing)
  # Lets a consumer's main.cpp #ifdef around audio code, same
  # pattern as AURORA_INPUT_WINDOWS_AUDIO_AVAILABLE.
  target_compile_definitions(AuroraGraphEngine PUBLIC AURORA_RUNTIME_AUDIO_AVAILABLE=1)
endif()

if(AURORA_CORE_GRAPH_ONLY)
  return()
endif()

# AuroraRuntime: config persistence, the HTTP routes, pipeline and zone stores.
# It links AuroraGraphEngine, so consumers see the graph through it.
add_library(AuroraRuntime STATIC
  src/ConfigApply.cpp
  src/ConfigStore.cpp
  src/EffectStore.cpp
  src/EffectsRoutes.cpp
  src/DraftStore.cpp
  src/DraftRoutes.cpp
  src/DescriptorRoutes.cpp
  src/ApplyRoutes.cpp
  src/LightTest.cpp
  src/TestRoutes.cpp
  src/GraphPreview.cpp
  src/PreviewRoutes.cpp
  src/ZoneMapStore.cpp
  src/ZoneReconciler.cpp
  src/SubsampleDefaults.cpp
  src/MonitorSelector.cpp
  src/Registry.cpp
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
  AuroraGraphEngine
  AuroraContracts
  AuroraProcessing
  AuroraInputInterface
  AuroraOutputInterface
  AuroraNetwork
  nlohmann_json::nlohmann_json
)

target_compile_features(AuroraRuntime PUBLIC cxx_std_20)

# Reported by GET /api/version as buildType. $<CONFIG> is empty on single-config builds
# with no CMAKE_BUILD_TYPE (CI), so fall back to "unknown".
set_source_files_properties(src/HostRoutes.cpp PROPERTIES COMPILE_DEFINITIONS "AURORA_BUILD_TYPE=\"$<IF:$<BOOL:$<CONFIG>>,$<CONFIG>,unknown>\"")

if(WIN32)
  # DevFrameDump's Winsock sender (static lib, so consumers -- including
  # core's own test exes -- must resolve the symbols).
  target_link_libraries(AuroraRuntime PUBLIC ws2_32)
endif()
