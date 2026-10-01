import test from "node:test";
import assert from "node:assert/strict";
import { L, FIXTURES, REFERENCE, RAW, DIM, near, clone, compute } from "./helpers.mjs";

const H = L.handcalc, fmt = L.report.fmt, tex = L.report.speech.texNumber;
const KEYS = ["A", "cx", "cy", "Ix", "Iy", "Ixy", "I1", "I2", "Sx_top", "Sx_bottom", "Sy_right", "Sy_left", "rx", "ry", "Ip", "rp"];
const CASES = [...FIXTURES.cases.map((c) => [c.id, c.model]), ...RAW.presets.map((p) => [`preset ${p.id}`, p.model])];

test("the hand chain by composite parts reproduces the engine and the independent Python reference", () => {
  for (const [id, model] of CASES) {
    const r = compute(model, { plastic: false }), D = H.derive(r), A = r.props.A;
    for (const k of KEYS) near(D[k], r.props[k], 1e-9, { area: A, dim: DIM[k], msg: `${id} ${k} vs engine` });
    near(D.thetaDeg, r.props.thetaDeg, 1e-7, { msg: `${id} θ vs engine` });
    const ref = REFERENCE.cases[id];
    if (ref) for (const k of KEYS) near(D[k], ref.properties[k], 1e-9, { area: A, dim: DIM[k], msg: `${id} ${k} vs reference.json` });
    // The parts' weighted areas add up to the area, and each part's own moments are about its centroid.
    for (const q of D.parts) assert.ok(q.Ix > 0 && q.Iy > 0 && q.Ix * q.Iy >= q.Ixy ** 2 * (1 - 1e-12), `${id} ${q.id}: own moments`);
  }
});

test("a textbook tee worked by hand gives the same numbers", () => {
  // Flange 200 × 20 centred at y = 110 on a 12 × 200 web centred at the origin, both sharp.
  const m = { sectionlab: 1, title: "Tee", materials: [clone(RAW.materials[0])], parts: [
    { id: "flange", shape: "rect", dims: { b: 200, h: 20 }, radii: [0, 0, 0, 0], x: 0, y: 110, material: RAW.materials[0].id },
    { id: "web", shape: "rect", dims: { b: 12, h: 200 }, radii: [0, 0, 0, 0], x: 0, y: 0, material: RAW.materials[0].id },
  ] };
  const D = H.derive(compute(m, { plastic: false }));
  near(D.A, 6400, 1e-14, { msg: "A" });
  near(D.cy, 68.75, 1e-14, { msg: "y_c" });
  near(D.Ix, (200 * 20 ** 3) / 12 + 4000 * 41.25 ** 2 + (12 * 200 ** 3) / 12 + 2400 * 68.75 ** 2, 1e-13, { msg: "I_x" });
  near(D.Iy, (20 * 200 ** 3) / 12 + (200 * 12 ** 3) / 12, 1e-13, { msg: "I_y" });
  near(D.Sx_top, D.Ix / (120 - 68.75), 1e-13, { msg: "S_x+" });
  near(D.Sx_bottom, D.Ix / (68.75 + 100), 1e-13, { msg: "S_x−" });
  assert.equal(D.Ixy, 0);
  assert.equal(D.theta, 0);
});

test("a void counts minus its host's modular ratio, and a stiffer part its own", () => {
  const steel = clone(RAW.materials.find((x) => x.id === "s355")), alu = clone(RAW.materials.find((x) => x.id === "al6061"));
  const m = { sectionlab: 1, title: "Mixed", E_base: alu.E, materials: [steel, alu], parts: [
    { id: "plate", shape: "rect", dims: { b: 100, h: 10 }, radii: [0, 0, 0, 0], x: 0, y: 55, material: steel.id },
    { id: "block", shape: "rect", dims: { b: 100, h: 100 }, radii: [0, 0, 0, 0], x: 0, y: 0, material: alu.id },
    { id: "bore", shape: "circle", dims: { d: 20 }, x: 0, y: -20, void: true },
  ] };
  const D = H.derive(compute(m, { plastic: false })), n = steel.E / alu.E;
  assert.deepEqual(D.parts.map((q) => q.w), [n, 1, -1]);
  const Ab = Math.PI * 100;
  near(D.A, n * 1000 + 10000 - Ab, 1e-14, { msg: "A" });
  const yc = (n * 1000 * 55 - Ab * -20) / D.A;
  near(D.cy, yc, 1e-13, { msg: "y_c" });
  const Ix = n * ((100 * 10 ** 3) / 12 + 1000 * (55 - yc) ** 2) + (100 * 100 ** 3) / 12 + 10000 * yc ** 2 - ((Math.PI * 20 ** 4) / 64 + Ab * (-20 - yc) ** 2);
  near(D.Ix, Ix, 1e-13, { msg: "I_x" });
});

test("closed forms for a part's own second moments agree with its exact boundary integral", () => {
  let seen = 0;
  for (const [id, model] of CASES) {
    const D = H.derive(compute(model, { plastic: false }));
    for (const q of D.parts.filter((p) => p.closed)) {
      seen++;
      near(q.closed.Ix, q.Ix, 1e-12, { msg: `${id} ${q.id} I_x,i` });
      near(q.closed.Iy, q.Iy, 1e-12, { msg: `${id} ${q.id} I_y,i` });
      assert.equal(q.Ixy, 0, `${id} ${q.id} I_xy,i`);
    }
  }
  assert.ok(seen >= 10, `closed forms checked: ${seen}`);
  // Literal closed forms: a turned 100 × 200 rectangle, a 50 circle and a 168.3 × 8 tube.
  const one = (part) => H.derive(compute({ sectionlab: 1, materials: [clone(RAW.materials[0])], parts: [{ id: "p", material: RAW.materials[0].id, ...part }] }, { plastic: false })).parts[0];
  const r = one({ shape: "rect", dims: { b: 100, h: 200 }, radii: [0, 0, 0, 0], orientation: 90 });
  near(r.Ix, (200 * 100 ** 3) / 12, 1e-13, { msg: "turned rectangle I_x" });
  near(r.closed.Ix, (200 * 100 ** 3) / 12, 1e-15, { msg: "turned rectangle closed I_x" });
  near(one({ shape: "circle", dims: { d: 50 } }).Ix, (Math.PI * 50 ** 4) / 64, 1e-13, { msg: "circle" });
  near(one({ shape: "chs", dims: { d: 168.3, t: 8 } }).closed.Ix, (Math.PI * (168.3 ** 4 - 152.3 ** 4)) / 64, 1e-15, { msg: "tube" });
});

test("the torsion steps rebuild the page's J from the shape's dimensions", () => {
  let seen = 0;
  for (const [id, model] of CASES) {
    const r = compute(model, { plastic: false }), s = H.derive(r).torsionSteps;
    if (!r.torsion.available) { assert.equal(s, null, id); continue; }
    seen++;
    near(s.J, r.torsion.J, 1e-12, { msg: `${id} J` });
    const md = H.markdown(r);
    assert.ok(md.includes(`$$ J = ${tex(fmt(r.torsion.J))}\\ \\text{mm}^4 $$`), `${id}: J's last step`);
  }
  assert.ok(seen >= 8, `torsion formulas checked: ${seen}`);
  // Independent values: a 100 mm circle, and a sharp 100 × 200 × 8 box by Bredt–Batho on the mid-line.
  const one = (part) => H.derive(compute({ sectionlab: 1, materials: [clone(RAW.materials[0])], parts: [{ id: "p", material: RAW.materials[0].id, ...part }] }, { plastic: false })).torsionSteps;
  near(one({ shape: "circle", dims: { d: 100 } }).J, (Math.PI * 100 ** 4) / 32, 1e-15, { msg: "circle J" });
  near(one({ shape: "rhs", dims: { b: 100, h: 200, t: 8 }, radii: [0, 0, 0, 0, 0, 0, 0, 0] }).J, (4 * (92 * 192) ** 2 * 8) / (2 * (92 + 192)), 1e-15, { msg: "box J" });
  // An equilateral triangle's J is written in its base b, not its apex offset a = b/2.
  const tri = { shape: "triangle", dims: { b: 120, h: 60 * Math.sqrt(3), a: 60 }, radii: [0, 0, 0] };
  const t = one(tri);
  assert.equal(t.b, 120);
  near(t.J, (Math.sqrt(3) * 120 ** 4) / 80, 1e-12, { msg: "triangle J" });
  const triMd = H.markdown(compute({ sectionlab: 1, materials: [clone(RAW.materials[0])], parts: [{ id: "p", material: RAW.materials[0].id, ...tri }] }, { plastic: false }));
  assert.ok(triMd.includes("$$ J = \\frac{\\sqrt{3}\\, b^4}{80} $$"), "triangle formula in b");
  assert.ok(triMd.includes("Exact solution: J = √3 b⁴ / 80."), "triangle formula text in b");
});

/* Every $$ line of the hand calculations' Markdown, and the numbers of its result lines. */
const displays = (md) => [...md.matchAll(/^\$\$ (.+) \$\$$/gm)].map((m) => m[1]);

test("every number shown is the page's own value, in its formatting and units", () => {
  for (const [id, model] of CASES) {
    const r = compute(model), P = r.props, md = H.markdown(r), eqs = displays(md);
    const has = (s, what) => assert.ok(eqs.includes(s), `${id}: ${what}: ${s}`);
    has(`A = ${tex(fmt(P.A))}\\ \\text{mm}^2`, "A");
    has(`x_c = ${tex(fmt(P.cx))}\\ \\text{mm}`, "x_c");
    has(`y_c = ${tex(fmt(P.cy))}\\ \\text{mm}`, "y_c");
    has(`I_x = ${tex(fmt(P.Ix))}\\ \\text{mm}^4`, "I_x");
    has(`I_y = ${tex(fmt(P.Iy))}\\ \\text{mm}^4`, "I_y");
    has(`I_{xy} = ${tex(fmt(P.Ixy))}\\ \\text{mm}^4`, "I_xy");
    has(`I_1 = ${tex(fmt(P.I1))}\\ \\text{mm}^4, \\quad I_2 = ${tex(fmt(P.I2))}\\ \\text{mm}^4`, "I_1, I_2");
    for (const [k, s] of [["Sx_top", "S_{x+}"], ["Sx_bottom", "S_{x-}"], ["Sy_right", "S_{y+}"], ["Sy_left", "S_{y-}"]]) has(`${s} = ${tex(fmt(P[k]))}\\ \\text{mm}^3`, k);
    for (const [k, s] of [["rx", "r_x"], ["ry", "r_y"], ["rp", "r_p"]]) has(`${s} = ${tex(fmt(P[k]))}\\ \\text{mm}`, k);
    has(`I_p = ${tex(fmt(P.Ip))}\\ \\text{mm}^4`, "I_p");
    if (P.Ixy !== 0) has(`\\theta = ${tex(fmt(P.thetaDeg))}^\\circ`, "θ");
    assert.ok(md.includes(`$Q_x$ = ${fmt(P.Qx)} mm³`) && md.includes(`$Q_y$ = ${fmt(P.Qy)} mm³`), `${id}: Q from the solver`);
    const pl = r.plastic;
    if (pl && !pl.error) {
      assert.ok(md.includes(`$M_p$ = ${pl.Mp === null ? "n/a" : `${fmt(pl.Mp)} N·mm`}`), `${id}: M_p`);
      if (pl.Zp !== null) has(`Z_p = ${tex(fmt(pl.Zp))}\\ \\text{mm}^3`, "Z_p");
      if (pl.shapeFactor !== null) has(`\\text{shape factor} = ${tex(fmt(pl.shapeFactor, 4))}`, "shape factor");
      assert.match(md, /come from the fibre solver/, `${id}: says the plastic moments are the solver's`);
    }
    // The written sums are the page's values: re-adding each sum's terms lands on its result.
    let sums = 0;
    for (let i = 0; i + 1 < eqs.length; i++) {
      const m = /^(I_x|I_y|A) = ([-\d.e \\times{}^]+(?: [+-] [-\d.e \\times{}^()]+)*)$/.exec(eqs[i]);
      if (!m || /\\frac|\\sum/.test(eqs[i])) continue;
      const num = (t) => Number(t.replace(/ \\times 10\^\{(-?\d+)\}/, "e$1"));
      const terms = m[2].replace(/ - /g, " + -").split(" + ").map((t) => {
        const [w, v] = t.replace(/^\(?(-?[\d.]+)\)? \\times (?!10\^)/, "$1*").split("*");
        return v === undefined ? num(w) : Number(w) * num(v);
      });
      const total = terms.reduce((s, v) => s + v, 0), shown = Number(eqs[i + 1].split(" = ")[1].replace(/\\ \\text.*$/, "").replace(/ \\times 10\^\{(-?\d+)\}/, "e$1"));
      near(total, shown, 2e-5 * terms.length, { msg: `${id}: ${eqs[i]}` });
      sums++;
    }
    assert.equal(sums, 3, `${id}: the sums for A, I_x and I_y are re-added`);
  }
});

test("Q, M_el, M_p and the curve are quoted from the solver, never derived, and n/a cases say why", () => {
  const r = compute(RAW.presets.find((p) => p.id === "tee-hole").model), md = H.markdown(r);
  assert.match(md, /come from the solver, which integrates each part cut at the axis/);
  assert.match(md, /## Hand calculation: torsion constant J, n\/a\n\nNo torsion constant here\. Given only for a single library shape with no voids\./);
  const failed = compute({ ...clone(RAW.presets.find((p) => p.id === "ipe").model), plastic: { axis: "x", N: 1e12, solve: "zero-cross" } });
  assert.match(H.markdown(failed), /## Hand calculation: plastic bending, n\/a\n\nThe fibre solver could not complete the moment–curvature analysis: The axial force alone/);
  const fillets = compute(RAW.presets.find((p) => p.id === "ipe").model);
  assert.match(H.markdown(fillets), /are integrated over their exact boundary \(lines and circular arcs, by Green's theorem\)/);
});

test("the Markdown is a narrated beamdswitch document: voice bf_emma, reveals between steps, plain spoken narration", () => {
  for (const [id, model] of CASES) {
    const md = H.markdown(compute(model));
    assert.match(md, /^---\ntitle: Hand calculations: .+\nsubtitle: .+\nvoice: bf_emma\n---\n/, id);
    const frames = md.split(/^## /m).slice(1);
    assert.equal(md.match(/^# Hand calculations$/gm).length, 1, id);
    assert.ok(frames.length >= 10, `${id}: ${frames.length} frames`);
    // One narration for the title slide, one for the section slide and one per frame.
    assert.equal(md.match(/^::: narration$/gm).length, frames.length + 2, id);
    for (const f of frames) {
      const narration = /::: narration\n(.+)\n:::/.exec(f)[1];
      assert.doesNotMatch(narration, /[$\\`*_#|<>×⁰¹²³⁴⁵⁶⁷⁸⁹⁻·∠°σ]/, `${id}: "${f.split("\n")[0]}" reads as speech: ${narration}`);
      for (const line of f.split("\n").slice(1)) assert.doesNotMatch(line, /^#{1,2}\s/, `${id}: no stray heading`);
    }
    assert.match(md, /\$\$ A = \\sum n_i A_i \$\$\n\n\. \. \.\n\n\$\$ A = /, `${id}: formula, then a reveal, then the substitution`);
    for (const eq of displays(md)) assert.doesNotMatch(H.texText(eq), /[\\{}]/, `${id}: TeX the page cannot draw: ${eq}`);
    const maths = [...displays(md), ...[...md.matchAll(/(?<!\$)\$([^$\n]+)\$(?!\$)/g)].map((m) => m[1])].join(" ");
    for (const [, name] of maths.matchAll(/\\([A-Za-z]+)/g)) assert.ok(H.COMMANDS.has(name), `${id}: \\${name} is not in the page's TeX subset`);
  }
});

test("the beamdswitch deck ends its Results on the hand calculations and declares voice bf_emma", () => {
  for (const p of RAW.presets) {
    const r = compute(p.model), rep = L.buildBeamdswitch(r), hand = H.deckFrames(r);
    assert.equal(rep.meta.voice, "bf_emma", p.id);
    assert.deepEqual(rep.results.slice(-hand.length), hand, p.id);
    assert.ok(hand.every((f) => f.title.startsWith("Hand calculation: ")), p.id);
  }
});

test("a long parts list writes its sums by the table instead of term by term", () => {
  const mat = clone(RAW.materials[0]);
  const parts = Array.from({ length: H.WRITE_TERMS + 1 }, (_, i) => ({ id: `p${i}`, shape: "rect", dims: { b: 10, h: 10 }, radii: [0, 0, 0, 0], x: 10 * i, y: 0, material: mat.id }));
  const r = compute({ sectionlab: 1, title: "Strip", materials: [mat], parts }, { plastic: false }), md = H.markdown(r);
  assert.match(md, new RegExp(`The ${H.WRITE_TERMS + 1} terms \\$n_i A_i\\$ use the values in the parts table\\.`));
  near(H.derive(r).A, 100 * (H.WRITE_TERMS + 1), 1e-14, { msg: "A" });
});

test("texNodes draws the subset the steps use", () => {
  assert.equal(H.texText("I_{x,i} = \\frac{b h^3}{12}"), "I_(x,i) = (b h^3)/(12)".replace(/_\((.+?)\)/, "_$1"));
  assert.equal(H.texText("r_x = \\sqrt{\\frac{I_x}{A}}"), "r_x = √((I_x)/(A))");
  assert.equal(H.texText("\\theta = 45^\\circ"), "θ = 45^°");
  assert.equal(H.texText("6400\\ \\text{mm}^2"), "6400 mm^2");
});
