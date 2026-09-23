#include <chrono>
#include <cstdlib>
#include <filesystem>
#include <stdexcept>
#include <string>
#include <thread>

#include <catch2/catch_test_macros.hpp>
#include <httplib.h>
#include <nlohmann/json.hpp>

#include <Aurora/Network/Http/Server/HttpServer.hpp>
#include <Aurora/Output/Hue/PairingRoutes.hpp>

// Focused coverage for the dev-only divergences in registerPairingRoutes
// (AURORA_DEV_FAKE_HUE, written for tools/fake-hue-bridge): the discover
// fake-address precedence and the link-button error mapping. Every arm here
// is offline -- the one arm that isn't (flag unset, hitting
// discovery.meethue.com) is deliberately untested.
using namespace Aurora::Network::Http::Server;
using Aurora::Output::Hue::registerPairingRoutes;
using Json = nlohmann::json;
using namespace std::chrono_literals;


namespace
{
  // Same threading model as core/tests/NetworkTests.cpp: listen()
  // accept()-s on its own thread, so retry briefly instead of sleeping a
  // fixed guess.
  httplib::Result getWithRetry(httplib::Client& client, const std::string& path)
  {
    httplib::Result result;
    for(int attempt = 0; attempt < 50; ++attempt){
      result = client.Get(path);
      if(result && result->status != -1){
        return result;
      }
      std::this_thread::sleep_for(10ms);
    }
    return result;
  }


  httplib::Result putJsonWithRetry(
    httplib::Client& client,
    const std::string& path,
    const Json& body
  )
  {
    httplib::Result result;
    for(int attempt = 0; attempt < 50; ++attempt){
      result = client.Put(path, body.dump(), "application/json");
      if(result && result->status != -1){
        return result;
      }
      std::this_thread::sleep_for(10ms);
    }
    return result;
  }


  struct ScopedTempDir
  {
    std::filesystem::path path;

    explicit ScopedTempDir(const std::string& name):
    path(std::filesystem::temp_directory_path() / ("aurora-pairing-tests-" + name))
    {
      std::filesystem::remove_all(path);
      std::filesystem::create_directories(path);
    }

    ~ScopedTempDir()
    {
      std::filesystem::remove_all(path);
    }
  };


  void setEnvVar(const char* name, const char* value)
  {
#ifdef _WIN32
    _putenv_s(name, value);
#else
    setenv(name, value, 1);
#endif
  }


  // Process env is shared across TEST_CASEs, so every test sets exactly the
  // vars it reads. Restoring to "" is unset-equivalent here: every reader
  // treats "" as absent (sanitizeBridgeAddress("") is empty, and only
  // getenv()-nullness gates the dev arm, whose tests always set it).
  struct ScopedEnv
  {
    std::string name;
    std::string old;

    ScopedEnv(const char* envName, const char* value): name(envName)
    {
      if(const char* existing = std::getenv(name.c_str())){
        old = existing;
      }
      setEnvVar(name.c_str(), value);
    }

    ~ScopedEnv()
    {
      setEnvVar(name.c_str(), old.c_str());
    }
  };


  struct TestServer
  {
    HttpServer server;
    std::thread thread;
    httplib::Client client;

    TestServer(const std::filesystem::path& configRoot, unsigned port):
    client("127.0.0.1", static_cast<int>(port))
    {
      registerPairingRoutes(server, configRoot);
      if(!server.bind("127.0.0.1", port)){
        throw std::runtime_error("bind failed");
      }
      thread = std::thread([this](){ server.listen(); });
    }

    ~TestServer()
    {
      server.stop();
      if(thread.joinable()){
        thread.join();
      }
    }
  };


  std::string discoverAddress(httplib::Client& client)
  {
    auto result = getWithRetry(client, "/api/hue/discover");
    REQUIRE(result);
    REQUIRE(result->status == 200);
    Json body = Json::parse(result->body);
    REQUIRE(body.value("succeeded", false));
    REQUIRE(body["bridges"].size() == 1);
    CHECK(body["bridges"][0].value("id", "") == "fake-hue-bridge");
    return body["bridges"][0].value("internalipaddress", "");
  }
}


TEST_CASE("discover prefers the explicit fake address over AURORA_HUE_BRIDGE_ADDRESS", "[PairingRoutes]")
{
  ScopedEnv dev("AURORA_DEV_FAKE_HUE", "10.9.9.9:18443");
  ScopedEnv hue("AURORA_HUE_BRIDGE_ADDRESS", "10.1.2.3:18443");
  ScopedTempDir configRoot("discover-explicit");
  TestServer test(configRoot.path, 18231);

  CHECK(discoverAddress(test.client) == "10.9.9.9:18443");
}


TEST_CASE("discover reuses AURORA_HUE_BRIDGE_ADDRESS when the dev flag carries no address", "[PairingRoutes]")
{
  ScopedEnv dev("AURORA_DEV_FAKE_HUE", "");
  ScopedEnv hue("AURORA_HUE_BRIDGE_ADDRESS", "10.1.2.3:18443");
  ScopedTempDir configRoot("discover-reuse");
  TestServer test(configRoot.path, 18232);

  CHECK(discoverAddress(test.client) == "10.1.2.3:18443");
}


TEST_CASE("discover defaults to localhost when no address is configured anywhere", "[PairingRoutes]")
{
  ScopedEnv dev("AURORA_DEV_FAKE_HUE", "");
  ScopedEnv hue("AURORA_HUE_BRIDGE_ADDRESS", "");
  ScopedTempDir configRoot("discover-default");
  TestServer test(configRoot.path, 18233);

  CHECK(discoverAddress(test.client) == "127.0.0.1:18443");
}


TEST_CASE("discover treats a bare presence flag as no explicit address", "[PairingRoutes]")
{
  ScopedEnv dev("AURORA_DEV_FAKE_HUE", "1");
  ScopedEnv hue("AURORA_HUE_BRIDGE_ADDRESS", "10.1.2.3:18443");
  ScopedTempDir configRoot("discover-flag");
  TestServer test(configRoot.path, 18234);

  CHECK(discoverAddress(test.client) == "10.1.2.3:18443");
}


TEST_CASE("link-button without an address fails as missing_bridge_address, never a bridge call", "[PairingRoutes]")
{
  ScopedEnv dev("AURORA_DEV_FAKE_HUE", "1");
  ScopedEnv hue("AURORA_HUE_BRIDGE_ADDRESS", "");
  ScopedTempDir configRoot("link-button-no-address");
  TestServer test(configRoot.path, 18235);

  auto result = putJsonWithRetry(test.client, "/api/hue/link-button", Json::object());
  REQUIRE(result);
  CHECK(result->status == 400);
  Json body = Json::parse(result->body);
  CHECK(body.value("succeeded", true) == false);
  CHECK(body.value("error", "") == "missing_bridge_address");
}


TEST_CASE("link-button against a closed port reports unreachable", "[PairingRoutes]")
{
  ScopedEnv dev("AURORA_DEV_FAKE_HUE", "1");
  ScopedEnv hue("AURORA_HUE_BRIDGE_ADDRESS", "");
  ScopedTempDir configRoot("link-button-unreachable");
  TestServer test(configRoot.path, 18236);

  auto result = putJsonWithRetry(
    test.client, "/api/hue/link-button",
    {{"bridgeAddress", "127.0.0.1:1"}, {"pressed", true}});
  REQUIRE(result);
  Json body = Json::parse(result->body);
  CHECK(body.value("succeeded", true) == false);
  CHECK(body.value("error", "") == "unreachable");
}
