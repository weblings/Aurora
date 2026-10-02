#include <Aurora/Secrets/SecretStore.hpp>

#include <fstream>
#include <map>
#include <optional>

#include <nlohmann/json.hpp>

// The opt-in plaintext fallback (see the header). Scoped by living inside
// the config root, so no scope string is needed. Writes go through a temp
// file that is made owner-only *before* the secret is written, then renamed
// over the real one -- no window where the token sits world-readable.
namespace Aurora::Secrets
{
  namespace
  {
    using Json = nlohmann::json;

    constexpr auto OwnerOnly = std::filesystem::perms::owner_read | std::filesystem::perms::owner_write;


    // nullopt: unreadable or corrupt. An absent file is an empty map.
    std::optional<std::map<std::string, std::string>> _load(const std::filesystem::path& path)
    {
      std::map<std::string, std::string> values;
      if(!std::filesystem::exists(path)){
        return values;
      }

      std::ifstream file(path);
      Json json = Json::parse(file, nullptr, /*allow_exceptions*/ false);
      if(json.is_discarded() || !json.is_object()){
        return std::nullopt;
      }
      for(const auto& [key, value] : json.items()){
        if(!value.is_string()){
          return std::nullopt;
        }
        values[key] = value.get<std::string>();
      }
      return values;
    }


    // Error text names the file, never its contents.
    SecretResult _save(const std::filesystem::path& path, const std::map<std::string, std::string>& values)
    {
      std::error_code ec;
      if(values.empty()){
        std::filesystem::remove(path, ec);
        if(ec){
          return {SecretStatus::Error, "", "could not delete " + path.string() + ": " + ec.message()};
        }
        return {SecretStatus::Ok, "", ""};
      }

      std::filesystem::create_directories(path.parent_path(), ec);
      auto temp = path;
      temp += ".tmp";

      // Create empty, lock down, then write.
      { std::ofstream create(temp, std::ios::trunc); }
      std::filesystem::permissions(temp, OwnerOnly, std::filesystem::perm_options::replace, ec);
      if(ec){
        std::filesystem::remove(temp);
        return {SecretStatus::Error, "", "could not restrict " + temp.string() + ": " + ec.message()};
      }

      {
        std::ofstream file(temp, std::ios::trunc);
        file << Json(values).dump(2) << "\n";
        if(!file){
          std::filesystem::remove(temp, ec);
          return {SecretStatus::Error, "", "could not write " + temp.string()};
        }
      }

      std::filesystem::rename(temp, path, ec);
      if(ec){
        std::filesystem::remove(temp);
        return {SecretStatus::Error, "", "could not replace " + path.string() + ": " + ec.message()};
      }
      return {SecretStatus::Ok, "", ""};
    }


    SecretResult _corrupt(const std::filesystem::path& path)
    {
      return {SecretStatus::Error, "", path.string() + " is unreadable or not a string map"};
    }
  }


  FileSecretStore::FileSecretStore(const std::filesystem::path& configRoot):
  m_path(configRoot / FileName)
  {}


  SecretResult FileSecretStore::get(const std::string& key)
  {
    if(auto error = Detail::validateKey(key); !error.empty()){
      return Detail::invalid(error);
    }
    auto values = _load(m_path);
    if(!values){
      return _corrupt(m_path);
    }
    auto it = values->find(key);
    if(it == values->end()){
      return {SecretStatus::NotFound, "", ""};
    }
    return {SecretStatus::Ok, it->second, ""};
  }


  SecretResult FileSecretStore::set(const std::string& key, const std::string& value)
  {
    if(auto error = Detail::validateKey(key); !error.empty()){
      return Detail::invalid(error);
    }
    if(auto error = Detail::validateValue(value); !error.empty()){
      return Detail::invalid(error);
    }
    auto values = _load(m_path);
    if(!values){
      return _corrupt(m_path);  // never overwrite what we can't read
    }
    (*values)[key] = value;
    return _save(m_path, *values);
  }


  SecretResult FileSecretStore::remove(const std::string& key)
  {
    if(auto error = Detail::validateKey(key); !error.empty()){
      return Detail::invalid(error);
    }
    auto values = _load(m_path);
    if(!values){
      return _corrupt(m_path);
    }
    if(values->erase(key) == 0){
      return {SecretStatus::Ok, "", ""};
    }
    return _save(m_path, *values);
  }
}
