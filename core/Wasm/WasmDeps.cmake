# Emscripten-only dependencies and flags, included by core/CMakeLists.txt before
# the modules that need them. aubio comes from AubioFromSource.cmake. See README.md for how to produce the inputs.

set(AURORA_OPENCV_PREFIX "" CACHE PATH "Emscripten OpenCV install prefix (core and imgproc, static)")
if(NOT AURORA_OPENCV_PREFIX)
  message(FATAL_ERROR "Set AURORA_OPENCV_PREFIX (see core/Wasm/README.md)")
endif()

# OpenCV's wasm intrinsics need simd128. Exceptions are on because GraphLoader uses try/catch.
add_compile_options(-msimd128 -fexceptions)
add_link_options(-msimd128 -fexceptions)

# The installed OpenCVConfig.cmake imports 3rdparty libs of modules that were not
# built, so link the archives directly.
add_library(AuroraWasmOpenCV INTERFACE)
target_include_directories(AuroraWasmOpenCV INTERFACE ${AURORA_OPENCV_PREFIX}/include/opencv4)
target_link_libraries(AuroraWasmOpenCV INTERFACE
  ${AURORA_OPENCV_PREFIX}/lib/libopencv_imgproc.a
  ${AURORA_OPENCV_PREFIX}/lib/libopencv_core.a
  ${AURORA_OPENCV_PREFIX}/lib/opencv4/3rdparty/libzlib.a)
set(OpenCV_LIBS AuroraWasmOpenCV)
