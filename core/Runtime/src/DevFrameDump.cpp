#include <Aurora/Runtime/DevFrameDump.hpp>

#include <cstdlib>

#include <nlohmann/json.hpp>

#ifndef _WIN32
#include <arpa/inet.h>
#include <fcntl.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>
#endif

namespace Aurora::Runtime
{
  namespace
  {
    constexpr const char* DefaultHost = "127.0.0.1";

    // Single-UDP-datagram safety cap on the RAW (pre-base64) byte count --
    // base64 inflates by 4/3, and this leaves headroom under IPv4's 65507
    // theoretical max for the JSON wrapper around it. Loopback traffic
    // doesn't hit real Ethernet MTU fragmentation, so one datagram is fine
    // for this localhost-only dev tool; chunking/reassembly isn't worth
    // building for it. Comfortably above any sane subsample width in
    // practice (SubsampleDefaults picks ~1% of display width by default).
    constexpr size_t MaxRawFrameBytes = 44000;

    const char* pixelFormatName(Contracts::PixelFormat format)
    {
      switch(format){
        case Contracts::PixelFormat::RGB: return "RGB";
        case Contracts::PixelFormat::RGBA: return "RGBA";
        case Contracts::PixelFormat::BGR: return "BGR";
        case Contracts::PixelFormat::BGRA: return "BGRA";
      }
      return "BGR"; // unreachable for a valid enum value; a safe default beats UB
    }

    int pixelFormatChannels(Contracts::PixelFormat format)
    {
      switch(format){
        case Contracts::PixelFormat::RGB:
        case Contracts::PixelFormat::BGR:
          return 3;
        case Contracts::PixelFormat::RGBA:
        case Contracts::PixelFormat::BGRA:
          return 4;
      }
      return 3;
    }

    // Standard base64 (RFC 4648), no line wrapping -- this is a JSON string
    // value, not a MIME body.
    std::string base64Encode(const unsigned char* data, size_t len)
    {
      static const char table[] =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

      std::string out;
      out.reserve(((len + 2) / 3) * 4);

      size_t i = 0;
      for(; i + 3 <= len; i += 3){
        uint32_t chunk = (uint32_t(data[i]) << 16) | (uint32_t(data[i + 1]) << 8) | uint32_t(data[i + 2]);
        out.push_back(table[(chunk >> 18) & 0x3F]);
        out.push_back(table[(chunk >> 12) & 0x3F]);
        out.push_back(table[(chunk >> 6) & 0x3F]);
        out.push_back(table[chunk & 0x3F]);
      }

      size_t remaining = len - i;
      if(remaining == 1){
        uint32_t chunk = uint32_t(data[i]) << 16;
        out.push_back(table[(chunk >> 18) & 0x3F]);
        out.push_back(table[(chunk >> 12) & 0x3F]);
        out.push_back('=');
        out.push_back('=');
      }
      else if(remaining == 2){
        uint32_t chunk = (uint32_t(data[i]) << 16) | (uint32_t(data[i + 1]) << 8);
        out.push_back(table[(chunk >> 18) & 0x3F]);
        out.push_back(table[(chunk >> 12) & 0x3F]);
        out.push_back(table[(chunk >> 6) & 0x3F]);
        out.push_back('=');
      }

      return out;
    }
  }


  DevFrameDumpAddress parseDevFrameDumpAddress(const std::string& envValue)
  {
    if(envValue.empty()){
      return {DefaultHost, DefaultDevFrameDumpPort};
    }

    auto colonPos = envValue.rfind(':');
    if(colonPos == std::string::npos){
      return {envValue, DefaultDevFrameDumpPort};
    }

    std::string host = envValue.substr(0, colonPos);
    std::string portStr = envValue.substr(colonPos + 1);

    if(host.empty()){
      host = DefaultHost;
    }

    uint16_t port = DefaultDevFrameDumpPort;
    if(!portStr.empty()){
      try{
        port = static_cast<uint16_t>(std::stoi(portStr));
      }
      catch(const std::exception&){
        port = DefaultDevFrameDumpPort;
      }
    }

    return {host, port};
  }


  std::string buildDevFrameDumpPayload(const Contracts::ImageData& image)
  {
    if(!image.hasData()){
      return "";
    }

    const cv::Mat& mat = image.imageMatrix;
    const cv::Mat continuous = mat.isContinuous() ? mat : mat.clone();

    int channels = pixelFormatChannels(image.format);
    size_t byteCount = static_cast<size_t>(continuous.total()) * static_cast<size_t>(channels);

    nlohmann::json payload = {
      {"width", image.width()},
      {"height", image.height()},
      {"format", pixelFormatName(image.format)},
      {"data", base64Encode(continuous.data, byteCount)}
    };

    return payload.dump();
  }


#ifndef _WIN32

  DevFrameDump::DevFrameDump()
  {
    // Presence-only flag, same convention as AURORA_DEV_LIGHT_TAP -- its
    // own value is never parsed as an address.
    if(!std::getenv("AURORA_DEV_FRAME_DUMP")){
      return;
    }

    const char* addressEnv = std::getenv("AURORA_DEV_FRAME_DUMP_ADDRESS");
    DevFrameDumpAddress address = parseDevFrameDumpAddress(addressEnv ? addressEnv : "");

    m_socketFd = ::socket(AF_INET, SOCK_DGRAM, 0);
    if(m_socketFd < 0){
      return;
    }

    int flags = ::fcntl(m_socketFd, F_GETFL, 0);
    ::fcntl(m_socketFd, F_SETFL, flags | O_NONBLOCK);

    sockaddr_in destAddr{};
    destAddr.sin_family = AF_INET;
    destAddr.sin_port = htons(address.port);
    if(::inet_pton(AF_INET, address.host.c_str(), &destAddr.sin_addr) != 1){
      ::close(m_socketFd);
      m_socketFd = -1;
      return;
    }

    if(::connect(m_socketFd, reinterpret_cast<sockaddr*>(&destAddr), sizeof(destAddr)) < 0){
      ::close(m_socketFd);
      m_socketFd = -1;
      return;
    }

    m_enabled = true;
  }


  DevFrameDump::~DevFrameDump()
  {
    if(m_socketFd >= 0){
      ::close(m_socketFd);
    }
  }


  void DevFrameDump::publish(const Contracts::ImageData& image) const
  {
    if(!m_enabled || !image.hasData()){
      return;
    }

    size_t rawBytes = static_cast<size_t>(image.width()) * static_cast<size_t>(image.height())
      * static_cast<size_t>(pixelFormatChannels(image.format));
    if(rawBytes > MaxRawFrameBytes){
      return; // see MaxRawFrameBytes -- dropped, not fragmented
    }

    std::string payload = buildDevFrameDumpPayload(image);
    if(payload.empty()){
      return;
    }

    ::send(m_socketFd, payload.data(), payload.size(), 0);
  }

#else

  // Windows: not yet implemented, same reasoning as DevLightTap's Windows
  // stub -- Linux/Mac are this tool's actual near-term targets.
  DevFrameDump::DevFrameDump() {}
  DevFrameDump::~DevFrameDump() {}
  void DevFrameDump::publish(const Contracts::ImageData&) const {}

#endif
}
