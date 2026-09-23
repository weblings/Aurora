#include <catch2/catch_test_macros.hpp>

#include <gio/gio.h>

#include <Aurora/App/TrayIcon.hpp>

using namespace Aurora::App;


// The static dbusmenu layout (root id 0; Launch UI id 1; Stop id 2) is pure
// GVariant construction -- fully testable without a session bus or host.
namespace
{

// (id, {key: value}) out of a (ia{sv}av) item.
gint32 itemId(GVariant* item)
{
  gint32 id = -1;
  g_variant_get(item, "(ia{sv}av)", &id, nullptr, nullptr);
  return id;
}

// Children arrive boxed (av): unbox each before navigating the struct.
GVariant* unboxChild(GVariant* children, gsize i)
{
  GVariant* box = g_variant_get_child_value(children, i);
  GVariant* child = g_variant_get_variant(box);
  g_variant_unref(box);
  return child;
}

bool itemFlag(GVariant* layout, gint32 wantId, const char* key)
{
  GVariant* children = g_variant_get_child_value(layout, 2);
  const gsize n = g_variant_n_children(children);
  bool found = false;
  for(gsize i = 0; i < n && !found; ++i){
    GVariant* child = unboxChild(children, i);
    if(itemId(child) == wantId){
      GVariant* props = g_variant_get_child_value(child, 1);
      // lookup_value matches the *inner* type and returns it unboxed.
      GVariant* value = g_variant_lookup_value(props, key, G_VARIANT_TYPE_BOOLEAN);
      found = value && g_variant_get_boolean(value);
      if(value){
        g_variant_unref(value);
      }
      g_variant_unref(props);
    }
    g_variant_unref(child);
  }
  g_variant_unref(children);
  return found;
}

std::string itemLabel(GVariant* layout, gint32 wantId)
{
  GVariant* children = g_variant_get_child_value(layout, 2);
  const gsize n = g_variant_n_children(children);
  std::string label;
  for(gsize i = 0; i < n && label.empty(); ++i){
    GVariant* child = unboxChild(children, i);
    if(itemId(child) == wantId){
      GVariant* props = g_variant_get_child_value(child, 1);
      GVariant* value = g_variant_lookup_value(props, "label", G_VARIANT_TYPE_STRING);
      if(value){
        label = g_variant_get_string(value, nullptr);
        g_variant_unref(value);
      }
      g_variant_unref(props);
    }
    g_variant_unref(child);
  }
  g_variant_unref(children);
  return label;
}

} // namespace


TEST_CASE("menu layout has Launch UI and Stop", "[traymenu]")
{
  GVariant* layout = TrayIcon::menuLayoutForTest(true);
  REQUIRE(itemId(layout) == 0);
  GVariant* children = g_variant_get_child_value(layout, 2);
  REQUIRE(g_variant_n_children(children) == 2);
  g_variant_unref(children);
  REQUIRE(itemLabel(layout, 1) == "Launch UI");
  REQUIRE(itemLabel(layout, 2) == "Stop");
  g_variant_unref(layout);
}

TEST_CASE("TrayIcon constructs and destroys without terminating", "[tray]")
{
  // Regression: ~TrayIcon called get_future() on the already-moved
  // promise, throwing future_error (no associated state) out of the
  // noexcept destructor -- terminating the process on every shutdown.
  // There is nothing to CHECK: pre-fix, this case aborts the runner.
  {
    TrayIcon icon("http://127.0.0.1:9/", true, [](){}, [](){});
  }
  SUCCEED();
}

TEST_CASE("Launch UI enabled tracks WebUI bound state", "[traymenu]")
{
  GVariant* bound = TrayIcon::menuLayoutForTest(true);
  REQUIRE(itemFlag(bound, 1, "enabled"));
  REQUIRE(itemFlag(bound, 2, "enabled"));
  g_variant_unref(bound);
  GVariant* unbound = TrayIcon::menuLayoutForTest(false);
  REQUIRE(!itemFlag(unbound, 1, "enabled"));
  REQUIRE(itemFlag(unbound, 2, "enabled"));
  g_variant_unref(unbound);
}
