#include <Aurora/Runtime/PublicApiRoutes.hpp>

namespace Aurora::Runtime
{
  void registerPublicApiRoutes(
    Aurora::Network::Http::Server::HttpServer&,
    PipelineHost&,
    const Registry&,
    const std::filesystem::path&,
    std::shared_ptr<ReloadCoalescer>,
    std::shared_ptr<LightTest>,
    Aurora::Network::Http::Server::AccessGuard*
  )
  {
  }
}
