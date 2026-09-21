#pragma once

#include <filesystem>
#include <optional>
#include <string>

// StandaloneApps P1: probe order for the WebUI static files --
// AURORA_WEBUI_DIR env override > baked source dir (dev hot-edit) >
// embedded webroot. Returns a directory for serveStaticFiles(), or nullopt
// to serve the embedded map via serveEmbeddedFiles(). Header-only so the
// app test suite can cover the order without starting a server.
namespace Aurora::App
{
  inline std::optional<std::filesystem::path> resolveWebRoot(
    const char* envOverride,
    const std::string& bakedSourceDir
  )
  {
    if(envOverride && std::filesystem::is_directory(envOverride)){
      return std::filesystem::path(envOverride);
    }

    if(std::filesystem::is_directory(bakedSourceDir)){
      return std::filesystem::path(bakedSourceDir);
    }

    return std::nullopt;
  }
}
