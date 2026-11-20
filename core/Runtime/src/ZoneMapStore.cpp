#include <Aurora/Runtime/ZoneMapStore.hpp>

#include <fstream>

#include <nlohmann/json.hpp>

#include <Aurora/Runtime/ZoneMapJson.hpp>

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

    Json toJson(const ZoneConfig& zone)
    {
      return Json{
        {"zoneId", zone.zoneId},
        {"uvs", toJson(zone.uvs)},
        {"active", zone.active},
        {"gamma", zone.gamma},
        {"everConfigured", zone.everConfigured}
      };
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

    return zoneMapFromJson(json);
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
