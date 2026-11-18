# BrowserEngine: the JSON-in, JSON-out engine behind the WASM exports (Aurora-51nv.6).
# Plain C++ over AuroraGraphEngine, so the native sample generator links it too.
add_library(AuroraBrowserEngine STATIC BrowserEngine.cpp)
target_include_directories(AuroraBrowserEngine PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})
target_link_libraries(AuroraBrowserEngine PUBLIC AuroraGraphEngine)
target_compile_features(AuroraBrowserEngine PUBLIC cxx_std_20)
