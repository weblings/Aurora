#pragma once

#include <optional>
#include <string_view>

#include <Aurora/Runtime/Config.hpp>

// What a change to each Config field needs from a running Pipeline
// (Aurora-c0g): applied live, or a full reload. One table, keyed by the
// persisted field name (ConfigStore's configKeys()), so a settings PUT can
// skip the Hue DTLS handshake when only processing knobs moved.
//
// A field absent from the table is treated as Reload, the safe answer, and
// the tests fail until it is classified.
namespace Aurora::Runtime
{
  enum class ApplyKind
  {
    Hot,      // processing only: swap it into the live orchestrator
    Reload,   // structural: inputs, outputs, device selection
    NoEffect  // nothing in the pipeline reads it
  };

  // Which pipeline mode a Hot field is read in. A Hot field changed in the
  // other mode has no effect, so it neither applies nor forces a reload.
  enum class ModeScope { Video, Audio };

  struct FieldApply
  {
    std::string_view key;
    ApplyKind kind;
    ModeScope scope; // meaningful for Hot only

    // Non-null for a field where 0 means "derive from the display" at build
    // time. Hot-applying to or from 0 would need that derivation, so any
    // change touching 0 reloads instead.
    unsigned (*derivedAtZero)(const Config&){nullptr};
  };

  const FieldApply* classifyConfigField(std::string_view key);

  enum class ChangeAction
  {
    None,   // nothing the running pipeline reads changed
    Hot,    // apply live
    Reload  // rebuild
  };

  // What moving from `applied` (the Config the running pipeline holds) to
  // `next` requires. Any Reload field, unclassified field, or derived-field
  // change touching 0 makes the whole change a Reload.
  ChangeAction planConfigChange(const Config& applied, const Config& next, bool audioMode);
}
