#pragma once

#include <string>

namespace Aurora::Output::Hue
{
  constexpr auto HttpProtocol = "https://";

  // Strips a leading http(s):// and any trailing path/slash from a user-typed bridge address.
  std::string sanitizeBridgeAddress(
    const std::string& rawAddress
  );
}
