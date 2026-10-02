#include <chrono>
#include <fstream>
#include <thread>
#include <utility>
#include <vector>

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

  REQUIRE(server.bind("127.0.0.1", 18222));

  std::thread serverThread([&](){ server.listen(); });

  httplib::Client client("127.0.0.1", 18222);
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

  REQUIRE(server.bind("127.0.0.1", 18223));

  std::thread serverThread([&](){ server.listen(); });

  httplib::Client client("127.0.0.1", 18223);
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

  REQUIRE(server.bind("127.0.0.1", 18224));

  std::thread serverThread([&](){ server.listen(); });

  httplib::Client client("127.0.0.1", 18224);

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

  REQUIRE(server.bind("127.0.0.1", 18225));

  std::thread serverThread([&](){ server.listen(); });

  httplib::Client client("127.0.0.1", 18225);

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

  REQUIRE(server.bind("127.0.0.1", 18226));

  std::thread serverThread([&](){ server.listen(); });

  httplib::Client client("127.0.0.1", 18226);

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

  REQUIRE(server.bind("127.0.0.1", 18227));

  std::thread serverThread([&](){ server.listen(); });

  httplib::Client client("127.0.0.1", 18227);
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
