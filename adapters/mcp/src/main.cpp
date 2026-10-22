#include "McpServer.hpp"
#include "Pair.hpp"

#include <httplib.h>

#include <chrono>
#include <cstdlib>
#include <iostream>
#include <string>
#include <thread>

#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <fcntl.h>
#include <io.h>
#include <process.h>
#include <windows.h>
#define getpid _getpid
#else
#include <unistd.h>
#endif

#ifndef AURORA_VERSION
#define AURORA_VERSION "dev"
#endif

namespace
{
  std::string envOr(const char* name, const char* fallback)
  {
    const char* value = std::getenv(name);
    return (value && *value) ? value : fallback;
  }

  constexpr char kUsage[] =
    "Usage: aurora-mcp                  stdio MCP server (the client starts this)\n"
    "       aurora-mcp --pair [--scope apply|draft|read] [--name NAME]\n"
    "                                   pair a token for a LAN Aurora at AURORA_URL\n";

  // "aurora-mcp on Studio-Mac (macOS)", so the approver can recognise the device.
  std::string defaultDeviceName()
  {
    char host[256] = {};
#ifdef _WIN32
    DWORD size = sizeof(host);
    if(!GetComputerNameA(host, &size)){
      host[0] = 0;
    }
    const char* os = "Windows";
#else
    if(gethostname(host, sizeof(host) - 1) != 0){
      host[0] = 0;
    }
#ifdef __APPLE__
    const char* os = "macOS";
#else
    const char* os = "Linux";
#endif
#endif
    return host[0] ? std::string("aurora-mcp on ") + host + " (" + os + ")" : std::string("aurora-mcp (") + os + ")";
  }

  int runPair(const std::string& url, const std::string& scope, const std::string& name)
  {
    if(Aurora::Mcp::isLoopbackUrl(url)){
      std::cerr << "AURORA_URL (" << url << ") is this computer, which needs no token. "
        "Set AURORA_URL to the other computer's address first.\n";
      return 2;
    }
    httplib::Client client(url);
    client.set_connection_timeout(2, 0);
    client.set_read_timeout(5, 0);
    const Aurora::Mcp::Fetch fetch = [&client](const std::string& method, const std::string& path, const std::string& body){
      Aurora::Mcp::HttpReply reply;
      const httplib::Result result = method == "POST" ? client.Post(path, body, "application/json") : client.Get(path);
      if(result){
        reply.status = result->status;
        reply.body = result->body;
      }
      else{
        reply.error = httplib::to_string(result.error());
      }
      return reply;
    };
    return Aurora::Mcp::pair(fetch, name, scope, std::cout, std::cerr,
      []{ std::this_thread::sleep_for(std::chrono::seconds(1)); });
  }
}


int main(int argc, char** argv)
{
  const std::string url = envOr("AURORA_URL", "http://127.0.0.1:8215");

  bool pairMode = false;
  std::string scope = "apply";
  std::string name = defaultDeviceName();
  for(int i = 1; i < argc; ++i){
    const std::string arg = argv[i];
    if(arg == "--pair"){
      pairMode = true;
    }
    else if((arg == "--scope" || arg == "--name") && i + 1 < argc){
      (arg == "--scope" ? scope : name) = argv[++i];
    }
    else{
      std::cerr << kUsage;
      return arg == "--help" || arg == "-h" ? 0 : 2;
    }
  }
  if(pairMode){
    return runPair(url, scope, name);
  }

#ifdef _WIN32
  // Text mode would turn each "\n" into "\r\n" on the wire.
  _setmode(_fileno(stdout), _O_BINARY);
  _setmode(_fileno(stdin), _O_BINARY);
#endif

  // Set by the user in the client's MCP config, never by the agent. Loopback needs none.
  const std::string token = envOr("AURORA_TOKEN", "");

  httplib::Client client(url);
  client.set_connection_timeout(2, 0);
  client.set_read_timeout(5, 0);
  // Marks applies as MCP's, so Aurora points the Dashboard toggle at them.
  httplib::Headers headers{{"X-Aurora-Client", "mcp"}};
  if(!token.empty()){
    headers.emplace("Authorization", "Bearer " + token);
  }

  // The heartbeat thread gets its own connection, so a slow call never stalls it.
  httplib::Client beatClient(url);
  beatClient.set_connection_timeout(2, 0);
  beatClient.set_read_timeout(5, 0);

  const auto fetchWith = [&headers](httplib::Client& http){
    return [&http, &headers](const std::string& method, const std::string& path, const std::string& body){
      Aurora::Mcp::HttpReply reply;
      const httplib::Result result = method == "PUT" ? http.Put(path, headers, body, "application/json")
        : method == "POST" ? http.Post(path, headers, body, "application/json")
        : method == "DELETE" ? http.Delete(path, headers)
        : http.Get(path, headers);
      if(result){
        reply.status = result->status;
        reply.body = result->body;
      }
      else{
        reply.error = httplib::to_string(result.error());
      }
      return reply;
    };
  };

  Aurora::Mcp::McpServer server(
    fetchWith(client),
    AURORA_VERSION,
    // One draft per adapter process, named so concurrent clients do not collide.
    "mcp-" + std::to_string(getpid()),
    fetchWith(beatClient)
  );

  // stdout carries protocol only, so diagnostics go to stderr.
  for(std::string line; std::getline(std::cin, line);){
    if(!line.empty() && line.back() == '\r'){
      line.pop_back();
    }
    if(line.empty()){
      continue;
    }
    if(const auto reply = server.handleLine(line)){
      std::cout << *reply << '\n' << std::flush;
    }
  }
  server.shutdown();
  return 0;
}
