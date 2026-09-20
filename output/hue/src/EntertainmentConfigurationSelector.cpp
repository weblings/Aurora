#include <Aurora/Output/Hue/EntertainmentConfigurationSelector.hpp>

#include <Aurora/Output/Hue/ApiTools.hpp>

namespace Aurora::Output::Hue
{
  EntertainmentConfigurationSelector::EntertainmentConfigurationSelector(
    const Credentials& credentials,
    const std::string& bridgeAddress
  ):
  m_credentials(credentials),
  m_bridgeAddress(bridgeAddress),
  // Fixed in the port: huenicorn computed this iterator from the empty
  // default-constructed map via an in-class default member initializer,
  // then reassigned the map's contents afterward in the constructor body --
  // reassigning a std::unordered_map invalidates all its iterators,
  // including end(), so that iterator was left dangling by the standard's
  // rules even though it happened to keep working on libstdc++. Loading the
  // map in this same initializer list (member init runs in declaration
  // order) means m_entertainmentConfigurations already holds its final
  // contents by the time end() is taken here.
  m_entertainmentConfigurations(ApiTools::loadEntertainmentConfigurations(credentials.username(), bridgeAddress)),
  m_currentEntertainmentConfiguration(m_entertainmentConfigurations.end())
  {}


  std::optional<std::string> EntertainmentConfigurationSelector::currentEntertainmentConfigurationId() const
  {
    if(!validSelection()){
      return std::nullopt;
    }

    return m_currentEntertainmentConfiguration->first;
  }


  const EntertainmentConfiguration& EntertainmentConfigurationSelector::currentEntertainmentConfiguration() const
  {
    return m_currentEntertainmentConfiguration->second;
  }


  const EntertainmentConfigurations& EntertainmentConfigurationSelector::entertainmentConfigurations() const
  {
    return m_entertainmentConfigurations;
  }


  bool EntertainmentConfigurationSelector::validSelection() const
  {
    return m_currentEntertainmentConfiguration != m_entertainmentConfigurations.end();
  }


  bool EntertainmentConfigurationSelector::selectEntertainmentConfiguration(
    const std::string& entertainmentConfigurationId
  )
  {
    if(m_entertainmentConfigurations.empty()){
      return false;
    }

    disableStreaming();

    if(entertainmentConfigurationId.empty()){
      m_currentEntertainmentConfiguration = m_entertainmentConfigurations.begin();
    }
    else{
      m_currentEntertainmentConfiguration = m_entertainmentConfigurations.find(entertainmentConfigurationId);

      if(m_currentEntertainmentConfiguration == m_entertainmentConfigurations.end()){
        return false;
      }
    }

    if(ApiTools::streamingActive(*m_currentEntertainmentConfiguration, m_credentials.username(), m_bridgeAddress)){
      disableStreaming();
    }

    ApiTools::setStreamingState(*m_currentEntertainmentConfiguration, m_credentials.username(), m_bridgeAddress, true);

    return true;
  }


  void EntertainmentConfigurationSelector::disableStreaming() const
  {
    if(m_currentEntertainmentConfiguration == m_entertainmentConfigurations.end()){
      return;
    }

    ApiTools::setStreamingState(*m_currentEntertainmentConfiguration, m_credentials.username(), m_bridgeAddress, false);
  }
}
