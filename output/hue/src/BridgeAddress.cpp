#include <Aurora/Output/Hue/BridgeAddress.hpp>

#include <algorithm>
#include <cctype>
#include <string_view>


namespace Aurora::Output::Hue
{
  namespace
  {
    bool startsWithIgnoreCase(
      std::string_view value,
      std::string_view prefix
    )
    {
      if(value.size() < prefix.size()){
        return false;
      }

      return std::equal(
        prefix.begin(),
        prefix.end(),
        value.begin(),
        [](char a, char b){
          return std::tolower(static_cast<unsigned char>(a)) == std::tolower(static_cast<unsigned char>(b));
        }
      );
    }
  }


  std::string sanitizeBridgeAddress(
    const std::string& rawAddress
  )
  {
    std::string address = rawAddress;

    static constexpr std::string_view HttpsPrefix = "https://";
    static constexpr std::string_view HttpPrefix = "http://";

    if(startsWithIgnoreCase(address, HttpsPrefix)){
      address.erase(0, HttpsPrefix.size());
    }
    else if(startsWithIgnoreCase(address, HttpPrefix)){
      address.erase(0, HttpPrefix.size());
    }

    auto slash = address.find('/');
    if(slash != std::string::npos){
      address.erase(slash);
    }

    while(!address.empty() && address.back() == '/'){
      address.pop_back();
    }

    return address;
  }
}
