/* Verification set (spec section 10), shared by the in-app "Run verification"
 * panel and the Node test suite so both run exactly the same cases.
 *
 * Hand-calculation cases are in N-mm with uniform fasteners (ks = ka = 1).
 * Closed-form expectations use a 1e-9 relative tolerance; values the spec
 * quotes rounded use its stated absolute tolerance.
 */

import { examplePattern } from "./model.mjs";
import { solve } from "./solve.mjs";
import { solveScale } from "./interaction.mjs";
import { boltLoad, tStubPrying } from "./tension.mjs";
import { icrSolve, response } from "./icr.mjs";
import { fmt } from "./format.mjs";

export const VERIFICATION_SET = "M6 (v2)";
export const REL_TOL = 1e-9;

function pattern(points, load = {}) {
  const p = examplePattern("N-mm");
  p.name = "verification";
  p.fasteners = points.map(([x, y], i) => ({ id: `F${i + 1}`, label: "", x, y, overrides: {} }));
  p.plates = []; // hand cases test the group alone; plate checks have their own cases
  p.load = { appliedPlate: "P1", point: { x: 0, y: 0, z: 0 }, Fx: 0, Fy: 0, Fz: 0, Mx: 0, My: 0, Mz: 0, ...load };
  return p;
}

const RECT = [[50, 30], [50, -30], [-50, 30], [-50, -30]];
const circle = (n, r, start = 0) => Array.from({ length: n }, (_, i) => {
  const t = (start + 360 * i / n) * Math.PI / 180;
  return [r * Math.cos(t), r * Math.sin(t)];
});

/* A check passes when |actual − expected| ≤ abs, or ≤ rel·max(|expected|, scale). */
function check(label, actual, expected, { rel = REL_TOL, abs = 0, scale = 0 } = {}) {
  const err = Math.abs(actual - expected);
  const pass = Number.isFinite(actual) && (err <= abs || err <= rel * Math.max(Math.abs(expected), scale));
  return { label, actual, expected, tol: abs ? `±${abs}` : `${rel} rel`, pass };
}
const truth = (label, ok, detail = "") => ({ label, actual: detail, expected: "", tol: "", pass: !!ok });

const byId = (r, id) => r.fasteners.find((f) => f.id === id);
const at = (r, x, y) => r.fasteners.find((f) => Math.abs(f.x - x) < 1e-9 && Math.abs(f.y - y) < 1e-9);

function solved(p) {
  const r = solve(p);
  if (!r.ok) throw new Error(`solve failed: ${r.issues.filter((i) => i.tier === "error").map((i) => `${i.id} ${i.detail}`).join("; ")}`);
  return r;
}

export const HAND_CASES = [
  {
    id: "VC-01", title: "2×2 rectangle, Fy = −10 000 N at (150, 0, 0)",
    run() {
      const r = solved(pattern(RECT, { point: { x: 150, y: 0, z: 0 }, Fy: -10000 }));
      return [
        check("Cs.x", r.props.Cs.x, 0, { scale: 50 }), check("Cs.y", r.props.Cs.y, 0, { scale: 50 }),
        check("Ca.x", r.props.Ca.x, 0, { scale: 50 }), check("Ca.y", r.props.Ca.y, 0, { scale: 50 }),
        check("J", r.props.J, 13600),
        check("Mz,s", r.reduced.shear.Mz, -1.5e6),
        ...r.fasteners.map((f) => check(`Rdy ${f.id}`, f.shear.Rdy, -2500)),
        check("Rs at (50, 30)", at(r, 50, 30).shear.Rs, 8670.8, { abs: 0.1 }),
        check("Rs at (50, −30)", at(r, 50, -30).shear.Rs, 8670.8, { abs: 0.1 }),
        check("Rs at (−50, 30)", at(r, -50, 30).shear.Rs, 4476.2, { abs: 0.1 }),
        check("Rs at (−50, −30)", at(r, -50, -30).shear.Rs, 4476.2, { abs: 0.1 }),
        truth("equilibrium closure", r.closure.pass),
      ];
    },
  },
  {
    id: "VC-02", title: "L-shape (0, 0), (100, 0), (0, 100)",
    run() {
      const r = solved(pattern([[0, 0], [100, 0], [0, 100]]));
      const p = r.props;
      return [
        check("centroid x", p.Cs.x, 100 / 3), check("centroid y", p.Cs.y, 100 / 3),
        check("Ixx", p.Ixx, 20000 / 3), check("Iyy", p.Iyy, 20000 / 3), check("Ixy", p.Ixy, -10000 / 3),
        check("J", p.J, 40000 / 3),
        check("I1", p.principal.I1, 10000), check("I2", p.principal.I2, 10000 / 3),
        check("θp (°)", p.principal.thetaDeg, 45),
      ];
    },
  },
  {
    id: "VC-03", title: "6-fastener bolt circle, R = 50 mm, 60° spacing",
    run() {
      const r = solved(pattern(circle(6, 50)));
      const p = r.props;
      return [
        check("J", p.J, 15000), check("Ixx", p.Ixx, 7500), check("Iyy", p.Iyy, 7500),
        check("Ixy", p.Ixy, 0, { scale: 7500 }),
        check("centroid x", p.Cs.x, 0, { scale: 50 }), check("centroid y", p.Cs.y, 0, { scale: 50 }),
      ];
    },
  },
  {
    id: "VC-04", title: "VC-01 pattern, Mx,a = 12 000 N·mm",
    run() {
      const r = solved(pattern(RECT, { Mx: 12000 }));
      return [
        check("Mx,a", r.reduced.axial.Mx, 12000),
        ...r.fasteners.map((f) => check(`T ${f.id} (y = ${f.y})`, f.axial.T, f.y > 0 ? 100 : -100)),
      ];
    },
  },
  {
    id: "VC-05", title: "VC-01 pattern, My,a = 20 000 N·mm",
    run() {
      const r = solved(pattern(RECT, { My: 20000 }));
      return [
        check("My,a", r.reduced.axial.My, 20000),
        ...r.fasteners.map((f) => check(`T ${f.id} (x = ${f.x})`, f.axial.T, f.x > 0 ? -100 : 100)),
      ];
    },
  },
  {
    id: "VC-06", title: "VC-01 pattern, Fx = 1 000 N at (0, 0, zp = 50)",
    run() {
      const r = solved(pattern(RECT, { point: { x: 0, y: 0, z: 50 }, Fx: 1000 }));
      return [
        check("My,a", r.reduced.axial.My, 50000),
        ...r.fasteners.map((f) => check(`T ${f.id} (x = ${f.x})`, f.axial.T, f.x > 0 ? -250 : 250)),
      ];
    },
  },
  {
    id: "VC-07", title: "Interaction, Rs/Fs = 0.6, Rt/Ft = 0.5; a = b = 2 and a = b = 1",
    run() {
      // One fastener carrying Rs = 600 N and T = 500 N against Fs = Ft = 1000 N.
      const run = (a, b) => {
        const p = pattern([[0, 0]], { Fy: -600, Fz: 500 });
        p.defaults.shearAllowable = 1000;
        p.defaults.tensionAllowable = 1000;
        p.settings.interaction = { a, b };
        const r = solved(p);
        return { r, m: r.fasteners[0].checks.modes.find((x) => x.mode === "interaction") };
      };
      const e = run(2, 2), l = run(1, 1);
      const ids = (r) => r.issues.map((i) => i.id);
      return [
        check("IF(1), a = b = 2", e.m.IF1, 0.61),
        check("MS, a = b = 2 (exact 1/√0.61 − 1)", e.m.ms, 1 / Math.sqrt(0.61) - 1),
        check("MS, a = b = 2 (spec, ±5e-5)", e.m.ms, 0.2804, { abs: 5e-5 }),
        check("IF(k*) = 1", Math.pow(e.m.kStar * 0.6, 2) + Math.pow(e.m.kStar * 0.5, 2), 1),
        truth("W-006 raised for (2, 2)", ids(e.r).includes("W-006")),
        check("IF(1), a = b = 1", l.m.IF1, 1.1),
        check("MS, a = b = 1 (exact 1/1.1 − 1)", l.m.ms, 1 / 1.1 - 1),
        check("MS, a = b = 1 (spec, ±5e-5)", l.m.ms, -0.0909, { abs: 5e-5 }),
        check("MS = 1/IF − 1 when a = b = 1", l.m.ms, 1 / l.m.IF1 - 1),
        truth("no W-006 for (1, 1)", !ids(l.r).includes("W-006")),
        truth("critical fastener named with its mode", e.r.critical?.id === "F1" && e.r.critical.mode === "interaction"),
      ];
    },
  },
  {
    id: "VC-08", title: "Preload P_max = 20 000, P_min = 16 000, φ = 0.2; T_ext = 10 000 and 25 000",
    run() {
      // One fastener with external tension T = Fz, preload enabled.
      const at = (Fz) => {
        const p = pattern([[0, 0]], { Fz });
        p.settings.preload = { enabled: true };
        p.defaults.preload = { pMax: 20000, pMin: 16000, phi: 0.2 };
        const r = solved(p);
        return { r, t: r.fasteners[0].checks.tension, c: r.fasteners[0].checks.clamp };
      };
      const a = at(10000), b = at(25000);
      const ids = (r) => r.issues.map((i) => i.id);
      return [
        check("F_b at T = 10 000", a.t.Fb, 22000),
        check("clamp force at T = 10 000", a.t.preload.clamp, 8000),
        check("separation load", a.t.preload.separationLoad, 20000),
        truth("clamped at T = 10 000 (no W-013)", a.c.status === "clamped" && !ids(a.r).includes("W-013")),
        check("F_b at T = 25 000", b.t.Fb, 25000),
        truth("separated at T = 25 000 (W-013)", b.c.status === "separated" && ids(b.r).includes("W-013")),
        truth("N-005 with preload", ids(a.r).includes("N-005")),
      ];
    },
  },
  {
    id: "VB-01", title: "Bearing and tear-out, 2×2 at (±50, ±30), Fy = −10 000 N at Cs, two plates",
    run() {
      // Rs = 2 500 N on each fastener, pointing −y. D = 12, t = 10, Fbr = 300, Fsu = 200.
      const p = pattern(RECT, { Fy: -10000 });
      const plate = (id) => ({ id, thickness: 10, xMin: -80, xMax: 80, yMin: -50, yMax: 50, bearingAllowable: 300, bearingLoadAllowable: null, shearOutAllowable: 200, minEdgeRatio: null, flangeStrength: null });
      p.plates = [plate("P1"), plate("P2")];
      const r = solved(p);
      const f = at(r, 50, 30);
      const mode = (m, pl) => f.checks.modes.find((x) => x.mode === m && x.plate === pl);
      return [
        check("bearing capacity Fbr·D·t", mode("bearing", "P1").capacity, 36000),
        check("MS bearing = 36 000/2 500 − 1", mode("bearing", "P1").ms, 36000 / 2500 - 1),
        check("P1 (loaded) tear-out ray e: +y to yMax", mode("tearout", "P1").e, 20),
        check("P1 tear-out capacity 2·t·(e − D/2)·Fsu", mode("tearout", "P1").capacity, 2 * 10 * (20 - 6) * 200),
        check("P2 tear-out ray e: −y to yMin", mode("tearout", "P2").e, 80),
        check("P2 MS tear-out", mode("tearout", "P2").ms, (2 * 10 * (80 - 6) * 200) / 2500 - 1),
        truth("governing mode is P1 bearing", f.checks.governing.mode === "bearing" && f.checks.governing.plate === "P1"),
      ];
    },
  },
  {
    id: "VB-02", title: "Contact-edge method (b), 2×2 at (±50, ±30), edge y = −50, Mx = 12 000 N·mm",
    run() {
      const p = pattern(RECT, { Mx: 12000 });
      p.plates = [{ id: "P1", thickness: 10, xMin: -80, xMax: 80, yMin: -50, yMax: 50, bearingAllowable: null, bearingLoadAllowable: null, shearOutAllowable: null, minEdgeRatio: null, flangeStrength: null }];
      p.settings.axialMethod = "contact-edge";
      p.settings.contactEdge = { plateId: "P1", edge: "yMin" };
      const r = solved(p);
      const S = 2 * 80 ** 2 + 2 * 20 ** 2;
      return [
        check("Σ ka·d²", r.axial.S, S),
        check("T at y = +30 (d = 80)", at(r, 50, 30).axial.T, (12000 * 80) / S),
        check("T at y = −30 (d = 20)", at(r, -50, -30).axial.T, (12000 * 20) / S),
        check("contact reaction C = ΣT − Fz", r.axial.C, (2 * 12000 * 100) / S),
        truth("equilibrium closure", r.closure.pass),
      ];
    },
  },
  {
    id: "VI-01", title: "ICR, pure moment on a 6-bolt circle (R = 50): ICR at the centre, every bolt at Δmax",
    run() {
      const p = pattern(circle(6, 50), { Mz: 1e5 });
      icrOn(p);
      const r = solved(p);
      const Rmax = response("crawford-kulak", { icr: ICR_DEF }, ICR_DEF.deltaMax);
      return [
        check("γ_ult = 6·R(Δmax)·R / Mz", r.icr.gamma, (6 * Rmax * 50) / 1e5),
        check("ICR x", r.icr.icr.x, 0, { scale: 50 }), check("ICR y", r.icr.icr.y, 0, { scale: 50 }),
        ...r.icr.loads.map((l) => check(`Δ ${l.id}`, l.delta, ICR_DEF.deltaMax)),
        truth("N-004 raised (ks ignored)", r.issues.some((i) => i.id === "N-004")),
      ];
    },
  },
  {
    id: "VI-02", title: "ICR, concentric shear on the VC-01 pattern: uniform translation",
    run() {
      const p = pattern(RECT, { Fy: -1000 });
      icrOn(p);
      const r = solved(p);
      const Rmax = response("crawford-kulak", { icr: ICR_DEF }, ICR_DEF.deltaMax);
      return [
        truth("translation mode", r.icr.mode === "translation"),
        check("γ_ult = 4·R(Δmax)/|F|", r.icr.gamma, (4 * Rmax) / 1000),
        ...r.icr.atLoad.map((l) => check(`reaction at load ${l.id}`, l.Rs, 250)),
      ];
    },
  },
  {
    id: "VI-03", title: "ICR, eccentric VC-01 load: equilibrium at ultimate and the side of the ICR",
    run() {
      const p = pattern(RECT, { point: { x: 150, y: 0, z: 0 }, Fy: -10000 });
      icrOn(p);
      const r = solved(p);
      const sum = (k) => r.icr.loads.reduce((a, l) => a + l[k], 0);
      const M = r.icr.loads.reduce((a, l, i) => a + (RECT[i][0] - r.icr.icr.x) * l.Ry - (RECT[i][1] - r.icr.icr.y) * l.Rx, 0);
      const Pu = r.icr.Pu;
      return [
        check("ΣRx = 0 at ultimate", sum("Rx"), 0, { abs: 1e-6 * Pu }),
        check("ΣRy = −P_u", sum("Ry"), -Pu, { rel: 1e-6 }),
        check("ΣM about ICR = P_u × lever", M, -Pu * (150 - r.icr.icr.x), { rel: 1e-6 }),
        truth("ICR on the side opposite the load line (x < 0)", r.icr.icr.x < 0 && Math.abs(r.icr.icr.y) < 1e-9),
        check("reactions at load = ultimate / γ", r.icr.atLoad[0].Rs, r.icr.loads[0].R / r.icr.gamma),
        truth("the most distant bolts govern", ["F1", "F2"].includes(r.icr.governing)),
      ];
    },
  },
  {
    id: "VC-09", title: "Circle group, pure Mz",
    run() {
      const N = 8, R = 60, Mz = 48000;
      const r = solved(pattern(circle(N, R, 10), { Mz }));
      const expected = Mz / (N * R);
      return r.fasteners.flatMap((f) => {
        const tangent = Math.atan2(f.y, f.x) + Math.PI / 2;
        const along = f.shear.Rx * Math.cos(tangent) + f.shear.Ry * Math.sin(tangent);
        return [check(`tangential ${f.id}`, along, expected), check(`magnitude ${f.id}`, f.shear.Rs, expected)];
      });
    },
  },
];

/* ---- Property tests ---- */

const ASYM = [[0, 0], [120, 10], [30, 80], [-40, 55], [75, -35]];
const ASYM_LOAD = { point: { x: 210, y: -40, z: 35 }, Fx: 1800, Fy: -5200, Fz: 2600, Mx: 41000, My: -23000, Mz: 150000 };
const withOverrides = (p) => {
  p.fasteners[1].overrides = { ks: 2.5, ka: 0.6 };
  p.fasteners[3].overrides = { ks: 0.7, ka: 1.8, area: 200 };
  return p;
};
const base = () => withOverrides(pattern(ASYM, ASYM_LOAD));
const scaleOf = (r) => Math.max(...r.fasteners.map((f) => Math.max(f.shear.Rs, Math.abs(f.axial.T))));

function transform(p, fn, { rotateLoad = null, mirrorLoad = null } = {}) {
  const q = JSON.parse(JSON.stringify(p));
  q.fasteners.forEach((f) => Object.assign(f, fn(f.x, f.y)));
  const P = q.load.point;
  Object.assign(P, fn(P.x, P.y));
  if (rotateLoad) Object.assign(q.load, rotateLoad(q.load));
  if (mirrorLoad) Object.assign(q.load, mirrorLoad(q.load));
  return q;
}

export const PROPERTY_CASES = [
  {
    id: "P-01", title: "Translation invariance",
    run() {
      const p = base();
      const a = solved(p), b = solved(transform(p, (x, y) => ({ x: x + 1234.5, y: y - 678.25 })));
      const S = scaleOf(a);
      return a.fasteners.flatMap((f, i) => [
        check(`Rx ${f.id}`, b.fasteners[i].shear.Rx, f.shear.Rx, { scale: S }),
        check(`Ry ${f.id}`, b.fasteners[i].shear.Ry, f.shear.Ry, { scale: S }),
        check(`T ${f.id}`, b.fasteners[i].axial.T, f.axial.T, { scale: S }),
      ]);
    },
  },
  {
    id: "P-02", title: "Rotation invariance (37° about the origin)",
    run() {
      const t = 37 * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
      const rot = (x, y) => ({ x: c * x - s * y, y: s * x + c * y });
      const p = base();
      const q = transform(p, rot, {
        rotateLoad: (L) => {
          const F = rot(L.Fx, L.Fy), M = rot(L.Mx, L.My);
          return { Fx: F.x, Fy: F.y, Mx: M.x, My: M.y };
        },
      });
      const a = solved(p), b = solved(q);
      const S = scaleOf(a);
      return a.fasteners.flatMap((f, i) => {
        const g = b.fasteners[i], R = rot(f.shear.Rx, f.shear.Ry);
        return [
          check(`|R| ${f.id}`, g.shear.Rs, f.shear.Rs, { scale: S }),
          check(`Rx rotated ${f.id}`, g.shear.Rx, R.x, { scale: S }),
          check(`Ry rotated ${f.id}`, g.shear.Ry, R.y, { scale: S }),
          check(`T ${f.id}`, g.axial.T, f.axial.T, { scale: S }),
        ];
      });
    },
  },
  {
    id: "P-03", title: "Mirror symmetry about x = 0",
    run() {
      const p = pattern([[40, 20], [-40, 20], [70, -30], [-70, -30]], { point: { x: 0, y: 90, z: 20 }, Fy: -3000, Fz: 1500, Mx: 25000 });
      const r = solved(p);
      const S = scaleOf(r);
      const pairs = [["F1", "F2"], ["F3", "F4"]];
      return pairs.flatMap(([a, b]) => {
        const A = byId(r, a), B = byId(r, b);
        return [
          check(`Rx ${a} = −Rx ${b}`, A.shear.Rx, -B.shear.Rx, { scale: S }),
          check(`Ry ${a} = Ry ${b}`, A.shear.Ry, B.shear.Ry, { scale: S }),
          check(`T ${a} = T ${b}`, A.axial.T, B.axial.T, { scale: S }),
        ];
      });
    },
  },
  {
    id: "P-04", title: "Linear scaling (doubling the load doubles elastic results)",
    run() {
      const p = base();
      const q = JSON.parse(JSON.stringify(p));
      for (const k of ["Fx", "Fy", "Fz", "Mx", "My", "Mz"]) q.load[k] *= 2;
      const a = solved(p), b = solved(q);
      const S = 2 * scaleOf(a);
      return a.fasteners.flatMap((f, i) => [
        check(`Rs ${f.id}`, b.fasteners[i].shear.Rs, 2 * f.shear.Rs, { scale: S }),
        check(`T ${f.id}`, b.fasteners[i].axial.T, 2 * f.axial.T, { scale: S }),
      ]);
    },
  },
  {
    id: "P-05", title: "Equilibrium closure (asymmetric, weighted, full 3D load)",
    run() {
      const r = solved(base());
      return r.closure.checks.map((c) => truth(c.name, c.pass, `relative residual ${c.relative.toExponential(2)}`));
    },
  },
  {
    id: "P-06", title: "Sign convention (VC-04 to VC-06)",
    run() {
      const cases = HAND_CASES.filter((c) => ["VC-04", "VC-05", "VC-06"].includes(c.id));
      return cases.map((c) => truth(c.id, c.run().every((x) => x.pass)));
    },
  },
];

const withAllowables = (p, Fs, Ft, a, b) => {
  p.defaults.shearAllowable = Fs;
  p.defaults.tensionAllowable = Ft;
  p.settings.interaction = { a, b };
  return p;
};
const interactionOf = (f) => f.checks.modes.find((m) => m.mode === "interaction");

PROPERTY_CASES.push(
  {
    id: "P-07", title: "Load scaling: k* at λ × load is k* / λ (no preload)",
    run() {
      const lam = 2.5;
      const p = withAllowables(base(), 9000, 12000, 2.3, 1.7);
      const q = JSON.parse(JSON.stringify(p));
      for (const k of ["Fx", "Fy", "Fz", "Mx", "My", "Mz"]) q.load[k] *= lam;
      const a = solved(p), b = solved(q);
      return a.fasteners.map((f, i) => check(`k* ${f.id}`, interactionOf(b.fasteners[i]).kStar, interactionOf(f).kStar / lam));
    },
  },
  {
    id: "P-08", title: "Exact-k solution satisfies IF(k*) = 1 for unequal exponents",
    run() {
      const cases = [[2, 2], [1, 1], [3, 1.5], [1.2, 2.8], [0.8, 2]];
      return cases.flatMap(([a, b]) => {
        const Rs = 700, Rt = 450, Fs = 1000, Ft = 900;
        const s = solveScale({ Rs, tensionAt: (k) => k * Rt, Fs, Ft, a, b });
        const at = Math.pow(s.kStar * Rs / Fs, a) + Math.pow(s.kStar * Rt / Ft, b);
        return [check(`IF(k*) (a = ${a}, b = ${b})`, at, 1), truth(`status ok (a = ${a}, b = ${b})`, s.status === "ok")];
      });
    },
  },
  {
    id: "P-09", title: "Governing MS and critical fastener",
    run() {
      const p = withAllowables(base(), 9000, 12000, 2, 2);
      const r = solved(p);
      const min = Math.min(...r.fasteners.map((f) => f.checks.governing.ms));
      return [
        check("critical MS is the lowest governing MS", r.critical.ms, min),
        truth("critical fastener has that MS", r.fasteners.find((f) => f.id === r.critical.id).checks.governing.ms === min),
        truth("no margin without allowables", solved(base()).fasteners.every((f) => f.checks.governing === null && f.checks.modes[0].status === "not-evaluated")),
      ];
    },
  },
);

/* ICR defaults: the spec's metric structural-bolt curve with Rult = 1 000 N. */
const ICR_DEF = { rult: 1000, mu: 0.3937, lambda: 0.55, deltaMax: 8.6, deltaY: null };
function icrOn(p, model = "crawford-kulak") {
  p.settings.icr = { enabled: true, model };
  p.defaults.icr = { ...ICR_DEF };
  return p;
}

PROPERTY_CASES.push(
  {
    id: "P-13", title: "ICR ignores ks: overriding ks moves Cs but not γ_ult or the ICR; the search is anchored on the Rult-weighted centroid",
    run() {
      const a = solved(icrOn(pattern(RECT, { point: { x: 150, y: 0, z: 0 }, Fy: -10000 })));
      const q = icrOn(pattern(RECT, { point: { x: 150, y: 0, z: 0 }, Fy: -10000 }));
      q.fasteners[0].overrides = { ks: 3 };
      q.fasteners[3].overrides = { ks: 0.4 };
      const b = solved(q);
      return [
        truth("Cs moved (ks still acts on the elastic side)", Math.hypot(b.props.Cs.x - a.props.Cs.x, b.props.Cs.y - a.props.Cs.y) > 1e-6),
        check("γ_ult unchanged", b.icr.gamma, a.icr.gamma, { rel: 1e-6 }),
        check("ICR x unchanged", b.icr.icr.x, a.icr.icr.x, { abs: 1e-6 * 50 }),
        check("ICR y unchanged", b.icr.icr.y, a.icr.icr.y, { abs: 1e-6 * 50 }),
        // Loads between the geometric centre and the moved Cs, including one through Cs.
        ...[[b.props.Cs.x, 3.1732], [20, 3.3067], [10, 3.6504], [5, 3.8130]].flatMap(([x, gamma]) => {
          const at = (ks) => {
            const r = icrOn(pattern(RECT, { point: { x, y: 0, z: 0 }, Fy: -1000 }));
            if (ks) { r.fasteners[0].overrides = { ks: 3 }; r.fasteners[3].overrides = { ks: 0.4 }; }
            return solved(r).icr;
          };
          const withKs = at(true);
          return [
            truth(`load at x = ${fmt(x)}: converged, not a translation`, withKs.status === "converged" && withKs.mode === "eccentric"),
            check(`γ_ult at x = ${fmt(x)}, ks overridden vs uniform`, withKs.gamma, at(false).gamma, { rel: 1e-6 }),
            check(`γ_ult at x = ${fmt(x)}`, withKs.gamma, gamma, { rel: 1e-4 }),
          ];
        }),
        ...rultAnchor(),
      ];
    },
  },
  {
    id: "P-14", title: "ICR: rotation invariance and load-magnitude scaling of γ_ult",
    run() {
      const pts = [[0, 0], [90, 10], [20, 70], [-50, 40], [60, -40]];
      const base = icrSolve(pts.map(([x, y], i) => ({ id: `F${i}`, x, y, icr: ICR_DEF })), centroidOf(pts), { Fx: 800, Fy: -3000, Mz: 2.1e5 });
      const t = 0.7, c = Math.cos(t), s = Math.sin(t);
      const rp = pts.map(([x, y]) => [c * x - s * y, s * x + c * y]);
      const rot = icrSolve(rp.map(([x, y], i) => ({ id: `F${i}`, x, y, icr: ICR_DEF })), centroidOf(rp), { Fx: c * 800 + s * 3000, Fy: s * 800 - c * 3000, Mz: 2.1e5 });
      const big = icrSolve(pts.map(([x, y], i) => ({ id: `F${i}`, x, y, icr: ICR_DEF })), centroidOf(pts), { Fx: 1600, Fy: -6000, Mz: 4.2e5 });
      return [
        truth("asymmetric case converged", base.status === "converged"),
        check("γ rotated", rot.gamma, base.gamma, { rel: 1e-6 }),
        check("γ at 2× load = γ / 2", big.gamma, base.gamma / 2, { rel: 1e-6 }),
      ];
    },
  },
);

/* Per-fastener Rult moves the ICR reference to (0, −10): translation only through it, γ_ult continuous beside it. */
function rultAnchor() {
  const at = (x, Mz = 0) => {
    const p = icrOn(pattern(RECT, { point: { x, y: 0, z: 0 }, Fy: -1000, Mz }));
    p.fasteners[1].overrides = { icr: { rult: 2000 } };
    p.fasteners[3].overrides = { icr: { rult: 2000 } };
    return solved(p).icr;
  };
  const through = at(0), tiny = at(0, 1), x5 = at(5), x10 = at(10);
  return [
    truth("load through the reference: uniform translation", through.mode === "translation"),
    truth("Mz = 1 beside it: eccentric", tiny.mode === "eccentric"),
    check("γ_ult continuous across the translation", tiny.gamma, through.gamma, { rel: 1e-5 }),
    truth("loads at x = 5 and 10 converge", x5.status === "converged" && x10.status === "converged"),
    check("γ_ult at x = 5", x5.gamma, 5.7006, { rel: 1e-4 }),
    check("γ_ult at x = 10", x10.gamma, 5.4356, { rel: 1e-4 }),
  ];
}

function centroidOf(pts) {
  return { x: pts.reduce((a, p) => a + p[0], 0) / pts.length, y: pts.reduce((a, p) => a + p[1], 0) / pts.length };
}

const TSTUB = { B: 40000, b: 40, a: 35, p: 80, dh: 14, D: 12, t: 12, Fp: 250 };

PROPERTY_CASES.push(
  {
    id: "P-10", title: "Preload bolt load is continuous through separation and does not scale with k",
    run() {
      const pre = { pMax: 20000, pMin: 16000, phi: 0.2 };
      const Tsep = pre.pMax / (1 - pre.phi); // where the two branches of max(…) meet
      const off = { kind: "off" };
      const below = boltLoad(Tsep * (1 - 1e-12), off, pre).Fb, above = boltLoad(Tsep * (1 + 1e-12), off, pre).Fb;
      const Rs = 3000, Text = 8000, Fs = 10000, Ft = 30000;
      const tensionAt = (k) => boltLoad(k * Text, off, pre).Fb;
      const s = solveScale({ Rs, tensionAt, Fs, Ft, a: 2, b: 2 });
      const scaled = solveScale({ Rs, tensionAt: (k) => k * tensionAt(1), Fs, Ft, a: 2, b: 2 });
      return [
        check("F_b continuous at P_max/(1 − φ)", below, above, { rel: 1e-9 }),
        check("IF(0) = (P_max/Ft)²", s.IF0, (pre.pMax / Ft) ** 2),
        check("IF(k*) = 1 through the preload chain", (s.kStar * Rs / Fs) ** 2 + (tensionAt(s.kStar) / Ft) ** 2, 1),
        truth("preload not scaled: k* differs from scaling F_b", Math.abs(s.kStar - scaled.kStar) > 1e-6),
      ];
    },
  },
  {
    id: "P-11", title: "T-stub prying: Q = 0 below the threshold, grows with T, capped at α' = 1",
    run() {
      const probe = (T) => tStubPrying(T, TSTUB);
      const q = probe(1);
      const threshold = TSTUB.B * (q.t / q.tc) ** 2; // α' = 0 at T = B·(t/t_c)²
      const Ts = [0.5, 0.9, 1.1, 1.5, 3].map((m) => m * threshold);
      const Qs = Ts.map((T) => probe(T).Q);
      const capT = TSTUB.B * (1 + q.delta) * (q.t / q.tc) ** 2; // α' reaches 1
      return [
        check("Q = 0 below threshold", Qs[0] + Qs[1], 0, { abs: 1e-12 }),
        truth("Q > 0 above threshold", Qs[2] > 0),
        truth("Q non-decreasing in T", Qs.every((x, i) => i === 0 || x >= Qs[i - 1])),
        check("Q at α' = 1 equals B·δ·ρ·(t/t_c)²", probe(capT * 2).Q, TSTUB.B * q.delta * q.rho * (q.t / q.tc) ** 2),
        check("a limited to 1.25·b", tStubPrying(1, { ...TSTUB, a: 100 }).aUsed, 1.25 * TSTUB.b),
      ];
    },
  },
  {
    id: "P-12", title: "Manual prying factor: bolt tension = factor × T",
    run() {
      const r = boltLoad(5000, { kind: "manual", factor: 1.3 }, null);
      return [check("F_b", r.Fb, 6500), check("Q", r.Q, 1500)];
    },
  },
);

/* Published-reference cases (spec 10.2). The current AISC Manual is not
 * used: these cases are keyed to openly readable sources instead, listed in
 * REFERENCES and cited in the panel, the reports and the README.
 *
 *   [Guide] Kulak, Fisher and Struik, Guide to Design Criteria for Bolted and
 *           Riveted Joints, 2nd ed. (Wiley 1987; RCSC 2001).
 *   [Brandt] Brandt, "Rapid Determination of Ultimate Strength of
 *           Eccentrically Loaded Bolt Groups", AISC Engineering Journal,
 *           Second Quarter 1982, pp. 94-100.
 *
 * Both use the Crawford-Kulak curve R = Rult·(1 − e^(−10Δ))^0.55 with
 * Δmax = 0.34 in [Brandt, Background; Guide 13.5.2]; the cases key those
 * constants in N-mm (μ = 10/25.4 per mm, Δmax = 0.34·25.4 mm), so the
 * coefficients C = P_u/Rult are dimensionless and exact to the source.
 * Not checked: the current AISC Manual's tables, and its prying procedure
 * with resistance factors.
 */
export const REFERENCES = [
  "Kulak, G. L., Fisher, J. W. and Struik, J. H. A., Guide to Design Criteria for Bolted and Riveted Joints, 2nd ed., Wiley, 1987; republished by the Research Council on Structural Connections, 2001. Table 13.1 (eccentric-load coefficients C, reprinted from the AISC Manual of Steel Construction, 8th ed., 1980), Eq. 13.12, and Eqs. 17.8 to 17.12 and 17.17 to 17.18 with section 17.6.",
  "Brandt, G. D., Rapid Determination of Ultimate Strength of Eccentrically Loaded Bolt Groups, Engineering Journal, AISC, Second Quarter 1982, pp. 94-100. Examples 1 and 2.",
];

/* The scope statement every report repeats beside REFERENCES. */
export const REFERENCE_SCOPE = "Published-reference cases VR-01 to VR-03 are keyed to the sources below, not to the current AISC Manual: the ICR coefficients have not been checked against the current AISC Manual's tables, and the T-stub prying equations were checked for form and constants only (the Guide gives no numerical worked example).";

const IN = 25.4; // mm per inch
const CK = { rult: 1000, mu: 10 / IN, lambda: 0.55, deltaMax: 0.34 * IN, deltaY: null };

/* ICR coefficient C = P_u/Rult through the full solve, for points and load point in inches (keyed in mm). */
function coefficient(points, Fx, Fy, at) {
  const p = pattern(points.map(([x, y]) => [x * IN, y * IN]), { point: { x: at[0] * IN, y: at[1] * IN, z: 0 }, Fx, Fy });
  p.settings.icr = { enabled: true, model: "crawford-kulak" };
  p.defaults.icr = { ...CK };
  const r = solved(p);
  return { r, C: (r.icr.gamma * Math.hypot(Fx, Fy)) / CK.rult };
}

/* [Guide] Table 13.1, block b = 3 in: one vertical row of n bolts at pitch b, load parallel to the row at lever l (in). */
const TABLE_13_1 = {
  3: [0.88, 1.75, 2.81, 3.90, 4.98, 6.06, 7.12, 8.17, 9.20, 10.2, 11.3],
  4: [0.69, 1.40, 2.36, 3.40, 4.47, 5.56, 6.64, 7.72, 8.78, 9.84, 10.9],
  5: [0.56, 1.15, 2.01, 2.95, 3.98, 5.05, 6.13, 7.22, 8.30, 9.38, 10.4],
  6: [0.48, 0.97, 1.73, 2.58, 3.55, 4.57, 5.63, 6.70, 7.79, 8.87, 9.96],
  7: [0.41, 0.83, 1.51, 2.28, 3.17, 4.13, 5.15, 6.20, 7.27, 8.36, 9.44],
  8: [0.36, 0.73, 1.34, 2.04, 2.85, 3.75, 4.72, 5.73, 6.78, 7.85, 8.93],
  9: [0.32, 0.65, 1.21, 1.83, 2.59, 3.42, 4.34, 5.31, 6.32, 7.36, 8.42],
  10: [0.29, 0.59, 1.09, 1.66, 2.36, 3.14, 4.00, 4.92, 5.89, 6.90, 7.94],
  12: [0.24, 0.49, 0.92, 1.40, 2.00, 2.68, 3.44, 4.27, 5.15, 6.09, 7.06],
  16: [0.18, 0.37, 0.70, 1.06, 1.53, 2.06, 2.67, 3.33, 4.06, 4.85, 5.68],
  20: [0.15, 0.29, 0.56, 0.85, 1.24, 1.67, 2.16, 2.72, 3.33, 3.99, 4.70],
  24: [0.12, 0.25, 0.47, 0.71, 1.03, 1.40, 1.82, 2.29, 2.81, 3.37, 3.99],
  30: [0.10, 0.20, 0.37, 0.57, 0.83, 1.12, 1.46, 1.84, 2.27, 2.73, 3.24],
  36: [0.08, 0.16, 0.31, 0.48, 0.69, 0.94, 1.22, 1.54, 1.90, 2.29, 2.72],
};
/* 2%, or half a unit in the table's last printed digit where that is larger (small C). */
const tableTol = (C) => Math.max(0.02 * C, C >= 10 ? 0.05 : 0.005);
const row = (n, pitch) => Array.from({ length: n }, (_, i) => [0, ((n - 1) / 2 - i) * pitch]);

/* [Guide] 17.5-17.6 prying, written in the Guide's own form with modified a', b'. */
function guidePrying(T, { b, a, p: w, dh, D: d, t, Fp: sy }) {
  const aP = Math.min(a, 1.25 * b) + d / 2, bP = b - d / 2; // 17.6: a ≤ 1.25b; a' = a + d/2, b' = b − d/2
  const delta = 1 - dh / w; // net / gross flange area at the bolt line
  const M = (w * t * t * sy) / 4; // Eq. 17.9
  const alpha = Math.min(((T * bP) / M - 1) / delta, 1); // Eq. 17.8 with b'; "if α ≥ 1.0, it is taken as 1.0"
  const Q = (alpha * delta * M) / aP; // Eq. 17.10 with a'
  return { aP, bP, delta, M, alpha, Q, B: T + Q, B1711: T * (1 + (delta * alpha * bP) / ((1 + delta * alpha) * aP)) };
}
const PRY = { b: 1.5, a: 1.5, p: 3.5, dh: 0.8125, D: 0.75, t: 0.6, Fp: 36 }; // in, ksi: ¾-in. bolts

export const REFERENCE_CASES = [
  {
    id: "VR-01", title: "T-stub prying against the Struik–de Back equations in the Kulak–Fisher–Struik Guide (Eqs. 17.8 to 17.12, 17.18), modified a' and b'",
    run() {
      // The Guide gives the equations but no numerical worked example, so this
      // confirms the equation form and constants, not published numbers.
      const g0 = guidePrying(1, PRY);
      const onset = g0.M / g0.bP, full = (g0.M * (1 + g0.delta)) / g0.bP; // α = 0 and α = 1
      const cases = [[0.25, PRY], [0.5, PRY], [0.8, PRY], [1.5, PRY], [0.6, { ...PRY, a: 3 }]];
      return [
        ...cases.flatMap(([f, geo]) => {
          const T = onset + f * (full - onset);
          const g = guidePrying(T, geo);
          const tool = tStubPrying(T, { ...geo, B: 30 });
          const tag = `T = ${fmt(T, 4)} kip${geo.a !== PRY.a ? `, a = ${geo.a} in (> 1.25·b)` : ""}`;
          const out = [
            check(`α, ${tag}`, tool.alpha, g.alpha),
            check(`Q (Eq. 17.10), ${tag}`, tool.Q, g.Q),
            check(`bolt force T + Q (Eq. 17.10a), ${tag}`, T + tool.Q, g.B),
          ];
          if (g.alpha < 1) {
            out.push(check(`bolt force, Eq. 17.11 form, ${tag}`, T + tool.Q, g.B1711));
            // Eq. 17.18: at the bolt force B = T + Q the required flange thickness is the keyed t.
            out.push(check(`t from Eq. 17.18 at B = T + Q, ${tag}`, Math.sqrt((4 * g.B * g.aP * g.bP) / (geo.p * geo.Fp * (g.aP + g.alpha * g.delta * (g.aP + g.bP)))), geo.t));
          }
          return out;
        }),
        check("a limited to 1.25·b (17.6)", tStubPrying(1, { ...PRY, a: 3, B: 30 }).aUsed, 1.25 * PRY.b),
        truth("Q independent of the keyed bolt reference B", Math.abs(tStubPrying(0.5 * (onset + full), { ...PRY, B: 30 }).Q - tStubPrying(0.5 * (onset + full), { ...PRY, B: 90 }).Q) < 1e-12),
      ];
    },
  },
  {
    id: "VR-02", title: "ICR coefficients C against Table 13.1 of the Kulak–Fisher–Struik Guide (AISC 8th ed., 1980), b = 3 in, 2% or table rounding",
    run() {
      return Object.entries(TABLE_13_1).flatMap(([l, Cs]) => Cs.map((C, j) => {
        const n = j + 2;
        const { C: tool } = coefficient(row(n, 3), 0, -1000, [Number(l), 0]);
        return check(`C, n = ${n}, l = ${l} in`, tool, C, { abs: tableTol(C) });
      }));
    },
  },
  {
    id: "VR-03", title: "ICR side convention and coefficient against Brandt (1982) Examples 1 and 2",
    run() {
      // Example 1: three bolts at 3-in. pitch on x = 0, unit load −y at x = +4 in; C_u = 1.40.
      const e1 = coefficient(row(3, 3), 0, -1000, [4, 0]);
      const i1 = e1.r.icr;
      const r0 = -i1.icr.x / IN, sumRR = i1.loads.reduce((a, l) => a + (l.rho / IN) * (l.R / CK.rult), 0);
      // Example 2: two columns x = ±3, rows y = −3, 0, 3 (Brandt's bolts 1 to 6); load (0.6, −0.8) through (20, 5) in; C_u = 1.10.
      const pts = [[-3, -3], [-3, 0], [-3, 3], [3, -3], [3, 0], [3, 3]];
      const e2 = coefficient(pts, 600, -800, [20, 5]);
      const i2 = e2.r.icr;
      const momentAbout = (O) => ((20 * IN - O.x) * -800 - (5 * IN - O.y) * 600) / IN; // N·in, unit load ×1000
      const M0 = momentAbout({ x: 0, y: 0 }), Mi = momentAbout(i2.icr);
      return [
        check("Ex. 1: C_u (Brandt 1.40)", e1.C, 1.40, { rel: 0.02 }),
        truth("Ex. 1: ICR on the bolt line's far side from the load (x < 0, y = 0)", i1.icr.x < 0 && Math.abs(i1.icr.y) < 1e-6 * IN, `ICR x = ${fmt(i1.icr.x / IN, 3)} in`),
        truth("Ex. 1: end bolts at Δmax = 0.34 in, middle bolt below it", Math.abs(i1.loads[0].delta - CK.deltaMax) < 1e-9 && Math.abs(i1.loads[2].delta - CK.deltaMax) < 1e-9 && i1.loads[1].delta < CK.deltaMax),
        check("Ex. 1: Guide Eq. 13.12, P_u·(e + r0) = Σ r_i·R_i", e1.C * (4 + r0), sumRR, { rel: 1e-6 }),
        check("Ex. 2: C_u (Brandt 1.10)", e2.C, 1.10, { rel: 0.02 }),
        truth("Ex. 2: bolt 6 at (3, 3) governs, as in Brandt's Tables 2.1 and 2.2", i2.governing === "F6"),
        truth("Ex. 2: ICR on the centroid's far side from the load line (moment arm grows: |M about ICR| > |M about centroid|, same sign)", Math.sign(Mi) === Math.sign(M0) && Math.abs(Mi) > Math.abs(M0), `M about centroid ${fmt(M0 / 1000, 3)}, about ICR ${fmt(Mi / 1000, 3)} (Brandt: −19 and −20.136 at his last trial centre)`),
      ];
    },
  },
];

// Cases are declared milestone by milestone; list them in id order.
const idOrder = (a, b) => a.id.localeCompare(b.id, "en", { numeric: true });
PROPERTY_CASES.sort(idOrder);
REFERENCE_CASES.sort(idOrder);

export const ALL_CASES = [...HAND_CASES, ...PROPERTY_CASES, ...REFERENCE_CASES];

/* Run every case; a case that throws fails with the message. The set
 * passes when every case passes. */
export function runVerification(cases = ALL_CASES) {
  const results = cases.map((c) => {
    try {
      const checks = c.run();
      const pass = checks.length > 0 && checks.every((x) => x.pass);
      return { id: c.id, title: c.title, checks, status: pass ? "pass" : "fail", pass };
    } catch (e) {
      return { id: c.id, title: c.title, checks: [], status: "fail", pass: false, error: e.message };
    }
  });
  const passed = results.filter((r) => r.pass).length;
  return { set: VERIFICATION_SET, tol: REL_TOL, results, passed, failed: results.length - passed, pass: passed === results.length, scope: REFERENCE_SCOPE, references: REFERENCES };
}
