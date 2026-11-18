// BrowserEngine::loadLive keeps node state across reloads (Aurora-51nv.13).
#include <catch2/catch_test_macros.hpp>

#include <string>

#include <nlohmann/json.hpp>

#include "BrowserEngine.hpp"

using Json = nlohmann::json;
using Aurora::Wasm::BrowserEngine;

namespace
{
  const char* kInit = R"({"outputs": [{"name": "hue", "zones": [
    {"zoneId": 1, "uvs": {"min": [0, 0], "max": [1, 1]}, "active": true, "gamma": 0, "everConfigured": true}]}]})";

  // A hue that integrates a swinging rate, so its state is the accumulated angle and lfo phase.
  std::string driftDoc(double saturation)
  {
    return Json{
      {"version", 1},
      {"nodes", {
        {{"id", "rate"}, {"type", "lfo"}, {"params", {{"rateHz", 0.5}, {"min", 60}, {"max", 120}}}},
        {{"id", "drift"}, {"type", "integrate"}, {"params", Json::object()}},
        {{"id", "tone"}, {"type", "color.fromHSV"}, {"params", {{"saturation", saturation}, {"value", 1}}}},
        {{"id", "all"}, {"type", "frame.broadcast"}, {"params", {{"output", "hue"}}}},
        {{"id", "send"}, {"type", "output.send"}, {"params", {{"output", "hue"}}}}}},
      {"edges", Json::array({
        Json::array({"rate.value", "drift.rate"}),
        Json::array({"drift.angle", "tone.hue"}),
        Json::array({"tone.color", "all.color"}),
        Json::array({"all.frame", "send.frame"})})}}.dump();
  }

  void start(BrowserEngine& engine)
  {
    REQUIRE_FALSE(Json::parse(engine.init(kInit)).contains("error"));
  }

  void stepTimes(BrowserEngine& engine, int count)
  {
    for(int i = 0; i < count; ++i){
      REQUIRE_FALSE(Json::parse(engine.step(0.1f)).contains("error"));
    }
  }

  Json zoneOf(BrowserEngine& engine)
  {
    return Json::parse(engine.liveColors()).at("outputs").at(0).at("zones").at(0);
  }

  bool sameColor(const Json& a, const Json& b)
  {
    return a.at("r") == b.at("r") && a.at("g") == b.at("g") && a.at("b") == b.at("b");
  }
}

TEST_CASE("loadLive keeps node state when reloading a live graph", "[BrowserEngine]")
{
  BrowserEngine reloaded;
  start(reloaded);
  REQUIRE_FALSE(Json::parse(reloaded.loadLive(driftDoc(1.0))).contains("error"));
  stepTimes(reloaded, 9);
  REQUIRE_FALSE(Json::parse(reloaded.loadLive(driftDoc(0.9))).contains("error"));
  stepTimes(reloaded, 1);

  // Same ten ticks with the final param from the start: only adopted state matches it.
  BrowserEngine steady;
  start(steady);
  REQUIRE_FALSE(Json::parse(steady.loadLive(driftDoc(0.9))).contains("error"));
  stepTimes(steady, 10);

  BrowserEngine fresh;
  start(fresh);
  REQUIRE_FALSE(Json::parse(fresh.loadLive(driftDoc(0.9))).contains("error"));
  stepTimes(fresh, 1);

  CHECK(sameColor(zoneOf(reloaded), zoneOf(steady)));
  CHECK_FALSE(sameColor(zoneOf(reloaded), zoneOf(fresh)));
}

TEST_CASE("loadLive with a bad doc keeps the previous live graph running", "[BrowserEngine]")
{
  BrowserEngine engine;
  start(engine);
  REQUIRE_FALSE(Json::parse(engine.loadLive(driftDoc(1.0))).contains("error"));
  stepTimes(engine, 3);

  const Json bad = Json::parse(engine.loadLive(R"({"version": 1, "nodes": [{"id": "x", "type": "no.such.node", "params": {}}], "edges": []})"));
  CHECK(bad.at("error") == "cannot_load");

  stepTimes(engine, 1);
  const Json colors = Json::parse(engine.liveColors());
  CHECK_FALSE(colors.contains("error"));
  CHECK_FALSE(colors.at("outputs").at(0).at("zones").empty());
}

TEST_CASE("validate reports which capture inputs a graph reads", "[BrowserEngine]")
{
  BrowserEngine engine;
  start(engine);
  const auto inputsOf = [&engine](const Json& doc){
    return Json::parse(engine.validate(doc.dump())).at("inputs");
  };
  const auto withNode = [](const char* type){
    return Json{{"version", 1}, {"nodes", {{{"id", "n"}, {"type", type}, {"params", Json::object()}}}}, {"edges", Json::array()}};
  };

  CHECK(inputsOf(withNode("video.capture")) == Json{{"video", true}, {"audio", false}});
  CHECK(inputsOf(withNode("audio.capture")) == Json{{"video", false}, {"audio", true}});
  CHECK(inputsOf(withNode("lfo")) == Json{{"video", false}, {"audio", false}});
  // An invalid graph still answers, with the inputs it declares.
  Json broken = withNode("video.capture");
  broken["edges"] = Json::array({Json::array({"n.frame", "missing.in"})});
  const Json verdict = Json::parse(engine.validate(broken.dump()));
  CHECK_FALSE(verdict.at("valid").get<bool>());
  CHECK(verdict.at("inputs") == Json{{"video", true}, {"audio", false}});
  CHECK(Json::parse(engine.validate(driftDoc(1.0))).at("valid").get<bool>());
  CHECK(Json::parse(engine.validate(driftDoc(1.0))).at("inputs") == Json{{"video", false}, {"audio", false}});
}
