#include <Aurora/Output/Hue/PairingRoutes.hpp>

#include <optional>

#include <nlohmann/json.hpp>

#include <Aurora/Network/Http/Server/HttpServer.hpp>
#include <Aurora/Output/Hue/ApiTools.hpp>
#include <Aurora/Output/Hue/BridgeAddress.hpp>
#include <Aurora/Output/Hue/CredentialsStore.hpp>
#include <Aurora/Output/Hue/HttpClient.hpp>

namespace Aurora::Output::Hue
{
  namespace
  {
    using Aurora::Network::Http::Server::HttpMethod;
    using Aurora::Network::Http::Server::HttpServer;
    using Aurora::Network::Http::Server::Request;
    using Aurora::Network::Http::Server::Response;

    void _writeJson(Response& res, const nlohmann::json& json, int status = 200)
    {
      res.status = status;
      res.contentType = "application/json";
      res.body = json.dump();
    }


    // Centralizes the "malformed JSON body" case as one clean 400 instead of
    // an uncaught throw out of a route handler.
    std::optional<nlohmann::json> _parseBody(const Request& req, Response& res)
    {
      try{
        return nlohmann::json::parse(req.body);
      }
      catch(const nlohmann::json::exception&){
        _writeJson(res, {{"succeeded", false}, {"error", "invalid_json_body"}}, 400);
        return std::nullopt;
      }
    }
  }


  void registerPairingRoutes(HttpServer& server, const std::filesystem::path& configRoot)
  {
    server.addRoute(HttpMethod::Get, "/api/hue/discover", [](const Request&, Response& res){
      _writeJson(res, ApiTools::autodetectedBridge());
    });

    server.addRoute(HttpMethod::Get, "/api/hue/connection", [configRoot](const Request&, Response& res){
      HueConnection connection = CredentialsStore(configRoot).load();

      // Username/clientkey deliberately withheld -- the frontend only needs
      // to know whether a pairing exists and which bridge/config it's for.
      _writeJson(res, {
        {"configured", connection.isConfigured()},
        {"bridgeAddress", connection.bridgeAddress},
        {"entertainmentConfigurationId", connection.entertainmentConfigurationId}
      });
    });

    server.addRoute(HttpMethod::Put, "/api/hue/validate", [](const Request& req, Response& res){
      auto body = _parseBody(req, res);
      if(!body){
        return;
      }

      std::string bridgeAddress = sanitizeBridgeAddress(body->value("bridgeAddress", ""));
      if(bridgeAddress.empty()){
        _writeJson(res, {{"succeeded", false}, {"error", "missing_bridge_address"}}, 400);
        return;
      }

      auto response = sendHttpRequest(HttpProtocol + bridgeAddress + "/api/0/config", "GET");
      if(!response.has_value()){
        _writeJson(res, {{"succeeded", false}, {"error", "unreachable"}});
        return;
      }

      try{
        auto json = response->asJson();
        bool valid = json.contains("name") && json.contains("bridgeid");
        _writeJson(res, {{"succeeded", valid}});
      }
      catch(const nlohmann::json::exception&){
        _writeJson(res, {{"succeeded", false}, {"error", "unexpected_response"}});
      }
    });

    server.addRoute(HttpMethod::Put, "/api/hue/register", [](const Request& req, Response& res){
      auto body = _parseBody(req, res);
      if(!body){
        return;
      }

      std::string bridgeAddress = sanitizeBridgeAddress(body->value("bridgeAddress", ""));
      if(bridgeAddress.empty()){
        _writeJson(res, {{"succeeded", false}, {"error", "missing_bridge_address"}}, 400);
        return;
      }

      auto response = ApiTools::registerNewUser(bridgeAddress, "aurora#webui");
      if(!response.has_value()){
        _writeJson(res, {{"succeeded", false}, {"error", "unreachable"}});
        return;
      }

      try{
        // The bridge always answers with a one-element array -- verified
        // against the real API, see Analysis/WebUIAnalysis.md step 5.
        auto entry = response->asJson().at(0);

        if(entry.contains("success")){
          _writeJson(res, {
            {"succeeded", true},
            {"username", entry.at("success").at("username").get<std::string>()},
            {"clientkey", entry.at("success").at("clientkey").get<std::string>()}
          });
          return;
        }

        int errorType = entry.contains("error") ? entry.at("error").value("type", 0) : 0;

        // 101 == "link button not pressed" -- the one error the WebUI should
        // treat as "ask the user to press it and try again," not a failure.
        _writeJson(res, {
          {"succeeded", false},
          {"error", errorType == 101 ? "link_button_not_pressed" : "bridge_error"}
        });
      }
      catch(const nlohmann::json::exception&){
        _writeJson(res, {{"succeeded", false}, {"error", "unexpected_response"}});
      }
    });

    server.addRoute(HttpMethod::Put, "/api/hue/entertainment-configurations", [](const Request& req, Response& res){
      auto body = _parseBody(req, res);
      if(!body){
        return;
      }

      std::string bridgeAddress = sanitizeBridgeAddress(body->value("bridgeAddress", ""));
      std::string username = body->value("username", "");
      if(bridgeAddress.empty() || username.empty()){
        _writeJson(res, {{"succeeded", false}, {"error", "missing_bridge_address_or_username"}}, 400);
        return;
      }

      // Degrades to an empty list on a transport failure, same as
      // ApiTools::loadEntertainmentConfigurations already does internally --
      // not distinguished from "genuinely zero configs" here either.
      auto configs = ApiTools::loadEntertainmentConfigurations(username, bridgeAddress);

      nlohmann::json list = nlohmann::json::array();
      for(const auto& [id, config] : configs){
        list.push_back({{"id", id}, {"name", config.name}});
      }

      _writeJson(res, {{"succeeded", true}, {"configurations", list}});
    });

    server.addRoute(HttpMethod::Post, "/api/hue/connection", [configRoot](const Request& req, Response& res){
      auto body = _parseBody(req, res);
      if(!body){
        return;
      }

      HueConnection connection;
      connection.bridgeAddress = sanitizeBridgeAddress(body->value("bridgeAddress", ""));
      connection.username = body->value("username", "");
      connection.clientkey = body->value("clientkey", "");
      connection.entertainmentConfigurationId = body->value("entertainmentConfigurationId", "");

      if(!connection.isConfigured()){
        _writeJson(res, {{"succeeded", false}, {"error", "incomplete_connection"}}, 400);
        return;
      }

      CredentialsStore(configRoot).save(connection);
      _writeJson(res, {{"succeeded", true}});
    });
  }
}
