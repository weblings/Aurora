#include <Aurora/Input/Linux/AudioSinkList.hpp>
#include <Aurora/Input/Linux/PipewireRuntime.hpp>

#include <chrono>
#include <future>
#include <mutex>
#include <thread>

#if defined(__clang__)
  #pragma clang diagnostic push
  #pragma clang diagnostic ignored "-Wpedantic"
  #pragma clang diagnostic ignored "-Wmissing-field-initializers"
#elif defined(__GNUC__)
  #pragma GCC diagnostic push
  #pragma GCC diagnostic ignored "-Wpedantic"
  #pragma GCC diagnostic ignored "-Wmissing-field-initializers"
#endif

#include <pipewire/pipewire.h>
#include <spa/utils/string.h>

#if defined(__clang__)
  #pragma clang diagnostic pop
#elif defined(__GNUC__)
  #pragma GCC diagnostic pop
#endif

namespace Aurora::Input::Linux
{
  namespace
  {
    struct EnumState
    {
      pw_main_loop* loop{nullptr};
      std::vector<AudioSinkInfo> sinks;
      int syncSeq{0};
    };

    void onRegistryGlobal(
      void* userdata,
      uint32_t /*id*/,
      uint32_t /*permissions*/,
      const char* type,
      uint32_t /*version*/,
      const spa_dict* props
    )
    {
      auto* state = static_cast<EnumState*>(userdata);

      if(!spa_streq(type, PW_TYPE_INTERFACE_Node)){
        return;
      }

      // props is null-safe here -- matchAudioSinkNode treats missing
      // keys as non-sinks rather than crashing on them.
      const char* mediaClass = props ? spa_dict_lookup(props, PW_KEY_MEDIA_CLASS) : nullptr;
      const char* nodeName = props ? spa_dict_lookup(props, PW_KEY_NODE_NAME) : nullptr;
      const char* nodeDescription = props ? spa_dict_lookup(props, PW_KEY_NODE_DESCRIPTION) : nullptr;

      if(auto sink = matchAudioSinkNode(true, mediaClass, nodeName, nodeDescription)){
        state->sinks.push_back(std::move(*sink));
      }
    }

    void onCoreDone(void* userdata, uint32_t id, int seq)
    {
      auto* state = static_cast<EnumState*>(userdata);
      if(id == PW_ID_CORE && seq == state->syncSeq){
        pw_main_loop_quit(state->loop);
      }
    }

    // The worker's loop, published for the timeout path's cross-thread
    // quit. Valid only while non-null under the lock -- the worker
    // clears it before tearing anything down, so the timeout path can
    // never quit a destroyed loop.
    struct SharedLoop
    {
      std::mutex mutex;
      pw_main_loop* loop{nullptr};
      bool finished{false};
    };

    void runEnumeration(SharedLoop* shared, std::promise<std::vector<AudioSinkInfo>>* done)
    {
      try{
        EnumState state;
        state.loop = pw_main_loop_new(nullptr);
        if(state.loop == nullptr){
          done->set_value({});
          return;
        }

        pw_context* context = pw_context_new(pw_main_loop_get_loop(state.loop), nullptr, 0);
        if(context == nullptr){
          pw_main_loop_destroy(state.loop);
          done->set_value({});
          return;
        }

        // Direct local connection, no portal -- same as AudioGrabber's
        // own discovery connection (listing nodes needs no permission
        // prompt).
        pw_core* core = pw_context_connect(context, nullptr, 0);
        if(core == nullptr){
          pw_context_destroy(context);
          pw_main_loop_destroy(state.loop);
          done->set_value({});
          return;
        }

        spa_hook coreListener{};
        pw_core_events coreEvents{};
        coreEvents.version = PW_VERSION_CORE_EVENTS;
        coreEvents.done = onCoreDone;
        pw_core_add_listener(core, &coreListener, &coreEvents, &state);

        pw_registry* registry = pw_core_get_registry(core, PW_VERSION_REGISTRY, 0);
        spa_hook registryListener{};
        if(registry != nullptr){
          pw_registry_events registryEvents{};
          registryEvents.version = PW_VERSION_REGISTRY_EVENTS;
          registryEvents.global = onRegistryGlobal;
          pw_registry_add_listener(registry, &registryListener, &registryEvents, &state);
        }

        {
          std::lock_guard<std::mutex> lock(shared->mutex);
          shared->loop = state.loop;
        }
        state.syncSeq = pw_core_sync(core, PW_ID_CORE, 0);
        pw_main_loop_run(state.loop);
        {
          std::lock_guard<std::mutex> lock(shared->mutex);
          shared->loop = nullptr;
          shared->finished = true;
        }

        // Listener teardown before anything they reference goes away:
        // the core listener is attached to core itself (outlives this
        // call via the context), so leaving it would dangle into this
        // stack frame on a late Done -- the exact segfault
        // docs/lessons/input.md records for _resolveDefaultSinkName's
        // second sync.
        spa_hook_remove(&coreListener);
        if(registry != nullptr){
          spa_hook_remove(&registryListener);
          pw_proxy_destroy(reinterpret_cast<pw_proxy*>(registry));
        }
        // Core intentionally not destroyed explicitly -- context
        // teardown owns it, same as AudioGrabber::_pipewireThread's own
        // connection.
        pw_context_destroy(context);
        pw_main_loop_destroy(state.loop);

        done->set_value(std::move(state.sinks));
      }
      catch(...){
        try{
          done->set_value({});
        }
        catch(...){
        }
      }
    }
  }

  std::vector<AudioSinkInfo> enumerateAudioSinks()
  {
    // Process-wide, init-once, never de-inited -- same reload-overlap
    // reasoning as AudioGrabber (see PipewireRuntime.hpp). This runs
    // beside live grabber threads, each on its own loop/context/core.
    ensurePipewireInitialized();

    // Bound, not indefinite: this runs on an HTTP handler thread, so an
    // unresponsive daemon must time out, not hang the request. Same
    // worker-thread + future + cross-thread-quit shape as AudioGrabber's
    // constructor/5s-ready-wait/_stop -- deliberately NOT a pw_loop
    // timer: arming one before pw_main_loop_run broke registry dispatch
    // outright on this stack (sync Done arrived instantly with zero
    // globals; see docs/lessons/input.md), mechanism unknown.
    SharedLoop shared;
    std::promise<std::vector<AudioSinkInfo>> done;
    auto future = done.get_future();
    std::thread worker(runEnumeration, &shared, &done);

    const bool ready = future.wait_for(std::chrono::seconds(3)) == std::future_status::ready;
    if(!ready){
      std::lock_guard<std::mutex> lock(shared.mutex);
      // finished (or already null) means the worker beat us here -- its
      // loop is gone or going, and quitting it would be use-after-free.
      if(!shared.finished && shared.loop != nullptr){
        pw_main_loop_quit(shared.loop);
      }
    }
    worker.join();

    if(ready){
      return future.get();
    }
    return {};
  }
}
