#include <Aurora/Network/Http/Server/HttpServer.hpp>

#include <Aurora/Network/Http/Server/Impl/HttpLibServerImpl.hpp>

#include <cstdlib>
#include <sstream>


namespace Aurora::Network::Http::Server
{
  HttpServer::HttpServer()
  {
  }


  HttpServer::~HttpServer()
  {
  }


  void HttpServer::makeImpl()
  {
    std::vector<std::string> allowedHosts = m_extraAllowedHosts;
    if(const char* env = std::getenv("AURORA_ALLOWED_HOSTS")){
      std::stringstream list(env);
      for(std::string item; std::getline(list, item, ',');){
        allowedHosts.push_back(item);
      }
    }

    m_httpServerImpl = std::make_unique<Impl>(m_routes, m_streamRoutes, m_workerThreads, m_maxStreams, m_staticDir, m_embeddedFiles, m_prefixedEmbeddedFiles, allowedHosts, m_accessGuard);
  }


  bool HttpServer::bind(
    const std::string& boundAddress,
    unsigned port
  )
  {
    makeImpl();
    return m_httpServerImpl->bind(boundAddress, port);
  }


  int HttpServer::bindToAnyPort(const std::string& boundAddress)
  {
    makeImpl();
    return m_httpServerImpl->bindToAnyPort(boundAddress);
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


  bool HttpServer::aliasRoute(
    HttpMethod method,
    const std::string& fromPath,
    const std::string& toPath
  )
  {
    for(const auto& route : m_routes){
      if(route.method == method && route.path == fromPath){
        const Handler handler = route.handler;
        addRoute(method, toPath, handler);
        return true;
      }
    }
    return false;
  }


  void HttpServer::addStreamRoute(
    const std::string& path,
    StreamHandler handler
  )
  {
    m_streamRoutes.push_back({path, std::move(handler)});
  }


  std::vector<RouteInfo> HttpServer::routeList() const
  {
    std::vector<RouteInfo> routes;
    for(const auto& route : m_routes){
      routes.push_back({route.method, route.path, false});
    }
    for(const auto& route : m_streamRoutes){
      routes.push_back({HttpMethod::Get, route.path, true});
    }
    return routes;
  }


  void HttpServer::setStreamLimits(size_t workerThreads, size_t maxStreams)
  {
    m_workerThreads = workerThreads;
    m_maxStreams = maxStreams;
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


  void HttpServer::setExtraAllowedHosts(std::vector<std::string> hosts)
  {
    m_extraAllowedHosts = std::move(hosts);
  }


  void HttpServer::setAccessGuard(std::shared_ptr<AccessGuard> guard)
  {
    m_accessGuard = std::move(guard);
  }


  void HttpServer::serveStaticFiles(const std::filesystem::path& directory)
  {
    m_staticDir = directory;
  }
}
