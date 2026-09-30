import test from "node:test";
import assert from "node:assert/strict";
import { L, near } from "./helpers.mjs";

const { SHAPES, defaults } = L.shapes;

function size(shape, dims) {
  const b = L.geometry.bbox(shape.build(dims, shape.defaultRadii(dims)).contours);
  return [b.x1 - b.x0, b.y1 - b.y0];
}

test("resize scales every shape's built bounding box by exactly the requested factors", () => {
  for (const [id, shape] of Object.entries(SHAPES)) {
    const d = defaults(id);
    const [sx, sy] = shape.locked ? [1.5, 1.5] : [1.5, 0.8];
    const [w0, h0] = size(shape, d);
    const [w1, h1] = size(shape, shape.resize(d, sx, sy));
    near(w1, sx * w0, 1e-9, { msg: `${id} width` });
    near(h1, sy * h0, 1e-9, { msg: `${id} height` });
  }
});

test("locked shapes scale both ways by the same factor whatever factors resize is given", () => {
  const locked = Object.entries(SHAPES).filter(([, s]) => s.locked);
  assert.ok(locked.length > 0);
  for (const [id, shape] of locked) {
    const d = defaults(id);
    const [w0, h0] = size(shape, d);
    const [w1, h1] = size(shape, shape.resize(d, 1.5, 0.8));
    near(w1, 1.5 * w0, 1e-9, { msg: `${id} width` });
    near(h1, 1.5 * h0, 1e-9, { msg: `${id} height` });
  }
});
