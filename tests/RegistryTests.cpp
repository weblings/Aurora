#include <catch2/catch_test_macros.hpp>

#include <algorithm>

#include <Aurora/App/Registry.hpp>

using namespace Aurora::App;
using namespace Aurora::Contracts;
using namespace Aurora::Input;
using namespace Aurora::Output;


namespace
{
  class FakeInput : public IVideoInput
  {
  public:
    const std::string& name() const override
    {
      static const std::string s_name = "fake-input";
      return s_name;
    }

    Resolution displayResolution() const override { return {1, 1}; }
    RefreshRate displayRefreshRate() const override { return 1; }
    void grabFrameSubsample(ImageData&) override {}
  };


  class FakeOutput : public IOutput
  {
  public:
    const std::string& name() const override
    {
      static const std::string s_name = "fake-output";
      return s_name;
    }

    void init() override {}
    bool isConnected() const override { return true; }
    void shutdown() override {}
    std::vector<uint8_t> zoneIds() const override { return {}; }
    void send(const Frame&) override {}
  };


  bool contains(const std::vector<std::string>& names, const std::string& target)
  {
    return std::find(names.begin(), names.end(), target) != names.end();
  }
}


TEST_CASE("Registry creates the input/output registered under a given name", "[Registry]")
{
  Registry registry;
  registry.registerInput("fake", []{ return std::make_unique<FakeInput>(); });
  registry.registerOutput("fake", []{ return std::make_unique<FakeOutput>(); });

  auto input = registry.createInput("fake");
  REQUIRE(input != nullptr);
  CHECK(input->name() == "fake-input");

  auto output = registry.createOutput("fake");
  REQUIRE(output != nullptr);
  CHECK(output->name() == "fake-output");
}


TEST_CASE("Registry returns nullptr for an unregistered name", "[Registry]")
{
  Registry registry;
  CHECK(registry.createInput("nope") == nullptr);
  CHECK(registry.createOutput("nope") == nullptr);
}


TEST_CASE("Registry lists every registered name", "[Registry]")
{
  Registry registry;
  registry.registerInput("a", []{ return std::make_unique<FakeInput>(); });
  registry.registerInput("b", []{ return std::make_unique<FakeInput>(); });
  registry.registerOutput("c", []{ return std::make_unique<FakeOutput>(); });

  auto inputNames = registry.inputNames();
  CHECK(inputNames.size() == 2);
  CHECK(contains(inputNames, "a"));
  CHECK(contains(inputNames, "b"));

  auto outputNames = registry.outputNames();
  CHECK(outputNames.size() == 1);
  CHECK(contains(outputNames, "c"));
}


TEST_CASE("Registry creates a fresh instance on every call", "[Registry]")
{
  Registry registry;
  registry.registerOutput("fake", []{ return std::make_unique<FakeOutput>(); });

  auto first = registry.createOutput("fake");
  auto second = registry.createOutput("fake");

  CHECK(first.get() != second.get());
}
