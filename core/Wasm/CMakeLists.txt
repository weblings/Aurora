# Emscripten targets over AuroraGraphEngine. Added by core/CMakeLists.txt when EMSCRIPTEN.
# The browser bindings (Aurora-51nv.6) join here.

# Node-only driver for the native-vs-WASM parity check in parity/.
add_executable(graph_parity parity/main.cpp)
target_link_libraries(graph_parity PRIVATE AuroraGraphEngine)
# NODERAWFS lets Node read the fixtures directly.
target_link_options(graph_parity PRIVATE -sNODERAWFS=1 -sENVIRONMENT=node
  -sALLOW_MEMORY_GROWTH=1 -sEXIT_RUNTIME=1)
set_target_properties(graph_parity PROPERTIES SUFFIX ".js")
