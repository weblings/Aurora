#include <Aurora/Secrets/SecretStore.hpp>

#include <CoreFoundation/CoreFoundation.h>
#include <Security/Security.h>

// Mac: login keychain, generic-password items (service "Aurora/<scope>",
// account = key). Item ACLs bind to the app's code signature, so an
// ad-hoc-signed dev build (app/mac's default) re-prompts after every
// rebuild; identity-signed releases keep access across updates.
namespace Aurora::Secrets
{
  namespace
  {
    struct CfRelease
    {
      CFTypeRef ref;
      ~CfRelease() { if(ref) CFRelease(ref); }
    };


    CFStringRef _cfString(const std::string& text)
    {
      return CFStringCreateWithBytes(nullptr, reinterpret_cast<const UInt8*>(text.data()),
        static_cast<CFIndex>(text.size()), kCFStringEncodingUTF8, false);
    }


    std::string _message(OSStatus status)
    {
      CFStringRef cf = SecCopyErrorMessageString(status, nullptr);
      CfRelease guard{cf};
      char buffer[256] = {};
      if(!cf || !CFStringGetCString(cf, buffer, sizeof(buffer), kCFStringEncodingUTF8)){
        return "OSStatus " + std::to_string(status);
      }
      return std::string(buffer) + " (" + std::to_string(status) + ")";
    }


    // Locked keychain with UI disallowed, a dismissed prompt, or no keychain
    // at all: no usable store right now. Anything else is a real failure.
    SecretResult _fromStatus(OSStatus status, const char* operation)
    {
      bool unavailable = status == errSecInteractionNotAllowed || status == errSecAuthFailed
        || status == errSecUserCanceled || status == errSecNoSuchKeychain
        || status == errSecNotAvailable;
      return {
        unavailable ? SecretStatus::Unavailable : SecretStatus::Error, "",
        std::string("Keychain ") + operation + ": " + _message(status)
      };
    }


    class KeychainSecretStore : public ISecretStore
    {
    public:
      explicit KeychainSecretStore(const std::string& scope): m_service("Aurora/" + scope) {}

      SecretResult get(const std::string& key) override
      {
        if(auto error = Detail::validateKey(key); !error.empty()){
          return Detail::invalid(error);
        }

        CFMutableDictionaryRef query = _query(key);
        CfRelease queryGuard{query};
        CFDictionarySetValue(query, kSecReturnData, kCFBooleanTrue);
        CFDictionarySetValue(query, kSecMatchLimit, kSecMatchLimitOne);

        CFTypeRef data = nullptr;
        OSStatus status = SecItemCopyMatching(query, &data);
        CfRelease dataGuard{data};
        if(status == errSecItemNotFound){
          return {SecretStatus::NotFound, "", ""};
        }
        if(status != errSecSuccess){
          return _fromStatus(status, "read");
        }

        auto bytes = static_cast<CFDataRef>(data);
        return {SecretStatus::Ok,
          std::string(reinterpret_cast<const char*>(CFDataGetBytePtr(bytes)), CFDataGetLength(bytes)), ""};
      }

      SecretResult set(const std::string& key, const std::string& value) override
      {
        if(auto error = Detail::validateKey(key); !error.empty()){
          return Detail::invalid(error);
        }
        if(auto error = Detail::validateValue(value); !error.empty()){
          return Detail::invalid(error);
        }

        CFDataRef data = CFDataCreate(nullptr, reinterpret_cast<const UInt8*>(value.data()),
          static_cast<CFIndex>(value.size()));
        CfRelease dataGuard{data};
        CFMutableDictionaryRef query = _query(key);
        CfRelease queryGuard{query};

        // Update in place first so the item keeps its ACL; add if absent.
        CFMutableDictionaryRef changes = CFDictionaryCreateMutable(nullptr, 0,
          &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
        CfRelease changesGuard{changes};
        CFDictionarySetValue(changes, kSecValueData, data);

        OSStatus status = SecItemUpdate(query, changes);
        if(status == errSecItemNotFound){
          CFStringRef label = _cfString("Aurora: " + key);
          CfRelease labelGuard{label};
          CFDictionarySetValue(query, kSecValueData, data);
          CFDictionarySetValue(query, kSecAttrLabel, label);
          status = SecItemAdd(query, nullptr);
        }
        if(status != errSecSuccess){
          return _fromStatus(status, "write");
        }
        return {SecretStatus::Ok, "", ""};
      }

      SecretResult remove(const std::string& key) override
      {
        if(auto error = Detail::validateKey(key); !error.empty()){
          return Detail::invalid(error);
        }

        CFMutableDictionaryRef query = _query(key);
        CfRelease queryGuard{query};
        OSStatus status = SecItemDelete(query);
        if(status != errSecSuccess && status != errSecItemNotFound){
          return _fromStatus(status, "delete");
        }
        return {SecretStatus::Ok, "", ""};
      }

      std::string backendName() const override { return "Keychain"; }

    private:
      CFMutableDictionaryRef _query(const std::string& key) const
      {
        CFMutableDictionaryRef query = CFDictionaryCreateMutable(nullptr, 0,
          &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
        CFStringRef service = _cfString(m_service);
        CFStringRef account = _cfString(key);
        CFDictionarySetValue(query, kSecClass, kSecClassGenericPassword);
        CFDictionarySetValue(query, kSecAttrService, service);
        CFDictionarySetValue(query, kSecAttrAccount, account);
        CFRelease(service);
        CFRelease(account);
        return query;
      }

      std::string m_service;
    };
  }


  std::unique_ptr<ISecretStore> makePlatformSecretStore(const std::string& scope)
  {
    return std::make_unique<KeychainSecretStore>(scope);
  }
}
