#include <Aurora/Runtime/MonitorSelector.hpp>

#include <algorithm>

namespace Aurora::Runtime
{
  std::string selectConfiguredMonitor(Input::IVideoInput& input, const Config& config)
  {
    const auto& saved = config.activeMonitorName();
    if(saved.empty()){
      return {};
    }

    // Key first, then an earlier form of the key, then name, so a saved value
    // from before either change still resolves. The last two report the key.
    auto monitors = input.monitors();
    for(unsigned i = 0; i < monitors.size(); ++i){
      if(!monitors[i]->key.empty() && monitors[i]->key == saved){
        input.selectMonitor(i);
        return {};
      }
    }
    for(unsigned i = 0; i < monitors.size(); ++i){
      const auto& alt = monitors[i]->altKeys;
      if(std::find(alt.begin(), alt.end(), saved) != alt.end()){
        input.selectMonitor(i);
        return monitors[i]->key;
      }
    }
    for(unsigned i = 0; i < monitors.size(); ++i){
      if(monitors[i]->name == saved){
        input.selectMonitor(i);
        return monitors[i]->key;
      }
    }
    return {};
  }
}
