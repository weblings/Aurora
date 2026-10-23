#pragma once

#include "McpServer.hpp"

#include <functional>
#include <ostream>
#include <string>

namespace Aurora::Mcp
{
  // `aurora-mcp --pair`: asks Aurora for a token at `scope` (read, draft or apply) and
  // waits for approval in the WebUI. Token alone to `out`, prompts to `log`. Exit code.
  int pair(const Fetch& fetch, const std::string& name, const std::string& scope,
    std::ostream& out, std::ostream& log, const std::function<void()>& wait);

  // Loopback callers get full access without a token, so pairing there is pointless.
  bool isLoopbackUrl(const std::string& url);
}
