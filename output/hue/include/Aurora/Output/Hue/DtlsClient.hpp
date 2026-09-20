#pragma once

#include <memory>
#include <span>

#include <Aurora/Output/Hue/DtlsConfig.hpp>

// PSK-DTLS client for the Hue bridge's port-2100 entertainment stream.
// Ported from huenicorn's Stream::DtlsClient -- Mbed TLS backend only (see
// MbedTlsImpl.hpp in src/, kept out of the public include tree since
// nothing outside DtlsClient.cpp needs to see it).
namespace Aurora::Output::Hue
{
  class MbedTlsImpl;

  class DtlsClient
  {
  public:
    explicit DtlsClient(const DtlsConfig& dtlsConfig);
    ~DtlsClient();

    bool isConnected() const;

    // Throws std::runtime_error on handshake/setup failure.
    void init();
    void shutdown();

    bool send(std::span<const std::byte> data);

  private:
    DtlsConfig m_dtlsConfig;
    std::unique_ptr<MbedTlsImpl> m_impl;
  };
}
