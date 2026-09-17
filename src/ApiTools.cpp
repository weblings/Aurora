#include <Aurora/Output/Hue/ApiTools.hpp>

#include <algorithm>
#include <chrono>
#include <thread>
#include <unordered_map>

#include <Aurora/Contracts/Color.hpp>
#include <Aurora/Output/Hue/BridgeAddress.hpp>
#include <Aurora/Output/Hue/Colorimetry.hpp>

namespace Aurora::Output::Hue
{
  namespace
  {
    constexpr int TestPulseDurationMs = 400;

    void putLight(
      const std::string& lightId,
      const nlohmann::json& body,
      const std::string& username,
      const std::string& bridgeAddress
    )
    {
      HttpHeaders headers = {{"hue-application-key", username}};
      std::string url = HttpProtocol + bridgeAddress + "/clip/v2/resource/light/" + lightId;
      sendHttpRequest(url, "PUT", body.dump(), headers);
    }
  }

  namespace ApiTools
  {
    // No longer reads jsonEntConf's own "light_services" -- confirmed against
    // a real bridge (WebUI_Fixes.md's Pass 2 section) that it's a flat,
    // whole-config light list with no per-channel breakdown, and its rids
    // live in the *light* id space, not the entertainment id space
    // channels[].members[].service.rid actually uses -- matchDevices() below
    // needs loadDevices()'s own entertainment-rid Devices for real matches,
    // not this. See loadEntertainmentConfigurations for the corrected wiring
    // (mirrors huenicorn's real Runtime.cpp: loadDevices +
    // loadEntertainmentConfigurationsChannels + matchDevices, not a
    // light_services-derived list).
    EntertainmentConfiguration parseEntertainmentConfigurationShell(const nlohmann::json& jsonEntConf)
    {
      EntertainmentConfiguration entConf;
      entConf.name = jsonEntConf.at("metadata").at("name").get<std::string>();

      for(const auto& jsonChannel : jsonEntConf.at("channels")){
        uint8_t channelId = jsonChannel.at("channel_id").get<uint8_t>();
        entConf.channels.emplace(channelId, Channel{false, {}, 0.f});
      }

      return entConf;
    }


    std::string parseLightName(const nlohmann::json& jsonLightResponse)
    {
      return jsonLightResponse.at("data").at(0).at("metadata").at("name").get<std::string>();
    }


    Devices parseDevicesFromResource(const nlohmann::json& jsonResource)
    {
      Devices devices;

      for(const auto& jsonData : jsonResource.at("data")){
        if(jsonData.at("type") != "device"){
          continue;
        }

        std::string entertainmentId;
        std::string lightId;
        for(const auto& service : jsonData.at("services")){
          std::string rtype = service.at("rtype").get<std::string>();
          if(rtype == "entertainment") entertainmentId = service.at("rid").get<std::string>();
          else if(rtype == "light") lightId = service.at("rid").get<std::string>();
        }

        // Not entertainment-capable -- excluded here just like before this
        // lightId addition (a plain light/sensor/etc with no entertainment
        // service can't be a channel member at all).
        if(entertainmentId.empty()){
          continue;
        }

        Device device;
        device.name = jsonData.at("metadata").at("name").get<std::string>();
        device.id = entertainmentId;
        device.lightId = lightId;
        devices.push_back(std::move(device));
      }

      return devices;
    }


    EntertainmentConfigurationsChannels parseEntertainmentConfigurationsChannels(const nlohmann::json& jsonEntConfs)
    {
      EntertainmentConfigurationsChannels entConfsChannels;

      for(const auto& entConf : jsonEntConfs.at("data")){
        std::string configurationId = entConf.at("id").get<std::string>();

        for(const auto& jsonChannel : entConf.at("channels")){
          uint8_t channelId = jsonChannel.at("channel_id").get<uint8_t>();

          for(const auto& jsonMember : jsonChannel.at("members")){
            std::string memberId = jsonMember.at("service").at("rid").get<std::string>();
            entConfsChannels[configurationId][channelId].insert(memberId);
          }
        }
      }

      return entConfsChannels;
    }


    Devices matchDevices(
      const MembersIds& membersIds,
      const Devices& devices
    )
    {
      Devices matchedDevices;
      std::copy_if(
        devices.begin(),
        devices.end(),
        std::back_inserter(matchedDevices),
        [&](const Device& d){
          return membersIds.count(d.id) > 0;
        }
      );

      return matchedDevices;
    }


    LightSnapshot parseLightSnapshot(const nlohmann::json& jsonLightResponse)
    {
      const auto& data = jsonLightResponse.at("data").at(0);

      LightSnapshot snapshot;
      snapshot.on = data.value("on", nlohmann::json::object()).value("on", true);
      snapshot.brightness = data.value("dimming", nlohmann::json::object()).value("brightness", 100.f);

      auto xy = data.value("color", nlohmann::json::object()).value("xy", nlohmann::json::object());
      snapshot.xy = {xy.value("x", 0.f), xy.value("y", 0.f)};

      return snapshot;
    }


    nlohmann::json lightPutBody(bool on, float brightness, const glm::vec2& xy, int durationMs)
    {
      return {
        {"on", {{"on", on}}},
        {"dimming", {{"brightness", brightness}}},
        {"color", {{"xy", {{"x", xy.x}, {"y", xy.y}}}}},
        {"dynamics", {{"duration", durationMs}}}
      };
    }


    EntertainmentConfigurations loadEntertainmentConfigurations(
      const std::string& username,
      const std::string& bridgeAddress
    )
    {
      EntertainmentConfigurations entConfs;

      HttpHeaders headers = {{"hue-application-key", username}};
      std::string url = HttpProtocol + bridgeAddress + "/clip/v2/resource/entertainment_configuration";
      auto response = sendHttpRequest(url, "GET", "", headers);

      if(!response.has_value()){
        return entConfs;
      }

      auto jsonEntConfs = response->asJson();

      // Per-config, per-channel member ids -- entertainment id space
      // (channels[].members[].service.rid), parsed once up front from the
      // same response already in hand.
      EntertainmentConfigurationsChannels channelsMembersIds = parseEntertainmentConfigurationsChannels(jsonEntConfs);

      // One bulk /clip/v2/resource fetch resolves every entertainment-rid to
      // its real device name (and light-rid) in a single request -- mirrors
      // huenicorn's own real Runtime.cpp wiring (loadDevices +
      // loadEntertainmentConfigurationsChannels + matchDevices). The
      // previous approach here matched channel members (entertainment id
      // space) against light_services-derived placeholders (light id
      // space) -- two different id spaces that don't actually overlap on a
      // real bridge, so channel.devices silently came back empty every
      // time; only caught via a live pass, not by this file's own unit
      // tests, whose fixtures happened to reuse the same strings for both
      // spaces. See WebUI_Fixes.md's Pass 2 section.
      Devices devices = loadDevices(username, bridgeAddress);

      for(const auto& jsonEntConf : jsonEntConfs.at("data")){
        std::string configurationId = jsonEntConf.at("id").get<std::string>();
        EntertainmentConfiguration entConf = parseEntertainmentConfigurationShell(jsonEntConf);

        auto channelsIt = channelsMembersIds.find(configurationId);
        if(channelsIt != channelsMembersIds.end()){
          for(auto& [channelId, channel] : entConf.channels){
            auto membersIt = channelsIt->second.find(channelId);
            if(membersIt != channelsIt->second.end()){
              channel.devices = matchDevices(membersIt->second, devices);
            }
          }
        }

        entConfs.emplace(configurationId, std::move(entConf));
      }

      return entConfs;
    }


    Devices loadDevices(
      const std::string& username,
      const std::string& bridgeAddress
    )
    {
      HttpHeaders headers = {{"hue-application-key", username}};
      std::string url = HttpProtocol + bridgeAddress + "/clip/v2/resource";
      auto response = sendHttpRequest(url, "GET", "", headers);

      if(!response.has_value()){
        return {};
      }

      return parseDevicesFromResource(response->asJson());
    }


    EntertainmentConfigurationsChannels loadEntertainmentConfigurationsChannels(
      const std::string& username,
      const std::string& bridgeAddress
    )
    {
      HttpHeaders headers = {{"hue-application-key", username}};
      std::string url = HttpProtocol + bridgeAddress + "/clip/v2/resource/entertainment_configuration";
      auto response = sendHttpRequest(url, "GET", "", headers);

      if(!response.has_value()){
        return {};
      }

      return parseEntertainmentConfigurationsChannels(response->asJson());
    }


    void setStreamingState(
      const EntertainmentConfigurationEntry& entertainmentConfigurationEntry,
      const std::string& username,
      const std::string& bridgeAddress,
      bool active
    )
    {
      nlohmann::json body = {
        {"action", active ? "start" : "stop"},
        {"metadata", {{"name", entertainmentConfigurationEntry.second.name}}}
      };

      HttpHeaders headers = {{"hue-application-key", username}};
      std::string url = HttpProtocol + bridgeAddress + "/clip/v2/resource/entertainment_configuration/" + entertainmentConfigurationEntry.first;

      sendHttpRequest(url, "PUT", body.dump(), headers);
    }


    bool streamingActive(
      const EntertainmentConfigurationEntry& entertainmentConfigurationEntry,
      const std::string& username,
      const std::string& bridgeAddress
    )
    {
      HttpHeaders headers = {{"hue-application-key", username}};
      std::string url = HttpProtocol + bridgeAddress + "/clip/v2/resource/entertainment_configuration/" + entertainmentConfigurationEntry.first;
      auto response = sendHttpRequest(url, "GET", "", headers);

      if(!response.has_value()){
        return false;
      }

      std::string status = response->asJson().at("data").front().at("status").get<std::string>();
      return status == "active";
    }


    void testPulse(
      const MembersIds& lightIds,
      const std::string& username,
      const std::string& bridgeAddress
    )
    {
      HttpHeaders headers = {{"hue-application-key", username}};

      std::unordered_map<std::string, LightSnapshot> snapshots;
      for(const auto& lightId : lightIds){
        std::string url = HttpProtocol + bridgeAddress + "/clip/v2/resource/light/" + lightId;
        auto response = sendHttpRequest(url, "GET", "", headers);

        // Unreachable light, or a response shape parseLightSnapshot doesn't
        // recognize (e.g. an empty "data" array) -- skip pulsing it rather
        // than letting one bad light abort the whole request (and, before
        // this try/catch existed, crash the route handler entirely).
        if(response.has_value()){
          try{
            snapshots.emplace(lightId, parseLightSnapshot(response->asJson()));
          }
          catch(const nlohmann::json::exception&){}
        }
      }

      glm::vec3 magentaXyb = toXYB(Contracts::Color{255, 0, 255});
      nlohmann::json pulseBody = lightPutBody(true, 100.f, {magentaXyb.x, magentaXyb.y}, TestPulseDurationMs);
      for(const auto& [lightId, snapshot] : snapshots){
        putLight(lightId, pulseBody, username, bridgeAddress);
      }

      std::this_thread::sleep_for(std::chrono::milliseconds(TestPulseDurationMs));

      for(const auto& [lightId, snapshot] : snapshots){
        putLight(lightId, lightPutBody(snapshot.on, snapshot.brightness, snapshot.xy, TestPulseDurationMs), username, bridgeAddress);
      }
    }


    nlohmann::json autodetectedBridge()
    {
      auto response = sendHttpRequest("https://discovery.meethue.com/", "GET");

      if(!response.has_value()){
        return {{"succeeded", false}, {"error", "Could not reach discovery service. Please check your internet connection."}};
      }

      return {{"succeeded", true}, {"bridges", response->asJson()}};
    }


    std::optional<HttpResponse> registerNewUser(
      const std::string& bridgeAddress,
      const std::string& deviceType
    )
    {
      nlohmann::json body = {{"devicetype", deviceType}, {"generateclientkey", true}};
      return sendHttpRequest(HttpProtocol + bridgeAddress + "/api", "POST", body.dump());
    }
  }
}
