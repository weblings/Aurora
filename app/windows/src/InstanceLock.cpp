#include <Aurora/App/InstanceLock.hpp>

#include <stdexcept>

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <winsock2.h>
#include <ws2tcpip.h>

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
      HANDLE handle = ::CreateFileW(pidFile.c_str(),
        GENERIC_WRITE, 0, nullptr,
        CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
      if(handle == INVALID_HANDLE_VALUE){
        return;
      }
      const std::string text = std::to_string(static_cast<unsigned long long>(::GetCurrentProcessId()));
      DWORD written = 0;
      ::WriteFile(handle, text.c_str(), static_cast<DWORD>(text.size()), &written, nullptr);
      ::CloseHandle(handle);
    }
  }


  bool isLoopbackPortResponsive(unsigned port)
  {
    if(port == 0 || port > 65535){
      return false;
    }
    // Balanced locally: safe whether or not anything else in the process
    // has initialized Winsock (the calls are ref-counted).
    WSADATA winsockData{};
    if(::WSAStartup(MAKEWORD(2, 2), &winsockData) != 0){
      return false;
    }
    bool open = false;
    SOCKET socket = ::socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if(socket != INVALID_SOCKET){
      // Non-blocking so an unresponsive port can't stall the handoff.
      u_long nonblocking = 1;
      ::ioctlsocket(socket, FIONBIO, &nonblocking);
      sockaddr_in address{};
      address.sin_family = AF_INET;
      address.sin_port = htons(static_cast<uint16_t>(port));
      address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
      if(::connect(socket, reinterpret_cast<sockaddr*>(&address), sizeof(address)) == 0){
        open = true;
      }
      else if(::WSAGetLastError() == WSAEWOULDBLOCK){
        fd_set writable;
        FD_ZERO(&writable);
        FD_SET(socket, &writable);
        timeval timeout{0, kLoopbackProbeTimeoutMs * 1000};
        if(::select(0, nullptr, &writable, nullptr, &timeout) > 0){
          int err = 0;
          int len = sizeof(err);
          open = (::getsockopt(socket, SOL_SOCKET, SO_ERROR, reinterpret_cast<char*>(&err), &len) == 0 && err == 0);
        }
      }
      ::closesocket(socket);
    }
    ::WSACleanup();
    return open;
  }


InstanceLock::InstanceLock(const std::filesystem::path& configRoot)
{
  // See the Linux twin for the contract: only a failed *lock* means
  // held-by-other; anything earlier throws like the rest of startup.
  std::error_code ec;
  std::filesystem::create_directories(configRoot, ec);
  if(ec){
    throw std::filesystem::filesystem_error("Cannot create config root for instance lock", configRoot, ec);
  }
  HANDLE handle = ::CreateFileW((configRoot / L"aurora.lock").c_str(),
    GENERIC_READ | GENERIC_WRITE,
    FILE_SHARE_READ | FILE_SHARE_WRITE, nullptr,
    OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
  if(handle == INVALID_HANDLE_VALUE){
    throw std::runtime_error("Cannot open instance lock file");
  }
  m_handle = handle;
  OVERLAPPED overlapped{};
  m_held = ::LockFileEx(handle, LOCKFILE_EXCLUSIVE_LOCK | LOCKFILE_FAIL_IMMEDIATELY,
    0, MAXDWORD, MAXDWORD, &overlapped) != FALSE;
  m_pidFile = configRoot / L"aurora.pid";
  // Only the holder may advertise: a losing instance must never overwrite
  // the real holder's pid. A separate file because the locked byte range
  // of aurora.lock itself is unreadable to anyone else.
  if(m_held){
    writeHolderPid(m_pidFile);
  }
}

std::uint64_t InstanceLock::holderPid() const
{
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
  if(m_handle){
    ::CloseHandle(static_cast<HANDLE>(m_handle));
  }
}

} // namespace Aurora::App
