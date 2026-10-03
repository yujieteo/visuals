/* Pattern generators (spec section 7): rectangular array, staggered rows,
 * bolt circle and mirror. Generators return plain (x, y) points; the caller
 * assigns ids so ids stay unique within the pattern.
 */

import { round12 } from "./units.mjs";

const pt = (x, y) => ({ x: round12(x) || 0, y: round12(y) || 0 });

function count(value, label, min = 1) {
  if (!Number.isInteger(value) || value < min) throw new Error(`${label} must be a whole number ≥ ${min}.`);
  return value;
}
function finite(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must be a number.`);
  return value;
}

/* nx × ny grid at pitch (sx, sy), centred on (cx, cy). */
export function rectangularArray({ nx, ny, sx, sy, cx = 0, cy = 0 }) {
  count(nx, "Columns"); count(ny, "Rows"); finite(sx, "Column pitch"); finite(sy, "Row pitch"); finite(cx, "Centre x"); finite(cy, "Centre y");
  const out = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) out.push(pt(cx + (i - (nx - 1) / 2) * sx, cy + ((ny - 1) / 2 - j) * sy));
  }
  return out;
}

/* `rows` rows of `perRow` fasteners at pitch `sx`, rows `sy` apart, every
 * second row shifted by half a pitch; centred on (cx, cy). */
export function staggeredRows({ rows, perRow, sx, sy, cx = 0, cy = 0 }) {
  count(rows, "Rows"); count(perRow, "Fasteners per row"); finite(sx, "Pitch"); finite(sy, "Gauge"); finite(cx, "Centre x"); finite(cy, "Centre y");
  const out = [];
  for (let j = 0; j < rows; j++) {
    const shift = j % 2 ? sx / 2 : 0;
    const offset = rows > 1 ? sx / 4 : 0; // centre the staggered block
    for (let i = 0; i < perRow; i++) out.push(pt(cx + (i - (perRow - 1) / 2) * sx + shift - offset, cy + ((rows - 1) / 2 - j) * sy));
  }
  return out;
}

/* n fasteners on a circle of radius r about (cx, cy), the first at `startDeg` CCW from +x. */
export function boltCircle({ n, r, cx = 0, cy = 0, startDeg = 0 }) {
  count(n, "Number of fasteners"); finite(r, "Radius"); finite(cx, "Centre x"); finite(cy, "Centre y"); finite(startDeg, "Start angle");
  if (!(r > 0)) throw new Error("Radius must be greater than zero.");
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = (startDeg + (360 * i) / n) * Math.PI / 180;
    out.push(pt(cx + r * Math.cos(t), cy + r * Math.sin(t)));
  }
  return out;
}

/* Mirror images of `points` about the line x = c ("x") or y = c ("y").
 * Images that land on an existing point (within `tol`) are skipped. */
export function mirror(points, { axis, c = 0, existing = points, tol = 1e-9 }) {
  if (axis !== "x" && axis !== "y") throw new Error("Mirror axis must be x or y.");
  finite(c, "Mirror line");
  const images = points.map((p) => (axis === "x" ? pt(2 * c - p.x, p.y) : pt(p.x, 2 * c - p.y)));
  const taken = [...existing];
  const out = [];
  for (const q of images) {
    if (taken.some((e) => Math.hypot(e.x - q.x, e.y - q.y) <= tol)) continue;
    taken.push(q);
    out.push(q);
  }
  return out;
}
