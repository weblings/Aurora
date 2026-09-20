#pragma once
/*
  This code is an adapation from https://codeberg.org/metamuffin/xdg-dp-start/src/branch/master/xdg-dp-start.c
  It consists on an extraction from OBS Source code achieving the call and management of a xdg-portal capture query.
  Ported from huenicorn's Huenicorn::Grabber::XdgDesktopPortal (GPL-3.0) -- see Analysis/LinuxCaptureAnalysis.md.
*/

#include <future>
#include <string>

#include <gio/gunixfdlist.h>

#include <Aurora/Input/Linux/IRestoreTokenStore.hpp>

namespace Aurora::Input::Linux
{
  class XdgDesktopPortal
  {
  public:
    // Type definitions
    using StringPair = std::pair<std::string, std::string>;

    // Enums
    enum CaptureType
    {
      Monitor = 1 << 0,
      //Window = 1 << 1,
      //Virtual = 1 << 2,
    };


    enum CursorMode
    {
      Hidden = 1 << 0,
      Embedded = 1 << 1,
      Metadata = 1 << 2,
    };


    enum class CreatePathTokenType
    {
      Request = 0,
      Session = 1
    };


    // Structures
    struct Capture
    {
      CaptureType captureType;
      GCancellable* cancellable{nullptr};
      char* sessionHandle{nullptr};
      uint32_t pwNode{0};
      uint32_t pwFd{0};
      char cursorVisible;
      std::promise<bool> fdReadyPromise;
      bool updateXdgContext{true};
      IRestoreTokenStore* restoreTokenStore{nullptr};
    };


    struct DbusCallData
    {
      Capture* capture;
      std::string requestPath;
      guint signalId;
      gulong cancelledId;
    };

    // Public methods
    static void createSession(
      Capture* capture
    );

    static bool initScreencastCapture(
      Capture* capture
    );

    static void screencastPortalDesktopCaptureCreate(
      Capture* capture,
      CaptureType captureType,
      bool cursorVisible
    );

    static void screencastPortalCaptureDestroy(
      Capture* capture
    );


    // private methods
  private:
    static void ensureConnection();

    static std::string getSenderName();

    static GDBusConnection* portalGetDbusConnection();

    static StringPair portalCreatePath(
      CreatePathTokenType createPathTokenType
    );

    static void ensureScreencastPortalProxy();

    static GDBusProxy* getScreencastPortalProxy();

    static uint32_t getAvailableCursorModes();

    static uint32_t getScreencastVersion();

    static void onCancelledCallback(
      GCancellable* cancellable,
      void* data
    );

    static DbusCallData* subscribeToSignal(
      Capture* capture,
      const char* path,
      GDBusSignalCallback callback
    );

    static void dbusCallDataFree(
      DbusCallData* call
    );

    static void onPipewireRemoteOpenedCallback(
      GObject* source,
      GAsyncResult* res,
      void* userData
    );

    static void openPipewireRemote(
      Capture* capture
    );

    static void onStartResponseReceivedCallback(
      GDBusConnection* connection,
      const char* sender_name,
      const char* object_path,
      const char* interfaceName,
      const char* signalName,
      GVariant* parameters,
      void* userData
    );

    static void onStartedCallback(
      GObject* source,
      GAsyncResult* res,
      void* userData
    );

    static void start(
      Capture* capture
    );

    static void onSelectSourceResponseReceivedCallback(
      GDBusConnection* connection,
      const char* senderName,
      const char* objectPath,
      const char* interfaceName,
      const char* signalName,
      GVariant* parameters,
      void* userData
    );

    static void onSourceSelectedCallback(
      GObject* source,
      GAsyncResult* res,
      void* userData
    );

    static void selectSource(
      Capture* capture
    );

    static void onCreateSessionResponseReceivedCallback(
      GDBusConnection* connection,
      const char* senderName,
      const char* objectPath,
      const char* interfaceName,
      const char* signalName,
      GVariant* parameters,
      void* userData
    );

    static void onSessionCreatedCallback(
      GObject* source,
      GAsyncResult* res,
      void* userData
    );

  private:
    // Attributes
    static GDBusConnection* m_connection;
    static GDBusProxy* m_screencastProxy;

    static const std::string ObjectPath;
    static const std::string BusName;
  };
}
