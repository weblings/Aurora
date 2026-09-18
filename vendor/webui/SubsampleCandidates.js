// Client-side port of Aurora core's IVideoInput::subsampleResolutionCandidates()
// (Aurora/core/Input/include/Aurora/Input/IVideoInput.hpp) -- every common
// divisor of the display's width and height, largest-to-smallest, matching
// the backend's own "clean" (exact-integer-ratio) resample targets exactly.
// A pure function of width/height, which /api/monitors already returns per
// monitor -- no new backend route needed to surface this to the WebUI.
function _divisors(n) {
  const result = [];
  for (let i = 1; i <= n / 2; i++) {
    if (n % i === 0) result.push(i);
  }
  result.push(n);
  return result;
}

// Same 1% default as SubsampleDefaults.hpp's pickDefaultSubsampleWidth --
// trims only the degenerately tiny tail (a handful of px on most
// resolutions), not a separate, independently-chosen cutoff.
const MIN_PERCENT_OF_FULL_WIDTH = 1;

// Returns { width, height } candidates, largest first, for the given
// display resolution. Empty for a missing/zero resolution.
export function subsampleCandidates(width, height) {
  if (!width || !height) return [];

  const widthDivisors = new Set(_divisors(width));
  const commonDivisors = _divisors(height).filter((d) => widthDivisors.has(d));
  const minWidth = width * (MIN_PERCENT_OF_FULL_WIDTH / 100);

  return commonDivisors
    .map((d) => ({ width: width / d, height: height / d }))
    .filter((c) => c.width >= minWidth)
    .sort((a, b) => b.width - a.width);
}
