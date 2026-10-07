#pragma once

#include <functional>
#include <string>

// Turns the Mac audio grabber's permission-denied flag into a host error
// entry (Aurora-h457, ErrorOverlay.md decision 14). The flag is a 10-second
// timer in MacAudioGrabber, not an event, so the tick thread polls it and
// this publishes only on edges: false->true sets the "audio_permission"
// entry, true->false removes it. An entry the user dismissed therefore stays
// gone while the flag stays true, and returns on the next denial.
//
// Callbacks rather than a PipelineHost so the edge logic tests without one.
// `publish` returns false when the host would not hold the entry (not
// running); the edge is then retried on the next poll.
namespace Aurora::App
{

class AudioPermissionPublisher
{
public:
  static constexpr const char* kSource = "audio_permission";
  static constexpr const char* kMessage = "Aurora doesn't seem to be capturing real audio";

  using Denied = std::function<bool()>;
  using Publish = std::function<bool(const std::string& source, const std::string& message)>;
  using Remove = std::function<void(const std::string& source)>;

  AudioPermissionPublisher(Denied denied, Publish publish, Remove remove)
    : m_denied(std::move(denied)), m_publish(std::move(publish)), m_remove(std::move(remove)) {}

  void poll()
  {
    const bool denied = m_denied();
    if(denied == m_published){ return; }
    if(denied){ m_published = m_publish(kSource, kMessage); }
    else{ m_remove(kSource); m_published = false; }
  }

private:
  Denied m_denied;
  Publish m_publish;
  Remove m_remove;
  bool m_published{false};
};

} // namespace Aurora::App
