#include <Aurora/Network/Http/Server/Problem.hpp>

#include <nlohmann/json.hpp>


namespace Aurora::Network::Http::Server
{
  namespace
  {
    std::string defaultCode(int status)
    {
      switch(status)
      {
        case 400: return "bad_request";
        case 401: return "pairing_required";
        case 403: return "forbidden";
        case 404: return "not_found";
        case 405: return "method_not_allowed";
        case 409: return "conflict";
        case 413: return "payload_too_large";
        case 429: return "too_many_requests";
        case 503: return "unavailable";
        default: return status >= 500 ? "internal_error" : "error";
      }
    }
  }


  std::string statusTitle(int status)
  {
    switch(status)
    {
      case 400: return "Bad Request";
      case 401: return "Unauthorized";
      case 403: return "Forbidden";
      case 404: return "Not Found";
      case 405: return "Method Not Allowed";
      case 409: return "Conflict";
      case 410: return "Gone";
      case 413: return "Payload Too Large";
      case 422: return "Unprocessable Content";
      case 429: return "Too Many Requests";
      case 500: return "Internal Server Error";
      case 502: return "Bad Gateway";
      case 503: return "Service Unavailable";
      default: return "Error";
    }
  }


  namespace
  {
    void applyProblem(Response& res, nlohmann::json body, int status)
    {
      // value() throws on a non-string member, so read the type first.
      std::string code = body.contains("error") && body["error"].is_string()
        ? body["error"].get<std::string>()
        : std::string{};
      if(code.empty()){
        code = defaultCode(status);
      }
      std::string detail = body.contains("message") && body["message"].is_string()
        ? body["message"].get<std::string>()
        : std::string{};

      body["type"] = "about:blank";
      body["title"] = statusTitle(status);
      body["status"] = status;
      if(!detail.empty()){
        body["detail"] = detail;
      }
      body["code"] = code;
      body["succeeded"] = false;
      body["error"] = code;

      res.status = status;
      res.contentType = kProblemContentType;
      res.body = body.dump();
    }
  }


  void setProblem(
    Response& res,
    int status,
    const std::string& code,
    const std::string& detail
  )
  {
    nlohmann::json body = {{"error", code}};
    if(!detail.empty()){
      body["message"] = detail;
    }
    applyProblem(res, std::move(body), status);
  }


  void normalizeProblem(Response& res)
  {
    if(res.contentType.rfind(kProblemContentType, 0) == 0){
      return;
    }
    auto body = nlohmann::json::parse(res.body, nullptr, false);
    if(!body.is_object()){
      body = nlohmann::json::object();
    }
    applyProblem(res, std::move(body), res.status);
  }
}
