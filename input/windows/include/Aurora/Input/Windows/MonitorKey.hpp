#pragma once

#include <string>
#include <vector>

// Pure string work for WindowsGrabber's monitor keys, apart from <windows.h>
// so it is testable on its own (same split as ScRgbConversion.hpp).
namespace Aurora::Input::Windows
{
  // Registry key under HKLM that holds a monitor's "EDID" value, from the
  // monitorDevicePath that DisplayConfig reports:
  //   \\?\DISPLAY#DELA0B9#5&1ca565dc&0&UID4358#{guid}
  //   -> SYSTEM\CurrentControlSet\Enum\DISPLAY\DELA0B9\5&1ca565dc&0&UID4358\Device Parameters
  // Empty when the path is not in that shape.
  inline std::string edidRegistryKey(const std::string& devicePath)
  {
    std::string rest = devicePath;
    if(rest.rfind("\\\\?\\", 0) == 0){
      rest.erase(0, 4);
    }

    std::vector<std::string> parts;
    std::size_t start = 0;
    for(std::size_t i = 0; i <= rest.size(); ++i){
      if(i == rest.size() || rest[i] == '#'){
        parts.push_back(rest.substr(start, i - start));
        start = i + 1;
      }
    }

    if(parts.size() < 3 || parts[0] != "DISPLAY" || parts[1].empty() || parts[2].empty()){
      return {};
    }
    return "SYSTEM\\CurrentControlSet\\Enum\\DISPLAY\\" + parts[1] + "\\" + parts[2] + "\\Device Parameters";
  }
}
