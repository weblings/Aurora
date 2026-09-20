#include <Aurora/Output/Hue/HueOutput.hpp>

#include <glm/exponential.hpp>

namespace Aurora::Output::Hue
{
  // RGB mode, matching huenicorn's actual live behavior -- not the XYB
  // conversion Colorimetry.cpp offers (huenicorn has that code too, but
  // never calls it; see docs/lessons). Gamma applies to all three
  // channels together, same as huenicorn's Channel::gammaExponent() use.
  ChannelStream toChannelStream(const Contracts::Zone& zone)
  {
    glm::vec3 corrected = glm::pow(zone.color.toNormalized(), glm::vec3(gammaExponent(zone.gamma)));

    return ChannelStream{zone.id, corrected.r, corrected.g, corrected.b};
  }


  std::vector<uint8_t> justDeactivatedZoneIds(
    const std::vector<uint8_t>& currentIds,
    const std::unordered_set<uint8_t>& previousIds
  )
  {
    std::unordered_set<uint8_t> currentSet(currentIds.begin(), currentIds.end());

    std::vector<uint8_t> dropped;
    for(uint8_t id : previousIds){
      if(currentSet.count(id) == 0){
        dropped.push_back(id);
      }
    }

    return dropped;
  }


  HueOutput::HueOutput(
    Credentials credentials,
    std::string bridgeAddress,
    std::string entertainmentConfigurationId
  ):
  m_credentials(std::move(credentials)),
  m_bridgeAddress(std::move(bridgeAddress)),
  m_entertainmentConfigurationId(std::move(entertainmentConfigurationId))
  {}


  const std::string& HueOutput::name() const
  {
    // Lowercase: matches the "hue" registry key and profiles/hue.json --
    // Runtime derives the saved zone-map filename directly from this.
    static const std::string s_name = "hue";
    return s_name;
  }


  void HueOutput::init()
  {
    m_selector = std::make_unique<EntertainmentConfigurationSelector>(m_credentials, m_bridgeAddress);
    m_selector->selectEntertainmentConfiguration(m_entertainmentConfigurationId);

    m_streamer = std::make_unique<Streamer>(m_credentials, m_bridgeAddress);

    if(m_selector->validSelection()){
      m_streamer->setEntertainmentConfigurationId(*m_selector->currentEntertainmentConfigurationId());
    }
  }


  bool HueOutput::isConnected() const
  {
    return m_streamer && m_streamer->isConnected();
  }


  void HueOutput::shutdown(bool isReplacement)
  {
    // A reload builds the replacement fully (including its own streaming
    // start) before this ever runs -- disableStreaming() here would send an
    // authoritative bridge-side stop for whatever entertainment config this
    // instance used, even when a same-config replacement already started.
    // The bridge accepts that stop with no error, silently killing the new
    // stream while every local signal (isConnected(), frames still being
    // computed) keeps looking healthy. Confirmed live, not theoretical --
    // see WebUI/WebUI_Fixes.md's video<->audio live-switch bug. Only a real
    // app exit (isReplacement == false) should actually tell the bridge to
    // stop; a replaced-away session times out on its own once this
    // instance's DTLS socket closes below, which is an acceptable cost for
    // the (rare) case the replacement targets a different config entirely.
    if(m_selector && !isReplacement){
      m_selector->disableStreaming();
    }

    m_streamer.reset();
  }


  std::vector<uint8_t> HueOutput::zoneIds() const
  {
    std::vector<uint8_t> ids;

    if(m_selector && m_selector->validSelection()){
      for(const auto& [id, channel] : m_selector->currentEntertainmentConfiguration().channels){
        ids.push_back(id);
      }
    }

    return ids;
  }


  void HueOutput::send(const Contracts::Frame& frame)
  {
    if(!m_streamer){
      return;
    }

    ChannelStreams channelStreams;
    std::vector<uint8_t> currentIds;

    for(const auto& zone : frame){
      currentIds.push_back(zone.id);
      channelStreams.push_back(toChannelStream(zone));
    }

    for(uint8_t droppedId : justDeactivatedZoneIds(currentIds, m_previouslyActiveZoneIds)){
      channelStreams.push_back(toChannelStream(Contracts::Zone{droppedId, Contracts::Color(0, 0, 0), 0.f}));
    }

    m_previouslyActiveZoneIds = std::unordered_set<uint8_t>(currentIds.begin(), currentIds.end());

    m_streamer->streamChannels(channelStreams);
  }
}
