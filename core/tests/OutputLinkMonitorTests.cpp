#include <catch2/catch_test_macros.hpp>

#include <string>
#include <vector>

#include <Aurora/Runtime/OutputLinkMonitor.hpp>

using namespace Aurora::Runtime;
using Aurora::Output::LinkState;
using namespace std::chrono_literals;

namespace
{
  struct Rig
  {
    LinkState state{LinkState::Ok};
    bool hasProbe{true};
    bool paused{false};
    std::vector<std::string> calls;
    OutputLinkMonitor monitor{
      [this]{
        std::vector<Aurora::Output::LinkProbe> probes;
        if(hasProbe){ probes.push_back([this]{ return state; }); }
        return probes;
      },
      [this](const std::string&, const std::string& message){ calls.push_back("set " + message); },
      [this](const std::string&){ calls.push_back("clear"); },
      [this]{ calls.push_back("reconnect"); },
      [this]{ return paused; },
      1s};
    OutputLinkMonitor::Clock::time_point now = OutputLinkMonitor::Clock::time_point{} + 100s;

    void tick(){ now += 2s; monitor.poll(now); }
  };
}

TEST_CASE("an unreachable bridge raises a row on the first poll and clears on return", "[outputlink]")
{
  Rig rig;
  rig.state = LinkState::Unreachable;
  rig.tick();
  CHECK(rig.calls == std::vector<std::string>{std::string("set ") + OutputLinkMonitor::kUnreachableMessage});

  rig.tick();
  CHECK(rig.calls.size() == 1);

  // Back and streaming: the row clears, no reconnect was needed.
  rig.state = LinkState::Ok;
  rig.tick();
  CHECK(rig.calls.back() == "clear");
}

TEST_CASE("the bridge returning not streaming reconnects at once", "[outputlink]")
{
  Rig rig;
  rig.state = LinkState::Unreachable;
  rig.tick();
  rig.state = LinkState::Stopped;
  rig.tick();
  CHECK(rig.calls == std::vector<std::string>{
    std::string("set ") + OutputLinkMonitor::kUnreachableMessage,
    std::string("set ") + OutputLinkMonitor::kStoppedMessage,
    "reconnect"});
}

TEST_CASE("a stream stopped while online reconnects on the second poll", "[outputlink]")
{
  Rig rig;
  rig.tick();
  rig.state = LinkState::Stopped;
  rig.tick();
  CHECK(rig.calls == std::vector<std::string>{std::string("set ") + OutputLinkMonitor::kStoppedMessage});
  rig.tick();
  CHECK(rig.calls.back() == "reconnect");
  rig.state = LinkState::Ok;
  rig.tick();
  CHECK(rig.calls.back() == "clear");
}

TEST_CASE("a paused host or no probes never reconnects and clears the row", "[outputlink]")
{
  Rig rig;
  rig.state = LinkState::Stopped;
  rig.tick();
  rig.paused = true;
  rig.tick();
  CHECK(rig.calls == std::vector<std::string>{std::string("set ") + OutputLinkMonitor::kStoppedMessage, "clear"});

  rig.paused = false;
  rig.hasProbe = false;
  rig.tick();
  rig.tick();
  CHECK(rig.calls.size() == 2);
}

TEST_CASE("polls inside the interval are skipped", "[outputlink]")
{
  Rig rig;
  rig.state = LinkState::Unreachable;
  rig.tick();
  rig.state = LinkState::Ok;
  rig.monitor.poll(rig.now + 500ms);
  CHECK(rig.calls.size() == 1);
}
