# Aurora-2dz: OS secret store — Linux done, Mac/Windows pending

Id: 2dz-secret-store

`Aurora-2dz` (HA prep 7) is **paused, still open**. The store is built and
verified on Linux. The Mac and Windows backends are written but have never
been compiled. Decisions are recorded once, in the "Secret store" section of
[[home-assistant-output]].

## Before building

- **Bead review:** added acceptance criteria for config-root scoping,
  URL-bound records, a threading contract, revoke-on-reset and recorded
  decisions. Platform gaps went into the notes: Mac ad-hoc signing vs.
  Keychain ACLs, Linux no-keyring cases, Credential Manager vs. DPAPI.
- **HA core re-read (`f66cbe4`):**
  - The refresh token is bound to the login's `client_id` and is never
    rotated.
  - Expiry is 90 days from last use; `/auth/revoke` needs no auth.
  - A long-lived token is a JWT.
  - Recorded as "Refresh-token lifecycle" in [[home-assistant-output]].
    Bead notes on 4zr.2, 4zr.5 and 4zr.7.
- **Fake HA divergence found:** `fake_ha.py` rotates refresh tokens and
  answers a `client_id` mismatch with `invalid_grant` (real HA:
  `invalid_request`). It also has no `/auth/revoke`. Filed as Aurora-nvzr,
  which blocks 4zr.2 and 4zr.5.

## Built (`core/Secrets`, `AuroraSecrets`)

- **Interface:** `ISecretStore` get/set/remove. Statuses: `Ok`, `NotFound`,
  `Unavailable`, `Invalid`, `Error`. Error text never contains the value.
- **Rules every backend shares:** keys are 1-128 chars of
  `[A-Za-z0-9._-/]`; values are at most 2560 bytes (Credential Manager's
  cap) with no NUL bytes (libsecret's C-string API).
- **Backends:**
  - libsecret on Linux (`pkg_check_modules QUIET`). Without it, a stub
    returns `Unavailable` and configure warns;
    `AURORA_SECRETS_ENABLE_LIBSECRET` turns it off.
  - Keychain on Mac.
  - Credential Manager on Windows.
  - `MemorySecretStore` for tests and `--fresh`.
  - Opt-in `FileSecretStore`: `secrets.plaintext.json`, 0600, written
    through a locked-down temp file, refuses to overwrite a corrupt file.
- **Scoping:** `scopeForConfigRoot` hashes the canonical path (FNV-1a 64).
- **`setBound`/`getBound`:** a secret stored with its endpoint reads as
  `NotFound` for any other endpoint.
- **Decided:** when the OS store is `Unavailable`, the default is
  session-only. The file store is an unchecked opt-in shown only in that
  case. Hue stays in JSON.
- **Not wired yet:** nothing links `AuroraSecrets` but its tests. The first
  consumer is the HA Connect screen (4zr.5); its notes cover the config
  flag and `--fresh` → memory.
- **CI:** `libsecret-1-dev` added to `linux.yml`. Mac and Windows CI build
  core standalone, so they will be the first compile of those backends.

## Verification (Linux)

- **`AuroraSecretsTests`:** 54/54, both without libsecret (stub) and with
  it.
- **`[real]` against gnome-keyring:** 12/12. A dead bus
  (`unix:path=/nonexistent`) maps to `Unavailable` and the test skips.
- **Cross-binary pair:** `[real-write]`, then a separate `[real-read]`
  returns `Ok`, then `[real-cleanup]`. A read after cleanup fails with
  `NotFound`, as it should.
- **Leftovers:** `gdbus ... SearchItems {'xdg:schema': 'org.aurora.Secret'}`
  is empty after every run.
- **Wider suites:** core ctest 105/105; `linux-app` 90/90 (now prints the
  libsecret warning on this box).
- **Bug the tests caught:** `scopeForConfigRoot` gave `root/.` a different
  scope than `root`. Fixed.
- **No sudo here:** the libsecret build used headers extracted from the
  `.deb` (see the lesson). The box itself still lacks `libsecret-1-dev`.

## Resume

1. Mac:
   - Build core standalone and run `[real]`.
   - Run the rebuild pair (`docs/Building.md`, "Tests"). Ad-hoc should
     prompt; Allow → `Ok`, Deny → `Unavailable`. An identity-signed build
     should not prompt.
2. Windows: compile, then `[real]` (expect `Ok` with no prompt).
3. Then close 2dz. Optionally `sudo apt install libsecret-1-dev` here to
   drop the configure warning.

## Lessons

- "`weakly_canonical("dir/.")` keeps a trailing slash" (language-cpp.md).
- "Unsetting `DBUS_SESSION_BUS_ADDRESS` doesn't simulate no session bus"
  (debugging-method.md).
- "Building against a distro `-dev` package without sudo"
  (build-toolchain.md).
- "Two build trees sharing `FETCHCONTENT_BASE_DIR` clobber each other"
  (build-toolchain.md).
