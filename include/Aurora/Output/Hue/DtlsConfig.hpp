#pragma once

#include <string>

#include <Aurora/Output/Hue/Credentials.hpp>

namespace Aurora::Output::Hue
{
  struct DtlsConfig
  {
    const Credentials credentials;
    const std::string address;
    const std::string port;
    const std::string hostname;
    const unsigned handshakeAttempts;
  };
}
