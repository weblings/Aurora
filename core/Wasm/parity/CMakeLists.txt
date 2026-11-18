# Native build of the parity driver, for the graph-only configure. Wasm/CMakeLists.txt
# builds the same main.cpp under Emscripten.
add_executable(graph_parity main.cpp)
target_link_libraries(graph_parity PRIVATE AuroraGraphEngine)
