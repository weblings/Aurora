// Runs huenicorn's real ImageProcessing and IGrabber::_divisors on synthetic
// frames (capture-pipeline findings 1-4). Exit code: 0 all pass, 1 any fail.
// RUNTIME_DROPS_BGRA (set by capture.sh from Runtime.cpp) mirrors Runtime's alpha-drop condition.

#include <Huenicorn/Grabber/IGrabber.hpp>
#include <Huenicorn/Imaging/ImageProcessing.hpp>

#include <iostream>
#include <string>

using namespace Huenicorn::Imaging;

static int failures = 0;

static void check(const std::string& name, bool ok, const std::string& detail = "")
{
  std::cout << (ok ? "PASS " : "FAIL ") << name << (detail.empty() ? "" : " (" + detail + ")") << std::endl;
  failures += ok ? 0 : 1;
}


static const char* formatName(PixelFormat format)
{
  switch(format){
    case PixelFormat::RGB: return "RGB";
    case PixelFormat::RGBA: return "RGBA";
    case PixelFormat::BGR: return "BGR";
    case PixelFormat::BGRA: return "BGRA";
  }
  return "?";
}


static std::string colorName(const Color& color)
{
  auto rgb = color.toNormalized() * Color::Max;
  return std::to_string(static_cast<int>(rgb.r)) + "," + std::to_string(static_cast<int>(rgb.g)) + "," + std::to_string(static_cast<int>(rgb.b));
}


// Solid red 8x4 frame laid out as `format` says, so the tag is the truth
static ImageData redFrame(PixelFormat format)
{
  bool alpha = format == PixelFormat::RGBA || format == PixelFormat::BGRA;
  bool bgr = format == PixelFormat::BGR || format == PixelFormat::BGRA;
  cv::Scalar red = bgr ? cv::Scalar(0, 0, 255, 255) : cv::Scalar(255, 0, 0, 255);
  return ImageData{cv::Mat(4, 8, alpha ? CV_8UC4 : CV_8UC3, red), format};
}


// Any tag other than `format`, so an output that keeps a stale tag is caught
static PixelFormat otherFormat(PixelFormat format)
{
  return format == PixelFormat::RGB ? PixelFormat::BGRA : PixelFormat::RGB;
}


// Exposes the protected static helpers without instantiating a grabber
struct GrabberProbe : Huenicorn::Grabber::IGrabber
{
  using IGrabber::_divisors;
};


int main()
{
  const PixelFormat formats[] = {PixelFormat::RGB, PixelFormat::RGBA, PixelFormat::BGR, PixelFormat::BGRA};
  const Color red(255, 0, 0);
  const UVs wholeFrame{{0.f, 0.f}, {1.f, 1.f}};

  std::cout << "-- 1: rescale/getSubImage keep the format tag (fix/propagate-pixel-format)" << std::endl;
  for(auto format : formats){
    ImageData out{cv::Mat(), otherFormat(format)};
    ImageProcessing::rescale(redFrame(format), out, 4, Interpolation::Type::Area);
    check(std::string("rescale ") + formatName(format), out.format == format, std::string("got ") + formatName(out.format));

    out.format = otherFormat(format);
    ImageProcessing::getSubImage(redFrame(format), out, wholeFrame);
    check(std::string("getSubImage ") + formatName(format), out.format == format, std::string("got ") + formatName(out.format));
  }

  std::cout << "-- 2: mean() honors the channel order (fix/mean-channel-order)" << std::endl;
  for(auto format : formats){
    Color mean = ImageProcessing::Algorithms::mean(redFrame(format));
    check(std::string("mean of red ") + formatName(format), mean == red, "got " + colorName(mean));
  }

  std::cout << "-- 3: alpha drop keeps the order and covers BGRA (fix/bgra-alpha-drop)" << std::endl;
  for(auto format : {PixelFormat::RGBA, PixelFormat::BGRA}){
    ImageData out{cv::Mat(), format};
    ImageProcessing::rgbaToRgb(redFrame(format), out);
    PixelFormat expected = format == PixelFormat::BGRA ? PixelFormat::BGR : PixelFormat::RGB;
    check(std::string("rgbaToRgb tags ") + formatName(format) + " output", out.format == expected, std::string("got ") + formatName(out.format));
  }

  // Runtime's per-frame path: rescale, alpha drop, per-channel crop, mean
  for(auto format : formats){
    ImageData source = redFrame(format);
    ImageData resized;
    ImageProcessing::rescale(source, resized, 4, Interpolation::Type::Area);
    if(resized.hasData()){
      source = std::move(resized);
    }
    if(source.format == PixelFormat::RGBA || (RUNTIME_DROPS_BGRA && source.format == PixelFormat::BGRA)){
      ImageProcessing::rgbaToRgb(source, source);
    }
    ImageData crop;
    ImageProcessing::getSubImage(source, crop, wholeFrame);
    Color mean = ImageProcessing::Algorithms::mean(crop);
    check(std::string("Runtime path, red ") + formatName(format) + " frame", mean == red && crop.imageMatrix.channels() == 3,
      "got " + colorName(mean) + ", " + std::to_string(crop.imageMatrix.channels()) + " channels");
  }

  std::cout << "-- 4: _divisors includes number / 2 (fix/divisors-half)" << std::endl;
  check("_divisors(6) == {1,2,3,6}", GrabberProbe::_divisors(6) == std::vector<int>{1, 2, 3, 6});
  check("_divisors(12) == {1,2,3,4,6,12}", GrabberProbe::_divisors(12) == std::vector<int>{1, 2, 3, 4, 6, 12});

  std::cout << "RESULT: " << (failures == 0 ? "all pass" : std::to_string(failures) + " failed") << std::endl;
  return failures == 0 ? 0 : 1;
}
