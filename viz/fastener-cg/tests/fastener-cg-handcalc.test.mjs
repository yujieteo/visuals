/* Fastener Pattern CG Tracker hand calculations: every number is the solver's own, the written
   steps reproduce it, and closed forms worked independently here agree with it. The Markdown
   document is parsed with beamdswitch's own parser (tests/fixtures/beamdswitch/). */
import assert from "node:assert/strict";
import test from "node:test";

import { solve } from "../src/core/solve.mjs";
import { examplePattern, clone } from "../src/core/model.mjs";
import { convertPattern, MM_PER_IN, N_PER_LBF } from "../src/core/units.mjs";
import { boltCircle, rectangularArray } from "../src/core/generators.mjs";
import { fmt } from "../src/core/format.mjs";
import { handCalc, handCalcMarkdown, markdownOf, sayNumber, WRITE_TERMS, SLIDE_ROWS } from "../src/core/handcalc.mjs";
import { buildTrace } from "../src/core/trace.mjs";
import { parseDeck, splitSentences } from "./fixtures/beamdswitch/deck.mjs";

const close = (a, b, tol = 1e-9, label = "") => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${label} ${a} vs ${b}`);

function pattern(points, load = {}) {
  const p = examplePattern("N-mm");
  p.fasteners = points.map(([x, y], i) => ({ id: `F${i + 1}`, label: "", x, y, overrides: {} }));
  p.plates = [];
  p.load = { appliedPlate: "P1", point: { x: 0, y: 0, z: 0 }, Fx: 0, Fy: 0, Fz: 0, Mx: 0, My: 0, Mz: 0, ...load };
  return p;
}
const RECT4 = [[50, 30], [50, -30], [-50, 30], [-50, -30]];
const plateOf = (id, over = {}) => ({ id, thickness: 10, xMin: -80, xMax: 80, yMin: -50, yMax: 50, bearingAllowable: null, bearingLoadAllowable: null, shearOutAllowable: null, minEdgeRatio: null, flangeStrength: null, ...over });
const allow = (p, Fs = 20000, Ft = 30000) => { p.defaults.shearAllowable = Fs; p.defaults.tensionAllowable = Ft; return p; };

/* Patterns reaching every branch: the example bracket, out-of-plane load, uneven stiffness on an
   irregular group, a bolt circle in torsion, prying with preload and plates, the contact edge,
   ICR on both bases, linear interaction, in-lbf, a large array, and a pattern with errors. */
function irregular() {
  const p = allow(pattern([[0, 0], [80, 10], [30, 70], [-20, 45], [60, -40]], { point: { x: 140, y: 20, z: 15 }, Fx: 3000, Fy: -8000, Fz: 6000, Mx: 50000, My: -20000, Mz: 120000 }), 15000, 18000);
  p.fasteners[1].overrides = { ks: 2, ka: 1.5 };
  p.fasteners[3].overrides = { ks: 0.5, ka: 3, area: 200 };
  return p;
}
function tee() {
  const p = allow(pattern(RECT4, { Fz: 40000, Fy: -4000 }));
  p.plates = [plateOf("P1", { thickness: 8, flangeStrength: 250, bearingAllowable: 300, shearOutAllowable: 180 })];
  p.defaults.prying = { b: 40, a: 35, p: 60, holeDiameter: 14, boltStrengthB: 40000, manualFactor: null };
  p.defaults.preload = { pMax: 20000, pMin: 16000, phi: 0.2 };
  p.settings.prying = { enabled: true };
  p.settings.preload = { enabled: true };
  return p;
}
function contact() {
  const p = allow(pattern(RECT4, { point: { x: 0, y: 70, z: 0 }, Fz: 1000 }));
  p.plates = [plateOf("P1")];
  p.settings.axialMethod = "contact-edge";
  p.settings.contactEdge = { plateId: "P1", edge: "yMin" };
  return p;
}
function icr(basis) {
  const p = allow(pattern(RECT4, { point: { x: 150, y: 0, z: 0 }, Fy: -10000, Fz: 4000 }), 12000, 15000);
  p.settings.icr = { enabled: true, model: "crawford-kulak" };
  p.settings.designBasis = basis;
  p.defaults.icr = { rult: 1000, mu: 0.3937, lambda: 0.55, deltaMax: 8.6, deltaY: null };
  return p;
}
const example = () => allow(examplePattern("N-mm"));
const CASES = {
  example: example(),
  "out of plane": allow(pattern(RECT4, { point: { x: 150, y: 0, z: 20 }, Fy: -10000, Fz: 5000 })),
  irregular: irregular(),
  "bolt circle": pattern(boltCircle({ n: 6, r: 50, startDeg: 15, cx: 0, cy: 0 }).map((q) => [q.x, q.y]), { Mz: 300000 }),
  "prying and preload": tee(),
  "contact edge": contact(),
  "ICR, elastic basis": icr("elastic"),
  "ICR basis": icr("icr"),
  "linear interaction": (() => { const p = example(); p.settings.interaction = { a: 1, b: 1 }; return p; })(),
  "in-lbf": convertPattern(irregular(), "in-lbf"),
  "15 fasteners": allow(pattern(rectangularArray({ nx: 5, ny: 3, sx: 40, sy: 30, cx: 10, cy: -5 }).map((q) => [q.x, q.y]), { point: { x: 200, y: 0, z: 10 }, Fy: -20000, Fz: 3000 })),
};
const solved = Object.entries(CASES).map(([what, p]) => ({ what, p, r: solve(p) }));
for (const { what, r } of solved) assert.ok(r.ok, `${what}: ${JSON.stringify(r.issues.filter((i) => i.tier === "error"))}`);

const stepsOf = (hc) => hc.sections.flatMap((s) => s.frames.flatMap((f) => f.blocks.filter((b) => b.steps).flatMap((b) => b.steps)));
const stepOf = (hc, label) => stepsOf(hc).find((l) => l.label === label);
const frameOf = (hc, prefix) => hc.sections.flatMap((s) => s.frames).find((f) => f.title.startsWith(prefix));

/* ---------- the written arithmetic, evaluated ---------- */

/* Evaluates a substituted line as written ("(−1500000)·1·50 / 13600", "√(a² + b²)", "(a − b, c − d)").
   With `abs`, every sign is taken positive: the size of the terms, which bounds the rounding error. */
function evaluate(src, abs = false) {
  const s = src.replace(/\s+/g, "");
  let i = 0;
  const peek = () => s[i];
  const eat = (c) => (s.startsWith(c, i) ? ((i += c.length), true) : false);
  const fail = () => { throw new Error(`cannot read “${src}” at ${i}`); };
  function number() {
    const m = /^\d+(?:\.\d+)?(?:e[-+−]?\d+)?/.exec(s.slice(i));
    if (!m) fail();
    i += m[0].length;
    return Number(m[0].replace("−", "-"));
  }
  function args() {
    if (!eat("(")) fail();
    const out = [expr()];
    while (eat(",")) out.push(expr());
    if (!eat(")")) fail();
    return out;
  }
  function primary() {
    if (eat("½")) return 0.5;
    if (eat("√")) return Math.sqrt(primary());
    for (const [name, fn] of [["max", Math.max], ["min", Math.min], ["atan2", Math.atan2]]) if (eat(name)) return fn(...args());
    if (peek() === "(") { const a = args(); return a.length === 1 ? a[0] : a; }
    return number();
  }
  function power() {
    let v = primary();
    for (;;) {
      if (eat("²")) v = v * v;
      else if (eat("^")) v = Math.pow(v, unary());
      else return v;
    }
  }
  function unary() {
    if (eat("−") || eat("-")) return abs ? unary() : -unary();
    return power();
  }
  function term() {
    let v = unary();
    for (;;) {
      if (eat("·") || eat("×")) v *= unary();
      else if (eat("/")) v /= unary();
      else return v;
    }
  }
  function expr() {
    let v = term();
    for (;;) {
      if (eat("+")) v += term();
      else if (eat("−") || eat("-")) v = abs ? v + term() : v - term();
      else return v;
    }
  }
  const v = expr();
  if (i !== s.length) fail();
  return v;
}
const readNumbers = (text) => {
  const t = String(text).replace(/−/g, "-");
  const tuple = /^\((.*)\)$/.exec(t);
  return (tuple ? tuple[1].split(",") : [t]).map(Number);
};

test("the substituted numbers, carried through, reproduce every result to the digits shown", () => {
  // Group steps written here and the trace's per-fastener steps; lines with words (iterations, "governing F1") are not arithmetic.
  const required = ["Σks", "Cs,x", "Cs,y", "Σka", "Ca,x", "Ca,y", "J", "Ixx", "Iyy", "Ixy", "Mean", "Radius", "I₁", "I₂", "Lever to Cs", "Torsion about Cs", "Lever to Ca", "Bending about Ca, x", "Bending about Ca, y", "Share", "Rdx", "Rdy", "Rtx", "Rty", "Resultant"];
  for (const { what, p, r } of solved) {
    const hc = handCalc(p, r);
    const done = new Set();
    for (const l of stepsOf(hc)) {
      if (!l.substituted || l.text === "—") continue;
      let got, size;
      try { got = evaluate(l.substituted); size = evaluate(l.substituted, true); } catch { continue; }
      const want = readNumbers(l.text), gots = [got].flat(), sizes = [size].flat();
      assert.equal(gots.length, want.length, `${what}: ${l.label}`);
      gots.forEach((g, k) => {
        const v = l.unit === "°" ? (g * 180) / Math.PI : g, sz = l.unit === "°" ? 180 : sizes[k];
        // Six significant figures in each written number: the error is bounded by the size of the terms.
        assert.ok(Math.abs(v - want[k]) <= 5e-5 * Math.abs(sz) + 1e-9 * Math.max(1, Math.abs(want[k])) || fmt(v, hc.digits) === fmt(want[k], hc.digits),
          `${what}: ${l.label}: ${l.substituted} = ${v}, shown ${l.text}`);
      });
      done.add(l.label);
    }
    // Beyond WRITE_TERMS fasteners the sums point to the tables instead of being written term by term.
    const sums = new Set(["Σks", "Cs,x", "Cs,y", "Σka", "Ca,x", "Ca,y", "J", "Ixx", "Iyy", "Ixy"]);
    const need = [...required.filter((l) => r.fasteners.length <= WRITE_TERMS || !sums.has(l)), ...(stepOf(hc, "Radius").text === "0" ? [] : ["θp"]), ...(r.axial.mode === "general" ? ["D", "θx", "θy", "Direct", "Bending", "Tension"] : []),
      ...(r.axial.mode === "contact-edge" ? ["Σ ka·d²", "Contact reaction", "Tension"] : []),
      ...(r.critical?.mode === "interaction" ? ["IF(1)", "MS interaction"] : []),
      ...(p.plates.some((q) => q.bearingAllowable) ? [`Bearing, ${p.plates[0].id}`, `MS bearing, ${p.plates[0].id}`] : []),
      ...(p.plates.some((q) => q.shearOutAllowable) ? [`Tear-out capacity, ${p.plates[0].id}`, `MS tear-out, ${p.plates[0].id}`] : [])];
    for (const label of need) assert.ok(done.has(label), `${what}: "${label}" is written out and checked`);
  }
});

test("every result is the solver's own value, and every per-fastener step is the calculation trace", () => {
  for (const { what, p, r } of solved) {
    const hc = handCalc(p, r), pr = r.props;
    assert.equal(hc.ok, true);
    for (const [label, value] of [["Σks", pr.Ks], ["Cs,x", pr.Cs.x], ["Cs,y", pr.Cs.y], ["Σka", pr.Ka], ["Ca,x", pr.Ca.x], ["Ca,y", pr.Ca.y], ["Cg,x", pr.Cg.x], ["Cg,y", pr.Cg.y],
      ["J", pr.J], ["Ixx", pr.Ixx], ["Iyy", pr.Iyy], ["Ixy", pr.Ixy], ["I₁", pr.principal.I1], ["I₂", pr.principal.I2], ["θp", pr.principal.thetaDeg]]) {
      assert.equal(stepOf(hc, label).value, value, `${what}: ${label}`);
    }
    if (r.axial.mode === "general") {
      assert.equal(stepOf(hc, "D").value, r.axial.D, what);
      assert.equal(stepOf(hc, "θx").value, r.axial.thetaX, what);
      assert.equal(stepOf(hc, "θy").value, r.axial.thetaY, what);
    }
    // The worked fastener's steps are the trace's lines, value for value.
    const trace = buildTrace(p, r, hc.id, (v) => fmt(v, hc.digits));
    const traced = trace.sections.flatMap((s) => s.lines);
    for (const l of traced) assert.ok(stepsOf(hc).some((h) => h.label === l.label && h.formula === l.formula && h.value === l.value), `${what}: trace line ${l.label}`);
    // Every fastener's shear and tension in the tables, in the steps' digits.
    const md = hc.sections.flatMap((s) => s.frames.map((f) => markdownOf(f.blocks))).join("\n");
    for (const f of r.fasteners) {
      assert.ok(md.includes(`| ${f.id} | ${fmt(f.shear.share, hc.digits)} | `), `${what}: ${f.id} share`);
      assert.ok(md.includes(` | ${fmt(f.shear.Rs, hc.digits, Math.max(...r.fasteners.map((q) => q.shear.Rs)))} |`) || md.includes(` | ${fmt(f.shear.Rs, hc.digits)} |`), `${what}: ${f.id} Rs`);
    }
  }
});

/* ---------- independent closed forms ---------- */

test("closed forms: the 2×2 bracket (VC-01) and its out-of-plane load", () => {
  // Corners at (±50, ±30): Cs = Ca = (0, 0), J = 4(50² + 30²), Ixx = 4·30², Iyy = 4·50², Ixy = 0.
  const { p, r } = solved.find((c) => c.what === "out of plane");
  const hc = handCalc(p, r), J = 4 * (50 ** 2 + 30 ** 2), Ixx = 4 * 30 ** 2, Iyy = 4 * 50 ** 2;
  close(stepOf(hc, "J").value, J); close(stepOf(hc, "Ixx").value, Ixx); close(stepOf(hc, "Iyy").value, Iyy);
  assert.equal(stepOf(hc, "Ixy").text, "0");
  assert.equal(stepOf(hc, "J").text, "13600");
  // Fy = −10000 at x = 150: Mz,s = 150·(−10000); zp = 20: Mx,a = −20·(−10000), My,a = −150·5000.
  const Mz = 150 * -10000, Mx = 20 * 10000, My = -150 * 5000;
  close(stepOf(hc, "Torsion about Cs").value, Mz); close(stepOf(hc, "Bending about Ca, x").value, Mx); close(stepOf(hc, "Bending about Ca, y").value, My);
  // F1 at (50, 30) is the critical fastener.
  assert.equal(hc.id, "F1");
  const Rtx = (-Mz * 30) / J, Rty = (Mz * 50) / J, Rs = Math.hypot(Rtx, -2500 + Rty);
  close(stepOf(hc, "Rtx").value, Rtx); close(stepOf(hc, "Rty").value, Rty); close(stepOf(hc, "Resultant").value, Rs);
  assert.equal(stepOf(hc, "Rtx").text, fmt(Rtx, 6));
  assert.equal(stepOf(hc, "Resultant").text, fmt(Rs, 6));
  // With Ixy = 0 the plate rotations are Mx/Ixx and My/Iyy: T = Fz/4 + Mx·q/Ixx − My·p/Iyy.
  close(stepOf(hc, "θx").value, Mx / Ixx); close(stepOf(hc, "θy").value, My / Iyy);
  const T = 5000 / 4 + (Mx * 30) / Ixx - (My * 50) / Iyy;
  close(stepOf(hc, "Tension").value, T);
  assert.equal(stepOf(hc, "Tension").text, fmt(T, 6));
  // As slides, the tension table names fasteners by id even when some are unloading.
  const slides = handCalc(p, r, { slides: true }).sections.flatMap((s) => s.frames).map((f) => f.title);
  assert.ok(slides.includes("Tension by fastener (F1 to F4)"), slides.join("; "));
  // Elliptical interaction with no preload or prying: IF(1) = (Rs/Fs)² + (T/Ft)², k* = IF(1)^(−1/2).
  const IF1 = (Rs / 20000) ** 2 + (T / 30000) ** 2;
  close(stepOf(hc, "IF(1)").value, IF1);
  close(stepOf(hc, "k*").value, IF1 ** -0.5, 1e-10);
  close(stepOf(hc, "Check: closed form").value, IF1 ** -0.5, 1e-12);
  close(stepOf(hc, "MS interaction").value, IF1 ** -0.5 - 1, 1e-10);
  assert.equal(stepOf(hc, "MS interaction").text, fmt(IF1 ** -0.5 - 1, 6));
});

test("closed forms: a bolt circle in pure torsion shares Mz/(n·r) equally", () => {
  const { p, r } = solved.find((c) => c.what === "bolt circle");
  const hc = handCalc(p, r), n = 6, R = 50, Mz = 300000;
  close(stepOf(hc, "J").value, n * R * R); close(stepOf(hc, "Ixx").value, (n * R * R) / 2); close(stepOf(hc, "Iyy").value, (n * R * R) / 2);
  assert.equal(stepOf(hc, "Ixy").text, "0", "round-off reads as zero");
  assert.equal(stepOf(hc, "Cs,x").text, "0");
  for (const f of r.fasteners) close(f.shear.Rs, Mz / (n * R), 1e-9, f.id);
  assert.equal(stepOf(hc, "θp").substituted, "I₁ = I₂, so every axis is principal; the solver's angle is shown");
  close(stepOf(hc, "Resultant").value, Mz / (n * R));
  assert.equal(frameOf(hc, "Worked shear").title, `Worked shear, ${hc.id}: Rs = 1000 N`);
});

test("closed forms: uneven stiffness on an irregular group, and the same group in in-lbf", () => {
  const p = CASES.irregular, r = solve(p), hc = handCalc(p, r);
  // Resolved weights: ks = [1, 2, 1, 0.5, 1], ka = [1, 1.5, 1, 3, 1].
  const xy = [[0, 0], [80, 10], [30, 70], [-20, 45], [60, -40]], ks = [1, 2, 1, 0.5, 1], ka = [1, 1.5, 1, 3, 1];
  const c = (w) => ({ x: xy.reduce((a, [x], i) => a + w[i] * x, 0) / w.reduce((a, b) => a + b), y: xy.reduce((a, [, y], i) => a + w[i] * y, 0) / w.reduce((a, b) => a + b) });
  const Cs = c(ks), Ca = c(ka);
  close(stepOf(hc, "Cs,x").value, Cs.x); close(stepOf(hc, "Cs,y").value, Cs.y);
  close(stepOf(hc, "Ca,x").value, Ca.x); close(stepOf(hc, "Ca,y").value, Ca.y);
  const J = xy.reduce((a, [x, y], i) => a + ks[i] * ((x - Cs.x) ** 2 + (y - Cs.y) ** 2), 0);
  const Ixx = xy.reduce((a, [, y], i) => a + ka[i] * (y - Ca.y) ** 2, 0);
  const Iyy = xy.reduce((a, [x], i) => a + ka[i] * (x - Ca.x) ** 2, 0);
  const Ixy = xy.reduce((a, [x, y], i) => a + ka[i] * (x - Ca.x) * (y - Ca.y), 0);
  close(stepOf(hc, "J").value, J); close(stepOf(hc, "Ixx").value, Ixx); close(stepOf(hc, "Iyy").value, Iyy); close(stepOf(hc, "Ixy").value, Ixy);
  for (const [label, v] of [["J", J], ["Ixx", Ixx], ["Iyy", Iyy], ["Ixy", Ixy]]) assert.equal(stepOf(hc, label).text, fmt(v, 6), label);
  // Load at (140, 20, 15): Mz,s = Mz + rx·Fy − ry·Fx about Cs.
  const Mz = 120000 + (140 - Cs.x) * -8000 - (20 - Cs.y) * 3000;
  close(stepOf(hc, "Torsion about Cs").value, Mz);
  // The same group in in-lbf: lengths ÷ 25.4, J and I ÷ 25.4², moments ÷ (4.448…·25.4).
  const pi = CASES["in-lbf"], ri = solve(pi), hi = handCalc(pi, ri);
  close(stepOf(hi, "J").value, J / MM_PER_IN ** 2, 1e-10);
  close(stepOf(hi, "Cs,x").value, Cs.x / MM_PER_IN, 1e-10);
  close(stepOf(hi, "Torsion about Cs").value, Mz / (N_PER_LBF * MM_PER_IN), 1e-10);
  assert.equal(stepOf(hi, "J").unit, "in²");
  assert.equal(stepOf(hi, "Torsion about Cs").unit, "in·lbf");
  assert.match(frameOf(hi, "Polar moment").title, / in² about Cs$/);
});

test("closed forms: the contact edge and the bolt-load chain", () => {
  // Fz = 1000 at y = 70 about the edge y = −50: M_L = 120000; d = 80 and 20 for the two rows.
  const c = handCalc(CASES["contact edge"], solve(CASES["contact edge"]));
  const S = 2 * 80 ** 2 + 2 * 20 ** 2;
  close(stepOf(c, "M_L").value, 120000); close(stepOf(c, "Σ ka·d²").value, S);
  close(stepOf(c, "Contact reaction").value, (2 * 120000 * 100) / S - 1000);
  assert.match(frameOf(c, "Contact-edge tension (b), P1 yMin: largest T = ").title, /: largest T = \d/);
  // Prying with preload: F_b = max(P_max + φT, T) + Q at T = 10000.
  const tp = CASES["prying and preload"], tr = solve(tp), t = handCalc(tp, tr);
  const ch = tr.fasteners.find((f) => f.id === t.id).checks.tension;
  close(stepOf(t, "Preload share").value, 20000 + 0.2 * 10000);
  close(stepOf(t, "Bolt load").value, Math.max(22000, 10000) + ch.Q);
  assert.ok(stepOf(t, "Prying Q").value > 0);
  assert.ok(!stepsOf(t).some((l) => l.label === "Check: closed form"), "no closed form for k* through preload");
  assert.ok(frameOf(t, "Bearing and tear-out"), "plates are worked");
  assert.match(markdownOf(frameOf(t, "Bolt tension").blocks), /prying and preload/);
});

test("the ICR solve is stated, not derived, and an ICR basis works its reactions", () => {
  for (const what of ["ICR, elastic basis", "ICR basis"]) {
    const { p, r } = solved.find((c) => c.what === what), hc = handCalc(p, r);
    const sec = hc.sections.find((s) => s.title === "Instantaneous centre of rotation");
    const [first] = sec.frames;
    assert.equal(first.title, `ICR (Crawford-Kulak), iterative: γ_ult = ${fmt(r.icr.gamma, 4)}`);
    const text = markdownOf(first.blocks);
    assert.match(text, /iterative, so its method and result are stated here rather than derived by hand/);
    assert.ok(text.includes(`γ_ult = ${fmt(r.icr.gamma, 6)}`), what);
    for (const f of r.fasteners) assert.ok(text.includes(`| ${f.id} | ${fmt(f.icr.ultimate.rho, 6)} |`), `${what}: ${f.id}`);
    assert.equal(stepOf(hc, "At the applied load").value, r.fasteners.find((f) => f.id === hc.id).icr.atLoad.Rs);
    assert.match(markdownOf(frameOf(hc, "Interaction").blocks), new RegExp(`with a = 2 and b = 2`));
    assert.equal(hc.sections.find((s) => s.title === "Checks and margin").frames.at(-1).blocks[0].p.includes(`${r.designBasis} basis`), true);
  }
});

test("large groups: sums beyond WRITE_TERMS point to the tables; as slides, each table runs over slides of SLIDE_ROWS rows", () => {
  const { p, r } = solved.find((c) => c.what === "15 fasteners"), hc = handCalc(p, r), sl = handCalc(p, r, { slides: true });
  assert.ok(r.fasteners.length > WRITE_TERMS);
  assert.equal(stepOf(hc, "J").substituted, "Σ over the 15 fasteners (table)");
  // On the page one table holds every fastener.
  const page = frameOf(hc, "Elastic in-plane shear").blocks.find((b) => b.table).table.rows;
  assert.deepEqual(page.map((row) => row[0]), r.fasteners.map((f) => f.id));
  const titles = sl.sections.flatMap((s) => s.frames).map((f) => f.title);
  assert.deepEqual(titles.filter((t) => t.startsWith("Shear by fastener")), ["Shear by fastener (F1 to F6)", "Shear by fastener (F7 to F12)", "Shear by fastener (F13 to F15)"]);
  const rows = sl.sections.flatMap((s) => s.frames).filter((f) => f.title.startsWith("Shear by fastener")).flatMap((f) => f.blocks[0].table.rows);
  assert.deepEqual(rows.map((row) => row[0]), r.fasteners.map((f) => f.id));
  assert.ok(sl.sections.flatMap((s) => s.frames).every((f) => f.blocks.filter((b) => b.table).every((b) => b.table.rows.length <= SLIDE_ROWS)));
  // Prose goes to the speaker notes and the steps stay on the slide; prose that is all there is stays.
  const lead = sl.sections.flatMap((s) => s.frames).find((f) => f.title.startsWith("Polar moment J"));
  assert.ok(lead.notes.startsWith("Each fastener's position from Cs"));
  assert.ok(!lead.blocks.some((b) => b.p != null || b.table));
  const shear = sl.sections.flatMap((s) => s.frames).find((f) => f.title.startsWith("Elastic in-plane shear"));
  assert.ok(shear.blocks[0].p.startsWith("Direct shear is shared by ks") && !shear.notes);
});

test("the worked fastener is the governing one unless another is picked", () => {
  const p = CASES.example, r = solve(p);
  assert.equal(handCalc(p, r).id, r.critical.id);
  const other = handCalc(p, r, { fastenerId: "F3" });
  assert.equal(other.id, "F3");
  assert.equal(frameOf(other, "Worked shear").title, `Worked shear, F3: Rs = ${fmt(r.fasteners[2].shear.Rs, 4)} N`);
  assert.equal(handCalc(p, r, { fastenerId: "F99" }).id, r.critical.id);
  // The page's precision sets the titles and narration; steps keep at least six figures.
  const p8 = clone(p); p8.settings.precision = 8;
  const h8 = handCalc(p8, solve(p8));
  assert.equal(h8.digits, 8);
  assert.equal(frameOf(h8, "Worked shear").title, `Worked shear, F1: Rs = ${fmt(r.fasteners[0].shear.Rs, 8)} N`);
});

test("a pattern with errors has no hand calculations, only the errors", () => {
  const p = examplePattern("N-mm");
  p.fasteners = [];
  const r = solve(p), hc = handCalc(p, r);
  assert.equal(hc.ok, false);
  assert.match(markdownOf(hc.sections[0].frames[0].blocks), /E-001/);
  const deck = parseDeck(handCalcMarkdown(p, r));
  assert.equal(deck.meta.subtitle, "The pattern has errors");
});

/* ---------- the Markdown document ---------- */

test("Save Markdown: every step as a Markdown document that beamdswitch opens as a narrated deck", () => {
  for (const { what, p, r } of solved) {
    const hc = handCalc(p, r), md = handCalcMarkdown(p, r, { date: "2026-10-01" });
    const deck = parseDeck(md);
    assert.equal(deck.meta.voice, "bf_emma", what);
    assert.equal(deck.meta.title, `Hand calculations: ${p.name}`, what);
    assert.equal(deck.meta.date, "2026-10-01");
    const title = deck.frames[0];
    assert.equal(title.kind, "title", what);
    assert.ok(md.split("\n").includes("Preliminary sizing — verify against the governing specification."), `${what}: the export carries the Preliminary sizing line`);
    assert.ok(md.indexOf("Preliminary sizing") < md.indexOf("\n# "), `${what}: the Preliminary sizing line is on the title slide`);
    assert.match(title.narration, /preliminary sizing, to verify against the governing specification\./, what);
    assert.deepEqual(deck.frames.filter((f) => f.kind === "section").map((f) => f.title), hc.sections.map((s) => s.title), what);
    const sl = handCalc(p, r, { slides: true });
    assert.deepEqual(deck.frames.filter((f) => f.kind === "frame").map((f) => f.title), sl.sections.flatMap((s) => s.frames.map((f) => f.title)), what);
    assert.equal(md.match(/^::: narration$/gm).length, deck.frames.length, `${what}: one narration per slide, none left to beamdswitch's defaults`);
    for (const f of deck.frames) {
      assert.ok(splitSentences(f.narration).length > 0, `${what}: "${f.title}" is narrated`);
      assert.doesNotMatch(f.narration, /[$\\`*_#|<>×⁰¹²³⁴⁵⁶⁷⁸⁹⁻·∠°σ]/, `${what}: "${f.title}" reads as speech: ${f.narration}`);
    }
    assert.ok(deck.frames.some((f) => f.steps > 1), `${what}: reveals with . . .`);
    // Every step's result is in the document, in bold, with its unit.
    for (const l of stepsOf(hc)) if (l.text !== "—") assert.ok(md.includes(`= **${l.text.replace(/\*/g, "\\*")}${l.unit ? ` ${l.unit}` : ""}**`), `${what}: ${l.label}`);
    assert.ok(md.includes("**k\\***") || !md.includes("k*"), `${what}: a literal k* cannot open emphasis`);
  }
});

test("the narration reads the numbers in the page's units and digits", () => {
  const said = (p) => parseDeck(handCalcMarkdown(p, solve(p))).frames.map((f) => f.narration).join(" ");
  const si = said(CASES["out of plane"]);
  assert.match(si, /Moving the load to the shear centroid gives a torsion of minus 1500000 newton millimetres\./);
  assert.match(si, /The polar moment about the shear centroid adds each fastener's shear stiffness times its squared distance from it, giving 13600 square millimetres\./);
  assert.match(si, /For fastener F1, the direct shear is 0 newtons in x and minus 2500 newtons in y, the torsional shear is 3309 newtons in x and minus 5515 newtons in y, and the resultant is 8671 newtons\./);
  assert.match(si, /the interaction margin of safety is 1\.053\./);
  const us = said(CASES["in-lbf"]);
  assert.match(us, /inch pounds-force/);
  assert.match(us, /square inches/);
  assert.equal(sayNumber("−1.5e-7"), "minus 1.5 times ten to the minus 7");
  assert.equal(sayNumber("∞"), "infinity");
});
