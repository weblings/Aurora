#pragma once

#include <catch2/catch_test_macros.hpp>

#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <sstream>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>

#include <Aurora/Contracts/Frame.hpp>
#include <Aurora/Output/IOutput.hpp>

// Golden-file parity harness (Aurora-tft): a scenario runs deterministic,
// code-generated input through today's pipeline and records every Frame
// each output receives; the recording is compared against a committed
// fixture under core/tests/golden/. When the node graph replaces the
// orchestrators, the same scenarios run through the built-in graphs and
// must still match -- see docs/planning/NodeGraphPipeline.md.
//
// Regenerate after a deliberate behaviour change (and review the diff):
//   AURORA_UPDATE_GOLDEN=1 ctest --test-dir <build> -R Parity
//
// AURORA_GOLDEN_DIR is a compile definition pointing at the source tree.
namespace Aurora::Tests::Golden
{
  struct RecordedFrame
  {
    int tick{0};
    std::string output;
    Contracts::Frame frame;
  };

  using Recording = std::vector<RecordedFrame>;


  // IOutput that keeps every Frame it's sent, stamped with the tick the
  // scenario set before calling update() -- unlike the unit tests' FakeOutput,
  // which keeps only the last one.
  class RecordingOutput : public Output::IOutput
  {
  public:
    RecordingOutput(std::string name, std::vector<uint8_t> liveZoneIds, Recording& sink, const int& tick):
    m_name(std::move(name)),
    m_liveZoneIds(std::move(liveZoneIds)),
    m_sink(sink),
    m_tick(tick)
    {}

    const std::string& name() const override { return m_name; }
    void init() override { m_connected = true; }
    bool isConnected() const override { return m_connected; }
    void shutdown(bool) override { m_connected = false; }
    std::vector<uint8_t> zoneIds() const override { return m_liveZoneIds; }

    void send(const Contracts::Frame& frame) override
    {
      m_sink.push_back({m_tick, m_name, frame});
    }

  private:
    std::string m_name;
    std::vector<uint8_t> m_liveZoneIds;
    Recording& m_sink;
    const int& m_tick;
    bool m_connected{true};
  };


  // Deterministic 32-bit LCG (Numerical Recipes constants) -- std::*_distribution
  // output differs between standard libraries, so fixtures can't use them.
  class Lcg
  {
  public:
    explicit Lcg(uint32_t seed): m_state(seed) {}

    // Uniform in [-1, 1].
    float nextSigned()
    {
      m_state = m_state * 1664525u + 1013904223u;
      return static_cast<float>(m_state >> 8) / static_cast<float>(1u << 23) - 1.0f;
    }

  private:
    uint32_t m_state;
  };


  inline std::filesystem::path fixturePath(const std::string& scenario)
  {
    return std::filesystem::path(AURORA_GOLDEN_DIR) / (scenario + ".json");
  }


  // One frame per line so a regenerated fixture diffs readably in review.
  inline void write(const std::string& scenario, const std::string& description, const Recording& recording)
  {
    std::filesystem::create_directories(fixturePath(scenario).parent_path());
    std::ofstream file(fixturePath(scenario));
    file << "{\n";
    file << "  \"scenario\": " << nlohmann::json(scenario).dump() << ",\n";
    file << "  \"description\": " << nlohmann::json(description).dump() << ",\n";
    file << "  \"frames\": [\n";
    for(size_t i = 0; i < recording.size(); ++i){
      const auto& recorded = recording[i];
      file << "    {\"tick\": " << recorded.tick
           << ", \"output\": " << nlohmann::json(recorded.output).dump()
           << ", \"zones\": [";
      for(size_t z = 0; z < recorded.frame.size(); ++z){
        const auto& zone = recorded.frame[z];
        std::ostringstream gamma;
        gamma << std::setprecision(6) << zone.gamma;
        file << (z ? ", " : "") << "["
             << static_cast<int>(zone.id) << ", "
             << static_cast<int>(zone.color.m_r) << ", "
             << static_cast<int>(zone.color.m_g) << ", "
             << static_cast<int>(zone.color.m_b) << ", "
             << gamma.str() << "]";
      }
      file << "]}" << (i + 1 < recording.size() ? "," : "") << "\n";
    }
    file << "  ]\n}\n";
  }


  // Channel tolerance: 1 step of 255, not 0 -- libm (exp/fmod), FMA
  // contraction (Apple clang on arm64 contracts by default) and aubio's
  // float paths can move a value across a rounding boundary between
  // platforms. A real behaviour change shows up as many diffs well above 1.
  inline void check(const std::string& scenario, const std::string& description, const Recording& recording, int tolerance = 1)
  {
    REQUIRE_FALSE(recording.empty());

    if(std::getenv("AURORA_UPDATE_GOLDEN")){
      write(scenario, description, recording);
      WARN("Regenerated golden fixture " << fixturePath(scenario).string());
      return;
    }

    std::ifstream file(fixturePath(scenario));
    INFO("Missing fixture -- run with AURORA_UPDATE_GOLDEN=1 to create " << fixturePath(scenario).string());
    REQUIRE(file.good());

    nlohmann::json golden = nlohmann::json::parse(file);
    const auto& frames = golden.at("frames");
    REQUIRE(frames.size() == recording.size());

    int mismatches = 0;
    for(size_t i = 0; i < recording.size(); ++i){
      const auto& expected = frames[i];
      const auto& actual = recording[i];
      INFO("scenario " << scenario << ", frame " << i << " (tick " << actual.tick << ", output " << actual.output << ")");

      REQUIRE(expected.at("tick").get<int>() == actual.tick);
      REQUIRE(expected.at("output").get<std::string>() == actual.output);
      const auto& zones = expected.at("zones");
      REQUIRE(zones.size() == actual.frame.size());

      for(size_t z = 0; z < zones.size(); ++z){
        const auto& zone = actual.frame[z];
        const auto& want = zones[z];
        CHECK(want[0].get<int>() == static_cast<int>(zone.id));

        bool colorOk =
          std::abs(want[1].get<int>() - static_cast<int>(zone.color.m_r)) <= tolerance &&
          std::abs(want[2].get<int>() - static_cast<int>(zone.color.m_g)) <= tolerance &&
          std::abs(want[3].get<int>() - static_cast<int>(zone.color.m_b)) <= tolerance;
        bool gammaOk = std::abs(want[4].get<float>() - zone.gamma) <= 1e-5f;

        if(!colorOk || !gammaOk){
          // Report the first few in full, then just count -- one regression
          // usually breaks hundreds of frames.
          if(++mismatches <= 5){
            FAIL_CHECK("zone " << static_cast<int>(zone.id)
              << " expected " << want.dump()
              << " got [" << static_cast<int>(zone.id) << ", "
              << static_cast<int>(zone.color.m_r) << ", "
              << static_cast<int>(zone.color.m_g) << ", "
              << static_cast<int>(zone.color.m_b) << ", " << zone.gamma << "]");
          }
        }
      }
    }
    INFO("scenario " << scenario);
    CHECK(mismatches == 0);
  }
}
