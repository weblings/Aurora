#pragma once

#include <string>
#include <vector>

#include <Aurora/Contracts/ControlDescriptor.hpp>

#include <nlohmann/json.hpp>

namespace Aurora::Network::Http::Server { class HttpServer; }

// Tooltip descriptor plumbing for Aurora-WebUI (see
// docs/TooltipsAnalysis.md). One schema, defined once in core;
// every module kind (input/output plugins, video+audio processing,
// zone runtime, app shell) authors its own descriptor *content*
// through it. The frontend looks tooltips up purely by key and never
// knows which layer answered, so a variable module set needs zero
// frontend changes per module.
//
// Keys are namespaced by owning module (input.*, output.hue.*,
// video.*, audio.*, zones.*, app.*); the module consuming a setting
// owns its descriptor. Descriptions are user-facing text, initially
// the literal "Test" everywhere until copy is authored.
namespace Aurora::Runtime
{
  // Schema lives in Contracts so input/output plugins (which must not
  // depend on Runtime) can author descriptors; kept under the Runtime
  // name here so existing call sites don't churn.
  using ControlDescriptor = Aurora::Contracts::ControlDescriptor;


  // Merges every contributor's descriptors into one frontend payload.
  // Pure logic, no I/O: collisions are recorded (not logged) so the app
  // shell can emit them on its own diagnostic channel. Later
  // contributions win, so the app shell -- aggregated last -- can
  // intentionally specialize wording per platform.
  class DescriptorRegistry
  {
  public:
    struct Collision
    {
      std::string key;
      std::string keptOwner;
      std::string droppedOwner;
    };

    void add(std::string owner, std::vector<ControlDescriptor> descriptors);

    // Merged descriptors in first-seen key order.
    const std::vector<ControlDescriptor>& descriptors() const;

    const std::vector<Collision>& collisions() const;

    // Null when no contributor described key -- the frontend renders the
    // control exactly as without tooltips in that case, never an error.
    const ControlDescriptor* find(const std::string& key) const;

    // {"descriptors": [{key, kind, description}, ...]} -- the shape the
    // frontend fetches from the descriptors endpoint.
    nlohmann::json toJson() const;

  private:
    std::vector<ControlDescriptor> m_descriptors;
    std::vector<std::string> m_owners; // parallel to m_descriptors
    std::vector<Collision> m_collisions;
  };


  // Serves a merged registry as GET /api/descriptors. Static per build --
  // the frontend fetches it once per session, never per screen, and a
  // missing endpoint (old binary) or failed fetch degrades to today's
  // tooltip-less UI, never an error.
  void registerDescriptorRoutes(
    Aurora::Network::Http::Server::HttpServer& server,
    const DescriptorRegistry& registry
  );
}
