#include <catch2/catch_test_macros.hpp>

#include <cstring>
#include <thread>
#include <vector>

#include <Aurora/Input/Linux/AudioSinkList.hpp>
#include <Aurora/Input/Linux/AudioSinkStatus.hpp>
#include <Aurora/Input/Linux/GamescopeNodeMatch.hpp>
#include <Aurora/Input/Linux/IRestoreTokenStore.hpp>
#include <Aurora/Input/Linux/PipewireDmabuf.hpp>
#include <Aurora/Input/Linux/PipewireFrameBuffer.hpp>
#include <Aurora/Input/Linux/PipewireFramerate.hpp>
#include <Aurora/Input/Linux/PipewireRuntime.hpp>
#include <Aurora/Input/Linux/PipewireTrace.hpp>

using namespace Aurora::Input::Linux;
using namespace Aurora::Contracts;


// Both helpers below have no Pipewire/GLib types in their signatures, so
// these tests build and run regardless of AURORA_INPUT_LINUX_ENABLE_PIPEWIRE.


TEST_CASE("matchesGamescopeNode requires both a Node interface and the exact name", "[PipewireGrabber][gamescope]")
{
  CHECK(matchesGamescopeNode(true, "gamescope"));
  CHECK_FALSE(matchesGamescopeNode(true, "not-gamescope"));
  CHECK_FALSE(matchesGamescopeNode(false, "gamescope"));
  CHECK_FALSE(matchesGamescopeNode(true, nullptr));
}


TEST_CASE("toOwnedImage tags dimensions and format correctly", "[PipewireGrabber][frame]")
{
  std::vector<uint8_t> buffer(4 * 4 * 4, 0x7F);
  ImageData image = toOwnedImage(buffer.data(), 4, 4, 0);

  REQUIRE(image.hasData());
  CHECK(image.width() == 4);
  CHECK(image.height() == 4);
  CHECK(image.format == PixelFormat::RGBA);
}


TEST_CASE("toOwnedImage clones rather than aliasing the source buffer", "[PipewireGrabber][frame]")
{
  // Mirrors real usage: Pipewire's buffer becomes invalid right after this
  // call returns, so the result must own independent memory.
  std::vector<uint8_t> buffer(2 * 2 * 4, 0x11);
  ImageData image = toOwnedImage(buffer.data(), 2, 2, 0);

  std::memset(buffer.data(), 0xFF, buffer.size());

  CHECK(image.imageMatrix.data[0] == 0x11);
}


TEST_CASE("toOwnedImage honors a padded stride wider than the tightly-packed row", "[PipewireGrabber][frame]")
{
  const int width = 2, height = 2;
  const size_t paddedStride = static_cast<size_t>(width) * 4 + 16;
  std::vector<uint8_t> buffer(paddedStride * height, 0);

  // Mark just the first pixel of row 1 so a wrong stride would read padding.
  buffer[paddedStride] = 0xAB;

  ImageData image = toOwnedImage(buffer.data(), width, height, paddedStride);

  REQUIRE(image.hasData());
  CHECK(image.imageMatrix.at<cv::Vec4b>(1, 0)[0] == 0xAB);
}


TEST_CASE("toOwnedImage tags whatever format was actually negotiated, not always RGBA", "[PipewireGrabber][frame]")
{
  std::vector<uint8_t> buffer(4 * 4 * 4, 0x7F);
  ImageData image = toOwnedImage(buffer.data(), 4, 4, 0, PixelFormat::BGRA);

  CHECK(image.format == PixelFormat::BGRA);
}


TEST_CASE("toOwnedImage returns an empty ImageData for degenerate input", "[PipewireGrabber][frame]")
{
  CHECK_FALSE(toOwnedImage(nullptr, 4, 4, 0).hasData());
  std::vector<uint8_t> buffer(16, 0);
  CHECK_FALSE(toOwnedImage(buffer.data(), 0, 4, 0).hasData());
  CHECK_FALSE(toOwnedImage(buffer.data(), 4, -1, 0).hasData());
}


TEST_CASE("NullRestoreTokenStore never persists", "[XdgDesktopPortal][restore-token]")
{
  NullRestoreTokenStore store;
  CHECK_FALSE(store.restoreToken().has_value());

  store.setRestoreToken("some-token");
  CHECK_FALSE(store.restoreToken().has_value());
}


TEST_CASE("reduceFramerate reduces the fraction instead of trusting the numerator", "[PipewireGrabber][framerate]")
{
  // The live failure: an unreduced max_framerate numerator (15729223 Hz)
  // was once persisted as the refresh rate and wedged the runtime loop.
  // Representative unreduced shapes (the exact live denominator is
  // unknown; the numerator alone is the documented fact).
  CHECK(reduceFramerate(60000, 1001) == 59);
  CHECK(reduceFramerate(60, 1) == 60);
  CHECK(reduceFramerate(15729223, 1000) == 15729);
}


TEST_CASE("reduceFramerate treats a zero denominator as unset", "[PipewireGrabber][framerate]")
{
  CHECK(reduceFramerate(60, 0) == 0);
  CHECK(reduceFramerate(0, 0) == 0);
}


TEST_CASE("makeAudioSinkStatus reports the resolved default when following it", "[AudioGrabber][sink-status]")
{
  // Aurora-4vf: empty request = follow-the-default, so the reported name
  // is whatever default-sink discovery resolved (shown as "Using: <name>").
  auto status = makeAudioSinkStatus("", "alsa_output.pci.analog-stereo");

  CHECK(status.followingDefault);
  CHECK(status.sinkName == "alsa_output.pci.analog-stereo");
}


TEST_CASE("makeAudioSinkStatus reports the explicit target when pinned", "[AudioGrabber][sink-status]")
{
  // A user-entered sink wins over any stray resolved value -- discovery
  // never even runs on the explicit path, so resolved must be ignored.
  auto status = makeAudioSinkStatus("my-usb-sink", "alsa_output.pci.analog-stereo");

  CHECK_FALSE(status.followingDefault);
  CHECK(status.sinkName == "my-usb-sink");
}


TEST_CASE("makeAudioSinkStatus reports unknown when default resolution found nothing", "[AudioGrabber][sink-status]")
{
  // Still following-the-default (nothing was pinned), but with no name to
  // show -- the WebUI keeps its no-list warning in this state.
  auto status = makeAudioSinkStatus("", "");

  CHECK(status.followingDefault);
  CHECK(status.sinkName.empty());
}


TEST_CASE("matchAudioSinkNode accepts Audio/Sink nodes with name and description", "[AudioGrabber][sink-list]")
{
  // Aurora-67y: the live shape from pw-dump -- media.class Audio/Sink
  // plus node.name (the audioTargetSinkName value) and node.description
  // (the dropdown's human-readable label).
  auto sink = matchAudioSinkNode(
    true, "Audio/Sink",
    "alsa_output.pci-0000_00_1f.3.analog-stereo",
    "Built-in Audio Analog Stereo"
  );

  REQUIRE(sink.has_value());
  CHECK(sink->name == "alsa_output.pci-0000_00_1f.3.analog-stereo");
  CHECK(sink->description == "Built-in Audio Analog Stereo");
}


TEST_CASE("matchAudioSinkNode rejects non-sink globals", "[AudioGrabber][sink-list]")
{
  // Sources, video nodes, and non-Node interfaces are never capture
  // targets for a sink monitor dropdown.
  CHECK_FALSE(matchAudioSinkNode(true, "Audio/Source", "alsa_input.usb-mic", "USB Mic").has_value());
  CHECK_FALSE(matchAudioSinkNode(true, "Video/Source", "v4l2_input.webcam", "Webcam").has_value());
  CHECK_FALSE(matchAudioSinkNode(false, "Audio/Sink", "alsa_output.pci", "Built-in").has_value());
}


TEST_CASE("matchAudioSinkNode rejects class-less clock nodes and nameless globals", "[AudioGrabber][sink-list]")
{
  // Dummy-Driver / Freewheel-Driver carry no media.class at all, and a
  // daemon with no session manager answers queries with only those --
  // matching on the class (not mere presence) keeps them out of the
  // list. A sink with no node.name is unselectable, so it's out too.
  CHECK_FALSE(matchAudioSinkNode(true, nullptr, "Dummy-Driver", nullptr).has_value());
  CHECK_FALSE(matchAudioSinkNode(true, "Audio/Sink", nullptr, "No name").has_value());
  CHECK_FALSE(matchAudioSinkNode(true, "Audio/Sink", "", "Empty name").has_value());
}


TEST_CASE("matchAudioSinkNode keeps sinks with no description, leaving the fallback to the caller", "[AudioGrabber][sink-list]")
{
  // node.description is optional on the wire -- the dropdown falls back
  // to the node name for the label, so the helper passes the empty
  // through instead of dropping a selectable sink.
  auto sink = matchAudioSinkNode(true, "Audio/Sink", "bluez_output.headset", nullptr);

  REQUIRE(sink.has_value());
  CHECK(sink->name == "bluez_output.headset");
  CHECK(sink->description.empty());
}


// PipewireRuntime.cpp only compiles when PipeWire screen capture and/or
// audio capture is enabled -- without either, there is nothing to link
// against, so this case is compiled out too.
#if defined(AURORA_INPUT_LINUX_PIPEWIRE_AVAILABLE) || defined(AURORA_INPUT_LINUX_AUDIO_AVAILABLE)
TEST_CASE("ensurePipewireInitialized is safe to call repeatedly and concurrently", "[PipewireRuntime]")
{
  // Models a Video<->Audio live-switch storm: every reload builds a new
  // grabber (each calling this) before destroying the old one, sometimes
  // from two threads at once (HTTP reload thread vs. tick thread). Must
  // never throw or crash; needs no daemon/bridge, just the library init.
  ensurePipewireInitialized();
  ensurePipewireInitialized();

  std::thread other([]{
    ensurePipewireInitialized();
  });
  ensurePipewireInitialized();
  other.join();

  SUCCEED();
}
#endif


TEST_CASE("pipewireTraceEnabledFrom treats unset, empty and \"0\" as off", "[PipewireTrace]")
{
  CHECK_FALSE(pipewireTraceEnabledFrom(nullptr));
  CHECK_FALSE(pipewireTraceEnabledFrom(""));
  CHECK_FALSE(pipewireTraceEnabledFrom("0"));
  CHECK(pipewireTraceEnabledFrom("1"));
  CHECK(pipewireTraceEnabledFrom("yes"));
}


TEST_CASE("sampleContentHash sees a whole-frame color change but not a repeat", "[PipewireTrace]")
{
  std::vector<uint8_t> red(1920 * 4 * 8, 0);
  std::vector<uint8_t> blue(red.size(), 0);
  for(size_t i = 0; i < red.size(); i += 4){
    red[i] = 255;
    blue[i + 2] = 255;
  }
  CHECK(sampleContentHash(red.data(), red.size()) == sampleContentHash(red.data(), red.size()));
  CHECK(sampleContentHash(red.data(), red.size()) != sampleContentHash(blue.data(), blue.size()));
  CHECK_NOTHROW(sampleContentHash(nullptr, 0));
}


TEST_CASE("PipewireTrace counts callbacks and content changes per window", "[PipewireTrace]")
{
  PipewireTrace trace;
  trace.onFrame(1.0, 111, 10, 1000, 2, 0, -1);
  trace.onFrame(1.1, 111, 11, 1100, 2, 0, -1);  // same content
  trace.onFrame(1.2, 222, 12, 1200, 2, 0, -1);  // new content

  const std::string first = trace.takeSummary(2.0);
  CHECK(first.find("cb=3 ") != std::string::npos);
  CHECK(first.find("changed=2 ") != std::string::npos);
  CHECK(first.find("seq=10..12") != std::string::npos);
  CHECK(first.find("lastChange=0.8s") != std::string::npos);

  // Next window: no callbacks at all -- the freeze signature.
  const std::string quiet = trace.takeSummary(3.0);
  CHECK(quiet.find("cb=0 ") != std::string::npos);
  CHECK(quiet.find("changed=0 ") != std::string::npos);
  CHECK(quiet.find("lastCb=1.8s") != std::string::npos);
}


TEST_CASE("PipewireTrace separates stale-content callbacks from no callbacks", "[PipewireTrace]")
{
  PipewireTrace trace;
  trace.onFrame(1.0, 111, 1, 0, 2, 0, -1);
  trace.takeSummary(1.5);
  trace.onFrame(2.0, 111, 2, 0, 2, 0, -1);
  trace.onFrame(2.5, 111, 3, 0, 2, 0, -1);

  const std::string stale = trace.takeSummary(3.0);
  CHECK(stale.find("cb=2 ") != std::string::npos);
  CHECK(stale.find("changed=0 ") != std::string::npos);
}


TEST_CASE("PipewireTrace reports skipped callbacks and never-seen ages", "[PipewireTrace]")
{
  PipewireTrace trace;
  const std::string empty = trace.takeSummary(1.0);
  CHECK(empty.find("lastCb=never") != std::string::npos);
  CHECK(empty.find("lastChange=never") != std::string::npos);

  trace.onSkipped(2.0, 3, PipewireTrace::SkipReason::EmptyChunk, 2, 0);
  const std::string skipped = trace.takeSummary(2.5);
  CHECK(skipped.find("skipped=1(") != std::string::npos);
  CHECK(skipped.find("dataType=3 ") != std::string::npos);
  CHECK(skipped.find("emptyChunk=1 ") != std::string::npos);
  CHECK(skipped.find("skipFlags=0x2 ") != std::string::npos);
}


TEST_CASE("frameFitsBuffer accepts an exact fit and rejects overruns", "[PipewireDmabuf]")
{
  // 4x2 pixels, 16-byte rows: 32 bytes when tightly packed.
  CHECK(frameFitsBuffer(0, 16, 4, 2, 32));
  CHECK_FALSE(frameFitsBuffer(0, 16, 4, 2, 31));
  CHECK_FALSE(frameFitsBuffer(4, 16, 4, 2, 32));
  // Padded stride: the last row needs only its pixels, not the padding.
  CHECK(frameFitsBuffer(0, 20, 4, 2, 36));
  CHECK_FALSE(frameFitsBuffer(0, 20, 4, 2, 35));
}


TEST_CASE("frameFitsBuffer rejects degenerate input", "[PipewireDmabuf]")
{
  CHECK_FALSE(frameFitsBuffer(0, 16, 0, 2, 64));
  CHECK_FALSE(frameFitsBuffer(0, 16, 4, 0, 64));
  CHECK_FALSE(frameFitsBuffer(0, 8, 4, 2, 64));     // stride narrower than a row
  CHECK_FALSE(frameFitsBuffer(100, 16, 4, 2, 64));  // offset past the end
}


TEST_CASE("DmabufReadFallback gives up once, after consecutive failures", "[PipewireDmabuf]")
{
  DmabufReadFallback fallback;
  for(int i = 1; i < DmabufReadFallback::kMaxConsecutiveFailures; ++i){
    CHECK_FALSE(fallback.onReadFailed());
  }
  CHECK(fallback.onReadFailed());
  CHECK(fallback.disabled());
  CHECK_FALSE(fallback.onReadFailed());  // reported once only
}


TEST_CASE("DmabufReadFallback resets on a successful read", "[PipewireDmabuf]")
{
  DmabufReadFallback fallback;
  for(int round = 0; round < 3; ++round){
    for(int i = 1; i < DmabufReadFallback::kMaxConsecutiveFailures; ++i){
      CHECK_FALSE(fallback.onReadFailed());
    }
    fallback.onReadOk();
  }
  CHECK_FALSE(fallback.disabled());
}


TEST_CASE("StaleFrameWatch reports a stall once, after the threshold", "[PipewireDmabuf]")
{
  StaleFrameWatch watch(3.0);
  CHECK_FALSE(watch.onFrame());
  CHECK_FALSE(watch.onUnusable(10.0));
  CHECK_FALSE(watch.onUnusable(12.9));
  CHECK(watch.onUnusable(13.0));
  CHECK(watch.stalledFor(14.0) == 4.0);
  CHECK_FALSE(watch.onUnusable(20.0));  // same stall: no repeat
  CHECK(watch.onFrame());               // recovery of a reported stall
  CHECK(watch.stalledFor(21.0) == 0.0);
}


TEST_CASE("StaleFrameWatch ignores short gaps and starts a new stall after a frame", "[PipewireDmabuf]")
{
  StaleFrameWatch watch(3.0);
  CHECK_FALSE(watch.onUnusable(1.0));
  CHECK_FALSE(watch.onUnusable(2.0));
  CHECK_FALSE(watch.onFrame());  // never reported, so no recovery
  CHECK_FALSE(watch.onUnusable(4.5));
  CHECK_FALSE(watch.onUnusable(7.0));
  CHECK(watch.onUnusable(7.5));
}


TEST_CASE("dmabufEnabledFrom is on unless the kill switch is \"0\"", "[PipewireDmabuf]")
{
  CHECK(dmabufEnabledFrom(nullptr));
  CHECK(dmabufEnabledFrom(""));
  CHECK(dmabufEnabledFrom("1"));
  CHECK_FALSE(dmabufEnabledFrom("0"));
}

