#include <Aurora/App/Registry.hpp>

namespace Aurora::App
{
  void Registry::registerInput(const std::string& name, InputFactory factory)
  {
    m_inputFactories[name] = std::move(factory);
  }


  void Registry::registerOutput(const std::string& name, OutputFactory factory)
  {
    m_outputFactories[name] = std::move(factory);
  }


  std::unique_ptr<Input::IInput> Registry::createInput(const std::string& name) const
  {
    auto it = m_inputFactories.find(name);
    return it != m_inputFactories.end() ? it->second() : nullptr;
  }


  std::unique_ptr<Output::IOutput> Registry::createOutput(const std::string& name) const
  {
    auto it = m_outputFactories.find(name);
    return it != m_outputFactories.end() ? it->second() : nullptr;
  }


  std::vector<std::string> Registry::inputNames() const
  {
    std::vector<std::string> names;
    for(const auto& [name, factory] : m_inputFactories){
      names.push_back(name);
    }
    return names;
  }


  std::vector<std::string> Registry::outputNames() const
  {
    std::vector<std::string> names;
    for(const auto& [name, factory] : m_outputFactories){
      names.push_back(name);
    }
    return names;
  }
}
