#include <fstream>

#include <catch2/catch_test_macros.hpp>

#include <Aurora/Output/Hue/CredentialsStore.hpp>

using namespace Aurora::Output::Hue;


namespace
{
  // Self-cleaning temp directory, same pattern as core/tests/RuntimeTests.cpp's.
  struct ScopedTempDir
  {
    std::filesystem::path path;

    explicit ScopedTempDir(const std::string& name):
    path(std::filesystem::temp_directory_path() / ("aurora-hue-credentials-tests-" + name))
    {
      std::filesystem::remove_all(path);
    }

    ~ScopedTempDir()
    {
      std::filesystem::remove_all(path);
    }
  };
}


TEST_CASE("HueConnection::isConfigured requires bridgeAddress, username, and clientkey", "[CredentialsStore]")
{
  HueConnection connection;
  CHECK_FALSE(connection.isConfigured());

  connection.bridgeAddress = "192.168.1.42";
  CHECK_FALSE(connection.isConfigured());

  connection.username = "user";
  CHECK_FALSE(connection.isConfigured());

  connection.clientkey = "key";
  CHECK(connection.isConfigured());

  // entertainmentConfigurationId is optional -- doesn't gate isConfigured().
  connection.entertainmentConfigurationId = "";
  CHECK(connection.isConfigured());
}


TEST_CASE("CredentialsStore defaults to an unconfigured connection when no file exists", "[CredentialsStore]")
{
  ScopedTempDir dir("missing");
  CredentialsStore store(dir.path);

  HueConnection loaded = store.load();
  CHECK_FALSE(loaded.isConfigured());
  CHECK(loaded.bridgeAddress.empty());
}


TEST_CASE("CredentialsStore round-trips through a real file", "[CredentialsStore]")
{
  ScopedTempDir dir("roundtrip");
  CredentialsStore store(dir.path);

  HueConnection connection;
  connection.bridgeAddress = "192.168.1.42";
  connection.username = "someuser";
  connection.clientkey = "abcdef0123456789";
  connection.entertainmentConfigurationId = "ent-config-1";
  store.save(connection);

  HueConnection loaded = store.load();
  CHECK(loaded.isConfigured());
  CHECK(loaded.bridgeAddress == "192.168.1.42");
  CHECK(loaded.username == "someuser");
  CHECK(loaded.clientkey == "abcdef0123456789");
  CHECK(loaded.entertainmentConfigurationId == "ent-config-1");
}


TEST_CASE("CredentialsStore ignores a corrupt file rather than throwing", "[CredentialsStore]")
{
  ScopedTempDir dir("corrupt");
  std::filesystem::create_directories(dir.path);

  std::ofstream(dir.path / "hue-credentials.json") << "not valid json{{{";

  CredentialsStore store(dir.path);
  HueConnection loaded = store.load();
  CHECK_FALSE(loaded.isConfigured());
}
