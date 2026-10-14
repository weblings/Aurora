#pragma once

#include <string>
#include <string_view>
#include <unordered_map>

#include <Aurora/Runtime/Graph/GraphHost.hpp>
#include <Aurora/Runtime/ZoneMap.hpp>

// IGraphHost for the parity gate (Aurora-ra4o.7): the same input, outputs
// and zone maps a scenario hands the orchestrator, served to the Graph.
namespace Aurora::Tests::Golden
{
  class ParityHost : public Aurora::Runtime::Graph::IGraphHost
  {
  public:
    Aurora::Input::IVideoInput* video{nullptr};
    Aurora::Input::IAudioInput* audio{nullptr};
    std::unordered_map<std::string, Aurora::Output::IOutput*> outputs;
    std::unordered_map<std::string, Aurora::Runtime::ZoneMap> zoneMaps;

    Aurora::Input::IVideoInput* videoInput() override { return video; }
    Aurora::Input::IAudioInput* audioInput() override { return audio; }

    Aurora::Output::IOutput* output(std::string_view name) override
    {
      auto it = outputs.find(std::string(name));
      return it == outputs.end() ? nullptr : it->second;
    }

    const Aurora::Runtime::ZoneMap* zoneMap(std::string_view name) override
    {
      auto it = zoneMaps.find(std::string(name));
      return it == zoneMaps.end() ? nullptr : &it->second;
    }
  };
}
