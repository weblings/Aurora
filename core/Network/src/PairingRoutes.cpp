#include <Aurora/Network/Http/Server/PairingRoutes.hpp>

#include <nlohmann/json.hpp>


namespace Aurora::Network::Http::Server
{
  namespace
  {
    // ~10 years; revoking the device is what ends a pairing.
    constexpr char kCookieAttributes[] = "; Path=/; Max-Age=315360000; HttpOnly; SameSite=Strict";

    void reply(Response& res, int status, const nlohmann::json& body)
    {
      res.status = status;
      res.contentType = "application/json";
      res.body = body.dump();
    }


    nlohmann::json deviceJson(const PairedDevice& device)
    {
      return {
        {"id", device.id},
        {"name", device.name},
        {"scope", scopeName(device.scope)},
        {"createdAt", device.createdAt},
        {"lastSeen", device.lastSeen}
      };
    }
  }


  void registerPairingRoutes(
    HttpServer& server,
    const std::shared_ptr<PairingService>& service,
    AccessGuard& guard
  )
  {
    guard.addRule("/api/pairing/status", Scope::None);
    guard.addRule("/api/pairing/request", Scope::None);
    guard.addRule("/api/pairing/pending", Scope::Admin);
    guard.addRule("/api/pairing/devices", Scope::Admin);

    // Cheap probe: lets a client learn whether it must pair without a 401.
    server.addRoute(HttpMethod::Get, "/api/pairing/status", [](const Request& req, Response& res){
      reply(res, 200, {{"required", !req.local}, {"scope", scopeName(req.scope)}});
    });

    server.addRoute(HttpMethod::Post, "/api/pairing/request", [service](const Request& req, Response& res){
      auto body = nlohmann::json::parse(req.body, nullptr, false);
      if(!body.is_object()){
        reply(res, 400, {{"succeeded", false}, {"error", "invalid_json"}});
        return;
      }
      // A browser asks for admin (the full UI), an adapter for less.
      auto scope = scopeFromName(body.value("scope", "admin"));
      if(!scope){
        reply(res, 400, {{"succeeded", false}, {"error", "unknown_scope"}});
        return;
      }
      auto ticket = service->requestPairing(body.value("name", ""), *scope);
      if(!ticket){
        reply(res, 429, {{"succeeded", false}, {"error", "too_many_pending"}});
        return;
      }
      reply(res, 202, {{"pollKey", ticket->pollKey}, {"code", ticket->code}});
    });

    server.addRoute(HttpMethod::Get, "/api/pairing/request/:pollKey", [service](const Request& req, Response& res){
      auto poll = service->poll(req.pathParams.at("pollKey"));
      switch(poll.state)
      {
        case PairingPoll::State::Pending:
          reply(res, 202, {{"state", "pending"}});
          return;

        case PairingPoll::State::Approved:
          res.headers.emplace_back("Set-Cookie", "aurora_token=" + poll.token + kCookieAttributes);
          reply(res, 200, {{"state", "approved"}, {"token", poll.token}, {"scope", scopeName(poll.scope)}});
          return;

        case PairingPoll::State::Unknown:
          reply(res, 404, {{"state", "unknown"}});
          return;
      }
    });

    server.addRoute(HttpMethod::Get, "/api/pairing/pending", [service](const Request&, Response& res){
      nlohmann::json list = nlohmann::json::array();
      for(const auto& item : service->pending()){
        list.push_back({
          {"ref", item.ref},
          {"name", item.name},
          {"scope", scopeName(item.scope)},
          {"code", item.code}
        });
      }
      reply(res, 200, {{"pending", list}});
    });

    server.addRoute(HttpMethod::Post, "/api/pairing/pending/:ref/approve", [service](const Request& req, Response& res){
      std::optional<Scope> grant;
      auto body = nlohmann::json::parse(req.body, nullptr, false);
      if(body.is_object() && body.contains("scope")){
        grant = scopeFromName(body.value("scope", ""));
        if(!grant){
          reply(res, 400, {{"succeeded", false}, {"error", "unknown_scope"}});
          return;
        }
      }
      bool ok = service->approve(req.pathParams.at("ref"), grant);
      reply(res, ok ? 200 : 404, {{"succeeded", ok}});
    });

    server.addRoute(HttpMethod::Post, "/api/pairing/pending/:ref/deny", [service](const Request& req, Response& res){
      bool ok = service->deny(req.pathParams.at("ref"));
      reply(res, ok ? 200 : 404, {{"succeeded", ok}});
    });

    server.addRoute(HttpMethod::Get, "/api/pairing/devices", [service](const Request&, Response& res){
      nlohmann::json list = nlohmann::json::array();
      for(const auto& device : service->devices()){
        list.push_back(deviceJson(device));
      }
      reply(res, 200, {{"devices", list}});
    });

    server.addRoute(HttpMethod::Delete, "/api/pairing/devices/:id", [service](const Request& req, Response& res){
      switch(service->revoke(req.pathParams.at("id"))){
        case PairingService::RevokeResult::Revoked:
          reply(res, 200, {{"succeeded", true}});
          break;
        case PairingService::RevokeResult::NotFound:
          reply(res, 404, {{"succeeded", false}});
          break;
        case PairingService::RevokeResult::NotPersisted:
          // Revoked until restart only: tell the admin so they can retry.
          reply(res, 500, {{"succeeded", false}, {"error", "store_write_failed"}});
          break;
      }
    });
  }
}
