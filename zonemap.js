// Mirrors Aurora core's ZoneMapStore JSON shape (see Aurora/core/Runtime/src/ZoneMapStore.cpp)
// so this file could later be swapped for a real exported/imported profile with no reshaping.
// uvs use image-space convention: v=0 is the top of the video frame, v=1 the bottom.
export const zoneMap = [
  { zoneId: 0, uvs: { min: [0, 0], max: [1 / 3, 1 / 3] }, active: true, gamma: 0 }, // top-left
  { zoneId: 1, uvs: { min: [1 / 3, 0], max: [2 / 3, 1 / 3] }, active: true, gamma: 0 }, // top-mid
  { zoneId: 2, uvs: { min: [2 / 3, 0], max: [1, 1 / 3] }, active: true, gamma: 0 }, // top-right
  { zoneId: 3, uvs: { min: [0, 1 / 3], max: [1 / 3, 2 / 3] }, active: true, gamma: 0 }, // mid-left
  { zoneId: 4, uvs: { min: [2 / 3, 1 / 3], max: [1, 2 / 3] }, active: true, gamma: 0 }, // mid-right
  { zoneId: 5, uvs: { min: [0, 2 / 3], max: [1 / 3, 1] }, active: true, gamma: 0 }, // bottom-left
  { zoneId: 6, uvs: { min: [1 / 3, 2 / 3], max: [2 / 3, 1] }, active: true, gamma: 0 }, // bottom-mid
  { zoneId: 7, uvs: { min: [2 / 3, 2 / 3], max: [1, 1] }, active: true, gamma: 0 }, // bottom-right
  // Center slice (1/3,1/3)-(2/3,2/3) is intentionally not a zone — discarded per the nine-slice design.
];
