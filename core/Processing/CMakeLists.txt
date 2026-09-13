# Aurora::Processing -- the transform logic operating on Contracts types
# (rescale/crop/dominant-color today; motion/detection/ISF-input-mapping
# analyzers slot in here later, per ModuleSplitPlan.md). Depends on
# Contracts, has no Hue/Input/Output-specific knowledge.

add_library(AuroraProcessing STATIC
  src/ImageProcessing.cpp
)

target_include_directories(AuroraProcessing PUBLIC
  ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_link_libraries(AuroraProcessing PUBLIC
  AuroraContracts
  ${OpenCV_LIBS}
)

target_compile_features(AuroraProcessing PUBLIC cxx_std_20)
