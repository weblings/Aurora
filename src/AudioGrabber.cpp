#include <Aurora/Input/Windows/AudioGrabber.hpp>

#include <mutex>
#include <stdexcept>
#include <vector>

// Exactly one translation unit in the whole dependency tree may define
// this before including miniaudio.h -- it compiles the entire
// implementation into this .cpp's object file. Verified against the real
// header/docs before writing this (ma_device_type_loopback, the
// ma_device_config fields, the data callback signature) rather than
// assumed -- same discipline as the aubio pass.
#define MINIAUDIO_IMPLEMENTATION
#include <miniaudio.h>

namespace Aurora::Input::Windows
{
  struct AudioGrabber::Impl
  {
    ma_device device{};
    std::mutex mutex;
    std::vector<float> accumulated;
    unsigned sampleRate = 0;
    unsigned channelCount = 0;
    bool running = false;

    static void dataCallback(ma_device* pDevice, void* /*pOutput*/, const void* pInput, ma_uint32 frameCount)
    {
      auto* self = static_cast<Impl*>(pDevice->pUserData);
      const float* samples = static_cast<const float*>(pInput);
      size_t sampleCount = static_cast<size_t>(frameCount) * self->channelCount;

      std::lock_guard<std::mutex> lock(self->mutex);
      self->accumulated.insert(self->accumulated.end(), samples, samples + sampleCount);
    }
  };


  AudioGrabber::AudioGrabber():
  m_impl(std::make_unique<Impl>())
  {
    ma_device_config config = ma_device_config_init(ma_device_type_loopback);
    config.capture.pDeviceID = nullptr; // default playback device's loopback
    config.capture.format = ma_format_f32;
    config.capture.channels = 2;
    config.sampleRate = 0; // native rate -- AudioFeatureExtractor adapts to whatever this ends up being
    config.dataCallback = &Impl::dataCallback;
    config.pUserData = m_impl.get();

    if(ma_device_init(nullptr, &config, &m_impl->device) != MA_SUCCESS){
      throw std::runtime_error("AudioGrabber: ma_device_init failed (loopback capture unavailable)");
    }

    // miniaudio negotiates the actual rate/channel count during init --
    // read back what it settled on rather than trust the request above.
    m_impl->sampleRate = m_impl->device.sampleRate;
    m_impl->channelCount = m_impl->device.capture.channels;

    if(ma_device_start(&m_impl->device) != MA_SUCCESS){
      ma_device_uninit(&m_impl->device);
      throw std::runtime_error("AudioGrabber: ma_device_start failed");
    }

    m_impl->running = true;
  }


  AudioGrabber::~AudioGrabber()
  {
    if(m_impl && m_impl->running){
      ma_device_uninit(&m_impl->device);
    }
  }


  const std::string& AudioGrabber::name() const
  {
    static const std::string s_name = "AudioGrabber";
    return s_name;
  }


  void AudioGrabber::readNextBuffer(Contracts::AudioBuffer& buffer)
  {
    std::lock_guard<std::mutex> lock(m_impl->mutex);

    buffer.sampleRate = m_impl->sampleRate;
    buffer.channelCount = m_impl->channelCount;
    buffer.samples = std::move(m_impl->accumulated);
    m_impl->accumulated.clear();
  }
}
