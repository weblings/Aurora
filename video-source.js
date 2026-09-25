// Video source (gj0.5 slice 3): file/test-pattern frames -> per-zone colors.
// One implementation of the color-provider contract (see main.js): sampleFrame
// takes (zones, mode) and returns [{zoneId, color:{r,g,b} 0..1}] or null when
// the video has no data yet. The 'live' SSE provider (gj0.6) will be a third.
import * as THREE from 'three';
import { composeFrame } from './processing.js';
import { Smoother } from './smoother.js';

export const video = document.createElement('video');
video.src = 'assets/168273-838673780.webm';
video.muted = true;
video.loop = true;
video.playsInline = true;
video.autoplay = true;
video.style.display = 'none';
document.body.appendChild(video);

export const videoTexture = new THREE.VideoTexture(video);
videoTexture.colorSpace = THREE.SRGBColorSpace;

// Per-frame color-sampling resolution, not the video's playback resolution.
let sampleWidthPx = 160; // live-applied from sampleWidth via setSampleWidth below
export function setSampleWidth(px) {
  sampleWidthPx = px;
}

// Native default is 0, so a default config un-smooths this (parity, not regression -- see tuning-ledger.md).
let smoothingFactor = 0.85; // live-applied from transitionSmoothing via setSmoothing below
export function setSmoothing(f) {
  smoothingFactor = f;
}

// Deterministic source modes for verifying the per-zone data pipeline and the light rig's
// own behavior independent of real video content.
// 'rainbow' checks per-zone color identification; 'white' isolates the light rig's own
// falloff/brightness symmetry, since every zone samples the exact same input color.
export const testPatterns = {}; // mode -> { imageData, texture }, built once below

// Same 3x3 layout as zonemap.js -- lets a pattern assign a value per grid cell directly.
const ZONE_ID_BY_ROW_COL = { '0,0': 0, '0,1': 1, '0,2': 2, '1,0': 3, '1,2': 4, '2,0': 5, '2,1': 6, '2,2': 7 };

function buildPatternCanvas(fillStyleForCell) {
  const height = Math.round(sampleWidthPx * 9 / 16);
  const canvas = document.createElement('canvas');
  canvas.width = sampleWidthPx;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const cellW = sampleWidthPx / 3;
  const cellH = height / 3;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      ctx.fillStyle = fillStyleForCell(row, col);
      ctx.fillRect(col * cellW, row * cellH, cellW, cellH);
    }
  }
  const imageData = ctx.getImageData(0, 0, sampleWidthPx, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { imageData, texture };
}

// Each zone gets its own evenly-spaced rainbow hue (by zoneId) -- every one of the 8 lights
// is individually identifiable, not just by column; the unused center cell reads as neutral.
testPatterns.rainbow = buildPatternCanvas((row, col) => {
  const zoneId = ZONE_ID_BY_ROW_COL[`${row},${col}`];
  return zoneId === undefined ? '#202020' : `hsl(${zoneId * 45}, 100%, 50%)`;
});
testPatterns.white = buildPatternCanvas(() => '#ffffff');

// Placeholder until the real jpg loads (near-instant locally, but 'audio' could already be the
// active mode at this point via browser dropdown-restoration). Replaced via loadImagePattern
// by the page boot; see main.js.
testPatterns.audio = buildPatternCanvas(() => '#000000');

// The texture uses the image at its own full resolution (like videoTexture does) -- only the
// zone-averaging imageData needs the small sampleWidthPx canvas real video also downscales to.
export function loadImagePattern(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const sampleCanvas = document.createElement('canvas');
      sampleCanvas.width = sampleWidthPx;
      sampleCanvas.height = Math.round(sampleWidthPx * (img.height / img.width));
      const sampleCtx = sampleCanvas.getContext('2d');
      sampleCtx.drawImage(img, 0, 0, sampleCanvas.width, sampleCanvas.height);
      const imageData = sampleCtx.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height);

      const texture = new THREE.Texture(img);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true; // THREE.Texture doesn't auto-upload on construction
      resolve({ imageData, texture });
    };
    img.onerror = reject;
    img.src = url;
  });
}

// The plane's own UV unwrap runs 90° off ours (floor showed on the left, not the bottom).
// +Math.PI/2 rotated the wrong way on-screen (left->top); this is the confirmed opposite.
const TV_SCREEN_ROTATION = -Math.PI / 2;

// A separate clone per source, not the flat plane's own texture -- glTF UVs assume V=0 at the
// top (flipY=false), while the flat plane's own PlaneGeometry assumes the opposite (flipY=true).
const tvScreenTextures = {}; // mode -> cloned texture, cached so repeated mode switches don't re-clone
export function getTvScreenTexture(mode) {
  if (!tvScreenTextures[mode]) {
    const source = mode === 'video' ? videoTexture : testPatterns[mode].texture;
    const clone = source.clone();
    clone.flipY = false; // unverified -- flip back to true if the room shows the video upside down
    clone.center.set(0.5, 0.5);
    clone.rotation = TV_SCREEN_ROTATION;
    clone.needsUpdate = true;
    tvScreenTextures[mode] = clone;
  }
  return tvScreenTextures[mode];
}

// Drop a cached TV-screen clone (the audio placeholder's clone still points at the
// placeholder after the real jpg lands) so the next getTvScreenTexture re-clones.
export function invalidateScreenTexture(mode) {
  delete tvScreenTextures[mode];
}

// Real per-frame processing, replacing the scaffold's fake color driver.
const sampleCanvas = document.createElement('canvas');
const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });
const smoother = new Smoother();

function sampleVideoFrame(mode) {
  if (mode !== 'video') return testPatterns[mode].imageData;
  if (video.readyState < video.HAVE_CURRENT_DATA || video.videoWidth === 0) return null;

  const sampleHeight = Math.round(sampleWidthPx * (video.videoHeight / video.videoWidth));
  if (sampleCanvas.width !== sampleWidthPx || sampleCanvas.height !== sampleHeight) {
    sampleCanvas.width = sampleWidthPx;
    sampleCanvas.height = sampleHeight;
  }
  // drawImage's own scaling stands in for the native pipeline's separate rescale() step.
  sampleCtx.drawImage(video, 0, 0, sampleWidthPx, sampleHeight);
  return sampleCtx.getImageData(0, 0, sampleWidthPx, sampleHeight);
}

export function sampleFrame(zones, mode) {
  const imageData = sampleVideoFrame(mode);
  if (!imageData) return null;
  return smoother.smooth(composeFrame(imageData, zones), smoothingFactor)
    .map(({ zoneId, color }) => ({ zoneId, color: { r: color.r / 255, g: color.g / 255, b: color.b / 255 } }));
}
