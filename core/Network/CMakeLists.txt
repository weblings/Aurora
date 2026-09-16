# Transport-agnostic HTTP server skeleton (see Analysis/HttpServerAnalysis.md).
# No dependency on Contracts/Processing/Input/Output/Runtime -- route
# definitions that touch Aurora's own domain types live elsewhere and link
# against this, not the other way round.
add_library(AuroraNetwork STATIC
  src/HttpServer.cpp
)

target_include_directories(AuroraNetwork PUBLIC
  ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_link_libraries(AuroraNetwork PUBLIC
  httplib::httplib
)

target_compile_features(AuroraNetwork PUBLIC cxx_std_20)
