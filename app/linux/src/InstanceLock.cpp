#include <Aurora/App/InstanceLock.hpp>

#include <fcntl.h>
#include <sys/file.h>
#include <unistd.h>

namespace Aurora::App
{

InstanceLock::InstanceLock(const std::filesystem::path& configRoot)
{
  // The dir may not exist on first launch (ConfigStore only creates it on
  // save). Only a failed flock() means held-by-other; any earlier failure
  // throws like the rest of startup rather than masquerading as a holder.
  std::error_code ec;
  std::filesystem::create_directories(configRoot, ec);
  if(ec){
    throw std::filesystem::filesystem_error("Cannot create config root for instance lock", configRoot, ec);
  }
  m_fd = ::open((configRoot / "aurora.lock").c_str(), O_CREAT | O_RDWR, 0600);
  if(m_fd < 0){
    throw std::runtime_error("Cannot open instance lock file");
  }
  m_held = (::flock(m_fd, LOCK_EX | LOCK_NB) == 0);
}

InstanceLock::~InstanceLock()
{
  if(m_fd >= 0){
    ::close(m_fd);
  }
}

} // namespace Aurora::App
