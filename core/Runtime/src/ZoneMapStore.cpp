#include <Aurora/Runtime/ZoneMapStore.hpp>

#include <fstream>

#include <nlohmann/json.hpp>

namespace Aurora::Runtime
{
  namespace
  {
    using Json = nlohmann::json;

    Json toJson(const Contracts::UVs& uvs)
    {
      return Json{
        {"min", {uvs.min.x, uvs.min.y}},
        {"max", {uvs.max.x, uvs.max.y}}
      };
    }

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

    Json toJson(const ZoneConfig& zone)
    {
      return Json{
        {"zoneId", zone.zoneId},
        {"uvs", toJson(zone.uvs)},
        {"active", zone.active},
        {"gamma", zone.gamma}
      };
    }

    ZoneConfig zoneFromJson(const Json& json)
    {
      ZoneConfig zone;
      zone.zoneId = static_cast<uint8_t>(json.value("zoneId", 0));
      zone.active = json.value("active", false);
      zone.gamma = json.value("gamma", 0.f);

      if(json.contains("uvs")){
        zone.uvs = uvsFromJson(json.at("uvs"));
      }

      return zone;
    }
  }


  ZoneMapStore::ZoneMapStore(std::filesystem::path configRoot):
  m_profilesDir(std::move(configRoot) / "profiles")
  {}


  std::filesystem::path ZoneMapStore::_profilePath(const std::string& pluginName) const
  {
    return m_profilesDir / (pluginName + ".json");
  }


  ZoneMap ZoneMapStore::load(const std::string& pluginName) const
  {
    auto path = _profilePath(pluginName);

    if(!std::filesystem::exists(path)){
      return {};
    }

    std::ifstream file(path);
    Json json = Json::parse(file, nullptr, /*allow_exceptions*/ false);

    if(json.is_discarded() || !json.is_array()){
      return {};
    }

    ZoneMap zoneMap;
    for(const auto& entry : json){
      zoneMap.push_back(zoneFromJson(entry));
    }

    return zoneMap;
  }


  void ZoneMapStore::save(const std::string& pluginName, const ZoneMap& zoneMap) const
  {
    std::filesystem::create_directories(m_profilesDir);

    Json json = Json::array();
    for(const auto& zone : zoneMap){
      json.push_back(toJson(zone));
    }

    std::ofstream file(_profilePath(pluginName));
    file << json.dump(2) << "\n";
  }
}
