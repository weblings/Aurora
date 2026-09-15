#include <catch2/catch_test_macros.hpp>
#include <catch2/catch_approx.hpp>

#include <Aurora/Processing/ImageProcessing.hpp>

// Some golden values here are duplicated in ../../web-processing/processing.test.mjs
// -- see ../../CLAUDE.md before changing expected values in this file.

using namespace Aurora::Contracts;
using namespace Aurora::Processing;


namespace
{
  // Builds a solid-color image with the Mat's actual byte layout matching
  // `format`, so getDominantColor() has to get the format-aware unswizzling
  // right to recover (r, g, b) -- this is the fixture for finding 1's
  // regression test.
  ImageData makeSolidColor(int width, int height, PixelFormat format, uint8_t r, uint8_t g, uint8_t b, uint8_t a = 255)
  {
    ImageData imageData;
    imageData.format = format;

    switch(format){
      case PixelFormat::RGB:
        imageData.imageMatrix = cv::Mat(height, width, CV_8UC3, cv::Scalar(r, g, b));
        break;
      case PixelFormat::BGR:
        imageData.imageMatrix = cv::Mat(height, width, CV_8UC3, cv::Scalar(b, g, r));
        break;
      case PixelFormat::RGBA:
        imageData.imageMatrix = cv::Mat(height, width, CV_8UC4, cv::Scalar(r, g, b, a));
        break;
      case PixelFormat::BGRA:
        imageData.imageMatrix = cv::Mat(height, width, CV_8UC4, cv::Scalar(b, g, r, a));
        break;
    }

    return imageData;
  }
}


TEST_CASE("getDominantColor recovers (r, g, b) regardless of PixelFormat", "[Processing][regression]")
{
  // Finding 1 (Analysis/ProcessingAnalysis.md): the original always assumed
  // BGR storage order. This asserts all four tags round-trip correctly, not
  // just the BGR case that happened to always be exercised before.
  const uint8_t r = 200, g = 100, b = 50;

  for(auto format : {PixelFormat::RGB, PixelFormat::BGR, PixelFormat::RGBA, PixelFormat::BGRA}){
    ImageData image = makeSolidColor(4, 4, format, r, g, b);
    Color dominant = ImageProcessing::getDominantColor(image);

    CHECK(dominant.m_r == r);
    CHECK(dominant.m_g == g);
    CHECK(dominant.m_b == b);
  }
}


TEST_CASE("getDominantColor on an empty image returns black without touching OpenCV", "[Processing]")
{
  ImageData image;
  image.format = PixelFormat::BGR;
  // imageMatrix left default-constructed -- width()/height() are 0.

  Color dominant = ImageProcessing::getDominantColor(image);
  CHECK(dominant == Color(0, 0, 0));
}


TEST_CASE("dropAlpha converts RGBA and BGRA to their opaque equivalents", "[Processing][regression]")
{
  // Finding 2: the original rgbaToRgb() only handled RGBA. This is the
  // regression test for the BGRA case too.
  SECTION("RGBA -> RGB")
  {
    ImageData input = makeSolidColor(2, 2, PixelFormat::RGBA, 10, 20, 30);
    ImageData output;
    ImageProcessing::dropAlpha(input, output);

    REQUIRE(output.format == PixelFormat::RGB);
    REQUIRE(output.imageMatrix.channels() == 3);
    cv::Vec3b pixel = output.imageMatrix.at<cv::Vec3b>(0, 0);
    CHECK(pixel == cv::Vec3b(10, 20, 30));
  }

  SECTION("BGRA -> BGR")
  {
    ImageData input = makeSolidColor(2, 2, PixelFormat::BGRA, 10, 20, 30);
    ImageData output;
    ImageProcessing::dropAlpha(input, output);

    REQUIRE(output.format == PixelFormat::BGR);
    REQUIRE(output.imageMatrix.channels() == 3);
    cv::Vec3b pixel = output.imageMatrix.at<cv::Vec3b>(0, 0);
    // makeSolidColor stores BGRA as (b, g, r, a) = (30, 20, 10, 255);
    // dropping alpha keeps that same BGR byte order.
    CHECK(pixel == cv::Vec3b(30, 20, 10));
  }

  SECTION("Already-opaque formats pass through unchanged")
  {
    ImageData input = makeSolidColor(2, 2, PixelFormat::BGR, 10, 20, 30);
    ImageData output;
    ImageProcessing::dropAlpha(input, output);

    CHECK(output.format == PixelFormat::BGR);
    CHECK(output.imageMatrix.channels() == 3);
  }
}


TEST_CASE("rescale produces the requested width at the source aspect ratio and propagates format", "[Processing][regression]")
{
  ImageData input = makeSolidColor(100, 50, PixelFormat::RGB, 1, 2, 3);

  for(auto interpolation : {Interpolation::Type::Nearest, Interpolation::Type::Cubic, Interpolation::Type::Area}){
    ImageData output;
    ImageProcessing::rescale(input, output, 20, interpolation);

    REQUIRE(output.hasData());
    CHECK(output.width() == 20);
    CHECK(output.height() == 10); // 50 * (20/100)
    // Finding 3: rescale() never used to set this at all (uninitialized read).
    CHECK(output.format == PixelFormat::RGB);
  }
}


TEST_CASE("rescale refuses to upscale", "[Processing]")
{
  ImageData input = makeSolidColor(100, 50, PixelFormat::RGB, 1, 2, 3);
  ImageData output; // left default -- hasData() is false until rescale writes to it

  ImageProcessing::rescale(input, output, 200, Interpolation::Type::Area);

  CHECK_FALSE(output.hasData());
}


TEST_CASE("getSubImage crops the requested rectangle and propagates format", "[Processing][regression]")
{
  // 4x4 image, four solid 2x2 quadrants.
  ImageData input;
  input.format = PixelFormat::BGR;
  input.imageMatrix = cv::Mat(4, 4, CV_8UC3, cv::Scalar(0, 0, 0));
  input.imageMatrix(cv::Rect(0, 0, 2, 2)).setTo(cv::Scalar(10, 20, 30)); // top-left
  input.imageMatrix(cv::Rect(2, 0, 2, 2)).setTo(cv::Scalar(40, 50, 60)); // top-right

  ImageData topLeft;
  ImageProcessing::getSubImage(input, topLeft, UVs{{0.f, 0.f}, {0.5f, 0.5f}});

  REQUIRE(topLeft.width() == 2);
  REQUIRE(topLeft.height() == 2);
  CHECK(topLeft.imageMatrix.at<cv::Vec3b>(0, 0) == cv::Vec3b(10, 20, 30));
  // Finding 3: getSubImage() never used to set this at all (uninitialized read).
  CHECK(topLeft.format == PixelFormat::BGR);

  ImageData topRight;
  ImageProcessing::getSubImage(input, topRight, UVs{{0.5f, 0.f}, {1.f, 0.5f}});
  CHECK(topRight.imageMatrix.at<cv::Vec3b>(0, 0) == cv::Vec3b(40, 50, 60));
}


TEST_CASE("getSubImage clamps to image bounds", "[Processing]")
{
  ImageData input = makeSolidColor(4, 4, PixelFormat::BGR, 1, 2, 3);

  ImageData cropped;
  // Deliberately out-of-range UVs -- should clamp, not crash or read OOB.
  ImageProcessing::getSubImage(input, cropped, UVs{{-0.5f, -0.5f}, {1.5f, 1.5f}});

  CHECK(cropped.width() == 4);
  CHECK(cropped.height() == 4);
}


TEST_CASE("Color::toNormalized and brightness are exact for known values", "[Processing][Contracts]")
{
  CHECK(Color(255, 0, 0).toNormalized() == glm::vec3(1.f, 0.f, 0.f));
  CHECK(Color(0, 0, 0).toNormalized() == glm::vec3(0.f, 0.f, 0.f));

  CHECK(Color(0, 0, 0).brightness() == Catch::Approx(0.f));
  CHECK(Color(255, 255, 255).brightness() == Catch::Approx(1.f));
  // 0.3*R + 0.59*G + 0.11*B, normalized -- pure red should read dimmer than
  // pure green at the same channel value.
  CHECK(Color(255, 0, 0).brightness() == Catch::Approx(0.3f));
  CHECK(Color(0, 255, 0).brightness() == Catch::Approx(0.59f));
}
