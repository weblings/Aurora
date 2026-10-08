#include <catch2/catch_test_macros.hpp>

#include <cerrno>
#include <string>
#include <vector>

#include <Aurora/App/LocalNetworkProbe.hpp>

using namespace Aurora::App;
using namespace std::chrono_literals;

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
}

TEST_CASE("condition publisher sets on denial, clears on grant or unknown, and throttles", "[localnetwork]")
{
  LocalNetworkStatus next = LocalNetworkStatus::Denied;
  int checks = 0;
  std::vector<std::string> calls;
  LocalNetworkConditionPublisher publisher(
    [&]{ ++checks; return next; },
    [&](const std::string& source, const std::string&){ calls.push_back("set " + source); },
    [&](const std::string& source){ calls.push_back("clear " + source); },
    2s, 1);

  const auto t0 = LocalNetworkConditionPublisher::Clock::time_point{} + 100s;
  publisher.poll(t0);
  CHECK(calls == std::vector<std::string>{"set local_network"});

  // Within the interval: no re-check at all.
  next = LocalNetworkStatus::Granted;
  publisher.poll(t0 + 1s);
  CHECK(checks == 1);
  CHECK(calls.size() == 1);

  // After it: the grant clears, once.
  publisher.poll(t0 + 2s);
  publisher.poll(t0 + 4s);
  CHECK(calls == std::vector<std::string>{"set local_network", "clear local_network"});

  // Denied again re-sets; Unknown (no network) clears rather than claiming a denial.
  next = LocalNetworkStatus::Denied;
  publisher.poll(t0 + 6s);
  next = LocalNetworkStatus::Unknown;
  publisher.poll(t0 + 8s);
  CHECK(calls == std::vector<std::string>{"set local_network", "clear local_network", "set local_network", "clear local_network"});
}

TEST_CASE("condition publisher needs two denials in a row by default, and one grant resets the count", "[localnetwork]")
{
  LocalNetworkStatus next = LocalNetworkStatus::Denied;
  std::vector<std::string> calls;
  LocalNetworkConditionPublisher publisher(
    [&]{ return next; },
    [&](const std::string& s, const std::string&){ calls.push_back("set " + s); },
    [&](const std::string& s){ calls.push_back("clear " + s); });

  const auto t0 = LocalNetworkConditionPublisher::Clock::time_point{} + 100s;
  // First run: the prompt is up, one miss, then the user allows. No banner.
  publisher.poll(t0);
  CHECK(calls.empty());
  next = LocalNetworkStatus::Granted;
  publisher.poll(t0 + 2s);
  CHECK(calls.empty());

  // A miss, a grant, a miss: the grant restarted the count, still no banner.
  next = LocalNetworkStatus::Denied;
  publisher.poll(t0 + 4s);
  next = LocalNetworkStatus::Unknown;
  publisher.poll(t0 + 6s);
  next = LocalNetworkStatus::Denied;
  publisher.poll(t0 + 8s);
  CHECK(calls.empty());

  // Two in a row sets it; the next grant clears it at once.
  publisher.poll(t0 + 10s);
  CHECK(calls == std::vector<std::string>{"set local_network"});
  next = LocalNetworkStatus::Granted;
  publisher.poll(t0 + 12s);
  CHECK(calls == std::vector<std::string>{"set local_network", "clear local_network"});
}

TEST_CASE("condition publisher does nothing while access is fine", "[localnetwork]")
{
  std::vector<std::string> calls;
  LocalNetworkConditionPublisher publisher(
    []{ return LocalNetworkStatus::Granted; },
    [&](const std::string& s, const std::string&){ calls.push_back("set " + s); },
    [&](const std::string& s){ calls.push_back("clear " + s); });
  publisher.poll();
  CHECK(calls.empty());
}
