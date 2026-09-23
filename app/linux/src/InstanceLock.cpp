#include <Aurora/App/InstanceLock.hpp>

#include <arpa/inet.h>
#include <fcntl.h>
#include <netinet/in.h>
#include <sys/file.h>
#include <sys/select.h>
#include <sys/socket.h>
#include <unistd.h>

#include <fstream>
#include <string>

namespace Aurora::App
{
  namespace
  {
    constexpr int kLoopbackProbeTimeoutMs = 300;


    // Advisory only: a failed write must never fail the lock itself.
    void writeHolderPid(const std::filesystem::path& pidFile)
    {
      const std::string text = std::to_string(static_cast<unsigned long long>(::getpid()));
      int fd = ::open(pidFile.c_str(), O_WRONLY | O_CREAT | O_TRUNC, 0600);
      if(fd < 0){
        return;
      }
      const char* data = text.c_str();
      size_t left = text.size();
      while(left > 0){
        ssize_t written = ::write(fd, data, left);
        if(written <= 0){
          break;
        }
        data += written;
        left -= static_cast<size_t>(written);
      }
      ::close(fd);
    }
  }


  bool isLoopbackPortResponsive(unsigned port)
  {
    if(port == 0 || port > 65535){
      return false;
    }
    int fd = ::socket(AF_INET, SOCK_STREAM, 0);
    if(fd < 0){
      return false;
    }
    // Non-blocking so an unresponsive port can't stall the handoff.
    int flags = ::fcntl(fd, F_GETFL, 0);
    if(flags >= 0){
      ::fcntl(fd, F_SETFL, flags | O_NONBLOCK);
    }
    sockaddr_in address{};
    address.sin_family = AF_INET;
    address.sin_port = htons(static_cast<uint16_t>(port));
    address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    bool open = false;
    if(::connect(fd, reinterpret_cast<sockaddr*>(&address), sizeof(address)) == 0){
      open = true;
    }
    else if(errno == EINPROGRESS){
      fd_set writable;
      FD_ZERO(&writable);
      FD_SET(fd, &writable);
      timeval timeout{0, kLoopbackProbeTimeoutMs * 1000};
      if(::select(fd + 1, nullptr, &writable, nullptr, &timeout) > 0){
        int err = 0;
        socklen_t len = sizeof(err);
        open = (::getsockopt(fd, SOL_SOCKET, SO_ERROR, &err, &len) == 0 && err == 0);
      }
    }
    ::close(fd);
    return open;
  }


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
  m_pidFile = configRoot / "aurora.pid";
  // Only the holder may advertise: a losing instance must never overwrite
  // the real holder's pid.
  if(m_held){
    writeHolderPid(m_pidFile);
  }
}

std::uint64_t InstanceLock::holderPid() const
{
  // Plain read: flock gates flock(), never read(), so a second instance
  // can always see the holder's advertisement.
  std::ifstream file(m_pidFile);
  std::string text;
  if(!(file >> text)){
    return 0;
  }
  try{
    return static_cast<std::uint64_t>(std::stoull(text));
  }
  catch(const std::exception&){
    return 0;
  }
}


InstanceLock::~InstanceLock()
{
  if(m_fd >= 0){
    ::close(m_fd);
  }
}

} // namespace Aurora::App
