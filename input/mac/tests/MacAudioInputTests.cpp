#include <catch2/catch_test_macros.hpp>

#include <iostream>
#include <thread>

#include <Aurora/Input/Mac/MacAudioGrabber.hpp>

using namespace Aurora::Input;
using namespace Aurora::Input::Mac;
using namespace Aurora::Contracts;

// Real Core Audio process-tap capture, not unit-testable (needs a real
// audio session with something actually playing, plus "System Audio
// Recording Only" permission granted -- see docs/MacSupport.md and
// docs/log/2026-09-28-mac-audio-tap-probe.md). Same category as
// ScreenCaptureKitGrabber and Windows' AudioGrabber. Tagged [.] (Catch2's
// "hidden" convention), excluded from normal `ctest` runs; invoke
// explicitly with `AuroraInputMacTests [manual]` while playing music.
TEST_CASE("MacAudioGrabber captures real, non-silent system audio", "[.][manual][MacAudioGrabber]")
{
  MacAudioGrabber grabber;
  CHECK(grabber.name() == "MacAudioGrabber");

  std::cerr << "Play some audio now -- sampling for 3 seconds...\n";

  bool sawNonEmptyBuffer = false;
  bool sawNonSilentSample = false;

  for(int i = 0; i < 30; ++i){
    std::this_thread::sleep_for(std::chrono::milliseconds(100));

    AudioBuffer buffer;
    grabber.readNextBuffer(buffer);

    if(!buffer.samples.empty()){
      sawNonEmptyBuffer = true;

      for(float sample : buffer.samples){
        if(sample != 0.0f){
          sawNonSilentSample = true;
          break;
        }
      }

      std::cerr << "  buffer " << i << ": " << buffer.samples.size() << " samples @ "
                << buffer.sampleRate << "Hz, " << buffer.channelCount << " channel(s)\n";
    }
  }

  REQUIRE(sawNonEmptyBuffer);
  CHECK(sawNonSilentSample); // fails harmlessly if nothing was actually playing
}
