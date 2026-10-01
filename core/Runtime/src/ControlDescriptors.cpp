#include <Aurora/Runtime/ControlDescriptors.hpp>

#include <charconv>
#include <cstddef>
#include <cstdlib>

#include <Aurora/Network/Http/Server/HttpServer.hpp>

namespace Aurora::Runtime
{
  namespace
  {
    using Aurora::Network::Http::Server::HttpMethod;
    using Aurora::Network::Http::Server::HttpServer;
    using Aurora::Network::Http::Server::Request;
    using Aurora::Network::Http::Server::Response;


    // nlohmann writes a float widened to double, so 0.01f goes out as
    // 0.009999999776482582 -- and the WebUI derives a slider's displayed
    // decimals from its step's digits. Round-trip through the float's own
    // shortest decimal form so 0.01f serializes as 0.01.
    double shortestDecimal(float value)
    {
      char buffer[32];
      auto result = std::to_chars(buffer, buffer + sizeof(buffer), value);
      *result.ptr = '\0';
      return std::strtod(buffer, nullptr);
    }
  }
  void DescriptorRegistry::add(
    std::string owner,
    std::vector<ControlDescriptor> descriptors
  )
  {
    for(auto& descriptor : descriptors){
      bool known = false;
      for(std::size_t i = 0; i < m_descriptors.size(); i++){
        if(m_descriptors[i].key == descriptor.key){
          m_collisions.push_back({descriptor.key, m_owners[i], owner});
          m_descriptors[i] = descriptor;
          known = true;
          break;
        }
      }
      if(!known){
        m_descriptors.push_back(std::move(descriptor));
        m_owners.push_back(owner);
      }
    }
  }


  const std::vector<ControlDescriptor>& DescriptorRegistry::descriptors() const
  {
    return m_descriptors;
  }


  const std::vector<DescriptorRegistry::Collision>& DescriptorRegistry::collisions() const
  {
    return m_collisions;
  }


  const ControlDescriptor* DescriptorRegistry::find(const std::string& key) const
  {
    for(const auto& descriptor : m_descriptors){
      if(descriptor.key == key){
        return &descriptor;
      }
    }
    return nullptr;
  }


  nlohmann::json DescriptorRegistry::toJson() const
  {
    nlohmann::json entries = nlohmann::json::array();
    for(const auto& descriptor : m_descriptors){
      nlohmann::json entry = {
        {"key", descriptor.key},
        {"kind", descriptor.kind},
        {"description", descriptor.description},
      };
      if(descriptor.param){
        const auto& param = *descriptor.param;
        entry["param"] = {
          {"label", param.label},
          {"min", shortestDecimal(param.min)},
          {"max", shortestDecimal(param.max)},
          {"step", shortestDecimal(param.step)},
          {"unit", param.unit},
          {"default", shortestDecimal(param.defaultValue)},
          {"allowsUnset", param.allowsUnset},
        };
      }
      entries.push_back(std::move(entry));
    }
    return {{"descriptors", entries}};
  }


  void registerDescriptorRoutes(
    HttpServer& server,
    const DescriptorRegistry& registry
  )
  {
    const nlohmann::json payload = registry.toJson();
    server.addRoute(HttpMethod::Get, "/api/descriptors", [payload](const Request&, Response& res){
      res.status = 200;
      res.contentType = "application/json";
      res.body = payload.dump();
    });
  }
}
