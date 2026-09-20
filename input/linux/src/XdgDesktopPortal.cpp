/*
  This code is an adapation from https://codeberg.org/metamuffin/xdg-dp-start/src/branch/master/xdg-dp-start.c
  It consists on an extraction from OBS Source code achieving the call and management of a xdg-portal capture query.
  Ported from huenicorn's Huenicorn::Grabber::XdgDesktopPortal (GPL-3.0) -- see Analysis/LinuxCaptureAnalysis.md.
*/

#include <Aurora/Input/Linux/XdgDesktopPortal.hpp>

#include <algorithm>
#include <future>
#include <sstream>
#include <string>

#include <gio/gunixfdlist.h>


namespace Aurora::Input::Linux
{
  GDBusConnection* XdgDesktopPortal::m_connection = nullptr;
  GDBusProxy* XdgDesktopPortal::m_screencastProxy = nullptr;

  const std::string XdgDesktopPortal::ObjectPath = "/org/freedesktop/portal/desktop";
  const std::string XdgDesktopPortal::BusName = "org.freedesktop.portal.Desktop";


  void XdgDesktopPortal::createSession(
    Capture* capture
  )
  {
    StringPair requestPathAndToken = portalCreatePath(CreatePathTokenType::Request);
    StringPair sessionPathAndToken = portalCreatePath(CreatePathTokenType::Session);

    DbusCallData* call = subscribeToSignal(capture, requestPathAndToken.first.c_str(), onCreateSessionResponseReceivedCallback);

    GVariantBuilder builder;
    g_variant_builder_init(&builder, G_VARIANT_TYPE_VARDICT);
    g_variant_builder_add(&builder, "{sv}", "handle_token", g_variant_new_string(requestPathAndToken.second.c_str()));
    g_variant_builder_add(&builder, "{sv}", "session_handle_token", g_variant_new_string(sessionPathAndToken.second.c_str()));

    g_dbus_proxy_call(getScreencastPortalProxy(), "CreateSession", g_variant_new("(a{sv})", &builder), G_DBUS_CALL_FLAGS_NONE, -1, capture->cancellable, onSessionCreatedCallback, call);
  }


  bool XdgDesktopPortal::initScreencastCapture(
    Capture* capture
  )
  {
    capture->cancellable = g_cancellable_new();
    GDBusConnection* connection = portalGetDbusConnection();
    if(!connection){
      return false;
    }

    GDBusProxy* proxy = getScreencastPortalProxy();
    if(!proxy){
      return false;
    }

    createSession(capture);

    return true;
  }


  void XdgDesktopPortal::screencastPortalDesktopCaptureCreate(
    Capture* capture,
    CaptureType captureType,
    bool cursorVisible
  )
  {
    capture->captureType = captureType;
    capture->cursorVisible = cursorVisible;

    initScreencastCapture(capture);
  }


  void XdgDesktopPortal::screencastPortalCaptureDestroy(
    Capture* capture
  )
  {
    if(!capture){
      return;
    }

    std::string interfaceName = "org.freedesktop.portal.Session";
    std::string methodName = "Close";

    if(capture->sessionHandle){
      g_dbus_connection_call(portalGetDbusConnection(), BusName.c_str(), capture->sessionHandle, interfaceName.c_str(), methodName.c_str(), NULL, NULL, G_DBUS_CALL_FLAGS_NONE, -1, NULL, NULL, NULL);
      g_clear_pointer(&capture->sessionHandle, g_free);
    }

    g_cancellable_cancel(capture->cancellable);
    g_clear_object(&capture->cancellable);
  }


  void XdgDesktopPortal::ensureConnection()
  {
    g_autoptr(GError) error = NULL;
    if(!m_connection){
      m_connection = g_bus_get_sync(G_BUS_TYPE_SESSION, NULL, &error);

      if(error){
        return;
      }
    }
  }


  std::string XdgDesktopPortal::getSenderName()
  {
    ensureConnection();

    // Fixed in the port: the original strdup'd this into a raw char* just to
    // hand it to std::string's constructor (which already copies), then
    // never freed it -- a pointless per-call leak.
    std::string senderName(g_dbus_connection_get_unique_name(m_connection) + 1);
    std::replace(senderName.begin(), senderName.end(), '.', '_');

    return senderName;
  }


  GDBusConnection* XdgDesktopPortal::portalGetDbusConnection()
  {
    ensureConnection();
    return m_connection;
  }


  XdgDesktopPortal::StringPair XdgDesktopPortal::portalCreatePath(
    CreatePathTokenType createPathTokenType
  )
  {
    static uint32_t count[2] = {0, 0};

    std::string type = "";
    switch(createPathTokenType)
    {
      case CreatePathTokenType::Request:
        type = "request";
        break;

      case CreatePathTokenType::Session:
        type = "session";
        break;
    }

    StringPair pathAndToken;
    std::ostringstream oss;
    oss << "aurora";
    oss << ++count[static_cast<int>(createPathTokenType)];
    pathAndToken.second = oss.str();
    pathAndToken.first = ObjectPath + '/' + type + '/' + getSenderName() + '/' + pathAndToken.second;

    return pathAndToken;
  }


  void XdgDesktopPortal::ensureScreencastPortalProxy()
  {
    g_autoptr(GError) error = NULL;
    if(!m_screencastProxy){

      std::string interfaceName = "org.freedesktop.portal.ScreenCast";

      m_screencastProxy = g_dbus_proxy_new_sync(portalGetDbusConnection(), G_DBUS_PROXY_FLAGS_NONE, NULL, BusName.c_str(), ObjectPath.c_str(), interfaceName.c_str(), NULL, &error);

      if(error){
        return;
      }
    }
  }


  GDBusProxy* XdgDesktopPortal::getScreencastPortalProxy()
  {
    ensureScreencastPortalProxy();
    return m_screencastProxy;
  }


  uint32_t XdgDesktopPortal::getAvailableCursorModes()
  {
    ensureScreencastPortalProxy();

    if(!m_screencastProxy){
      return 0;
    }

    g_autoptr(GVariant) cachedCursorModes = g_dbus_proxy_get_cached_property(m_screencastProxy, "AvailableCursorModes");
    return cachedCursorModes ? g_variant_get_uint32(cachedCursorModes) : 0;
  }


  uint32_t XdgDesktopPortal::getScreencastVersion()
  {
    g_autoptr(GVariant) cached_version = NULL;
    uint32_t version;

    ensureScreencastPortalProxy();

    if(!m_screencastProxy){
      return 0;
    }

    cached_version = g_dbus_proxy_get_cached_property(m_screencastProxy, "version");
    version = cached_version ? g_variant_get_uint32(cached_version) : 0;

    return version;
  }


  void XdgDesktopPortal::onCancelledCallback(
    GCancellable* /*cancellable*/,
    void* data
  )
  {
    DbusCallData* call = static_cast<DbusCallData*>(data);

    std::string interfaceName = "org.freedesktop.portal.Request";

    g_dbus_connection_call(portalGetDbusConnection(), BusName.c_str(), call->requestPath.c_str(), interfaceName.c_str(), "Close", NULL, NULL, G_DBUS_CALL_FLAGS_NONE, -1, NULL, NULL, NULL);

    dbusCallDataFree(call);
  }


  XdgDesktopPortal::DbusCallData* XdgDesktopPortal::subscribeToSignal(
    Capture* capture,
    const char* path,
    GDBusSignalCallback callback
  )
  {
    DbusCallData* call = new DbusCallData();
    call->capture = capture;
    call->requestPath = std::string(path);
    call->cancelledId = g_signal_connect(capture->cancellable, "cancelled", G_CALLBACK(onCancelledCallback), call);
    std::string interfaceName = "org.freedesktop.portal.Request";
    call->signalId = g_dbus_connection_signal_subscribe(portalGetDbusConnection(), BusName.c_str(), interfaceName.c_str(), "Response", call->requestPath.c_str(), NULL, G_DBUS_SIGNAL_FLAGS_NO_MATCH_RULE, callback, call, NULL);

    return call;
  }


  void XdgDesktopPortal::dbusCallDataFree(
    DbusCallData* call
  )
  {
    if(!call){
      return;
    }

    if(call->signalId){
      g_dbus_connection_signal_unsubscribe(portalGetDbusConnection(), call->signalId);
    }

    if(call->cancelledId > 0){
      g_signal_handler_disconnect(call->capture->cancellable, call->cancelledId);
    }

    delete call;
  }


  void XdgDesktopPortal::onPipewireRemoteOpenedCallback(
    GObject* source,
    GAsyncResult* res,
    void* userData
  )
  {
    Capture* capture = static_cast<Capture*>(userData);
    g_autoptr(GUnixFDList) fdList = NULL;
    g_autoptr(GError) error = NULL;
    g_autoptr(GVariant) result = g_dbus_proxy_call_with_unix_fd_list_finish(G_DBUS_PROXY(source), &fdList, res, &error);

    if(error){
      return;
    }

    int fdIndex;
    g_variant_get(result, "(h)", &fdIndex, &error);

    int pwFd = g_unix_fd_list_get(fdList, fdIndex, &error);
    if(error){
      return;
    }

    capture->pwFd = static_cast<uint32_t>(pwFd);
    capture->updateXdgContext = false;
    capture->fdReadyPromise.set_value(true);
  }


  void XdgDesktopPortal::openPipewireRemote(
    Capture* capture
  )
  {
    GVariantBuilder builder;
    g_variant_builder_init(&builder, G_VARIANT_TYPE_VARDICT);

    g_dbus_proxy_call_with_unix_fd_list(getScreencastPortalProxy(), "OpenPipeWireRemote", g_variant_new("(oa{sv})", capture->sessionHandle, &builder), G_DBUS_CALL_FLAGS_NONE, -1, NULL, capture->cancellable, onPipewireRemoteOpenedCallback, capture);
  }


  void XdgDesktopPortal::onStartResponseReceivedCallback(
    GDBusConnection* /*connection*/,
    const char* /*senderName*/,
    const char* /*objectPath*/,
    const char* /*interfaceName*/,
    const char* /*signalName*/,
    GVariant* parameters,
    void* userData
  )
  {
    DbusCallData* call = static_cast<DbusCallData*>(userData);
    Capture* capture = call->capture;

    g_clear_pointer(&call, dbusCallDataFree);

    uint32_t response;
    g_autoptr(GVariant) result = NULL;
    g_variant_get(parameters, "(u@a{sv})", &response, &result);

    if(response != 0){
      capture->fdReadyPromise.set_value(false);
      return;
    }

    g_autoptr(GVariant) streams = g_variant_lookup_value(result, "streams", G_VARIANT_TYPE_ARRAY);

    GVariantIter iter;
    g_variant_iter_init(&iter, streams);

    // Only one stream is ever requested (CaptureType::Monitor, multiple=FALSE
    // in selectSource) -- n_streams != 1 here would mean a nonconforming
    // portal implementation, worth surfacing once logging exists.
    g_variant_iter_n_children(&iter);

    const char* token = nullptr;
    if(g_variant_lookup(result, "restore_token", "&s", &token)){
      IRestoreTokenStore* store = capture->restoreTokenStore;

      if(!store->restoreToken().has_value() || *store->restoreToken() != token){
        store->setRestoreToken(token);
      }
    }

    g_autoptr(GVariant) streamProperties = NULL;
    g_variant_iter_loop(&iter, "(u@a{sv})", &capture->pwNode, &streamProperties);
    openPipewireRemote(capture);
  }


  void XdgDesktopPortal::onStartedCallback(
    GObject* source,
    GAsyncResult* res,
    void* userData
  )
  {
    DbusCallData* call = static_cast<DbusCallData*>(userData);
    Capture* capture = call->capture;

    g_autoptr(GError) error = NULL;
    g_autoptr(GVariant) result = g_dbus_proxy_call_finish(G_DBUS_PROXY(source), res, &error);
    (void)result;
    if(error){
      if(!g_error_matches(error, G_IO_ERROR, G_IO_ERROR_CANCELLED)){
        capture->fdReadyPromise.set_value(false);
      }
      return;
    }
  }


  void XdgDesktopPortal::start(
    Capture* capture
  )
  {
    StringPair pathAndToken = portalCreatePath(CreatePathTokenType::Request);
    DbusCallData* call = subscribeToSignal(capture, pathAndToken.first.c_str(), onStartResponseReceivedCallback);

    GVariantBuilder builder;
    g_variant_builder_init(&builder, G_VARIANT_TYPE_VARDICT);
    g_variant_builder_add(&builder, "{sv}", "handle_token", g_variant_new_string(pathAndToken.second.c_str()));

    g_dbus_proxy_call(getScreencastPortalProxy(), "Start", g_variant_new("(osa{sv})", capture->sessionHandle, "", &builder), G_DBUS_CALL_FLAGS_NONE, -1, capture->cancellable, onStartedCallback, call);
  }


  void XdgDesktopPortal::onSelectSourceResponseReceivedCallback(
    GDBusConnection* /*connection*/,
    const char* /*senderName*/,
    const char* /*objectPath*/,
    const char* /*interfaceName*/,
    const char* /*signalName*/,
    GVariant* parameters,
    void* userData
  )
  {
    DbusCallData* call = static_cast<DbusCallData*>(userData);

    Capture* capture = call->capture;
    g_clear_pointer(&call, dbusCallDataFree);

    uint32_t response;
    g_autoptr(GVariant) ret = NULL;
    g_variant_get(parameters, "(u@a{sv})", &response, &ret);

    if(response != 0){
      return;
    }

    start(capture);
  }


  void XdgDesktopPortal::onSourceSelectedCallback(
    GObject* source,
    GAsyncResult* res,
    void* userData
  )
  {
    (void)userData;

    g_autoptr(GError) error = NULL;
    g_autoptr(GVariant) result = g_dbus_proxy_call_finish(G_DBUS_PROXY(source), res, &error);
    (void)result;
  }


  void XdgDesktopPortal::selectSource(
    Capture* capture
  )
  {
    StringPair pathAndToken = portalCreatePath(CreatePathTokenType::Request);
    DbusCallData* call = subscribeToSignal(capture, pathAndToken.first.c_str(), onSelectSourceResponseReceivedCallback);

    GVariantBuilder builder;
    g_variant_builder_init(&builder, G_VARIANT_TYPE_VARDICT);
    g_variant_builder_add(&builder, "{sv}", "types", g_variant_new_uint32(capture->captureType));
    g_variant_builder_add(&builder, "{sv}", "multiple", g_variant_new_boolean(FALSE));
    g_variant_builder_add(&builder, "{sv}", "handle_token", g_variant_new_string(pathAndToken.second.c_str()));

    if(capture->restoreTokenStore->restoreToken().has_value()){
      g_variant_builder_add(
        &builder,
        "{sv}",
        "restore_token",
        g_variant_new_string(capture->restoreTokenStore->restoreToken()->c_str())
      );
    }

    uint32_t available_cursor_modes = getAvailableCursorModes();
    if(available_cursor_modes & CursorMode::Metadata){
      g_variant_builder_add(&builder, "{sv}", "cursor_mode", g_variant_new_uint32(CursorMode::Metadata));
    }
    else if((available_cursor_modes & CursorMode::Embedded) && capture->cursorVisible){
      g_variant_builder_add(&builder, "{sv}", "cursor_mode", g_variant_new_uint32(CursorMode::Embedded));
    }
    else{
      g_variant_builder_add(&builder, "{sv}", "cursor_mode", g_variant_new_uint32(CursorMode::Hidden));
    }

    if(getScreencastVersion() >= 4){
      g_variant_builder_add(&builder, "{sv}", "persist_mode", g_variant_new_uint32(2));
    }

    g_dbus_proxy_call(getScreencastPortalProxy(), "SelectSources", g_variant_new("(oa{sv})", capture->sessionHandle, &builder), G_DBUS_CALL_FLAGS_NONE, -1, capture->cancellable, onSourceSelectedCallback, call);
  }


  void XdgDesktopPortal::onCreateSessionResponseReceivedCallback(
    GDBusConnection* /*connection*/,
    const char* /*senderName*/,
    const char* /*objectPath*/,
    const char* /*interfaceName*/,
    const char* /*signalName*/,
    GVariant* parameters,
    void* userData
  )
  {
    DbusCallData* call = static_cast<DbusCallData*>(userData);
    Capture* capture = call->capture;
    g_clear_pointer(&call, dbusCallDataFree);

    uint32_t response;
    g_autoptr(GVariant) result = NULL;
    g_variant_get(parameters, "(u@a{sv})", &response, &result);

    // Fixed in the port: the original fell through here instead of
    // returning, reading session_handle out of an unvalidated result.
    if(response != 0){
      return;
    }

    g_autoptr(GVariant) sessionHandleVariant = g_variant_lookup_value(result, "session_handle", NULL);
    capture->sessionHandle = g_variant_dup_string(sessionHandleVariant, NULL);

    selectSource(capture);
  }


  void XdgDesktopPortal::onSessionCreatedCallback(
    GObject* source,
    GAsyncResult* res,
    void* /*userData*/
  )
  {
    g_autoptr(GError) error = NULL;
    g_autoptr(GVariant) result = g_dbus_proxy_call_finish(G_DBUS_PROXY(source), res, &error);
    (void)result;
  }
}
