#include <Aurora/Input/Linux/AudioGrabber.hpp>

#include <chrono>
#include <stdexcept>

#if defined(__clang__)
  #pragma clang diagnostic push
  #pragma clang diagnostic ignored "-Wpedantic"
  #pragma clang diagnostic ignored "-Wmissing-field-initializers"
#elif defined(__GNUC__)
  #pragma GCC diagnostic push
  #pragma GCC diagnostic ignored "-Wpedantic"
  #pragma GCC diagnostic ignored "-Wmissing-field-initializers"
#endif

#include <spa/param/audio/raw-utils.h>

#if defined(__clang__)
  #pragma clang diagnostic pop
#elif defined(__GNUC__)
  #pragma GCC diagnostic pop
#endif

namespace Aurora::Input::Linux
{
  namespace
  {
    // Loud, not silent -- an empty target wouldn't fail, it would just
    // capture the default *source* (a mic) with no indication anything's
    // wrong. See AudioGrabber.hpp's constructor comment.
    void requireTargetSinkName(const std::string& targetSinkName)
    {
      if(targetSinkName.empty()){
        throw std::runtime_error(
          "AudioGrabber: targetSinkName is empty -- set Config::audioTargetSinkName "
          "to a real sink's node.name (see `wpctl status` + `pw-cli info <id>`)"
        );
      }
    }
  }


  AudioGrabber::AudioGrabber(std::string targetSinkName)
  {
    requireTargetSinkName(targetSinkName);

    auto readyFuture = m_pwData.readyPromise.get_future();
    m_pipewireThread.emplace(_pipewireThread, std::move(targetSinkName), &m_pwData);

    // Bounded, not indefinite -- a typo'd/missing sink name never fires
    // param_changed, and this constructor shouldn't hang forever over it.
    if(readyFuture.wait_for(std::chrono::seconds(5)) != std::future_status::ready || !readyFuture.get()){
      _stop();
      throw std::runtime_error(
        "AudioGrabber: Pipewire audio capture didn't become ready within 5s "
        "-- check that targetSinkName matches a real sink's node.name exactly"
      );
    }
  }


  AudioGrabber::~AudioGrabber()
  {
    _stop();
  }


  const std::string& AudioGrabber::name() const
  {
    static const std::string s_name = "AudioGrabber";
    return s_name;
  }


  void AudioGrabber::readNextBuffer(Contracts::AudioBuffer& buffer)
  {
    std::lock_guard<std::mutex> lock(m_pwData.mutex);

    buffer.sampleRate = m_pwData.format.info.raw.rate;
    buffer.channelCount = m_pwData.format.info.raw.channels;
    buffer.samples = std::move(m_pwData.accumulated);
    m_pwData.accumulated.clear();
  }


  void AudioGrabber::_onStreamParamChanged(
    void* userdata,
    uint32_t id,
    const spa_pod* param
  )
  {
    PipewireAudioData* pw = static_cast<PipewireAudioData*>(userdata);

    if(param == nullptr || id != SPA_PARAM_Format){
      return;
    }

    if(spa_format_audio_raw_parse(param, &pw->format.info.raw) < 0){
      return;
    }

    if(!pw->promiseSetAlready){
      pw->readyPromise.set_value(true);
      pw->promiseSetAlready = true;
    }
  }


  void AudioGrabber::_onStreamProcess(
    void* userdata
  )
  {
    PipewireAudioData* pw = static_cast<PipewireAudioData*>(userdata);
    pw_buffer* pwBuffer;

    if((pwBuffer = pw_stream_dequeue_buffer(pw->stream)) == nullptr){
      return;
    }

    spa_buffer* spaBuffer = pwBuffer->buffer;
    if(spaBuffer->datas[0].data != nullptr && spaBuffer->datas[0].chunk != nullptr){
      // Interleaved float32 (SPA_AUDIO_FORMAT_F32, one data plane) --
      // matches AudioBuffer's layout with no adaptation needed.
      const float* samples = static_cast<const float*>(spaBuffer->datas[0].data);
      size_t sampleCount = spaBuffer->datas[0].chunk->size / sizeof(float);

      std::lock_guard<std::mutex> lock(pw->mutex);
      pw->accumulated.insert(pw->accumulated.end(), samples, samples + sampleCount);
    }

    pw_stream_queue_buffer(pw->stream, pwBuffer);
  }


  void AudioGrabber::_pipewireThread(
    std::string targetSinkName,
    PipewireAudioData* pw
  )
  {
    pw_init(nullptr, nullptr);

    pw_stream_events streamEvents{};
    streamEvents.version = PW_VERSION_STREAM_EVENTS;
    streamEvents.param_changed = _onStreamParamChanged;
    streamEvents.process = _onStreamProcess;

    pw->loop = pw_main_loop_new(nullptr);
    pw->context = pw_context_new(pw_main_loop_get_loop(pw->loop), nullptr, 0);

    // Direct local connection -- audio needs no portal/fd handshake, unlike
    // screen capture (nothing here requires a permission prompt).
    auto core = pw_context_connect(pw->context, nullptr, 0);
    if(core == nullptr){
      if(!pw->promiseSetAlready){
        pw->readyPromise.set_value(false);
        pw->promiseSetAlready = true;
      }
      pw_context_destroy(pw->context);
      pw->context = nullptr;
      pw_main_loop_destroy(pw->loop);
      pw->loop = nullptr;
      return;
    }

    // target.object + stream.capture.sink=true is Pipewire's documented
    // monitor-capture mechanism (docs.pipewire.org's loopback-module page) --
    // without both, this silently captures the default *source* (a mic)
    // instead of this sink's monitor.
    auto props = pw_properties_new(
      PW_KEY_MEDIA_TYPE, "Audio",
      PW_KEY_MEDIA_CATEGORY, "Capture",
      PW_KEY_MEDIA_ROLE, "Music",
      PW_KEY_TARGET_OBJECT, targetSinkName.c_str(),
      "stream.capture.sink", "true",
      NULL
    );

    pw->stream = pw_stream_new_simple(
      pw_main_loop_get_loop(pw->loop),
      "AuroraAudioStream",
      props,
      &streamEvents,
      pw
    );

    uint8_t buffer[1024];
    spa_pod_builder b = SPA_POD_BUILDER_INIT(buffer, sizeof(buffer));

    // Rate/channels left unset -- accept the graph's native values, same as
    // Pipewire's own audio-capture.c example this was verified against.
    // Named local, not inline -- SPA_AUDIO_INFO_RAW_INIT's compound literal
    // is an lvalue in C (where the reference examples are) but an rvalue in
    // C++, so &SPA_AUDIO_INFO_RAW_INIT(...) directly doesn't compile here.
    spa_audio_info_raw audioInfo = SPA_AUDIO_INFO_RAW_INIT(.format = SPA_AUDIO_FORMAT_F32);
    const spa_pod* params[1] = {
      spa_format_audio_raw_build(&b, SPA_PARAM_EnumFormat, &audioInfo)
    };

    pw_stream_connect(
      pw->stream, PW_DIRECTION_INPUT, PW_ID_ANY,
      static_cast<pw_stream_flags>(PW_STREAM_FLAG_AUTOCONNECT | PW_STREAM_FLAG_MAP_BUFFERS | PW_STREAM_FLAG_RT_PROCESS),
      params, 1
    );

    pw_main_loop_run(pw->loop);

    pw_stream_disconnect(pw->stream);
    pw_stream_destroy(pw->stream);
    pw->stream = nullptr;
    pw_context_destroy(pw->context);
    pw->context = nullptr;
    pw_main_loop_destroy(pw->loop);
    pw->loop = nullptr;
  }


  void AudioGrabber::_stop()
  {
    if(m_pwData.loop){
      pw_main_loop_quit(m_pwData.loop);
    }

    if(m_pipewireThread.has_value()){
      m_pipewireThread.value().join();
      m_pipewireThread.reset();
    }

    pw_deinit();
  }
}
