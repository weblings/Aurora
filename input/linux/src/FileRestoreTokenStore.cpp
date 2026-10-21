#include <Aurora/Input/Linux/FileRestoreTokenStore.hpp>

#include <cerrno>
#include <cstdio>
#include <fcntl.h>
#include <unistd.h>

#include <fstream>
#include <sstream>

namespace Aurora::Input::Linux
{
  namespace
  {
    // Trims ASCII whitespace (token files end with a newline; a hand-edited
    // file may carry more). An all-whitespace file reads as no token.
    std::string trim(const std::string& raw)
    {
      const char* whitespace = " \t\r\n\f\v";
      const auto first = raw.find_first_not_of(whitespace);
      if(first == std::string::npos){
        return {};
      }
      const auto last = raw.find_last_not_of(whitespace);
      return raw.substr(first, last - first + 1);
    }
  }


  FileRestoreTokenStore::FileRestoreTokenStore(std::filesystem::path configRoot):
  m_path(std::move(configRoot) / "portal-restore-token")
  {}


  std::optional<std::string> FileRestoreTokenStore::restoreToken() const
  {
    std::lock_guard<std::mutex> lock(m_mutex);
    if(!m_loaded){
      m_cached = _loadLocked();
      m_loaded = true;
    }
    return m_cached;
  }


  void FileRestoreTokenStore::setRestoreToken(const std::string& token)
  {
    const std::string cleaned = trim(token);
    std::lock_guard<std::mutex> lock(m_mutex);
    if(!m_loaded){
      m_cached = _loadLocked();
      m_loaded = true;
    }
    if(m_cached.has_value() && m_cached == cleaned){
      return;
    }
    // An empty token clears the store rather than persisting an empty file.
    if(cleaned.empty()){
      std::error_code ec;
      std::filesystem::remove(m_path, ec);
      m_cached.reset();
      return;
    }

    std::error_code ec;
    std::filesystem::create_directories(m_path.parent_path(), ec);

    // O_CREAT mode is masked by the umask, so chmod after writing: the
    // token replays a standing portal grant and must stay user-only.
    const int fd = ::open(m_path.c_str(), O_WRONLY | O_CREAT | O_TRUNC | O_CLOEXEC, 0600);
    if(fd == -1){
      return;
    }
    const std::string contents = cleaned + "\n";
    const char* data = contents.data();
    size_t remaining = contents.size();
    while(remaining > 0){
      const ssize_t written = ::write(fd, data, remaining);
      if(written < 0 && errno == EINTR){
        continue;
      }
      if(written <= 0){
        break;
      }
      data += written;
      remaining -= static_cast<size_t>(written);
    }
    ::close(fd);
    std::filesystem::permissions(
      m_path,
      std::filesystem::perms::owner_read | std::filesystem::perms::owner_write,
      std::filesystem::perm_options::replace,
      ec
    );
    if(remaining == 0){
      m_cached = cleaned;
    }
  }


  std::optional<std::string> FileRestoreTokenStore::_loadLocked() const
  {
    if(!std::filesystem::exists(m_path)){
      return std::nullopt;
    }
    std::ifstream file(m_path, std::ios::binary);
    if(!file){
      return std::nullopt;
    }
    std::ostringstream raw;
    raw << file.rdbuf();
    const std::string cleaned = trim(raw.str());
    if(cleaned.empty()){
      return std::nullopt;
    }
    return cleaned;
  }
}
