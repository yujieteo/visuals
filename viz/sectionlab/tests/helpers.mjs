import { createRequire } from "node:module";
import fs from "node:fs";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
export const ROOT = new URL("..", import.meta.url).pathname;
export const L = require("../src/engine.js");
export const FIXTURES = JSON.parse(fs.readFileSync(new URL("../reference/fixtures.json", import.meta.url), "utf8"));
export const REFERENCE = JSON.parse(fs.readFileSync(new URL("../reference/reference.json", import.meta.url), "utf8"));
export const ACCURACY = JSON.parse(fs.readFileSync(new URL("../reference/torsion-accuracy.json", import.meta.url), "utf8"));
export const RAW = JSON.parse(fs.readFileSync(new URL("../raw.json", import.meta.url), "utf8"));

/* Dimension of each property, in powers of length, for choosing a comparison scale. */
export const DIM = { A: 2, cx: 1, cy: 1, Ix: 4, Iy: 4, Ixy: 4, I1: 4, I2: 4, Ip: 4, Sx_top: 3, Sx_bottom: 3, Sy_right: 3, Sy_left: 3, rx: 1, ry: 1, rp: 1, Qx: 3, Qy: 3, thetaDeg: 0 };

/* |a − b| ≤ tol · scale, where scale is the larger magnitude or the section's own size in that dimension. */
export function near(a, b, tol, { area = 1, dim = 0, msg = "" } = {}) {
  const floor = dim ? Math.sqrt(Math.abs(area)) ** dim : 1;
  const scale = Math.max(Math.abs(a), Math.abs(b), floor);
  assert.ok(Math.abs(a - b) <= tol * scale, `${msg}: ${a} vs ${b} (relative ${(Math.abs(a - b) / scale).toExponential(2)}, tolerance ${tol})`);
}

export const clone = (x) => JSON.parse(JSON.stringify(x));
export const compute = (model, opts = {}) => L.compute(model, { accuracy: ACCURACY, ...opts });
