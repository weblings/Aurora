#pragma once

#include <memory>

#include <Aurora/Network/Http/Server/HttpServer.hpp>
#include <Aurora/Network/Http/Server/Pairing.hpp>

namespace Aurora::Network::Http::Server
{
  // Registers /api/pairing/* on `server` and the matching rules on `guard`:
  // status, request and poll are open (an unpaired device must reach them),
  // pending, approve, deny and device list/revoke are Admin.
  void registerPairingRoutes(
    HttpServer& server,
    const std::shared_ptr<PairingService>& service,
    AccessGuard& guard
  );
}
