# 2026-09-23 — Tray bus-name race (Aurora-4wi)

## Symptom
Aurora running, no tray icon. Watcher's `RegisteredStatusNotifierItems`
listed only the two ayatana indicators; Aurora's
`org.kde.StatusNotifierItem-<pid>-1` existed on the bus (`IconName
"aurora"`, `Status "Active"`) but was never registered with the watcher.
Stderr: `Tray: bus name never acquired -- running without icon`.

## Diagnosis
Two layers. The known race (register-before-acquire, no retry) was already
patched with a bounded `GetNameOwner` wait -- which then *always* timed out.
Root cause: `g_bus_own_name` completes asynchronously by dispatching on the
worker thread's thread-default `GMainContext`, which nobody iterates until
`g_main_loop_run` starts after the wait. Poll + `g_usleep` can never observe
ownership; acquisition completed only after registration was skipped.

## Fix
Pump the context each wait pass (`g_main_context_iteration(context, FALSE)`
before the poll) in `app/linux/src/TrayIcon.cpp`. Lesson filed in
`docs/lessons/language-cpp.md` (async-GIO-needs-dispatch entry).

## Verification
Rebuilt clean, app/linux 65/65 green. Owner reinstalled + restarted:
icon renders in the top bar. Bead closed.
