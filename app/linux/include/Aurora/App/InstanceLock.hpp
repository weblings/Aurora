#pragma once

#include <filesystem>

// Single-instance enforcement, scoped to one config root (Aurora-52o):
// at most one running process holds the lock per configRoot. Kernel-
// managed (flock on configRoot/aurora.lock), so a crash releases it --
// locks never go stale. Non-copyable; destruction releases. A second
// instance detects !held() and hands the UI to the running one instead
// of starting headless.
namespace Aurora::App
{

class InstanceLock
{
public:
  explicit InstanceLock(const std::filesystem::path& configRoot);
  ~InstanceLock();

  InstanceLock(const InstanceLock&) = delete;
  InstanceLock& operator=(const InstanceLock&) = delete;

  bool held() const { return m_held; }

private:
  int m_fd{-1};
  bool m_held{false};
};

} // namespace Aurora::App
