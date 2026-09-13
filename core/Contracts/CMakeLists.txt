# Aurora::Contracts -- the neutral types crossing Input/Processing/Output
# boundaries (ImageData, PixelFormat, UV/UVs, Color, Interpolation::Type).
# No transform logic here -- see Analysis/ProcessingAnalysis.md for why this
# is a separate library from Processing (Input must depend on this without
# pulling in Processing's logic).

add_library(AuroraContracts STATIC
  src/Interpolation.cpp
)

target_include_directories(AuroraContracts PUBLIC
  ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_link_libraries(AuroraContracts PUBLIC
  ${OpenCV_LIBS}
  glm::glm
)

target_compile_features(AuroraContracts PUBLIC cxx_std_20)
