#include <catch2/catch_test_macros.hpp>

#include <nlohmann/json.hpp>

#include <Aurora/Runtime/DevFrameDump.hpp>

using namespace Aurora::Runtime;


namespace
{
  // Test-only decoder -- round-trips buildDevFrameDumpPayload's base64
  // encoding without exposing the library's internal encoder just for this.
  std::vector<uint8_t> base64Decode(const std::string& in)
  {
    auto value = [](char c) -> int {
      if(c >= 'A' && c <= 'Z') return c - 'A';
      if(c >= 'a' && c <= 'z') return c - 'a' + 26;
      if(c >= '0' && c <= '9') return c - '0' + 52;
      if(c == '+') return 62;
      if(c == '/') return 63;
      return -1;
    };

    std::vector<uint8_t> out;
    int buffer = 0;
    int bits = 0;
    for(char c : in){
      if(c == '='){
        break;
      }
      int v = value(c);
      if(v < 0){
        continue;
      }
      buffer = (buffer << 6) | v;
      bits += 6;
      if(bits >= 8){
        bits -= 8;
        out.push_back(static_cast<uint8_t>((buffer >> bits) & 0xFF));
      }
    }
    return out;
  }


  Aurora::Contracts::ImageData makeImage(int width, int height, Aurora::Contracts::PixelFormat format, int channels)
  {
    Aurora::Contracts::ImageData image;
    image.imageMatrix = cv::Mat(height, width, CV_8UC(channels));
    image.format = format;

    uint8_t* data = image.imageMatrix.data;
    for(int i = 0; i < width * height * channels; i++){
      data[i] = static_cast<uint8_t>(i % 256);
    }

    return image;
  }
}


TEST_CASE("parseDevFrameDumpAddress defaults to 127.0.0.1:18247 on an empty value", "[DevFrameDump]")
{
  DevFrameDumpAddress address = parseDevFrameDumpAddress("");

  CHECK(address.host == "127.0.0.1");
  CHECK(address.port == DefaultDevFrameDumpPort);
}


TEST_CASE("parseDevFrameDumpAddress overrides both host and port when both are given", "[DevFrameDump]")
{
  DevFrameDumpAddress address = parseDevFrameDumpAddress("192.168.1.5:9001");

  CHECK(address.host == "192.168.1.5");
  CHECK(address.port == 9001);
}


TEST_CASE("buildDevFrameDumpPayload round-trips a small BGR image exactly", "[DevFrameDump]")
{
  auto image = makeImage(3, 2, Aurora::Contracts::PixelFormat::BGR, 3);

  std::string payload = buildDevFrameDumpPayload(image);
  nlohmann::json parsed = nlohmann::json::parse(payload);

  CHECK(parsed.at("width").get<int>() == 3);
  CHECK(parsed.at("height").get<int>() == 2);
  CHECK(parsed.at("format").get<std::string>() == "BGR");

  std::vector<uint8_t> decoded = base64Decode(parsed.at("data").get<std::string>());
  REQUIRE(decoded.size() == 3u * 2u * 3u);
  for(size_t i = 0; i < decoded.size(); i++){
    CHECK(decoded[i] == static_cast<uint8_t>(i % 256));
  }
}


TEST_CASE("buildDevFrameDumpPayload reports BGRA/4 channels correctly", "[DevFrameDump]")
{
  auto image = makeImage(2, 2, Aurora::Contracts::PixelFormat::BGRA, 4);

  nlohmann::json parsed = nlohmann::json::parse(buildDevFrameDumpPayload(image));

  CHECK(parsed.at("format").get<std::string>() == "BGRA");
  std::vector<uint8_t> decoded = base64Decode(parsed.at("data").get<std::string>());
  CHECK(decoded.size() == 2u * 2u * 4u);
}


TEST_CASE("buildDevFrameDumpPayload returns empty for an image with no data", "[DevFrameDump]")
{
  Aurora::Contracts::ImageData image;

  CHECK(buildDevFrameDumpPayload(image).empty());
}
