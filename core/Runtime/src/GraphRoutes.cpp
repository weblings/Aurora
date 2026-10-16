#include <Aurora/Runtime/GraphRoutes.hpp>

#include <nlohmann/json.hpp>

#include <Aurora/Network/Http/Server/HttpServer.hpp>
#include <Aurora/Runtime/ControlDescriptors.hpp>
#include <Aurora/Runtime/Graph/AllNodes.hpp>
#include <Aurora/Runtime/Graph/FrameNodes.hpp>
#include <Aurora/Runtime/Graph/MathNodes.hpp>
#include <Aurora/Runtime/Graph/BlendNodes.hpp>
#include <Aurora/Runtime/Graph/SpatialNodes.hpp>
#include <Aurora/Runtime/Graph/ColorNodes.hpp>
#include <Aurora/Runtime/Graph/TimeNodes.hpp>
#include <Aurora/Runtime/Graph/NodeRegistry.hpp>
#include <Aurora/Runtime/Graph/VideoNodes.hpp>
#include <Aurora/Runtime/Pipeline.hpp>

#ifdef AURORA_RUNTIME_AUDIO_AVAILABLE
#include <Aurora/Runtime/Graph/AudioNodes.hpp>
#endif

namespace Aurora::Runtime
{
  using Aurora::Network::Http::Server::HttpMethod;
  using Aurora::Network::Http::Server::HttpServer;
  using Aurora::Network::Http::Server::Request;
  using Aurora::Network::Http::Server::Response;

  namespace
  {
    nlohmann::json portsJson(const std::vector<Graph::PortDecl>& ports, bool withRequired)
    {
      nlohmann::json list = nlohmann::json::array();
      for(const auto& port : ports){
        nlohmann::json entry{{"name", port.name}, {"type", Graph::portTypeName(port.type)}};
        if(withRequired){
          entry["required"] = port.required;
        }
        list.push_back(std::move(entry));
      }
      return list;
    }


    nlohmann::json paramJson(const Graph::ParamDecl& param)
    {
      nlohmann::json entry{
        {"name", param.name},
        {"kind", Graph::paramKindName(param.kind)},
        {"description", param.description}
      };
      switch(param.kind){
        case Graph::ParamKind::Float:
        case Graph::ParamKind::OptionalFloat:
          entry["label"] = param.schema.label;
          entry["min"] = shortestDecimal(param.schema.min);
          entry["max"] = shortestDecimal(param.schema.max);
          entry["step"] = shortestDecimal(param.schema.step);
          entry["unit"] = param.schema.unit;
          entry["default"] = shortestDecimal(param.schema.defaultValue);
          entry["allowsUnset"] = param.schema.allowsUnset;
          break;
        case Graph::ParamKind::Bool:
          entry["default"] = param.defaultBool;
          break;
        case Graph::ParamKind::Enum:
          entry["options"] = param.enumOptions;
          entry["default"] = param.defaultEnum;
          break;
        case Graph::ParamKind::Gradient:{
          nlohmann::json stops = nlohmann::json::array();
          for(const auto& stop : param.defaultGradient.stops){
            stops.push_back({
              {"pos", shortestDecimal(stop.position)},
              {"color", Graph::colorToHex(stop.color)}});
          }
          entry["default"] = std::move(stops);
          break;
        }
      }
      return entry;
    }


    nlohmann::json nodesPayload()
    {
      Graph::NodeRegistry registry;
      Graph::registerAllNodes(registry, true);

      nlohmann::json nodes = nlohmann::json::array();
      for(const auto& type : registry.types()){
        const Graph::NodeTypeInfo& info = *registry.find(type);
        nlohmann::json params = nlohmann::json::array();
        for(const auto& param : info.params){
          params.push_back(paramJson(param));
        }
        nlohmann::json entry{
          {"type", type},
          {"purpose", info.meta.purpose},
          {"useWhen", info.meta.useWhen},
          {"example", info.meta.example},
          {"cost", info.meta.cost},
          {"inputs", portsJson(info.inputs, true)},
          {"outputs", portsJson(info.outputs, false)},
          {"params", std::move(params)}
        };
        if(info.sinkBindingParam){
          entry["sink"] = *info.sinkBindingParam;
        }
        nodes.push_back(std::move(entry));
      }
      return {{"nodes", std::move(nodes)}};
    }
  }


  void registerNodesRoute(HttpServer& server)
  {
    const nlohmann::json payload = nodesPayload();
    server.addRoute(HttpMethod::Get, "/api/nodes", [payload](const Request&, Response& res){
      res.contentType = "application/json";
      res.body = payload.dump();
    });
  }


  void registerGraphRoute(HttpServer& server, PipelineHost& pipelineHost)
  {
    server.addRoute(HttpMethod::Get, "/api/graph", [&pipelineHost](const Request&, Response& res){
      auto graph = pipelineHost.graphJson();
      res.contentType = "application/json";
      res.body = nlohmann::json{{"graph", graph ? std::move(*graph) : nlohmann::json(nullptr)}}.dump();
    });
  }
}
