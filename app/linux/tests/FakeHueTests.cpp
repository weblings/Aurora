#include <catch2/catch_test_macros.hpp>

#include <cstdlib>
#include <string>
#include <vector>

#include <Aurora/App/FakeHue.hpp>


namespace
{

  // Process env is shared across TEST_CASEs: save/restore each var touched,
  // unsetting when it was absent (an empty string counts as explicitly set
  // for setEnvDefault's purposes, so restore must preserve absentness).
  struct ScopedEnv
  {
    std::string name;
    std::string old;
    bool had = false;

    ScopedEnv(const char* envName): name(envName)
    {
      if(const char* existing = std::getenv(name.c_str())){
        had = true;
        old = existing;
      }
    }

    ~ScopedEnv()
    {
      if(had){
        ::setenv(name.c_str(), old.c_str(), 1);
      }
      else{
        ::unsetenv(name.c_str());
      }
    }
  };

  int argcFor(std::vector<char*>& args)
  {
    return static_cast<int>(args.size());
  }

} // namespace


TEST_CASE("--fake-hue flag detection", "[fakehue]")
{
  using Aurora::App::hasCliFlag;

  char prog[] = "Aurora";
  char fresh[] = "--fresh";
  char fakeHue[] = "--fake-hue";

  SECTION("absent by default")
  {
    std::vector<char*> args = {prog};
    CHECK(!hasCliFlag(argcFor(args), args.data(), "--fake-hue"));
  }

  SECTION("found among other flags")
  {
    std::vector<char*> args = {prog, fresh, fakeHue};
    CHECK(hasCliFlag(argcFor(args), args.data(), "--fake-hue"));
    CHECK(!hasCliFlag(argcFor(args), args.data(), "--nope"));
  }

  SECTION("program name itself never matches")
  {
    // argv[0] excluded: a binary literally named --fake-hue must not self-trigger.
    std::vector<char*> args = {fakeHue};
    CHECK(!hasCliFlag(argcFor(args), args.data(), "--fake-hue"));
  }
}


TEST_CASE("--fake-hue env defaults", "[fakehue]")
{
  using Aurora::App::applyFakeHueDefaults;

  ScopedEnv address("AURORA_HUE_BRIDGE_ADDRESS");
  ScopedEnv username("AURORA_HUE_USERNAME");
  ScopedEnv clientkey("AURORA_HUE_CLIENTKEY");
  ScopedEnv configId("AURORA_HUE_ENTERTAINMENT_CONFIG_ID");
  ScopedEnv devFlag("AURORA_DEV_FAKE_HUE");

  SECTION("unset vars get fake defaults")
  {
    applyFakeHueDefaults();
    CHECK(std::string(std::getenv("AURORA_HUE_BRIDGE_ADDRESS")) == "127.0.0.1:18443");
    CHECK(std::string(std::getenv("AURORA_HUE_USERNAME")) == "fakedevuser01");
    CHECK(std::string(std::getenv("AURORA_HUE_CLIENTKEY")) == "00112233445566778899aabbccddeeff");
    CHECK(std::string(std::getenv("AURORA_HUE_ENTERTAINMENT_CONFIG_ID")) == "conf-room-4zone");
    CHECK(std::string(std::getenv("AURORA_DEV_FAKE_HUE")) == "1");
  }

  SECTION("explicit env wins over defaults")
  {
    ::setenv("AURORA_HUE_BRIDGE_ADDRESS", "192.168.1.50", 1);
    ::setenv("AURORA_HUE_ENTERTAINMENT_CONFIG_ID", "conf-living-room", 1);
    applyFakeHueDefaults();
    CHECK(std::string(std::getenv("AURORA_HUE_BRIDGE_ADDRESS")) == "192.168.1.50");
    CHECK(std::string(std::getenv("AURORA_HUE_ENTERTAINMENT_CONFIG_ID")) == "conf-living-room");
    // Untouched siblings still default.
    CHECK(std::string(std::getenv("AURORA_HUE_USERNAME")) == "fakedevuser01");
  }
}
