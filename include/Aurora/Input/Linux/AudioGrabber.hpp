#pragma once
// PipeWire-based system-audio capture: taps a sink's monitor ports (what's
// playing), not a microphone. See Analysis/AudioAnalysis.md and
// Analysis/lessons/input.md for how this was verified against real
// PipeWire docs/examples and real hardware (no portal needed here, unlike
// PipewireGrabber's screen capture -- monitor capture needs no permission
// prompt).

#include <Aurora/Input/IAudioInput.hpp>

#include <future>
#include <mutex>
#include <optional>
#include <string>
#include <thread>
#include <vector>

#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wpedantic"
#pragma GCC diagnostic ignored "-Wmissing-field-initializers"
#include <pipewire/extensions/metadata.h>
#include <pipewire/pipewire.h>
#include <spa/param/audio/format-utils.h>
#pragma GCC diagnostic pop

namespace Aurora::Input::Linux
{
  class AudioGrabber : public IAudioInput
  {
  private:
    struct PipewireAudioData
    {
      pw_main_loop* loop{nullptr};
      pw_context* context{nullptr};
      pw_stream* stream{nullptr};
      spa_audio_info format{};
      std::mutex mutex;
      std::vector<float> accumulated;
      std::promise<bool> readyPromise;
      bool promiseSetAlready{false};

      // Default-sink discovery state (only used when targetSinkName is
      // empty) -- see _resolveDefaultSinkName.
      pw_registry* registry{nullptr};
      pw_metadata* metadata{nullptr};
      spa_hook metadataListener{};
      spa_hook coreListener{};
      std::string resolvedSinkName;
      int discoverySyncSeq{0};
    };


  public:
    // targetSinkName: the exact PipeWire node.name of the sink to monitor
    // (see `wpctl status` + `pw-cli info <id>`). Empty -- the default,
    // matching WASAPI loopback needing no device name on Windows -- resolves
    // the system's current default sink automatically via Pipewire's
    // "default" metadata object at construction time.
    explicit AudioGrabber(std::string targetSinkName = "");
    ~AudioGrabber() override;

    AudioGrabber(const AudioGrabber&) = delete;
    AudioGrabber& operator=(const AudioGrabber&) = delete;

    const std::string& name() const override;

    // Same push-to-pull adaptation as Windows' AudioGrabber -- Pipewire's
    // process callback runs on its own thread; this drains what's
    // accumulated under a lock since the last call.
    void readNextBuffer(Contracts::AudioBuffer& buffer) override;

  private:
    static void _onStreamProcess(void* userdata);
    static void _onStreamParamChanged(void* userdata, uint32_t id, const spa_pod* param);
    static void _onRegistryGlobal(
      void* userdata, uint32_t id, uint32_t permissions,
      const char* type, uint32_t version, const spa_dict* props
    );
    static int _onMetadataProperty(void* userdata, uint32_t id, const char* key, const char* type, const char* value);
    static void _onCoreDoneCallback(void* userdata, uint32_t id, int seq);

    // Blocks (on pw->loop) until the default sink's node.name is found via
    // Pipewire's "default" metadata object, or one core sync roundtrip
    // passes without it -- returns empty on failure. Only called when the
    // caller didn't supply an explicit targetSinkName.
    static std::string _resolveDefaultSinkName(pw_core* core, PipewireAudioData* pw);

    static void _pipewireThread(std::string targetSinkName, PipewireAudioData* pw);

    void _stop();

    std::optional<std::thread> m_pipewireThread;
    PipewireAudioData m_pwData;
  };
}
