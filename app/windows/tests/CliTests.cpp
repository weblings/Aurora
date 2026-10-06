#include <catch2/catch_test_macros.hpp>

#include <optional>
#include <sstream>
#include <string>
#include <vector>

#include <Aurora/App/Cli.hpp>


namespace
{

  // argv builder owning its own storage (string data, not literals, so the
  // parser can never depend on pointer identity).
  struct Argv
  {
    std::vector<std::string> storage;
    std::vector<char*> ptrs;

    Argv(std::initializer_list<const char*> args)
    {
      for(const char* arg : args){
        storage.emplace_back(arg);
      }
      for(std::string& entry : storage){
        ptrs.push_back(entry.data());
      }
    }

    int argc() const
    {
      return static_cast<int>(ptrs.size());
    }

    char** argv()
    {
      return ptrs.data();
    }
  };

  std::optional<int> runCli(
    Argv& args,
    std::string& out,
    std::string& err,
    bool withConsoleFlag = false)
  {
    std::ostringstream outStream;
    std::ostringstream errStream;
    std::optional<int> code = Aurora::App::handleEarlyCli(
      args.argc(), args.argv(), "9.9.9-test", withConsoleFlag, outStream, errStream);
    out = outStream.str();
    err = errStream.str();
    return code;
  }

} // namespace


TEST_CASE("cli boots normally without flags", "[cli]")
{
  Argv args = {"Aurora"};
  std::string out;
  std::string err;
  CHECK(!runCli(args, out, err).has_value());
  CHECK(out.empty());
  CHECK(err.empty());
}


TEST_CASE("cli accepts the real flags and boots", "[cli]")
{
  Argv args = {"Aurora", "--fresh", "--fake-hue"};
  std::string out;
  std::string err;
  CHECK(!runCli(args, out, err).has_value());
  CHECK(out.empty());
  CHECK(err.empty());
}


TEST_CASE("cli --help prints usage and exits 0", "[cli]")
{
  Argv args = {"Aurora", "--help"};
  std::string out;
  std::string err;
  auto code = runCli(args, out, err);
  REQUIRE(code.has_value());
  CHECK(*code == 0);
  CHECK(out.find("Usage:") != std::string::npos);
  CHECK(out.find("--fake-hue") != std::string::npos);
  CHECK(out.find("--fresh") != std::string::npos);
  CHECK(err.empty());
}


TEST_CASE("cli --help wins over unknown flags", "[cli]")
{
  Argv args = {"Aurora", "--bogus", "--help"};
  std::string out;
  std::string err;
  auto code = runCli(args, out, err);
  REQUIRE(code.has_value());
  CHECK(*code == 0);
  CHECK(out.find("Usage:") != std::string::npos);
}


TEST_CASE("cli --version prints the version and exits 0", "[cli]")
{
  Argv args = {"Aurora", "--version"};
  std::string out;
  std::string err;
  auto code = runCli(args, out, err);
  REQUIRE(code.has_value());
  CHECK(*code == 0);
  CHECK(out.find("9.9.9-test") != std::string::npos);
  CHECK(err.empty());
}


TEST_CASE("cli rejects unknown flags without booting", "[cli]")
{
  Argv args = {"Aurora", "--bogus"};
  std::string out;
  std::string err;
  auto code = runCli(args, out, err);
  REQUIRE(code.has_value());
  CHECK(*code != 0);
  CHECK(out.empty());
  CHECK(err.find("Unknown argument") != std::string::npos);
  CHECK(err.find("Usage:") != std::string::npos);
}


TEST_CASE("cli rejects bare positional arguments", "[cli]")
{
  Argv args = {"Aurora", "capture"};
  std::string out;
  std::string err;
  auto code = runCli(args, out, err);
  REQUIRE(code.has_value());
  CHECK(*code != 0);
}


TEST_CASE("cli never matches the program name itself", "[cli]")
{
  // argv[0] excluded: a binary literally named --help must not self-trigger.
  Argv args = {"--help"};
  std::string out;
  std::string err;
  CHECK(!runCli(args, out, err).has_value());
}


TEST_CASE("cli --console is windows-only", "[cli]")
{
  Argv args = {"Aurora", "--console"};
  std::string out;
  std::string err;
  CHECK(!runCli(args, out, err, /*withConsoleFlag=*/true).has_value());
  CHECK(runCli(args, out, err, /*withConsoleFlag=*/false).has_value());
}


TEST_CASE("cli --help lists --console on windows", "[cli]")
{
  Argv args = {"Aurora", "--help"};
  std::string out;
  std::string err;
  auto code = runCli(args, out, err, /*withConsoleFlag=*/true);
  REQUIRE(code.has_value());
  CHECK(*code == 0);
  CHECK(out.find("--console") != std::string::npos);
}
