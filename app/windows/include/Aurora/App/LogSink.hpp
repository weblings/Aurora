#pragma once

#include <cstddef>
#include <filesystem>
#include <fstream>
#include <ostream>
#include <string>
#include <string_view>
#include <vector>

namespace Aurora::App
{
// 7l1.1: dual sink for every Windows-app status line. The console gets the
// raw line (OSC-8 hyperlinks intact); the file gets stripOsc8(line).
// Everything is buffered from construction so early lines survive until
// setFile() picks the log path (config root, else %TEMP% fallback -- the
// path choice stays in main()). File writes flush every line: a redirected
// bare-\n cout once looked exactly like an early crash because of
// block-buffering (see docs/lessons/windows-env.md).
class LogSink
{
public:
  void setConsole(std::ostream* console);
  bool setFile(const std::filesystem::path& path);
  void write(std::string_view line);
  void flush();

  [[nodiscard]] std::size_t buffered() const;
  [[nodiscard]] bool hasFile() const;
  [[nodiscard]] std::filesystem::path filePath() const;

  static std::string stripOsc8(std::string_view line);
  static std::string runningLine(bool consoleAttached);
  // Attach policy for 7l1.2: true only with --console on the command line
  // or a truthy AURORA_CONSOLE (1/true/yes/on). Anything else means
  // "attach iff a parent console exists, else headless" -- decided by
  // trying AttachConsole, not by this function.
  static bool wantsConsole(int argc, char** argv);

private:
  std::ostream* m_console = nullptr;
  std::ofstream m_file;
  std::filesystem::path m_path;
  std::vector<std::string> m_buffer;
};
}
