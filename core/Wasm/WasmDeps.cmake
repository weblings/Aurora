# Emscripten-only dependencies and flags, included by core/CMakeLists.txt before
# the modules that need them. See README.md for how to produce the inputs.

set(AURORA_OPENCV_PREFIX "" CACHE PATH "Emscripten OpenCV install prefix (core and imgproc, static)")
set(AURORA_AUBIO_SRC "" CACHE PATH "aubio source root, compiled here without its io/ readers")
if(NOT AURORA_OPENCV_PREFIX OR NOT AURORA_AUBIO_SRC)
  message(FATAL_ERROR "Set AURORA_OPENCV_PREFIX and AURORA_AUBIO_SRC (see core/Wasm/README.md)")
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

# aubio with its built-in FFT, so AudioProcessing's find_package branch is skipped.
file(GLOB_RECURSE AUBIO_SOURCES ${AURORA_AUBIO_SRC}/src/*.c)
list(FILTER AUBIO_SOURCES EXCLUDE REGEX "/src/io/")
list(FILTER AUBIO_SOURCES EXCLUDE REGEX "/src/utils/windll\.c")
add_library(aubio STATIC ${AUBIO_SOURCES})
# Consumers include <aubio/aubio.h>, as the vcpkg and apt installs lay it out.
file(COPY ${AURORA_AUBIO_SRC}/src/ DESTINATION ${CMAKE_BINARY_DIR}/aubio-include/aubio FILES_MATCHING PATTERN "*.h")
target_include_directories(aubio PUBLIC ${AURORA_AUBIO_SRC}/src ${CMAKE_BINARY_DIR}/aubio-include)
target_compile_definitions(aubio PUBLIC
  HAVE_STDLIB_H=1 HAVE_STDIO_H=1 HAVE_MATH_H=1 HAVE_STRING_H=1
  HAVE_LIMITS_H=1 HAVE_STDARG_H=1 HAVE_ERRNO_H=1 HAVE_C99_VARARGS_MACROS=1)
target_compile_options(aubio PRIVATE -w)
add_library(Aubio::aubio ALIAS aubio)
