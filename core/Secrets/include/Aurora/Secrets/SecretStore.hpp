#pragma once

#include <cstddef>
#include <filesystem>
#include <map>
#include <memory>
#include <string>

// OS secret store behind one interface (Aurora-2dz): Keychain on Mac,
// Credential Manager on Windows, libsecret (Secret Service) on Linux.
// For credentials that must not sit in a JSON file -- the HA refresh token
// first. Rules: [[home-assistant-output]] "Local API rules".
//
// Threading: every call may block (a keyring unlock prompt waits on the
// user). Call only at connect/login/reset time, never on the tick thread
// or while holding the API mutex.
namespace Aurora::Secrets
{
  enum class SecretStatus
  {
    Ok,
    NotFound,     // get(): nothing stored (or bound to something else)
    Unavailable,  // no usable OS store: no keyring/Secret Service, or locked and dismissed
    Invalid,      // bad key or value too large -- caller bug, nothing touched
    Error         // the OS store refused; see SecretResult::error
  };


  // error never contains the secret value, only what failed and why.
  struct SecretResult
  {
    SecretStatus status = SecretStatus::Error;
    std::string value;
    std::string error;

    bool ok() const { return status == SecretStatus::Ok; }
  };


  // Credential Manager's CRED_MAX_CREDENTIAL_BLOB_SIZE, enforced on every
  // backend so a too-large value fails in Linux tests, not first on Windows.
  inline constexpr std::size_t MaxSecretBytes = 2560;


  // Keys: 1-128 chars of [A-Za-z0-9._-/]. Every backend namespaces them
  // under its scope (see scopeForConfigRoot), so two config roots -- or a
  // test and the real install -- never share an entry.
  class ISecretStore
  {
  public:
    virtual ~ISecretStore() = default;

    virtual SecretResult get(const std::string& key) = 0;
    virtual SecretResult set(const std::string& key, const std::string& value) = 0;

    // Idempotent: removing an absent key is Ok.
    virtual SecretResult remove(const std::string& key) = 0;

    // For logs and the UI ("Keychain", "Secret Service", "memory", ...).
    virtual std::string backendName() const = 0;
  };


  // Process-lifetime store: tests, and --fresh runs (which must never read
  // the real user's secrets). Not persisted.
  class MemorySecretStore : public ISecretStore
  {
  public:
    SecretResult get(const std::string& key) override;
    SecretResult set(const std::string& key, const std::string& value) override;
    SecretResult remove(const std::string& key) override;
    std::string backendName() const override { return "memory"; }

  private:
    std::map<std::string, std::string> m_values;
  };


  // UNENCRYPTED opt-in fallback for when the OS store is Unavailable (mostly
  // Linux without a Secret Service, or autologin with a locked keyring).
  // Only ever used after the user ticks "Remember on this device -- stored
  // unencrypted in a file"; the default there is session-only (memory).
  // One JSON map at <configRoot>/secrets.plaintext.json, owner-only (0600)
  // before any content is written. Anything that bundles the config root
  // (export, bug report) must leave this file out.
  class FileSecretStore : public ISecretStore
  {
  public:
    explicit FileSecretStore(const std::filesystem::path& configRoot);

    SecretResult get(const std::string& key) override;
    SecretResult set(const std::string& key, const std::string& value) override;
    SecretResult remove(const std::string& key) override;
    std::string backendName() const override { return "file (unencrypted)"; }

    static constexpr const char* FileName = "secrets.plaintext.json";

  private:
    std::filesystem::path m_path;
  };


  // Stable per-config-root scope: a hash of the canonical path, so the same
  // install always finds its own entries and a different root never does.
  std::string scopeForConfigRoot(const std::filesystem::path& configRoot);

  // The OS store this build has. Without one (e.g. Linux built without
  // libsecret), every call returns Unavailable instead of falling back.
  std::unique_ptr<ISecretStore> makePlatformSecretStore(const std::string& scope);

  // "Ok", "NotFound", ... for logs and route errors.
  const char* toString(SecretStatus status);


  // A secret tied to what it was issued for (HA URL, bridge address).
  // getBound() reports NotFound when the stored binding differs, so a
  // changed endpoint can never be handed the old credential -- the 5i3
  // rule enforced by the record itself, not by every caller remembering.
  SecretResult setBound(ISecretStore& store, const std::string& key, const std::string& binding, const std::string& value);
  SecretResult getBound(ISecretStore& store, const std::string& key, const std::string& binding);


  namespace Detail
  {
    // Shared argument checks; an empty string means valid.
    std::string validateKey(const std::string& key);
    std::string validateValue(const std::string& value);
    SecretResult invalid(std::string error);
  }
}
