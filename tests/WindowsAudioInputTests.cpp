#include <catch2/catch_test_macros.hpp>

#include <iostream>
#include <thread>

#include <Aurora/Input/Windows/AudioGrabber.hpp>

using namespace Aurora::Input;
using namespace Aurora::Input::Windows;
using namespace Aurora::Contracts;

// Real WASAPI loopback capture, not unit-testable (needs a real audio
// session with something actually playing) -- same category as
// WindowsGrabber. Tagged [.] (Catch2's "hidden" convention), excluded from
// normal `ctest` runs; invoke explicitly with
// `AuroraInputWindowsAudioTests.exe [manual]` while playing music.
TEST_CASE("AudioGrabber captures real, non-silent system audio", "[.][manual][AudioGrabber]")
{
  AudioGrabber grabber;
  CHECK(grabber.name() == "AudioGrabber");

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
