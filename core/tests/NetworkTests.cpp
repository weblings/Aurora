#include <chrono>
#include <fstream>
#include <thread>

#include <catch2/catch_test_macros.hpp>
#include <httplib.h>

#include <Aurora/Network/Http/Server/HttpServer.hpp>

using namespace Aurora::Network::Http::Server;
using namespace std::chrono_literals;


namespace
{
  // bind() only binds the socket -- listen() (started on its own thread
  // below, matching the real threading model in docs/HttpServerAnalysis.md)
  // is what starts accept()-ing. A client request issued the instant the
  // thread starts can still race that, so retry briefly instead of sleeping
  // a fixed guess.
  httplib::Result getWithRetry(httplib::Client& client, const std::string& path)
  {
    httplib::Result result;
    for(int attempt = 0; attempt < 50; ++attempt){
      result = client.Get(path);
      if(result && result->status != -1){
        return result;
      }
      std::this_thread::sleep_for(10ms);
    }
    return result;
  }


  struct ScopedTempDir
  {
    std::filesystem::path path;

    explicit ScopedTempDir(const std::string& name):
    path(std::filesystem::temp_directory_path() / ("aurora-network-tests-" + name))
    {
      std::filesystem::remove_all(path);
      std::filesystem::create_directories(path);
    }

    ~ScopedTempDir()
    {
      std::filesystem::remove_all(path);
    }
  };
}


TEST_CASE("HttpServer serves a registered route on its own thread", "[HttpServer]")
{
  HttpServer server;
  server.addRoute(HttpMethod::Get, "/hello", [](const Request&, Response& res){
    res.contentType = "text/plain";
    res.body = "world";
  });

  REQUIRE(server.bind("127.0.0.1", 18215));

  std::thread serverThread([&](){ server.listen(); });

  httplib::Client client("127.0.0.1", 18215);
  auto result = getWithRetry(client, "/hello");

  REQUIRE(result);
  CHECK(result->status == 200);
  CHECK(result->body == "world");

  server.stop();
  serverThread.join();
}


TEST_CASE("HttpServer reads a request body and path params into the plain Request type", "[HttpServer]")
{
  HttpServer server;
  server.addRoute(HttpMethod::Put, "/echo/:name", [](const Request& req, Response& res){
    res.contentType = "application/json";
    res.body = "{\"name\":\"" + req.pathParams.at("name") + "\",\"body\":\"" + req.body + "\"}";
  });

  REQUIRE(server.bind("127.0.0.1", 18216));

  std::thread serverThread([&](){ server.listen(); });

  httplib::Client client("127.0.0.1", 18216);
  httplib::Result result;
  for(int attempt = 0; attempt < 50; ++attempt){
    result = client.Put("/echo/zone1", "hi", "text/plain");
    if(result && result->status != -1){
      break;
    }
    std::this_thread::sleep_for(10ms);
  }

  REQUIRE(result);
  CHECK(result->status == 200);
  CHECK(result->body == "{\"name\":\"zone1\",\"body\":\"hi\"}");

  server.stop();
  serverThread.join();
}


TEST_CASE("HttpServer's serveStaticFiles answers a request path with the matching file's contents", "[HttpServer]")
{
  ScopedTempDir webroot("static");
  std::ofstream(webroot.path / "app.js") << "console.log(1);";

  HttpServer server;
  server.serveStaticFiles(webroot.path);

  REQUIRE(server.bind("127.0.0.1", 18217));

  std::thread serverThread([&](){ server.listen(); });

  httplib::Client client("127.0.0.1", 18217);
  auto result = getWithRetry(client, "/app.js");

  REQUIRE(result);
  CHECK(result->status == 200);
  CHECK(result->body == "console.log(1);");

  server.stop();
  serverThread.join();
}
TEST_CASE("HttpServer's serveEmbeddedFiles answers paths with matching entries and content types", "[HttpServer]")
{
  HttpServer::EmbeddedFiles files = {
    {"app.js", "console.log(1);"},
    {"styles/shell.css", "x{}"},
  };

  HttpServer server;
  server.serveEmbeddedFiles(files);

  REQUIRE(server.bind("127.0.0.1", 18218));

  std::thread serverThread([&](){ server.listen(); });

  httplib::Client client("127.0.0.1", 18218);

  auto js = getWithRetry(client, "/app.js");
  REQUIRE(js);
  CHECK(js->status == 200);
  CHECK(js->body == "console.log(1);");
  CHECK(js->get_header_value("Content-Type") == "text/javascript");

  auto css = getWithRetry(client, "/styles/shell.css");
  REQUIRE(css);
  CHECK(css->status == 200);
  CHECK(css->body == "x{}");
  CHECK(css->get_header_value("Content-Type") == "text/css");

  server.stop();
  serverThread.join();
}


TEST_CASE("HttpServer's serveEmbeddedFiles answers / with index.html and 404s unknown paths", "[HttpServer]")
{
  HttpServer::EmbeddedFiles files = {
    {"index.html", "<html></html>"},
    {"404.html", "missing"},
  };

  HttpServer server;
  server.serveEmbeddedFiles(files);

  REQUIRE(server.bind("127.0.0.1", 18219));

  std::thread serverThread([&](){ server.listen(); });

  httplib::Client client("127.0.0.1", 18219);

  auto root = getWithRetry(client, "/");
  REQUIRE(root);
  CHECK(root->status == 200);
  CHECK(root->body == "<html></html>");

  auto missing = getWithRetry(client, "/nope.js");
  REQUIRE(missing);
  CHECK(missing->status == 404);
  CHECK(missing->body == "missing");

  server.stop();
  serverThread.join();
}


TEST_CASE("HttpServer's API routes win ties over serveEmbeddedFiles entries", "[HttpServer]")
{
  HttpServer::EmbeddedFiles files = {
    {"app.js", "embedded"},
  };

  HttpServer server;
  server.addRoute(HttpMethod::Get, "/app.js", [](const Request&, Response& res){
    res.contentType = "text/plain";
    res.body = "route";
  });
  server.serveEmbeddedFiles(files);

  REQUIRE(server.bind("127.0.0.1", 18220));

  std::thread serverThread([&](){ server.listen(); });

  httplib::Client client("127.0.0.1", 18220);
  auto result = getWithRetry(client, "/app.js");

  REQUIRE(result);
  CHECK(result->status == 200);
  CHECK(result->body == "route");

  server.stop();
  serverThread.join();
}
