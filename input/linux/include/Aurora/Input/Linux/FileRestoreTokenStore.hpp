#pragma once

#include <filesystem>
#include <mutex>
#include <optional>
#include <string>

#include <Aurora/Input/Linux/IRestoreTokenStore.hpp>

// File-backed IRestoreTokenStore for the shipped app: persists the
// xdg-desktop-portal ScreenCast restore_token under the config root so
// second and later captures (same run and after a restart) can replay it
// on SelectSources and skip the monitor picker. XdgDesktopPortal already
// requests persist_mode=2 and updates the store on every Start; without
// this class PipewireGrabber falls back to NullRestoreTokenStore and every
// capture re-asks (Aurora-w6no).
namespace Aurora::Input::Linux
{
  class FileRestoreTokenStore : public IRestoreTokenStore
  {
  public:
    explicit FileRestoreTokenStore(std::filesystem::path configRoot);

    std::optional<std::string> restoreToken() const override;
    void setRestoreToken(const std::string& token) override;

    const std::filesystem::path& path() const { return m_path; }

  private:
    std::optional<std::string> _loadLocked() const;

    std::filesystem::path m_path;
    mutable std::mutex m_mutex;
    mutable bool m_loaded{false};
    mutable std::optional<std::string> m_cached;
  };
}
