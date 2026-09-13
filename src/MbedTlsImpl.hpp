#pragma once

// Mbed TLS PSK-DTLS handshake/socket implementation behind DtlsClient's
// pimpl. Ported from huenicorn's Stream::Impl -- huenicorn's v4 branch isn't
// carried over. Uses only classic API calls stable across 2.x and 3.x;
// verified building against both 2.28.0 (Ubuntu 22.04) and 3.6.5.

#include <memory>
#include <span>
#include <stdexcept>
#include <string>
#include <vector>

#include <mbedtls/ctr_drbg.h>
#include <mbedtls/entropy.h>
#include <mbedtls/net_sockets.h>
#include <mbedtls/ssl.h>
#include <mbedtls/timing.h>

#ifdef MBEDTLS_PLATFORM_C
#include <mbedtls/platform.h>
#endif

#include <Aurora/Output/Hue/DtlsConfig.hpp>

namespace Aurora::Output::Hue
{
  class MbedTlsImpl
  {
  public:
    ~MbedTlsImpl()
    {
      _deallocate();
    }

    void init(const DtlsConfig& dtlsConfig)
    {
      _initMembers();
      _initRNG();
      _initConnection(dtlsConfig);
      _initSSL(dtlsConfig);
      _handshake(dtlsConfig);
    }

    bool isConnected() const { return m_isConnected; }

    int send(std::span<const std::byte> requestBuffer)
    {
      int result = mbedtls_ssl_write(ssl.get(), reinterpret_cast<const unsigned char*>(requestBuffer.data()), requestBuffer.size());
      if(result < 0){
        m_isConnected = false;
      }

      return result;
    }

  private:
    template <auto FreeFunc>
    struct MbedTlsDeleter
    {
      template <typename T>
      void operator()(T* ptr) const noexcept
      {
        if(ptr){
          FreeFunc(ptr);
        }
      }
    };

    template <typename T, auto FreeFunc>
    using MbedTlsUniquePtr = std::unique_ptr<T, MbedTlsDeleter<FreeFunc>>;

    using UniqueNetContext = MbedTlsUniquePtr<mbedtls_net_context, mbedtls_net_free>;
    using UniqueSsl = MbedTlsUniquePtr<mbedtls_ssl_context, mbedtls_ssl_free>;
    using UniqueSslConfig = MbedTlsUniquePtr<mbedtls_ssl_config, mbedtls_ssl_config_free>;
    using UniqueCert = MbedTlsUniquePtr<mbedtls_x509_crt, mbedtls_x509_crt_free>;
    using UniqueEntropy = MbedTlsUniquePtr<mbedtls_entropy_context, mbedtls_entropy_free>;
    using UniqueCtrDrbg = MbedTlsUniquePtr<mbedtls_ctr_drbg_context, mbedtls_ctr_drbg_free>;

    UniqueNetContext serverFd;
    UniqueEntropy entropy;
    UniqueCtrDrbg ctrDrbg;
    UniqueSsl ssl;
    UniqueSslConfig conf;
    UniqueCert cacert;
    mbedtls_timing_delay_context timer{};
    std::vector<int> ciphers;
    bool m_isConnected{false};

    void _initMembers()
    {
      serverFd.reset(new mbedtls_net_context{});
      mbedtls_net_init(serverFd.get());

      ssl.reset(new mbedtls_ssl_context{});
      mbedtls_ssl_init(ssl.get());

      conf.reset(new mbedtls_ssl_config{});
      mbedtls_ssl_config_init(conf.get());

      cacert.reset(new mbedtls_x509_crt{});
      mbedtls_x509_crt_init(cacert.get());

      ctrDrbg.reset(new mbedtls_ctr_drbg_context{});
      mbedtls_ctr_drbg_init(ctrDrbg.get());
    }

    void _initRNG()
    {
      std::string pers = "aurora_dtls_client";
      entropy.reset(new mbedtls_entropy_context{});
      mbedtls_entropy_init(entropy.get());

      int result = mbedtls_ctr_drbg_seed(
        ctrDrbg.get(),
        mbedtls_entropy_func,
        entropy.get(),
        reinterpret_cast<const unsigned char*>(pers.data()),
        pers.length()
      );

      if(result != 0){
        throw std::runtime_error("mbedtls_ctr_drbg_seed returned: " + std::to_string(result));
      }
    }

    void _initConnection(const DtlsConfig& dtlsConfig)
    {
      int result = mbedtls_net_connect(
        serverFd.get(),
        dtlsConfig.address.c_str(),
        dtlsConfig.port.c_str(),
        MBEDTLS_NET_PROTO_UDP
      );

      if(result != 0){
        throw std::runtime_error("mbedtls_net_connect failed with code: " + std::to_string(result));
      }
    }

    void _initSSL(const DtlsConfig& dtlsConfig)
    {
      auto pskRawArray = dtlsConfig.credentials.clientkeyBytes();
      auto pskIdRawArray = dtlsConfig.credentials.usernameBytes();

      int result = mbedtls_ssl_config_defaults(
        conf.get(),
        MBEDTLS_SSL_IS_CLIENT,
        MBEDTLS_SSL_TRANSPORT_DATAGRAM,
        MBEDTLS_SSL_PRESET_DEFAULT
      );

      if(result != 0){
        throw std::runtime_error("mbedtls_ssl_config_defaults failed with code: " + std::to_string(result));
      }

      mbedtls_ssl_conf_authmode(conf.get(), MBEDTLS_SSL_VERIFY_OPTIONAL);
      mbedtls_ssl_conf_ca_chain(conf.get(), cacert.get(), NULL);
      mbedtls_ssl_conf_rng(conf.get(), mbedtls_ctr_drbg_random, ctrDrbg.get());

      result = mbedtls_ssl_setup(ssl.get(), conf.get());
      if(result != 0){
        throw std::runtime_error("mbedtls_ssl_setup failed with code: " + std::to_string(result));
      }

      result = mbedtls_ssl_conf_psk(
        conf.get(),
        reinterpret_cast<const unsigned char*>(pskRawArray.data()),
        pskRawArray.size(),
        reinterpret_cast<const unsigned char*>(pskIdRawArray.data()),
        pskIdRawArray.size()
      );

      if(result != 0){
        throw std::runtime_error("mbedtls_ssl_conf_psk failed with code: " + std::to_string(result));
      }

      ciphers = {MBEDTLS_TLS_PSK_WITH_AES_128_GCM_SHA256, 0};
      mbedtls_ssl_conf_ciphersuites(conf.get(), ciphers.data());

      result = mbedtls_ssl_set_hostname(ssl.get(), dtlsConfig.hostname.c_str());
      if(result != 0){
        throw std::runtime_error("mbedtls_ssl_set_hostname failed with code: " + std::to_string(result));
      }

      mbedtls_ssl_set_bio(ssl.get(), serverFd.get(), mbedtls_net_send, mbedtls_net_recv, mbedtls_net_recv_timeout);
      mbedtls_ssl_set_timer_cb(ssl.get(), &timer, mbedtls_timing_set_delay, mbedtls_timing_get_delay);
    }

    void _handshake(const DtlsConfig& dtlsConfig)
    {
      int result = 0;

      for(unsigned attempt = 0; attempt < dtlsConfig.handshakeAttempts; attempt++){
        mbedtls_ssl_conf_handshake_timeout(conf.get(), 400, 1000);

        do{
          result = mbedtls_ssl_handshake(ssl.get());
        }
        while(result == MBEDTLS_ERR_SSL_WANT_READ || result == MBEDTLS_ERR_SSL_WANT_WRITE);

        if(result == 0){
          break;
        }
      }

      if(result != 0){
        throw std::runtime_error("mbedtls_ssl_handshake failed with code: " + std::to_string(result));
      }

      m_isConnected = true;
    }

    void _deallocate()
    {
      m_isConnected = false;
      serverFd.reset();
      cacert.reset();
      ssl.reset();
      conf.reset();
      ctrDrbg.reset();
      entropy.reset();
    }
  };
}
