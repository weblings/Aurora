#include <catch2/catch_test_macros.hpp>

#include <string>
#include <vector>

#include <Aurora/App/AudioPermissionPublisher.hpp>

using Aurora::App::AudioPermissionPublisher;

namespace
{

struct Harness
{
  bool denied{false};
  bool accept{true};
  std::vector<std::string> calls;
  AudioPermissionPublisher publisher{
    [this]{ return denied; },
    [this](const std::string& source, const std::string&){ calls.push_back("set:" + source); return accept; },
    [this](const std::string& source){ calls.push_back("remove:" + source); }
  };
};

} // namespace


TEST_CASE("publishes on false->true, removes on true->false", "[audiopermission]")
{
  Harness h;
  h.publisher.poll();
  CHECK(h.calls.empty());
  h.denied = true;
  h.publisher.poll();
  REQUIRE(h.calls == std::vector<std::string>{"set:audio_permission"});
  h.denied = false;
  h.publisher.poll();
  REQUIRE(h.calls == std::vector<std::string>{"set:audio_permission", "remove:audio_permission"});
}

TEST_CASE("does not republish while the flag stays true", "[audiopermission]")
{
  Harness h;
  h.denied = true;
  for(int i = 0; i < 5; ++i){ h.publisher.poll(); }
  CHECK(h.calls.size() == 1);
}

TEST_CASE("a refused publish is retried on the next poll", "[audiopermission]")
{
  Harness h;
  h.denied = true;
  h.accept = false;
  h.publisher.poll();
  h.accept = true;
  h.publisher.poll();
  h.publisher.poll();
  CHECK(h.calls.size() == 2);
}

TEST_CASE("returns after the flag clears and denies again", "[audiopermission]")
{
  Harness h;
  h.denied = true;
  h.publisher.poll();
  h.denied = false;
  h.publisher.poll();
  h.denied = true;
  h.publisher.poll();
  CHECK(h.calls.size() == 3);
}
