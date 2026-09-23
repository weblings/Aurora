#include <catch2/catch_test_macros.hpp>

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <winsock2.h>

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

TEST_CASE("the holder advertises its pid for a second instance to read", "[instancelock]")
{
  auto dir = freshDir("holderpid");
  InstanceLock first(dir);
  REQUIRE(first.held());
  const auto ownPid = static_cast<std::uint64_t>(::GetCurrentProcessId());
  CHECK(first.holderPid() == ownPid);
  InstanceLock second(dir);
  REQUIRE(!second.held());
  CHECK(second.holderPid() == ownPid);
}


TEST_CASE("a losing instance never overwrites the holder pid", "[instancelock]")
{
  auto dir = freshDir("nooverwrite");
  InstanceLock first(dir);
  REQUIRE(first.held());
  const auto holder = first.holderPid();
  REQUIRE(holder != 0);
  InstanceLock second(dir);
  REQUIRE(!second.held());
  CHECK(second.holderPid() == holder);
}


TEST_CASE("a closed loopback port reads as unresponsive", "[instancelock]")
{
  WSADATA winsockData{};
  REQUIRE(::WSAStartup(MAKEWORD(2, 2), &winsockData) == 0);
  // Bind-then-close: the kernel reclaims the port, so the probe must see
  // a refused connect -- the Aurora-kwn shape (lock held, never bound).
  SOCKET listener = ::socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
  REQUIRE(listener != INVALID_SOCKET);
  sockaddr_in address{};
  address.sin_family = AF_INET;
  address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  address.sin_port = 0;
  REQUIRE(::bind(listener, reinterpret_cast<sockaddr*>(&address), sizeof(address)) == 0);
  int len = sizeof(address);
  REQUIRE(::getsockname(listener, reinterpret_cast<sockaddr*>(&address), &len) == 0);
  const unsigned port = ntohs(address.sin_port);
  ::closesocket(listener);
  CHECK_FALSE(isLoopbackPortResponsive(port));
  ::WSACleanup();
}


TEST_CASE("a bound loopback port reads as responsive", "[instancelock]")
{
  WSADATA winsockData{};
  REQUIRE(::WSAStartup(MAKEWORD(2, 2), &winsockData) == 0);
  // Per the verifier lesson: a probe test that only checks the negative
  // cannot catch a probe stuck always-false, so pin the positive too.
  SOCKET listener = ::socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
  REQUIRE(listener != INVALID_SOCKET);
  sockaddr_in address{};
  address.sin_family = AF_INET;
  address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  address.sin_port = 0;
  REQUIRE(::bind(listener, reinterpret_cast<sockaddr*>(&address), sizeof(address)) == 0);
  REQUIRE(::listen(listener, 1) == 0);
  int len = sizeof(address);
  REQUIRE(::getsockname(listener, reinterpret_cast<sockaddr*>(&address), &len) == 0);
  CHECK(isLoopbackPortResponsive(ntohs(address.sin_port)));
  ::closesocket(listener);
  ::WSACleanup();
}
