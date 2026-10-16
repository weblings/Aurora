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
    }
    return "?";
  }

  std::optional<ParamKind> parseParamKind(std::string_view name)
  {
    if(name == "float"){ return ParamKind::Float; }
    if(name == "bool"){ return ParamKind::Bool; }
    if(name == "enum"){ return ParamKind::Enum; }
    if(name == "optional-float"){ return ParamKind::OptionalFloat; }
    return std::nullopt;
  }
}
