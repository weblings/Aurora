#include <Aurora/Runtime/MonitorSelector.hpp>

namespace Aurora::Runtime
{
  void selectConfiguredMonitor(Input::IVideoInput& input, const Config& config)
  {
    const auto& saved = config.activeMonitorName();
    if(saved.empty()){
      return;
    }

    // Key first, then name, so a pre-key saved name still resolves.
    auto monitors = input.monitors();
    for(unsigned i = 0; i < monitors.size(); ++i){
      if(!monitors[i]->key.empty() && monitors[i]->key == saved){
        input.selectMonitor(i);
        return;
      }
    }
    for(unsigned i = 0; i < monitors.size(); ++i){
      if(monitors[i]->name == saved){
        input.selectMonitor(i);
        return;
      }
    }
  }
}
