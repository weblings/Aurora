#include <Aurora/App/LogSink.hpp>

namespace Aurora::App
{
namespace
{
// Terminator length at the front of s: 2 for ST (ESC \), 1 for BEL, 0 when
// s starts with neither. Only the length matters; params/URIs are skipped,
// never interpreted.
std::size_t terminatorLength(std::string_view s)
{
  if(s.size() >= 2 && s[0] == '\x1b' && s[1] == '\\'){
    return 2;
  }
  if(!s.empty() && s[0] == '\a'){
    return 1;
  }
  return 0;
}
}

void LogSink::setConsole(std::ostream* console)
{
  m_console = console;
}

bool LogSink::setFile(const std::filesystem::path& path)
{
  m_file.open(path, std::ios::app);
  if(!m_file.is_open()){
    return false;
  }
  for(const auto& line : m_buffer){
    m_file << stripOsc8(line) << '\n';
  }
  m_buffer.clear();
  flush();
  return true;
}

void LogSink::write(std::string_view line)
{
  m_buffer.emplace_back(line);
  if(m_console){
    *m_console << line << '\n';
  }
  if(m_file.is_open()){
    m_file << stripOsc8(line) << '\n';
  }
  flush();
}

void LogSink::flush()
{
  if(m_console){
    m_console->flush();
  }
  if(m_file.is_open()){
    m_file.flush();
  }
}

std::size_t LogSink::buffered() const
{
  return m_buffer.size();
}

bool LogSink::hasFile() const
{
  return m_file.is_open();
}

std::string LogSink::stripOsc8(std::string_view line)
{
  static constexpr std::string_view kOpen = "\x1b]8;;";
  std::string out;
  out.reserve(line.size());
  std::string_view rest = line;
  for(;;){
    const std::size_t open = rest.find(kOpen);
    if(open == std::string_view::npos){
      out.append(rest);
      return out;
    }
    out.append(rest.substr(0, open));
    rest.remove_prefix(open + kOpen.size());
    // Params/URI run to the first terminator; without one the opener is
    // literal text, not a hyperlink.
    std::size_t term = std::string_view::npos;
    std::size_t termLen = 0;
    for(std::size_t i = 0; i < rest.size(); ++i){
      if(rest[i] == '\a'){
        term = i;
        termLen = 1;
        break;
      }
      if(rest[i] == '\x1b' && i + 1 < rest.size() && rest[i + 1] == '\\'){
        term = i;
        termLen = 2;
        break;
      }
    }
    if(term == std::string_view::npos){
      out.append(kOpen);
      out.append(rest);
      return out;
    }
    rest.remove_prefix(term + termLen);
    // Visible text runs to the closing opener (empty URI); with no closer
    // the rest of the line is the text.
    const std::size_t close = rest.find(kOpen);
    if(close == std::string_view::npos){
      out.append(rest);
      return out;
    }
    out.append(rest.substr(0, close));
    rest.remove_prefix(close + kOpen.size());
    if(terminatorLength(rest) == 0){
      // Closer without a terminator: keep everything from the opener on.
      out.append(kOpen);
      out.append(rest);
      return out;
    }
    rest.remove_prefix(terminatorLength(rest));
  }
}

std::string LogSink::runningLine(bool consoleAttached)
{
  if(consoleAttached){
    return "Aurora running. Ctrl+C to stop.";
  }
  return "Aurora running. Tray Stop or /api/stop to stop.";
}
}
