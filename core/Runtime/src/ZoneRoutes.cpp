#include <Aurora/Runtime/ZoneRoutes.hpp>

#include <nlohmann/json.hpp>

#include <Aurora/Network/Http/Server/HttpServer.hpp>

namespace Aurora::Runtime
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


    // Same array-based [x, y] shape ZoneMapStore.cpp's own (private) toJson
    // already persists to disk with -- kept consistent rather than inventing
    // a second {x, y} object shape for the same data over HTTP.
    nlohmann::json _toJson(const Contracts::UVs& uvs)
    {
      return {
        {"min", {uvs.min.x, uvs.min.y}},
        {"max", {uvs.max.x, uvs.max.y}}
      };
    }


    std::optional<Contracts::UVs> _uvsFromJson(const nlohmann::json& body)
    {
      if(!body.contains("uvs")){
        return std::nullopt;
      }

      const auto& uvsJson = body.at("uvs");
      Contracts::UVs uvs{{0.f, 0.f}, {1.f, 1.f}};

      if(uvsJson.contains("min") && uvsJson.at("min").is_array() && uvsJson.at("min").size() == 2){
        uvs.min = {uvsJson.at("min")[0].get<float>(), uvsJson.at("min")[1].get<float>()};
      }
      if(uvsJson.contains("max") && uvsJson.at("max").is_array() && uvsJson.at("max").size() == 2){
        uvs.max = {uvsJson.at("max")[0].get<float>(), uvsJson.at("max")[1].get<float>()};
      }

      return uvs;
    }


    nlohmann::json _toJson(const ZoneConfig& zone)
    {
      return {
        {"zoneId", zone.zoneId},
        {"uvs", _toJson(zone.uvs)},
        {"active", zone.active},
        {"gamma", zone.gamma}
      };
    }


    nlohmann::json _toJson(const ZoneListResult& result)
    {
      nlohmann::json zones = nlohmann::json::array();
      for(const auto& zone : result.zones){
        zones.push_back(_toJson(zone));
      }

      return {
        {"outputName", result.outputName},
        {"zones", zones}
      };
    }
  }


  void registerZoneRoutes(
    HttpServer& server,
    std::function<ZoneListResult()> listZones,
    std::function<bool(
      std::uint8_t zoneId,
      const std::optional<Contracts::UVs>& uvs,
      const std::optional<bool>& active,
      const std::optional<float>& gamma
    )> updateZone
  )
  {
    server.addRoute(HttpMethod::Get, "/api/zones", [listZones](const Request&, Response& res){
      _writeJson(res, _toJson(listZones()));
    });

    // PATCH-style PUT, same convention as SettingsRoutes -- only zoneId is
    // required; uvs/active/gamma are applied only when present in the body.
    server.addRoute(HttpMethod::Put, "/api/zones", [listZones, updateZone](const Request& req, Response& res){
      nlohmann::json body;
      try{
        body = nlohmann::json::parse(req.body);
      }
      catch(const nlohmann::json::exception&){
        _writeJson(res, {{"succeeded", false}, {"error", "invalid_json_body"}}, 400);
        return;
      }

      if(!body.contains("zoneId")){
        _writeJson(res, {{"succeeded", false}, {"error", "zoneId_required"}}, 400);
        return;
      }

      std::uint8_t zoneId;
      std::optional<Contracts::UVs> uvs;
      std::optional<bool> active;
      std::optional<float> gamma;
      try{
        zoneId = static_cast<std::uint8_t>(body.at("zoneId").get<unsigned>());
        uvs = _uvsFromJson(body);
        if(body.contains("active")) active = body.at("active").get<bool>();
        if(body.contains("gamma")) gamma = body.at("gamma").get<float>();
      }
      catch(const nlohmann::json::exception&){
        _writeJson(res, {{"succeeded", false}, {"error", "invalid_field_type"}}, 400);
        return;
      }

      if(!updateZone(zoneId, uvs, active, gamma)){
        _writeJson(res, {{"succeeded", false}, {"error", "unknown_zone"}}, 404);
        return;
      }

      nlohmann::json responseJson = _toJson(listZones());
      responseJson["succeeded"] = true;
      _writeJson(res, responseJson);
    });
  }
}
