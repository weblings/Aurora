#include <filesystem>

#include <catch2/catch_test_macros.hpp>

#include <Aurora/App/WebRoot.hpp>

using namespace Aurora::App;


namespace
{
  struct ScopedTempDir
  {
    std::filesystem::path path;

    explicit ScopedTempDir(const std::string& name):
    path(std::filesystem::temp_directory_path() / ("aurora-webroot-tests-" + name))
    {
      std::filesystem::remove_all(path);
      std::filesystem::create_directories(path);
    }

    ~ScopedTempDir()
    {
      std::filesystem::remove_all(path);
    }
  };
}


TEST_CASE("resolveWebRoot prefers the env override dir when it exists", "[WebRoot]")
{
  ScopedTempDir envDir("env");
  ScopedTempDir bakedDir("baked");

  auto result = resolveWebRoot(envDir.path.string().c_str(), bakedDir.path.string());
  REQUIRE(result.has_value());
  CHECK(*result == envDir.path);
}


TEST_CASE("resolveWebRoot falls back to the baked source dir", "[WebRoot]")
{
  ScopedTempDir bakedDir("baked");

  SECTION("no env override")
  {
    auto result = resolveWebRoot(nullptr, bakedDir.path.string());
    REQUIRE(result.has_value());
    CHECK(*result == bakedDir.path);
  }

  SECTION("env override points nowhere")
  {
    auto result = resolveWebRoot("/definitely/not/a/real/dir", bakedDir.path.string());
    REQUIRE(result.has_value());
    CHECK(*result == bakedDir.path);
  }
}


TEST_CASE("resolveWebRoot yields embedded (nullopt) when no directory exists", "[WebRoot]")
{
  auto result = resolveWebRoot(nullptr, "/definitely/not/a/real/dir");
  CHECK(!result.has_value());
}
