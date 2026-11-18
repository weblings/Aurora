#include <Aurora/Runtime/ZoneMapJson.hpp>

namespace Aurora::Runtime
{
  using Json = nlohmann::json;

  Contracts::UVs uvsFromJson(const Json& json)
  {
    Contracts::UVs uvs{{0.f, 0.f}, {1.f, 1.f}};

    if(json.contains("min") && json.at("min").is_array() && json.at("min").size() == 2){
      uvs.min = {json.at("min")[0].get<float>(), json.at("min")[1].get<float>()};
    }

    if(json.contains("max") && json.at("max").is_array() && json.at("max").size() == 2){
      uvs.max = {json.at("max")[0].get<float>(), json.at("max")[1].get<float>()};
    }

    return uvs;
  }


  ZoneConfig zoneFromJson(const Json& json)
  {
    ZoneConfig zone;
    zone.zoneId = static_cast<uint8_t>(json.value("zoneId", 0));
    zone.active = json.value("active", false);
    zone.gamma = json.value("gamma", 0.f);
    zone.everConfigured = json.value("everConfigured", false);

    if(json.contains("uvs")){
      zone.uvs = uvsFromJson(json.at("uvs"));
    }

    return zone;
  }


  ZoneMap zoneMapFromJson(const Json& json)
  {
    if(!json.is_array()){
      throw Json::type_error::create(302, "a zone map must be an array", &json);
    }
    ZoneMap zoneMap;
    for(const auto& entry : json){
      zoneMap.push_back(zoneFromJson(entry));
    }
    return zoneMap;
  }
}
