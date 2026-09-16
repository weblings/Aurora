#include <Aurora/Output/Hue/CredentialsStore.hpp>

#include <fstream>

#include <nlohmann/json.hpp>

namespace Aurora::Output::Hue
{
  namespace
  {
    using Json = nlohmann::json;
  }


  CredentialsStore::CredentialsStore(std::filesystem::path configRoot):
  m_path(std::move(configRoot) / "hue-credentials.json")
  {}


  HueConnection CredentialsStore::load() const
  {
    if(!std::filesystem::exists(m_path)){
      return {};
    }

    std::ifstream file(m_path);
    Json json = Json::parse(file, nullptr, /*allow_exceptions*/ false);

    if(json.is_discarded()){
      return {};
    }

    HueConnection connection;
    connection.bridgeAddress = json.value("bridgeAddress", "");
    connection.username = json.value("username", "");
    connection.clientkey = json.value("clientkey", "");
    connection.entertainmentConfigurationId = json.value("entertainmentConfigurationId", "");

    return connection;
  }


  void CredentialsStore::save(const HueConnection& connection) const
  {
    std::filesystem::create_directories(m_path.parent_path());

    Json json = {
      {"bridgeAddress", connection.bridgeAddress},
      {"username", connection.username},
      {"clientkey", connection.clientkey},
      {"entertainmentConfigurationId", connection.entertainmentConfigurationId}
    };

    std::ofstream file(m_path);
    file << json.dump(2) << "\n";
  }
}
