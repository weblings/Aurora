// Drives huenicorn's XdgDesktopPortal the way PipewireGrabber does: portal
// thread + wait on fdReadyPromise, then _stop()'s portal teardown.
// Exit code: 0 settled true, 1 settled false, 2 unsettled after the timeout.

#include <Huenicorn/Grabber/GnuLinux/Pipewire/XdgDesktopPortal.hpp>

#include <chrono>
#include <cstdlib>
#include <iostream>
#include <thread>

#include <unistd.h>

using Huenicorn::Grabber::XdgDesktopPortal;


// Copy of PipewireGrabber::_initCapture (kept in sync by hand)
static void initCapture(XdgDesktopPortal::Capture* capture)
{
  XdgDesktopPortal::screencastPortalDesktopCaptureCreate(capture, XdgDesktopPortal::CaptureType::Monitor, true);

  GMainLoop* gmain = g_main_loop_new(NULL, FALSE);

  while(capture->updateXdgContext){
    g_main_context_iteration(g_main_loop_get_context(gmain), false);
  }

  g_main_loop_unref(gmain);
}


int main(int argc, char** argv)
{
  int timeoutSeconds = argc > 1 ? std::atoi(argv[1]) : 5;

  Huenicorn::Core::Config config;
  XdgDesktopPortal::Capture capture;
  capture.config = &config;

  // PipewireGrabber's constructor waits without a bound; bound it so a hang is reportable
  std::promise<bool> fdReadyPromise;
  auto fdReadyFuture = fdReadyPromise.get_future();
  capture.fdReadyPromise = std::move(fdReadyPromise);
  std::thread xdgThread(initCapture, &capture);

  int code = 2;
  if(fdReadyFuture.wait_for(std::chrono::seconds(timeoutSeconds)) == std::future_status::ready){
    code = fdReadyFuture.get() ? 0 : 1;
  }

  // PipewireGrabber::_stop()'s portal half
  capture.updateXdgContext = false;
  XdgDesktopPortal::screencastPortalCaptureDestroy(&capture);
  xdgThread.join();

  if(code == 0){
    close(static_cast<int>(capture.pwFd));
  }

  const char* names[] = {"settled true", "settled false", "unsettled"};
  std::cout << "RESULT: " << names[code];
  if(code == 2){
    std::cout << " after " << timeoutSeconds << "s";
  }
  std::cout << std::endl;
  return code;
}
