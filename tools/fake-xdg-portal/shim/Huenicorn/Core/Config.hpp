#pragma once
// Stand-in for huenicorn's Config.hpp, found first on the include path: the
// portal only touches the restore token, and the real header drags in nlohmann/json.

#include <optional>
#include <string>


namespace Huenicorn::Core
{
  class Config
  {
  public:
    const std::optional<std::string>& restoreToken() const { return m_restoreToken; }
    void setRestoreToken(const std::string& restoreToken) { m_restoreToken = restoreToken; }

  private:
    std::optional<std::string> m_restoreToken;
  };
}
