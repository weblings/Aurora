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
#include <spa/param/buffers.h>
#include <spa/param/video/format-utils.h>
#pragma GCC diagnostic pop

#include <Aurora/Input/Linux/IRestoreTokenStore.hpp>
#include <Aurora/Input/Linux/PipewireDmabuf.hpp>
#include <Aurora/Input/Linux/PipewireTrace.hpp>
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

      // Aurora-1t1 diagnostics, active only with AURORA_DEV_PW_TRACE set.
      PipewireTrace trace;
      spa_source* traceTimer{nullptr};
      // Offer LINEAR DMA-BUF first (Aurora-1t1: GNOME fullscreen sends a
      // memfd stream empty buffers). On by default; AURORA_PW_DMABUF=0 is
      // the kill switch that forces shared memory.
      bool dmabufEnabled{true};
      // Dev-only (AURORA_DEV_PW_DMABUF_FAIL): fail every DMA-BUF map, to
      // exercise the shared-memory fallback.
      bool dmabufForceFail{false};
      // Whether the current format offer still includes LINEAR DMA-BUF.
      bool dmabufOffered{false};
      // A Buffers param restricted to DmaBuf was sent; undo it on fallback.
      bool dmabufBuffersRequested{false};
      DmabufReadFallback dmabufFallback;
      spa_source* renegotiateEvent{nullptr};
      StaleFrameWatch staleWatch;

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

    // Map DMA-BUFs once per buffer rather than once per frame.
    static void _onStreamAddBuffer(
      void* userdata,
      pw_buffer* buffer
    );

    static void _onStreamRemoveBuffer(
      void* userdata,
      pw_buffer* buffer
    );

    // Runs on the loop after DMA-BUF reads kept failing: re-offer formats
    // without the DMA-BUF one so the producer switches to shared memory.
    static void _onRenegotiateWithoutDmabuf(
      void* userdata,
      uint64_t count
    );

    static void _onTraceTimer(
      void* userdata,
      uint64_t expirations
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
