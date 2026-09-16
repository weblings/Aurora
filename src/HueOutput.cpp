#include <Aurora/Output/Hue/HueOutput.hpp>

#include <iostream>

#include <glm/exponential.hpp>

namespace Aurora::Output::Hue
{
  // RGB mode, matching huenicorn's actual live behavior -- not the XYB
  // conversion Colorimetry.cpp offers (huenicorn has that code too, but
  // never calls it; see Analysis/lessons). Gamma applies to all three
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
    // TEMP DEBUG -- remove once the entertainment-config switch is confirmed
    // live (see WebUIManualTweaks.md).
    std::cout << "[hue-debug] init() requested entertainmentConfigurationId='"
              << m_entertainmentConfigurationId << "'\n";

    m_selector = std::make_unique<EntertainmentConfigurationSelector>(m_credentials, m_bridgeAddress);
    bool selected = m_selector->selectEntertainmentConfiguration(m_entertainmentConfigurationId);

    std::cout << "[hue-debug] selectEntertainmentConfiguration returned " << std::boolalpha << selected
              << ", validSelection=" << m_selector->validSelection() << "\n";
    for(const auto& [id, config] : m_selector->entertainmentConfigurations()){
      std::cout << "[hue-debug] available config id='" << id << "' name='" << config.name
                << "' channelCount=" << config.channels.size() << "\n";
    }

    m_streamer = std::make_unique<Streamer>(m_credentials, m_bridgeAddress);

    if(m_selector->validSelection()){
      m_streamer->setEntertainmentConfigurationId(*m_selector->currentEntertainmentConfigurationId());

      std::cout << "[hue-debug] selected config id='" << *m_selector->currentEntertainmentConfigurationId()
                << "', channel ids:";
      for(uint8_t id : zoneIds()){
        std::cout << " " << static_cast<int>(id);
      }
      std::cout << "\n";
    }
  }


  bool HueOutput::isConnected() const
  {
    return m_streamer && m_streamer->isConnected();
  }


  void HueOutput::shutdown()
  {
    if(m_selector){
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
