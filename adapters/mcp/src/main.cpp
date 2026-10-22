#include "McpServer.hpp"

#include <httplib.h>

#include <cstdlib>
#include <iostream>
#include <string>

#ifdef _WIN32
#include <fcntl.h>
#include <io.h>
#include <process.h>
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
}


int main()
{
#ifdef _WIN32
  // Text mode would turn each "\n" into "\r\n" on the wire.
  _setmode(_fileno(stdout), _O_BINARY);
  _setmode(_fileno(stdin), _O_BINARY);
#endif

  const std::string url = envOr("AURORA_URL", "http://127.0.0.1:8215");
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
