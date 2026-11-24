#pragma once

#include <algorithm>
#include <cmath>

// Pure one-grab glitch filter for X11Grabber (Aurora-1juz), decoupled from
// <X11/...> and OpenCV so it is testable on its own, like X11GrabGate.
//
// Why: on GNOME with the screen magnifier on, the XRender halving chain now and
// then returns the magnifier's zoomed view of the bare wallpaper instead of the
// composited screen -- exactly one grab, with a normal grab on each side. Held
// as a real frame, it flashes the lights pink for ~50 ms.
//
// How: a grab whose mean color jumps far from the last published frame is held
// back (the previous frame is re-served). If the next grab agrees with the held
// one, the jump was real (a cut, a scene change) and is published, one grab
// late. If the next grab goes back near the last published frame, the held one
// was a glitch and is dropped. A run of holds is capped so strobing content or
// an unlucky run cannot freeze the lights.
namespace Aurora::Input::Linux
{
  enum class GrabVerdict
  {
    Publish,
    Hold
  };

  class X11GrabGlitchFilter
  {
  public:
    // jump: biggest per-channel change of the frame mean (0-255) accepted
    // straight away. agree: how close two held-then-new grabs must be to count
    // as the same new scene. maxHolds: most consecutive grabs held back.
    explicit X11GrabGlitchFilter(float jump = 20.0F, float agree = 8.0F, int maxHolds = 2):
    m_jump(jump),
    m_agree(agree),
    m_maxHolds(maxHolds)
    {}

    // channels are the mean of the new grab in any fixed channel order.
    GrabVerdict judge(float c0, float c1, float c2)
    {
      const Mean now{c0, c1, c2};

      if(!m_hasGood){
        return _publish(now);
      }
      if(_distance(now, m_good) <= m_jump){
        return _publish(now);
      }
      // Far from the last published frame: a real change only if the grab
      // before it (also held) said the same thing, or the hold budget is spent.
      if((m_holds > 0 && _distance(now, m_pending) <= m_agree) || m_holds >= m_maxHolds){
        return _publish(now);
      }

      m_pending = now;
      ++m_holds;
      return GrabVerdict::Hold;
    }

    // The cached frame is no longer valid (monitor switch): trust the next grab.
    void reset()
    {
      m_hasGood = false;
      m_holds = 0;
    }

  private:
    struct Mean
    {
      float c[3];
    };

    static float _distance(const Mean& a, const Mean& b)
    {
      return (std::max)({std::fabs(a.c[0] - b.c[0]), std::fabs(a.c[1] - b.c[1]), std::fabs(a.c[2] - b.c[2])});
    }

    GrabVerdict _publish(const Mean& now)
    {
      m_good = now;
      m_hasGood = true;
      m_holds = 0;
      return GrabVerdict::Publish;
    }

    float m_jump;
    float m_agree;
    int m_maxHolds;
    bool m_hasGood{false};
    int m_holds{0};
    Mean m_good{};
    Mean m_pending{};
  };
}
