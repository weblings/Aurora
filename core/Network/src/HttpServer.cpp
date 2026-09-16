#include <Aurora/Network/Http/Server/HttpServer.hpp>

#include <Aurora/Network/Http/Server/Impl/HttpLibServerImpl.hpp>


namespace Aurora::Network::Http::Server
{
  HttpServer::HttpServer()
  {
  }


  HttpServer::~HttpServer()
  {
  }


  bool HttpServer::bind(
    const std::string& boundAddress,
    unsigned port
  )
  {
    m_httpServerImpl = std::make_unique<Impl>(m_routes, m_staticDir);

    return m_httpServerImpl->bind(boundAddress, port);
  }


  bool HttpServer::listen()
  {
    return m_httpServerImpl->listen();
  }


  bool HttpServer::stop()
  {
    return m_httpServerImpl->stop();
  }

  void HttpServer::addRoute(
    HttpMethod method,
    const std::string& path,
    Handler handler
  )
  {
    m_routes.push_back({method, path, handler});
  }


  void HttpServer::serveStaticFiles(const std::filesystem::path& directory)
  {
    m_staticDir = directory;
  }
}
