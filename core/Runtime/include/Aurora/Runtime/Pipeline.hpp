#pragma once

#include <atomic>
#include <chrono>
#include <cstdint>
#include <exception>
#include <filesystem>
#include <functional>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>

#include <Aurora/Contracts/UV.hpp>
#include <Aurora/Input/IAudioInput.hpp>
#include <Aurora/Input/IVideoInput.hpp>
#include <Aurora/Output/IOutput.hpp>
#include <Aurora/Runtime/ChangeSignal.hpp>
#include <Aurora/Runtime/Config.hpp>
#include <Aurora/Runtime/GraphRunner.hpp>
#include <Aurora/Runtime/Registry.hpp>
#include <Aurora/Runtime/TickClock.hpp>
#include <Aurora/Runtime/ZoneRoutes.hpp>

namespace Aurora::Runtime
{
  enum class LogLevel { Info, Error };

  // The few things that differ per app (Aurora-9ig). Everything else about
  // building, ticking and swapping a pipeline is shared.
  struct PipelineOptions
  {
    // Thrown when Config asks for audio but this build has no
    // audio support. Apps name their own build toggles here.
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

    // Resolved sink for a live audio input, where the platform knows it
    // (Linux follows the default sink). Null, or an empty return, reports
    // the configured target instead. Runs under the pipeline lock.
    std::function<std::string(Input::IAudioInput&)> describeAudioSink;
  };


  // What a built pipeline is doing, for GET /api/state (Aurora-5ipy.2).
  // effect is a graph id; each side is nullopt when unused.
  struct PipelineSummary
  {
    struct Video
    {
      std::string input;
      std::string monitor; // empty when the input has no selected monitor
    };
    struct Audio
    {
      std::string input;
      std::string sink;     // configured target; empty when following the default
      bool followsDefault{true};
    };

    // What runs, and what Config asked for. They differ after a fallback.
    std::string effect;
    std::string requestedEffect;
    // Why a requested custom effect is not the one running; empty otherwise.
    std::string fallbackReason;
    std::optional<Video> video;
    std::optional<Audio> audio;
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


  class Pipeline;

  // What one build does differently from a plain rebuild of the Config
  // (Aurora-4xqt.1). Both fields are null for an ordinary build.
  struct PipelineBuildOverrides
  {
    // Run this graph in place of the Config's effect (a test on lights). The
    // summary still names the Config's effect, and a graph that cannot run
    // throws instead of falling back to the built-in one.
    const nlohmann::json* graph{nullptr};

    // A running pipeline whose outputs the new one takes over, when its output
    // list is the one this build asks for, so Hue is not re-handshaken. Until
    // the host calls adoptOutputsFrom() the new pipeline only borrows them.
    const Pipeline* outputsFrom{nullptr};
  };


  // Inputs a draft preview needs that the running pipeline does not have, with
  // the Config they open under.
  struct PreviewInputPlan
  {
    std::string video; // empty when the live pipeline already serves one
    std::string audio;
    Config config;

    bool any() const { return !video.empty() || !audio.empty(); }
  };


  // Opens the inputs of `plan` for one preview. Nullopt with errorOut set when
  // one cannot open. Can block on a capture API: never call it under the
  // pipeline lock.
  std::optional<GraphPreview::Inputs> openPreviewInputs(
    const Registry& registry, const PreviewInputPlan& plan, std::string& errorOut);


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
      const PipelineOptions& options,
      const PipelineBuildOverrides& overrides = {}
    );

    // True while this pipeline only borrows the outputs of `overrides.outputsFrom`.
    bool borrowsOutputs() const { return m_borrowedOutputs; }

    // Takes ownership of `previous`'s outputs, which this pipeline borrowed at
    // build time, leaving it with none to shut down. The host calls it under
    // its lock, at the swap, so the old pipeline ticks them until then.
    void adoptOutputsFrom(Pipeline& previous);

    // Applies a Config change to this running pipeline without rebuilding it
    // (Aurora-c0g), when ConfigApply says only live-tunable fields moved. The
    // diff baseline is the Config this pipeline holds (appliedConfig()), not
    // whatever is on disk: after a failed reload, disk is ahead of what is
    // running, and diffing against disk would hide that structural change.
    // Under the lock that guards tick().
    ConfigApplyResult applyConfig(const Config& next);

    // Swaps the running graph for `doc` without a rebuild (Aurora-52oz.4), as
    // `next`'s activeEffectId names it. False, changing nothing, when anything
    // else differs from the running Config, the graph needs other inputs than
    // the ones open, or it fails to load: the caller then rebuilds. Under the
    // lock that guards tick().
    bool swapEffect(const Config& next, const nlohmann::json& doc);

    // Runs `doc` in place for a test on lights (Aurora-52oz.5), changing
    // neither the Config nor the summary. False, changing nothing, when the
    // graph would need other inputs than the ones running or fails to load.
    bool testGraph(const nlohmann::json& doc);

    // Puts the live effect back after testGraph(): `doc` is the custom graph
    // `live` names, empty for a built-in. False, changing nothing, when the
    // live Config differs from the running one, so the caller rebuilds.
    bool restoreEffect(const Config& live, const std::optional<nlohmann::json>& doc);

    // Draft previews beside the live graph (Aurora-52oz.6), see
    // GraphRunner::openPreview. Null with errorOut set when the dev
    // dual-capture spike is on, `inputs` do not cover a source the graph needs
    // that the pipeline lacks, or the graph fails to load. Under the lock that
    // guards tick().
    std::shared_ptr<GraphPreview> openPreview(
      const std::string& session, const nlohmann::json& doc, GraphPreview::Inputs inputs, std::string& errorOut);

    // The inputs `doc` needs beyond the running ones, to open before
    // openPreview(). Nullopt with errorOut set when a needed source is not
    // configured or the spike is on.
    std::optional<PreviewInputPlan> previewInputsFor(const nlohmann::json& doc, std::string& errorOut) const;
    bool reloadPreview(GraphPreview& preview, const nlohmann::json& doc, std::string& errorOut);
    void closePreview(const std::string& session, const GraphPreview* preview);

    // The Config this pipeline was built from, as later changed by
    // applyConfig(). Video mode holds the post-derivation values
    // (refreshRate/subsampleWidth filled in from the display).
    const Config& appliedConfig() const { return m_appliedConfig; }

    // dt comes from PipelineHost::tick() -- one clock for both modes.
    void tick(float dt);

    double tickIntervalSeconds() const { return m_tickIntervalSeconds; }

    bool isAudioMode() const { return m_isAudioMode; }

    PipelineCapabilities capabilities() const;

    PipelineSummary summary() const { return m_summary; }

    // The primary runner's graph doc (video, or audio in audio mode).
    nlohmann::json graphJson() const;

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
    // A custom graph running with both captures on the video runner.
    bool m_bothInputs{false};
    // Aurora-o13 spike: AURORA_DEV_DUAL_CAPTURE builds both runners
    // and ticks both. Video stays primary for config, zones and monitors.
    // The flag also logs per-runner tick timing in single modes.
    bool m_isDualCapture{false};
    struct DualCaptureStats
    {
      std::function<void(LogLevel, const std::string&)> log;
      double videoSum{0}, videoMax{0}, audioSum{0}, audioMax{0};
      // Wall clock: a tick's dt is its nominal interval, not the real rate.
      std::chrono::steady_clock::time_point windowStart{};
      unsigned ticks{0};
    };
    DualCaptureStats m_dualStats;
    Config m_appliedConfig;
    PipelineSummary m_summary;
    double m_tickIntervalSeconds{Runtime::tickIntervalSeconds()};

    // Declaration order matters: m_videoRunner/m_audioRunner hold a
    // reference into m_videoInput/m_audioInput, so those must be declared
    // (and therefore destroyed after, since destruction runs in reverse
    // declaration order) first -- same reasoning already applied to
    // EntertainmentConfigurationSelector's own member order in
    // Aurora-Output-Hue.
    std::unique_ptr<Input::IVideoInput> m_videoInput;
    std::unique_ptr<Input::IAudioInput> m_audioInput;
    // The names the outputs were created under, to match a later build's list.
    std::vector<std::string> m_outputKeys;
    std::vector<std::unique_ptr<Output::IOutput>> m_outputs;
    std::vector<Output::IOutput*> m_outputPtrs;
    bool m_borrowedOutputs{false};
    std::optional<GraphRunner> m_videoRunner;
    std::optional<GraphRunner> m_audioRunner;
  };


  // What the host is doing (Aurora-d3ec). Idle is a host with no pipeline
  // and no error: build() returns null when no input is configured yet (a
  // fresh install), which is not a failure. Failed is no pipeline plus a
  // build error. Paused keeps any failed-resume error. Clients must ignore
  // states they do not know.
  enum class HostState { Idle, Running, Paused, Failed };

  const char* hostStateName(HostState state);

  // One held error, keyed by where it happened: "startup" (the first build,
  // before the host existed), "resume" or "reload", plus entries other
  // components hold through setError (Mac's "audio_permission"). Unique per
  // source. A reload failure is held while a pipeline runs too (the old
  // pipeline keeps going), so "has errors" does not mean "failed"; state
  // says that. Any successful build clears all entries.
  struct HostError
  {
    std::string source;
    std::string message; // already through describeBuildError
    // From one host-wide counter, stamped when the entry is created or
    // replaced (a repeat failure with the same message gets a new id) and
    // never when a publish leaves it alone. dismissError matches on it, so a
    // click racing a new failure cannot clear the new one.
    std::uint64_t id{0};
  };

  // State and errors always read together, so a poll never sees Failed with
  // no error.
  struct HostStatus
  {
    HostState state{HostState::Idle};
    std::vector<HostError> errors;
  };

  // A standing fact about the environment, not a build result (Aurora-rbp3):
  // e.g. Mac's "local_network" while macOS blocks LAN access. Its publisher
  // sets and clears it; builds, pause and host state never touch it, so it
  // shows during first-run setup (idle) too. No id and no dismiss: it goes
  // away when the cause does. Unique per source.
  struct HostCondition
  {
    std::string source;
    std::string message;
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
    //
    // startupFailure is the exception the app's first Pipeline::build threw
    // (nullptr when it did not): the host maps it through describeBuildError
    // and holds it as the "startup" error until a build succeeds.
    PipelineHost(
      std::unique_ptr<Pipeline> initial,
      PipelineOptions options,
      std::exception_ptr startupFailure = nullptr
    );

    // Runs one tick and returns the interval it used, read under the same
    // lock so the loop needs no second lock round trip (Aurora-cgr).
    double tick();
    double tickIntervalSeconds();
    Input::Monitors listMonitors();

    // Same lock as tick() -- a zone edit and an in-progress tick must never
    // interleave, but unlike reload(), this never swaps or rebuilds the
    // Pipeline at all, so it's cheap enough to call on every drag-frame a
    // real Zone Mapping UI sends, not just on a final "Save".
    ZoneListResult listZones();

    // The running pipeline's graph doc; nullopt when idle, failed or paused
    // (no graph is running then). Same lock as tick().
    std::optional<nlohmann::json> graphJson();

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

    // Swaps a custom effect into the running pipeline in place (Aurora-52oz.4),
    // keeping inputs, outputs and node state, so the Hue stream is not
    // re-handshaken. False, changing nothing, when there is no pipeline or
    // Pipeline::swapEffect refuses; the caller then calls reload().
    bool applyEffect(const Config& next, const nlohmann::json& doc);

    // In-place test and restore (Aurora-52oz.5), see Pipeline::testGraph and
    // restoreEffect. False when there is no pipeline or the pipeline refuses.
    bool testGraph(const nlohmann::json& doc);
    bool restoreEffect(const Config& live, const std::optional<nlohmann::json>& doc);

    // Rebuilds the inputs but keeps the live outputs (Aurora-4xqt.1), so a
    // change of inputs does not re-handshake Hue. `graph` runs in place of the
    // Config's effect (test on lights); null builds the Config's own effect
    // (its revert). Falls back to fresh outputs when the output list differs.
    // False with errorOut set, the old pipeline untouched, when there is no
    // running pipeline (idle, failed or paused) or the build fails. Holds the
    // change lock through the build, so apply, pause and reload wait for it.
    bool reloadInputs(
      const Registry& registry,
      const Config& config,
      const std::filesystem::path& configRoot,
      const nlohmann::json* graph,
      std::string& errorOut
    );

    // Draft previews under the pipeline lock, see Pipeline::openPreview. A
    // source the live pipeline lacks opens for the preview alone, outside the
    // lock, and closes with it. They die with the pipeline: a rebuild moves
    // buildEpoch() and a stream that saw the old one ends.
    std::shared_ptr<GraphPreview> openPreview(
      const std::string& session, const nlohmann::json& doc, const Registry& registry, std::string& errorOut);
    bool reloadPreview(GraphPreview& preview, const nlohmann::json& doc, std::string& errorOut);
    void closePreview(const std::string& session, const GraphPreview* preview);

    // Moves on every rebuild (reload, resume). With isPaused() it tells a test
    // on lights its pipeline is gone.
    std::uint64_t buildEpoch() const { return m_buildEpoch.load(); }

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
    // running:true on a Failed host is a retry: it rebuilds like reload()
    // and is the same attempt POST /api/reload makes. False with errorOut set
    // when that build, or a resume build, fails (a paused host stays paused),
    // and when running:false finds nothing to pause (errorOut is then
    // kNothingToPause, since the host is idle or failed, not running).
    bool setRunning(
      bool running,
      const Registry& registry,
      const std::filesystem::path& configRoot,
      std::string& errorOut
    );

    // Lock-free, so the capabilities heartbeat can read it.
    bool isPaused() const { return m_paused.load(); }

    // State plus any held build errors as one snapshot. Takes only its own
    // leaf lock, never m_mutex, so GET /api/state polling never waits on a
    // tick or a reload in progress.
    HostStatus status() const;

    static constexpr const char* kNothingToPause = "nothing_to_pause";

    // Holds an entry for `source` beside whatever else is held (merge by
    // source, new id). Only while a pipeline runs: returns false, storing
    // nothing, when paused, failed or idle.
    bool setError(const std::string& source, const std::string& message);

    // Removes the entry for `source`, whatever its id. False when none.
    bool removeError(const std::string& source);

    enum class DismissResult
    {
      Removed,
      Stale,      // no entry with that source and id (already gone or replaced)
      NotRunning  // paused, failed or idle: those errors are the explanation, not noise
    };

    // The banner's X: removes the entry only if its id still matches and the
    // host is running.
    DismissResult dismissError(const std::string& source, std::uint64_t id);

    // Creates or replaces the condition for `source`; any host state.
    void setCondition(const std::string& source, const std::string& message);

    // Removes the condition for `source`. False when none.
    bool clearCondition(const std::string& source);

    // Snapshot under its own leaf lock, never m_mutex, so /api/state
    // polling never waits on a tick or a reload.
    std::vector<HostCondition> conditions() const;

    // Moves whenever status, errors or conditions change (Aurora-5ipy.3), so
    // GET /api/events wakes without polling. Leaf lock only, never m_mutex.
    ChangeSignal& changes() const { return m_changes; }

    // What the running pipeline uses, lock-free. Updated on every swap and
    // kept through pause(), so a paused Dashboard keeps its sections. A
    // failed reload leaves it unchanged: the old pipeline is still running.
    PipelineCapabilities capabilities() const;

    // The last built pipeline's summary, kept through pause like
    // capabilities(); empty (no effect, no sides) when idle or failed. Its
    // own leaf lock, so polling never waits on a tick or reload.
    PipelineSummary summary() const;

    // Resolved audio sink via PipelineOptions::describeAudioSink; empty when
    // there is no hook, no live audio input, or nothing resolved. Takes the
    // pipeline lock, so call it only when an audio side is reported.
    std::string resolvedAudioSink();

    const std::string& audioDevicesUrl() const { return m_options.audioDevicesUrl; }

  private:
    mutable std::mutex m_summaryMutex;
    PipelineSummary m_summary;
    // Packs capabilities into one atomic, so a reader never sees half of
    // a swap.
    void _storeCapabilities(const Pipeline* pipeline);
    std::atomic<std::uint8_t> m_capabilityBits{0};

    std::string _describeBuildError(const std::exception& e) const;

    // Publishes state + errors for the current m_pipeline/m_paused, replacing
    // the whole list. Caller holds m_mutex (and m_changeMutex when it also
    // changed m_pipeline). Entries must already carry their ids.
    void _publishStatusLocked(std::vector<HostError> errors);

    // Runs `swap` on the pipeline under both locks and, when it succeeds and
    // `clearFallback` is set, drops the held effect_fallback entry. False when
    // there is no pipeline.
    bool _swapInPlace(const std::function<bool(Pipeline&)>& swap, bool clearFallback, const char* logLine);

    // Publishes a freshly built pipeline's status: no errors, except the
    // effect_fallback entry when it fell back from a custom effect. Caller
    // holds m_mutex.
    void _publishBuiltLocked();

    // Creates or replaces the entry for `source` (new id), keeping the rest.
    // Caller holds m_mutex.
    void _setErrorLocked(const std::string& source, const std::string& message);

    // A build failure ("startup", "resume", "reload"): a newer attempt at the
    // same build, so it supersedes the earlier build entries instead of
    // sitting beside them (a failed retry of a failed startup shows one row,
    // not two). Entries other components hold are kept. Caller holds m_mutex.
    void _setBuildErrorLocked(const std::string& source, const std::string& message);

    // A failed build. Takes the locks itself and stores nothing when a pause
    // landed during the build or when a successful build landed since it
    // started (`epoch`, read before the build): that error describes a
    // config the host has since replaced.
    void _recordFailure(const char* source, const std::string& message, std::uint64_t epoch);

    PipelineOptions m_options;
    std::mutex m_mutex;

    // Leaf lock, taken last (after m_mutex), only around m_status.
    mutable std::mutex m_statusMutex;
    HostStatus m_status;

    // Independent leaf lock: conditions never interact with m_status.
    mutable std::mutex m_conditionsMutex;
    std::vector<HostCondition> m_conditions;

    mutable ChangeSignal m_changes;

    // Both under m_mutex.
    std::uint64_t m_nextErrorId{1};
    // Bumped on every successful swap (reload, resume); see _recordFailure.
    std::atomic<std::uint64_t> m_buildEpoch{0};

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


  // What an effect apply calls (Aurora-52oz.4): loads Config and the active
  // custom effect's file fresh from disk and swaps it in place, else reloads.
  // Same return shape as reloadPipelineFromDisk.
  std::string applyEffectFromDisk(
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
