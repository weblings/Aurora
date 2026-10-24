#include <chrono>
#include <fstream>
#include <thread>
#include <utility>
#include <vector>

#ifndef _WIN32
#include <unistd.h>
#endif

#include <catch2/catch_test_macros.hpp>
#include <httplib.h>

#include <Aurora/Network/Http/Server/HttpServer.hpp>

#include "SseReader.hpp"

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

  const int port = server.bindToAnyPort("127.0.0.1");
  REQUIRE(port > 0);

  std::thread serverThread([&](){ server.listen(); });

  httplib::Client client("127.0.0.1", port);
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

  const int port = server.bindToAnyPort("127.0.0.1");
  REQUIRE(port > 0);

  std::thread serverThread([&](){ server.listen(); });

  httplib::Client client("127.0.0.1", port);
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

  const int port = server.bindToAnyPort("127.0.0.1");
  REQUIRE(port > 0);

  std::thread serverThread([&](){ server.listen(); });

  httplib::Client client("127.0.0.1", port);
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

  const int port = server.bindToAnyPort("127.0.0.1");
  REQUIRE(port > 0);

  std::thread serverThread([&](){ server.listen(); });

  httplib::Client client("127.0.0.1", port);

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


TEST_CASE("HttpServer's serveEmbeddedFiles serves a GIF as image/gif with its bytes intact", "[HttpServer]")
{
  // GIF89a header plus a NUL and a high byte, so a truncating or
  // text-mangling path would show up in the body comparison.
  const std::string gif("GIF89a\x01\x00\xff\x3b", 10);
  HttpServer::EmbeddedFiles files = {
    {"icons/MacTray.gif", gif},
  };

  HttpServer server;
  server.serveEmbeddedFiles(files);

  const int port = server.bindToAnyPort("127.0.0.1");
  REQUIRE(port > 0);

  std::thread serverThread([&](){ server.listen(); });

  httplib::Client client("127.0.0.1", port);
  auto result = getWithRetry(client, "/icons/MacTray.gif");

  REQUIRE(result);
  CHECK(result->status == 200);
  CHECK(result->body == gif);
  CHECK(result->get_header_value("Content-Type") == "image/gif");

  server.stop();
  serverThread.join();
}


TEST_CASE("HttpServer's serveStaticFiles serves a GIF as image/gif", "[HttpServer]")
{
  ScopedTempDir webroot("static-gif");
  std::ofstream(webroot.path / "tip.gif", std::ios::binary) << "GIF89a";

  HttpServer server;
  server.serveStaticFiles(webroot.path);

  const int port = server.bindToAnyPort("127.0.0.1");
  REQUIRE(port > 0);

  std::thread serverThread([&](){ server.listen(); });

  httplib::Client client("127.0.0.1", port);
  auto result = getWithRetry(client, "/tip.gif");

  REQUIRE(result);
  CHECK(result->status == 200);
  CHECK(result->get_header_value("Content-Type") == "image/gif");

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

  const int port = server.bindToAnyPort("127.0.0.1");
  REQUIRE(port > 0);

  std::thread serverThread([&](){ server.listen(); });

  httplib::Client client("127.0.0.1", port);

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

  const int port = server.bindToAnyPort("127.0.0.1");
  REQUIRE(port > 0);

  std::thread serverThread([&](){ server.listen(); });

  httplib::Client client("127.0.0.1", port);
  auto result = getWithRetry(client, "/app.js");

  REQUIRE(result);
  CHECK(result->status == 200);
  CHECK(result->body == "route");

  server.stop();
  serverThread.join();
}


TEST_CASE("HttpServer's serveEmbeddedFilesAt serves a map under its prefix with index and redirect handling", "[HttpServer]")
{
  HttpServer::EmbeddedFiles files = {
    {"index.html", "<html>editor</html>"},
    {"assets/index.mjs", "export {};"},
    {"assets/index.js.map", "{}"},
    {"assets/font.woff2", "wOF2"},
    {"assets/core.wasm", std::string("\0asm", 4)},
    {"assets/photo.webp", "RIFF"},
    {"THIRD-PARTY-NOTICES.md", "# Licenses"},
  };

  HttpServer server;
  server.serveEmbeddedFilesAt("/graph-editor/", files);

  const int port = server.bindToAnyPort("127.0.0.1");
  REQUIRE(port > 0);

  std::thread serverThread([&](){ server.listen(); });

  httplib::Client client("127.0.0.1", port);

  auto index = getWithRetry(client, "/graph-editor/");
  REQUIRE(index);
  CHECK(index->status == 200);
  CHECK(index->body == "<html>editor</html>");
  CHECK(index->get_header_value("Content-Type") == "text/html");

  auto bare = getWithRetry(client, "/graph-editor");
  REQUIRE(bare);
  CHECK(bare->status == 301);
  CHECK(bare->get_header_value("Location") == "/graph-editor/");

  const std::vector<std::pair<std::string, std::string>> types = {
    {"/graph-editor/assets/index.mjs", "text/javascript"},
    {"/graph-editor/assets/index.js.map", "application/json"},
    {"/graph-editor/assets/font.woff2", "font/woff2"},
    {"/graph-editor/assets/core.wasm", "application/wasm"},
    {"/graph-editor/assets/photo.webp", "image/webp"},
    {"/graph-editor/THIRD-PARTY-NOTICES.md", "text/markdown"},
  };
  for(const auto& [path, type] : types){
    INFO(path);
    auto result = getWithRetry(client, path);
    REQUIRE(result);
    CHECK(result->status == 200);
    CHECK(result->get_header_value("Content-Type") == type);
  }

  auto wasm = getWithRetry(client, "/graph-editor/assets/core.wasm");
  REQUIRE(wasm);
  CHECK(wasm->body == std::string("\0asm", 4));

  auto missing = getWithRetry(client, "/graph-editor/nope.js");
  REQUIRE(missing);
  CHECK(missing->status == 404);

  auto outside = getWithRetry(client, "/index.html");
  REQUIRE(outside);
  CHECK(outside->status == 404);

  server.stop();
  serverThread.join();
}


TEST_CASE("HttpServer's serveEmbeddedFilesAt works alongside serveStaticFiles", "[HttpServer]")
{
  ScopedTempDir webroot("static-with-prefixed");
  std::ofstream(webroot.path / "app.js") << "static";

  HttpServer server;
  server.serveStaticFiles(webroot.path);
  server.serveEmbeddedFilesAt("/graph-editor", {{"index.html", "editor"}});

  const int port = server.bindToAnyPort("127.0.0.1");
  REQUIRE(port > 0);

  std::thread serverThread([&](){ server.listen(); });

  httplib::Client client("127.0.0.1", port);

  auto staticFile = getWithRetry(client, "/app.js");
  REQUIRE(staticFile);
  CHECK(staticFile->status == 200);
  CHECK(staticFile->body == "static");

  auto editor = getWithRetry(client, "/graph-editor/");
  REQUIRE(editor);
  CHECK(editor->status == 200);
  CHECK(editor->body == "editor");

  server.stop();
  serverThread.join();
}


TEST_CASE("HttpServer's serveEmbeddedFilesAt wins over the root serveEmbeddedFiles fallback", "[HttpServer]")
{
  HttpServer server;
  server.serveEmbeddedFiles({{"index.html", "root"}, {"graph-editor/index.html", "root copy"}});
  server.serveEmbeddedFilesAt("graph-editor", {{"index.html", "editor"}});

  const int port = server.bindToAnyPort("127.0.0.1");
  REQUIRE(port > 0);

  std::thread serverThread([&](){ server.listen(); });

  httplib::Client client("127.0.0.1", port);

  auto root = getWithRetry(client, "/");
  REQUIRE(root);
  CHECK(root->body == "root");

  auto editor = getWithRetry(client, "/graph-editor/");
  REQUIRE(editor);
  CHECK(editor->body == "editor");

  server.stop();
  serverThread.join();
}


TEST_CASE("HttpServer rejects cross-origin writes but allows same-origin and headerless ones", "[HttpServer]")
{
  // Aurora-5i3: the daemon binds 0.0.0.0 with no auth, so a foreign web
  // page must not be able to drive state-changing routes through the
  // browser. Browsers attach Origin; curl/scripts/tests send none.
  bool wrote = false;
  HttpServer server;
  server.addRoute(HttpMethod::Put, "/thing", [&wrote](const Request& req, Response& res){
    wrote = true;
    res.contentType = "text/plain";
    res.body = "wrote:" + req.body;
  });
  server.addRoute(HttpMethod::Get, "/thing", [](const Request&, Response& res){
    res.contentType = "text/plain";
    res.body = "read";
  });

  const int port = server.bindToAnyPort("127.0.0.1");
  REQUIRE(port > 0);

  std::thread serverThread([&](){ server.listen(); });

  httplib::Client client("127.0.0.1", port);
  auto putWithOrigin = [&](const char* origin){
    httplib::Result result;
    httplib::Headers headers;
    if(origin){
      headers.emplace("Origin", origin);
    }
    for(int attempt = 0; attempt < 50; ++attempt){
      result = client.Put("/thing", headers, "x", "text/plain");
      if(result && result->status != -1){
        return result;
      }
      std::this_thread::sleep_for(10ms);
    }
    return result;
  };

  // No Origin (curl/scripts/tests): allowed.
  auto plain = putWithOrigin(nullptr);
  REQUIRE(plain);
  CHECK(plain->status == 200);
  CHECK(wrote);
  wrote = false;

  // Same-origin browser fetch: allowed.
  auto same = putWithOrigin("http://127.0.0.1:18227");
  REQUIRE(same);
  CHECK(same->status == 200);
  CHECK(wrote);
  wrote = false;

  // Another site's page driving localhost: rejected, handler never runs.
  auto evil = putWithOrigin("http://evil.com");
  REQUIRE(evil);
  CHECK(evil->status == 403);
  CHECK(evil->body == "{\"succeeded\":false,\"error\":\"cross_origin_forbidden\"}");
  CHECK(!wrote);

  // Referer fallback covers clients that strip Origin.
  httplib::Result referred;
  for(int attempt = 0; attempt < 50; ++attempt){
    referred = client.Put("/thing", {{"Referer", "http://evil.com/page"}}, "x", "text/plain");
    if(referred && referred->status != -1){
      break;
    }
    std::this_thread::sleep_for(10ms);
  }
  REQUIRE(referred);
  CHECK(referred->status == 403);
  CHECK(!wrote);

  // Reads stay open regardless of Origin.
  auto read = getWithRetry(client, "/thing");
  REQUIRE(read);
  CHECK(read->status == 200);
  CHECK(read->body == "read");
  auto readEvil = client.Get("/thing", {{"Origin", "http://evil.com"}});
  REQUIRE(readEvil);
  CHECK(readEvil->status == 200);

  server.stop();
  serverThread.join();
}


TEST_CASE("HttpServer Host allowlist rejects forged hostnames and admits literals, localhost and extras", "[HttpServer]")
{
  // Aurora-5ipy.4: DNS rebinding arrives with the attacker's hostname in Host.
  HttpServer server;
  server.addRoute(HttpMethod::Get, "/thing", [](const Request&, Response& res){
    res.contentType = "text/plain";
    res.body = "read";
  });
  server.serveEmbeddedFiles({{"index.html", "root"}});
  server.setExtraAllowedHosts({"aurora.example.test"});

  const int port = server.bindToAnyPort("127.0.0.1");
  REQUIRE(port > 0);

  std::thread serverThread([&](){ server.listen(); });

  httplib::Client client("127.0.0.1", port);
  auto statusFor = [&](const std::string& host, const char* path = "/thing"){
    for(int attempt = 0; attempt < 50; ++attempt){
      auto result = client.Get(path, {{"Host", host}});
      if(result && result->status != -1){
        return result->status;
      }
      std::this_thread::sleep_for(10ms);
    }
    return -1;
  };

  CHECK(statusFor("evil.com") == 403);
  CHECK(statusFor("evil.com:18228") == 403);
  CHECK(statusFor("evil.com", "/") == 403);
  CHECK(statusFor("localhost.evil.com") == 403);

  for(const char* ok : {"127.0.0.1", "127.0.0.1:18228", "192.168.1.20:8080", "[::1]", "[::1]:18228",
                        "localhost", "LOCALHOST:18228", "app.localhost", "aurora.example.test:18228"}){
    CHECK(statusFor(ok) == 200);
  }

  char name[256] = {};
  if(gethostname(name, sizeof(name) - 1) == 0 && name[0] != '\0'){
    std::string machine = name;
    CHECK(statusFor(machine) == 200);
    CHECK(statusFor(machine + ":18228") == 200);
    // macOS reports a hostname that may already end in ".local"; the
    // server admits <short name>.local, so build it from the short name.
    CHECK(statusFor(machine.substr(0, machine.find('.')) + ".local") == 200);
  }

  server.stop();
  serverThread.join();
}


namespace
{
  // Writes one event per 20 ms until the stream closes.
  void tickingStream(const Request&, EventStream& stream)
  {
    while(stream.open()){
      stream.write("data: tick\n\n");
      std::this_thread::sleep_for(20ms);
    }
  }
}


TEST_CASE("HttpServer stream route answers text/event-stream and delivers writes", "[HttpServer][Stream]")
{
  HttpServer server;
  server.addStreamRoute("/events", tickingStream);
  const int port = server.bindToAnyPort("127.0.0.1");
  REQUIRE(port > 0);
  std::thread serverThread([&](){ server.listen(); });

  {
    SseReader reader(port, "/events");
    CHECK(reader.status() == 200);
    CHECK(reader.waitFor("data: tick\n\n"));
    CHECK(reader.data().rfind("retry: 3000\n\n", 0) == 0);
  }

  server.stop();
  serverThread.join();
}


TEST_CASE("HttpServer stop() returns while a stream is open (Aurora-5ipy.3)", "[HttpServer][Stream]")
{
  HttpServer server;
  server.addStreamRoute("/events", tickingStream);
  const int port = server.bindToAnyPort("127.0.0.1");
  REQUIRE(port > 0);
  std::thread serverThread([&](){ server.listen(); });

  SseReader reader(port, "/events");
  REQUIRE(reader.waitFor("data: tick"));

  const auto started = std::chrono::steady_clock::now();
  server.stop();
  CHECK(std::chrono::steady_clock::now() - started < 3s);
  serverThread.join();
  CHECK(reader.waitFinished());
}


TEST_CASE("HttpServer rejects a stream past the cap and frees the slot on disconnect (Aurora-5ipy.3)", "[HttpServer][Stream]")
{
  HttpServer server;
  server.addStreamRoute("/events", tickingStream);
  server.addRoute(HttpMethod::Get, "/ping", [](const Request&, Response& res){ res.body = "pong"; });
  server.setStreamLimits(4, 2);
  const int port = server.bindToAnyPort("127.0.0.1");
  REQUIRE(port > 0);
  std::thread serverThread([&](){ server.listen(); });

  {
    auto first = std::make_unique<SseReader>(port, "/events");
    SseReader second(port, "/events");
    REQUIRE(first->waitFor("data: tick"));
    REQUIRE(second.waitFor("data: tick"));

    SseReader third(port, "/events");
    CHECK(third.status() == 503);
    CHECK(third.retryAfter() == "3");
    CHECK(third.waitFinished());
    CHECK(third.data().find("too_many_streams") != std::string::npos);

    // Plain routes still answer with every stream slot taken.
    httplib::Client client("127.0.0.1", port);
    auto ping = getWithRetry(client, "/ping");
    REQUIRE(ping);
    CHECK(ping->body == "pong");

    // Dropping a stream frees its slot for a new one.
    first.reset();
    bool admitted = false;
    for(int attempt = 0; attempt < 50 && !admitted; ++attempt){
      SseReader retry(port, "/events");
      admitted = retry.status() == 200 && retry.waitFor("data: tick");
      if(!admitted){ std::this_thread::sleep_for(50ms); }
    }
    CHECK(admitted);
  }

  server.stop();
  serverThread.join();
}
