#include <Aurora/Output/Hue/HuestreamHeader.hpp>

#include <cstring>
#include <algorithm>


namespace Aurora::Output::Hue
{
  void HuestreamHeader::setColorSpace(
    char colorSpace
  )
  {
    this->colorSpace = colorSpace;
  }


  void HuestreamHeader::setEntertainmentConfigurationId(
    const std::string& entertainmentConfigurationId
  )
  {
    std::memset(this->entertainmentConfigurationId, 0, sizeof(this->entertainmentConfigurationId));
    std::memcpy(
      this->entertainmentConfigurationId,
      entertainmentConfigurationId.data(),
      std::min(entertainmentConfigurationId.size(), sizeof(this->entertainmentConfigurationId))
    );
  }
}
