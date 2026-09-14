#pragma once

#include <functional>
#include <memory>
#include <string>
#include <unordered_map>
#include <vector>

#include <Aurora/Input/IVideoInput.hpp>
#include <Aurora/Output/IOutput.hpp>

// Name -> factory lookup for this app's compiled-in plugins. Config picks
// which ones run by name; adding a plugin means adding one registry entry
// here, not touching main()'s control flow. Factories are zero-arg closures
// -- whatever a plugin needs to construct (credentials, addresses) is
// captured when main() registers it, not passed through this type, since
// each plugin's construction parameters differ and there's no shared
// config schema for them yet. See Analysis/DistributedArchitecturePlan.md.
namespace Aurora::App
{
  using InputFactory = std::function<std::unique_ptr<Input::IVideoInput>()>;
  using OutputFactory = std::function<std::unique_ptr<Output::IOutput>()>;

  class Registry
  {
  public:
    void registerInput(const std::string& name, InputFactory factory);
    void registerOutput(const std::string& name, OutputFactory factory);

    // nullptr if no factory was registered under that name.
    std::unique_ptr<Input::IVideoInput> createInput(const std::string& name) const;
    std::unique_ptr<Output::IOutput> createOutput(const std::string& name) const;

    std::vector<std::string> inputNames() const;
    std::vector<std::string> outputNames() const;

  private:
    std::unordered_map<std::string, InputFactory> m_inputFactories;
    std::unordered_map<std::string, OutputFactory> m_outputFactories;
  };
}
