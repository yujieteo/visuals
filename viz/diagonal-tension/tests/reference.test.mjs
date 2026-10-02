/* Independent references for the page's solver, written separately from it:
   1. A small dense finite-element solve coded here from scratch (rectangular elements in physical
      coordinates, 3 × 3 Gauss integration, its own load integration, Gaussian elimination with partial
      pivoting) for small skin-stringer-doubler panels, compared with the page's sparse CG solve.
   2. Timoshenko and Goodier's closed-form cantilever under a parabolic end shear, solved by the
      page's general quadrilateral solver on skewed meshes with prescribed nonzero displacements. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const html = readFileSync(new URL("../diagonal-tension.html", import.meta.url), "utf8");
const ctx = {}; ctx.self = ctx; vm.createContext(ctx);
vm.runInContext(/<script id="dt-engine">([\s\S]*?)<\/script>/.exec(html)[1], ctx);
const DT = ctx.DiagonalTension;

/* ---------- the independent dense solver ---------- */
function denseSolve(A, b) {
  const n = b.length, M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]; x[r] = s / M[r][r]; }
  return x;
}
/* A rectangle of half-sides a, b centred at (xc, yc): N_i = (1 + ξ ξ_i)(1 + η η_i)/4 with ξ = (x − xc)/a. */
const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
function rectB(a, b, xi, eta) {
  const B = [new Array(8).fill(0), new Array(8).fill(0), new Array(8).fill(0)];
  CORNERS.forEach(([si, ti], i) => {
    const dx = (si * (1 + eta * ti)) / (4 * a), dy = (ti * (1 + xi * si)) / (4 * b);
    B[0][2 * i] = dx; B[1][2 * i + 1] = dy; B[2][2 * i] = dy; B[2][2 * i + 1] = dx;
  });
  return B;
}
function rectStiffness(a, b, t, E, nu) {
  const c = E / (1 - nu * nu), D = [[c, c * nu, 0], [c * nu, c, 0], [0, 0, (c * (1 - nu)) / 2]];
  const g = [-Math.sqrt(0.6), 0, Math.sqrt(0.6)], w = [5 / 9, 8 / 9, 5 / 9];
  const K = Array.from({ length: 8 }, () => new Array(8).fill(0));
  for (let p = 0; p < 3; p++) for (let q = 0; q < 3; q++) {
    const B = rectB(a, b, g[p], g[q]), wt = w[p] * w[q] * a * b * t;
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
      let s = 0;
      for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) s += B[r][i] * D[r][k] * B[k][j];
      K[i][j] += wt * s;
    }
  }
  return { K, D };
}
/* The whole panel, from the same inputs the page takes. */
function referencePanel(s, withDoubler) {
  const xs = [...DT.meshLines(s).xs], ys = [...DT.meshLines(s).ys], nx = xs.length, ny = ys.length, n = 2 * nx * ny;
  const K = Array.from({ length: n }, () => new Array(n).fill(0)), f = new Array(n).fill(0), { E, nu } = s.material, d = s.doubler;
  const elems = [];
  for (let j = 0; j + 1 < ny; j++) for (let i = 0; i + 1 < nx; i++) {
    const a = (xs[i + 1] - xs[i]) / 2, b = (ys[j + 1] - ys[j]) / 2, xc = xs[i] + a, yc = ys[j] + b;
    const inside = xc > d.x0 && xc < d.x0 + d.Lx && yc > d.y0 && yc < d.y0 + d.Ly;
    const t = s.panel.t + (withDoubler && inside ? d.t : 0), nodes = [j * nx + i, j * nx + i + 1, (j + 1) * nx + i + 1, (j + 1) * nx + i];
    const { K: k, D } = rectStiffness(a, b, t, E, nu);
    for (let p = 0; p < 8; p++) for (let q = 0; q < 8; q++) K[2 * nodes[p >> 1] + (p & 1)][2 * nodes[q >> 1] + (q & 1)] += k[p][q];
    elems.push({ a, b, xc, yc, nodes, D });
  }
  for (const st of s.stringers) {
    const j = ys.indexOf(st.y);
    for (let i = 0; i + 1 < nx; i++) {
      const k = (E * st.A) / (xs[i + 1] - xs[i]), p = 2 * (j * nx + i), q = 2 * (j * nx + i + 1);
      K[p][p] += k; K[q][q] += k; K[p][q] -= k; K[q][p] -= k;
    }
  }
  // Shear flow q on the edges, lumped by the trapezoidal rule (exact for a constant traction).
  const q = s.load.q;
  for (let i = 0; i + 1 < nx; i++) { const h = xs[i + 1] - xs[i]; f[2 * i] -= (q * h) / 2; f[2 * (i + 1)] -= (q * h) / 2; const top = (ny - 1) * nx; f[2 * (top + i)] += (q * h) / 2; f[2 * (top + i + 1)] += (q * h) / 2; }
  for (let j = 0; j + 1 < ny; j++) { const h = ys[j + 1] - ys[j]; f[2 * (j * nx) + 1] -= (q * h) / 2; f[2 * ((j + 1) * nx) + 1] -= (q * h) / 2; f[2 * (j * nx + nx - 1) + 1] += (q * h) / 2; f[2 * ((j + 1) * nx + nx - 1) + 1] += (q * h) / 2; }
  const fixed = new Set([0, 1, 2 * (nx - 1) + 1]), free = [...Array(n).keys()].filter((k) => !fixed.has(k));
  const x = denseSolve(free.map((r) => free.map((c) => K[r][c])), free.map((r) => f[r]));
  const u = new Array(n).fill(0);
  free.forEach((r, i) => { u[r] = x[i]; });
  const g = 1 / Math.sqrt(3), stress = [];
  for (const e of elems) for (const [xi, eta] of [[-g, -g], [g, -g], [g, g], [-g, g]]) {
    const B = rectB(e.a, e.b, xi, eta), ue = e.nodes.flatMap((nd) => [u[2 * nd], u[2 * nd + 1]]);
    const eps = B.map((row) => row.reduce((acc, v, k) => acc + v * ue[k], 0));
    stress.push(e.D.map((row) => row.reduce((acc, v, k) => acc + v * eps[k], 0)), { x: e.xc + xi * e.a, y: e.yc + eta * e.b });
  }
  return { u, stress: stress.filter(Array.isArray), points: stress.filter((p) => !Array.isArray(p)) };
}

const PANELS = [
  ["60 × 40 panel, one stringer, an off-centre doubler", { panel: { L: 60, W: 40, t: 1 }, stringers: [{ y: 20, A: 10 }], doubler: { x0: 20, y0: 20, Lx: 20, Ly: 20, t: 0.8 }, material: { E: 70000, nu: 0.33, rho: 2700 }, load: { q: 12 }, mesh: { h: 20 }, regions: { exclude: 5, band: 5 } }],
  ["90 × 50 panel, two stringers, a doubler on an edge, unequal cells", { panel: { L: 90, W: 50, t: 1.2 }, stringers: [{ y: 10, A: 25 }, { y: 35, A: 5 }], doubler: { x0: 0, y0: 15, Lx: 37, Ly: 35, t: 2 }, material: { E: 72000, nu: 0.3, rho: 2780 }, load: { q: -20 }, mesh: { h: 12 }, regions: { exclude: 5, band: 5 } }],
];

for (const [what, s] of PANELS) test(`the page's solve matches an independent dense solve: ${what}`, () => {
  const r = DT.runComparison(s);
  assert.equal(r.ok, true, JSON.stringify(r.errors || r.error));
  for (const [variant, withDoubler] of [["A", false], ["B", true]]) {
    const ref = referencePanel(s, withDoubler);
    const umax = Math.max(...ref.u.map(Math.abs));
    assert.ok(umax > 0);
    for (let i = 0; i < ref.u.length; i++) assert.ok(Math.abs(r[variant].u[i] - ref.u[i]) <= 1e-8 * umax, `${variant} dof ${i}: ${r[variant].u[i]} vs ${ref.u[i]}`);
    const smax = Math.max(...ref.stress.flat().map(Math.abs));
    ref.stress.forEach((sg, g) => {
      assert.ok(Math.abs(r[variant].gp[2 * g] - ref.points[g].x) < 1e-9 && Math.abs(r[variant].gp[2 * g + 1] - ref.points[g].y) < 1e-9, `${variant} Gauss point ${g} position`);
      for (let k = 0; k < 3; k++) assert.ok(Math.abs(r[variant].sig[3 * g + k] - sg[k]) <= 1e-7 * smax, `${variant} Gauss point ${g} component ${k}`);
    });
  }
});

test("a cantilever under parabolic end shear converges to the Timoshenko-Goodier closed form, on a skewed mesh", () => {
  // Timoshenko and Goodier, Theory of Elasticity (1951), §21: depth 2c, unit thickness, length l, end
  // load P at x = 0, built in at x = l. σx = −Pxy/I, σy = 0, τxy = −P(c² − y²)/(2I), and
  //   u = −Px²y/(2EI) − νPy³/(6EI) + Py³/(6IG) + (Pl²/(2EI) − Pc²/(2IG)) y
  //   v = νPxy²/(2EI) + Px³/(6EI) − Pl²x/(2EI) + Pl³/(3EI).
  // The built-in end takes this u, v; the loaded end takes the parabolic shear traction; the edges y = ±c are free.
  const l = 48, c = 6, E = 1000, nu = 0.25, P = 1, I = (2 * c ** 3) / 3, G = E / (2 * (1 + nu));
  const U = (x, y) => -(P * x * x * y) / (2 * E * I) - (nu * P * y ** 3) / (6 * E * I) + (P * y ** 3) / (6 * I * G) + ((P * l * l) / (2 * E * I) - (P * c * c) / (2 * I * G)) * y;
  const V = (x, y) => (nu * P * x * y * y) / (2 * E * I) + (P * x ** 3) / (6 * E * I) - (P * l * l * x) / (2 * E * I) + (P * l ** 3) / (3 * E * I);
  const run = (nx, ny) => {
    const coords = [];
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
      const y = -c + (2 * c * j) / ny, skew = i > 0 && i < nx ? 0.2 * (l / nx) * (y / c) * (i % 2 ? 1 : -1) : 0;
      coords.push((l * i) / nx + skew, y);
    }
    const quads = [], node = (i, j) => j * (nx + 1) + i;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) quads.push(node(i, j), node(i + 1, j), node(i + 1, j + 1), node(i, j + 1));
    const f = new Array(2 * (nx + 1) * (ny + 1)).fill(0), fixed = [], val = [];
    // Consistent nodal forces of t_y = P(c² − y²)/(2I) on x = 0, by two-point Gauss (exact for this cubic).
    const g = 1 / Math.sqrt(3);
    for (let j = 0; j < ny; j++) {
      const ya = coords[2 * node(0, j) + 1], yb = coords[2 * node(0, j + 1) + 1], h = yb - ya;
      for (const s of [-g, g]) {
        const y = (ya + yb) / 2 + (s * h) / 2, ty = (P * (c * c - y * y)) / (2 * I);
        f[2 * node(0, j) + 1] += (ty * h * (1 - s)) / 4;
        f[2 * node(0, j + 1) + 1] += (ty * h * (1 + s)) / 4;
      }
    }
    for (let j = 0; j <= ny; j++) { const n = node(nx, j), y = coords[2 * n + 1]; fixed.push(2 * n, 2 * n + 1); val.push(U(l, y), V(l, y)); }
    const r = DT.solve({ coords: Float64Array.from(coords), quads: Int32Array.from(quads), thick: new Float64Array(nx * ny).fill(1), bars: new Int32Array(0), barA: new Float64Array(0), E, nu, fixed: Int32Array.from(fixed), fixedVal: Float64Array.from(val), f: Float64Array.from(f) });
    assert.equal(r.ok, true, r.error && r.error.message);
    return r.u[2 * node(0, ny / 2) + 1];
  };
  const exact = (P * l ** 3) / (3 * E * I);
  assert.ok(Math.abs(V(0, 0) - exact) < 1e-12);
  const v = [[8, 2], [16, 4], [32, 8], [64, 16]].map(([nx, ny]) => run(nx, ny)), err = v.map((x) => Math.abs(x - exact) / exact);
  for (let k = 1; k < err.length; k++) assert.ok(err[k] < err[k - 1], `errors shrink: ${err}`);
  assert.ok(err.at(-1) < 0.01, `64 × 16 mesh within 1% of Pl³/(3EI) = ${exact}: ${v.at(-1)}`);
  // Bilinear elements converge at second order in displacement: halving h divides the error by about 4.
  assert.ok(err[2] / err[3] > 3, `rate: ${err[2] / err[3]}`);
});
