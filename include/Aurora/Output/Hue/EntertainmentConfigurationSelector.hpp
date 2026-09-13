#pragma once

#include <optional>
#include <string>

#include <Aurora/Output/Hue/Credentials.hpp>
#include <Aurora/Output/Hue/EntertainmentConfiguration.hpp>

// Orchestrates ApiTools calls to load and select/activate an entertainment
// configuration. Ported from huenicorn's Hue::Api::EntertainmentConfigurationSelector.
namespace Aurora::Output::Hue
{
  class EntertainmentConfigurationSelector
  {
  public:
    EntertainmentConfigurationSelector(
      const Credentials& credentials,
      const std::string& bridgeAddress
    );

    std::optional<std::string> currentEntertainmentConfigurationId() const;
    const EntertainmentConfiguration& currentEntertainmentConfiguration() const;
    const EntertainmentConfigurations& entertainmentConfigurations() const;
    bool validSelection() const;

    // Empty id falls back to the first available configuration.
    bool selectEntertainmentConfiguration(
      const std::string& entertainmentConfigurationId
    );

    void disableStreaming() const;

  private:
    Credentials m_credentials;
    std::string m_bridgeAddress;

    // Declaration order matters: m_currentEntertainmentConfiguration's
    // constructor-init-list initializer reads m_entertainmentConfigurations,
    // so it must be declared after it (members init in declaration order).
    EntertainmentConfigurations m_entertainmentConfigurations;
    EntertainmentConfigurationsIterator m_currentEntertainmentConfiguration;
  };
}
