#include <Aurora/Runtime/GraphValidation.hpp>

#include <unordered_set>

#include <Aurora/Runtime/Graph/GraphLoader.hpp>

namespace Aurora::Runtime
{
  nlohmann::json validateGraphDoc(
    const Graph::NodeRegistry& nodes,
    const std::vector<std::string>& knownOutputs,
    const nlohmann::json& doc)
  {
    Graph::LoadOptions options;
    options.knownOutputs = std::unordered_set<std::string>(knownOutputs.begin(), knownOutputs.end());

    const Graph::LoadResult result = Graph::loadGraph(doc, nodes, options);
    nlohmann::json errors = nlohmann::json::array();
    for(const Graph::LoadIssue& issue : result.issues){
      auto orNull = [](const std::string& text){
        return text.empty() ? nlohmann::json(nullptr) : nlohmann::json(text);
      };
      errors.push_back({
        {"node", orNull(issue.node)},
        {"message", issue.message},
        {"code", issue.code},
        {"port", orNull(issue.port)},
        {"param", orNull(issue.param)},
        {"options", issue.options}
      });
    }
    return {{"valid", result.ok}, {"errors", errors}};
  }


  GraphSourceNeeds graphSourceNeeds(const nlohmann::json& doc)
  {
    GraphSourceNeeds needs;
    const auto nodes = doc.is_object() ? doc.find("nodes") : doc.end();
    if(!doc.is_object() || nodes == doc.end() || !nodes->is_array()){
      return needs;
    }
    for(const auto& node : *nodes){
      const std::string type = node.is_object() ? node.value("type", std::string{}) : std::string{};
      needs.video = needs.video || type == "video.capture";
      needs.audio = needs.audio || type == "audio.capture";
    }
    return needs;
  }
}
