#pragma once

#include <cstddef>
#include <memory>
#include <string>
#include <vector>

#include <Aurora/Output/Hue/Channel.hpp>
#include <Aurora/Output/Hue/Credentials.hpp>
#include <Aurora/Output/Hue/DtlsClient.hpp>
#include <Aurora/Output/Hue/HuestreamHeader.hpp>

// Wraps DTLS delivery of the HueStream v2 binary protocol. Ported from
// huenicorn's Stream::Streamer -- see docs/HueOutputAnalysis.md.
namespace Aurora::Output::Hue
{
  // Pure: header bytes followed by one HuestreamPayload per channel --
  // testable without a live connection.
  std::vector<std::byte> buildStreamRequest(
    const HuestreamHeader& header,
    const ChannelStreams& channels
  );


  class Streamer
  {
  public:
    Streamer(const Credentials& credentials, const std::string& bridgeAddress);

    void setEntertainmentConfigurationId(const std::string& entertainmentConfigurationId);
    void streamChannels(const ChannelStreams& channels);

    bool isConnected() const;

  private:
    std::unique_ptr<DtlsClient> m_dtlsClient;
    HuestreamHeader m_header;
  };
}
