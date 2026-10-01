/* Structural Distortion Explorer: pure kinematics.
 *
 * Unit-free, qualitative and exaggerated. Every function here is pure (no DOM,
 * no three.js), so the page and the Node tests run the same code. Works in the
 * browser (global `Distortion`) and in Node (`require`).
 *
 * Coordinates: x runs along the member (the clamp is x = 0, the loaded free
 * end x = L), y is up and z is across. A wall is a thin plate swept along x
 * from a cross-section path; a point on it is (u = x, v = arc length along the
 * path, zeta = offset through the thickness along the outward normal).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Distortion = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const L = 6;                      // member length
  const NU = 0.5;                   // Poisson ratio, at its upper limit so the swell shows
  const EPS_AXIAL = 0.08;           // axial strain at full axial load, 1× exaggeration
  const GAMMA_V = 0.08;             // peak wall shear strain at full transverse shear
  const KAPPA_CLAMP = 0.07;         // curvature at the clamp at full bending
  const GAMMA_Q = 0.1;              // panel shear strain at full in-plane shear
  const TWIST = { tube: 0.5, box: 0.6, ibeam: 1.2 }; // free-end twist (rad) at full torsion, warping free
  const LAMBDA_L = { box: 10, ibeam: 2.5 }; // Vlasov decay length ratio L*sqrt(GJ/(E*Cw)); the tube does not warp
  const LAG = 0.7;                  // shear-lag strength (assumed shape)
  // Buckling (assumed shapes, qualitative thresholds). A plate's critical
  // compression is C_S k_c / b and critical shear C_T k_s / b_short: the true
  // (t/b)^2 dependence is compressed to 1/b so every case buckles inside the
  // slider range, while the ordering (narrower plates, stiffeners: higher) holds.
  const BUCKLE = {
    // wrinkle: amplitude per plate width at 1x (growth saturates at 1.6 times
    // this), kept small enough on the box that opposite walls never meet
    panel: { C_S: 0.1, C_T: 0.0631, wrinkle: 0.1 },
    box: { C_S: 0.108, C_T: 0.095, wrinkle: 0.05 },
    ibeam: { C_S: 0.108, C_T: 0.095, wrinkle: 0.07 },
  };
  const RAMP = 0.35;                // wrinkles fade out over this length at a clamped or loaded end

  const GEOM = {
    tube: { R: 0.6, t: 0.05 },
    box: { B: 1.2, H: 0.8, t: 0.05, rc: 0.06 },
    ibeam: { BF: 1.0, H: 1.2, tf: 0.07, tw: 0.05 },
    // 2:1 flat skin, 3 longitudinal stringers and 2 transverse frames on the +z side
    panel: { A: 4, B: 2, t: 0.03, stringers: [-0.5, 0, 0.5], hs: 0.14, ts: 0.03, frames: [-2 / 3, 2 / 3], hf: 0.2, tfr: 0.035 },
  };

  const BEAMS = ["tube", "box", "ibeam"];
  const STRUCTURES = [...BEAMS, "panel"];
  const LOADS = ["axial", "shear", "torsion", "bending", "inplane"];
  const APPLIES = { axial: STRUCTURES, shear: BEAMS, torsion: BEAMS, bending: BEAMS, inplane: ["panel"] };

  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

  /* ---------- Sampled cross-section paths ---------- */

  /* A path is sampled densely once; lookups interpolate linearly in arc length.
   * Each sample carries position (y, z), unit tangent (ty, tz), outward normal
   * (ny, nz) and the plate it belongs to (for buckling), or -1 in a corner. */
  function samplePath(points, closed) {
    const n = points.length, s = new Float64Array(n);
    for (let i = 1; i < n; i++) s[i] = s[i - 1] + Math.hypot(points[i].y - points[i - 1].y, points[i].z - points[i - 1].z);
    const length = closed ? s[n - 1] + Math.hypot(points[0].y - points[n - 1].y, points[0].z - points[n - 1].z) : s[n - 1];
    return { points, s, length, closed };
  }

  function lookup(path, v) {
    const { points, s, length, closed } = path, n = points.length;
    if (closed) { v = ((v % length) + length) % length; } else v = clamp(v, 0, length);
    let lo = 0, hi = n - 1;
    if (closed && v >= s[n - 1]) { lo = n - 1; hi = 0; }
    else { while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (s[mid] <= v) lo = mid; else hi = mid; } }
    const s0 = s[lo], s1 = hi === 0 ? length : s[hi];
    const f = s1 > s0 ? (v - s0) / (s1 - s0) : 0;
    const a = points[lo], b = points[hi], out = {};
    for (const k in a) out[k] = typeof a[k] === "number" ? a[k] + (b[k] - a[k]) * f : a[k];
    const tl = Math.hypot(out.ty, out.tz) || 1; out.ty /= tl; out.tz /= tl;
    out.ny = -out.tz * a.side; out.nz = out.ty * a.side;
    out.plate = f < 0.5 ? a.plate : b.plate;
    return out;
  }

  /* Tube: theta from +z towards +y. */
  function tubePath() {
    const { R } = GEOM.tube, n = 256, pts = [];
    for (let i = 0; i < n; i++) {
      const th = (2 * Math.PI * i) / n;
      pts.push({ y: R * Math.sin(th), z: R * Math.cos(th), ty: Math.cos(th), tz: -Math.sin(th), side: 1, plate: -1, eta: 0 });
    }
    return samplePath(pts, true);
  }

  /* Box: rounded rectangle walked from the top-flange centre towards -z
   * (anticlockwise seen from the free end), so the outward normal is on the
   * right of the tangent. Plates: 0 top flange, 1 left web, 2 bottom flange, 3 right web. */
  function boxPath() {
    const { B, H, rc } = GEOM.box, hw = B / 2, hh = H / 2, pts = [];
    const line = (z0, y0, z1, y1, plate, count) => {
      for (let i = 0; i < count; i++) {
        const f = i / count, len = Math.hypot(z1 - z0, y1 - y0);
        pts.push({ y: y0 + (y1 - y0) * f, z: z0 + (z1 - z0) * f, ty: (y1 - y0) / len, tz: (z1 - z0) / len, side: 1, plate, eta: 0 });
      }
    };
    const arc = (cz, cy, a0, count) => {
      for (let i = 0; i < count; i++) {
        const a = a0 + (Math.PI / 2) * (i / count);
        pts.push({ y: cy + rc * Math.sin(a), z: cz + rc * Math.cos(a), ty: Math.cos(a), tz: -Math.sin(a), side: 1, plate: -1, eta: 0 });
      }
    };
    const fz = hw - rc, fy = hh - rc;
    // top flange (right half first: from centre to the left corner is -z)
    line(0, hh, -fz, hh, 0, 60);
    arc(-fz, fy, Math.PI / 2, 8);
    line(-hw, fy, -hw, -fy, 1, 60);
    arc(-fz, -fy, Math.PI, 8);
    line(-fz, -hh, fz, -hh, 2, 120);
    arc(fz, -fy, 1.5 * Math.PI, 8);
    line(hw, -fy, hw, fy, 3, 60);
    arc(fz, fy, 0, 8);
    line(fz, hh, 0, hh, 0, 60);
    // Plate coordinate eta runs across each flat plate, corner to corner, with the path.
    for (const p of pts) p.eta = p.plate === 1 ? fy - p.y : p.plate === 3 ? p.y + fy : p.plate === 0 ? fz - p.z : p.plate === 2 ? p.z + fz : 0;
    return samplePath(pts, true);
  }

  function straightPath(y0, z0, y1, z1, count, side, plate) {
    const pts = [], len = Math.hypot(y1 - y0, z1 - z0);
    for (let i = 0; i <= count; i++) {
      const f = i / count;
      pts.push({ y: y0 + (y1 - y0) * f, z: z0 + (z1 - z0) * f, ty: (y1 - y0) / len, tz: (z1 - z0) / len, side, plate, eta: f * len });
    }
    return samplePath(pts, false);
  }

  /* ---------- Section fields (thin-walled theory) ---------- */

  /* Integrate along a sampled path: returns cumulative trapezoid values of f. */
  function cumulative(path, f) {
    const { points, s } = path, n = points.length, out = new Float64Array(n);
    for (let i = 1; i < n; i++) out[i] = out[i - 1] + 0.5 * (f(points[i - 1]) + f(points[i])) * (s[i] - s[i - 1]);
    const closing = path.closed ? 0.5 * (f(points[n - 1]) + f(points[0])) * (path.length - s[n - 1]) : 0;
    return { values: out, total: out[n - 1] + closing };
  }

  function mean(path, values) {
    const { s } = path, n = values.length;
    let sum = 0;
    for (let i = 1; i < n; i++) sum += 0.5 * (values[i - 1] + values[i]) * (s[i] - s[i - 1]);
    let len = s[n - 1];
    if (path.closed) { sum += 0.5 * (values[n - 1] + values[0]) * (path.length - s[n - 1]); len = path.length; }
    return sum / len;
  }

  /* Closed single-cell section of uniform thickness, shear in +y through the
   * shear centre (the origin, by symmetry). Shear flow from dq/ds = -t y (tip
   * force up, moment falling towards the tip), made single-valued by the
   * no-twist condition; then the rigid drift v' by least squares and the
   * resulting axial (shear) warping, all normalised so the peak |gamma| is 1. */
  function closedShear(path) {
    const qOpen = cumulative(path, (p) => -p.y).values;
    const q0 = -mean(path, qOpen);
    const gamma = qOpen.map((q) => q + q0);
    const peak = Math.max(...gamma.map(Math.abs));
    for (let i = 0; i < gamma.length; i++) gamma[i] /= peak;
    let gy = 0, yy = 0;
    const { points, s } = path, n = points.length;
    for (let i = 0; i < n; i++) {
      const ds = (i + 1 < n ? s[i + 1] : path.length) - s[i];
      gy += gamma[i] * points[i].ty * ds; yy += points[i].ty * points[i].ty * ds;
    }
    const vp = gy / yy;
    let acc = 0; const warp = new Float64Array(n);
    for (let i = 1; i < n; i++) {
      const a = gamma[i - 1] - vp * points[i - 1].ty, b = gamma[i] - vp * points[i].ty;
      acc += 0.5 * (a + b) * (s[i] - s[i - 1]); warp[i] = acc;
    }
    const m = mean(path, warp);
    for (let i = 0; i < n; i++) warp[i] -= m;
    return { gamma, vp, warp };
  }

  /* Normalised sectorial coordinate of a closed single cell, uniform t:
   * omega = integral of (rho - psi) ds, psi = 2A / perimeter, mean removed.
   * Zero for the circular tube; the box's corners warp alternately. */
  function closedOmega(path) {
    const rho = (p) => p.y * p.tz - p.z * p.ty;
    const psi = cumulative(path, rho).total / path.length;
    const omega = cumulative(path, (p) => rho(p) - psi).values;
    const m = mean(path, omega);
    const out = omega.map((w) => w - m);
    out.psiSign = Math.sign(psi);
    return out;
  }

  /* Table-backed lookup of a per-sample array on a path. */
  function sampleArray(path, arr, v) {
    const { s, length, closed } = path, n = s.length;
    if (closed) v = ((v % length) + length) % length; else v = clamp(v, 0, s[n - 1]);
    let lo = 0, hi = n - 1;
    if (closed && v >= s[n - 1]) { const f = (v - s[n - 1]) / (length - s[n - 1]); return arr[n - 1] + (arr[0] - arr[n - 1]) * f; }
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (s[mid] <= v) lo = mid; else hi = mid; }
    const f = s[hi] > s[lo] ? (v - s[lo]) / (s[hi] - s[lo]) : 0;
    return arr[lo] + (arr[hi] - arr[lo]) * f;
  }

  /* ---------- Models ---------- */

  function beamWall(id, name, kind, path, t, vRange, mesh, uRange) {
    return {
      id, name, kind, path, t, closed: path.closed,
      u0: uRange ? uRange[0] : 0, u1: uRange ? uRange[1] : L, v0: vRange ? vRange[0] : 0, v1: vRange ? vRange[1] : path.length,
      nu: mesh[0], nv: mesh[1],
    };
  }

  /* Stiffened panel: the skin is swept along x from a path across y (v = y + B/2);
   * stringers are blades swept along x; frames are blades across y at fixed x
   * (their u runs along y and v up the blade). Stiffeners carry no grid. */
  function panelModel() {
    const G = GEOM.panel, hb = G.B / 2, ha = G.A / 2;
    const skin = beamWall(0, "Skin", "skin", straightPath(-hb, 0, hb, 0, 128, 1, 0), G.t, null, [128, 64], [-ha, ha]);
    const walls = [skin];
    G.stringers.forEach((y, i) => {
      const w = beamWall(walls.length, `Stringer ${i + 1}`, "stringer", straightPath(y, G.t / 2, y, G.t / 2 + G.hs, 4, -1, -1), G.ts, null, [64, 3], [-ha, ha]);
      w.noGrid = true; walls.push(w);
    });
    G.frames.forEach((x, i) => {
      const w = beamWall(walls.length, `Frame ${i + 1}`, "frame", straightPath(-hb, G.t / 2, -hb, G.t / 2 + G.hf, 4, -1, -1), G.tfr, null, [48, 3], [-hb, hb]);
      w.x0 = x; w.noGrid = true; walls.push(w);
    });
    for (const w of walls) { w.shear = null; w.omega = null; }
    return { structure: "panel", length: G.A, walls, grid: { along: 24, around: 12 } };
  }

  function buildModel(structure) {
    if (structure === "tube") {
      const path = tubePath();
      const sh = closedShear(path);
      const wall = beamWall(0, "Tube wall", "tube", path, GEOM.tube.t, null, [96, 64]);
      wall.shear = sh;
      wall.omega = closedOmega(path);
      return { structure, length: L, walls: [wall], grid: { along: 24, around: 16 } };
    }
    if (structure === "box") {
      const path = boxPath();
      const sh = closedShear(path);
      const wall = beamWall(0, "Box wall", "box", path, GEOM.box.t, null, [96, 96]);
      wall.shear = sh;
      wall.omega = closedOmega(path);
      return { structure, length: L, walls: [wall], grid: { along: 24, around: 20 } };
    }
    if (structure === "ibeam") {
      const { BF, H, tf, tw } = GEOM.ibeam, hh = H / 2;
      const top = straightPath(hh, -BF / 2, hh, BF / 2, 64, -1, -1);
      const web = straightPath(-hh, 0, hh, 0, 64, 1, 0);
      const bot = straightPath(-hh, -BF / 2, -hh, BF / 2, 64, 1, -1);
      const walls = [
        beamWall(0, "Top flange", "flange", top, tf, null, [96, 20]),
        beamWall(1, "Web", "web", web, tw, [tf / 2, H - tf / 2], [96, 24]),
        beamWall(2, "Bottom flange", "flange", bot, tf, null, [96, 20]),
      ];
      iBeamShear(walls);
      // Open section, pole at the shear centre (the origin), omega = 0 on the
      // web: omega = integral of rho ds = y_f * z on each flange.
      for (const w of walls) w.omega = w.path.points.map((p) => (w.kind === "web" ? 0 : p.y * p.z));
      return { structure, length: L, walls, grid: { along: 24, around: 6 } };
    }
    if (structure === "panel") return panelModel();
    throw new Error(`unknown structure ${structure}`);
  }

  /* I-beam shear flow (tip force up): flanges linear from the tips, web
   * parabolic plus the flange inflow; drift v' is the web average; web warping
   * is odd in y (the classic S-shaped section) and flange warping even in z. */
  function iBeamShear(walls) {
    const { BF, H, tf, tw } = GEOM.ibeam, hh = H / 2;
    const qFlange = (y, z) => tf * y * (BF / 2 - Math.abs(z)) * Math.sign(z);
    const qWeb = (y) => tf * H * BF / 2 + tw * (H * H / 8 - y * y / 2);
    const peak = qWeb(0) / tw;
    const nWeb = 200; let sum = 0;
    for (let i = 0; i < nWeb; i++) { const y = -hh + (i + 0.5) * H / nWeb; sum += qWeb(y) / tw / peak; }
    const vp = sum / nWeb;
    const webWarp = (y) => { // integral from 0 to y of (gamma - vp)
      const g = (yy) => qWeb(yy) / tw / peak - vp;
      const n = 40, h = y / n; let acc = 0;
      for (let i = 0; i < n; i++) acc += g((i + 0.5) * h) * h;
      return acc;
    };
    const flangeWarp = (y, z) => (tf * y / tf / peak) * (BF / 2 * Math.abs(z) - z * z / 2); // integral of gamma_f from 0 to z
    let mf = 0; const m = 50;
    for (let i = 0; i < m; i++) { const z = -BF / 2 + (i + 0.5) * BF / m; mf += flangeWarp(hh, z) / m; }
    // mean of the even flange warping is removed per flange (top and bottom cancel anyway)
    for (const w of walls) {
      const p = w.path, n = p.points.length;
      const gamma = new Float64Array(n), warp = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const { y, z } = p.points[i];
        if (w.kind === "web") { gamma[i] = qWeb(y) / tw / peak; warp[i] = webWarp(y); }
        else { gamma[i] = qFlange(y, z) / tf / peak; warp[i] = flangeWarp(y, z) - Math.sign(y) * mf; }
      }
      w.shear = { gamma, vp, warp };
    }
  }

  /* ---------- Loads, state and preparation ---------- */

  function defaultState() {
    return {
      structure: "tube",
      loads: { axial: 0, shear: 0, torsion: 0, bending: 0, inplane: 0 },
      exaggeration: 1,
      warpingRestraint: false,
      stringers: true,
      frames: true,
      patch: defaultPatch("tube"),
    };
  }

  /* Effective (exaggerated) load amplitudes and the bending centreline table. */
  function prepare(model, state) {
    const e = state.exaggeration;
    const on = (k) => (APPLIES[k].includes(model.structure) ? state.loads[k] || 0 : 0);
    const P = {
      model, state,
      epsA: on("axial") * EPS_AXIAL * e,
      gV: on("shear") * GAMMA_V * e,
      twistTip: on("torsion") * (TWIST[model.structure] || 0) * e,
      kappa0: on("bending") * KAPPA_CLAMP * e,
      gQ: on("inplane") * GAMMA_Q * e,
    };
    P.plates = plates(model, state);
    // Twist. Warping free: uniform rate. Warping restrained at the clamp
    // (Vlasov, tip torque, phi(0) = phi'(0) = 0, phi''(L) = 0):
    // phi'(x) = k (1 - cosh(lambda (L - x)) / cosh(lambda L)), same k = T/GJ.
    const k = P.twistTip / L, lam = (LAMBDA_L[model.structure] || 0) / L;
    P.restrained = !!state.warpingRestraint && lam > 0;
    if (P.restrained) {
      const ch = Math.cosh(lam * L), sh = Math.sinh(lam * L);
      P.phi = (x) => k * (x - (sh - Math.sinh(lam * (L - x))) / (lam * ch));
      P.dphi = (x) => k * (1 - Math.cosh(lam * (L - x)) / ch);
    } else {
      P.phi = (x) => k * x;
      P.dphi = () => k;
    }
    // Centreline of the bent member: curvature falls linearly from the clamp to
    // zero at the tip (a tip force); integrate the tangent angle over arc length.
    const n = 400, xmax = 1.6 * L, dx = xmax / n;
    const cx = new Float64Array(n + 1), cy = new Float64Array(n + 1), th = new Float64Array(n + 1);
    const theta = (xi) => { const x = Math.min(xi, L); return P.kappa0 * (x - x * x / (2 * L)); };
    for (let i = 1; i <= n; i++) {
      const x0 = (i - 1) * dx, x1 = i * dx;
      th[i] = theta(x1);
      const tm = theta(0.5 * (x0 + x1));
      cx[i] = cx[i - 1] + Math.cos(tm) * dx; cy[i] = cy[i - 1] + Math.sin(tm) * dx;
    }
    P.curve = (xi) => {
      if (xi <= 0) return [xi, 0, 0];
      const f = xi / dx, i = Math.min(Math.floor(f), n - 1), r = f - i;
      return [cx[i] + (cx[i + 1] - cx[i]) * r, cy[i] + (cy[i + 1] - cy[i]) * r, th[i] + (th[i + 1] - th[i]) * r];
    };
    P.kappa = (x) => P.kappa0 * Math.max(0, 1 - x / L);
    return P;
  }

  /* Reference position on a wall. */
  function reference(wall, u, v, zeta) {
    const q = lookup(wall.path, v);
    if (wall.kind === "frame") return { x: wall.x0 + zeta, y: u, z: q.z, q };
    return { x: u, y: q.y + q.ny * zeta, z: q.z + q.nz * zeta, q };
  }

  /* Panel: uniform in-plane strain, symmetric about the panel centre:
   * axial eps along x with Poisson -nu eps across, and pure shear gamma. */
  function deformPanel(P, wall, u, v, zeta) {
    const { x, y, z } = reference(wall, u, v, zeta);
    return [x + P.epsA * x + (P.gQ / 2) * y, y - NU * P.epsA * y + (P.gQ / 2) * x, z];
  }

  /* Deformed position of the wall point (u, v, zeta). `opts.membrane` leaves
   * out the buckling wrinkles, which are not in-plane strain of the wall. */
  function deform(P, wall, u, v, zeta, opts) {
    const w = opts && opts.membrane ? 0 : wrinkle(P, wall, u, v);
    if (P.model.structure === "panel") {
      const q = deformPanel(P, wall, u, v, zeta);
      q[2] += w;
      return q;
    }
    const r = reference(wall, u, v, zeta);
    let { x, y, z } = r;
    if (w) { y += w * r.q.ny; z += w * r.q.nz; }
    // Poisson: lateral strain follows the local axial strain (axial + bending),
    // held back by the clamp over a short length.
    const epsLocal = P.epsA - P.kappa(x) * y;
    const lat = 1 - NU * epsLocal * (1 - Math.exp(-x / 0.3));
    y *= lat; z *= lat;
    // Saint-Venant twist about the shear centre (the origin).
    const phi = P.phi(x), c = Math.cos(phi), s = Math.sin(phi);
    let y2 = y * c - z * s; const z2 = y * s + z * c;
    // Transverse shear: rigid drift of the sections plus their shear warping.
    const sh = wall.shear;
    y2 += P.gV * sh.vp * x;
    let ux = P.epsA * x + warping(P, wall, x, v);
    // Bending: plane sections stay plane and normal to the bent centreline.
    const [X, Y, th] = P.curve(x + ux);
    return [X - y2 * Math.sin(th), Y + y2 * Math.cos(th), z2];
  }

  /* Axial displacement that breaks plane sections: torsional warping
   * (-phi' omega), shear warping and, on the box flanges, shear lag. */
  function warping(P, wall, x, v) {
    if (!wall.omega) return 0;
    let w = -P.dphi(x) * sampleArray(wall.path, wall.omega, v) + P.gV * sampleArray(wall.path, wall.shear.warp, v);
    if (P.model.structure === "box" && P.kappa0) {
      const q = lookup(wall.path, v);
      if (q.plate === 0 || q.plate === 2) w += shearLag(P, x, q);
    }
    return w;
  }

  /* Shear lag (assumed shape): the flange middle lags behind its edges, so the
   * flange strain peaks at the webs. Cosine across the flange, zero at the
   * webs (continuous with them), scaled by the bending rotation. */
  function shearLag(P, x, q) {
    const b = GEOM.box.B - 2 * GEOM.box.rc, xx = Math.min(x, L);
    const theta = P.kappa0 * (xx - (xx * xx) / (2 * L));
    const lag = Math.cos((Math.PI * (q.eta - b / 2)) / b); // 1 mid-flange, 0 at the webs
    return Math.sign(q.y) * (GEOM.box.H / 2) * theta * LAG * lag;
  }

  /* Scalar for the colour maps at the mid-surface point (u, v): membrane
   * axial strain E_xx, engineering shear strain 2 E_xs, or warping. */
  function fieldValue(P, wall, u, v, mode) {
    if (mode === "warping") return warping(P, wall, u, v);
    const h = 1e-3, at = (du, dv) => deform(P, wall, clamp(u + du, wall.u0, wall.u1), v + dv, 0, { membrane: true });
    const hu = Math.min(u + h, wall.u1) - Math.max(u - h, wall.u0);
    const Fu = sub3(at(h, 0), at(-h, 0)).map((x) => x / hu);
    if (mode === "axial") return (dot3(Fu, Fu) - 1) / 2;
    const vs = wall.closed ? h : Math.min(v + h, wall.path.length) - Math.max(v - h, 0);
    const Fs = sub3(at(0, h), at(0, -h)).map((x) => x / vs);
    return dot3(Fu, Fs);
  }

  /* ---------- Buckling (threshold-triggered, assumed wave shapes) ---------- */

  const ks = (r) => 5.34 + 4 / (r * r);                        // shear, simply supported, r = long/short
  const kc = (a, b) => {                                       // compression along a, width b
    const m = Math.max(1, Math.round(a / b));
    return Math.pow((m * b) / a + a / (m * b), 2);
  };

  /* The buckling plates of a model under a state: each with its extent
   * (x0..x1 along u, e0..e1 across, in wall coordinates), critical stresses
   * and the demand functions sigma(x) (compression positive) and tau, both in
   * slider units. Circular tube: none. */
  function plates(model, state) {
    const L_ = state.loads, out = [];
    const on = (k) => (APPLIES[k].includes(model.structure) ? L_[k] || 0 : 0);
    const N = on("axial"), V = on("shear"), T = on("torsion"), M = on("bending"), Q = on("inplane");
    if (model.structure === "panel") {
      const G = GEOM.panel, C = BUCKLE.panel;
      const xs = [-G.A / 2, ...(state.frames ? G.frames : []), G.A / 2];
      const ys = [-G.B / 2, ...(state.stringers ? G.stringers : []), G.B / 2];
      for (let i = 0; i + 1 < xs.length; i++) for (let j = 0; j + 1 < ys.length; j++) {
        const a = xs[i + 1] - xs[i], b = ys[j + 1] - ys[j];
        out.push({
          wall: 0, name: "skin", x0: xs[i], x1: xs[i + 1], e0: ys[j] + G.B / 2, e1: ys[j + 1] + G.B / 2, fadeEnds: false,
          sigmaCr: (C.C_S * kc(a, b)) / b, tauCr: (C.C_T * ks(Math.max(a, b) / Math.min(a, b))) / Math.min(a, b),
          sigma: () => -N, tau: Q,
        });
      }
    } else if (model.structure === "box") {
      const { B, H, rc } = GEOM.box, C = BUCKLE.box, w = model.walls[0];
      const names = ["top flange", "left web", "bottom flange", "right web"];
      for (let k = 0; k < 4; k++) {
        const b = k % 2 ? H - 2 * rc : B - 2 * rc;
        // shear strain sign along the path at the plate centre, from V and from T
        const centre = w.path.points.findIndex((p) => p.plate === k && Math.abs(p.eta - b / 2) < 0.02);
        const gV = w.shear.gamma[centre], gT = w.omega.psiSign;
        const bend = k === 0 ? 1 : k === 2 ? -1 : 0;
        out.push({
          wall: 0, plate: k, name: names[k], x0: 0, x1: L, e0: 0, e1: b, fadeEnds: true,
          sigmaCr: (C.C_S * kc(L, b)) / b, tauCr: (C.C_T * ks(L / b)) / b,
          sigma: (x) => -N + bend * M * Math.max(0, 1 - x / L), tau: V * gV + T * gT,
        });
      }
    } else if (model.structure === "ibeam") {
      const { H, tf } = GEOM.ibeam, C = BUCKLE.ibeam, b = H - tf, w = model.walls[1];
      out.push({
        wall: 1, name: "web", x0: 0, x1: L, e0: tf / 2, e1: H - tf / 2, fadeEnds: true, plate: 0, v0: w.v0,
        sigmaCr: Infinity, tauCr: (C.C_T * ks(L / b)) / b,
        sigma: () => 0, tau: V,
      });
    }
    return out;
  }

  /* Interaction ratio at x: compression over critical plus shear ratio squared. */
  function ratio(pl, x) {
    const s = Math.max(0, pl.sigma(x)) / pl.sigmaCr, t = pl.tau / pl.tauCr;
    return { r: s + t * t, s, t2: t * t };
  }

  const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

  /* Out-of-plane wrinkle at (u, v): zero below the threshold, then growing as
   * sqrt(r - 1). Shear: diagonal half-waves at about 45 degrees with crests
   * along the tension diagonal; compression: square half-waves; mixed loads
   * blend the two. The plate edges (and stiffeners) are nodal lines. */
  function wrinkle(P, wall, u, v) {
    if (!P.plates || !P.plates.length) return 0;
    let e;
    if (P.model.structure === "box") { const q = lookup(wall.path, v); if (q.plate < 0) return 0; e = q.eta; }
    for (const pl of P.plates) {
      if (pl.wall !== wall.id) continue;
      if (P.model.structure === "box") { if (lookup(wall.path, v).plate !== pl.plate) continue; }
      else { e = v; if (e < pl.e0 || e > pl.e1) continue; e -= pl.e0; }
      if (u < pl.x0 || u > pl.x1) continue;
      const { r, s, t2 } = ratio(pl, u);
      if (r <= 1) return 0;
      const a = pl.x1 - pl.x0, b = pl.e1 - pl.e0, xi = u - pl.x0;
      const lam = 1.1 * Math.min(a, b);
      // capped at a fifth of the half-wave so wrinkles never fold at high exaggeration
      const amp = Math.min(0.2 * lam, BUCKLE[P.model.structure].wrinkle * b * 1.6 * Math.tanh(Math.sqrt(r - 1) / 1.6) * P.state.exaggeration);
      const across = Math.sin((Math.PI * e) / b);
      const along = pl.fadeEnds ? smooth(xi / RAMP) * smooth((a - xi) / RAMP) : Math.sin((Math.PI * xi) / a);
      const diag = Math.sin((Math.PI * (xi - Math.sign(pl.tau || 1) * e)) / lam);
      const m = pl.fadeEnds ? a / b : Math.max(1, Math.round(a / b));
      const comp = Math.sin((Math.PI * m * xi) / a);
      const shape = (t2 * diag + s * comp) / (t2 + s || 1);
      return amp * across * along * shape;
    }
    return 0;
  }

  /* Buckling onset for each load acting alone: the slider value (either sign)
   * where the first plate reaches its critical ratio, or null. */
  function criticalLoads(model, state) {
    const out = {};
    for (const k of LOADS) {
      out[k] = { pos: null, neg: null };
      if (!APPLIES[k].includes(model.structure)) continue;
      for (const sign of [1, -1]) {
        const st = { ...state, loads: { axial: 0, shear: 0, torsion: 0, bending: 0, inplane: 0, [k]: sign } };
        let best = Infinity;
        for (const pl of plates(model, st)) {
          const xs = pl.fadeEnds ? [pl.x0, RAMP, (pl.x0 + pl.x1) / 2] : [(pl.x0 + pl.x1) / 2];
          for (const x of xs) { const { s, t2 } = ratio(pl, x); if (s + t2 > 0) best = Math.min(best, onset(s, t2)); }
        }
        if (best <= 1) out[k][sign > 0 ? "pos" : "neg"] = best;
      }
    }
    return out;
  }
  /* Smallest load factor f with f s + f^2 t2 = 1 (s, t2 at unit load). */
  function onset(s, t2) {
    if (t2 <= 0) return s > 0 ? 1 / s : Infinity;
    return (-s + Math.sqrt(s * s + 4 * t2)) / (2 * t2);
  }

  /* Is any plate buckled, and how far past its threshold (for the legend). */
  function bucklingState(P) {
    return (P.plates || []).map((pl) => {
      let r = 0;
      for (let k = 0; k <= 20; k++) { const x = pl.x0 + ((pl.x1 - pl.x0) * k) / 20; if (!pl.fadeEnds || x < pl.x1 - RAMP * 0.5) r = Math.max(r, ratio(pl, x).r); }
      return { name: pl.name, ratio: r, buckled: r > 1 };
    });
  }

  /* ---------- Presets ("Try this") ---------- */

  const PRESETS = [
    { id: "torsion", title: "Torsion: tube vs I-beam", structure: "tube", loads: { torsion: 0.7 },
      hint: "The tube twists into a helix; its patch shears but hardly moves along the span. Now pick the I-beam (the loads stay): its flange tips slide along the span in opposite directions. Turn on the warping restraint to hold them at the clamp." },
    { id: "pure-shear", title: "Pure shear: rotate the patch to 45°", structure: "panel", loads: { inplane: 0.15 }, patch: { angle: 45 },
      hint: "At 45° the patch edges line up with the principal directions: one diagonal of the panel stretches (red), the other shortens (blue), and the shear angle vanishes. Rotate the patch back to 0° to see it shear instead." },
    { id: "shear-buckling", title: "Shear buckling with and without stringers", structure: "panel", loads: { inplane: 0.85 }, stringers: false, frames: false,
      hint: "The bare skin buckles into long diagonal waves. Turn the stringers on: the ▲ threshold on the in-plane shear slider moves out and the waves shorten between the stiffeners. Frames raise it further." },
    { id: "shear-lag", title: "Bending with shear lag in the box flange", structure: "box", loads: { bending: 0.38 }, exaggeration: 2, contour: "axial", view: "top",
      patch: { along: 0.2, y: 0.4, z: 0.38 },
      hint: "The axial-strain map on the top flange is strongest next to the webs and weaker mid-flange: shear lag (an assumed shape). Plane sections would give the same colour across the whole flange." },
    { id: "compression", title: "Axial compression: Poisson swell and wrinkling", structure: "box", loads: { axial: -0.6 }, exaggeration: 1.5,
      hint: "The box shortens and swells sideways against the pale-blue ghost (Poisson). Past the ▲ mark on the axial slider its walls wrinkle into square half-waves; the flanges, being wider, go first." },
    { id: "tension-torsion", title: "Combined tension and torsion", structure: "tube", loads: { axial: 0.6, torsion: 0.6 }, contour: "shear",
      hint: "Tension alone would stretch the patch along the span; torsion alone stretches it at 45°. Together the principal arrows in the inset settle at an angle in between." },
  ];

  /* State for a preset (a fresh default state with the preset applied). */
  function presetState(id) {
    const pr = PRESETS.find((p) => p.id === id);
    if (!pr) throw new Error(`unknown preset ${id}`);
    const st = defaultState(), model = buildModel(pr.structure);
    st.structure = pr.structure;
    Object.assign(st.loads, pr.loads);
    for (const k of ["exaggeration", "stringers", "frames", "warpingRestraint"]) if (pr[k] !== undefined) st[k] = pr[k];
    const p = { ...defaultPatch(pr.structure), ...(pr.patch && pr.patch.angle !== undefined ? { angle: pr.patch.angle } : {}) };
    if (pr.patch && pr.patch.along !== undefined) p.u = pr.patch.along * L;
    if (pr.patch && pr.patch.y !== undefined) { p.wall = 0; p.v = nearestV(model.walls[0].path, pr.patch.y, pr.patch.z); }
    st.patch = placePatch(model, p);
    return { state: st, contour: pr.contour || "none", view: pr.view || "default", hint: pr.hint, title: pr.title };
  }

  /* Effects in play for the legend: analytic or assumed. */
  function activeEffects(P) {
    const s = P.state, st = P.model.structure, out = [];
    const on = (k) => APPLIES[k].includes(st) && Math.abs(s.loads[k] || 0) > 0.005;
    if (on("axial")) out.push(["axial", "analytic"], ["poisson", "analytic"]);
    if (on("bending")) out.push(["bending", "analytic"]);
    if (on("shear")) out.push(["shear", "analytic"]);
    if (on("inplane")) out.push(["inplane", "analytic"]);
    if (on("torsion")) out.push(["torsion", "analytic"]);
    if (on("torsion") && st !== "tube") out.push(["warping", "analytic"]);
    if (on("bending") && st === "box") out.push(["shearlag", "assumed"]);
    if (bucklingState(P).some((b) => b.buckled)) out.push(["buckling", "assumed"]);
    return out.map(([id, basis]) => ({ id, basis }));
  }

  /* Deformed position of the member axis (the section origin) at x, with the
   * tangent angle of the bent axis: where the page anchors its load arrows. */
  function axisPoint(P, x) {
    if (P.model.structure === "panel") return [x * (1 + P.epsA), 0, 0, 0];
    const [X, Y, th] = P.curve(x + P.epsA * x);
    const y = P.gV * (P.model.walls[0].shear ? P.model.walls[0].shear.vp : 0) * x;
    return [X - y * Math.sin(th), Y + y * Math.cos(th), 0, th];
  }

  /* ---------- The unit patch ---------- */

  const PATCH = 0.5;                // side of the unit patch
  const PATCH_LINES = 5;            // 4 x 4 cells

  /* Patch start: mid-span on the face turned towards the default camera
   * (the +z side): low on the tube's near side, mid-height on the box's near
   * web and on the I-beam web. */
  function defaultPatch(structure) {
    const p = { wall: 0, u: L / 2, v: 0, side: 1, angle: 0 };
    if (structure === "tube") p.v = GEOM.tube.R * 0.35;
    else if (structure === "box") p.v = nearestV(boxPath(), 0, GEOM.box.B / 2);
    else if (structure === "ibeam") { p.wall = 1; p.v = GEOM.ibeam.H / 2; }
    else if (structure === "panel") { p.u = 0; p.v = GEOM.panel.B / 2 + 0.25; }
    return p;
  }
  function nearestV(path, y, z) {
    let best = 0, bd = Infinity;
    path.points.forEach((q, i) => { const d = Math.hypot(q.y - y, q.z - z); if (d < bd) { bd = d; best = path.s[i]; } });
    return best;
  }

  /* Faces the patch can sit on, in the order of the "around" slider. */
  function patchFaces(model) {
    if (model.structure === "ibeam") return [{ wall: 0, side: 1 }, { wall: 1, side: 1 }, { wall: 2, side: 1 }];
    return [{ wall: 0, side: 1 }];
  }

  /* The keyboard-operable patch sliders: along (0..1 of the span) and around
   * (0..1 through the faces of patchFaces, in order). */
  function patchFromSliders(model, along, around, angle) {
    const faces = patchFaces(model), lens = faces.map((f) => model.walls[f.wall].v1 - model.walls[f.wall].v0);
    let rest = clamp(around, 0, 1) * lens.reduce((a, b) => a + b, 0), k = 0;
    while (k < faces.length - 1 && rest > lens[k]) { rest -= lens[k]; k++; }
    const w = model.walls[faces[k].wall];
    return placePatch(model, { wall: w.id, side: faces[k].side, u: w.u0 + clamp(along, 0, 1) * (w.u1 - w.u0), v: w.v0 + rest, angle });
  }
  function slidersFromPatch(model, patch) {
    const faces = patchFaces(model), lens = faces.map((f) => model.walls[f.wall].v1 - model.walls[f.wall].v0);
    const total = lens.reduce((a, b) => a + b, 0), w = model.walls[patch.wall];
    let k = faces.findIndex((f) => f.wall === patch.wall && f.side === patch.side);
    if (k < 0) k = Math.max(0, faces.findIndex((f) => f.wall === patch.wall));
    const before = lens.slice(0, k).reduce((a, b) => a + b, 0);
    return { along: (patch.u - w.u0) / (w.u1 - w.u0), around: (before + patch.v - w.v0) / total, angle: patch.angle };
  }

  /* Keep the whole (rotated) patch on its wall. */
  function placePatch(model, patch) {
    const w = model.walls[patch.wall] || model.walls[0];
    const a = (patch.angle * Math.PI) / 180, half = (PATCH / 2) * (Math.abs(Math.cos(a)) + Math.abs(Math.sin(a)));
    const out = { wall: w.id, side: patch.side === -1 ? -1 : 1, angle: clamp(patch.angle, 0, 90) };
    out.u = clamp(patch.u, w.u0 + half + 0.05, w.u1 - half - 0.02);
    if (w.closed) out.v = ((patch.v % w.path.length) + w.path.length) % w.path.length;
    else out.v = w.v1 - w.v0 > 2 * half ? clamp(patch.v, w.v0 + half, w.v1 - half) : (w.v0 + w.v1) / 2;
    return out;
  }

  /* Viewer frame of the patch face: x along the member, s' = sigma * s, so that
   * seen from outside the face x points right and s' points up. */
  function faceSign(wall, patch) {
    const q = lookup(wall.path, patch.v);
    // e_x cross e_s = (0, -tz, ty); the face normal is side * (ny, nz)
    return Math.sign((-q.tz * q.ny + q.ty * q.nz) * patch.side) || 1;
  }

  /* Param-space polylines of the 4 x 4 grid: each is a list of [u, v]. */
  function patchParamLines(model, patch, samples = 12) {
    const w = model.walls[patch.wall], sg = faceSign(w, patch);
    const a = (patch.angle * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), h = PATCH / 2;
    const at = (xi, eta) => [patch.u + xi * c - eta * s, patch.v + sg * (xi * s + eta * c)];
    const lines = [];
    for (let k = 0; k < PATCH_LINES; k++) {
      const f = -h + (2 * h * k) / (PATCH_LINES - 1), l1 = [], l2 = [];
      for (let i = 0; i <= samples; i++) { const g = -h + (2 * h * i) / samples; l1.push(at(g, f)); l2.push(at(f, g)); }
      lines.push(l1, l2);
    }
    return lines;
  }

  /* 2 x 2 symmetric eigen-decomposition: values descending, angle of the first. */
  function eig2(a, b, d) {
    const m = (a + d) / 2, r = Math.hypot((a - d) / 2, b);
    const angle = 0.5 * Math.atan2(2 * b, a - d);
    return { values: [m + r, m - r], angle };
  }

  /* Membrane (mid-surface) strain under the patch centre: Green-Lagrange
   * strain from the deformation gradient in the viewer frame, then rotated
   * into the patch frame (a1 at the patch angle, a2 normal to it). */
  function patchStrain(P, patch) {
    const w = P.model.walls[patch.wall], sg = faceSign(w, patch), h = 1e-3;
    const at = (du, dv) => deform(P, w, patch.u + du, patch.v + dv, 0, { membrane: true });
    const Fu = sub3(at(h, 0), at(-h, 0)).map((x) => x / (2 * h));
    const Fs = sub3(at(0, sg * h), at(0, -sg * h)).map((x) => x / (2 * h));
    const C = [dot3(Fu, Fu), dot3(Fu, Fs), dot3(Fs, Fs)];
    const E = [(C[0] - 1) / 2, C[1] / 2, (C[2] - 1) / 2];
    const a = (patch.angle * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    const e11 = c * c * E[0] + 2 * c * s * E[1] + s * s * E[2];
    const e22 = s * s * E[0] - 2 * c * s * E[1] + c * c * E[2];
    const e12 = (c * c - s * s) * E[1] + c * s * (E[2] - E[0]);
    const pr = eig2(e11, e12, e22);
    // shear angle: decrease of the right angle between the patch edges
    const C11 = 1 + 2 * e11, C22 = 1 + 2 * e22, C12 = 2 * e12;
    const shearAngle = Math.PI / 2 - Math.acos(clamp(C12 / Math.sqrt(C11 * C22), -1, 1));
    return {
      axes: { exx: E[0], exs: E[1], ess: E[2] },
      patch: { e11, e22, e12 },
      principal: [{ value: pr.values[0], angle: pr.angle }, { value: pr.values[1], angle: pr.angle + Math.PI / 2 }],
      shearAngle,
      centre: deform(P, w, patch.u, patch.v, patch.side * w.t / 2),
    };
  }

  const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  return {
    PATCH, patchFaces, placePatch, patchFromSliders, slidersFromPatch, patchParamLines, patchStrain, eig2, faceSign, defaultPatch,
    PRESETS, presetState, activeEffects,
    L, NU, axisPoint, warping, fieldValue, plates, wrinkle, criticalLoads, bucklingState, GEOM, STRUCTURES, BEAMS, LOADS, APPLIES,
    buildModel, defaultState, prepare, reference, deform, lookup, sampleArray,
  };
});
