#pragma once

#include <cstdint>

// Which CGDisplayReconfigurationCallback calls can change the set of monitors
// (Aurora-h06o). Pure bit logic with no CoreGraphics header, so it is testable
// on its own; DisplayReconfigurationTests.cpp pins every constant here to the
// real kCGDisplay*Flag value.
//
// Observed on macOS 27.2.1 with a virtual display (tools/mac/virtual-display-probe.m,
// also under Aurora's own TrayIcon::pump loop): a callback arrives per display
// with BeginConfiguration first (nothing has changed yet), then the result:
//   add    new display 0x111a Moved|SetMode|Add|Enabled|DesktopShapeChanged,
//          existing display 0x1000 DesktopShapeChanged
//   remove removed display 0x1220 Remove|Disabled|DesktopShapeChanged,
//          existing display 0x1000
// and the removed display's UUID is already gone, so the caller must
// re-enumerate and compare monitor identities, not look the display up.
namespace Aurora::Input::Mac
{
  namespace DisplayFlag
  {
    inline constexpr std::uint32_t BeginConfiguration = 1u << 0;
    inline constexpr std::uint32_t Moved = 1u << 1;
    inline constexpr std::uint32_t SetMain = 1u << 2;
    inline constexpr std::uint32_t SetMode = 1u << 3;
    inline constexpr std::uint32_t Add = 1u << 4;
    inline constexpr std::uint32_t Remove = 1u << 5;
    inline constexpr std::uint32_t Enabled = 1u << 8;
    inline constexpr std::uint32_t Disabled = 1u << 9;
    inline constexpr std::uint32_t Mirror = 1u << 10;
    inline constexpr std::uint32_t UnMirror = 1u << 11;
    inline constexpr std::uint32_t DesktopShapeChanged = 1u << 12;
  }

  // True when this callback may have added, removed, enabled, disabled or
  // (un)mirrored a display, so the monitor list should be re-read and its
  // identities compared. False for the BeginConfiguration pre-pass (nothing
  // changed yet; the final call follows) and for position, mode, primary and
  // desktop-shape changes alone, which never change which monitors exist.
  inline bool displayReconfigurationMayChangeMonitors(std::uint32_t flags)
  {
    if(flags & DisplayFlag::BeginConfiguration){
      return false;
    }

    constexpr std::uint32_t membership =
      DisplayFlag::Add | DisplayFlag::Remove | DisplayFlag::Enabled
      | DisplayFlag::Disabled | DisplayFlag::Mirror | DisplayFlag::UnMirror;
    return (flags & membership) != 0;
  }
}
