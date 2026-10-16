#include <Aurora/Runtime/Graph/GraphTypes.hpp>

namespace Aurora::Runtime::Graph
{
  const char* portTypeName(PortType type)
  {
    switch(type){
      case PortType::Image: return "Image";
      case PortType::AudioBuffer: return "AudioBuffer";
      case PortType::AudioFeatures: return "AudioFeatures";
      case PortType::Color: return "Color";
      case PortType::Frame: return "Frame";
      case PortType::Angle: return "Angle";
      case PortType::Float: return "Float";
      case PortType::Trigger: return "Trigger";
    }
    return "?";
  }

  std::optional<PortType> parsePortType(std::string_view name)
  {
    if(name == "Image"){ return PortType::Image; }
    if(name == "AudioBuffer"){ return PortType::AudioBuffer; }
    if(name == "AudioFeatures"){ return PortType::AudioFeatures; }
    if(name == "Color"){ return PortType::Color; }
    if(name == "Frame"){ return PortType::Frame; }
    if(name == "Angle"){ return PortType::Angle; }
    if(name == "Float"){ return PortType::Float; }
    if(name == "Trigger"){ return PortType::Trigger; }
    return std::nullopt;
  }

  const char* paramKindName(ParamKind kind)
  {
    switch(kind){
      case ParamKind::Float: return "float";
      case ParamKind::Bool: return "bool";
      case ParamKind::Enum: return "enum";
      case ParamKind::OptionalFloat: return "optional-float";
      case ParamKind::Gradient: return "gradient";
    }
    return "?";
  }

  std::optional<ParamKind> parseParamKind(std::string_view name)
  {
    if(name == "float"){ return ParamKind::Float; }
    if(name == "bool"){ return ParamKind::Bool; }
    if(name == "enum"){ return ParamKind::Enum; }
    if(name == "optional-float"){ return ParamKind::OptionalFloat; }
    if(name == "gradient"){ return ParamKind::Gradient; }
    return std::nullopt;
  }

  std::string colorToHex(const Contracts::Color& color)
  {
    static const char digits[] = "0123456789abcdef";
    std::string out = "#";
    for(unsigned channel : {color.m_r, color.m_g, color.m_b}){
      out += digits[channel >> 4];
      out += digits[channel & 0xf];
    }
    return out;
  }

  std::optional<Contracts::Color> parseHexColor(std::string_view text)
  {
    if(text.size() != 7 || text[0] != '#'){
      return std::nullopt;
    }
    unsigned channels[3]{};
    for(int i = 0; i < 6; ++i){
      char c = text[1 + i];
      unsigned digit = 0;
      if(c >= '0' && c <= '9'){ digit = c - '0'; }
      else if(c >= 'a' && c <= 'f'){ digit = c - 'a' + 10; }
      else if(c >= 'A' && c <= 'F'){ digit = c - 'A' + 10; }
      else{ return std::nullopt; }
      channels[i / 2] = channels[i / 2] * 16 + digit;
    }
    return Contracts::Color(
      static_cast<Contracts::Color::ChannelDepth>(channels[0]),
      static_cast<Contracts::Color::ChannelDepth>(channels[1]),
      static_cast<Contracts::Color::ChannelDepth>(channels[2]));
  }
}
