#include <Aurora/Runtime/NodeCatalog.hpp>

#include <Aurora/Runtime/ControlDescriptors.hpp>
#include <Aurora/Runtime/Graph/AllNodes.hpp>
#include <Aurora/Runtime/Graph/NodeRegistry.hpp>

namespace Aurora::Runtime
{
  namespace
  {
    nlohmann::json portsJson(const std::vector<Graph::PortDecl>& ports, bool withRequired)
    {
      nlohmann::json list = nlohmann::json::array();
      for(const auto& port : ports){
        nlohmann::json entry{
          {"name", port.name},
          {"type", Graph::portTypeName(port.type)},
          {"description", port.description}};
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
  }


  nlohmann::json nodesPayload(const std::vector<std::string>* outputNames)
    {
      Graph::NodeRegistry registry;
      Graph::registerAllNodes(registry, true);

      nlohmann::json nodes = nlohmann::json::array();
      for(const auto& type : registry.types()){
        const Graph::NodeTypeInfo& info = *registry.find(type);
        nlohmann::json params = nlohmann::json::array();
        for(const auto& param : info.params){
          nlohmann::json entry = paramJson(param);
          // The output param declares no options at registration (names are
          // only known at runtime); fill in the registered outputs.
          if(outputNames && param.kind == Graph::ParamKind::Enum && param.name == "output" && param.enumOptions.empty()){
            entry["options"] = *outputNames;
          }
          params.push_back(std::move(entry));
        }
        nlohmann::json entry{
          {"type", type},
          {"title", info.meta.title},
          {"group", info.meta.group},
          {"summary", info.meta.summary},
          {"tip", info.meta.tip},
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
      // The one glossary of what each port type means (Aurora-z6kw).
      nlohmann::json portTypes = nlohmann::json::array();
      for(const Graph::PortType type : Graph::allPortTypes()){
        portTypes.push_back({{"name", Graph::portTypeName(type)}, {"meaning", Graph::portTypeMeaning(type)}});
      }
      return {{"nodes", std::move(nodes)}, {"portTypes", std::move(portTypes)}};
    }
}
