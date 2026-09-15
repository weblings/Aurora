#include <Aurora/Processing/ImageProcessing.hpp>

#include <opencv2/opencv.hpp>

// getSubImage/getDominantColor/Algorithms::mean are hand-ported to JS in
// ../../../web-processing/processing.js -- see ../../../CLAUDE.md before
// changing the crop/mean math here, the JS mirror likely needs the same change.


namespace Aurora::Processing
{
  namespace ImageProcessing
  {
    void rescale(
      const Contracts::ImageData& inputImageData,
      Contracts::ImageData& outputImageData,
      int outputWidth,
      Contracts::Interpolation::Type interpolation
    )
    {
      int sourceHeight = inputImageData.height();
      int sourceWidth = inputImageData.width();

      if(sourceWidth < outputWidth){
        return;
      }

      float scaleRatio = static_cast<float>(outputWidth) / static_cast<float>(sourceWidth);

      int targetHeight = static_cast<int>(static_cast<float>(sourceHeight) * scaleRatio);

      cv::InterpolationFlags interpolationFlag = cv::InterpolationFlags::INTER_AREA;

      switch(interpolation){
        case Contracts::Interpolation::Type::Nearest:
          interpolationFlag = cv::InterpolationFlags::INTER_NEAREST;
          break;

        case Contracts::Interpolation::Type::Cubic:
          interpolationFlag = cv::InterpolationFlags::INTER_CUBIC;
          break;

        case Contracts::Interpolation::Type::Area:
          interpolationFlag = cv::InterpolationFlags::INTER_AREA;
          break;
      }

      cv::resize(inputImageData.imageMatrix, outputImageData.imageMatrix, cv::Size(outputWidth, targetHeight), 0, 0, interpolationFlag);
      outputImageData.format = inputImageData.format;
    }


    void dropAlpha(
      const Contracts::ImageData& inputImageData,
      Contracts::ImageData& outputImageData
    )
    {
      // Fix (see Analysis/ProcessingAnalysis.md finding 2): the original
      // rgbaToRgb() only ever converted RGBA, unconditionally via
      // cv::COLOR_RGBA2RGB. A BGRA source (DXGI Desktop Duplication, many
      // Linux compositors) needs cv::COLOR_BGRA2BGR instead, or this
      // silently mis-orders channels the same way finding 1 did.
      switch(inputImageData.format){
        case Contracts::PixelFormat::RGBA:
          cv::cvtColor(inputImageData.imageMatrix, outputImageData.imageMatrix, cv::COLOR_RGBA2RGB);
          outputImageData.format = Contracts::PixelFormat::RGB;
          break;

        case Contracts::PixelFormat::BGRA:
          cv::cvtColor(inputImageData.imageMatrix, outputImageData.imageMatrix, cv::COLOR_BGRA2BGR);
          outputImageData.format = Contracts::PixelFormat::BGR;
          break;

        case Contracts::PixelFormat::RGB:
        case Contracts::PixelFormat::BGR:
          // Already opaque -- nothing to drop. Pass through so callers can
          // call this unconditionally without checking for alpha first.
          outputImageData = inputImageData;
          break;
      }
    }


    void getSubImage(
      const Contracts::ImageData& inputImageData,
      Contracts::ImageData& outputImageData,
      const Contracts::UVs& uvs
    )
    {
      float width = static_cast<float>(inputImageData.width());
      float height = static_cast<float>(inputImageData.height());
      glm::ivec2 a{static_cast<int>(uvs.min.x * width), static_cast<int>(uvs.min.y * height)};
      glm::ivec2 b{static_cast<int>(uvs.max.x * width), static_cast<int>(uvs.max.y * height)};

      cv::Range cols(std::max(0, a.x), std::min(b.x, inputImageData.width()));
      cv::Range rows(std::max(0, a.y), std::min(b.y, inputImageData.height()));

      outputImageData.imageMatrix = inputImageData.imageMatrix(rows, cols).clone();
      outputImageData.format = inputImageData.format;
    }


    Contracts::Color getDominantColor(
      const Contracts::ImageData& inputImageData
    )
    {
      if(inputImageData.width() < 1 || inputImageData.height() < 1){
        return Contracts::Color(0, 0, 0);
      }

      return Algorithms::mean(inputImageData);
    }


    namespace Algorithms
    {
      Contracts::Color mean(
        const Contracts::ImageData& imageData
      )
      {
        auto meanScalar = cv::mean(imageData.imageMatrix);

        // Fix (see Analysis/ProcessingAnalysis.md finding 1): cv::mean()
        // returns channel averages in the cv::Mat's storage order, which
        // says nothing about whether that order is RGB or BGR. The
        // original code always assumed BGR (channel 0 = B, channel 2 = R).
        // Every grabber in huenicorn happened to tag BGR, so this never
        // fired -- but it's a real bug once a source can be RGB/RGBA
        // (confirmed on this read, not just theoretical).
        switch(imageData.format){
          case Contracts::PixelFormat::RGB:
          case Contracts::PixelFormat::RGBA:
            return Contracts::Color{
              static_cast<uint8_t>(meanScalar[0]),
              static_cast<uint8_t>(meanScalar[1]),
              static_cast<uint8_t>(meanScalar[2])
            };

          case Contracts::PixelFormat::BGR:
          case Contracts::PixelFormat::BGRA:
            return Contracts::Color{
              static_cast<uint8_t>(meanScalar[2]),
              static_cast<uint8_t>(meanScalar[1]),
              static_cast<uint8_t>(meanScalar[0])
            };
        }

        // Unreachable while PixelFormat only has these four values; keeps
        // -Wreturn-type quiet without a bogus default case masking a future
        // missing-enumerator warning.
        return Contracts::Color(0, 0, 0);
      }
    }
  }
}
