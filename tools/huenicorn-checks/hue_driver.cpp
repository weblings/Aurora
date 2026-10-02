// Runs huenicorn's real Hue loaders against tools/fake-hue-bridge.
//   fetch ADDR STALLED_LIGHT: ApiTools::loadEntertainmentConfigurations with one light stalled (finding 7)
//   selector ADDR: EntertainmentConfigurationSelector::validSelection, built -D_GLIBCXX_DEBUG (finding 8)
// Exit code: 0 pass, 1 fail; an abort or uncaught throw shows up as a signal.

#include <Huenicorn/Hue/Api/ApiTools.hpp>
#include <Huenicorn/Hue/Api/EntertainmentConfigurationSelector.hpp>

#include <cstring>
#include <iostream>

using namespace Huenicorn::Hue;

static const std::string Username = "aurora-dev-username";


static int fetch(const std::string& address, const std::string& stalledLight)
{
  // Uncaught on develop: std::bad_optional_access ends the process here, as at huenicorn startup
  auto entConfs = Api::ApiTools::loadEntertainmentConfigurations(Username, address);

  bool stalledSeen = false;
  for(const auto& [id, entConf] : entConfs){
    std::cout << id << " (" << entConf.name << "):";
    for(const auto& device : entConf.devices){
      std::cout << " " << device.id << "=\"" << device.name << "\"";
      if(device.id == stalledLight && device.name.empty()){
        stalledSeen = true;
      }
    }
    std::cout << std::endl;
  }

  if(entConfs.empty() || !stalledSeen){
    std::cout << "RESULT: fail (configurations missing, or stalled light not kept with an empty name)" << std::endl;
    return 1;
  }

  std::cout << "RESULT: pass (loaded " << entConfs.size() << " configurations; stalled light kept with an empty name)" << std::endl;
  return 0;
}


static int selector(const std::string& address)
{
  Api::EntertainmentConfigurationSelector selector(Auth::Credentials(Username, "unused"), address);

  // Aborts on develop under _GLIBCXX_DEBUG: compares an iterator taken from the pre-load map
  bool valid = selector.validSelection();

  std::cout << "loaded " << selector.entertainmentConfigurations().size() << " configurations, validSelection() = " << std::boolalpha << valid << std::endl;
  std::cout << "RESULT: " << (!valid ? "pass (no selection yet)" : "fail (selection before any select call)") << std::endl;
  return valid ? 1 : 0;
}


int main(int argc, char** argv)
{
  if(argc >= 4 && std::strcmp(argv[1], "fetch") == 0){
    return fetch(argv[2], argv[3]);
  }
  if(argc >= 3 && std::strcmp(argv[1], "selector") == 0){
    return selector(argv[2]);
  }

  std::cerr << "usage: " << argv[0] << " fetch ADDR STALLED_LIGHT | selector ADDR" << std::endl;
  return 64;
}
