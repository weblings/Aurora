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
    };


  public:
    // targetSinkName: the exact PipeWire node.name of the sink to monitor
    // (see `wpctl status` + `pw-cli info <id>`) -- required. PipeWire has no
    // universal "default sink" alias; an empty/wrong name would otherwise
    // silently capture the default *source* (a mic) instead.
    explicit AudioGrabber(std::string targetSinkName);
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
    static void _pipewireThread(std::string targetSinkName, PipewireAudioData* pw);

    void _stop();

    std::optional<std::thread> m_pipewireThread;
    PipewireAudioData m_pwData;
  };
}
