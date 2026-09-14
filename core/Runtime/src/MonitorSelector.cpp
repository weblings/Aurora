#include <Aurora/Runtime/MonitorSelector.hpp>

namespace Aurora::Runtime
{
  void selectConfiguredMonitor(Input::IInput& input, const Config& config)
  {
    const auto& name = config.activeMonitorName();
    if(name.empty()){
      return;
    }

    auto monitors = input.monitors();
    for(unsigned i = 0; i < monitors.size(); ++i){
      if(monitors[i]->name == name){
        input.selectMonitor(i);
        return;
      }
    }
  }
}
