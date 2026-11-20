// C exports over BrowserEngine for the browser (Aurora-51nv.6). Strings in are UTF-8
// the caller put in module memory, strings out are owned by the module and valid
// until the next call. Every export catches and returns {"error": ...} JSON.
#include <cstdint>
#include <cstdlib>
#include <exception>
#include <string>

#include <emscripten.h>

#include "BrowserEngine.hpp"

namespace
{
  Aurora::Wasm::BrowserEngine& engine()
  {
    static Aurora::Wasm::BrowserEngine instance;
    return instance;
  }

  std::string failure(const char* what)
  {
    return nlohmann::json{{"error", "engine_exception"}, {"message", what}}.dump();
  }

  template<class Fn>
  const char* reply(Fn&& fn)
  {
    static std::string out;
    try{
      out = fn();
    }
    catch(const std::exception& e){
      out = failure(e.what());
    }
    catch(...){
      out = failure("unknown exception");
    }
    return out.c_str();
  }
}

extern "C"
{
  EMSCRIPTEN_KEEPALIVE void* aurora_alloc(std::size_t size) { return std::malloc(size ? size : 1); }
  EMSCRIPTEN_KEEPALIVE void aurora_free(void* ptr) { std::free(ptr); }

  EMSCRIPTEN_KEEPALIVE const char* aurora_init(const char* json)
  {
    return reply([&]{ return engine().init(json); });
  }
  EMSCRIPTEN_KEEPALIVE const char* aurora_set_zones(const char* json)
  {
    return reply([&]{ return engine().setZones(json); });
  }
  EMSCRIPTEN_KEEPALIVE const char* aurora_nodes()
  {
    return reply([&]{ return engine().nodes(); });
  }
  EMSCRIPTEN_KEEPALIVE const char* aurora_validate(const char* doc)
  {
    return reply([&]{ return engine().validate(doc); });
  }
  EMSCRIPTEN_KEEPALIVE const char* aurora_load_live(const char* doc)
  {
    return reply([&]{ return engine().loadLive(doc); });
  }
  EMSCRIPTEN_KEEPALIVE const char* aurora_open_preview(const char* session, const char* doc, const char* layout)
  {
    return reply([&]{ return engine().openPreview(session, doc, layout); });
  }
  EMSCRIPTEN_KEEPALIVE const char* aurora_reload_preview(const char* session, const char* doc)
  {
    return reply([&]{ return engine().reloadPreview(session, doc); });
  }
  EMSCRIPTEN_KEEPALIVE const char* aurora_close_preview(const char* session)
  {
    return reply([&]{ return engine().closePreview(session); });
  }
  EMSCRIPTEN_KEEPALIVE const char* aurora_feed_video(const std::uint8_t* rgba, int width, int height)
  {
    return reply([&]{
      engine().feedVideo(rgba, width, height);
      return std::string(R"({"ok":true})");
    });
  }
  EMSCRIPTEN_KEEPALIVE const char* aurora_feed_audio(const float* samples, int count, int sampleRate, int channels)
  {
    return reply([&]{
      engine().feedAudio(samples, std::size_t(count), unsigned(sampleRate), unsigned(channels));
      return std::string(R"({"ok":true})");
    });
  }
  EMSCRIPTEN_KEEPALIVE const char* aurora_step(float dt)
  {
    return reply([&]{ return engine().step(dt); });
  }
  EMSCRIPTEN_KEEPALIVE const char* aurora_live_colors()
  {
    return reply([&]{ return engine().liveColors(); });
  }
  EMSCRIPTEN_KEEPALIVE const char* aurora_preview_snapshot(const char* session)
  {
    return reply([&]{ return engine().previewSnapshot(session); });
  }
}
