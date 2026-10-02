#pragma once

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

    // dt comes from PipelineHost::tick() -- one clock for both modes.
    void tick(float dt);

    double tickIntervalSeconds() const { return m_tickIntervalSeconds; }

    bool isAudioMode() const { return m_isAudioMode; }

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

  private:
    PipelineOptions m_options;
    std::mutex m_mutex;
    std::unique_ptr<Pipeline> m_pipeline;
  };


  // "Every settings PUT funnels into the reload entrypoint": the one reload
  // path POST /api/reload, a settings save and Hue pairing all share.
  // Re-loads Config from disk (reflecting whatever the caller just saved)
  // rather than closing over a stale copy. Returns "" on success, else the
  // error, the shape SettingsRoutes' onConfigChanged expects.
  std::string reloadPipelineFromDisk(
    PipelineHost& pipelineHost,
    const Registry& registry,
    const std::filesystem::path& configRoot
  );
}
