#!/usr/bin/env python3
"""Fake org.freedesktop.portal.ScreenCast for offline portal failure-path tests.

Owns org.freedesktop.portal.Desktop on the session bus -- run it only on a
private bus (dbus-run-session, see run.sh) so the real portal is untouched.
MODE picks which step denies (Response code 1) or fails (D-Bus error).
"""

import argparse
import os
import sys

import gi

gi.require_version("Gio", "2.0")
from gi.repository import Gio, GLib  # noqa: E402

BUS_NAME = "org.freedesktop.portal.Desktop"
OBJECT_PATH = "/org/freedesktop/portal/desktop"
REQUEST_IFACE = "org.freedesktop.portal.Request"

MODES = [
    "ok",
    "deny-create", "deny-select", "deny-start",
    "error-create", "error-select", "error-start", "error-open-remote",
]

INTROSPECTION = """
<node>
  <interface name="org.freedesktop.portal.ScreenCast">
    <method name="CreateSession">
      <arg type="a{sv}" name="options" direction="in"/>
      <arg type="o" name="handle" direction="out"/>
    </method>
    <method name="SelectSources">
      <arg type="o" name="session_handle" direction="in"/>
      <arg type="a{sv}" name="options" direction="in"/>
      <arg type="o" name="handle" direction="out"/>
    </method>
    <method name="Start">
      <arg type="o" name="session_handle" direction="in"/>
      <arg type="s" name="parent_window" direction="in"/>
      <arg type="a{sv}" name="options" direction="in"/>
      <arg type="o" name="handle" direction="out"/>
    </method>
    <method name="OpenPipeWireRemote">
      <arg type="o" name="session_handle" direction="in"/>
      <arg type="a{sv}" name="options" direction="in"/>
      <arg type="h" name="fd" direction="out"/>
    </method>
    <property name="AvailableSourceTypes" type="u" access="read"/>
    <property name="AvailableCursorModes" type="u" access="read"/>
    <property name="version" type="u" access="read"/>
  </interface>
</node>
"""

PROPERTIES = {"AvailableSourceTypes": 1, "AvailableCursorModes": 7, "version": 4}

# method -> (deny mode, error mode); OpenPipeWireRemote has no Response to deny
STEPS = {
    "CreateSession": ("deny-create", "error-create"),
    "SelectSources": ("deny-select", "error-select"),
    "Start": ("deny-start", "error-start"),
    "OpenPipeWireRemote": (None, "error-open-remote"),
}


def log(*args):
    print("[fake-portal]", *args, file=sys.stderr, flush=True)


def handle_path(kind, sender, token):
    # Spec: /org/freedesktop/portal/desktop/<kind>/<sender minus ':' with '.'->'_'>/<token>
    return f"{OBJECT_PATH}/{kind}/{sender[1:].replace('.', '_')}/{token}"


def make_handler(mode):
    def on_call(connection, sender, path, iface, method, params, invocation):
        deny_mode, error_mode = STEPS[method]
        log(f"{method} from {sender} (mode {mode})")

        if mode == error_mode:
            invocation.return_dbus_error("org.freedesktop.portal.Error.Failed",
                                         f"fake portal: {method} failed")
            return

        if method == "OpenPipeWireRemote":
            read_fd, write_fd = os.pipe()  # any fd will do; the driver only receives it
            fds = Gio.UnixFDList.new()
            index = fds.append(read_fd)
            os.close(read_fd)
            os.close(write_fd)
            invocation.return_value_with_unix_fd_list(GLib.Variant("(h)", (index,)), fds)
            return

        options = params.unpack()[-1]
        request = handle_path("request", sender, options["handle_token"])
        invocation.return_value(GLib.Variant("(o)", (request,)))

        code = 1 if mode == deny_mode else 0
        results = {}
        if code == 0 and method == "CreateSession":
            session = handle_path("session", sender, options["session_handle_token"])
            results["session_handle"] = GLib.Variant("s", session)
        elif code == 0 and method == "Start":
            results["streams"] = GLib.Variant("a(ua{sv})", [(42, {})])

        # Emit after the reply: the client subscribes to Response before calling
        def emit():
            connection.emit_signal(sender, request, REQUEST_IFACE, "Response",
                                   GLib.Variant("(ua{sv})", (code, results)))
            log(f"{method} Response({code})")
            return GLib.SOURCE_REMOVE

        GLib.idle_add(emit)

    return on_call


def on_get_property(connection, sender, path, iface, name):
    return GLib.Variant("u", PROPERTIES[name])


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("mode", choices=MODES)
    args = parser.parse_args()

    loop = GLib.MainLoop()
    iface = Gio.DBusNodeInfo.new_for_xml(INTROSPECTION).interfaces[0]

    def on_bus(connection, name):
        connection.register_object(OBJECT_PATH, iface, make_handler(args.mode),
                                   on_get_property, None)

    def on_name_lost(connection, name):
        log(f"could not own {BUS_NAME} (is this a private bus?)")
        loop.quit()

    Gio.bus_own_name(Gio.BusType.SESSION, BUS_NAME, Gio.BusNameOwnerFlags.NONE,
                     on_bus, lambda *_: log(f"owns {BUS_NAME}, mode {args.mode}"),
                     on_name_lost)
    loop.run()


if __name__ == "__main__":
    main()
