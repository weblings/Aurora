#pragma once

#include <vector>
#include <string>

#include <nlohmann/json.hpp>

namespace Aurora::Runtime
{
  // The GET /api/nodes body: {"nodes": [...], "portTypes": [...]} for every
  // registered node type. With outputNames, the "output" enum params list them.
  nlohmann::json nodesPayload(const std::vector<std::string>* outputNames = nullptr);
}
