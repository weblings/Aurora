#include <Aurora/Input/Windows/DummyGrabber.hpp>

#include <cmath>


namespace Aurora::Input::Windows
{
  DummyGrabber::DummyGrabber()
  {
    m_startTime = std::chrono::steady_clock::now();
  }


  const std::string& DummyGrabber::name() const
  {
    static const std::string s_identifier = "DummyGrabber";
    return s_identifier;
  }


  IInput::Resolution DummyGrabber::displayResolution() const
  {
    return m_resolution;
  }


  IInput::RefreshRate DummyGrabber::displayRefreshRate() const
  {
    return m_refreshRate;
  }


  void DummyGrabber::grabFrameSubsample(
    Contracts::ImageData& imageData
  )
  {
    double seconds = std::chrono::duration<double>(std::chrono::steady_clock::now() - m_startTime).count();
    double max = 255.0;

    int rCoeff = static_cast<int>(((std::sin(seconds / 2.0) + 1.0) / 2.0) * max);
    int gCoeff = static_cast<int>(((std::sin(seconds / 3.0) + 1.0) / 2.0) * max);
    int bCoeff = static_cast<int>(((std::sin(seconds / 5.0) + 1.0) / 2.0) * max);

    if(m_imageData.imageMatrix.empty()){
      m_imageData.imageMatrix.create(m_resolution.y, m_resolution.x, CV_8UC3);
    }

    m_imageData.imageMatrix.setTo(cv::Scalar(bCoeff, gCoeff, rCoeff));
    m_imageData.format = Contracts::PixelFormat::BGR;

    imageData = m_imageData;
  }
}
