#include <Aurora/Input/Linux/PipewireRuntime.hpp>

#include <mutex>

#include <pipewire/pipewire.h>

namespace Aurora::Input::Linux
{
  void ensurePipewireInitialized()
  {
    static std::once_flag s_initOnce;
    std::call_once(s_initOnce, []{
      pw_init(nullptr, nullptr);
    });
  }
}
