#include <catch2/catch_test_macros.hpp>

#include <Aurora/Runtime/MonitorChangeWatcher.hpp>

using namespace Aurora::Runtime;
using namespace std::chrono_literals;

namespace
{
  struct Rig
  {
    bool changed{false};
    bool paused{false};
    bool busy{false};
    int rebuilds{0};
    MonitorChangeWatcher watcher{
      [this]{ bool c = changed; changed = false; return c; },
      [this]{ return paused; },
      [this]{ return busy; },
      [this]{ ++rebuilds; },
      1s};
    MonitorChangeWatcher::Clock::time_point now = MonitorChangeWatcher::Clock::time_point{} + 100s;

    void step(std::chrono::milliseconds by){ now += by; watcher.poll(now); }
  };
}

TEST_CASE("a monitor change rebuilds once after the debounce", "[monitorchange]")
{
  Rig rig;
  rig.step(100ms);
  CHECK(rig.rebuilds == 0);

  rig.changed = true;
  rig.step(0ms);
  rig.step(900ms);
  CHECK(rig.rebuilds == 0);

  rig.step(200ms);
  CHECK(rig.rebuilds == 1);

  rig.step(5000ms);
  CHECK(rig.rebuilds == 1);
}

TEST_CASE("a burst of changes is one rebuild after the last one settles", "[monitorchange]")
{
  Rig rig;
  rig.changed = true;
  rig.step(0ms);
  rig.step(800ms);
  rig.changed = true;
  rig.step(0ms);
  rig.step(800ms);
  CHECK(rig.rebuilds == 0);

  rig.step(300ms);
  CHECK(rig.rebuilds == 1);
}

TEST_CASE("a change during a light test waits for it to end", "[monitorchange]")
{
  Rig rig;
  rig.busy = true;
  rig.changed = true;
  rig.step(0ms);
  rig.step(3000ms);
  CHECK(rig.rebuilds == 0);

  rig.busy = false;
  rig.step(250ms);
  CHECK(rig.rebuilds == 1);
}

TEST_CASE("a change while paused is dropped", "[monitorchange]")
{
  Rig rig;
  rig.paused = true;
  rig.changed = true;
  rig.step(0ms);
  rig.step(2000ms);
  CHECK(rig.rebuilds == 0);

  rig.paused = false;
  rig.step(5000ms);
  CHECK(rig.rebuilds == 0);
}
