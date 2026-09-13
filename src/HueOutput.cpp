#include <Aurora/Output/Hue/HueOutput.hpp>

#include <glm/exponential.hpp>

#include <Aurora/Output/Hue/Colorimetry.hpp>

namespace Aurora::Output::Hue
{
  ChannelStream toChannelStream(const Contracts::Zone& zone)
  {
    glm::vec3 xyb = toXYB(zone.color);
    xyb.z = glm::pow(xyb.z, gammaExponent(zone.gamma));

    return ChannelStream{zone.id, xyb.x, xyb.y, xyb.z};
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
    static const std::string s_name = "Hue";
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
