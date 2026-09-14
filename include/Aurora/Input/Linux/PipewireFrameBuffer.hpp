#pragma once

#include <cstddef>
#include <cstdint>

#include <Aurora/Contracts/ImageData.hpp>

// Pure raw-buffer -> ImageData conversion, decoupled from spa_buffer/pw_buffer
// so it's testable without libpipewire installed. See PipewireGrabber's
// _onStreamProcess for the real mmap/pw_buffer plumbing around this.
namespace Aurora::Input::Linux
{
  // Clones a 4-byte-per-pixel buffer into an owned ImageData -- the clone
  // matters, since Pipewire's buffer becomes invalid after it's queued back.
  // stride == 0 means tightly packed (width * 4 bytes/row). format must match
  // what was actually negotiated (RGBA/RGBx -> RGBA, BGRx -> BGRA) --
  // hardcoding RGBA regardless of negotiation mistags whichever of those the
  // compositor actually picked, same class of bug X11Grabber had.
  inline Contracts::ImageData toOwnedImage(
    const uint8_t* data, int width, int height, size_t stride,
    Contracts::PixelFormat format = Contracts::PixelFormat::RGBA
  )
  {
    if(data == nullptr || width <= 0 || height <= 0){
      return {};
    }

    size_t rowStride = stride > 0 ? stride : static_cast<size_t>(width) * 4;
    cv::Mat view(height, width, CV_8UC4, const_cast<uint8_t*>(data), rowStride);

    return Contracts::ImageData{
      .imageMatrix = view.clone(),
      .format = format
    };
  }
}
