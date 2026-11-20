# Transport-agnostic HTTP server skeleton (see docs/HttpServerAnalysis.md).
# No dependency on Contracts/Processing/Input/Output/Runtime -- route
# definitions that touch Aurora's own domain types live elsewhere and link
# against this, not the other way round.
add_library(AuroraNetwork STATIC
  src/HttpServer.cpp
  src/Pairing.cpp
  src/Problem.cpp
  src/PairingRoutes.cpp
)

target_include_directories(AuroraNetwork PUBLIC
  ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_link_libraries(AuroraNetwork PUBLIC
  httplib::httplib
  nlohmann_json::nlohmann_json
)

# cpp-httplib listens with a backlog of 5 by default; a burst of connects
# (several tabs plus MCP agents, or a loaded test) beyond that is refused.
# PUBLIC so every TU that includes <httplib.h> through us sees one value.
target_compile_definitions(AuroraNetwork PUBLIC CPPHTTPLIB_LISTEN_BACKLOG=128)

target_compile_features(AuroraNetwork PUBLIC cxx_std_20)
