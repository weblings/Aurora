#pragma once

#include <string>

#include <Aurora/Network/Http/Server/HttpDataStructs.hpp>

// RFC 9457 problem details for every non-2xx API answer (Aurora-5ipy.25).
namespace Aurora::Network::Http::Server
{
  inline constexpr char kProblemContentType[] = "application/problem+json";

  // Fills `res` with a problem body: type "about:blank", title, status,
  // detail (when non-empty), code, plus the legacy succeeded:false and
  // error:<code> keys the WebUI reads.
  void setProblem(
    Response& res,
    int status,
    const std::string& code,
    const std::string& detail = {}
  );

  // Rewrites a hand-built error body into a problem in place. Extra keys
  // (valid, errors, state, edit...) stay; an empty or non-JSON body gets a
  // code derived from the status. `message` becomes `detail`.
  void normalizeProblem(Response& res);

  // Standard reason phrase for a status, "Error" when unknown.
  std::string statusTitle(int status);
}
