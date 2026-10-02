#include <Aurora/Secrets/SecretStore.hpp>

#include <libsecret/secret.h>

// Linux: Secret Service over D-Bus (gnome-keyring, KWallet's bridge,
// KeePassXC), via libsecret's sync password API. Entries carry
// {scope, key} attributes and land in the default (login) collection.
// Sync calls spin their own main loop, so any thread works -- but an
// unlock prompt blocks until the user answers (see the header contract).
namespace Aurora::Secrets
{
  namespace
  {
    const SecretSchema* _schema()
    {
      static const SecretSchema schema = {
        "org.aurora.Secret", SECRET_SCHEMA_NONE,
        {
          {"scope", SECRET_SCHEMA_ATTRIBUTE_STRING},
          {"key", SECRET_SCHEMA_ATTRIBUTE_STRING},
          {nullptr, SECRET_SCHEMA_ATTRIBUTE_STRING}
        },
        0, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr
      };
      return &schema;
    }


    // No bus, no Secret Service, or a locked collection all mean "no usable
    // store here" -- the caller decides what to tell the user. Anything else
    // is a real failure. GError messages come from D-Bus/the daemon and
    // never include the secret.
    SecretResult _fromError(GError* error, const char* operation)
    {
      bool unavailable = error->domain == G_DBUS_ERROR || error->domain == G_IO_ERROR
        || error->domain == G_SPAWN_ERROR
        || (error->domain == SECRET_ERROR && error->code == SECRET_ERROR_IS_LOCKED);
      SecretResult result{
        unavailable ? SecretStatus::Unavailable : SecretStatus::Error, "",
        std::string("Secret Service ") + operation + ": " + error->message
      };
      g_error_free(error);
      return result;
    }


    class LibsecretSecretStore : public ISecretStore
    {
    public:
      explicit LibsecretSecretStore(std::string scope): m_scope(std::move(scope)) {}

      SecretResult get(const std::string& key) override
      {
        if(auto error = Detail::validateKey(key); !error.empty()){
          return Detail::invalid(error);
        }

        GError* error = nullptr;
        gchar* value = secret_password_lookup_sync(_schema(), nullptr, &error,
          "scope", m_scope.c_str(), "key", key.c_str(), nullptr);
        if(error){
          return _fromError(error, "lookup");
        }
        if(!value){
          return {SecretStatus::NotFound, "", ""};
        }

        SecretResult result{SecretStatus::Ok, value, ""};
        secret_password_free(value);
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

        std::string label = "Aurora: " + key;
        GError* error = nullptr;
        gboolean stored = secret_password_store_sync(_schema(), SECRET_COLLECTION_DEFAULT,
          label.c_str(), value.c_str(), nullptr, &error,
          "scope", m_scope.c_str(), "key", key.c_str(), nullptr);
        if(error){
          return _fromError(error, "store");
        }
        if(!stored){
          // No error but not stored: the unlock prompt was dismissed.
          return {SecretStatus::Unavailable, "", "Secret Service store: keyring unlock dismissed"};
        }
        return {SecretStatus::Ok, "", ""};
      }

      SecretResult remove(const std::string& key) override
      {
        if(auto error = Detail::validateKey(key); !error.empty()){
          return Detail::invalid(error);
        }

        // FALSE with no error just means nothing matched -- still Ok.
        GError* error = nullptr;
        secret_password_clear_sync(_schema(), nullptr, &error,
          "scope", m_scope.c_str(), "key", key.c_str(), nullptr);
        if(error){
          return _fromError(error, "clear");
        }
        return {SecretStatus::Ok, "", ""};
      }

      std::string backendName() const override { return "Secret Service"; }

    private:
      std::string m_scope;
    };
  }


  std::unique_ptr<ISecretStore> makePlatformSecretStore(const std::string& scope)
  {
    return std::make_unique<LibsecretSecretStore>(scope);
  }
}
