#include <Aurora/Input/Linux/AudioGrabber.hpp>
#include <Aurora/Input/Linux/PipewireRuntime.hpp>

#include <chrono>
#include <cstring>
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

#include <spa/param/audio/format-utils.h>
#include <spa/utils/json.h>
#include <spa/utils/string.h>

#if defined(__clang__)
  #pragma clang diagnostic pop
#elif defined(__GNUC__)
  #pragma GCC diagnostic pop
#endif

namespace Aurora::Input::Linux
{
  AudioGrabber::AudioGrabber(std::string targetSinkName)
  {
    auto readyFuture = m_pwData.readyPromise.get_future();
    m_pipewireThread.emplace(_pipewireThread, std::move(targetSinkName), &m_pwData);

    // Bounded, not indefinite -- a typo'd sink name, or default-sink
    // discovery finding nothing, never fires param_changed, and this
    // constructor shouldn't hang forever over it.
    if(readyFuture.wait_for(std::chrono::seconds(5)) != std::future_status::ready || !readyFuture.get()){
      _stop();
      throw std::runtime_error(
        "AudioGrabber: Pipewire audio capture didn't become ready within 5s "
        "-- if targetSinkName was set explicitly, check it matches a real "
        "sink's node.name exactly; if left empty, default-sink discovery "
        "may have failed (no session manager, or no default set)"
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


  void AudioGrabber::_onRegistryGlobal(
    void* userdata,
    uint32_t id,
    uint32_t /*permissions*/,
    const char* type,
    uint32_t /*version*/,
    const spa_dict* props
  )
  {
    PipewireAudioData* pw = static_cast<PipewireAudioData*>(userdata);

    if(!spa_streq(type, PW_TYPE_INTERFACE_Metadata)){
      return;
    }

    const char* metadataName = props ? spa_dict_lookup(props, PW_KEY_METADATA_NAME) : nullptr;
    if(!metadataName || !spa_streq(metadataName, "default")){
      return;
    }

    pw->metadata = static_cast<pw_metadata*>(
      pw_registry_bind(pw->registry, id, type, PW_VERSION_METADATA, 0)
    );

    static const pw_metadata_events metadataEvents = {
      PW_VERSION_METADATA_EVENTS,
      _onMetadataProperty
    };
    pw_metadata_add_listener(pw->metadata, &pw->metadataListener, &metadataEvents, pw);

    // This bind is a fresh request sent after the original sync -- re-sync
    // so loop-exit waits on this reply too, not the earlier one.
    pw->discoverySyncSeq = pw_core_sync(pw->core, PW_ID_CORE, 0);
  }


  int AudioGrabber::_onMetadataProperty(
    void* userdata,
    uint32_t /*id*/,
    const char* key,
    const char* /*type*/,
    const char* value
  )
  {
    PipewireAudioData* pw = static_cast<PipewireAudioData*>(userdata);

    if(key == nullptr || value == nullptr || !spa_streq(key, "default.audio.sink")){
      return 0;
    }

    // Value is {"name":"<node-name>"} -- this pipewire's spa/utils/json.h
    // (0.3.48) predates object_find(), so walk key/value tokens by hand.
    spa_json iter;
    spa_json_init(&iter, value, strlen(value));

    spa_json obj;
    if(spa_json_enter_object(&iter, &obj) > 0){
      const char* keyToken;
      int keyLen;
      while((keyLen = spa_json_next(&obj, &keyToken)) > 0){
        const char* valueToken;
        int valueLen = spa_json_next(&obj, &valueToken);
        if(valueLen <= 0){
          break;
        }

        char keyBuf[64];
        if(spa_json_parse_stringn(keyToken, keyLen, keyBuf, sizeof(keyBuf)) > 0 && spa_streq(keyBuf, "name")){
          char nameBuf[256];
          if(spa_json_parse_stringn(valueToken, valueLen, nameBuf, sizeof(nameBuf)) > 0){
            pw->resolvedSinkName.assign(nameBuf);
          }
        }
      }
    }

    pw_main_loop_quit(pw->loop);
    return 0;
  }


  void AudioGrabber::_onCoreDoneCallback(
    void* userdata,
    uint32_t id,
    int seq
  )
  {
    PipewireAudioData* pw = static_cast<PipewireAudioData*>(userdata);

    // discoverySyncSeq tracks whichever sync is the current exit gate --
    // the original one, or the later one _onRegistryGlobal re-issues.
    if(id == PW_ID_CORE && seq == pw->discoverySyncSeq){
      pw_main_loop_quit(pw->loop);
    }
  }


  std::string AudioGrabber::_resolveDefaultSinkName(
    pw_core* core,
    PipewireAudioData* pw
  )
  {
    pw_core_events coreEvents{};
    coreEvents.version = PW_VERSION_CORE_EVENTS;
    coreEvents.done = _onCoreDoneCallback;
    pw_core_add_listener(core, &pw->coreListener, &coreEvents, pw);

    pw->core = core; // _onRegistryGlobal needs it to re-sync after binding metadata

    pw_registry_events registryEvents{};
    registryEvents.version = PW_VERSION_REGISTRY_EVENTS;
    registryEvents.global = _onRegistryGlobal;

    pw->registry = pw_core_get_registry(core, PW_VERSION_REGISTRY, 0);
    spa_hook registryListener{};
    pw_registry_add_listener(pw->registry, &registryListener, &registryEvents, pw);

    pw->discoverySyncSeq = pw_core_sync(core, PW_ID_CORE, 0);
    pw_main_loop_run(pw->loop); // _onMetadataProperty or _onCoreDoneCallback quits this

    // Unlike registryListener below, this is attached to `core` itself
    // (outlives this call) -- must remove or a late Done dangles into this stack frame.
    spa_hook_remove(&pw->coreListener);

    spa_hook_remove(&registryListener);
    if(pw->metadata){
      pw_proxy_destroy(reinterpret_cast<pw_proxy*>(pw->metadata));
      pw->metadata = nullptr;
    }
    pw_proxy_destroy(reinterpret_cast<pw_proxy*>(pw->registry));
    pw->registry = nullptr;

    return pw->resolvedSinkName;
  }


  void AudioGrabber::_pipewireThread(
    std::string targetSinkName,
    PipewireAudioData* pw
  )
  {
    // Process-wide, init-once: reloads overlap two live grabbers (the
    // replacement builds before the old one tears down), so per-instance
    // pw_init()/pw_deinit() would deinit under the new instance. See
    // PipewireRuntime.hpp.
    ensurePipewireInitialized();

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

    // Empty targetSinkName -- matching WASAPI loopback needing no device
    // name -- resolves Pipewire's current default sink instead of requiring
    // one to be hand-configured.
    if(targetSinkName.empty()){
      targetSinkName = _resolveDefaultSinkName(core, pw);
      if(targetSinkName.empty()){
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

    // No pw_deinit(): PipeWire setup is process-wide and shared (see
    // ensurePipewireInitialized() above) -- tearing it down here would race
    // a replacement grabber built before this one was destroyed.
  }
}
