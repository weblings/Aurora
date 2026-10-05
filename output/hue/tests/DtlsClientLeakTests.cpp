#include <catch2/catch_test_macros.hpp>

#include <atomic>
#include <cstdlib>
#include <new>

#include <Aurora/Output/Hue/DtlsClient.hpp>

using namespace Aurora::Output::Hue;

// Counts live operator-new blocks for the whole test executable so the leak
// shows up without a sanitizer: mbedtls' own allocations go through
// calloc/free and are not counted, only the structs MbedTlsImpl new's.
namespace
{
  std::atomic<long> g_liveBlocks{0};
}

void* operator new(std::size_t size)
{
  void* ptr = std::malloc(size ? size : 1);
  if(!ptr){
    throw std::bad_alloc();
  }

  g_liveBlocks.fetch_add(1, std::memory_order_relaxed);
  return ptr;
}

void operator delete(void* ptr) noexcept
{
  if(ptr){
    g_liveBlocks.fetch_sub(1, std::memory_order_relaxed);
    std::free(ptr);
  }
}

void operator delete(void* ptr, std::size_t) noexcept
{
  operator delete(ptr);
}


namespace
{
  // An odd number of hex digits makes clientkeyBytes() throw inside
  // _initSSL, after _initMembers and _initRNG allocated their six structs and
  // _initConnection opened the UDP socket -- no handshake, so no network wait.
  DtlsClient makeFailingClient()
  {
    return DtlsClient(DtlsConfig{
      .credentials = Credentials("user", "abc"),
      .address = "127.0.0.1",
      .port = "9",
      .hostname = "Hue",
      .handshakeAttempts = 1
    });
  }

  void failOneInit()
  {
    DtlsClient client = makeFailingClient();
    CHECK_THROWS_AS(client.init(), std::runtime_error);
    CHECK_FALSE(client.isConnected());
  }
}


TEST_CASE("DtlsClient frees every mbedtls struct when init throws", "[DtlsClient]")
{
  // Warm up so one-time allocations (locale, iostream, mbedtls statics)
  // don't count against the loop.
  failOneInit();

  const long before = g_liveBlocks.load(std::memory_order_relaxed);
  for(int i = 0; i < 20; i++){
    failOneInit();
  }

  CHECK(g_liveBlocks.load(std::memory_order_relaxed) == before);
}
