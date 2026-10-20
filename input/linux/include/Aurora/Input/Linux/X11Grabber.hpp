#pragma once

#include <atomic>
#include <cstdint>
#include <memory>
#include <optional>

#include <Aurora/Input/IVideoInput.hpp>
#include <Aurora/Input/MonitorData.hpp>
#include <Aurora/Input/Linux/X11Damage.hpp>

#include <X11/extensions/Xdamage.h>
#include <X11/extensions/Xrandr.h>
#include <X11/extensions/XShm.h>

// Mechanically ported from huenicorn's X11Grabber -- self-contained (only
// needs libX11/libXext/libXrandr/libXdamage), so it ports now even though PipewireGrabber
// doesn't yet. Needs a real X11 session to manually verify capture -- not
// unit-testable, same category as Hue's DTLS streaming.
namespace Aurora::Input::Linux
{
  class X11Grabber : public IVideoInput
  {
  public:
    template <auto FreeFunc>
    struct XDeleter
    {
      template <typename T>
      void operator()(T* ptr) const noexcept
      {
        if(ptr){
          FreeFunc(ptr);
        }
      }
    };

    static inline void destroyXImage(XImage* img)
    {
      if(img){
        XDestroyImage(img);
      }
    }

    template <typename T, auto FreeFunc>
    using XUniquePtr = std::unique_ptr<T, XDeleter<FreeFunc>>;

    using UniqueDisplay         = XUniquePtr<Display, XCloseDisplay>;
    using UniqueOutputInfo      = XUniquePtr<XRROutputInfo, XRRFreeOutputInfo>;
    using UniqueCrtcInfo        = XUniquePtr<XRRCrtcInfo, XRRFreeCrtcInfo>;
    using UniqueScreenResources = XUniquePtr<XRRScreenResources, XRRFreeScreenResources>;
    using UniqueXImage          = XUniquePtr<XImage, destroyXImage>;


    struct X11MonitorData : public MonitorData
    {
      X11MonitorData(
        const std::string& name,
        unsigned width,
        unsigned height,
        double refreshRate,
        bool isPrimary,
        int xPos,
        int yPos,
        RROutput outputId
      );

      int xPos{0};
      int yPos{0};
      RROutput outputId{0};
    };


    class XShmData
    {
    public:
      XShmData(Display* display, int screenId, unsigned width, unsigned height);
      ~XShmData();

      XImage* ximage() const;

    private:
      Display* m_display{nullptr};
      std::unique_ptr<XShmSegmentInfo> m_shmInfo;
      UniqueXImage m_ximage;
    };


    X11Grabber();
    ~X11Grabber() override;

    const std::string& name() const override;

    bool hasCustomScreenManagement() const override
    {
      return true;
    }

    Resolution displayResolution() const override;
    RefreshRate displayRefreshRate() const override;

    bool isMonitorStillValid(X11MonitorData* monitor);

    void selectMonitor(unsigned monitorId) override;
    void grabFrameSubsample(Contracts::ImageData& imageData) override;
    void setCaptureWidthHint(unsigned width) override;
    std::uint64_t frameSerial() const override;

  protected:
    void _initMonitorsList() override;

  private:
    void _ensureXThreadsInit();
    bool _ensureXShmData();
    // Drains pending root-window damage events and reports whether any
    // touched the monitor. Always true without the Damage extension
    // (fail-soft: every grab is full, the pre-1pwk behavior).
    bool _pollDamage(X11MonitorData* monitor);

    int m_screenId;
    UniqueDisplay m_display; // must be destroyed after m_xshmData

    std::unique_ptr<XShmData> m_xshmData;
    Contracts::ImageData m_lastFrame;
    // Consumer's sampled width (IVideoInput::setCaptureWidthHint), set from
    // the config thread and read on the tick thread when grabbing.
    std::atomic<unsigned> m_captureWidthHint{0};

    // Static-frame reuse (Aurora-1pwk): the X server reports damage, so a
    // tick with no damage re-serves m_lastFrame instead of paying for
    // XShmGetImage plus the full-buffer decimate; on a busy screen grabs
    // are also rate-capped (see kMinGrabIntervalMs) and quiet ones still
    // refreshed every kMaxStaleMs. All tick-thread only, like
    // PipewireGrabber's m_grabbedSerial.
    Damage m_damage{None};
    int m_damageEventBase{0};
    X11GrabGate m_grabGate;
    std::uint64_t m_frameSerial{0};
    std::uint64_t m_grabbedSerial{0};
  };
}
