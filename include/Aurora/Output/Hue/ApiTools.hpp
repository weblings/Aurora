#pragma once

#include <optional>
#include <string>
#include <unordered_map>
#include <unordered_set>

#include <glm/vec2.hpp>
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

    // Test Pulse: just enough of a light's current state to restore it
    // after a brief magenta flash. Entertainment-config membership
    // requires a full-color light, so on/dimming/color are always
    // expected to be present.
    struct LightSnapshot
    {
      bool on{true};
      float brightness{100.f};
      glm::vec2 xy{0.f, 0.f};
    };

    // A /clip/v2/resource/light/{id} response's on/brightness/xy state.
    LightSnapshot parseLightSnapshot(const nlohmann::json& jsonLightResponse);

    // The PUT body to set a light's on/brightness/color/transition-time.
    nlohmann::json lightPutBody(bool on, float brightness, const glm::vec2& xy, int durationMs);

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

    // One-shot REST visual check, not the entertainment/DTLS streaming path
    // HueOutput/Streamer use: GETs each light's current state, PUTs it to
    // magenta briefly, then PUTs it back -- lets a user see which physical
    // bulbs are in an entertainment config's channels before any Pipeline
    // exists to stream through.
    void testPulse(
      const MembersIds& lightIds,
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
