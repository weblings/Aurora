#pragma once

#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <map>
#include <string>
#include <vector>

// Pure monitor-key derivation shared by the grabbers, with no OS headers so it
// is testable anywhere. Windows and X11 both key a monitor by its EDID.
namespace Aurora::Input
{
  // FNV-1a over the EDID bytes as 16 hex digits. Empty when there is no EDID.
  inline std::string edidHashKey(const unsigned char* data, std::size_t count)
  {
    if(!data || count == 0){
      return {};
    }

    std::uint64_t hash = 1469598103934665603ull;
    for(std::size_t i = 0; i < count; ++i){
      hash = (hash ^ data[i]) * 1099511628211ull;
    }

    char text[32];
    std::snprintf(text, sizeof(text), "%016llx", static_cast<unsigned long long>(hash));
    return text;
  }


  // Final keys for a set of outputs, parallel to the inputs. The port or
  // connector is the part that drifts (renames, MST, driver changes, a cable
  // moved), so a unique EDID hash is the key alone and "hash@port" is used
  // only to tell apart outputs that share an EDID. Outputs without an EDID
  // get an empty key.
  inline std::vector<std::string> assignMonitorKeys(
    const std::vector<std::string>& edidHashes,
    const std::vector<std::string>& ports
  )
  {
    std::map<std::string, int> counts;
    for(const auto& hash : edidHashes){
      if(!hash.empty()){
        ++counts[hash];
      }
    }

    std::vector<std::string> keys;
    keys.reserve(edidHashes.size());
    for(std::size_t i = 0; i < edidHashes.size(); ++i){
      const auto& hash = edidHashes[i];
      if(hash.empty() || counts[hash] == 1){
        keys.push_back(hash);
      }
      else{
        keys.push_back(hash + "@" + ports[i]);
      }
    }
    return keys;
  }
}
