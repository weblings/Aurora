#pragma once

#include <cstdlib>
#include <string>


namespace Aurora::App
{

  // --fake-hue: one-flag dev flow against tools/fake-hue-bridge (default
  // https://127.0.0.1:18443, matching that tool's README). Applies
  // address/username/clientkey/config-id defaults only where the matching
  // AURORA_HUE_* env var is unset, so explicit env always wins; a persisted
  // CredentialsStore still wins over both (see registerOutputs in main.cpp).
  // Also defaults AURORA_DEV_FAKE_HUE=1 so discovery targets the fake with
  // no address typing. Combine with --fresh for the full clean-room run.
  inline bool hasCliFlag(int argc, char** argv, const char* flag)
  {
    for(int i = 1; i < argc; ++i){
      if(std::string(argv[i]) == flag){
        return true;
      }
    }
    return false;
  }

  inline void setEnvDefault(const char* name, const char* value)
  {
    if(!std::getenv(name)){
      ::setenv(name, value, 0);
    }
  }

  inline void applyFakeHueDefaults()
  {
    setEnvDefault("AURORA_HUE_BRIDGE_ADDRESS", "127.0.0.1:18443");
    setEnvDefault("AURORA_HUE_USERNAME", "fakedevuser01");
    setEnvDefault("AURORA_HUE_CLIENTKEY", "00112233445566778899aabbccddeeff");
    // The viz tool's ready-made 4-zone config (tools/fake-hue-bridge
    // README); override via env for any other entertainment setup.
    setEnvDefault("AURORA_HUE_ENTERTAINMENT_CONFIG_ID", "conf-room-4zone");
    setEnvDefault("AURORA_DEV_FAKE_HUE", "1");
  }

} // namespace Aurora::App
