#include <Aurora/Secrets/SecretStore.hpp>

#include <cstdint>
#include <cstdio>

#include <nlohmann/json.hpp>

namespace Aurora::Secrets
{
  namespace Detail
  {
    std::string validateKey(const std::string& key)
    {
      if(key.empty() || key.size() > 128){
        return "key must be 1-128 characters";
      }
      for(char c : key){
        bool allowed = (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')
          || c == '.' || c == '_' || c == '-' || c == '/';
        if(!allowed){
          return "key may only contain [A-Za-z0-9._-/]";
        }
      }
      return "";
    }


    std::string validateValue(const std::string& value)
    {
      if(value.size() > MaxSecretBytes){
        return "value exceeds " + std::to_string(MaxSecretBytes) + " bytes";
      }
      // libsecret's password API is C-string based; keep all backends alike.
      if(value.find('\0') != std::string::npos){
        return "value must not contain NUL bytes";
      }
      return "";
    }


    SecretResult invalid(std::string error)
    {
      return {SecretStatus::Invalid, "", std::move(error)};
    }
  }


  SecretResult MemorySecretStore::get(const std::string& key)
  {
    if(auto error = Detail::validateKey(key); !error.empty()){
      return Detail::invalid(error);
    }
    auto it = m_values.find(key);
    if(it == m_values.end()){
      return {SecretStatus::NotFound, "", ""};
    }
    return {SecretStatus::Ok, it->second, ""};
  }


  SecretResult MemorySecretStore::set(const std::string& key, const std::string& value)
  {
    if(auto error = Detail::validateKey(key); !error.empty()){
      return Detail::invalid(error);
    }
    if(auto error = Detail::validateValue(value); !error.empty()){
      return Detail::invalid(error);
    }
    m_values[key] = value;
    return {SecretStatus::Ok, "", ""};
  }


  SecretResult MemorySecretStore::remove(const std::string& key)
  {
    if(auto error = Detail::validateKey(key); !error.empty()){
      return Detail::invalid(error);
    }
    m_values.erase(key);
    return {SecretStatus::Ok, "", ""};
  }


  std::string scopeForConfigRoot(const std::filesystem::path& configRoot)
  {
    // FNV-1a 64: stable across runs and platforms, unlike std::hash.
    std::error_code ec;
    auto canonical = std::filesystem::weakly_canonical(configRoot, ec);
    std::string text = (ec ? configRoot : canonical).lexically_normal().generic_string();
    // weakly_canonical("root/.") keeps a trailing slash; same root, same scope.
    while(text.size() > 1 && text.back() == '/'){
      text.pop_back();
    }

    std::uint64_t hash = 14695981039346656037ull;
    for(unsigned char c : text){
      hash ^= c;
      hash *= 1099511628211ull;
    }

    char buffer[17];
    std::snprintf(buffer, sizeof(buffer), "%016llx", static_cast<unsigned long long>(hash));
    return buffer;
  }


  const char* toString(SecretStatus status)
  {
    switch(status){
      case SecretStatus::Ok: return "Ok";
      case SecretStatus::NotFound: return "NotFound";
      case SecretStatus::Unavailable: return "Unavailable";
      case SecretStatus::Invalid: return "Invalid";
      case SecretStatus::Error: return "Error";
    }
    return "Error";
  }


  SecretResult setBound(ISecretStore& store, const std::string& key, const std::string& binding, const std::string& value)
  {
    if(binding.empty()){
      return Detail::invalid("binding must not be empty");
    }
    nlohmann::json record = {{"binding", binding}, {"value", value}};
    return store.set(key, record.dump());
  }


  SecretResult getBound(ISecretStore& store, const std::string& key, const std::string& binding)
  {
    SecretResult stored = store.get(key);
    if(!stored.ok()){
      return stored;
    }

    nlohmann::json record = nlohmann::json::parse(stored.value, nullptr, /*allow_exceptions*/ false);
    if(record.is_discarded() || !record.contains("binding") || !record.contains("value")
       || !record.at("binding").is_string() || !record.at("value").is_string()){
      return {SecretStatus::Error, "", "stored record is not a bound secret"};
    }

    // Exact match: callers pass the normalized endpoint they connect to.
    if(record.at("binding").get<std::string>() != binding){
      return {SecretStatus::NotFound, "", ""};
    }
    return {SecretStatus::Ok, record.at("value").get<std::string>(), ""};
  }
}
