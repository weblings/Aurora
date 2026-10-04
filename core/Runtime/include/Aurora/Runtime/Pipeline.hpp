#pragma once

#include <atomic>
#include <cstdint>
#include <exception>
#include <filesystem>
#include <functional>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <vector>

#include <Aurora/Contracts/UV.hpp>
#include <Aurora/Input/IAudioInput.hpp>
#include <Aurora/Input/IVideoInput.hpp>
#include <Aurora/Output/IOutput.hpp>
#include <Aurora/Runtime/Config.hpp>
#include <Aurora/Runtime/Orchestrator.hpp>
#include <Aurora/Runtime/Registry.hpp>
#include <Aurora/Runtime/TickClock.hpp>
#include <Aurora/Runtime/ZoneRoutes.hpp>
#ifdef AURORA_RUNTIME_AUDIO_AVAILABLE
#include <Aurora/Runtime/AudioOrchestrator.hpp>
#endif

namespace Aurora::Runtime
{
  enum class LogLevel { Info, Error };

  // The few things that differ per app (Aurora-9ig). Everything else about
  // building, ticking and swapping a pipeline is shared.
  struct PipelineOptions
  {
    // Thrown when Config asks for audio but this build has no
    // AudioOrchestrator. Apps name their own build toggles here.
    std::string noAudioSupportMessage{
      "activeAudioInputName is set, but this build has no audio support"
    };

    // Null writes Info to stdout and Error to stderr.
    std::function<void(LogLevel, const std::string&)> log;

    // Turns a failed build into PipelineHost::reload()'s errorOut. Null
    // uses e.what(). Mac maps its capture PermissionError to the stable
    // "permission_denied: "/"permission_pending: " prefixes the WebUI checks.
    std::function<std::string(const std::exception&)> describeBuildError;

    // Route that lists this build's audio devices for the WebUI's device
    // dropdown (Linux: /api/linux/audio-sinks). Empty when the build has
    // none; Mac/Windows follow the default device. GET /api/state reports it.
    std::string audioDevicesUrl;
  };


  // What a running pipeline uses (Aurora-kea), so the WebUI shows sections
  // from what runs rather than from a Video/Audio mode read out of Config.
  // Independent flags, not a mode: a later graph may set more than one, and
  // none set means nothing runs (fresh install, or no input configured).
  struct PipelineCapabilities
  {
    bool usesVideoInput{false};
    bool usesAudioInput{false};
    bool samplesZones{false};
  };


  // What Pipeline::applyConfig did. needsReload means nothing was changed and
  // the caller must rebuild. afterUnlock, if set, is work that can block
  // (a capture-API round trip) and so must run outside the PipelineHost lock
  // -- see PipelineHost::applyConfig.
  struct ConfigApplyResult
  {
    bool needsReload{false};
    std::function<void()> afterUnlock;
  };


  // The swappable unit a live reload tears down and reconstructs -- the
  // "reconstruction, not mutation" design fork from huenicorn recommended in
  // docs/HttpServerAnalysis.md. Inputs and outputs come from the app's
  // Registry, so this needs no platform knowledge of its own.
  class Pipeline
  {
  public:
    // Throws on any unrecoverable failure (unknown input/output name, no
    // outputs available) -- caller decides whether that's fatal (first
    // startup) or recoverable (a later reload, old pipeline stays running).
    // Returns null when Config names no input at all (onboarding still in
    // progress) -- an idle, non-error state.
    static std::unique_ptr<Pipeline> build(
      const Registry& registry,
      const Config& config,
      const std::filesystem::path& configRoot,
      const PipelineOptions& options
    );

    // Applies a Config change to this running pipeline without rebuilding it
    // (Aurora-c0g), when ConfigApply says only live-tunable fields moved. The
    // diff baseline is the Config this pipeline holds (appliedConfig()), not
    // whatever is on disk: after a failed reload, disk is ahead of what is
    // running, and diffing against disk would hide that structural change.
    // Under the lock that guards tick().
    ConfigApplyResult applyConfig(const Config& next);

    // The Config this pipeline was built from, as later changed by
    // applyConfig(). Video mode holds the post-derivation values
    // (refreshRate/subsampleWidth filled in from the display).
    const Config& appliedConfig() const { return m_appliedConfig; }

    // dt comes from PipelineHost::tick() -- one clock for both modes.
    void tick(float dt);

    double tickIntervalSeconds() const { return m_tickIntervalSeconds; }

    bool isAudioMode() const { return m_isAudioMode; }

    PipelineCapabilities capabilities() const;

    // Empty in audio mode -- no monitor concept applies then, not an error.
    Input::Monitors listMonitors() const;

    // Null outside audio mode. For platform status queries that
    // dynamic_cast to their own grabber type (Linux sink status, Mac
    // permission state) -- deliberately not on IAudioInput.
    Input::IAudioInput* audioInput() const;

    // Empty in audio mode or with no outputs -- same "nothing to report,
    // not an error" precedent as listMonitors(). Only the first output is
    // considered: today's only real output is Hue, and the WebUI's own
    // Zone Mapping screen is designed around one unified zone grid, not
    // per-output tabs -- a documented v1 scope limit, not an oversight.
    ZoneListResult listZones() const;

    bool updateZone(
      std::uint8_t zoneId,
      const std::optional<Contracts::UVs>& uvs,
      const std::optional<bool>& active,
      const std::optional<float>& gamma
    );

    void shutdown(bool isReplacement);

  private:
    Pipeline() = default;

    bool m_isAudioMode{false};
    Config m_appliedConfig;
    double m_tickIntervalSeconds{Runtime::tickIntervalSeconds()};

    // Declaration order matters: m_orchestrator/m_audioOrchestrator hold a
    // reference into m_videoInput/m_audioInput, so those must be declared
    // (and therefore destroyed after, since destruction runs in reverse
    // declaration order) first -- same reasoning already applied to
    // EntertainmentConfigurationSelector's own member order in
    // Aurora-Output-Hue.
    std::unique_ptr<Input::IVideoInput> m_videoInput;
    std::unique_ptr<Input::IAudioInput> m_audioInput;
    std::vector<std::unique_ptr<Output::IOutput>> m_outputs;
    std::vector<Output::IOutput*> m_outputPtrs;
    std::optional<Orchestrator> m_orchestrator;
#ifdef AURORA_RUNTIME_AUDIO_AVAILABLE
    std::optional<AudioOrchestrator> m_audioOrchestrator;
#endif
  };


  // One consistent lock around the swappable Pipeline -- the design
  // HttpServerAnalysis.md recommended over huenicorn's own narrower
  // single-mutex approach, since Aurora reconstructs the whole pipeline
  // rather than mutating pieces of a live one. tick() (the tick-loop
  // thread) and reload() (the HTTP server's thread, via a settings PUT or
  // /api/reload) both take the same lock; reload() builds the replacement
  // *before* acquiring it, so a slow or failing build never blocks a tick in
  // progress, and the old pipeline's shutdown() runs only after the swap,
  // once no tick() call can reach it anymore.
  class PipelineHost
  {
  public:
    // initial may be nullptr -- a fresh install has no outputs configured
    // yet, so there's nothing to build. Every method below tolerates that
    // empty state instead of requiring the WebUI to fail startup just to
    // reach pairing.
    PipelineHost(std::unique_ptr<Pipeline> initial, PipelineOptions options);

    void tick();
    double tickIntervalSeconds();
    Input::Monitors listMonitors();

    // Same lock as tick() -- a zone edit and an in-progress tick must never
    // interleave, but unlike reload(), this never swaps or rebuilds the
    // Pipeline at all, so it's cheap enough to call on every drag-frame a
    // real Zone Mapping UI sends, not just on a final "Save".
    ZoneListResult listZones();
    bool updateZone(
      std::uint8_t zoneId,
      const std::optional<Contracts::UVs>& uvs,
      const std::optional<bool>& active,
      const std::optional<float>& gamma
    );

    // Runs fn with the live audio input (null outside audio mode, or with no
    // pipeline) under the pipeline lock, so a concurrent reload can't free
    // it mid-query. Callers poll this on a slow diagnostic cadence, never
    // the lock-free capabilities heartbeat.
    template<typename Fn>
    auto withAudioInput(Fn&& fn)
    {
      std::lock_guard<std::mutex> lock(m_mutex);
      return fn(m_pipeline ? m_pipeline->audioInput() : nullptr);
    }

    // Applies `next` to the live pipeline when only live-tunable fields
    // changed (Aurora-c0g). Returns false -- changing nothing -- when the
    // change needs a reload or there is no pipeline yet; the caller then
    // calls reload(). Anything that can block runs after the pipeline lock is
    // released, so a slow capture API cannot stall ticks or other API calls.
    bool applyConfig(const Config& next);

    // Returns true on success. On failure, errorOut is set and the previous
    // pipeline keeps running untouched -- a bad reload (e.g. an
    // activeInputName a settings PUT just wrote that doesn't resolve to any
    // registered input) must not take down an already-working pipeline.
    bool reload(
      const Registry& registry,
      const Config& config,
      const std::filesystem::path& configRoot,
      std::string& errorOut
    );

    void shutdown();

    // Pause (Aurora-3ddb): tears the pipeline down (outputs shutdown(false),
    // capture closed) but keeps the host and its HTTP server alive. No-op,
    // returning false, when already paused or when there is no pipeline.
    // The last monitor and zone lists stay served while paused.
    bool pause();

    // Rebuilds from `config`. No-op success when not paused. On a failed
    // build, errorOut is set and the host stays paused so a retry works.
    bool resume(
      const Registry& registry,
      const Config& config,
      const std::filesystem::path& configRoot,
      std::string& errorOut
    );

    // The one pause/resume entry point (Aurora-5ipy.18): PUT /api/state and
    // every tray item call this, so none reimplements resume. Idempotent.
    // Resume loads config from configRoot and can take seconds (Hue DTLS,
    // Linux portal dialog): call from a task, never a UI or D-Bus thread.
    // False with errorOut set only when a resume build fails (stays paused).
    bool setRunning(
      bool running,
      const Registry& registry,
      const std::filesystem::path& configRoot,
      std::string& errorOut
    );

    // Lock-free, so the capabilities heartbeat can read it.
    bool isPaused() const { return m_paused.load(); }

    // What the running pipeline uses, lock-free. Updated on every swap and
    // kept through pause(), so a paused Dashboard keeps its sections. A
    // failed reload leaves it unchanged: the old pipeline is still running.
    PipelineCapabilities capabilities() const;

    const std::string& audioDevicesUrl() const { return m_options.audioDevicesUrl; }

  private:
    // Packs capabilities into one atomic, so a reader never sees half of
    // a swap.
    void _storeCapabilities(const Pipeline* pipeline);
    std::atomic<std::uint8_t> m_capabilityBits{0};

    PipelineOptions m_options;
    std::mutex m_mutex;

    // Taken first, serializes pause()/resume() so two resumes cannot open
    // two capture-portal dialogs (Aurora-5t2).
    std::mutex m_pauseMutex;

    // Set under m_mutex. reload() while set succeeds without building, so a
    // settings save, /api/reload or Hue pairing cannot silently resume.
    std::atomic<bool> m_paused{false};
    Input::Monitors m_pausedMonitors;
    ZoneListResult m_pausedZones;

    // Taken before m_mutex. Serializes applyConfig() against the swap in
    // reload(), so the out-of-lock follow-up of an apply never runs against a
    // pipeline a reload has just replaced and destroyed. The swap, not the
    // (slow) build, is all that waits on it.
    std::mutex m_changeMutex;
    std::unique_ptr<Pipeline> m_pipeline;
  };


  // What a settings PUT calls (Aurora-c0g): loads Config fresh from disk,
  // applies it live if only live-tunable fields changed, else reloads. Same
  // return shape as reloadPipelineFromDisk. Not for POST /api/reload or Hue
  // pairing, which must rebuild even though Config is unchanged.
  std::string applyConfigFromDisk(
    PipelineHost& pipelineHost,
    const Registry& registry,
    const std::filesystem::path& configRoot
  );


  // "Every settings PUT funnels into the reload entrypoint": the one reload
  // path POST /api/reload and Hue pairing share (a settings save goes through
  // applyConfigFromDisk, which falls back to this).
  // Re-loads Config from disk (reflecting whatever the caller just saved)
  // rather than closing over a stale copy. Returns "" on success, else the
  // error, the shape SettingsRoutes' onConfigChanged expects.
  std::string reloadPipelineFromDisk(
    PipelineHost& pipelineHost,
    const Registry& registry,
    const std::filesystem::path& configRoot
  );
}
