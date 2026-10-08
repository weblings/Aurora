#include <catch2/catch_test_macros.hpp>

#include <cerrno>
#include <string>

#include <Aurora/App/LocalNetworkProbe.hpp>

using namespace Aurora::App;

TEST_CASE("a successful send means Granted", "[localnetwork]")
{
  CHECK(statusFromSend(0, 0) == LocalNetworkStatus::Granted);
  CHECK(statusFromSend(1, 0) == LocalNetworkStatus::Granted);
}

TEST_CASE("EHOSTUNREACH means Denied", "[localnetwork]")
{
  CHECK(statusFromSend(-1, EHOSTUNREACH) == LocalNetworkStatus::Denied);
}

TEST_CASE("other send failures are Unknown, not Denied", "[localnetwork]")
{
  CHECK(statusFromSend(-1, ENETUNREACH) == LocalNetworkStatus::Unknown);
  CHECK(statusFromSend(-1, EPERM) == LocalNetworkStatus::Unknown);
  CHECK(std::string(toString(LocalNetworkStatus::Unknown)) == "unknown");
}
