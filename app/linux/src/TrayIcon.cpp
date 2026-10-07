#include <Aurora/App/TrayIcon.hpp>

#include <Aurora/Runtime/TrayLabel.hpp>

#include <atomic>
#include <functional>
#include <future>
#include <iostream>
#include <string>
#include <thread>

#include <gio/gio.h>
#include <unistd.h>

namespace Aurora::App
{
namespace
{

constexpr const char* kBusNamePrefix = "org.kde.StatusNotifierItem-";
constexpr const char* kItemPath = "/StatusNotifierItem";
constexpr const char* kMenuPath = "/Menu";
constexpr int kIdLaunchUi = 1;
constexpr int kIdStop = 2;
constexpr int kIdPause = 3;

// --- dbusmenu layout (pure construction, unit-tested) ---

// Ownership contract throughout: every g_variant_new_* container call sinks
// the floating references it is given (including '@'-embedded values), so
// nothing passed into a builder is ever unref'd by hand. Only GVariant*
// values handed *out* (get_child_value, lookup, get_variant) are full
// references the caller must release.
GVariant* dictEntry(const char* key, GVariant* value)
{
  // dbusmenu properties are a{sv}: values must be boxed. Both constructors
  // sink what they are given, so no hand unref here either.
  return g_variant_new_dict_entry(g_variant_new_string(key),
                                  g_variant_new_variant(value));
}

GVariant* emptyChildren()
{
  return g_variant_new_array(G_VARIANT_TYPE("v"), nullptr, 0);
}

GVariant* menuItem(gint32 id, const char* label, bool enabled)
{
  GVariant* entries[3];
  entries[0] = dictEntry("label", g_variant_new_string(label));
  entries[1] = dictEntry("enabled", g_variant_new_boolean(enabled));
  entries[2] = dictEntry("visible", g_variant_new_boolean(true));
  GVariant* props = g_variant_new_array(G_VARIANT_TYPE("{sv}"), entries, 3);
  return g_variant_new("(i@a{sv}@av)", id, props, emptyChildren());
}

// new_variant sinks the item it boxes; new_array sinks the boxes.
GVariant* boxed(GVariant* item)
{
  return g_variant_new_variant(item);
}

GVariant* buildMenuLayout(bool webUiBound, const char* pauseLabel)
{
  GVariant* rootProps = g_variant_new_array(G_VARIANT_TYPE("{sv}"), nullptr, 0);
  GVariant* kids[3];
  kids[0] = boxed(menuItem(kIdLaunchUi, "Launch UI", webUiBound));
  kids[1] = boxed(menuItem(kIdPause, pauseLabel, true));
  kids[2] = boxed(menuItem(kIdStop, "Stop", true));
  GVariant* children = g_variant_new_array(G_VARIANT_TYPE("v"), kids, 3);
  return g_variant_new("(i@a{sv}@av)", 0, rootProps, children);
}

GVariant* emptyTooltipPixmap()
{
  return g_variant_new_array(G_VARIANT_TYPE("(iiay)"), nullptr, 0);
}

// --- D-Bus plumbing (worker thread only) ---

struct BusState
{
  TrayIcon* self;
  GDBusConnection* connection;
  std::string url;
  bool webUiBound;
  std::function<void()> onLaunch;
  std::function<void()> onStop;
  std::function<void()> onTogglePause;
  std::function<Aurora::Runtime::HostStatus()> hostStatus;
  // Published only once the loop exists, so refresh() never touches a
  // context the worker is about to drop (no bus / no loop).
  std::atomic<GMainContext*> loopContext{nullptr};
  std::atomic<guint> revision{1};
  guint itemRegId{0};
  guint menuRegId{0};
  guint ownerId{0};
};

const char kSniXml[] =
    "<node>"
    "  <interface name='org.kde.StatusNotifierItem'>"
    "    <property name='Category' type='s' access='read'/>"
    "    <property name='Id' type='s' access='read'/>"
    "    <property name='Title' type='s' access='read'/>"
    "    <property name='Status' type='s' access='read'/>"
    "    <property name='WindowId' type='u' access='read'/>"
    "    <property name='IconName' type='s' access='read'/>"
    "    <property name='IconPixmap' type='a(iiay)' access='read'/>"
    "    <property name='OverlayIconName' type='s' access='read'/>"
    "    <property name='ToolTip' type='(sa(iiay)ss)' access='read'/>"
    "    <property name='Menu' type='o' access='read'/>"
    "    <property name='ItemIsMenu' type='b' access='read'/>"
    "    <method name='ContextMenu'><arg name='x' type='i' direction='in'/>"
    "      <arg name='y' type='i' direction='in'/></method>"
    "    <method name='Activate'><arg name='x' type='i' direction='in'/>"
    "      <arg name='y' type='i' direction='in'/></method>"
    "  </interface>"
    "</node>";

const char kMenuXml[] =
    "<node>"
    "  <interface name='com.canonical.dbusmenu'>"
    "    <method name='GetLayout'>"
    "      <arg name='parentId' type='i' direction='in'/>"
    "      <arg name='recursionDepth' type='i' direction='in'/>"
    "      <arg name='propertyNames' type='as' direction='in'/>"
    "      <arg name='revision' type='u' direction='out'/>"
    "      <arg name='layout' type='(ia{sv}av)' direction='out'/>"
    "    </method>"
    "    <method name='GetGroupProperties'>"
    "      <arg name='ids' type='ai' direction='in'/>"
    "      <arg name='propertyNames' type='as' direction='in'/>"
    "      <arg name='properties' type='a(ia{sv})' direction='out'/>"
    "    </method>"
    "    <method name='GetProperty'>"
    "      <arg name='id' type='i' direction='in'/>"
    "      <arg name='name' type='s' direction='in'/>"
    "      <arg name='property' type='v' direction='out'/>"
    "    </method>"
    "    <method name='Event'>"
    "      <arg name='id' type='i' direction='in'/>"
    "      <arg name='eventId' type='s' direction='in'/>"
    "      <arg name='data' type='v' direction='in'/>"
    "      <arg name='timestamp' type='u' direction='in'/>"
    "    </method>"
    "    <method name='AboutToShow'>"
    "      <arg name='id' type='i' direction='in'/>"
    "      <arg name='needUpdate' type='b' direction='out'/>"
    "    </method>"
    "    <signal name='LayoutUpdated'>"
    "      <arg name='revision' type='u'/>"
    "      <arg name='parent' type='i'/>"
    "    </signal>"
    "    <property name='Version' type='s' access='read'/>"
    "    <property name='Status' type='s' access='read'/>"
    "  </interface>"
    "</node>";

GVariant* sniProperty(BusState* state, const char* name)
{
  if(g_strcmp0(name, "Category") == 0){
    return g_variant_new_string("ApplicationStatus");
  }
  if(g_strcmp0(name, "Id") == 0){
    return g_variant_new_string("aurora");
  }
  if(g_strcmp0(name, "Title") == 0){
    return g_variant_new_string("Aurora");
  }
  if(g_strcmp0(name, "Status") == 0){
    return g_variant_new_string("Active");
  }
  if(g_strcmp0(name, "WindowId") == 0){
    return g_variant_new_uint32(0);
  }
  if(g_strcmp0(name, "IconName") == 0){
    // Resolved through the installed hicolor theme (lx4 install rules) --
    // no pixmap encoding, and the host picks the size it needs.
    return g_variant_new_string("aurora");
  }
  if(g_strcmp0(name, "IconPixmap") == 0){
    return emptyTooltipPixmap();
  }
  if(g_strcmp0(name, "OverlayIconName") == 0){
    return g_variant_new_string("");
  }
  if(g_strcmp0(name, "ToolTip") == 0){
    const std::string text = state->webUiBound ? state->url : "WebUI unavailable";
    return g_variant_new("(s@a(iiay)ss)", "Aurora", emptyTooltipPixmap(),
                         "Aurora", text.c_str());
  }
  if(g_strcmp0(name, "Menu") == 0){
    return g_variant_new_object_path(kMenuPath);
  }
  if(g_strcmp0(name, "ItemIsMenu") == 0){
    return g_variant_new_boolean(false);
  }
  return nullptr;
}

void sniMethod(GDBusConnection*, const gchar*, const gchar*, const gchar*,
               const gchar* method, GVariant*, GDBusMethodInvocation* invocation,
               gpointer userData)
{
  auto* state = static_cast<BusState*>(userData);
  // Left-click opens the UI (host-driven menus need no positioning help:
  // the host pulls our dbusmenu layout itself for ContextMenu).
  if(g_strcmp0(method, "Activate") == 0 && state->webUiBound){
    state->onLaunch();
  }
  g_dbus_method_invocation_return_value(invocation, g_variant_new("()"));
}

GVariant* sniGetProperty(GDBusConnection*, const gchar*, const gchar*,
                         const gchar*, const gchar* name, GError** error,
                         gpointer userData)
{
  GVariant* value = sniProperty(static_cast<BusState*>(userData), name);
  if(!value){
    g_set_error(error, G_DBUS_ERROR, G_DBUS_ERROR_UNKNOWN_PROPERTY,
                "No such property: %s", name);
  }
  return value;
}

gboolean sniSetProperty(GDBusConnection*, const gchar*, const gchar*,
                        const gchar*, const gchar*, GVariant*, GError** error,
                        gpointer)
{
  g_set_error(error, G_DBUS_ERROR, G_DBUS_ERROR_PROPERTY_READ_ONLY,
              "SNI properties are read-only");
  return false;
}

void menuMethod(GDBusConnection*, const gchar*, const gchar*, const gchar*,
                const gchar* method, GVariant* parameters,
                GDBusMethodInvocation* invocation, gpointer userData)
{
  auto* state = static_cast<BusState*>(userData);
  if(g_strcmp0(method, "GetLayout") == 0){
    // One status() snapshot per open (Aurora-k73j): state plus errors
    // together, so a running host holding errors (Aurora-ja76) still reads
    // Pause while a failed one reads See Error.
    const Aurora::Runtime::HostStatus hostStatus = state->hostStatus();
    GVariant* layout = buildMenuLayout(state->webUiBound,
        Aurora::Runtime::trayPauseItemLabel(hostStatus.state, !hostStatus.errors.empty(),
            state->webUiBound));
    GVariant* reply = g_variant_new("(u@(ia{sv}av))", state->revision.load(), layout);
    g_dbus_method_invocation_return_value(invocation, reply);
  }
  else if(g_strcmp0(method, "Event") == 0){
    gint32 id = 0;
    const gchar* eventId = nullptr;
    g_variant_get(parameters, "(isvu)", &id, &eventId, nullptr, nullptr);
    if(g_strcmp0(eventId, "clicked") == 0){
      if(id == kIdLaunchUi && state->webUiBound){
        state->onLaunch();
      }
      else if(id == kIdPause){
        // A "See Error" slot opens the WebUI (Aurora-k73j): the banner
        // there explains and offers the retry. Otherwise the normal
        // run/pause target post (Aurora-q9l1).
        const Aurora::Runtime::HostStatus clickStatus = state->hostStatus();
        if(Aurora::Runtime::trayPauseItemShowsError(clickStatus.state,
               !clickStatus.errors.empty(), state->webUiBound)){
          state->onLaunch();
        }
        else{
          state->onTogglePause();
        }
      }
      else if(id == kIdStop){
        state->onStop();
      }
    }
    g_dbus_method_invocation_return_value(invocation, g_variant_new("()"));
  }
  else if(g_strcmp0(method, "AboutToShow") == 0){
    // The Pause/Resume label can change behind the host's back (Dashboard,
    // API), so always ask it to re-fetch the layout before showing.
    g_dbus_method_invocation_return_value(invocation, g_variant_new("(b)", true));
  }
  else{
    g_dbus_method_invocation_return_error(invocation, G_DBUS_ERROR,
        G_DBUS_ERROR_UNKNOWN_METHOD, "Unsupported menu method: %s", method);
  }
}

GVariant* menuGetProperty(GDBusConnection*, const gchar*, const gchar*,
                          const gchar*, const gchar* name, GError** error,
                          gpointer)
{
  if(g_strcmp0(name, "Version") == 0){
    return g_variant_new_string("3");
  }
  if(g_strcmp0(name, "Status") == 0){
    return g_variant_new_string("normal");
  }
  g_set_error(error, G_DBUS_ERROR, G_DBUS_ERROR_UNKNOWN_PROPERTY,
              "No such property: %s", name);
  return nullptr;
}

gboolean menuSetProperty(GDBusConnection*, const gchar*, const gchar*,
                         const gchar*, const gchar*, GVariant*, GError** error,
                         gpointer)
{
  g_set_error(error, G_DBUS_ERROR, G_DBUS_ERROR_PROPERTY_READ_ONLY,
              "Menu properties are read-only");
  return false;
}

// g_bus_own_name completes asynchronously: polling until the bus shows
// us as owner (bounded -- a missing bus must not hang startup).
bool nameIsOwned(GDBusConnection* connection, const std::string& busName)
{
  GError* error = nullptr;
  GVariant* reply = g_dbus_connection_call_sync(
      connection, "org.freedesktop.DBus", "/org/freedesktop/DBus",
      "org.freedesktop.DBus", "GetNameOwner",
      g_variant_new("(s)", busName.c_str()), G_VARIANT_TYPE("(s)"),
      G_DBUS_CALL_FLAGS_NONE, 500, nullptr, &error);
  if(error){
    g_error_free(error);
  }
  if(!reply){
    return false;
  }
  g_variant_unref(reply);
  return true;
}

void registerWithWatcher(GDBusConnection* connection, const std::string& busName)
{
  // kde name is the standard; some hosts answer the freedesktop alias.
  // Either may be absent (stock GNOME) -- all failures are best-effort.
  const char* watchers[2] = {
      "org.kde.StatusNotifierWatcher", "org.freedesktop.StatusNotifierWatcher"};
  for(const char* watcher : watchers){
    GError* error = nullptr;
    GVariant* reply = g_dbus_connection_call_sync(
        connection, watcher, "/StatusNotifierWatcher",
        "org.kde.StatusNotifierWatcher", "RegisterStatusNotifierItem",
        g_variant_new("(s)", busName.c_str()), nullptr,
        G_DBUS_CALL_FLAGS_NONE, 2000, nullptr, &error);
    if(reply){
      g_variant_unref(reply);
    }
    if(error){
      g_error_free(error);
    }
  }
}

} // namespace

GVariant* TrayIcon::menuLayoutForTest(bool webUiBound, Aurora::Runtime::HostState state,
                                      bool hasError)
{
  return buildMenuLayout(webUiBound,
      Aurora::Runtime::trayPauseItemLabel(state, hasError, webUiBound));
}

namespace
{
gboolean emitLayoutUpdated(gpointer data)
{
  auto* state = static_cast<BusState*>(data);
  if(state->connection){
    g_dbus_connection_emit_signal(state->connection, nullptr, kMenuPath,
        "com.canonical.dbusmenu", "LayoutUpdated",
        g_variant_new("(ui)", ++state->revision, 0), nullptr);
  }
  return G_SOURCE_REMOVE;
}
} // namespace



struct TrayIcon::Worker
{
  BusState state;
  std::thread thread;
  std::promise<GMainLoop*> ready;
  // Retrieved BEFORE ready is moved into the worker thread -- the
  // destructor must never touch the moved-from promise (get_future()
  // on it throws future_error, terminating the process on shutdown).
  std::future<GMainLoop*> readyFuture;
};

void TrayIcon::refresh()
{
  GMainContext* context = m_worker ? m_worker->state.loopContext.load() : nullptr;
  if(context){
    g_main_context_invoke(context, emitLayoutUpdated, &m_worker->state);
  }
}


void runTrayWorker(BusState* state, std::promise<GMainLoop*> done)
{
  GMainLoop* loop = nullptr;
  GDBusConnection* connection = nullptr;
  GDBusNodeInfo* sniInfo = nullptr;
  GDBusNodeInfo* menuInfo = nullptr;
  guint itemReg = 0;
  guint menuReg = 0;
  guint owner = 0;
  GMainContext* context = g_main_context_new();
  g_main_context_push_thread_default(context);
  do {
    GError* error = nullptr;
    connection = g_bus_get_sync(G_BUS_TYPE_SESSION, nullptr, &error);
    if(!connection){
      std::cerr << "Tray: no session bus -- running without icon\n";
      if(error){ g_error_free(error); }
      break;
    }
    state->connection = connection;
    sniInfo = g_dbus_node_info_new_for_xml(kSniXml, &error);
    menuInfo = sniInfo ? g_dbus_node_info_new_for_xml(kMenuXml, &error) : nullptr;
    if(!menuInfo){
      std::cerr << "Tray: bad interface XML -- running without icon\n";
      if(error){ g_error_free(error); }
      break;
    }
    static const GDBusInterfaceVTable sniVtable{sniMethod, sniGetProperty, sniSetProperty, {0, 0, 0}};
    static const GDBusInterfaceVTable menuVtable{menuMethod, menuGetProperty, menuSetProperty, {0, 0, 0}};
    itemReg = g_dbus_connection_register_object(connection, kItemPath,
        sniInfo->interfaces[0], &sniVtable, state, nullptr, &error);
    menuReg = itemReg ? g_dbus_connection_register_object(connection, kMenuPath,
        menuInfo->interfaces[0], &menuVtable, state, nullptr, &error) : 0;
    if(!menuReg){
      std::cerr << "Tray: object registration failed -- running without icon\n";
      if(error){ g_error_free(error); }
      break;
    }
    const std::string busName =
        std::string(kBusNamePrefix) + std::to_string(getpid()) + "-1";
    owner = g_bus_own_name(G_BUS_TYPE_SESSION, busName.c_str(),
        G_BUS_NAME_OWNER_FLAGS_NONE, nullptr, nullptr, nullptr, nullptr, nullptr);
    // Registering before acquisition completes is a race the icon
    // sometimes loses with no retry -- wait (bounded) until owned.
    // g_bus_own_name completes asynchronously on this thread's context,
    // which isn't running yet: pump it each pass or the reply can never
    // arrive while we poll (poll+sleep alone always times out).
    bool owned = false;
    for(int i = 0; i < 40 && !owned; ++i){
      g_main_context_iteration(context, FALSE);
      owned = nameIsOwned(connection, busName);
      if(!owned){
        g_usleep(50 * 1000);
      }
    }
    if(owned){
      registerWithWatcher(connection, busName);
    }
    else{
      std::cerr << "Tray: bus name never acquired -- running without icon\n";
    }
    loop = g_main_loop_new(context, FALSE);
    state->loopContext = context;
  } while(false);
  done.set_value(loop);
  if(loop){
    g_main_loop_run(loop);
    if(itemReg){ g_dbus_connection_unregister_object(connection, itemReg); }
    if(menuReg){ g_dbus_connection_unregister_object(connection, menuReg); }
    if(owner){ g_bus_unown_name(owner); }
    g_main_loop_unref(loop);
  }
  if(sniInfo){ g_dbus_node_info_unref(sniInfo); }
  if(menuInfo){ g_dbus_node_info_unref(menuInfo); }
  if(connection){ g_object_unref(connection); }
  g_main_context_pop_thread_default(context);
  g_main_context_unref(context);
}

TrayIcon::TrayIcon(std::string url, bool webUiBound,
                   std::function<void()> onLaunch, std::function<void()> onStop,
                   std::function<void()> onTogglePause,
                   std::function<Aurora::Runtime::HostStatus()> hostStatus)
  : m_url(std::move(url)),
    m_webUiBound(webUiBound),
    m_onLaunch(std::move(onLaunch)),
    m_onStop(std::move(onStop)),
    m_onTogglePause(std::move(onTogglePause)),
    m_hostStatus(std::move(hostStatus)),
    m_worker(new Worker())
{
  m_worker->state.url = m_url;
  m_worker->state.webUiBound = m_webUiBound;
  m_worker->state.onLaunch = m_onLaunch;
  m_worker->state.onStop = m_onStop;
  m_worker->state.onTogglePause = m_onTogglePause;
  m_worker->state.hostStatus = m_hostStatus;
  m_worker->readyFuture = m_worker->ready.get_future();
  m_worker->thread = std::thread(runTrayWorker, &m_worker->state,
                                 std::move(m_worker->ready));
}

TrayIcon::~TrayIcon()
{
  if(!m_worker){
    return;
  }
  GMainLoop* loop = m_worker->readyFuture.get();
  if(loop){
    g_main_loop_quit(loop);
  }
  if(m_worker->thread.joinable()){
    m_worker->thread.join();
  }
  delete m_worker;
}

} // namespace Aurora::App

