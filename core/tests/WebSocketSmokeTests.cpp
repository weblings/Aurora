#include <atomic>
#include <chrono>
#include <string>
#include <thread>

#include <catch2/catch_test_macros.hpp>
#include <httplib.h>

using namespace std::chrono_literals;

// Aurora-d9v: proves httplib::ws::WebSocketClient (>= 0.46, the HA prep
// floor) compiles, links and round-trips over plain ws:// on every platform.
// The echo server is httplib's own ws server on an ephemeral loopback port,
// so there is no external process or fixed port. wss:// needs httplib TLS and
// is out of scope.
TEST_CASE("httplib WebSocketClient echoes text, binary and large messages over ws://", "[websocket][smoke]")
{
  httplib::Server server;
  server.WebSocket("/echo", [](const httplib::Request&, httplib::ws::WebSocket& ws){
    std::string msg;
    httplib::ws::ReadResult result;
    while((result = ws.read(msg)) != httplib::ws::Fail){
      if(result == httplib::ws::Text){
        ws.send(msg);
      }
      else{
        ws.send(msg.data(), msg.size());
      }
    }
  });

  const int port = server.bind_to_any_port("127.0.0.1");
  REQUIRE(port > 0);
  std::thread serverThread([&server]{ server.listen_after_bind(); });
  server.wait_until_ready();

  {
    httplib::ws::WebSocketClient client("ws://127.0.0.1:" + std::to_string(port) + "/echo");
    client.set_read_timeout(5);
    REQUIRE(client.is_valid());
    REQUIRE(client.connect());

    std::string reply;

    REQUIRE(client.send(std::string("hello")));
    REQUIRE(client.read(reply) == httplib::ws::Text);
    CHECK(reply == "hello");

    const std::string binary("\x00\x01\xff\x7f", 4);
    REQUIRE(client.send(binary.data(), binary.size()));
    REQUIRE(client.read(reply) == httplib::ws::Binary);
    CHECK(reply == binary);

    // HA's get_states-style replies can be large; exercises multi-read framing.
    const std::string large(256 * 1024, 'x');
    REQUIRE(client.send(large));
    REQUIRE(client.read(reply) == httplib::ws::Text);
    CHECK(reply == large);

    client.close();
    CHECK_FALSE(client.is_open());
  }

  server.stop();
  serverThread.join();
}
