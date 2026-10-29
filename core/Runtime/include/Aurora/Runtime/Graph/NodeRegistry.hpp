#pragma once

#include <functional>
#include <memory>
#include <optional>
#include <string>
#include <string_view>
#include <unordered_map>
#include <vector>

#include <Aurora/Contracts/ControlDescriptor.hpp>
#include <Aurora/Runtime/Graph/GraphTypes.hpp>
#include <Aurora/Runtime/Graph/INode.hpp>

// Compile-time-plugin principle: node *types* are compiled-in C++; the
// graph only wires them. Real Tier 1 nodes arrive in G2a-c; G1 exercises
// the runtime with test-only nodes.
namespace Aurora::Runtime::Graph
{
  using NodeFactory = std::function<std::unique_ptr<INode>()>;

  // Agent-facing per-type fields, frozen in G0. Shared with tooltips: the
  // registry exports these as ControlDescriptor entries so agent prompts
  // and the editor read one source.
  struct NodeTypeMeta
  {
    std::string title;    // short display name for the editor, e.g. "Hue shift"
    std::string purpose;  // == descriptor `details`
    std::string useWhen;
    std::string example;  // JSON snippet of the node as in graph.json
    std::string cost{"cheap"}; // "cheap" | "moderate" | "heavy"
  };

  struct NodeTypeInfo
  {
    NodeTypeMeta meta;
    std::vector<PortDecl> inputs;
    std::vector<PortDecl> outputs;
    std::vector<ParamDecl> params;
    NodeFactory factory;
    // Set for sink nodes (output.send): names the string param binding the
    // node to one output (e.g. "output"). The loader rejects two sinks on
    // the same output (Aurora-o13: two sources sharing an output flicker,
    // so a pick-or-mix node is required).
    std::optional<std::string> sinkBindingParam{};
  };

  class NodeRegistry
  {
  public:
    // False when `type` is already registered; the existing entry is kept.
    bool registerType(std::string type, NodeTypeInfo info);

    const NodeTypeInfo* find(std::string_view type) const;

    std::vector<std::string> types() const;

    // One `node.<type>` entry (details == purpose) plus one
    // `node.<type>.<param>` entry per param, for DescriptorRegistry. Param
    // `unit` comes from the ParamSchema; kind derives from the param kind.
    std::vector<Contracts::ControlDescriptor> toDescriptors() const;

  private:
    std::unordered_map<std::string, NodeTypeInfo> m_types;
    std::vector<std::string> m_order; // registration order
  };
}
