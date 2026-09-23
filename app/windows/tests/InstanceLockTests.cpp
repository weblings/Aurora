#include <catch2/catch_test_macros.hpp>

#include <filesystem>

#include <Aurora/App/InstanceLock.hpp>

using namespace Aurora::App;


namespace
{

std::filesystem::path freshDir(const char* tag)
{
  auto dir = std::filesystem::temp_directory_path() / ("aurora-instlock-" + std::string(tag));
  std::error_code ec;
  std::filesystem::remove_all(dir, ec);
  return dir;
}

} // namespace


TEST_CASE("second lock on the same config root is not held", "[instancelock]")
{
  auto dir = freshDir("same");
  InstanceLock first(dir);
  REQUIRE(first.held());
  InstanceLock second(dir);
  REQUIRE(!second.held());
}

TEST_CASE("different config roots lock independently", "[instancelock]")
{
  InstanceLock first(freshDir("a"));
  InstanceLock second(freshDir("b"));
  REQUIRE(first.held());
  REQUIRE(second.held());
}

TEST_CASE("a released lock can be reacquired", "[instancelock]")
{
  auto dir = freshDir("reacquire");
  {
    InstanceLock first(dir);
    REQUIRE(first.held());
  }
  InstanceLock second(dir);
  REQUIRE(second.held());
}
