#include <chrono>
#include <fstream>
#include <string>

#include <catch2/catch_test_macros.hpp>

#include <Aurora/Secrets/SecretStore.hpp>

// Aurora-2dz. Everything visible runs on the in-memory or file store, so it
// passes on any machine. Hidden (opt-in) cases write to the user's actual
// keyring and skip when the build or session has no usable store:
//   AuroraSecretsTests "[real]"        same-binary round-trip
//   AuroraSecretsTests "[real-write]"  } Keychain ACL check across a rebuild:
//   AuroraSecretsTests "[real-read]"   } write, rebuild, read, then cleanup
//   AuroraSecretsTests "[real-cleanup]"} (see docs/Building.md "Tests")
using namespace Aurora::Secrets;


namespace
{
  struct ScopedTempDir
  {
    std::filesystem::path path;

    explicit ScopedTempDir(const std::string& name):
    path(std::filesystem::temp_directory_path() / ("aurora-secrets-tests-" + name))
    {
      std::filesystem::remove_all(path);
      std::filesystem::create_directories(path);
    }

    ~ScopedTempDir()
    {
      std::filesystem::remove_all(path);
    }
  };


  // Fixed scope/key for the cross-rebuild pair: write and read run as two
  // different binaries, so both must find the same entry.
  constexpr const char* AclScope = "acl-check";
  constexpr const char* AclKey = "probe";
  constexpr const char* AclValue = "acl-check-value";
}


TEST_CASE("memory store round-trips, overwrites and removes idempotently", "[Secrets]")
{
  MemorySecretStore store;

  CHECK(store.get("ha/token").status == SecretStatus::NotFound);

  REQUIRE(store.set("ha/token", "first").ok());
  CHECK(store.get("ha/token").value == "first");

  REQUIRE(store.set("ha/token", "second").ok());
  CHECK(store.get("ha/token").value == "second");

  CHECK(store.remove("ha/token").ok());
  CHECK(store.get("ha/token").status == SecretStatus::NotFound);
  CHECK(store.remove("ha/token").ok());
}


TEST_CASE("bad keys and values are Invalid and store nothing", "[Secrets]")
{
  MemorySecretStore store;

  CHECK(store.set("", "v").status == SecretStatus::Invalid);
  CHECK(store.set(std::string(129, 'k'), "v").status == SecretStatus::Invalid);
  CHECK(store.set("has space", "v").status == SecretStatus::Invalid);
  CHECK(store.get("bad:key").status == SecretStatus::Invalid);
  CHECK(store.remove("bad\\key").status == SecretStatus::Invalid);

  // Credential Manager's cap, enforced everywhere.
  CHECK(store.set("big", std::string(MaxSecretBytes, 'x')).ok());
  auto tooBig = store.set("big2", std::string(MaxSecretBytes + 1, 'x'));
  CHECK(tooBig.status == SecretStatus::Invalid);
  CHECK(tooBig.error.find("xxxx") == std::string::npos);  // value never echoed
  CHECK(store.get("big2").status == SecretStatus::NotFound);

  CHECK(store.set("nul", std::string("a\0b", 3)).status == SecretStatus::Invalid);
}


TEST_CASE("a bound secret reads as absent once the binding changes", "[Secrets]")
{
  MemorySecretStore store;

  REQUIRE(setBound(store, "ha/refresh", "http://ha.local:8123", "token-1").ok());

  auto same = getBound(store, "ha/refresh", "http://ha.local:8123");
  REQUIRE(same.ok());
  CHECK(same.value == "token-1");

  // The 5i3 rule: a changed HA URL never gets the old token.
  CHECK(getBound(store, "ha/refresh", "http://evil.local:8123").status == SecretStatus::NotFound);

  // Re-login for the new URL replaces the record.
  REQUIRE(setBound(store, "ha/refresh", "http://evil.local:8123", "token-2").ok());
  CHECK(getBound(store, "ha/refresh", "http://ha.local:8123").status == SecretStatus::NotFound);
  CHECK(getBound(store, "ha/refresh", "http://evil.local:8123").value == "token-2");

  CHECK(setBound(store, "ha/refresh", "", "token").status == SecretStatus::Invalid);
  CHECK(getBound(store, "missing", "x").status == SecretStatus::NotFound);

  // A plain (unbound) value under the key is not silently trusted.
  REQUIRE(store.set("plain", "not-json").ok());
  CHECK(getBound(store, "plain", "x").status == SecretStatus::Error);
}


TEST_CASE("scopeForConfigRoot is stable per root and differs across roots", "[Secrets]")
{
  auto root = std::filesystem::temp_directory_path() / "aurora-secrets-scope";
  auto scope = scopeForConfigRoot(root);

  CHECK(scope.size() == 16);
  CHECK(scope.find_first_not_of("0123456789abcdef") == std::string::npos);
  CHECK(scopeForConfigRoot(root) == scope);
  CHECK(scopeForConfigRoot(root / ".") == scope);
  CHECK(scopeForConfigRoot(root / "sub" / "..") == scope);
  CHECK(scopeForConfigRoot(std::filesystem::temp_directory_path() / "aurora-fresh") != scope);
}


TEST_CASE("platform store round-trips in the real OS keyring", "[.][real]")
{
#if !AURORA_SECRETS_HAS_OS_STORE
  SKIP("built without an OS secret store");
#endif
  // Unique scopes per run: never touches a real install's entries.
  auto stamp = std::to_string(std::chrono::steady_clock::now().time_since_epoch().count());
  auto store = makePlatformSecretStore("test-" + stamp);
  auto other = makePlatformSecretStore("test-other-" + stamp);
  INFO("backend: " << store->backendName());

  auto first = store->set("roundtrip", "value-1");
  if(first.status == SecretStatus::Unavailable){
    SKIP("no usable OS store in this session: " << first.error);
  }
  REQUIRE(first.ok());

  auto read = store->get("roundtrip");
  CHECK(read.ok());
  CHECK(read.value == "value-1");

  REQUIRE(store->set("roundtrip", "value-2").ok());
  CHECK(store->get("roundtrip").value == "value-2");

  CHECK(other->get("roundtrip").status == SecretStatus::NotFound);

  // Largest allowed value fits the real backend too (Credential Manager cap).
  std::string big(MaxSecretBytes, 'b');
  REQUIRE(store->set("big", big).ok());
  CHECK(store->get("big").value == big);

  CHECK(store->remove("roundtrip").ok());
  CHECK(store->remove("big").ok());
  CHECK(store->get("roundtrip").status == SecretStatus::NotFound);
  CHECK(store->remove("roundtrip").ok());
}


TEST_CASE("file store persists across instances, owner-only, deletes when empty", "[Secrets]")
{
  ScopedTempDir root("file");
  auto path = root.path / FileSecretStore::FileName;

  {
    FileSecretStore store(root.path);
    CHECK(store.get("ha/refresh").status == SecretStatus::NotFound);
    REQUIRE(store.set("ha/refresh", "token-1").ok());
    REQUIRE(store.set("other", "x").ok());
  }

  REQUIRE(std::filesystem::exists(path));
  CHECK_FALSE(std::filesystem::exists(path.string() + ".tmp"));
#ifndef _WIN32
  CHECK((std::filesystem::status(path).permissions() & std::filesystem::perms::all)
        == (std::filesystem::perms::owner_read | std::filesystem::perms::owner_write));
#endif

  FileSecretStore reopened(root.path);
  CHECK(reopened.get("ha/refresh").value == "token-1");

  // Same bound-record rules as every other backend.
  REQUIRE(setBound(reopened, "ha/bound", "http://ha.local:8123", "token-2").ok());
  CHECK(getBound(reopened, "ha/bound", "http://other:8123").status == SecretStatus::NotFound);

  CHECK(reopened.remove("ha/refresh").ok());
  CHECK(reopened.remove("ha/refresh").ok());
  CHECK(reopened.remove("other").ok());
  CHECK(reopened.remove("ha/bound").ok());
  CHECK_FALSE(std::filesystem::exists(path));  // no empty file left behind

  CHECK(reopened.set("big", std::string(MaxSecretBytes + 1, 'x')).status == SecretStatus::Invalid);
}


TEST_CASE("file store refuses to overwrite a corrupt file", "[Secrets]")
{
  ScopedTempDir root("file-corrupt");
  auto path = root.path / FileSecretStore::FileName;
  { std::ofstream(path) << "{not json"; }

  FileSecretStore store(root.path);
  CHECK(store.get("k").status == SecretStatus::Error);
  CHECK(store.set("k", "v").status == SecretStatus::Error);
  CHECK(store.remove("k").status == SecretStatus::Error);

  std::ifstream file(path);
  std::string contents((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>());
  CHECK(contents == "{not json");
}


// The cross-rebuild Keychain pair. On Mac, the item's ACL trusts the
// writing binary's code signature: ad-hoc builds change it every build, so
// [real-read] after a rebuild should raise the "wants to use your
// confidential information" prompt; identity-signed builds should not.
// Allow -> Ok; Deny/cancel -> Unavailable. Error means a mapping gap.
TEST_CASE("cross-rebuild check: write a persistent entry", "[.][real-write]")
{
#if !AURORA_SECRETS_HAS_OS_STORE
  SKIP("built without an OS secret store");
#endif
  auto store = makePlatformSecretStore(AclScope);
  auto result = store->set(AclKey, AclValue);
  if(result.status == SecretStatus::Unavailable){
    SKIP("no usable OS store in this session: " << result.error);
  }
  REQUIRE(result.ok());
  WARN("left " << store->backendName() << " entry " << AclScope << "/" << AclKey
       << " -- rebuild, run [real-read], then [real-cleanup]");
}


TEST_CASE("cross-rebuild check: read the persistent entry", "[.][real-read]")
{
#if !AURORA_SECRETS_HAS_OS_STORE
  SKIP("built without an OS secret store");
#endif
  auto store = makePlatformSecretStore(AclScope);
  auto result = store->get(AclKey);
  WARN(store->backendName() << " read: " << toString(result.status)
       << (result.error.empty() ? "" : " -- " + result.error));

  CHECK(result.status != SecretStatus::NotFound);  // run [real-write] first
  CHECK(result.status != SecretStatus::Error);     // denial must map to Unavailable
  if(result.ok()){
    CHECK(result.value == AclValue);
  }
}


TEST_CASE("cross-rebuild check: remove the persistent entry", "[.][real-cleanup]")
{
#if !AURORA_SECRETS_HAS_OS_STORE
  SKIP("built without an OS secret store");
#endif
  auto store = makePlatformSecretStore(AclScope);
  auto result = store->remove(AclKey);
  if(result.status == SecretStatus::Unavailable){
    SKIP("no usable OS store in this session: " << result.error);
  }
  INFO("remove: " << result.error);
  CHECK(result.ok());
  CHECK(store->get(AclKey).status == SecretStatus::NotFound);
}
