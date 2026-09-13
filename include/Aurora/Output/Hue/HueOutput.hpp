#pragma once

#include <memory>
#include <string>
#include <unordered_set>
#include <vector>

#include <Aurora/Contracts/Frame.hpp>
#include <Aurora/Output/IOutput.hpp>
#include <Aurora/Output/Hue/Channel.hpp>
#include <Aurora/Output/Hue/Credentials.hpp>
#include <Aurora/Output/Hue/EntertainmentConfigurationSelector.hpp>
#include <Aurora/Output/Hue/Streamer.hpp>

// Concrete IOutput for a Philips Hue bridge -- ties EntertainmentConfigurationSelector
// (REST discovery/selection) and Streamer (DTLS delivery) to Aurora's generic
// Output interface. See Analysis/HueOutputAnalysis.md.
namespace Aurora::Output::Hue
{
  // Pure: converts one zone's RGB color + gamma to a HueStream ChannelStream
  // entry (RGB -> XYB, then gamma-corrects the brightness/z component).
  ChannelStream toChannelStream(const Contracts::Zone& zone);

  // Zone ids in `previousIds` no longer present in `currentIds` -- these
  // need one final zero-color frame before being dropped from the stream,
  // matching huenicorn's PendingShutdown one-shot-then-drop behavior.
  std::vector<uint8_t> justDeactivatedZoneIds(
    const std::vector<uint8_t>& currentIds,
    const std::unordered_set<uint8_t>& previousIds
  );


  class HueOutput : public Output::IOutput
  {
  public:
    // entertainmentConfigurationId: empty selects the bridge's first available one.
    HueOutput(
      Credentials credentials,
      std::string bridgeAddress,
      std::string entertainmentConfigurationId = ""
    );

    const std::string& name() const override;
    void init() override;
    bool isConnected() const override;
    void shutdown() override;
    std::vector<uint8_t> zoneIds() const override;
    void send(const Contracts::Frame& frame) override;

  private:
    Credentials m_credentials;
    std::string m_bridgeAddress;
    std::string m_entertainmentConfigurationId;

    std::unique_ptr<EntertainmentConfigurationSelector> m_selector;
    std::unique_ptr<Streamer> m_streamer;

    // Tracks which zones were streamed last tick, so a zone dropping out of
    // this tick's Frame gets exactly one final zero-color entry.
    std::unordered_set<uint8_t> m_previouslyActiveZoneIds;
  };
}
