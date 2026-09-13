#include <Aurora/Output/Hue/ApiTools.hpp>

#include <algorithm>

#include <Aurora/Output/Hue/BridgeAddress.hpp>

namespace Aurora::Output::Hue
{
  namespace ApiTools
  {
    EntertainmentConfiguration parseEntertainmentConfigurationShell(const nlohmann::json& jsonEntConf)
    {
      EntertainmentConfiguration entConf;
      entConf.name = jsonEntConf.at("metadata").at("name").get<std::string>();

      for(const auto& lightService : jsonEntConf.at("light_services")){
        Device device;
        device.id = lightService.at("rid").get<std::string>();
        entConf.devices.push_back(std::move(device));
      }

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

        for(const auto& service : jsonData.at("services")){
          if(service.at("rtype") == "entertainment"){
            Device device;
            device.name = jsonData.at("metadata").at("name").get<std::string>();
            device.id = service.at("rid").get<std::string>();
            devices.push_back(std::move(device));
          }
        }
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

      for(const auto& jsonEntConf : jsonEntConfs.at("data")){
        EntertainmentConfiguration entConf = parseEntertainmentConfigurationShell(jsonEntConf);

        // Fixed in the port: the original called .value() on this request's
        // result unconditionally -- a single transient failure fetching one
        // device's name would throw and abort the whole load. Degrade
        // gracefully instead: that device just keeps an empty name.
        for(auto& device : entConf.devices){
          std::string lightUrl = HttpProtocol + bridgeAddress + "/clip/v2/resource/light/" + device.id;
          auto lightResponse = sendHttpRequest(lightUrl, "GET", "", headers);

          if(lightResponse.has_value()){
            device.name = parseLightName(lightResponse->asJson());
          }
        }

        entConfs.emplace(jsonEntConf.at("id").get<std::string>(), std::move(entConf));
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
