#include "Pair.hpp"

#include <nlohmann/json.hpp>

#include <algorithm>
#include <cctype>

namespace Aurora::Mcp
{
  namespace
  {
    nlohmann::json parseObject(const std::string& body)
    {
      auto parsed = nlohmann::json::parse(body, nullptr, false);
      return parsed.is_object() ? parsed : nlohmann::json::object();
    }
  }


  int pair(const Fetch& fetch, const std::string& name, const std::string& scope,
    std::ostream& out, std::ostream& log, const std::function<void()>& wait)
  {
    if(scope != "read" && scope != "draft" && scope != "apply"){
      log << "Unknown scope '" << scope << "'. Use read, draft or apply. Admin tokens are paired in the WebUI.\n";
      return 2;
    }

    const HttpReply request = fetch("POST", "/api/pairing/request", nlohmann::json{{"name", name}, {"scope", scope}}.dump());
    if(request.status == 0){
      log << "Aurora is not reachable (" << request.error << "). Start Aurora and check AURORA_URL.\n";
      return 1;
    }
    if(request.status == 429){
      log << "Aurora has too many pairing requests waiting. Approve or deny them in the WebUI, then retry.\n";
      return 1;
    }
    const nlohmann::json ticket = parseObject(request.body);
    const std::string pollKey = ticket.value("pollKey", "");
    if(request.status != 202 || pollKey.empty()){
      log << "Aurora refused the pairing request (HTTP " << request.status << ").\n";
      return 1;
    }

    log << "Approve \"" << name << "\" (" << scope << " access) in the Aurora WebUI, on the computer running Aurora.\n"
        << "Approve only if it shows code " << ticket.value("code", "") << ". Waiting...\n";

    // Aurora drops an unanswered request after 5 minutes, which ends this loop with a 410.
    while(true){
      wait();
      const HttpReply poll = fetch("GET", "/api/pairing/request/" + pollKey, {});
      if(poll.status == 202 || poll.status == 429){
        continue;
      }
      if(poll.status == 0){
        log << "Lost Aurora while waiting (" << poll.error << ").\n";
        return 1;
      }
      if(poll.status == 403){
        log << "The request was denied in Aurora. Run --pair again if that was a mistake.\n";
        return 1;
      }
      if(poll.status == 410){
        log << "The request expired before it was approved. Run --pair again for a new code.\n";
        return 1;
      }
      if(poll.status == 404){
        log << "Aurora no longer knows this request (restarted or already collected). Run --pair again.\n";
        return 1;
      }
      const nlohmann::json approved = parseObject(poll.body);
      const std::string token = approved.value("token", "");
      if(poll.status != 200 || token.empty()){
        log << "Aurora answered the poll with HTTP " << poll.status << ".\n";
        return 1;
      }
      log << "Approved with " << approved.value("scope", scope) << " access. Set this as AURORA_TOKEN in the client config:\n";
      out << token << '\n' << std::flush;
      return 0;
    }
  }


  bool isLoopbackUrl(const std::string& url)
  {
    std::string host = url;
    if(const auto scheme = host.find("://"); scheme != std::string::npos){
      host = host.substr(scheme + 3);
    }
    if(!host.empty() && host.front() == '['){
      host = host.substr(1, host.find(']') - 1);
    }
    else{
      host = host.substr(0, host.find_first_of(":/"));
    }
    std::transform(host.begin(), host.end(), host.begin(), [](unsigned char c){ return static_cast<char>(std::tolower(c)); });
    return host == "localhost" || host == "::1" || host.rfind("127.", 0) == 0;
  }
}
