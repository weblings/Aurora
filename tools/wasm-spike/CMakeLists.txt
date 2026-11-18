# WASM spike (Aurora-51nv.4): the graph code plus a driver, built native or
# with Emscripten from the same source list. See README.md for the steps.
cmake_minimum_required(VERSION 3.20)
project(AuroraWasmSpike C CXX)

set(CMAKE_CXX_STANDARD 20)
set(CORE ${CMAKE_CURRENT_SOURCE_DIR}/../../core)

set(AURORA_GLM_INCLUDE "" CACHE PATH "glm source root (header-only)")
set(AURORA_JSON_INCLUDE "" CACHE PATH "nlohmann_json include dir")
set(AURORA_AUBIO_SRC "" CACHE PATH "aubio source root, used for the Emscripten build")

set(AURORA_OPENCV_PREFIX "" CACHE PATH "Emscripten OpenCV install prefix (core, imgproc)")
if(EMSCRIPTEN)
  # OpenCVConfig.cmake references 3rdparty libs of modules we did not build, so link the archives directly.
  set(OpenCV_INCLUDE_DIRS ${AURORA_OPENCV_PREFIX}/include/opencv4)
  set(OpenCV_LIBS
    ${AURORA_OPENCV_PREFIX}/lib/libopencv_imgproc.a
    ${AURORA_OPENCV_PREFIX}/lib/libopencv_core.a
    ${AURORA_OPENCV_PREFIX}/lib/opencv4/3rdparty/libzlib.a)
else()
  find_package(OpenCV REQUIRED COMPONENTS core imgproc)
endif()

if(EMSCRIPTEN)
  # aubio without its io/ readers (they need sndfile/ffmpeg); FFT is aubio's built-in.
  file(GLOB_RECURSE AUBIO_SOURCES ${AURORA_AUBIO_SRC}/src/*.c)
  list(FILTER AUBIO_SOURCES EXCLUDE REGEX "/src/io/")
  list(FILTER AUBIO_SOURCES EXCLUDE REGEX "/src/utils/windll\\.c")
  add_library(aubio STATIC ${AUBIO_SOURCES})
  # Consumers include <aubio/aubio.h>, as the vcpkg and apt installs lay it out.
  file(COPY ${AURORA_AUBIO_SRC}/src/ DESTINATION ${CMAKE_BINARY_DIR}/aubio-include/aubio FILES_MATCHING PATTERN "*.h")
  target_include_directories(aubio PUBLIC ${AURORA_AUBIO_SRC}/src ${CMAKE_BINARY_DIR}/aubio-include)
  target_compile_definitions(aubio PUBLIC
    HAVE_STDLIB_H=1 HAVE_STDIO_H=1 HAVE_MATH_H=1 HAVE_STRING_H=1
    HAVE_LIMITS_H=1 HAVE_STDARG_H=1 HAVE_ERRNO_H=1 HAVE_C99_VARARGS_MACROS=1)
  target_compile_options(aubio PRIVATE -w)
  set(AUBIO_TARGET aubio)
else()
  find_package(Aubio CONFIG REQUIRED)
  set(AUBIO_TARGET Aubio::aubio)
endif()

set(RT ${CORE}/Runtime/src)
add_executable(spike
  main.cpp
  ${CORE}/Contracts/src/Interpolation.cpp
  ${CORE}/Processing/src/ImageProcessing.cpp
  ${CORE}/AudioProcessing/src/AudioProcessing.cpp
  ${CORE}/AudioProcessing/src/AudioFeatureExtractor.cpp
  ${CORE}/AudioProcessing/src/AudioBandAnalyzer.cpp
  ${RT}/Config.cpp
  ${RT}/ControlDescriptorTables.cpp
  ${RT}/FrameCompositor.cpp
  ${RT}/AudioFrameCompositor.cpp
  ${RT}/Smoother.cpp
  ${RT}/BrightnessFloor.cpp
  ${RT}/Graph/GraphTypes.cpp
  ${RT}/Graph/NodeRegistry.cpp
  ${RT}/Graph/VideoNodes.cpp
  ${RT}/Graph/FrameNodes.cpp
  ${RT}/Graph/MathNodes.cpp
  ${RT}/Graph/TimeNodes.cpp
  ${RT}/Graph/ColorNodes.cpp
  ${RT}/Graph/BlendNodes.cpp
  ${RT}/Graph/SpatialNodes.cpp
  ${RT}/Graph/AudioNodes.cpp
  ${RT}/Graph/AllNodes.cpp
  ${RT}/Graph/BuiltInGraphs.cpp
  ${RT}/Graph/Graph.cpp
  ${RT}/Graph/GraphLoader.cpp
)

target_include_directories(spike PRIVATE
  ${CORE}/Contracts/include
  ${CORE}/Processing/include
  ${CORE}/AudioProcessing/include
  ${CORE}/Input/include
  ${CORE}/Output/include
  ${CORE}/Runtime/include
  ${AURORA_GLM_INCLUDE}
  ${AURORA_JSON_INCLUDE}
  ${OpenCV_INCLUDE_DIRS}
)
target_compile_definitions(spike PRIVATE AURORA_RUNTIME_AUDIO_AVAILABLE=1)
target_link_libraries(spike PRIVATE ${OpenCV_LIBS} ${AUBIO_TARGET})

if(EMSCRIPTEN)
  # Exceptions on for GraphLoader's try/catch; NODERAWFS lets Node read the fixtures directly.
  target_compile_options(spike PRIVATE -fexceptions)
  target_link_options(spike PRIVATE -fexceptions -sNODERAWFS=1 -sENVIRONMENT=node
    -sALLOW_MEMORY_GROWTH=1 -sEXIT_RUNTIME=1)
  set_target_properties(spike PROPERTIES SUFFIX ".js")
endif()
