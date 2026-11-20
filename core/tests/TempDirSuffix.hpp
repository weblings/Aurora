#pragma once

#include <string>

#ifdef _WIN32
#include <process.h>
#else
#include <unistd.h>
#endif

// Per-process suffix so parallel ctest processes never share a temp dir path.
inline std::string tempDirSuffix()
{
#ifdef _WIN32
  return "-" + std::to_string(_getpid());
#else
  return "-" + std::to_string(getpid());
#endif
}
