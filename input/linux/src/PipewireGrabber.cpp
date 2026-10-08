#include <Aurora/Input/Linux/PipewireGrabber.hpp>
#include <Aurora/Input/Linux/PipewireFramerate.hpp>

#include <cerrno>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <sstream>
#include <future>
#include <fcntl.h>
#include <linux/dma-buf.h>
#include <sys/ioctl.h>
#include <sys/mman.h>
#include <unistd.h>

#include <Aurora/Input/Linux/GamescopeNodeMatch.hpp>
#include <Aurora/Input/Linux/PipewireFrameBuffer.hpp>
#include <Aurora/Input/Linux/PipewireRuntime.hpp>
#include <Aurora/Input/Linux/XdgDesktopPortal.hpp>

#if defined(__clang__)
  #pragma clang diagnostic push
  #pragma clang diagnostic ignored "-Wpedantic"
  #pragma clang diagnostic ignored "-Wmissing-field-initializers"
#elif defined(__GNUC__)
  #pragma GCC diagnostic push
  #pragma GCC diagnostic ignored "-Wpedantic"
  #pragma GCC diagnostic ignored "-Wmissing-field-initializers"
#endif

#include <spa/debug/types.h>
#include <spa/param/video/type-info.h>
#include <spa/utils/dict.h>

#if defined(__clang__)
  #pragma clang diagnostic pop
#elif defined(__GNUC__)
  #pragma GCC diagnostic pop
#endif


using namespace std::chrono_literals;


namespace
{
  // DRM_FORMAT_MOD_LINEAR (drm_fourcc.h), spelled out to avoid the dependency.
  constexpr uint64_t kDrmFormatModLinear = 0;

  double traceNowSeconds()
  {
    return std::chrono::duration<double>(std::chrono::steady_clock::now().time_since_epoch()).count();
  }


  // A DMA-BUF's CPU mapping, made in add_buffer and kept in pw_buffer::user_data.
  struct DmabufMapping
  {
    void* base;
    size_t size;
  };


  // The kernel asks callers to restart DMA_BUF_IOCTL_SYNC on EINTR/EAGAIN.
  bool dmabufSync(int fd, uint64_t flags)
  {
    dma_buf_sync sync{};
    sync.flags = flags;
    int result;
    do{
      result = ioctl(fd, DMA_BUF_IOCTL_SYNC, &sync);
    } while(result == -1 && (errno == EINTR || errno == EAGAIN));
    return result == 0;
  }


#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wpedantic"
#pragma GCC diagnostic ignored "-Wmissing-field-initializers"
  // The formats we accept. Only 4-byte-per-pixel formats -- _onStreamProcess
  // always builds a CV_8UC4 view, so 3-byte RGB or YUV would misread the
  // buffer. With offerDmabuf (Aurora-1t1), the same format with a mandatory
  // LINEAR modifier goes FIRST so a producer that can do DMA-BUF picks it;
  // the plain one stays as the fallback. Returns how many were written.
  uint32_t buildFormatParams(
    spa_pod_builder* b,
    bool offerDmabuf,
    const spa_pod* out[2]
  )
  {
    auto r1 = spa_rectangle(320, 240);
    auto r2 = spa_rectangle(1, 1);
    auto r3 = spa_rectangle(4096, 4096);

    auto f1 = spa_fraction(25, 1);
    auto f2 = spa_fraction(0, 1);
    auto f3 = spa_fraction(1000, 1);

    uint32_t count = 0;

    if(offerDmabuf){
      spa_pod_frame frames[2];
      spa_pod_builder_push_object(b, &frames[0], SPA_TYPE_OBJECT_Format, SPA_PARAM_EnumFormat);
      spa_pod_builder_add(
        b,
        SPA_FORMAT_mediaType,    SPA_POD_Id(SPA_MEDIA_TYPE_video),
        SPA_FORMAT_mediaSubtype, SPA_POD_Id(SPA_MEDIA_SUBTYPE_raw),
        SPA_FORMAT_VIDEO_format, SPA_POD_CHOICE_ENUM_Id(
          4,
          SPA_VIDEO_FORMAT_RGBA,
          SPA_VIDEO_FORMAT_RGBA,
          SPA_VIDEO_FORMAT_RGBx,
          SPA_VIDEO_FORMAT_BGRx
        ),
        SPA_FORMAT_VIDEO_size,      SPA_POD_CHOICE_RANGE_Rectangle(&r1, &r2, &r3),
        SPA_FORMAT_VIDEO_framerate, SPA_POD_CHOICE_RANGE_Fraction(&f1, &f2, &f3),
        0
      );
      spa_pod_builder_prop(b, SPA_FORMAT_VIDEO_modifier, SPA_POD_PROP_FLAG_MANDATORY);
      spa_pod_builder_push_choice(b, &frames[1], SPA_CHOICE_Enum, 0);
      spa_pod_builder_long(b, kDrmFormatModLinear);  // default
      spa_pod_builder_long(b, kDrmFormatModLinear);  // the only alternative
      spa_pod_builder_pop(b, &frames[1]);
      out[count++] = static_cast<const spa_pod*>(spa_pod_builder_pop(b, &frames[0]));
    }

    out[count++] = static_cast<const spa_pod*>(
      spa_pod_builder_add_object(
        b,
        SPA_TYPE_OBJECT_Format, SPA_PARAM_EnumFormat,
        SPA_FORMAT_mediaType,       SPA_POD_Id(SPA_MEDIA_TYPE_video),
        SPA_FORMAT_mediaSubtype,    SPA_POD_Id(SPA_MEDIA_SUBTYPE_raw),
        SPA_FORMAT_VIDEO_format,    SPA_POD_CHOICE_ENUM_Id(
          4,
          SPA_VIDEO_FORMAT_RGBA,
          SPA_VIDEO_FORMAT_RGBA,
          SPA_VIDEO_FORMAT_RGBx,
          SPA_VIDEO_FORMAT_BGRx
        ),
        SPA_FORMAT_VIDEO_size,      SPA_POD_CHOICE_RANGE_Rectangle(&r1, &r2, &r3),
        SPA_FORMAT_VIDEO_framerate, SPA_POD_CHOICE_RANGE_Fraction(&f1, &f2, &f3)
      )
    );

    return count;
  }
#pragma GCC diagnostic pop
}


namespace Aurora::Input::Linux
{
  PipewireGrabber::PipewireGrabber(
    bool useGamescope,
    IRestoreTokenStore* restoreTokenStore
  )
  {
    m_pwData.useGamescope = useGamescope;
    m_capture.restoreTokenStore = restoreTokenStore ? restoreTokenStore : &m_nullRestoreTokenStore;

    if(useGamescope){
      // Gamescope sessions don't run an xdg-desktop-portal ScreenCast backend,
      // so there's no session/fd to negotiate. The Pipewire thread connects
      // directly to the local socket and finds gamescope's node itself.
    }
    else{
      std::promise<bool> fdReadyPromise;
      auto fdReadyFuture = fdReadyPromise.get_future();
      m_capture.fdReadyPromise = std::move(fdReadyPromise);
      m_xdgThread.emplace(_initCapture, &m_capture);

      // Bounded, not indefinite -- but generous, unlike the machine-only
      // handshake below: this wait includes the human answering the
      // portal's source-picker dialog (first run, or whenever no restore
      // token applies). A dismissed dialog resolves promptly as false;
      // the bound covers the portal never replying, or the user ignoring
      // the dialog -- either way the HTTP request thread that built this
      // grabber (PUT /api/config, POST /api/reload) must not hang forever.
      // Same _stop()-then-throw shape as AudioGrabber.cpp; _stop() cancels
      // the portal handshake, so no late callback can touch this promise
      // after the throw destroys it.
      const bool portalSettled =
        fdReadyFuture.wait_for(std::chrono::seconds(60)) == std::future_status::ready;
      if(!portalSettled || !fdReadyFuture.get()){
        _stop();
        if(!portalSettled){
          throw std::runtime_error(
            "PipewireGrabber: portal ScreenCast handshake didn't settle within 60s "
            "-- the source-picker dialog may still be open, or the portal never replied"
          );
        }
        // Stable token the WebUI maps to plain copy (messages.js).
        if(m_capture.userDeclined){
          throw std::runtime_error("screen_share_declined: " + m_capture.failureReason);
        }
        throw std::runtime_error(
          m_capture.failureReason.empty()
            ? std::string("Failed to get monitor file descriptor")
            : "Failed to get monitor file descriptor: " + m_capture.failureReason
        );
      }
    }

    auto configDataReadyFuture = m_pwData.screenDataReadyPromise.get_future();
    m_pipewireThread.emplace(_pipewireThread, &m_capture, &m_pwData);

    // Bounded like AudioGrabber.cpp's own wait -- the portal has handed
    // over a live fd by now, so this is a machine-only handshake (stream
    // params) with no human in the loop; 5s matches that precedent.
    if(configDataReadyFuture.wait_for(std::chrono::seconds(5)) != std::future_status::ready || !configDataReadyFuture.get()){
      _stop();
      throw std::runtime_error("Failed to initialize Pipewire capture");
    }
  }


  PipewireGrabber::~PipewireGrabber()
  {
    _stop();
  }


  const std::string& PipewireGrabber::name() const
  {
    static const std::string s_identifier = "PipewireGrabber";
    return s_identifier;
  }


  IVideoInput::Resolution PipewireGrabber::displayResolution() const
  {
    return {m_pwData.format.info.raw.size.width, m_pwData.format.info.raw.size.height};
  }


  IVideoInput::RefreshRate PipewireGrabber::displayRefreshRate() const
  {
    // max_framerate is an unreduced fraction -- .num alone once persisted
    // as a 15M "Hz" refreshRate and wedged the runtime loop. Reduce it
    // (pure helper, covered in PipewireTests.cpp).
    const auto& framerate = m_pwData.format.info.raw.max_framerate;
    return reduceFramerate(framerate.num, framerate.denom);
  }


  void PipewireGrabber::grabFrameSubsample(
    Contracts::ImageData& imageData
  )
  {
    auto lock = std::lock_guard(m_pwData.frameDoubleBuffer.mutex);
    imageData = m_pwData.frameDoubleBuffer.frame.at(0);
  }


  void PipewireGrabber::_onCoreInfoCallback(
    void* /*userData*/,
    const pw_core_info* /*info*/
  )
  {
  }


  void PipewireGrabber::_onCoreDoneCallback(
    void* userData,
    uint32_t id,
    int seq
  )
  {
    PipewireData* pw = static_cast<PipewireData*>(userData);

    // Gamescope node discovery: the registry has advertised all currently
    // available globals by the time this sync's "done" fires, so it's safe
    // to stop the loop and check whether "gamescope" showed up.
    if(pw->discoveryMode && id == PW_ID_CORE && seq == pw->discoverySyncSeq){
      pw_main_loop_quit(pw->loop);
    }
  }


  void PipewireGrabber::_onCoreErrorCallback(
    void* /*userData*/,
    uint32_t /*id*/,
    int /*seq*/,
    int /*res*/,
    const char* /*message*/
  )
  {
  }


  void PipewireGrabber::_onStreamProcess(
    void* userdata
  )
  {
    PipewireData* pw = static_cast<PipewireData*>(userdata);
    pw_buffer* pwBuffer;

    if((pwBuffer = pw_stream_dequeue_buffer(pw->stream)) == NULL){
      return;
    }

    spa_buffer* spaBuffer = pwBuffer->buffer;
    spa_data& data = spaBuffer->datas[0];

    // A callback without usable pixels: hand the buffer back, and warn once
    // if nothing but these has arrived for a while (the 1t1 freeze).
    auto skip = [&](PipewireTrace::SkipReason reason, int32_t chunkFlags, uint32_t chunkSize){
      const double now = traceNowSeconds();
      if(pw->trace.enabled){
        pw->trace.onSkipped(now, data.type, reason, chunkFlags, chunkSize);
      }
      if(pw->staleWatch.onUnusable(now)){
        std::fprintf(
          stderr,
          "[pw] capture stalled: %.1fs of buffers without pixels (dataType=%u chunkFlags=0x%x); "
          "serving the last good frame\n",
          pw->staleWatch.stalledFor(now), data.type, static_cast<unsigned>(chunkFlags)
        );
      }
      pw_stream_queue_buffer(pw->stream, pwBuffer);
    };

    // Counts toward giving up on DMA-BUF; the caller still skips the buffer.
    auto dmabufReadFailed = [&](const char* why){
      if(!pw->dmabufFallback.disabled()){
        std::fprintf(stderr, "[pw-dmabuf] DMA-BUF read failed: %s\n", why);
      }
      if(pw->dmabufFallback.onReadFailed()){
        std::fprintf(
          stderr, "[pw-dmabuf] %d DMA-BUF reads failed in a row; renegotiating shared memory\n",
          DmabufReadFallback::kMaxConsecutiveFailures
        );
        pw->dmabufOffered = false;
        if(pw->renegotiateEvent){
          pw_loop_signal_event(pw_main_loop_get_loop(pw->loop), pw->renegotiateEvent);
        }
      }
    };

    // DMA-BUFs are never mapped by PW_STREAM_FLAG_MAP_BUFFERS, so a NULL data
    // pointer is expected for them; _onStreamAddBuffer mapped the fd instead.
    const bool isDmaBuf = data.type == SPA_DATA_DmaBuf && data.fd >= 0;

    if(data.data == NULL && !isDmaBuf){
      const auto* skipChunk = data.chunk;
      skip(PipewireTrace::SkipReason::NoData, skipChunk ? skipChunk->flags : -1, skipChunk ? skipChunk->size : 0);
      return;
    }

    const auto width = static_cast<int>(pw->format.info.raw.size.width);
    const auto height = static_cast<int>(pw->format.info.raw.size.height);

    if(width == 0 || height == 0){
      pw_stream_queue_buffer(pw->stream, pwBuffer);
      return;
    }

    auto* chunk = data.chunk;

    if(chunk == nullptr || chunk->size == 0){
      skip(
        chunk == nullptr ? PipewireTrace::SkipReason::NoChunk : PipewireTrace::SkipReason::EmptyChunk,
        chunk ? chunk->flags : -1, chunk ? chunk->size : 0
      );
      return;
    }

    const size_t step = chunk->stride > 0
      ? static_cast<size_t>(chunk->stride)
      : static_cast<size_t>(width) * 4;

    void* readPtr = data.data;
    void* localMap = MAP_FAILED;
    size_t localMapSize = 0;
    const int fd = static_cast<int>(data.fd);

    if(isDmaBuf){
      // The CPU must bracket reads of a DMA-BUF with a sync, or it can see
      // stale cache lines. Linear modifier only (the only one we offer).
      const auto* mapping = static_cast<const DmabufMapping*>(pwBuffer->user_data);
      const char* failure = nullptr;
      if(mapping == nullptr){
        failure = "buffer could not be mapped";
      }
      else if(!frameFitsBuffer(chunk->offset, step, width, height, data.maxsize)){
        failure = "frame does not fit the buffer";
      }
      else if(!dmabufSync(fd, DMA_BUF_SYNC_START | DMA_BUF_SYNC_READ)){
        failure = "sync start failed";
      }
      if(failure){
        dmabufReadFailed(failure);
        skip(PipewireTrace::SkipReason::NoData, chunk->flags, chunk->size);
        return;
      }
      readPtr = static_cast<uint8_t*>(mapping->base) + data.mapoffset;
    }
    else if(data.type == SPA_DATA_MemFd && fd >= 0){
      // Some xdg-desktop-portal / pipewire combinations advertise SPA_DATA_MemFd
      // buffers without auto-mapping them with PROT_READ even when
      // PW_STREAM_FLAG_MAP_BUFFERS is set. Reading via the provided
      // datas[0].data pointer then segfaults. Map the fd ourselves for the
      // duration of this frame as a defensive fallback.
      localMapSize = static_cast<size_t>(data.maxsize) + chunk->offset;
      localMap = mmap(nullptr, localMapSize, PROT_READ, MAP_SHARED, fd, 0);
      if(localMap != MAP_FAILED){
        readPtr = localMap;
      }
    }

    // Tag from what was actually negotiated -- RGBx shares RGBA's byte
    // layout (alpha unused), BGRx needs BGRA's channel order instead.
    Contracts::PixelFormat pixelFormat = Contracts::PixelFormat::RGBA;
    if(pw->format.info.raw.format == SPA_VIDEO_FORMAT_BGRx){
      pixelFormat = Contracts::PixelFormat::BGRA;
    }

    // See PipewireFrameBuffer.hpp -- clones the buffer, since Pipewire's
    // memory becomes invalid after queue_buffer() below.
    const uint8_t* pixels = static_cast<const uint8_t*>(readPtr) + chunk->offset;
    Contracts::ImageData capturedFrame = toOwnedImage(pixels, width, height, step, pixelFormat);
    const uint64_t contentHash = pw->trace.enabled ? sampleContentHash(pixels, chunk->size) : 0;

    if(localMap != MAP_FAILED){
      munmap(localMap, localMapSize);
    }

    if(isDmaBuf){
      if(!dmabufSync(fd, DMA_BUF_SYNC_END | DMA_BUF_SYNC_READ)){
        dmabufReadFailed("sync end failed");
        skip(PipewireTrace::SkipReason::NoData, chunk->flags, chunk->size);
        return;
      }
      pw->dmabufFallback.onReadOk();
    }

    if(pw->trace.enabled){
      const auto* header = static_cast<const spa_meta_header*>(
        spa_buffer_find_meta_data(spaBuffer, SPA_META_Header, sizeof(spa_meta_header))
      );
      int damageRegions = -1;
      if(const spa_meta* damage = spa_buffer_find_meta(spaBuffer, SPA_META_VideoDamage)){
        damageRegions = 0;
        const auto* region = static_cast<const spa_meta_region*>(damage->data);
        for(uint32_t i = 0; i < damage->size / sizeof(spa_meta_region) && spa_meta_region_is_valid(&region[i]); ++i){
          ++damageRegions;
        }
      }
      pw->trace.onFrame(
        traceNowSeconds(),
        contentHash,
        header ? static_cast<int64_t>(header->seq) : -1,
        header ? header->pts : -1,
        data.type,
        chunk->flags,
        damageRegions
      );
    }

    if(pw->staleWatch.onFrame()){
      std::fprintf(stderr, "[pw] capture recovered: frames with pixels are arriving again\n");
    }

    {
      auto lock = std::lock_guard(pw->frameDoubleBuffer.mutex);
      std::swap(pw->frameDoubleBuffer.frame[0], pw->frameDoubleBuffer.frame[1]);
      pw->frameDoubleBuffer.frame[0] = std::move(capturedFrame);
    }
    pw_stream_queue_buffer(pw->stream, pwBuffer);
  }


  void PipewireGrabber::_onStreamAddBuffer(
    void* userdata,
    pw_buffer* buffer
  )
  {
    PipewireData* pw = static_cast<PipewireData*>(userdata);
    spa_data& data = buffer->buffer->datas[0];

    if(data.type != SPA_DATA_DmaBuf || data.fd < 0){
      return;
    }

    // Left unmapped (user_data NULL) on failure; _onStreamProcess counts
    // that as a failed read, which ends in the shared-memory fallback.
    if(pw->dmabufForceFail){
      return;
    }

    const size_t size = static_cast<size_t>(data.mapoffset) + data.maxsize;
    void* base = mmap(nullptr, size, PROT_READ, MAP_SHARED, static_cast<int>(data.fd), 0);
    if(base == MAP_FAILED){
      std::fprintf(stderr, "[pw-dmabuf] mmap of a DMA-BUF failed (errno %d)\n", errno);
      return;
    }
    buffer->user_data = new DmabufMapping{base, size};
  }


  void PipewireGrabber::_onStreamRemoveBuffer(
    void* /*userdata*/,
    pw_buffer* buffer
  )
  {
    auto* mapping = static_cast<DmabufMapping*>(buffer->user_data);
    if(mapping == nullptr){
      return;
    }
    munmap(mapping->base, mapping->size);
    delete mapping;
    buffer->user_data = nullptr;
  }


  void PipewireGrabber::_onRenegotiateWithoutDmabuf(
    void* userdata,
    uint64_t /*count*/
  )
  {
    PipewireData* pw = static_cast<PipewireData*>(userdata);
    if(pw->stream == nullptr){
      return;
    }

    uint8_t storage[2048];
    spa_pod_builder b = SPA_POD_BUILDER_INIT(storage, sizeof(storage));
    const spa_pod* params[2];
    const uint32_t count = buildFormatParams(&b, pw->dmabufOffered, params);
    pw_stream_update_params(pw->stream, params, count);
  }


  void PipewireGrabber::_onTraceTimer(
    void* userdata,
    uint64_t /*expirations*/
  )
  {
    PipewireData* pw = static_cast<PipewireData*>(userdata);
    std::fprintf(stderr, "%s\n", pw->trace.takeSummary(traceNowSeconds()).c_str());
  }


  void PipewireGrabber::_onStreamParamChanged(
    void* userdata,
    uint32_t id,
    const spa_pod* param
  )
  {
    PipewireData* pw = static_cast<PipewireData*>(userdata);

    if(pw->trace.enabled){
      std::fprintf(
        stderr, "[pw-trace] param_changed id=%s param=%s\n",
        spa_debug_type_find_name(spa_type_param, id), param == NULL ? "NULL" : "set"
      );
    }

    if(param == NULL || id != SPA_PARAM_Format){
      return;
    }

    if(spa_format_parse(param, &pw->format.media_type, &pw->format.media_subtype) < 0){
      return;
    }

    if(pw->format.media_type != SPA_MEDIA_TYPE_video || pw->format.media_subtype != SPA_MEDIA_SUBTYPE_raw){
      return;
    }

    if(spa_format_video_raw_parse(param, &pw->format.info.raw) < 0){
      return;
    }

    if(pw->trace.enabled){
      const auto& raw = pw->format.info.raw;
      std::fprintf(
        stderr, "[pw-trace] format=%s size=%ux%u fps=%u/%u modifier=%s\n",
        spa_debug_type_find_name(spa_type_video_format, raw.format),
        raw.size.width, raw.size.height, raw.max_framerate.num, raw.max_framerate.denom,
        spa_pod_find_prop(param, NULL, SPA_FORMAT_VIDEO_modifier) ? "present" : "none"
      );
    }

    // A modifier in the negotiated format means the producer will hand out
    // DMA-BUFs, so say we accept that buffer type. After a fallback to
    // shared memory, replace that request, or no buffer type would match.
    const bool hasModifier = spa_pod_find_prop(param, NULL, SPA_FORMAT_VIDEO_modifier) != NULL;
    if(pw->dmabufEnabled && (hasModifier || pw->dmabufBuffersRequested)){
      const int dataTypes = hasModifier
        ? (1 << SPA_DATA_DmaBuf)
        : (1 << SPA_DATA_MemFd) | (1 << SPA_DATA_MemPtr);
      uint8_t bufferParamStorage[512];
      spa_pod_builder bufferBuilder = SPA_POD_BUILDER_INIT(bufferParamStorage, sizeof(bufferParamStorage));
      const spa_pod* bufferParam = static_cast<const spa_pod*>(spa_pod_builder_add_object(
        &bufferBuilder,
        SPA_TYPE_OBJECT_ParamBuffers, SPA_PARAM_Buffers,
        SPA_PARAM_BUFFERS_buffers,  SPA_POD_CHOICE_RANGE_Int(8, 2, 16),
        SPA_PARAM_BUFFERS_blocks,   SPA_POD_Int(1),
        SPA_PARAM_BUFFERS_dataType, SPA_POD_CHOICE_FLAGS_Int(dataTypes)
      ));
      pw_stream_update_params(pw->stream, &bufferParam, 1);
      pw->dmabufBuffersRequested = hasModifier;
      std::fprintf(
        stderr, "[pw-dmabuf] %s\n",
        hasModifier ? "modifier negotiated; requested DmaBuf buffers" : "no modifier; requested shared-memory buffers"
      );
    }

    if(!pw->promiseSetAlready){
      pw->screenDataReadyPromise.set_value(true);
      pw->promiseSetAlready = true;
    }
  }


  void PipewireGrabber::_onRegistryGlobal(
    void* userdata,
    uint32_t id,
    uint32_t /*permissions*/,
    const char* type,
    uint32_t /*version*/,
    const spa_dict* props
  )
  {
    PipewireData* pw = static_cast<PipewireData*>(userdata);

    if(pw->gamescopeNodeId != 0 || props == nullptr){
      return;
    }

    const char* nodeName = std::string(type) == PW_TYPE_INTERFACE_Node
      ? spa_dict_lookup(props, PW_KEY_NODE_NAME)
      : nullptr;

    if(matchesGamescopeNode(std::string(type) == PW_TYPE_INTERFACE_Node, nodeName)){
      pw->gamescopeNodeId = id;
    }
  }


  void PipewireGrabber::_initCapture(
    XdgDesktopPortal::Capture* capture
  )
  {
    XdgDesktopPortal::screencastPortalDesktopCaptureCreate(capture, XdgDesktopPortal::CaptureType::Monitor, true);

    GMainLoop* gmain = g_main_loop_new(NULL, FALSE);

    while(capture->updateXdgContext){
      g_main_context_iteration(g_main_loop_get_context(gmain), false);
    }

    g_main_loop_unref(gmain);
  }


  void PipewireGrabber::_pipewireThread(
    XdgDesktopPortal::Capture* capture,
    PipewireData* pw
  )
  {
    // Process-wide, init-once -- see AudioGrabber.cpp / PipewireRuntime.hpp.
    // A mode-switch reload builds the replacement grabber before destroying
    // this one, so per-instance pw_init()/pw_deinit() would deinit under it.
    ensurePipewireInitialized();
    pw->trace.enabled = pipewireTraceEnabledFrom(std::getenv("AURORA_DEV_PW_TRACE"));
    pw->dmabufEnabled = dmabufEnabledFrom(std::getenv("AURORA_PW_DMABUF"));
    pw->dmabufForceFail = pipewireTraceEnabledFrom(std::getenv("AURORA_DEV_PW_DMABUF_FAIL"));
    pw->dmabufOffered = pw->dmabufEnabled;
    pw_core_events coreEvents = {};
    coreEvents.version = PW_VERSION_CORE_EVENTS;
    coreEvents.info = _onCoreInfoCallback;
    coreEvents.done = _onCoreDoneCallback;
    coreEvents.error = _onCoreErrorCallback;

    pw_stream_events streamEvents = {};
    streamEvents.version = PW_VERSION_STREAM_EVENTS;
    streamEvents.param_changed = _onStreamParamChanged;
    streamEvents.process = _onStreamProcess;
    streamEvents.add_buffer = _onStreamAddBuffer;
    streamEvents.remove_buffer = _onStreamRemoveBuffer;

    pw->loop = pw_main_loop_new(NULL);
    pw->context = pw_context_new(pw_main_loop_get_loop(pw->loop), NULL, 0);

    auto core = pw->useGamescope
      ? pw_context_connect(pw->context, NULL, 0)
      : pw_context_connect_fd(pw->context, fcntl(static_cast<int>(capture->pwFd), F_DUPFD_CLOEXEC, 5), NULL, 0);

    if(core == nullptr){
      if(!pw->promiseSetAlready){
        pw->screenDataReadyPromise.set_value(false);
        pw->promiseSetAlready = true;
      }
      pw_context_destroy(pw->context);
      pw->context = nullptr;
      pw_main_loop_destroy(pw->loop);
      pw->loop = nullptr;
      return;
    }

#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wpedantic"
#pragma GCC diagnostic ignored "-Wmissing-field-initializers"
    pw_core_add_listener(core, &pw->coreListener, &coreEvents, pw);

    uint32_t targetNode = capture->pwNode;

    if(pw->useGamescope){
      pw_registry_events registryEvents = {};
      registryEvents.version = PW_VERSION_REGISTRY_EVENTS;
      registryEvents.global = _onRegistryGlobal;

      pw_registry* registry = pw_core_get_registry(core, PW_VERSION_REGISTRY, 0);
      spa_hook registryListener{};
      pw_registry_add_listener(registry, &registryListener, &registryEvents, pw);

      pw->discoveryMode = true;
      pw->discoverySyncSeq = pw_core_sync(core, PW_ID_CORE, 0);
      pw_main_loop_run(pw->loop);
      pw->discoveryMode = false;

      spa_hook_remove(&registryListener);
      pw_proxy_destroy(reinterpret_cast<pw_proxy*>(registry));

      if(pw->gamescopeNodeId == 0){
        if(!pw->promiseSetAlready){
          pw->screenDataReadyPromise.set_value(false);
          pw->promiseSetAlready = true;
        }
        pw_core_disconnect(core);
        pw_context_destroy(pw->context);
        pw->context = nullptr;
        pw_main_loop_destroy(pw->loop);
        pw->loop = nullptr;
        return;
      }

      targetNode = pw->gamescopeNodeId;
    }

    auto props = pw_properties_new(
      PW_KEY_MEDIA_TYPE, "Video",
      PW_KEY_MEDIA_CATEGORY, "Capture",
      PW_KEY_MEDIA_ROLE, "Screen",
      NULL
    );

    std::string streamName = "AuroraStream";

    pw->stream = pw_stream_new_simple(
      pw_main_loop_get_loop(pw->loop),
      streamName.c_str(),
      props,
      &streamEvents,
      pw
    );

    uint8_t buffer[2048];
    spa_pod_builder b = SPA_POD_BUILDER_INIT(buffer, sizeof(buffer));
    const spa_pod* params[2];
    const uint32_t paramCount = buildFormatParams(&b, pw->dmabufOffered, params);

    if(pw->dmabufOffered){
      pw->renegotiateEvent = pw_loop_add_event(pw_main_loop_get_loop(pw->loop), _onRenegotiateWithoutDmabuf, pw);
      std::fprintf(stderr, "[pw-dmabuf] offering LINEAR DMA-BUF first, plain format as fallback\n");
      if(pw->dmabufForceFail){
        std::fprintf(stderr, "[pw-dmabuf] AURORA_DEV_PW_DMABUF_FAIL: every DMA-BUF map will fail\n");
      }
    }
#pragma GCC diagnostic pop

    pw_stream_connect(pw->stream, PW_DIRECTION_INPUT, targetNode, static_cast<pw_stream_flags>(PW_STREAM_FLAG_AUTOCONNECT | PW_STREAM_FLAG_MAP_BUFFERS), params, paramCount);

    if(pw->trace.enabled){
      pw->traceTimer = pw_loop_add_timer(pw_main_loop_get_loop(pw->loop), _onTraceTimer, pw);
      timespec first{1, 0};
      timespec every{1, 0};
      pw_loop_update_timer(pw_main_loop_get_loop(pw->loop), pw->traceTimer, &first, &every, false);
      std::fprintf(stderr, "[pw-trace] enabled (AURORA_DEV_PW_TRACE), one summary per second\n");
    }

    pw_main_loop_run(pw->loop);

    if(pw->traceTimer){
      pw_loop_destroy_source(pw_main_loop_get_loop(pw->loop), pw->traceTimer);
      pw->traceTimer = nullptr;
    }

    if(pw->renegotiateEvent){
      pw_loop_destroy_source(pw_main_loop_get_loop(pw->loop), pw->renegotiateEvent);
      pw->renegotiateEvent = nullptr;
    }

    pw_stream_disconnect(pw->stream);

    g_clear_pointer(&pw->stream, pw_stream_destroy);

    g_clear_pointer(&pw->context, pw_context_destroy);
    g_clear_pointer(&pw->loop, pw_main_loop_destroy);
  }


  void PipewireGrabber::_teardownPipewire()
  {
    if(m_pwData.loop){
      pw_main_loop_quit(m_pwData.loop);
    }

    if(m_pipewireThread.has_value()){
      m_pipewireThread.value().join();
      m_pipewireThread.reset();
    }

    if(m_capture.pwFd > 0){
      close(static_cast<int>(m_capture.pwFd));
      m_capture.pwFd = 0;
    }

    // No pw_deinit(): PipeWire setup is process-wide and shared (see
    // ensurePipewireInitialized() above) -- tearing it down here would race
    // a replacement grabber built before this one was destroyed.
  }


  void PipewireGrabber::_stop()
  {
    _teardownPipewire();

    // Stop XdgPortal (not used when capturing gamescope's node directly)
    if(!m_pwData.useGamescope){
      m_capture.updateXdgContext = false;
      XdgDesktopPortal::screencastPortalCaptureDestroy(&m_capture);
      if(m_xdgThread.has_value()){
        m_xdgThread.value().join();
        m_xdgThread.reset();
      }
    }

    if(m_pipewireThread.has_value()){
      m_pipewireThread.value().join();
      m_pipewireThread.reset();
    }
  }
}
