#pragma once

// Shared numeric IDs for the Windows app (Aurora-05r tray work and beyond).
// Included by app.rc (resource compiler) and main.cpp (tray icon load).
// Values, not names, are the ABI with the compiled .res -- never renumber.
#define IDI_ICON1 101
#define WM_TRAYICON (WM_APP + 1)
