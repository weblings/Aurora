// Parity tests: golden values copied from Aurora/core/tests/ProcessingTests.cpp
// so this file and that one need updating together -- see ../CLAUDE.md. No
// test framework dependency (matches this directory's no-build-step, no-npm
// approach) -- run with `node processing.test.mjs` (.mjs so Node treats it as
// an ES module without needing a package.json).
import assert from 'node:assert/strict';
import { subImageRect, meanColor, getDominantColor, composeFrame } from './processing.js';
import { Smoother } from './smoother.js';

function solidRgbaImage(width, height, quadrants) {
  // quadrants: {topLeft, topRight, bottomLeft, bottomRight}, each [r,g,b] or undefined (black).
  const data = new Uint8ClampedArray(width * height * 4).fill(0);
  const halfW = width / 2, halfH = height / 2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const key = (x < halfW ? 'topLeft' : 'topRight');
      const rowKey = (y < halfH ? key : key.replace('top', 'bottom'));
      const [r, g, b] = quadrants[rowKey] ?? [0, 0, 0];
      const i = (y * width + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

// Mirrors "getSubImage crops the requested rectangle and propagates format".
{
  const image = solidRgbaImage(4, 4, { topLeft: [10, 20, 30], topRight: [40, 50, 60] });

  const topLeft = getDominantColor(image, { min: [0, 0], max: [0.5, 0.5] });
  assert.deepEqual(topLeft, { r: 10, g: 20, b: 30 });

  const topRight = getDominantColor(image, { min: [0.5, 0], max: [1, 0.5] });
  assert.deepEqual(topRight, { r: 40, g: 50, b: 60 });
}

// Mirrors "getSubImage clamps to image bounds".
{
  const rect = subImageRect(4, 4, { min: [-0.5, -0.5], max: [1.5, 1.5] });
  assert.deepEqual(rect, { x0: 0, y0: 0, x1: 4, y1: 4 });
}

// Mirrors "getDominantColor on an empty image returns black without touching OpenCV".
{
  const color = getDominantColor({ data: new Uint8ClampedArray(0), width: 0, height: 0 }, { min: [0, 0], max: [1, 1] });
  assert.deepEqual(color, { r: 0, g: 0, b: 0 });
}

// composeFrame: inactive zones omitted, active zones get {zoneId, color, gamma}.
{
  const image = solidRgbaImage(4, 4, { topLeft: [10, 20, 30], topRight: [40, 50, 60] });
  const zoneMap = [
    { zoneId: 0, uvs: { min: [0, 0], max: [0.5, 0.5] }, active: true, gamma: 0.1 },
    { zoneId: 1, uvs: { min: [0.5, 0], max: [1, 0.5] }, active: false, gamma: 0 },
  ];
  const frame = composeFrame(image, zoneMap);
  assert.deepEqual(frame, [{ zoneId: 0, color: { r: 10, g: 20, b: 30 }, gamma: 0.1 }]);
}

// Smoother: mirrors Smoother::smooth's mix(previous, current, 1 - smoothing).
{
  const smoother = new Smoother();
  const zoneId = 0;
  const gamma = 0;

  const first = smoother.smooth([{ zoneId, color: { r: 100, g: 100, b: 100 }, gamma }], 0.5);
  assert.deepEqual(first, [{ zoneId, color: { r: 100, g: 100, b: 100 }, gamma }]); // no previous -> unsmoothed

  const second = smoother.smooth([{ zoneId, color: { r: 200, g: 200, b: 200 }, gamma }], 0.5);
  assert.deepEqual(second, [{ zoneId, color: { r: 150, g: 150, b: 150 }, gamma }]); // 100 + (200-100)*0.5
}

console.log('web-processing parity tests passed');
