#include "McpServer.hpp"

#include <httplib.h>

#include <cstdlib>
#include <iostream>
#include <string>

#ifdef _WIN32
#include <fcntl.h>
#include <io.h>
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
  httplib::Headers headers;
  if(!token.empty()){
    headers.emplace("Authorization", "Bearer " + token);
  }

  Aurora::Mcp::McpServer server(
    [&client, &headers](const std::string& path){
      Aurora::Mcp::HttpReply reply;
      const httplib::Result result = client.Get(path, headers);
      if(result){
        reply.status = result->status;
        reply.body = result->body;
      }
      else{
        reply.error = httplib::to_string(result.error());
      }
      return reply;
    },
    AURORA_VERSION
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
  return 0;
}
