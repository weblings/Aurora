#include <Aurora/Secrets/SecretStore.hpp>

// Built without an OS store (Linux without libsecret-1-dev). Never falls
// back to a file: every call reports Unavailable, and the caller decides
// what to offer the user (see [[home-assistant-output]]).
namespace Aurora::Secrets
{
  namespace
  {
    class UnavailableSecretStore : public ISecretStore
    {
    public:
      SecretResult get(const std::string& key) override { return _check(key, ""); }
      SecretResult set(const std::string& key, const std::string& value) override { return _check(key, value); }
      SecretResult remove(const std::string& key) override { return _check(key, ""); }
      std::string backendName() const override { return "none"; }

    private:
      static SecretResult _check(const std::string& key, const std::string& value)
      {
        if(auto error = Detail::validateKey(key); !error.empty()){
          return Detail::invalid(error);
        }
        if(auto error = Detail::validateValue(value); !error.empty()){
          return Detail::invalid(error);
        }
        return {SecretStatus::Unavailable, "", "built without an OS secret store"};
      }
    };
  }


  std::unique_ptr<ISecretStore> makePlatformSecretStore(const std::string&)
  {
    return std::make_unique<UnavailableSecretStore>();
  }
}
