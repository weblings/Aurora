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
    m_httpServerImpl = std::make_unique<Impl>(m_routes, m_staticDir, m_embeddedFiles, m_prefixedEmbeddedFiles);

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


  void HttpServer::serveEmbeddedFiles(EmbeddedFiles files)
  {
    m_embeddedFiles = std::move(files);
  }


  void HttpServer::serveEmbeddedFilesAt(const std::string& prefix, EmbeddedFiles files)
  {
    // Normalize to "/name" so "graph-editor", "/graph-editor/" and
    // "/graph-editor" all register the same routes.
    std::string normalized = prefix;
    while(!normalized.empty() && normalized.back() == '/'){
      normalized.pop_back();
    }
    if(normalized.empty() || normalized.front() != '/'){
      normalized.insert(normalized.begin(), '/');
    }
    m_prefixedEmbeddedFiles.emplace_back(std::move(normalized), std::move(files));
  }


  void HttpServer::serveStaticFiles(const std::filesystem::path& directory)
  {
    m_staticDir = directory;
  }
}
