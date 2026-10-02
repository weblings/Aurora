# Aurora-2dz: OS secret store — Linux and Mac verified, Windows pending

Id: 2dz-secret-store

`Aurora-2dz` (HA prep 7) is **paused, still open**. The store is built and
verified on Linux (gnome-keyring) and Mac (login keychain, both signing
modes). The Windows backend is written but has never been compiled.
Decisions are recorded once, in the "Secret store" section of
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

## Mac verification (2026-10-02)

- Merged `dev` into `feat/HAPrep2` (92077ff). Core standalone builds on the
  Mac with `AuroraSecrets backend: Keychain`; ctest 127/127.
- `[real]` 12/12 against the login keychain (same binary, no prompt).
- Rebuild pair, ad-hoc signed: `[real-write]`, then a rebuild with a changed
  binary (an unused static is dead-stripped and leaves the binary
  byte-identical; use an emitted symbol, see the lesson), then `[real-read]` showed a system
  dialog asking for the login keychain password. After Allow: `Ok`.
  `[real-cleanup]` ran without a prompt; a read afterwards is `NotFound`.
- Deny (ad-hoc, rebuilt binary): `Unavailable` with "User canceled the
  operation". Mapping is right.
- ~~Allow does not persist~~ (first read; corrected below). The same ad-hoc
  binary prompted again on later reads after what I recorded as "Allow,
  then Always Allow". Not reproduced; see "Follow-up".
- Identity-signed (Developer ID, shared `-i` identifier): write with binary A,
  read with differing binary B: `Ok` in 0.2 s, no prompt. `set` over the
  existing entry from B also works.
- **First read of a "bug", then corrected.** `[real-cleanup]` from B or a
  later copy C (same identity, different binary) failed: `Keychain delete:
  Invalid attempt to change the owner of this item`
  (`errSecInvalidOwnerEdit`, mapped to `Error`); the creating binary A
  deleted fine. That looked like "delete fails after an app update". It was
  an artifact of my test: A, B and C were differently *named* files.
  Re-run with the same file name (`d1/AuroraSecretsTests`,
  `d2/AuroraSecretsTests`): a delete from another directory succeeded, and
  so did a delete after replacing the binary at the same path (`rm` then
  `cp`, new inode). The ad-hoc rebuild runs earlier were also same-name and
  deleted fine. The cleanup test now prints the error text.
- Still open here: Windows compile and `[real]`. The `Unavailable` UX is
  Aurora-4zr.10.
- `docs/Building.md` "Tests" now carries the corrected recipe (same file
  name, `rm` + `cp`, Always Allow vs Allow, signing step, timing cue).

## Delete research (web, 2026-10-02)

- **Cause** (Apple DTS, developer forums thread 69841): the file-based
  keychain shim compares the current executable's name with the app name
  stored in the item's ACL; a mismatch gives -25244 on delete. Triggers:
  renaming the app or executable, or running a renamed copy. In my test a
  different directory with the same name was fine.
- **Apple's recommendation:** use the data-protection keychain (TN3137),
  which keys access on the code signature alone and has no ACL or prompts.
- **For code that stays on the file-based keychain** (Apple's workarounds,
  also used by open-source apps):
  - Modify with `SecItemUpdate`, not delete + add (what `set` already does).
  - If delete fails, `SecItemUpdate` the data to empty as cleanup (readers
    must then treat empty as `NotFound`).
  - Or look the item up with `kSecReturnRef` and call the deprecated
    `SecKeychainItemDelete(ref)`, which works where `SecItemDelete` refuses
    (jitpass/jit#170, Ogard-Labs/octant#924).
  - Call `SecKeychainSetUserInteractionAllowed(false)` around background
    reads so a foreign item fails fast (-25293) instead of hanging on a
    hidden SecurityAgent prompt.
- **Data-protection keychain cost for us:** `kSecUseDataProtectionKeychain`
  plus a `keychain-access-groups` entitlement, which on macOS is restricted:
  a Developer ID binary carrying it without a provisioning profile is
  killed at launch (AMFI, exit 137; reported for Developer ID apps by
  several projects, e.g. M1K3#319). So it needs a Developer ID
  provisioning profile embedded in the bundle, plus a legacy-to-DP
  migration (CodexBar#585 describes one). Real work, not a flag.
- **Recommendation:** no backend change now. Keep the executable name
  `Aurora` stable and document it. Revisit the data-protection keychain
  if the prompt behavior on identity-signed builds proves bad in practice,
  or if the product is ever renamed. Cheap optional hardening if wanted:
  the `SecKeychainItemDelete(ref)` fallback on -25244.

## Follow-up: the two unverified items (2026-10-02)

Method: same file name (`AuroraSecretsTests`) and path every time, new
inode via `rm` + `cp`; the item's ACL dumped with `security dump-keychain
-a`, filtered to `Aurora/acl-check` (attributes only, secret never read).

- **Item ACL after a write** (ad-hoc binary): decrypt authorized for the
  creating app by `cdhash`; `partition_id` = `cdhash:<hash>`; `change_acl`
  has no trusted apps (hence the password dialog to extend it).
- **Always Allow sticks for ad-hoc.** Different ad-hoc build reads: dialog,
  Always Allow, ACL gains that build's `cdhash` in the app list and the
  partition list. The same binary then read in 0.02 s, and a re-copy in
  0.10 s. So the earlier repeat prompts were most likely single-use Allow
  clicks (Allow isn't recorded in the ACL, so each launch asks). I can't
  prove what was clicked then; treat as explained, not reproduced.
- **Ad-hoc, then Developer ID, same name:** the signed build prompted once
  (12 s). After Always Allow the app list holds the signature requirement
  (identifier + Team ID) and the partition list gains `teamid:464U3WR286`.
  A *different* Developer ID build then read in 0.29 s and deleted in
  0.13 s with no prompt. Entry removed (`NotFound`; zero matching items).
- **Net for design:** release users get a silent read and delete on first
  use and across updates. Only a dev who moves from ad-hoc to a signed
  build, or whose Allow was single-use, sees dialogs. That is a developer
  experience, not a user one.

## Resume

1. Mac: done (see "Mac verification"). The returning-user `Unavailable`
   UX moved to Aurora-4zr.10 (blocks 4zr.2 and 4zr.5): nothing in Aurora
   consumes the store until 4zr.5.
2. Windows: compile, then `[real]` (expect `Ok` with no prompt).
3. Then close 2dz (nothing else is outstanding on this bead). Optionally `sudo apt install libsecret-1-dev` on the
   Linux box to drop the configure warning.

## Lessons

- "`weakly_canonical("dir/.")` keeps a trailing slash" (language-cpp.md).
- "Unsetting `DBUS_SESSION_BUS_ADDRESS` doesn't simulate no session bus"
  (debugging-method.md).
- "Building against a distro `-dev` package without sudo"
  (build-toolchain.md).
- "Two build trees sharing `FETCHCONTENT_BASE_DIR` clobber each other"
  (build-toolchain.md).
- "`SecItemDelete` returns `errSecInvalidOwnerEdit` to an executable with a
  different file name than the creator's" (macos-gui.md).
- "A legacy Keychain item's ACL can be dumped without reading the secret"
  (macos-gui.md).
- "A test that adds an unused static does not change the binary"
  (build-toolchain.md).
- "In zsh a word starting with `=` is replaced by a command path"
  (build-toolchain.md).
- "A cross-binary test that renames the binary changes more than the
  variable under test" (debugging-method.md).
