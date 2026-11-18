# aubio compiled from a source tree with its built-in FFT and without its io/ readers.
# Included by core/CMakeLists.txt when AURORA_AUBIO_FROM_SOURCE is ON. Defines Aubio::aubio,
# which makes AudioProcessing skip its own lookup.

if(NOT AURORA_AUBIO_SRC)
  message(FATAL_ERROR "AURORA_AUBIO_FROM_SOURCE needs AURORA_AUBIO_SRC (see core/Wasm/README.md)")
endif()

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
if(MSVC)
  target_compile_definitions(aubio PRIVATE _CRT_SECURE_NO_WARNINGS=1)
  target_compile_options(aubio PRIVATE /w)
else()
  target_compile_options(aubio PRIVATE -w)
endif()
if(UNIX AND NOT EMSCRIPTEN)
  target_link_libraries(aubio PUBLIC m)
endif()
add_library(Aubio::aubio ALIAS aubio)
