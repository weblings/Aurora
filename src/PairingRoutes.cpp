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


  void registerPairingRoutes(
    HttpServer& server,
    const std::filesystem::path& configRoot,
    std::function<std::string()> onConnectionChanged
  )
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

    // For Zone Mapping's zone-selector dropdown and active-zone list --
    // real light names for the currently-selected entertainment config's
    // channels, so those show "Zone 5 (Floor Lamp)" instead of a bare
    // number. Empty entertainmentConfigurationId falls back to the
    // bridge's first config, same convention
    // EntertainmentConfigurationSelector::selectEntertainmentConfiguration
    // uses.
    server.addRoute(HttpMethod::Get, "/api/hue/channels", [configRoot](const Request&, Response& res){
      HueConnection connection = CredentialsStore(configRoot).load();
      if(!connection.isConfigured()){
        _writeJson(res, {{"succeeded", false}, {"error", "not_configured"}}, 400);
        return;
      }

      auto configs = ApiTools::loadEntertainmentConfigurations(connection.username, connection.bridgeAddress);
      auto it = configs.find(connection.entertainmentConfigurationId);
      if(it == configs.end()){
        it = configs.begin();
      }

      nlohmann::json channels = nlohmann::json::array();
      if(it != configs.end()){
        for(const auto& [channelId, channel] : it->second.channels){
          nlohmann::json lightNames = nlohmann::json::array();
          for(const auto& device : channel.devices){
            lightNames.push_back(device.name);
          }
          channels.push_back({{"channelId", channelId}, {"lightNames", lightNames}});
        }
      }

      _writeJson(res, {{"succeeded", true}, {"channels", channels}});
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
        // against the real API, see Analysis/WebUI/WebUI_Design_1stPass.md step 5.
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

    // bridgeAddress/username are optional in the body -- mid-pairing (no
    // connection persisted yet), the caller supplies them directly since
    // nothing is saved yet to fall back to. Once already configured (e.g.
    // Zone Mapping's own entertainment-config picker, which never has
    // username -- GET /api/hue/connection deliberately withholds it),
    // omit them and this falls back to the persisted connection instead.
    server.addRoute(HttpMethod::Put, "/api/hue/entertainment-configurations", [configRoot](const Request& req, Response& res){
      auto body = _parseBody(req, res);
      if(!body){
        return;
      }

      std::string bridgeAddress = sanitizeBridgeAddress(body->value("bridgeAddress", ""));
      std::string username = body->value("username", "");
      if(bridgeAddress.empty() || username.empty()){
        HueConnection persisted = CredentialsStore(configRoot).load();
        if(bridgeAddress.empty()) bridgeAddress = persisted.bridgeAddress;
        if(username.empty()) username = persisted.username;
      }
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

    // PATCH-style, same convention SettingsRoutes' /api/config already
    // uses -- merges onto whatever's already persisted rather than
    // requiring the full connection every time. Needed so a caller that
    // only wants to change entertainmentConfigurationId (Zone Mapping's
    // own picker) can send just that field: the frontend never has
    // username/clientkey to resend (GET /api/hue/connection withholds
    // them deliberately), so a full-overwrite POST couldn't be used for
    // that case at all before this. The original full-pairing call
    // (OutputConnectScreen's _finish()) still sends all four fields and
    // behaves identically either way.
    server.addRoute(HttpMethod::Post, "/api/hue/connection", [configRoot, onConnectionChanged](const Request& req, Response& res){
      auto body = _parseBody(req, res);
      if(!body){
        return;
      }

      HueConnection connection = CredentialsStore(configRoot).load();
      if(body->contains("bridgeAddress")) connection.bridgeAddress = sanitizeBridgeAddress(body->value("bridgeAddress", ""));
      if(body->contains("username")) connection.username = body->value("username", "");
      if(body->contains("clientkey")) connection.clientkey = body->value("clientkey", "");
      if(body->contains("entertainmentConfigurationId")) connection.entertainmentConfigurationId = body->value("entertainmentConfigurationId", "");

      if(!connection.isConfigured()){
        _writeJson(res, {{"succeeded", false}, {"error", "incomplete_connection"}}, 400);
        return;
      }

      CredentialsStore(configRoot).save(connection);

      nlohmann::json responseJson = {{"succeeded", true}};
      if(onConnectionChanged){
        std::string reloadError = onConnectionChanged();
        if(!reloadError.empty()){
          // Same convention as SettingsRoutes' reloadError -- the save
          // itself succeeded, the live pipeline just couldn't pick it up.
          responseJson["reloadError"] = reloadError;
        }
      }
      _writeJson(res, responseJson);
    });
  }
}
