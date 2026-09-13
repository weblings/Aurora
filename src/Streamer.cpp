#include <Aurora/Output/Hue/Streamer.hpp>

#include <cstring>

#include <Aurora/Output/Hue/HuestreamPayload.hpp>

namespace Aurora::Output::Hue
{
  std::vector<std::byte> buildStreamRequest(
    const HuestreamHeader& header,
    const ChannelStreams& channels
  )
  {
    std::vector<std::byte> buffer(sizeof(HuestreamHeader));
    std::memcpy(buffer.data(), &header, sizeof(HuestreamHeader));

    for(const auto& channel : channels){
      HuestreamPayload payload{};
      payload.setChannelId(static_cast<char>(channel.id));
      payload.setR(static_cast<uint16_t>(0xffff * channel.r));
      payload.setG(static_cast<uint16_t>(0xffff * channel.g));
      payload.setB(static_cast<uint16_t>(0xffff * channel.b));

      size_t offset = buffer.size();
      buffer.resize(offset + sizeof(HuestreamPayload));
      std::memcpy(buffer.data() + offset, &payload, sizeof(HuestreamPayload));
    }

    return buffer;
  }


  Streamer::Streamer(
    const Credentials& credentials,
    const std::string& bridgeAddress
  )
  {
    m_dtlsClient = std::make_unique<DtlsClient>(DtlsConfig{
      .credentials = credentials,
      .address = bridgeAddress,
      .port = "2100",
      .hostname = "Hue",
      .handshakeAttempts = 4
    });

    try{
      m_dtlsClient->init();
    }
    catch(const std::exception&){
      // Swallowed deliberately, matching huenicorn: connection failure is
      // observable via isConnected(), caller decides whether to retry.
    }
  }


  void Streamer::setEntertainmentConfigurationId(
    const std::string& entertainmentConfigurationId
  )
  {
    m_header.setEntertainmentConfigurationId(entertainmentConfigurationId);
  }


  void Streamer::streamChannels(
    const ChannelStreams& channels
  )
  {
    auto buffer = buildStreamRequest(m_header, channels);
    m_dtlsClient->send(buffer);
    m_header.sequenceId++;
  }


  bool Streamer::isConnected() const
  {
    return m_dtlsClient && m_dtlsClient->isConnected();
  }
}
