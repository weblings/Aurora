// Auto-arrange: assigns each active zone a non-overlapping screen region
// instead of leaving every zone at the full-screen default. 1-9 zones use
// hand-designed layouts (not derivable from a formula -- e.g. 9 is a clean
// 3x3 grid, not what the >=10 algorithm below would produce); 10+ uses one
// consistent generative rule. Source: "Screen Division Coordinates" sheet,
// 0-60 coordinate space, (0,0) top-left -- kept in that same 0-60 shape here
// (matching the sheet exactly, for auditability) and only converted to 0-1
// UVs at the very end.
const SCALE = 60;

// zoneId -> [x0, y0, x1, y1], all in the sheet's own 0-60 space.
const HARDCODED_LAYOUTS = {
  1: [
    [0, 0, 60, 60],
  ],
  2: [
    [0, 0, 30, 60],
    [30, 0, 60, 60],
  ],
  3: [
    [0, 0, 20, 60],
    [20, 0, 40, 60],
    [40, 0, 60, 60],
  ],
  4: [
    [0, 0, 30, 30],
    [30, 0, 60, 30],
    [0, 30, 30, 60],
    [30, 30, 60, 60],
  ],
  5: [
    [0, 0, 20, 30],
    [20, 0, 40, 30],
    [40, 0, 60, 30],
    [0, 30, 30, 60],
    [30, 30, 60, 60],
  ],
  6: [
    [0, 0, 20, 30],
    [20, 0, 40, 30],
    [40, 0, 60, 30],
    [0, 30, 20, 60],
    [20, 30, 40, 60],
    [40, 30, 60, 60],
  ],
  7: [
    [0, 0, 15, 30],
    [15, 0, 30, 30],
    [30, 0, 45, 30],
    [45, 0, 60, 30],
    [0, 30, 20, 60],
    [20, 30, 40, 60],
    [40, 30, 60, 60],
  ],
  8: [
    [0, 0, 15, 30],
    [15, 0, 30, 30],
    [30, 0, 45, 30],
    [45, 0, 60, 30],
    [0, 30, 15, 60],
    [15, 30, 30, 60],
    [30, 30, 45, 60],
    [45, 30, 60, 60],
  ],
  9: [
    [0, 0, 20, 20],
    [20, 0, 40, 20],
    [40, 0, 60, 20],
    [0, 20, 20, 40],
    [20, 20, 40, 40],
    [40, 20, 60, 40],
    [0, 40, 20, 60],
    [20, 40, 40, 60],
    [40, 40, 60, 60],
  ],
};

// Row-major grid, max 4 columns per row. The remainder-of-1 case is special-
// cased to avoid a single lone zone spanning a whole row on its own (e.g. 13
// zones is 4/4/3/2, not the naive 4/4/4/1) -- confirmed against every
// provided 10-17 example, and generalizes to any N > 17 the same way.
function _rowCounts(count) {
  const fullRows = Math.floor(count / 4);
  const remainder = count % 4;

  if (remainder === 0) return Array(fullRows).fill(4);
  if (remainder === 1) return [...Array(fullRows - 1).fill(4), 3, 2];
  return [...Array(fullRows).fill(4), remainder];
}

function _generatedLayout(count) {
  const counts = _rowCounts(count);
  const rowHeight = SCALE / counts.length;

  const rects = [];
  counts.forEach((colCount, rowIndex) => {
    const y0 = rowIndex * rowHeight;
    const y1 = (rowIndex + 1) * rowHeight;
    const colWidth = SCALE / colCount;
    for (let col = 0; col < colCount; col++) {
      rects.push([col * colWidth, y0, (col + 1) * colWidth, y1]);
    }
  });

  return rects;
}

// Returns `count` rects (in 0-1 UV space, {min: [x,y], max: [x,y]}), one per
// active zone, in the same order the zones are assigned (index 0 first).
// Returns [] for count <= 0.
export function screenDivisionRects(count) {
  if (count <= 0) return [];

  const rects60 = HARDCODED_LAYOUTS[count] ?? _generatedLayout(count);

  return rects60.map(([x0, y0, x1, y1]) => ({
    min: [x0 / SCALE, y0 / SCALE],
    max: [x1 / SCALE, y1 / SCALE],
  }));
}
