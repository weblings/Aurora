#pragma once

#include <string>
#include <vector>

#include <nlohmann/json.hpp>

namespace Aurora::Runtime::Graph { class NodeRegistry; }

namespace Aurora::Runtime
{
  // {"valid", "errors": [{node, message, code, port, param, options}]} for one
  // graph doc, loaded against the given output names. No transport or store.
  nlohmann::json validateGraphDoc(
    const Graph::NodeRegistry& nodes,
    const std::vector<std::string>& knownOutputs,
    const nlohmann::json& doc
  );


  // The capture sources a graph doc declares, by node type.
  struct GraphSourceNeeds
  {
    bool video{false};
    bool audio{false};
  };

  GraphSourceNeeds graphSourceNeeds(const nlohmann::json& doc);
}
