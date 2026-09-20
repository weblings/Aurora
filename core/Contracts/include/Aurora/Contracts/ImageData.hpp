#pragma once

#include <opencv2/opencv.hpp>

// Ported from huenicorn's Huenicorn::Imaging::ImageData/PixelFormat
// (include/Huenicorn/Imaging/ImageData.hpp) verbatim -- this is a Contract
// type: the frame shape Input produces and Processing consumes, with no
// transform logic of its own. See docs/ProcessingAnalysis.md.
namespace Aurora::Contracts
{
  enum class PixelFormat {
    RGB,
    RGBA,
    BGR,
    BGRA
  };


  struct ImageData
  {
    cv::Mat imageMatrix;
    PixelFormat format;

    inline int width() const
    {
      return imageMatrix.cols;
    }

    inline int height() const
    {
      return imageMatrix.rows;
    }

    inline bool hasData() const
    {
      return imageMatrix.data != nullptr && width() > 0 && height() > 0;
    }
  };
}
