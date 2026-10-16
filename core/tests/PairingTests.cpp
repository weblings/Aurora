#include <chrono>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <thread>

#include <catch2/catch_test_macros.hpp>
#include <httplib.h>
#include <nlohmann/json.hpp>

#include <Aurora/Network/Http/Server/HttpServer.hpp>
#include <Aurora/Network/Http/Server/Pairing.hpp>
#include <Aurora/Network/Http/Server/PairingRoutes.hpp>

using namespace Aurora::Network::Http::Server;
using namespace std::chrono_literals;


namespace
{
  const auto kRemote = [](const std::string&){ return false; };

  AccessRequest remoteRequest(HttpMethod method, const std::string& path, const std::string& token = "")
  {
    AccessRequest request;
    request.method = method;
    request.path = path;
    request.remoteAddr = "192.168.1.50";
    if(!token.empty()){
      request.authorization = "Bearer " + token;
    }
    return request;
  }


  std::filesystem::path tempStore(const std::string& name)
  {
    auto dir = std::filesystem::temp_directory_path() / ("aurora-pairing-tests-" + name);
    std::filesystem::remove_all(dir);
    return dir / "paired-devices.json";
  }
}


TEST_CASE("sha256Hex matches the FIPS test vectors", "[Pairing]")
{
  CHECK(sha256Hex("") == "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  CHECK(sha256Hex("abc") == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  CHECK(sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")
    == "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
}


TEST_CASE("AccessGuard trusts loopback and gates remote writes on a valid token", "[Pairing]")
{
  auto service = std::make_shared<PairingService>();
  AccessGuard guard(service);

  AccessRequest loopback = remoteRequest(HttpMethod::Put, "/api/config");
  loopback.remoteAddr = "127.0.0.1";
  CHECK(guard.decide(loopback).result == AccessDecision::Result::Allow);
  CHECK(guard.decide(loopback).local);
  loopback.remoteAddr = "::1";
  CHECK(guard.decide(loopback).result == AccessDecision::Result::Allow);

  CHECK(guard.decide(remoteRequest(HttpMethod::Get, "/api/state")).result == AccessDecision::Result::Allow);
  CHECK(guard.decide(remoteRequest(HttpMethod::Put, "/api/config")).result == AccessDecision::Result::Unauthorized);
  CHECK(guard.decide(remoteRequest(HttpMethod::Put, "/api/config", "aur_bogus")).result == AccessDecision::Result::Unauthorized);

  std::string token = service->mintForTest("phone", Scope::Admin);
  CHECK(guard.decide(remoteRequest(HttpMethod::Put, "/api/config", token)).result == AccessDecision::Result::Allow);

  AccessRequest cookie = remoteRequest(HttpMethod::Put, "/api/config");
  cookie.cookie = "theme=dark; aurora_token=" + token + "; other=1";
  CHECK(guard.decide(cookie).result == AccessDecision::Result::Allow);
}


TEST_CASE("AccessGuard rejects a revoked token", "[Pairing]")
{
  auto service = std::make_shared<PairingService>();
  AccessGuard guard(service);

  std::string token = service->mintForTest("phone", Scope::Admin);
  auto request = remoteRequest(HttpMethod::Post, "/api/reload", token);
  REQUIRE(guard.decide(request).result == AccessDecision::Result::Allow);

  REQUIRE(service->revoke(service->devices().front().id));
  CHECK(guard.decide(request).result == AccessDecision::Result::Unauthorized);
}


TEST_CASE("AccessGuard enforces scopes and longest-prefix rules, with open paths for pairing and callbacks", "[Pairing]")
{
  auto service = std::make_shared<PairingService>();
  AccessGuard guard(service);
  guard.addRule("/api/mode", Scope::Apply);
  guard.addRule("/api/graph/draft", Scope::Draft);
  guard.addRule("/api/graph", Scope::Admin);
  guard.addRule("/api/ha/callback", Scope::None);

  std::string apply = service->mintForTest("adapter", Scope::Apply);
  std::string draft = service->mintForTest("editor", Scope::Draft);

  CHECK(guard.decide(remoteRequest(HttpMethod::Post, "/api/mode", apply)).result == AccessDecision::Result::Allow);
  CHECK(guard.decide(remoteRequest(HttpMethod::Post, "/api/mode", draft)).result == AccessDecision::Result::Forbidden);
  CHECK(guard.decide(remoteRequest(HttpMethod::Post, "/api/graph/draft/validate", draft)).result == AccessDecision::Result::Allow);
  CHECK(guard.decide(remoteRequest(HttpMethod::Post, "/api/graph/apply", draft)).result == AccessDecision::Result::Forbidden);
  CHECK(guard.decide(remoteRequest(HttpMethod::Put, "/api/config", apply)).result == AccessDecision::Result::Forbidden);

  // Prefix boundary: /api/modes is not under /api/mode.
  CHECK(guard.decide(remoteRequest(HttpMethod::Post, "/api/modes", apply)).result == AccessDecision::Result::Forbidden);

  CHECK(guard.decide(remoteRequest(HttpMethod::Get, "/api/ha/callback")).result == AccessDecision::Result::Allow);
  CHECK(guard.decide(remoteRequest(HttpMethod::Post, "/api/ha/callback")).result == AccessDecision::Result::Allow);
}


TEST_CASE("AccessGuard takes an injected is-local predicate", "[Pairing]")
{
  auto service = std::make_shared<PairingService>();
  AccessGuard guard(service, kRemote);

  AccessRequest request = remoteRequest(HttpMethod::Put, "/api/config");
  request.remoteAddr = "127.0.0.1";
  CHECK(guard.decide(request).result == AccessDecision::Result::Unauthorized);
}


TEST_CASE("PairingService stores only token hashes and survives a restart", "[Pairing]")
{
  auto path = tempStore("persist");
  std::string token;
  {
    PairingService service(path);
    token = service.mintForTest("phone", Scope::Apply);
  }

  std::ifstream file(path);
  std::stringstream text;
  text << file.rdbuf();
  CHECK(text.str().find(token) == std::string::npos);
  CHECK(text.str().find(sha256Hex(token)) != std::string::npos);

  PairingService reloaded(path);
  auto device = reloaded.authenticate(token);
  REQUIRE(device);
  CHECK(device->scope == Scope::Apply);
  CHECK(device->name == "phone");

  REQUIRE(reloaded.revoke(device->id));
  PairingService afterRevoke(path);
  CHECK_FALSE(afterRevoke.authenticate(token));

  std::filesystem::remove_all(path.parent_path());
}


TEST_CASE("PairingService treats a corrupt store as no devices", "[Pairing]")
{
  auto path = tempStore("corrupt");
  std::filesystem::create_directories(path.parent_path());
  std::ofstream(path) << "{not json";

  PairingService service(path);
  CHECK(service.devices().empty());

  std::filesystem::remove_all(path.parent_path());
}


TEST_CASE("PairingService approval flow hands the token out once", "[Pairing]")
{
  std::int64_t now = 1000;
  PairingService service({}, [&](){ return now; });

  auto ticket = service.requestPairing("Pixel 8", Scope::Admin);
  REQUIRE(ticket);
  CHECK(ticket->code.size() == 5);
  CHECK(service.poll(ticket->pollKey).state == PairingPoll::State::Pending);

  auto pending = service.pending();
  REQUIRE(pending.size() == 1);
  CHECK(pending[0].code == ticket->code);
  CHECK(pending[0].name == "Pixel 8");

  REQUIRE(service.approve(pending[0].ref, Scope::Apply));
  auto first = service.poll(ticket->pollKey);
  REQUIRE(first.state == PairingPoll::State::Approved);
  CHECK(first.scope == Scope::Apply);
  CHECK(service.authenticate(first.token));
  CHECK(service.poll(ticket->pollKey).state == PairingPoll::State::Unknown);
  CHECK(service.pending().empty());
}


TEST_CASE("PairingService denied and expired requests poll as unknown", "[Pairing]")
{
  std::int64_t now = 1000;
  PairingService service({}, [&](){ return now; });

  auto denied = service.requestPairing("a", Scope::Admin);
  REQUIRE(denied);
  REQUIRE(service.deny(service.pending().front().ref));
  CHECK(service.poll(denied->pollKey).state == PairingPoll::State::Unknown);

  auto expired = service.requestPairing("b", Scope::Admin);
  REQUIRE(expired);
  now += 301;
  CHECK(service.poll(expired->pollKey).state == PairingPoll::State::Unknown);
  CHECK(service.devices().empty());
}


TEST_CASE("PairingService caps pending requests", "[Pairing]")
{
  PairingService service;
  for(int i = 0; i < 8; ++i){
    REQUIRE(service.requestPairing("flood", Scope::Admin));
  }
  CHECK_FALSE(service.requestPairing("flood", Scope::Admin));
}


TEST_CASE("HttpServer with an AccessGuard enforces pairing end to end for a remote caller", "[Pairing][HttpServer]")
{
  auto service = std::make_shared<PairingService>();
  auto guard = std::make_shared<AccessGuard>(service, kRemote);

  HttpServer server;
  server.addRoute(HttpMethod::Get, "/api/state", [](const Request&, Response& res){ res.body = "state"; });
  server.addRoute(HttpMethod::Put, "/api/config", [](const Request&, Response& res){ res.body = "saved"; });
  registerPairingRoutes(server, service, *guard);
  server.setAccessGuard(guard);

  const int port = server.bindToAnyPort("127.0.0.1");
  REQUIRE(port > 0);
  std::thread serverThread([&](){ server.listen(); });

  httplib::Client client("127.0.0.1", port);
  httplib::Result read;
  for(int attempt = 0; attempt < 50; ++attempt){
    read = client.Get("/api/state");
    if(read && read->status != -1){
      break;
    }
    std::this_thread::sleep_for(10ms);
  }
  REQUIRE(read);
  CHECK(read->status == 200);

  auto unpaired = client.Put("/api/config", "{}", "application/json");
  REQUIRE(unpaired);
  CHECK(unpaired->status == 401);

  auto status = client.Get("/api/pairing/status");
  REQUIRE(status);
  CHECK(nlohmann::json::parse(status->body)["required"] == true);

  // Unpaired devices cannot see or approve requests.
  CHECK(client.Get("/api/pairing/pending")->status == 401);

  auto asked = client.Post("/api/pairing/request", R"({"name":"Phone"})", "application/json");
  REQUIRE(asked);
  CHECK(asked->status == 202);
  auto ticket = nlohmann::json::parse(asked->body);
  std::string pollPath = "/api/pairing/request/" + ticket["pollKey"].get<std::string>();
  CHECK(client.Get(pollPath)->status == 202);

  // The trusted UI is stood in for by a minted admin token.
  std::string admin = service->mintForTest("Desktop", Scope::Admin);
  httplib::Headers adminAuth = {{"Authorization", "Bearer " + admin}};
  auto pending = client.Get("/api/pairing/pending", adminAuth);
  REQUIRE(pending);
  REQUIRE(pending->status == 200);
  auto list = nlohmann::json::parse(pending->body)["pending"];
  REQUIRE(list.size() == 1);
  CHECK(list[0]["code"] == ticket["code"]);
  auto approve = client.Post("/api/pairing/pending/" + list[0]["ref"].get<std::string>() + "/approve", adminAuth, "{}", "application/json");
  REQUIRE(approve);
  CHECK(approve->status == 200);

  auto approved = client.Get(pollPath);
  REQUIRE(approved);
  CHECK(approved->status == 200);
  std::string token = nlohmann::json::parse(approved->body)["token"];
  CHECK(approved->get_header_value("Set-Cookie").find("aurora_token=" + token) == 0);
  CHECK(approved->get_header_value("Set-Cookie").find("HttpOnly") != std::string::npos);
  CHECK(client.Get(pollPath)->status == 404);

  // Paired: bearer and cookie both pass.
  auto viaBearer = client.Put("/api/config", httplib::Headers{{"Authorization", "Bearer " + token}}, "{}", "application/json");
  REQUIRE(viaBearer);
  CHECK(viaBearer->status == 200);
  auto viaCookie = client.Put("/api/config", httplib::Headers{{"Cookie", "aurora_token=" + token}}, "{}", "application/json");
  REQUIRE(viaCookie);
  CHECK(viaCookie->status == 200);

  // The Origin check still applies to a valid cookie.
  auto crossOrigin = client.Put(
    "/api/config",
    httplib::Headers{{"Cookie", "aurora_token=" + token}, {"Origin", "http://evil.example"}},
    "{}",
    "application/json"
  );
  REQUIRE(crossOrigin);
  CHECK(crossOrigin->status == 403);

  // Revoking cuts the device off.
  std::string id;
  for(const auto& device : service->devices()){
    if(device.name == "Phone"){
      id = device.id;
    }
  }
  REQUIRE_FALSE(id.empty());
  auto revoke = client.Delete("/api/pairing/devices/" + id, adminAuth);
  REQUIRE(revoke);
  CHECK(revoke->status == 200);
  auto revoked = client.Put("/api/config", httplib::Headers{{"Cookie", "aurora_token=" + token}}, "{}", "application/json");
  REQUIRE(revoked);
  CHECK(revoked->status == 401);

  server.stop();
  serverThread.join();
}


TEST_CASE("HttpServer with an AccessGuard leaves loopback callers trusted", "[Pairing][HttpServer]")
{
  auto service = std::make_shared<PairingService>();
  auto guard = std::make_shared<AccessGuard>(service);

  HttpServer server;
  server.addRoute(HttpMethod::Put, "/api/config", [](const Request& req, Response& res){
    res.body = req.local ? "local" : "remote";
  });
  server.setAccessGuard(guard);

  const int port = server.bindToAnyPort("127.0.0.1");
  REQUIRE(port > 0);
  std::thread serverThread([&](){ server.listen(); });

  httplib::Client client("127.0.0.1", port);
  httplib::Result result;
  for(int attempt = 0; attempt < 50; ++attempt){
    result = client.Put("/api/config", "{}", "application/json");
    if(result && result->status != -1){
      break;
    }
    std::this_thread::sleep_for(10ms);
  }
  REQUIRE(result);
  CHECK(result->status == 200);
  CHECK(result->body == "local");

  server.stop();
  serverThread.join();
}
