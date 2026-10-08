#include <Aurora/Secrets/SecretStore.hpp>

#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <wincred.h>

// Windows: Credential Manager generic credentials, target
// "Aurora/<scope>/<key>", persisted per user on this machine. Chosen over
// DPAPI, which only encrypts -- the blob would still need a file of ours.
// Keys are ASCII by validateKey(), so the A-suffixed API is safe.
namespace Aurora::Secrets
{
  namespace
  {
    std::string _message(DWORD code)
    {
      char* buffer = nullptr;
      DWORD length = FormatMessageA(
        FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS,
        nullptr, code, 0, reinterpret_cast<LPSTR>(&buffer), 0, nullptr);
      std::string text = length ? std::string(buffer, length) : "error";
      LocalFree(buffer);
      while(!text.empty() && (text.back() == '\n' || text.back() == '\r')){
        text.pop_back();
      }
      return text + " (" + std::to_string(code) + ")";
    }


    // No logon session (service accounts, some remote sessions) means no
    // credential vault for this process; anything else is a real failure.
    SecretResult _fromError(DWORD code, const char* operation)
    {
      return {
        code == ERROR_NO_SUCH_LOGON_SESSION ? SecretStatus::Unavailable : SecretStatus::Error, "",
        std::string("Credential Manager ") + operation + ": " + _message(code)
      };
    }


    class CredentialManagerSecretStore : public ISecretStore
    {
    public:
      explicit CredentialManagerSecretStore(const std::string& scope): m_prefix("Aurora/" + scope + "/") {}

      SecretResult get(const std::string& key) override
      {
        if(auto error = Detail::validateKey(key); !error.empty()){
          return Detail::invalid(error);
        }

        PCREDENTIALA credential = nullptr;
        std::string target = m_prefix + key;
        if(!CredReadA(target.c_str(), CRED_TYPE_GENERIC, 0, &credential)){
          DWORD code = GetLastError();
          if(code == ERROR_NOT_FOUND){
            return {SecretStatus::NotFound, "", ""};
          }
          return _fromError(code, "read");
        }

        SecretResult result{SecretStatus::Ok,
          std::string(reinterpret_cast<const char*>(credential->CredentialBlob), credential->CredentialBlobSize), ""};
        CredFree(credential);
        return result;
      }

      SecretResult set(const std::string& key, const std::string& value) override
      {
        if(auto error = Detail::validateKey(key); !error.empty()){
          return Detail::invalid(error);
        }
        if(auto error = Detail::validateValue(value); !error.empty()){
          return Detail::invalid(error);
        }

        std::string target = m_prefix + key;
        CREDENTIALA credential = {};
        credential.Type = CRED_TYPE_GENERIC;
        credential.TargetName = const_cast<LPSTR>(target.c_str());
        credential.CredentialBlobSize = static_cast<DWORD>(value.size());
        credential.CredentialBlob = reinterpret_cast<LPBYTE>(const_cast<char*>(value.data()));
        credential.Persist = CRED_PERSIST_LOCAL_MACHINE;
        credential.UserName = const_cast<LPSTR>("Aurora");

        if(!CredWriteA(&credential, 0)){
          return _fromError(GetLastError(), "write");
        }
        return {SecretStatus::Ok, "", ""};
      }

      SecretResult remove(const std::string& key) override
      {
        if(auto error = Detail::validateKey(key); !error.empty()){
          return Detail::invalid(error);
        }

        std::string target = m_prefix + key;
        if(!CredDeleteA(target.c_str(), CRED_TYPE_GENERIC, 0)){
          DWORD code = GetLastError();
          if(code != ERROR_NOT_FOUND){
            return _fromError(code, "delete");
          }
        }
        return {SecretStatus::Ok, "", ""};
      }

      std::string backendName() const override { return "Credential Manager"; }

    private:
      std::string m_prefix;
    };
  }


  std::unique_ptr<ISecretStore> makePlatformSecretStore(const std::string& scope)
  {
    return std::make_unique<CredentialManagerSecretStore>(scope);
  }
}
