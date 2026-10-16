# Transport-agnostic HTTP server skeleton (see docs/HttpServerAnalysis.md).
# No dependency on Contracts/Processing/Input/Output/Runtime -- route
# definitions that touch Aurora's own domain types live elsewhere and link
# against this, not the other way round.
add_library(AuroraNetwork STATIC
  src/HttpServer.cpp
  src/Pairing.cpp
  src/PairingRoutes.cpp
)

target_include_directories(AuroraNetwork PUBLIC
  ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_link_libraries(AuroraNetwork PUBLIC
  httplib::httplib
  nlohmann_json::nlohmann_json
)

target_compile_features(AuroraNetwork PUBLIC cxx_std_20)
