import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const D = require("../kinematics.js");
const { buildPage } = await import("../build.mjs");
const INDEX = new URL("../index.html", import.meta.url);

const state = (structure, loads = {}, extra = {}) => {
  const s = D.defaultState();
  s.structure = structure;
  Object.assign(s.loads, loads);
  return Object.assign(s, extra);
};
const sub = (a, b) => a.map((x, i) => x - b[i]);
const norm = (a) => Math.hypot(...a);

/* Displacement of the wall point (u, v, zeta) under `st`. */
function displacement(model, st, wall, u, v, zeta = 0) {
  const P = D.prepare(model, st), w = model.walls[wall];
  const r = D.reference(w, u, v, zeta);
  return sub(D.deform(P, w, u, v, zeta), [r.x, r.y, r.z]);
}

test("no load leaves every structure undeformed", () => {
  for (const s of D.STRUCTURES) {
    const m = D.buildModel(s);
    for (const w of m.walls) for (const [u, f] of [[0, 0], [3, 0.3], [6, 0.9]]) {
      const d = displacement(m, state(s), w.id, u, w.v0 + f * (w.v1 - w.v0), w.t / 2);
      assert.ok(norm(d) < 1e-9, `${s} ${w.name}: ${d}`);
    }
  }
});

test("the clamped end does not move under bending and torsion with warping restrained", () => {
  for (const s of D.STRUCTURES) {
    const m = D.buildModel(s);
    for (const w of m.walls) {
      const d = displacement(m, state(s, { bending: 1, torsion: 1 }, { warpingRestraint: true }), w.id, 0, w.v0 + 0.3 * (w.v1 - w.v0));
      assert.ok(norm(d) < 1e-9, `${s} ${w.name}: ${d}`);
    }
  }
});

test("tube torsion is a helical twist with negligible axial movement", () => {
  const m = D.buildModel("tube"), st = state("tube", { torsion: 1 });
  for (const v of [0, 0.7, 1.9, 3.1]) {
    const d = displacement(m, st, 0, 4, v, D.GEOM.tube.t / 2);
    const lateral = Math.hypot(d[1], d[2]);
    assert.ok(lateral > 0.1, `twist moves the skin sideways (${lateral})`);
    assert.ok(Math.abs(d[0]) < 1e-3 * lateral, `axial ${d[0]} vs lateral ${lateral}`);
  }
});

test("axial tension stretches and thins; compression shortens and swells (Poisson)", () => {
  const m = D.buildModel("tube"), R = D.GEOM.tube.R;
  const radius = (loads) => { const P = D.prepare(m, state("tube", loads)); const p = D.deform(P, m.walls[0], 3, 0, 0); return Math.hypot(p[1], p[2]); };
  const tip = (loads) => D.deform(D.prepare(m, state("tube", loads)), m.walls[0], 6, 0, 0)[0];
  assert.ok(tip({ axial: 1 }) > 6 && tip({ axial: -1 }) < 6);
  assert.ok(radius({ axial: 1 }) < R && radius({ axial: -1 }) > R);
});

test("bending keeps plane sections plane and bends the tip the right way", () => {
  // the tube: the box adds shear lag, which is exactly a departure from plane sections
  const m = D.buildModel("tube"), P = D.prepare(m, state("tube", { bending: 1 }));
  const tip = D.axisPoint(P, 6);
  assert.ok(tip[1] > 0.3, "tip up");
  // points of one section stay on a line normal to the bent axis
  const w = m.walls[0], pts = [0, 0.5, 1.2, 2.0, 3.1].map((v) => D.deform(P, w, 4, v, 0));
  const t = [Math.cos(D.axisPoint(P, 4)[3]), Math.sin(D.axisPoint(P, 4)[3])];
  const along = pts.map((p) => p[0] * t[0] + p[1] * t[1]);
  assert.ok(Math.max(...along) - Math.min(...along) < 1e-6, `section stays plane: ${along}`);
});

test("transverse shear drifts the sections; the tube does not warp but the I-beam web does", () => {
  const tube = D.buildModel("tube"), ib = D.buildModel("ibeam");
  const dT = displacement(tube, state("tube", { shear: 1 }), 0, 6, 0.9);
  assert.ok(dT[1] > 0.1, "tube tip drifts up");
  for (const v of [0, 0.5, 1.3, 2.2]) assert.ok(Math.abs(displacement(tube, state("tube", { shear: 1 }), 0, 4, v)[0]) < 1e-6);
  const st = state("ibeam", { shear: 1 }), web = ib.walls[1];
  const upper = displacement(ib, st, 1, 4, web.path.length * 0.75)[0], lower = displacement(ib, st, 1, 4, web.path.length * 0.25)[0];
  assert.ok(Math.abs(upper) > 1e-4 && Math.sign(upper) === -Math.sign(lower), `S-shaped web warping: ${upper}, ${lower}`);
});

test("index.html is the current build of its sources", async () => {
  assert.equal(await readFile(INDEX, "utf8"), buildPage(), "run node build.mjs");
});

test("a 45° patch under pure shear has one stretching and one shortening diagonal", () => {
  // Torsion of the tube puts its skin in pure shear.
  const m = D.buildModel("tube"), signs = [];
  for (const torsion of [0.6, -0.6]) {
    const st = state("tube", { torsion });
    const P = D.prepare(m, st);
    const at0 = D.patchStrain(P, D.placePatch(m, { ...D.defaultPatch("tube"), angle: 0 }));
    assert.ok(Math.abs(at0.shearAngle) > 0.01, "the unrotated patch shears");
    const r = D.patchStrain(P, D.placePatch(m, { ...D.defaultPatch("tube"), angle: 45 }));
    const { e11, e22, e12 } = r.patch;
    assert.ok(Math.sign(e11) === -Math.sign(e22) && Math.min(Math.abs(e11), Math.abs(e22)) > 0.005, `${e11}, ${e22}`);
    assert.ok(Math.abs(e12) < 0.05 * Math.abs(e11), "the 45° patch barely shears");
    assert.ok(Math.abs(r.shearAngle) < 0.05 * Math.abs(at0.shearAngle));
    signs.push(Math.sign(e11));
    // principal directions: the tension one lies along a1 (0°) or a2 (90°)
    const tension = r.principal[0];
    assert.ok(tension.value > 0 && tension.value > -r.principal[1].value * 0.9);
  }
  assert.equal(signs[0], -signs[1], "reversing the torque swaps the diagonals");
});

test("the stiffened panel in pure in-plane shear: the 45° patch stretches along one diagonal, shortens along the other", () => {
  const m = D.buildModel("panel");
  const P = D.prepare(m, state("panel", { inplane: 0.5 }));
  const p = D.placePatch(m, { ...D.defaultPatch("panel"), angle: 45 });
  const r = D.patchStrain(P, p);
  assert.ok(r.patch.e11 > 0.01 && r.patch.e22 < -0.01, JSON.stringify(r.patch));
  assert.ok(Math.abs(r.shearAngle) < 1e-3);
  const r0 = D.patchStrain(P, { ...p, angle: 0 });
  assert.ok(Math.abs(r0.patch.e11) < 0.01 && Math.abs(r0.shearAngle) > 0.02, "the unrotated patch just shears");
  // beam loads do nothing to the panel, panel loads nothing to the beams
  const still = D.patchStrain(D.prepare(m, state("panel", { bending: 1, torsion: 1, shear: 1 })), p);
  assert.ok(Math.abs(still.patch.e11) < 1e-9 && Math.abs(still.patch.e22) < 1e-9);
  const tube = D.buildModel("tube");
  assert.ok(norm(displacement(tube, state("tube", { inplane: 1 }), 0, 4, 1)) < 1e-9);
});

test("the patch stays on its wall and the patch sliders round-trip", () => {
  for (const s of D.STRUCTURES) {
    const m = D.buildModel(s);
    for (const [along, around, angle] of [[0, 0, 0], [1, 1, 45], [0.3, 0.52, 90], [0.7, 0.2, 30]]) {
      const p = D.patchFromSliders(m, along, around, angle), w = m.walls[p.wall];
      assert.ok(p.u > w.u0 && p.u < w.u1);
      for (const line of D.patchParamLines(m, p)) for (const [u, v] of line) {
        assert.ok(u >= w.u0 - 1e-9 && u <= w.u1 + 1e-9, `${s}: u ${u}`);
        if (!w.closed) assert.ok(v >= w.v0 - 1e-9 && v <= w.v1 + 1e-9, `${s}: v ${v} outside ${w.v0}..${w.v1}`);
      }
      const back = D.patchFromSliders(m, ...Object.values(D.slidersFromPatch(m, p)));
      assert.ok(Math.abs(back.u - p.u) < 1e-9 && Math.abs(back.v - p.v) < 1e-9 && back.wall === p.wall, `${s} ${along} ${around}`);
    }
  }
});

test("I-beam torsion warps the flange tips in opposite directions, restrained at the clamp when toggled", () => {
  const m = D.buildModel("ibeam"), top = m.walls[0], bot = m.walls[2], tipL = 0, tipR = top.path.length;
  for (const restrained of [false, true]) {
    const P = D.prepare(m, state("ibeam", { torsion: 1 }, { warpingRestraint: restrained }));
    for (const x of [1.5, 3, 5.5]) {
      const a = D.warping(P, top, x, tipL), b = D.warping(P, top, x, tipR), c = D.warping(P, bot, x, tipL), d = D.warping(P, bot, x, tipR);
      assert.ok(Math.abs(a) > 1e-3, `${restrained} x=${x}: tips warp (${a})`);
      assert.ok(a * b < 0 && a * c < 0 && a * d > 0, `opposite tips move opposite ways: ${[a, b, c, d]}`);
      // and it is visible in the displacement field itself
      const dx = displacement(m, state("ibeam", { torsion: 1 }, { warpingRestraint: restrained }), 0, x, tipR)[0];
      assert.ok(Math.sign(dx) === Math.sign(b));
    }
    const atClamp = Math.abs(D.warping(P, top, 0, tipR)), far = Math.abs(D.warping(P, top, 4, tipR));
    if (restrained) assert.ok(atClamp < 1e-9 && D.warping(P, top, 0.3, tipR) !== 0, `restrained at the clamp: ${atClamp}`);
    else assert.ok(Math.abs(atClamp - far) < 1e-9, "free warping is uniform along the span");
  }
  // restraint stiffens the member: less twist at the tip
  const free = D.prepare(m, state("ibeam", { torsion: 1 })), held = D.prepare(m, state("ibeam", { torsion: 1 }, { warpingRestraint: true }));
  assert.ok(held.phi(6) < 0.8 * free.phi(6));
});

test("the circular tube does not warp in torsion; the box warps a little", () => {
  const tube = D.buildModel("tube"), box = D.buildModel("box"), ib = D.buildModel("ibeam");
  const peak = (m, s) => {
    const P = D.prepare(m, state(s, { torsion: 1 }));
    let w = 0;
    for (const wall of m.walls) for (let k = 0; k <= 50; k++) w = Math.max(w, Math.abs(D.warping(P, wall, 3, wall.v0 + (k / 50) * (wall.v1 - wall.v0))));
    return w;
  };
  assert.ok(peak(tube, "tube") < 1e-6);
  assert.ok(peak(box, "box") > 1e-4 && peak(box, "box") < 0.5 * peak(ib, "ibeam"));
});

test("shear lag makes the box flange strain peak at the webs", () => {
  const m = D.buildModel("box"), w = m.walls[0], P = D.prepare(m, state("box", { bending: 1 }));
  const strainAt = (y, z) => {
    let best = 0, bd = Infinity;
    w.path.points.forEach((q, i) => { const d = Math.hypot(q.y - y, q.z - z); if (d < bd) { bd = d; best = w.path.s[i]; } });
    return D.fieldValue(P, w, 1.5, best, "axial");
  };
  const { B, H, rc } = D.GEOM.box;
  const mid = strainAt(H / 2, 0), edge = strainAt(H / 2, B / 2 - rc - 0.01);
  assert.ok(mid < 0 && edge < 0, "top flange in compression for tip-up bending");
  assert.ok(Math.abs(edge) > 1.3 * Math.abs(mid), `edge ${edge} vs middle ${mid}`);
  const bot = strainAt(-H / 2, 0);
  assert.ok(bot > 0, "bottom flange in tension");
});

/* Largest wrinkle on a wall, and the sign changes along a line across it. */
function wrinkles(m, st, wallId = 0, n = 80) {
  const P = D.prepare(m, st), w = m.walls[wallId];
  let peak = 0;
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n / 2; j++)
    peak = Math.max(peak, Math.abs(D.wrinkle(P, w, w.u0 + ((w.u1 - w.u0) * i) / n, w.v0 + ((w.v1 - w.v0) * j) / (n / 2))));
  return peak;
}
function crossings(m, st, v, n = 400) {
  const P = D.prepare(m, st), w = m.walls[0];
  let count = 0, prev = 0;
  for (let i = 0; i <= n; i++) {
    const val = D.wrinkle(P, w, w.u0 + ((w.u1 - w.u0) * i) / n, v);
    if (Math.abs(val) > 1e-6) { if (prev && Math.sign(val) !== prev) count++; prev = Math.sign(val); }
  }
  return count;
}

test("panel shear buckling starts only past the marked threshold, and stiffeners raise it and shorten the waves", () => {
  const m = D.buildModel("panel");
  const bare = { stringers: false, frames: false }, stiff = { stringers: true, frames: true };
  const crBare = D.criticalLoads(m, state("panel", {}, bare)).inplane, crStiff = D.criticalLoads(m, state("panel", {}, stiff)).inplane;
  assert.ok(crBare.pos > 0 && crBare.pos < 1 && Math.abs(crBare.neg - crBare.pos) < 1e-12);
  assert.ok(crStiff.pos > 1.5 * crBare.pos && crStiff.pos < 1, `stiffeners raise the threshold: ${crBare.pos} -> ${crStiff.pos}`);
  for (const [opts, cr] of [[bare, crBare.pos], [stiff, crStiff.pos]]) {
    for (const sign of [1, -1]) {
      assert.equal(wrinkles(m, state("panel", { inplane: sign * cr * 0.98 }, opts)), 0, "flat below the threshold");
      assert.ok(wrinkles(m, state("panel", { inplane: sign * Math.min(1, cr * 1.3) }, opts)) > 0.01, "wrinkled above it");
    }
  }
  // a stringer's line is a nodal line of the stiffened skin
  const P = D.prepare(m, state("panel", { inplane: 1 }, stiff));
  for (const y of D.GEOM.panel.stringers) assert.ok(Math.abs(D.wrinkle(P, m.walls[0], 0.3, y + 1)) < 1e-9);
  // the waves change: more, shorter half-waves between stiffeners
  const v = 1.25;
  assert.ok(crossings(m, state("panel", { inplane: 1 }, stiff), v) > crossings(m, state("panel", { inplane: 1 }, bare), v));
  // stringers alone and frames alone each raise it
  const s1 = D.criticalLoads(m, state("panel", {}, { stringers: true, frames: false })).inplane.pos;
  const f1 = D.criticalLoads(m, state("panel", {}, { stringers: false, frames: true })).inplane.pos;
  assert.ok(s1 > crBare.pos && f1 > crBare.pos);
});

test("shear waves run along the tension diagonal and flip with the shear", () => {
  const m = D.buildModel("panel");
  const along = (q, dx, dy) => {
    const P = D.prepare(m, state("panel", { inplane: q }, { stringers: false, frames: false }));
    // correlation of w with itself shifted along a diagonal: crests run along it
    let c = 0;
    for (let i = 0; i < 40; i++) for (let j = 0; j < 20; j++) {
      const x = -1.5 + 3 * i / 40, y = -0.7 + 1.4 * j / 20;
      c += D.wrinkle(P, m.walls[0], x, y + 1) * D.wrinkle(P, m.walls[0], x + dx, y + dy + 1);
    }
    return c;
  };
  assert.ok(along(0.8, 0.3, 0.3) > along(0.8, 0.3, -0.3), "positive shear: crests along +x+y");
  assert.ok(along(-0.8, 0.3, -0.3) > along(-0.8, 0.3, 0.3), "negative shear: crests along +x-y");
});

test("shear waves on every box wall run along that wall's tension diagonal", () => {
  const m = D.buildModel("box"), w = m.walls[0];
  for (const T of [1, -1]) {
    const P = D.prepare(m, state("box", { torsion: T }));
    for (const k of [0, 1, 2, 3]) {
      const vs = [];
      for (let j = 0; j < 400; j++) { const v = (w.path.length * j) / 400; if (D.lookup(w.path, v).plate === k) vs.push(v); }
      const gamma = D.fieldValue(P, w, 3, vs[vs.length >> 1], "shear");
      const along = (ds) => {
        let c = 0;
        for (let i = 0; i < 40; i++) for (const v of vs) { const u = 1 + (4 * i) / 40; c += D.wrinkle(P, w, u, v) * D.wrinkle(P, w, u + 0.2, v + ds); }
        return c;
      };
      // the tension diagonal of a shear strain gamma_xs runs along (+x, sign(gamma) s)
      const d = 0.2 * Math.sign(gamma);
      assert.ok(along(d) > along(-d), `torsion ${T}, plate ${k}: crests along the tension diagonal`);
    }
  }
});

test("compression: Poisson swell, and the box buckles on the compression side only", () => {
  const box = D.buildModel("box"), w = box.walls[0];
  const cr = D.criticalLoads(box, state("box")).bending.pos;
  const P = D.prepare(box, state("box", { bending: Math.min(1, cr * 1.5) }));
  let top = 0, bottom = 0;
  for (let i = 0; i <= 60; i++) for (let j = 0; j <= 200; j++) {
    const u = (6 * i) / 60, v = (w.path.length * j) / 200, q = D.lookup(w.path, v), val = Math.abs(D.wrinkle(P, w, u, v));
    if (q.plate === 0) top = Math.max(top, val);
    if (q.plate === 2) bottom = Math.max(bottom, val);
  }
  assert.ok(top > 0.005 && bottom === 0, `tip-up bending compresses the top flange: top ${top}, bottom ${bottom}`);
  // near the clamp the moment is largest; the tip end stays flat
  assert.equal(Math.abs(D.wrinkle(P, w, 5.8, 0)), 0);
  // axial compression past its mark buckles the walls; tension never does
  const crA = D.criticalLoads(box, state("box")).axial;
  assert.ok(crA.neg > 0 && crA.pos === null);
  assert.ok(wrinkles(box, state("box", { axial: -Math.min(1, crA.neg * 1.3) })) > 0.005);
  assert.equal(wrinkles(box, state("box", { axial: 1 })), 0);
});

test("I-beam web buckles in shear; the tube never buckles", () => {
  const ib = D.buildModel("ibeam"), cr = D.criticalLoads(ib, state("ibeam")).shear.pos;
  assert.ok(cr > 0 && cr < 1);
  assert.equal(wrinkles(ib, state("ibeam", { shear: cr * 0.95 }), 1), 0);
  assert.ok(wrinkles(ib, state("ibeam", { shear: Math.min(1, cr * 1.4) }), 1) > 0.005);
  assert.equal(wrinkles(ib, state("ibeam", { shear: 1, torsion: 1, bending: 1, axial: -1 }), 0), 0, "flanges stay flat");
  const tube = D.buildModel("tube");
  assert.equal(wrinkles(tube, state("tube", { shear: 1, torsion: 1, bending: 1, axial: -1 })), 0);
  assert.deepEqual(Object.values(D.criticalLoads(tube, state("tube"))).filter((c) => c.pos || c.neg), []);
});

test("presets set up what their titles promise", () => {
  assert.equal(D.PRESETS.length, 6);
  const get = (id) => { const r = D.presetState(id); return { ...r, P: D.prepare(D.buildModel(r.state.structure), r.state) }; };
  const pure = get("pure-shear");
  assert.equal(pure.state.patch.angle, 45);
  const st = D.patchStrain(pure.P, pure.state.patch);
  assert.ok(st.patch.e11 * st.patch.e22 < 0, "one diagonal stretches, the other shortens");
  assert.ok(!D.bucklingState(pure.P).some((b) => b.buckled), "below the threshold");
  assert.ok(D.bucklingState(get("shear-buckling").P).some((b) => b.buckled));
  const lag = get("shear-lag");
  assert.ok(D.activeEffects(lag.P).some((e) => e.id === "shearlag" && e.basis === "assumed"));
  assert.ok(!D.bucklingState(lag.P).some((b) => b.buckled), "shear lag without flange wrinkles");
  const comp = get("compression");
  assert.ok(D.bucklingState(comp.P).some((b) => b.buckled) && comp.state.loads.axial < 0);
  assert.ok(D.activeEffects(get("torsion").P).every((e) => e.basis === "analytic"));
  for (const p of D.PRESETS) assert.ok(p.hint.length > 40 && p.title);
});

test("every effect in the legend is labelled analytic or assumed in raw.json", async () => {
  const raw = JSON.parse(await readFile(new URL("../raw.json", import.meta.url), "utf8"));
  const ids = new Set(raw.effects.map((e) => e.id));
  for (const e of raw.effects) assert.ok(["analytic", "assumed"].includes(e.basis));
  for (const id of ["shearlag", "buckling", "thresholds"]) assert.equal(raw.effects.find((e) => e.id === id).basis, "assumed");
  for (const p of D.PRESETS) {
    const r = D.presetState(p.id);
    for (const e of D.activeEffects(D.prepare(D.buildModel(r.state.structure), r.state))) assert.ok(ids.has(e.id), e.id);
  }
});

/* Runs the built page's scripts in a stand-in browser without WebGL, recording WebMCP tools and network calls. */
function runPage(html) {
  const tools = new Map(), requests = [], frames = [];
  const noop = () => {};
  const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : noop), set: (t, k, v) => ((t[k] = v), true) });
  const elements = new Map();
  const element = () => {
    const el = {
      children: [], style: {}, dataset: {}, attrs: {}, hidden: false, disabled: false, checked: false, value: "", textContent: "", innerHTML: "",
      clientWidth: 200, clientHeight: 200, width: 0, height: 0,
      classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
      addEventListener: noop, remove: noop, focus: noop,
      appendChild(c) { el.children.push(c); return c; },
      setAttribute(k, v) { el.attrs[k] = String(v); }, getAttribute: (k) => el.attrs[k] ?? null,
      querySelector: () => element(), querySelectorAll: () => [], closest: () => element(),
      getContext: (kind) => (kind === "2d" ? ctx2d : null),
    };
    el.parentElement = el;
    return el;
  };
  const document = {
    body: element(), documentElement: element(),
    getElementById: (id) => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
    createElement: element, querySelectorAll: () => [], addEventListener: noop,
    modelContext: { registerTool: (t) => tools.set(t.name, t) },
  };
  const window = {
    document, navigator: {}, console, devicePixelRatio: 1, innerWidth: 1200, innerHeight: 800, performance,
    getComputedStyle: () => ({ getPropertyValue: () => "#808080" }),
    matchMedia: () => ({ matches: false, addEventListener: noop }),
    requestAnimationFrame: (fn) => frames.push(fn),
    ResizeObserver: class { observe() {} },
    fetch: (...a) => { requests.push(["fetch", a]); return Promise.reject(new Error("offline")); },
    XMLHttpRequest: class { open(...a) { requests.push(["xhr", a]); } send() {} },
  };
  window.window = window.self = window.globalThis = window;
  const context = vm.createContext(window);
  for (const [, code] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(code, context);
  while (frames.length) frames.shift()(0);
  return { window, tools, requests, frames };
}

test("the built page runs offline with three.js inlined and registers working WebMCP tools", async () => {
  const pg = runPage(await readFile(INDEX, "utf8"));
  assert.equal(pg.window.THREE.REVISION, "186");
  assert.deepEqual([...pg.tools.keys()].sort(), ["get_current_view", "get_metadata", "set_view"]);
  const call = async (name, input) => JSON.parse((await pg.tools.get(name).execute(input)).content[0].text);
  const meta = await call("get_metadata", {});
  assert.equal(meta.three.release, "r186");
  assert.deepEqual(meta.presets.map((p) => p.id), D.PRESETS.map((p) => p.id));
  const start = await call("get_current_view", {});
  assert.equal(start.structure, D.defaultState().structure);
  assert.ok(Object.values(start.loads).every((v) => v === 0));
  const v = await call("set_view", { structure: "ibeam", loads: { shear: 2 }, colourMap: "shear" });
  assert.equal(v.structure, "ibeam");
  assert.equal(v.loads.shear, 1, "loads are clamped to -1..1");
  assert.equal(v.colourMap, "shear");
  assert.ok(v.buckling.some((b) => b.buckled) && v.bucklingOnset.shear.pos > 0);
  assert.deepEqual(await call("get_current_view", {}), v);
  const p = await call("set_view", { preset: "pure-shear" });
  assert.equal(p.structure, "panel");
  assert.equal(Math.round(p.patch.angle), 45);
  while (pg.frames.length) pg.frames.shift()(0);
  assert.deepEqual(pg.requests, [], "no network requests");
});

test("every load combination stays free of folded or torn elements, at 1x and at maximum exaggeration", () => {
  const combos = [];
  for (const a of [-1, 0, 1]) for (const b of [-1, 1]) for (const c of [-1, 1]) combos.push([a, b, c]);
  for (const s of D.STRUCTURES) {
    const m = D.buildModel(s);
    for (const ex of [1, 3]) for (const restraint of [false, true]) for (const [a, b, c] of combos) {
      const loads = s === "panel" ? { axial: a, inplane: b } : { axial: a, shear: b, torsion: c, bending: b * c };
      const P = D.prepare(m, state(s, loads, { exaggeration: ex, warpingRestraint: restraint, stringers: c > 0, frames: b > 0 }));
      for (const w of m.walls) {
        const nu = 24, nv = 16;
        for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
          const u = w.u0 + ((w.u1 - w.u0) * (i + 0.5)) / nu, v = w.v0 + ((w.v1 - w.v0) * (j + 0.5)) / nv, h = 1e-3;
          const p0 = D.deform(P, w, u, v, 0), pu = D.deform(P, w, u + h, v, 0), pv = D.deform(P, w, u, v + h, 0);
          assert.ok(p0.every(Number.isFinite), `${s}: finite`);
          const du = sub(pu, p0).map((x) => x / h), dv = sub(pv, p0).map((x) => x / h);
          const cross = [du[1] * dv[2] - du[2] * dv[1], du[2] * dv[0] - du[0] * dv[2], du[0] * dv[1] - du[1] * dv[0]];
          // local area ratio: neither collapsed nor blown up
          const area = norm(cross);
          assert.ok(area > 0.3 && area < 3, `${s} ${w.name} ex=${ex} ${[a, b, c]}: area ratio ${area}`);
        }
      }
    }
  }
});
