#include <catch2/catch_test_macros.hpp>

#include <filesystem>
#include <fstream>
#include <sstream>
#include <string>

#include <Aurora/App/LogSink.hpp>

using namespace Aurora::App;

namespace
{
std::filesystem::path freshTempFile(const std::string& name)
{
  auto dir = std::filesystem::temp_directory_path() / "aurora-logsink-tests";
  std::filesystem::create_directories(dir);
  auto file = dir / name;
  std::error_code ec;
  std::filesystem::remove(file, ec);
  return file;
}

std::string readFile(const std::filesystem::path& path)
{
  std::ifstream in(path);
  std::ostringstream out;
  out << in.rdbuf();
  return out.str();
}
}

TEST_CASE("stripOsc8 collapses a hyperlink to its visible text", "[logsink]")
{
  const std::string url = "http://127.0.0.1:8080/";
  const std::string line = "WebUI: \x1b]8;;" + url + "\x1b\\" + url + "\x1b]8;;\x1b\\";
  CHECK(LogSink::stripOsc8(line) == "WebUI: " + url);
}

TEST_CASE("stripOsc8 leaves plain lines alone", "[logsink]")
{
  CHECK(LogSink::stripOsc8("Aurora running. Ctrl+C to stop.") == "Aurora running. Ctrl+C to stop.");
  CHECK(LogSink::stripOsc8("") == "");
}

TEST_CASE("stripOsc8 handles several links and a dangling opener", "[logsink]")
{
  CHECK(LogSink::stripOsc8("a \x1b]8;;u1\x1b\\t1\x1b]8;;\x1b\\ b \x1b]8;;u2\x1b\\t2\x1b]8;;\x1b\\") == "a t1 b t2");
  const std::string dangling = "prefix \x1b]8;;no-terminator-here";
  CHECK(LogSink::stripOsc8(dangling) == dangling);
}

TEST_CASE("buffer replays in order when the file arrives", "[logsink]")
{
  LogSink sink;
  sink.write("first");
  sink.write("second");
  CHECK(sink.buffered() == 2);
  CHECK(!sink.hasFile());

  const auto file = freshTempFile("replay.log");
  REQUIRE(sink.setFile(file));
  CHECK(sink.hasFile());
  CHECK(sink.buffered() == 0);
  CHECK(readFile(file) == "first\nsecond\n");
}

TEST_CASE("setFile failure keeps the buffer", "[logsink]")
{
  LogSink sink;
  sink.write("held");
  const auto missing = std::filesystem::temp_directory_path() / "aurora-no-such-dir" / "x.log";
  CHECK(!sink.setFile(missing));
  CHECK(!sink.hasFile());
  CHECK(sink.buffered() == 1);
}

TEST_CASE("write tees raw to console and stripped to file", "[logsink]")
{
  LogSink sink;
  std::ostringstream console;
  sink.setConsole(&console);
  const auto file = freshTempFile("tee.log");
  REQUIRE(sink.setFile(file));

  const std::string url = "http://127.0.0.1:8080/";
  const std::string line = "WebUI: \x1b]8;;" + url + "\x1b\\" + url + "\x1b]8;;\x1b\\";
  sink.write(line);
  CHECK(console.str() == line + "\n");
  CHECK(readFile(file) == "WebUI: " + url + "\n");
}

TEST_CASE("runningLine follows the attach mode", "[logsink]")
{
  CHECK(LogSink::runningLine(true) == "Aurora running. Ctrl+C to stop.");
  CHECK(LogSink::runningLine(false) == "Aurora running. Tray Stop or /api/stop to stop.");
}
