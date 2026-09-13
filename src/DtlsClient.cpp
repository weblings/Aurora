#include <Aurora/Output/Hue/DtlsClient.hpp>

#include "MbedTlsImpl.hpp"

namespace Aurora::Output::Hue
{
  DtlsClient::DtlsClient(const DtlsConfig& dtlsConfig):
  m_dtlsConfig(dtlsConfig)
  {}


  DtlsClient::~DtlsClient()
  {
    shutdown();
  }


  bool DtlsClient::isConnected() const
  {
    return m_impl && m_impl->isConnected();
  }


  void DtlsClient::init()
  {
    m_impl = std::make_unique<MbedTlsImpl>();
    m_impl->init(m_dtlsConfig);
  }


  void DtlsClient::shutdown()
  {
    m_impl.reset();
  }


  bool DtlsClient::send(
    std::span<const std::byte> requestBuffer
  )
  {
    if(!isConnected()){
      return false;
    }

    return m_impl->send(requestBuffer) >= 0;
  }
}
