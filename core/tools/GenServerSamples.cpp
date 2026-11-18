// Writes the engine's reference JSON into web/graph-editor/src/graph/server-samples
// (Aurora-51nv.6). The browser module is tested against these, so a stale file fails.
//   GenServerSamples --fixtures <dir> [--samples <dir>] [--check]
// <dir> holds frames.rgba from core/Wasm/parity/gen_fixtures.py. The hand-written
// inputs (init.json and the two drafts) are read from <samples>/inputs.
// --check writes nothing and exits 1 when a file differs from what the engine makes.
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <iterator>
#include <map>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>

#include <Aurora/Runtime/Config.hpp>
#include <Aurora/Runtime/Graph/BuiltInGraphs.hpp>

#include "BrowserEngine.hpp"

namespace fs = std::filesystem;
using Json = nlohmann::json;
using namespace Aurora;

namespace
{
  // The preview scenario the JS test repeats: this many fixture frames, one step each.
  constexpr int kPreviewTicks = 8;
  constexpr float kStep = 1.0f / 60.0f;
  constexpr int kFrameWidth = 64;
  constexpr int kFrameHeight = 32;

  std::string readText(const fs::path& path)
  {
    std::ifstream in(path, std::ios::binary);
    return {std::istreambuf_iterator<char>(in), std::istreambuf_iterator<char>()};
  }

  Json readJson(const fs::path& path)
  {
    Json json = Json::parse(readText(path), nullptr, /*allow_exceptions*/ false);
    if(json.is_discarded()){
      std::cerr << "cannot read JSON from " << path.string() << "\n";
      std::exit(2);
    }
    return json;
  }

  Json reply(const std::string& text)
  {
    return Json::parse(text);
  }

  Json builtin(const std::string& id, const Json& graph)
  {
    return {{"id", id}, {"builtin", true}, {"graph", graph}};
  }

  // Equal, except floats may differ by under one 8-bit step: Mac and Linux OpenCV and
  // libm can move preview colors in the last bit (same tolerance as Aurora-51nv.7).
  bool nearlyEqual(const Json& a, const Json& b)
  {
    if(a.is_number_float() || b.is_number_float()){
      return a.is_number() && b.is_number() && std::abs(a.get<double>() - b.get<double>()) < 1.0 / 255.0;
    }
    if(a.type() != b.type() || a.size() != b.size()){
      return false;
    }
    if(a.is_array()){
      for(std::size_t i = 0; i < a.size(); ++i){
        if(!nearlyEqual(a[i], b[i])){ return false; }
      }
      return true;
    }
    if(a.is_object()){
      for(auto it = a.begin(); it != a.end(); ++it){
        if(!b.contains(it.key()) || !nearlyEqual(it.value(), b.at(it.key()))){ return false; }
      }
      return true;
    }
    return a == b;
  }
}

int main(int argc, char** argv)
{
  fs::path fixtures;
  fs::path samples = AURORA_SERVER_SAMPLES_DIR;
  bool check = false;
  for(int i = 1; i < argc; ++i){
    const std::string arg = argv[i];
    if(arg == "--check"){ check = true; }
    else if(arg == "--fixtures" && i + 1 < argc){ fixtures = argv[++i]; }
    else if(arg == "--samples" && i + 1 < argc){ samples = argv[++i]; }
    else{
      std::cerr << "usage: GenServerSamples --fixtures <dir> [--samples <dir>] [--check]\n";
      return 2;
    }
  }
  if(fixtures.empty()){
    std::cerr << "--fixtures <dir> is required (python core/Wasm/parity/gen_fixtures.py <dir>)\n";
    return 2;
  }

#ifndef AURORA_RUNTIME_AUDIO_AVAILABLE
  std::cerr << "needs a build with audio: the catalog and built-in audio graph include audio nodes\n";
  return 2;
#endif

  const std::string frames = readText(fixtures / "frames.rgba");
  const std::size_t frameBytes = std::size_t(kFrameWidth) * kFrameHeight * 4;
  if(frames.size() < frameBytes * kPreviewTicks){
    std::cerr << "frames.rgba is missing or too short in " << fixtures.string() << "\n";
    return 2;
  }

  const Json init = readJson(samples / "inputs" / "init.json");
  std::vector<std::string> outputNames;
  for(const Json& output : init.at("outputs")){
    outputNames.push_back(output.at("name").get<std::string>());
  }

  Wasm::BrowserEngine engine;
  if(reply(engine.init(init.dump())).contains("error")){
    std::cerr << "init.json rejected\n";
    return 2;
  }

  // Width 16 keeps the rescale node working and matches the parity fixtures.
  Runtime::ConfigData config;
  config.subsampleWidth = 16;
  config.interpolation = Contracts::Interpolation::Type::Area;
  const Json videoGraph = Runtime::Graph::builtInVideoGraph(
    outputNames, Runtime::Graph::videoOverlayFromConfig(config, outputNames));
  const Json audioGraph = Runtime::Graph::builtInAudioGraph(
    outputNames, Runtime::Graph::audioOverlayFromConfig(config, outputNames));

  // Opens a preview on the basic layout, feeds the first frames and returns its last snapshot.
  auto previewOf = [&](const std::string& session, const Json& doc){
    if(reply(engine.openPreview(session, doc.dump(), "basic")).contains("error")){
      std::cerr << "preview of " << session << " did not open\n";
      std::exit(2);
    }
    for(int tick = 0; tick < kPreviewTicks; ++tick){
      engine.feedVideo(reinterpret_cast<const std::uint8_t*>(frames.data()) + frameBytes * tick, kFrameWidth, kFrameHeight);
      engine.step(kStep);
    }
    Json snapshot = reply(engine.previewSnapshot(session));
    engine.closePreview(session);
    return snapshot;
  };

  std::map<std::string, Json> files;
  files["nodes.json"] = reply(engine.nodes());
  files["builtin.video.json"] = builtin("builtin.video", videoGraph);
  files["builtin.audio.json"] = builtin("builtin.audio", audioGraph);
  files["validate-ok.json"] = reply(engine.validate(videoGraph.dump()));
  files["validate-errors.json"] = reply(engine.validate(readJson(samples / "inputs" / "validate-errors.draft.json").dump()));
  files["preview-snapshot.json"] = previewOf("sample", videoGraph);
  files["preview-error.json"] = previewOf("sample", readJson(samples / "inputs" / "preview-error.draft.json"));

  int stale = 0;
  for(const auto& [name, json] : files){
    const fs::path path = samples / name;
    if(check){
      const Json saved = fs::exists(path) ? Json::parse(readText(path), nullptr, false) : Json();
      const bool colors = name.rfind("preview-", 0) == 0;
      const bool same = !saved.is_discarded() && !saved.is_null() && (colors ? nearlyEqual(saved, json) : saved == json);
      if(!same){
        std::cerr << name << " is stale: rerun GenServerSamples --fixtures <dir>\n";
        ++stale;
      }
      continue;
    }
    std::ofstream out(path, std::ios::binary);
    out << json.dump(1) << "\n";
    std::cout << "wrote " << name << "\n";
  }
  return stale == 0 ? 0 : 1;
}
