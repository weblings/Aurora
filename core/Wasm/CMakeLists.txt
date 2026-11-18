# Emscripten targets over AuroraGraphEngine. Added by core/CMakeLists.txt when EMSCRIPTEN.
# The browser module (Aurora-51nv.6) is aurora_engine, over bindings/BrowserEngine.

# Node-only driver for the native-vs-WASM parity check in parity/.
add_executable(graph_parity parity/main.cpp)
target_link_libraries(graph_parity PRIVATE AuroraGraphEngine)
# NODERAWFS lets Node read the fixtures directly.
target_link_options(graph_parity PRIVATE -sNODERAWFS=1 -sENVIRONMENT=node
  -sALLOW_MEMORY_GROWTH=1 -sEXIT_RUNTIME=1)
set_target_properties(graph_parity PROPERTIES SUFFIX ".js")

# The browser module: an ES module for web, worker and node, no filesystem. JS reaches it
# through the C exports in bindings/Exports.cpp (see web/engine/engine.js).
add_executable(aurora_engine bindings/Exports.cpp)
target_link_libraries(aurora_engine PRIVATE AuroraBrowserEngine)
target_link_options(aurora_engine PRIVATE
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createAuroraEngine
  -sENVIRONMENT=web,worker,node
  -sALLOW_MEMORY_GROWTH=1 -sFILESYSTEM=0
  "-sEXPORTED_RUNTIME_METHODS=UTF8ToString,stringToUTF8,lengthBytesUTF8,HEAPU8,HEAPF32")
set_target_properties(aurora_engine PROPERTIES OUTPUT_NAME aurora-engine SUFFIX ".mjs")
