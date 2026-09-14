#pragma once
// Pipewire-based capture for Wayland sessions (via xdg-desktop-portal's
// ScreenCast interface) and Gamescope (direct node, no portal involved).
// Ported from huenicorn's Huenicorn::Grabber::PipewireGrabber (GPL-3.0).

#include <Aurora/Input/IVideoInput.hpp>

#include <mutex>
#include <optional>
#include <thread>

#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wpedantic"
#pragma GCC diagnostic ignored "-Wmissing-field-initializers"
#include <pipewire/pipewire.h>
#include <spa/param/video/format-utils.h>
#pragma GCC diagnostic pop

#include <Aurora/Input/Linux/IRestoreTokenStore.hpp>
#include <Aurora/Input/Linux/XdgDesktopPortal.hpp>

namespace Aurora::Input::Linux
{
  class PipewireGrabber : public IVideoInput
  {
  private:
    struct SafeDoubleBuffer
    {
      std::array<Contracts::ImageData, 2> frame;
      std::mutex mutex;
    };


    struct PipewireData
    {
      spa_hook coreListener;
      pw_main_loop* loop{nullptr};
      pw_context* context{nullptr};
      pw_stream* stream{nullptr};
      spa_video_info format;
      SafeDoubleBuffer frameDoubleBuffer;
      std::promise<bool> screenDataReadyPromise;
      bool promiseSetAlready{false};

      // Gamescope direct-capture support: gamescope exposes its composited
      // output as a plain (non-portal-gated) Pipewire node named "gamescope".
      // xdg-desktop-portal's ScreenCast implementation isn't wired up inside
      // a gamescope session, which is why the portal path black-screens there.
      bool useGamescope{false};
      bool discoveryMode{false};
      int discoverySyncSeq{0};
      uint32_t gamescopeNodeId{0};
    };


  public:
    // useGamescope: capture gamescope's own Pipewire node directly instead
    // of negotiating via xdg-desktop-portal. restoreTokenStore isn't owned.
    explicit PipewireGrabber(
      bool useGamescope = false,
      IRestoreTokenStore* restoreTokenStore = nullptr
    );

    ~PipewireGrabber() override;

    const std::string& name() const override;
    Resolution displayResolution() const override;
    RefreshRate displayRefreshRate() const override;
    void grabFrameSubsample(Contracts::ImageData& imageData) override;

  private:
    static void _onCoreInfoCallback(
      void* userData,
      const pw_core_info* info
    );

    static void _onCoreDoneCallback(
      void* userData,
      uint32_t id,
      int seq
    );

    static void _onCoreErrorCallback(
      void* userData,
      uint32_t id,
      int seq,
      int res,
      const char* message
    );

    static void _onStreamProcess(
      void* userdata
    );

    static void _onStreamParamChanged(
      void* userdata,
      uint32_t id,
      const spa_pod* param
    );

    // Registry listener used to find gamescope's "gamescope" Pipewire node.
    static void _onRegistryGlobal(
      void* userdata,
      uint32_t id,
      uint32_t permissions,
      const char* type,
      uint32_t version,
      const spa_dict* props
    );

    static void _initCapture(
      XdgDesktopPortal::Capture* capture
    );

    static void _pipewireThread(
      XdgDesktopPortal::Capture* capture,
      PipewireData* pw
    );

    void _teardownPipewire();
    void _stop();

    // Attributes
    NullRestoreTokenStore m_nullRestoreTokenStore;
    std::optional<std::thread> m_xdgThread;
    std::optional<std::thread> m_pipewireThread;
    XdgDesktopPortal::Capture m_capture;
    PipewireData m_pwData;
  };
}
