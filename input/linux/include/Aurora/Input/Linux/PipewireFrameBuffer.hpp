#pragma once

#include <algorithm>
#include <cstddef>
#include <cstdint>

#include <Aurora/Contracts/ImageData.hpp>

// Pure raw-buffer -> ImageData conversion, decoupled from spa_buffer/pw_buffer
// so it's testable without libpipewire installed. See PipewireGrabber's
// _onStreamProcess for the real mmap/pw_buffer plumbing around this.
namespace Aurora::Input::Linux
{
  // Integer factor to shrink captured frames by for a consumer hint: the
  // largest k that keeps the result at least 8x the sampled width and 256 px
  // (the Mac/Windows rule), so the CPU's INTER_AREA still averages the last
  // step. Integer because OpenCV's INTER_AREA is ~10x slower at fractional
  // ratios (1920->512 took ~29 ms, 1920->640 ~3 ms). 1 = keep full size.
  inline int captureDecimation(unsigned hint, int sourceWidth)
  {
    if(hint == 0 || sourceWidth <= 0){
      return 1;
    }
    const int floorWidth = static_cast<int>((std::max)(hint * 8u, 256u));
    return (std::max)(1, sourceWidth / floorWidth);
  }


  // Clones a 4-byte-per-pixel buffer into an owned ImageData -- the clone
  // matters, since Pipewire's buffer becomes invalid after it's queued back.
  // stride == 0 means tightly packed (width * 4 bytes/row). format must match
  // what was actually negotiated (RGBA/RGBx -> RGBA, BGRx -> BGRA) --
  // hardcoding RGBA regardless of negotiation mistags whichever of those the
  // compositor actually picked, same class of bug X11Grabber had.
  // decimation > 1 area-averages straight from the buffer by that integer
  // factor instead of cloning full size (a < decimation px edge remainder is
  // cropped so INTER_AREA stays on its exact-ratio fast path).
  inline Contracts::ImageData toOwnedImage(
    const uint8_t* data, int width, int height, size_t stride,
    Contracts::PixelFormat format = Contracts::PixelFormat::RGBA,
    int decimation = 1
  )
  {
    if(data == nullptr || width <= 0 || height <= 0){
      return {};
    }

    size_t rowStride = stride > 0 ? stride : static_cast<size_t>(width) * 4;
    cv::Mat view(height, width, CV_8UC4, const_cast<uint8_t*>(data), rowStride);

    if(decimation > 1 && width >= decimation && height >= decimation){
      const cv::Rect exact(0, 0, width / decimation * decimation, height / decimation * decimation);
      cv::Mat scaled;
      cv::resize(
        view(exact), scaled, cv::Size(exact.width / decimation, exact.height / decimation),
        0, 0, cv::INTER_AREA
      );
      return Contracts::ImageData{.imageMatrix = std::move(scaled), .format = format};
    }

    return Contracts::ImageData{
      .imageMatrix = view.clone(),
      .format = format
    };
  }
}
