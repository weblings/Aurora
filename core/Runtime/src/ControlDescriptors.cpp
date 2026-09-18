#include <Aurora/Runtime/ControlDescriptors.hpp>

#include <cstddef>

#include <Aurora/Network/Http/Server/HttpServer.hpp>

namespace Aurora::Runtime
{
  namespace
  {
    using Aurora::Network::Http::Server::HttpMethod;
    using Aurora::Network::Http::Server::HttpServer;
    using Aurora::Network::Http::Server::Request;
    using Aurora::Network::Http::Server::Response;
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
      entries.push_back({
        {"key", descriptor.key},
        {"kind", descriptor.kind},
        {"description", descriptor.description},
      });
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
