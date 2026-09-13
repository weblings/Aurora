#pragma once

#include <vector>

#include <Aurora/Contracts/ImageData.hpp>
#include <Aurora/Contracts/Interpolation.hpp>
#include <Aurora/Contracts/Color.hpp>
#include <Aurora/Contracts/UV.hpp>

// Ported from huenicorn's Huenicorn::Imaging::ImageProcessing
// (include/Huenicorn/Imaging/ImageProcessing.hpp / src/Imaging/ImageProcessing.cpp)
// with two fixes made during the port -- see Analysis/ProcessingAnalysis.md
// findings 1 and 2:
//   1. getDominantColor()/Algorithms::mean() now honors PixelFormat instead
//      of hardcoding BGR-order channel indices.
//   2. rgbaToRgb() is generalized to dropAlpha(), handling BGRA as well as
//      RGBA (DXGI Desktop Duplication and many Linux compositors produce
//      BGRA natively -- relevant from phase 2 onward).
namespace Aurora::Processing
{
  using Colors = std::vector<Contracts::Color>;

  /**
   * @brief Provides image manipulation functions
   *
   */
  namespace ImageProcessing
  {
    /**
     * @brief Outputs a resampled bitmap of an input bitmap
     *
     * @param inputImageData Input bitmap
     * @param outputImageData Output bitmap
     * @param outputWidth Target width of the output bitmap
     * @param interpolationType Subsampling interpolation type
     */
    void rescale(
      const Contracts::ImageData& inputImageData,
      Contracts::ImageData& outputImageData,
      int outputWidth,
      Contracts::Interpolation::Type interpolationType
    );


    /**
     * @brief Drops the alpha channel from a 4-channel image, honoring
     * whether the source is laid out RGBA or BGRA. A no-op copy if the
     * source has no alpha channel already -- safe to call unconditionally.
     *
     * @param inputImageData Input bitmap
     * @param outputImageData Output bitmap, tagged PixelFormat::RGB or
     * PixelFormat::BGR to match if a conversion happened
     */
    void dropAlpha(
      const Contracts::ImageData& inputImageData,
      Contracts::ImageData& outputImageData
    );


    /**
     * @brief Outputs a rectangular portion of the source Image
     *
     * @param sourceImageData Input image
     * @param destImageData Output image
     * @param uvs Normalized crop rectangle
     */
    void getSubImage(
      const Contracts::ImageData& sourceImageData,
      Contracts::ImageData& destImageData,
      const Contracts::UVs& uvs
    );


    /**
     * @brief Get the Dominant Color
     *
     * @param imageData Input image
     * @return Contracts::Color Dominant color
     */
    Contracts::Color getDominantColor(
      const Contracts::ImageData& imageData
    );


    namespace Algorithms
    {
      Contracts::Color mean(
        const Contracts::ImageData& imageData
      );
    }
  };
}
