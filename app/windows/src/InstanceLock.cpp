#include <Aurora/App/InstanceLock.hpp>

#include <stdexcept>

#define WIN32_LEAN_AND_MEAN
#include <windows.h>

namespace Aurora::App
{

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
}

InstanceLock::~InstanceLock()
{
  if(m_handle){
    ::CloseHandle(static_cast<HANDLE>(m_handle));
  }
}

} // namespace Aurora::App
