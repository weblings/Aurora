#pragma once

#include <string>
#include <vector>

// Hue bridge user auth data -- trimmed from huenicorn's version (no JSON
// serializer hook; Aurora::Serialization doesn't exist in this repo's scope).
namespace Aurora::Output::Hue
{
  class Credentials
  {
  public:
    Credentials() = default;

    Credentials(
      const std::string& username,
      const std::string& clientkey
    );

    const std::string& username() const;
    const std::string& clientkey() const;

    std::vector<unsigned char> usernameBytes() const;

    // Throws std::runtime_error if clientkey() has an odd number of hex digits.
    std::vector<unsigned char> clientkeyBytes() const;

  private:
    std::string m_username;
    std::string m_clientkey;
  };
}
