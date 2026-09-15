// Hand-ported from Aurora/core/Processing/src/ImageProcessing.cpp
// (getSubImage/getDominantColor/Algorithms::mean) and
// Aurora/core/Runtime/src/FrameCompositor.cpp (composeFrame). See
// ../Analysis/BrowserAnalysis.md's reuse-vs-reimplement finding for why this
// is hand-ported rather than compiled to WASM. Cross-reference: any change to
// either C++ file should be checked against this file too -- see ../CLAUDE.md.
//
// Browser canvas ImageData is always RGBA already, so there's no
// PixelFormat/dropAlpha equivalent needed here -- alpha is simply ignored.

// Mirrors getSubImage's pixel-rect math: truncate UV*dimension, then clamp
// to the image bounds (handles out-of-range UVs the same way).
export function subImageRect(width, height, uvs) {
  const ax = Math.trunc(uvs.min[0] * width);
  const ay = Math.trunc(uvs.min[1] * height);
  const bx = Math.trunc(uvs.max[0] * width);
  const by = Math.trunc(uvs.max[1] * height);
  return {
    x0: Math.max(0, ax),
    y0: Math.max(0, ay),
    x1: Math.min(bx, width),
    y1: Math.min(by, height),
  };
}

// Mirrors Algorithms::mean -- averages, then truncates (not rounds) to match
// C++'s static_cast<uint8_t>. imageData is a canvas ImageData-shaped object
// ({data: Uint8ClampedArray RGBA, width, height}).
export function meanColor(imageData, rect) {
  let rSum = 0, gSum = 0, bSum = 0, count = 0;
  for (let y = rect.y0; y < rect.y1; y++) {
    for (let x = rect.x0; x < rect.x1; x++) {
      const i = (y * imageData.width + x) * 4;
      rSum += imageData.data[i];
      gSum += imageData.data[i + 1];
      bSum += imageData.data[i + 2];
      count++;
    }
  }
  if (count === 0) return { r: 0, g: 0, b: 0 };
  return {
    r: Math.trunc(rSum / count),
    g: Math.trunc(gSum / count),
    b: Math.trunc(bSum / count),
  };
}

// Mirrors getDominantColor: empty input is black, otherwise crop then mean.
export function getDominantColor(imageData, uvs) {
  if (imageData.width < 1 || imageData.height < 1) return { r: 0, g: 0, b: 0 };
  return meanColor(imageData, subImageRect(imageData.width, imageData.height, uvs));
}

// Mirrors Runtime::composeFrame: one dominant color per active zone, inactive
// zones omitted entirely.
export function composeFrame(imageData, zoneMap) {
  const frame = [];
  for (const zone of zoneMap) {
    if (!zone.active) continue;
    frame.push({ zoneId: zone.zoneId, color: getDominantColor(imageData, zone.uvs), gamma: zone.gamma });
  }
  return frame;
}
