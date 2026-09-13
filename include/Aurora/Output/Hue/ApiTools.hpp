#pragma once

#include <optional>
#include <string>
#include <unordered_map>
#include <unordered_set>

#include <nlohmann/json.hpp>

#include <Aurora/Output/Hue/Device.hpp>
#include <Aurora/Output/Hue/EntertainmentConfiguration.hpp>
#include <Aurora/Output/Hue/HttpClient.hpp>

// Wrappers around the Hue bridge's CLIP v2 REST API. Ported from
// huenicorn's Hue::Api::ApiTools -- see Analysis/HueOutputAnalysis.md.
namespace Aurora::Output::Hue
{
  using MembersIds = std::unordered_set<std::string>;
  using ChannelsMembersIds = std::unordered_map<uint8_t, MembersIds>;
  using EntertainmentConfigurationsChannels = std::unordered_map<std::string, ChannelsMembersIds>;

  namespace ApiTools
  {
    // --- Pure JSON-shape parsing: testable with a canned fixture, no bridge needed ---

    // One entertainment_configuration entry's name + placeholder devices
    // (id only, name filled in later by a per-device fetch) + empty,
    // inactive Channel entries keyed by channel_id.
    EntertainmentConfiguration parseEntertainmentConfigurationShell(const nlohmann::json& jsonEntConf);

    // A /clip/v2/resource/light/{id} response's device display name.
    std::string parseLightName(const nlohmann::json& jsonLightResponse);

    // A /clip/v2/resource response, filtered to entertainment-capable devices.
    Devices parseDevicesFromResource(const nlohmann::json& jsonResource);

    // A /clip/v2/resource/entertainment_configuration response's per-config,
    // per-channel member device IDs.
    EntertainmentConfigurationsChannels parseEntertainmentConfigurationsChannels(const nlohmann::json& jsonEntConfs);

    // Devices whose id is present in membersIds.
    Devices matchDevices(const MembersIds& membersIds, const Devices& devices);

    // --- I/O: calls the bridge, needs a live connection to verify end-to-end ---

    EntertainmentConfigurations loadEntertainmentConfigurations(
      const std::string& username,
      const std::string& bridgeAddress
    );

    Devices loadDevices(
      const std::string& username,
      const std::string& bridgeAddress
    );

    EntertainmentConfigurationsChannels loadEntertainmentConfigurationsChannels(
      const std::string& username,
      const std::string& bridgeAddress
    );

    void setStreamingState(
      const EntertainmentConfigurationEntry& entertainmentConfigurationEntry,
      const std::string& username,
      const std::string& bridgeAddress,
      bool active
    );

    bool streamingActive(
      const EntertainmentConfigurationEntry& entertainmentConfigurationEntry,
      const std::string& username,
      const std::string& bridgeAddress
    );

    nlohmann::json autodetectedBridge();

    // deviceType identifies this app to the bridge during pairing (e.g.
    // "aurora#some-host") -- huenicorn derived this from the OS username via
    // a Platform abstraction Aurora doesn't have yet; callers supply it directly.
    std::optional<HttpResponse> registerNewUser(
      const std::string& bridgeAddress,
      const std::string& deviceType
    );
  }
}
