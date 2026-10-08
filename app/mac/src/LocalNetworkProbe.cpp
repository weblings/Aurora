#include <Aurora/App/LocalNetworkProbe.hpp>

#include <cerrno>

namespace Aurora::App
{

LocalNetworkStatus statusFromSend(long sent, int err)
{
  if(sent >= 0){ return LocalNetworkStatus::Granted; }
  if(err == EHOSTUNREACH){ return LocalNetworkStatus::Denied; }
  return LocalNetworkStatus::Unknown;
}

} // namespace Aurora::App
