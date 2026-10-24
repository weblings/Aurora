#include <Aurora/Runtime/EffectStore.hpp>

#include <algorithm>
#include <fstream>
#include <system_error>

namespace Aurora::Runtime
{
  bool isBuiltInEffectId(const std::string& id)
  {
    return id == kBuiltInVideoEffectId || id == kBuiltInAudioEffectId;
  }


  EffectInfo effectInfo(const std::filesystem::path& configRoot, const std::string& id)
  {
    if(id == kBuiltInVideoEffectId){
      return {"Screen colors", "Follows the colors on your screen."};
    }
    if(id == kBuiltInAudioEffectId){
      return {"Music pulse", "Moves with the sound your computer is playing."};
    }
    EffectInfo info{id, {}};
    std::string error;
    const auto doc = EffectStore(configRoot).read(id, error);
    if(!doc || !doc->is_object()){
      return info;
    }
    const auto text = [&doc](const char* key) -> std::string {
      const auto it = doc->find(key);
      return it != doc->end() && it->is_string() ? it->get<std::string>() : std::string{};
    };
    if(const std::string title = text("title"); !title.empty()){
      info.title = title;
    }
    info.description = text("description");
    return info;
  }


  EffectStore::EffectStore(const std::filesystem::path& configRoot):
  m_dir(configRoot / "effects")
  {}


  bool EffectStore::validId(const std::string& id)
  {
    if(id.empty() || id.size() > 64){
      return false;
    }
    for(std::size_t i = 0; i < id.size(); ++i){
      const char c = id[i];
      const bool alnum = (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9');
      if(!alnum && (i == 0 || (c != '_' && c != '-'))){
        return false;
      }
    }
    return true;
  }


  std::vector<std::string> EffectStore::list() const
  {
    std::vector<std::string> ids;
    std::error_code ec;
    for(const auto& entry : std::filesystem::directory_iterator(m_dir, ec)){
      if(!entry.is_regular_file(ec) || entry.path().extension() != ".json"){
        continue;
      }
      const std::string id = entry.path().stem().string();
      if(validId(id)){
        ids.push_back(id);
      }
    }
    std::sort(ids.begin(), ids.end());
    return ids;
  }


  bool EffectStore::exists(const std::string& id) const
  {
    std::error_code ec;
    return validId(id) && std::filesystem::is_regular_file(m_dir / (id + ".json"), ec);
  }


  std::optional<nlohmann::json> EffectStore::read(const std::string& id, std::string& errorOut) const
  {
    if(!validId(id)){
      errorOut = "invalid effect id '" + id + "'";
      return std::nullopt;
    }
    std::ifstream file(m_dir / (id + ".json"));
    if(!file){
      errorOut = "effect file effects/" + id + ".json is missing";
      return std::nullopt;
    }
    nlohmann::json doc = nlohmann::json::parse(file, nullptr, /*allow_exceptions*/ false);
    if(doc.is_discarded()){
      errorOut = "effect file effects/" + id + ".json is not valid JSON";
      return std::nullopt;
    }
    return doc;
  }


  bool EffectStore::write(const std::string& id, const nlohmann::json& doc, std::string& errorOut) const
  {
    if(!validId(id)){
      errorOut = "invalid effect id '" + id + "'";
      return false;
    }
    std::error_code ec;
    std::filesystem::create_directories(m_dir, ec);
    const std::filesystem::path target = m_dir / (id + ".json");
    const std::filesystem::path temp = m_dir / (id + ".json.tmp");
    {
      std::ofstream file(temp, std::ios::binary | std::ios::trunc);
      file << doc.dump(2) << "\n";
      if(!file){
        errorOut = "could not write effects/" + id + ".json";
        return false;
      }
    }
    std::filesystem::rename(temp, target, ec);
    if(ec){
      std::filesystem::remove(temp, ec);
      errorOut = "could not replace effects/" + id + ".json";
      return false;
    }
    return true;
  }


  bool EffectStore::remove(const std::string& id) const
  {
    std::error_code ec;
    return validId(id) && std::filesystem::remove(m_dir / (id + ".json"), ec);
  }
}
