// Hand-ported from Aurora/core/Runtime/src/Smoother.cpp -- RGB-space lerp
// per zone. Operates directly in 0-255 space rather than normalizing to
// [0,1] first; linear interpolation is scale-invariant, so this is
// equivalent to the native normalize/mix/denormalize round trip. See
// ../CLAUDE.md: keep in sync with the C++ source.
export class Smoother {
  constructor() {
    this._previousColors = new Map();
  }

  // smoothing in [0, 1): 0 reproduces instant (unsmoothed) behavior exactly.
  // A zone's first-ever tick is never smoothed -- there's no previous color.
  smooth(frame, smoothing) {
    return frame.map((zone) => {
      const previous = this._previousColors.get(zone.zoneId);
      let color = zone.color;
      if (smoothing > 0 && previous) {
        const t = 1 - smoothing;
        color = {
          r: previous.r + (zone.color.r - previous.r) * t,
          g: previous.g + (zone.color.g - previous.g) * t,
          b: previous.b + (zone.color.b - previous.b) * t,
        };
      }
      this._previousColors.set(zone.zoneId, color);
      return { zoneId: zone.zoneId, color, gamma: zone.gamma };
    });
  }
}
