#pragma once

#include <cstdint>
#include <filesystem>

// Single-instance enforcement, scoped to one config root (Aurora-52o):
// at most one running process holds the lock per configRoot. Kernel-
// managed (LockFileEx on configRoot/aurora.lock), so a crash releases
// it -- locks never go stale. Non-copyable; destruction releases. A
// second instance detects !held() and hands the UI to the running one
// instead of starting headless.
//
// Best-effort holder identity for the handoff message: the holder writes
// its pid to configRoot/aurora.pid (advisory only -- mutual exclusion
// stays with LockFileEx, untouched). A second instance reads it to name
// the holder and to probe whether its HTTP port answers, distinguishing
// a healthy handoff from a holder wedged before its bind (Aurora-kwn).
namespace Aurora::App
{

// True when something answers a TCP connect on loopback:port within a
// short bound. A refused connect (nothing bound -- the wedged-holder
// shape) answers immediately; the timeout only caps stranger states.
bool isLoopbackPortResponsive(unsigned port);


class InstanceLock
{
public:
  explicit InstanceLock(const std::filesystem::path& configRoot);
  ~InstanceLock();

  InstanceLock(const InstanceLock&) = delete;
  InstanceLock& operator=(const InstanceLock&) = delete;

  bool held() const { return m_held; }

  // The advisory pid from aurora.pid, or 0 when unreadable/absent --
  // "unknown holder", never an error.
  std::uint64_t holderPid() const;

private:
  void* m_handle{nullptr};
  bool m_held{false};
  std::filesystem::path m_pidFile;
};

} // namespace Aurora::App
