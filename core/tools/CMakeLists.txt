# Native developer tools built with the core tests (they need the test configure's
# Python and fixtures, and stay out of the app builds that set BUILD_TESTS off).

# Writes web/graph-editor/src/graph/server-samples from the engine (Aurora-51nv.6).
# --check compares instead, so a stale sample fails.
add_executable(GenServerSamples GenServerSamples.cpp)
target_link_libraries(GenServerSamples PRIVATE AuroraBrowserEngine)
target_compile_features(GenServerSamples PRIVATE cxx_std_20)

get_filename_component(AURORA_REPO_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../.." ABSOLUTE)
set(AURORA_SERVER_SAMPLES "${AURORA_REPO_ROOT}/web/graph-editor/src/graph/server-samples")
target_compile_definitions(GenServerSamples PRIVATE
  AURORA_SERVER_SAMPLES_DIR="${AURORA_SERVER_SAMPLES}")

# The check needs the parity fixtures, which a Python script writes.
find_package(Python3 QUIET COMPONENTS Interpreter)
if(Python3_FOUND)
  set(SAMPLE_FIXTURES "${CMAKE_CURRENT_BINARY_DIR}/sample-fixtures")
  add_test(NAME ServerSamples.fixtures
    COMMAND ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/../Wasm/parity/gen_fixtures.py ${SAMPLE_FIXTURES})
  add_test(NAME ServerSamples.check
    COMMAND GenServerSamples --check --fixtures ${SAMPLE_FIXTURES})
  set_tests_properties(ServerSamples.fixtures PROPERTIES FIXTURES_SETUP ServerSampleFixtures)
  set_tests_properties(ServerSamples.check PROPERTIES FIXTURES_REQUIRED ServerSampleFixtures)
endif()
