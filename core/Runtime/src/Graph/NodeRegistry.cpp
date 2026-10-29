#include <Aurora/Runtime/Graph/NodeRegistry.hpp>

namespace Aurora::Runtime::Graph
{
  bool NodeRegistry::registerType(std::string type, NodeTypeInfo info)
  {
    if(m_types.find(type) != m_types.end()){
      return false;
    }
    m_order.push_back(type);
    m_types.emplace(std::move(type), std::move(info));
    return true;
  }

  const NodeTypeInfo* NodeRegistry::find(std::string_view type) const
  {
    auto it = m_types.find(std::string(type));
    return it != m_types.end() ? &it->second : nullptr;
  }

  std::vector<std::string> NodeRegistry::types() const
  {
    return m_order;
  }

  namespace
  {
    std::string descriptorKind(ParamKind kind)
    {
      switch(kind){
        case ParamKind::Float:
        case ParamKind::OptionalFloat:
          return "slider";
        case ParamKind::Bool:
          return "bool";
        case ParamKind::Enum:
          return "dropdown";
        case ParamKind::Gradient:
          return "text";
      }
      return "text";
    }
  }

  std::vector<Contracts::ControlDescriptor> NodeRegistry::toDescriptors() const
  {
    std::vector<Contracts::ControlDescriptor> out;
    for(const auto& type : m_order){
      const NodeTypeInfo& info = m_types.at(type);
      Contracts::ControlDescriptor nodeEntry;
      nodeEntry.key = "node." + type;
      nodeEntry.kind = "text";
      nodeEntry.description = info.meta.purpose;
      nodeEntry.title = info.meta.title;
      nodeEntry.useWhen = info.meta.useWhen;
      nodeEntry.example = info.meta.example;
      nodeEntry.cost = info.meta.cost;
      out.push_back(std::move(nodeEntry));
      for(const auto& param : info.params){
        Contracts::ControlDescriptor entry;
        entry.key = "node." + type + "." + param.name;
        entry.kind = descriptorKind(param.kind);
        entry.description = param.description.empty() ? info.meta.purpose : param.description;
        if(param.kind == ParamKind::Float || param.kind == ParamKind::OptionalFloat){
          entry.param = param.schema;
        }
        out.push_back(std::move(entry));
      }
    }
    return out;
  }
}
