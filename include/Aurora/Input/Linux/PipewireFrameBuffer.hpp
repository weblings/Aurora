#pragma once

#include <cstddef>
#include <cstdint>

#include <Aurora/Contracts/ImageData.hpp>

// Pure raw-buffer -> ImageData conversion, decoupled from spa_buffer/pw_buffer
// so it's testable without libpipewire installed. See PipewireGrabber's
// _onStreamProcess for the real mmap/pw_buffer plumbing around this.
namespace Aurora::Input::Linux
{
  // Clones an RGBA buffer into an owned ImageData -- the clone matters, since
  // Pipewire's buffer becomes invalid after it's queued back. stride == 0
  // means tightly packed (width * 4 bytes/row).
  inline Contracts::ImageData toOwnedRgbaImage(const uint8_t* data, int width, int height, size_t stride)
  {
    if(data == nullptr || width <= 0 || height <= 0){
      return {};
    }

    size_t rowStride = stride > 0 ? stride : static_cast<size_t>(width) * 4;
    cv::Mat view(height, width, CV_8UC4, const_cast<uint8_t*>(data), rowStride);

    return Contracts::ImageData{
      .imageMatrix = view.clone(),
      .format = Contracts::PixelFormat::RGBA
    };
  }
}
