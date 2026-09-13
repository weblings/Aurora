#pragma once

#include <memory>
#include <optional>

#include <Aurora/Input/IInput.hpp>
#include <Aurora/Input/MonitorData.hpp>

#include <X11/extensions/Xrandr.h>
#include <X11/extensions/XShm.h>

// Mechanically ported from huenicorn's X11Grabber -- self-contained (only
// needs libX11/libXext/libXrandr), so it ports now even though PipewireGrabber
// doesn't yet. Needs a real X11 session to manually verify capture -- not
// unit-testable, same category as Hue's DTLS streaming.
namespace Aurora::Input::Linux
{
  class X11Grabber : public IInput
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
    virtual ~X11Grabber(){}

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

  protected:
    void _initMonitorsList() override;

  private:
    void _ensureXThreadsInit();
    bool _ensureXShmData();

    int m_screenId;
    UniqueDisplay m_display; // must be destroyed after m_xshmData

    std::unique_ptr<XShmData> m_xshmData;
    Contracts::ImageData m_lastFullScreenFrame;
  };
}
