/* The Mohr page's hand calculations: every step's result is the page's own value, the hand chain
   (the same formulas worked from the shown components) reproduces it, both match closed-form
   references, and the Markdown and deck exports open in beamdswitch. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { checkDeck, parseDeck, standIn } from "./beamdswitch-deck-checks.mjs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const script = (id) => new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`).exec(html)[1];
const ctx = vm.createContext({});
ctx.self = ctx;
vm.runInContext(script("mohr-engine"), ctx);
vm.runInContext(script("mohr-beamdswitch"), ctx);
const M = ctx.Mohr, T = ctx.Beamdswitch;

const edit = (id, f) => { const s = M.presetState(id); f(s); return s; };
const CASES = [
  ...M.PRESETS.map((p) => [`preset ${p.id}`, M.presetState(p.id)]),
  ["preset 1 at θ = 30°", edit(1, (s) => { s.plane.angleDeg = 30; })],
  ["compression positive, convention B, θ = −25°", edit(1, (s) => { s.conventions.normalSign = "compression-positive"; s.conventions.shear2D = "B"; s.plane.angleDeg = -25; })],
  ["GPa and %, 6 digits", edit(6, (s) => { s.units = { stress: "GPa", strain: "%" }; s.view.digits = 6; })],
  ["ksi and mm/mm, tensor shear", edit(8, (s) => { s.units = { stress: "ksi", strain: "mm/mm" }; s.conventions.strainShear = "tensor"; s.plane.angleDeg = 40; })],
  ["psi, plane strain", edit(1, (s) => { s.units.stress = "psi"; s.constraint = "plane-strain"; })],
  ["rotation about x", edit(6, (s) => { s.plane.axis = "x"; s.plane.angleDeg = 30; })],
  ["rotation about y, compression positive", edit(6, (s) => { s.plane.axis = "y"; s.plane.angleDeg = 70; s.conventions.normalSign = "compression-positive"; })],
  ["rotation about principal axis 1", edit(6, (s) => { s.plane.axis = "1"; s.plane.angleDeg = -20; })],
  ["plane by direction cosines", edit(6, (s) => { s.plane = { ...s.plane, mode: "cosines", l: 1, m: 1, n: 1 }; })],
  ["general 3D strain, compression positive", edit(8, (s) => { s.constraint = "general"; s.strain = { ...s.strain, ez: 300e-6, eyz: 150e-6, ezx: -80e-6 }; s.conventions.normalSign = "compression-positive"; })],
  ["principal entry", edit(1, (s) => { s.entryMode = "principal"; s.constraint = "general"; s.principal = { s1: 120, s2: 30, s3: -45 }; })],
  ["invalid material, stress-driven", edit(1, (s) => { s.material.nu = 0.7; s.constraint = "plane-strain"; })],
  ["invalid material, strain-driven", edit(8, (s) => { s.material.E = 0; })],
  ["zero tensor", edit(1, (s) => { s.stress = { sx: 0, sy: 0, sz: 0, txy: 0, tyz: 0, tzx: 0 }; })],
].map(([what, st]) => ({ what, st }));

const near = (a, b, what, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${what}: ${a} vs ${b}`);
const step = (h, id) => h.steps.find((s) => s.id === id);
const plain = (x) => JSON.parse(JSON.stringify(x)); // arrays from the page's realm, for deepEqual

test("the hand chain reproduces the page's own values for every state, in its units and sign", () => {
  for (const { what, st } of CASES) {
    const r = M.analyse(st), h = M.handCalc(st), ch = h.chain;
    const isStress = r.stressDriven, res = isStress ? r.stress : r.strain, c = res.circle;
    const fac = isStress ? M.STRESS_UNITS[st.units.stress] : M.STRAIN_UNITS[st.units.strain], sg = r.sign;
    const disp = (x) => (sg * x) / fac, mag = (x) => Math.abs(x) / fac, tol = 1e-9 * (M.vec.frob(res.T) / fac || 1);
    const close = (a, b, k) => assert.ok(Math.abs(a - b) <= tol + 1e-9 * Math.abs(b), `${what}: ${k} ${a} vs ${b}`);
    close(ch.C, disp(c.C), "C");
    close(ch.R, mag(c.R), "R");
    const ord = sg === 1 ? [c.max, c.min] : [c.min, c.max];
    close(ch.larger, disp(ord[0]), "larger in-plane");
    close(ch.smaller, disp(ord[1]), "smaller in-plane");
    if (!c.degenerate) near(ch.thetaP, c.thetaP, `${what}: θp`);
    if (r.thetaView !== null) {
      const pt = M.pointAt(c, r.thetaView);
      close(ch.rotated.s, disp(pt.s), "rotated σ");
      close(ch.rotated.sOther, disp(pt.sOther), "other face σ");
      close(ch.rotated.t, disp(pt.t), "rotated τ");
      close(ch.rotated.s, disp(res.plane.sn), "selected plane σn");
      close(ch.rotated.tau, mag(res.plane.tau), "selected plane shear magnitude");
    } else {
      close(ch.traction.sn, disp(res.plane.sn), "traction σn");
      close(ch.traction.tau, mag(res.plane.tau), "traction τ");
    }
    res.principal.values.forEach((v, i) => assert.ok(Math.abs(ch.principal[i] - disp(v)) <= 1e-7 * (M.vec.frob(res.T) / fac || 1), `${what}: principal ${i + 1} ${ch.principal[i]} vs ${disp(v)}`));
    assert.ok(Math.abs(ch.absMax - (isStress ? 1 : 2) * mag(res.absMax)) <= 1e-7 * (M.vec.frob(res.T) / fac || 1), `${what}: maximum shear`);
  }
});

test("every result written in the steps is the page's value at its digits", () => {
  for (const { what, st } of CASES) {
    const r = M.analyse(st), h = M.handCalc(st), d = st.view.digits;
    const isStress = r.stressDriven, res = isStress ? r.stress : r.strain, c = res.circle;
    const ref = M.vec.frob(res.T) || 1, snap = (x) => (Math.abs(x) <= 1e-12 * ref ? 0 : x);
    const V = (x) => M.fmt((isStress ? M.dStress : M.dStrain)(st, snap(x)), d), Mg = (x) => M.fmt((isStress ? M.dStressMag : M.dStrainMag)(st, snap(x)), d);
    const u = h.unit, ends = (e, t) => assert.ok(e.text.endsWith(` = ${t}`), `${what}: "${e.text}" ends with ${t}`);
    const circle = step(h, "circle");
    ends(circle.eqs[0], `${V(c.C)} ${u}`);
    ends(circle.eqs[2], `${Mg(c.R)} ${u}`);
    const p2 = step(h, "principal-2d"), ord = r.sign === 1 ? [c.max, c.min] : [c.min, c.max];
    ends(p2.eqs[0], `${V(ord[0])} ${u}`);
    ends(p2.eqs[1], `${V(ord[1])} ${u}`);
    if (!c.degenerate) ends(p2.eqs[3], `${M.fmt(c.thetaP, d)}°`);
    if (r.thetaView !== null) {
      const pt = M.pointAt(c, r.thetaView), rot = step(h, "rotated");
      ends(rot.eqs[0], `${V(pt.s)} ${u}`);
      ends(rot.eqs[1], `${V(pt.sOther)} ${u}`);
      ends(rot.eqs[2], `${V(pt.t)} ${u}`);
    } else {
      const tr = step(h, "traction");
      ends(tr.eqs[3], `${V(res.plane.sn)} ${u}`);
      ends(tr.eqs[4], `${Mg(res.plane.tau)} ${u}`);
    }
    const p3 = step(h, "principal-3d");
    assert.ok(p3.title.includes(res.principal.values.map((v, i) => `${isStress ? "σ" : "ε"}${i + 1} = ${V(v)}`).join(", ")), `${what}: ${p3.title}`);
    ends(p3.eqs.at(-1), `${Mg((isStress ? 1 : 2) * res.absMax)} ${u}`);
    for (const s of h.steps) for (const e of s.eqs) {
      assert.doesNotMatch(e.text, /NaN|undefined|Infinity|—/, `${what}: ${e.text}`);
      assert.doesNotMatch(e.tex, /NaN|undefined|Infinity|−|[σετγ]/, `${what}: TeX is plain TeX: ${e.tex}`);
    }
  }
});

test("the steps match closed-form references", () => {
  // Preset 1: σx = 80, σy = −40, τxy = 30 MPa, plane stress; θ = 30°.
  const one = M.handCalc(edit(1, (s) => { s.plane.angleDeg = 30; })).chain, R1 = Math.sqrt(60 ** 2 + 30 ** 2), t30 = Math.PI / 3;
  near(one.C, 20, "preset 1 C");
  near(one.R, R1, "preset 1 R");
  near(one.thetaP, (Math.atan(60 / 120) * 90) / Math.PI, "preset 1 θp");
  near(one.thetaS[0], (Math.atan(60 / 120) * 90) / Math.PI - 45, "preset 1 θs");
  near(one.rotated.s, 20 + 60 * Math.cos(t30) + 30 * Math.sin(t30), "preset 1 σx′");
  near(one.rotated.t, -60 * Math.sin(t30) + 30 * Math.cos(t30), "preset 1 τx′y′");
  [20 + R1, 0, 20 - R1].forEach((v, i) => near(one.principal[i], v, `preset 1 σ${i + 1}`));
  near(one.absMax, R1, "preset 1 τmax");
  // Pure shear: C = 0, R = τ, principal planes at 45°.
  const shear = M.handCalc(M.presetState(3)).chain;
  near(shear.C, 0, "pure shear C"); near(shear.R, 50, "pure shear R"); near(shear.thetaP, 45, "pure shear θp");
  // Preset 6: the cubic λ³ − 30λ² − 600λ + 8000 = 0 has roots 40, 10, −20.
  const six = M.handCalc(M.presetState(6)).chain;
  [30, -600, -8000].forEach((v, i) => near(six.invariants[`I${i + 1}`], v, `preset 6 I${i + 1}`));
  near(six.J2, 900, "preset 6 J2"); near(six.J3, 0, "preset 6 J3"); near(six.alphaDeg, 30, "preset 6 α");
  [40, 10, -20].forEach((v, i) => near(six.principal[i], v, `preset 6 σ${i + 1}`));
  near(six.absMax, 30, "preset 6 τmax");
  // Preset 6 on the plane n ∝ (1, 1, 1): σn = 110/3, τ = √(4300/3 − (110/3)²).
  const cos = M.handCalc(edit(6, (s) => { s.plane = { ...s.plane, mode: "cosines", l: 1, m: 1, n: 1 }; })).chain;
  near(cos.traction.sn, 110 / 3, "σn on (1,1,1)"); near(cos.traction.tau, Math.sqrt(4300 / 3 - (110 / 3) ** 2), "τ on (1,1,1)");
  // Preset 8: εx = 800, εy = −200, γxy = 200 με, plane stress with ν = 0.3.
  const st8 = M.presetState(8), eight = M.handCalc(st8);
  near(eight.chain.C, 300, "preset 8 C"); near(eight.chain.R, Math.hypot(500, 100), "preset 8 R");
  assert.ok(step(eight, "components").eqs.some((e) => e.text === "εxy = γxy/2 = 200/2 = 100 με"), "engineering shear halved");
  assert.ok(step(eight, "components").eqs.some((e) => e.text.startsWith("εz = −ν(εx + εy)/(1 − ν) = ") && e.text.endsWith(` = ${M.fmt((-0.3 * 600) / 0.7, 4)} με`)), "plane-stress εz");
  assert.equal(step(eight, "shear-2d").eqs[0].text, `γmax, in-plane = 2R = 2 × ${M.fmt(Math.hypot(500, 100), 4)} = ${M.fmt(2 * Math.hypot(500, 100), 4)} με`);
  // Plane strain: σz = ν(σx + σy) = 0.3 × 40 = 12 MPa joins the in-plane values.
  const ps = M.handCalc(edit(1, (s) => { s.constraint = "plane-strain"; }));
  assert.ok(step(ps, "components").eqs.some((e) => e.text === "σz = ν(σx + σy) = 0.3 × (80 + (−40)) = 12 MPa"));
  [20 + R1, 12, 20 - R1].forEach((v, i) => near(ps.chain.principal[i], v, `plane strain σ${i + 1}`));
});

test("the worked numbers read as a hand calculation: formula, then numbers, then result", () => {
  const h = M.handCalc(M.presetState(1));
  assert.deepEqual(plain(step(h, "circle").eqs.map((e) => e.text)), [
    "C = (σx + σy)/2 = (80 + (−40))/2 = 20 MPa",
    "D = (σx − σy)/2 = (80 − (−40))/2 = 60 MPa",
    "R = √(D² + τxy²) = √(60² + 30²) = 67.08 MPa",
  ]);
  assert.equal(step(h, "principal-2d").eqs[2].text, "2θp = atan2(2τxy, σx − σy) = atan2(2 × 30, 80 − (−40)) = atan2(60, 120) = 26.57°");
  assert.equal(step(h, "principal-3d").eqs[0].text, "σ1, σ2, σ3 = sort(87.08, −47.08, 0) = 87.08, 0, −47.08 MPa");
  assert.equal(step(h, "circle").eqs[0].tex, "C = \\frac{\\sigma_{x} + \\sigma_{y}}{2} = \\frac{80 + (-40)}{2} = 20\\ \\mathrm{MPa}");
});

test("a negative Poisson's ratio is bracketed where it is substituted", () => {
  const ez = step(M.handCalc(edit(8, (s) => { s.material.nu = -0.2; })), "components").eqs.find((e) => e.text.startsWith("εz"));
  assert.ok(ez.text.includes("= −(−0.2) × ("), ez.text);
  assert.ok(ez.text.includes("/(1 − (−0.2)) ="), ez.text);
  assert.ok(!ez.text.includes("−−") && !ez.tex.includes("- -"), ez.tex);
  const sz = step(M.handCalc(edit(1, (s) => { s.material.nu = -0.2; s.constraint = "plane-strain"; })), "components").eqs.find((e) => e.text.startsWith("σz"));
  assert.ok(sz.text.includes("= (−0.2) × (80 + (−40))"), sz.text);
});

test("an axis free of shear is narrated as a principal value, not as the third one", () => {
  const z = step(M.handCalc(M.presetState(1)), "principal-3d").narration;
  assert.match(z, /^The z axis carries no shear, so its normal stress, .+, is a principal value and joins the two in-plane values\. /);
  const one = step(M.handCalc(edit(6, (s) => { s.plane.axis = "1"; })), "principal-3d").narration;
  assert.match(one, /^Principal axis 1 is itself principal, so its normal stress, .+, joins the two in-plane values\. /);
  for (const n of [z, one]) assert.ok(!/third principal|axis 1 axis/.test(n), n);
});

test("the hand calculations export as a narrated Markdown deck, and join the page's beamdswitch deck", () => {
  for (const { what, st } of CASES) {
    const md = T.deck(M.handReport(st)), deck = checkDeck(md, what), h = M.handCalc(st);
    assert.match(md, /^---\ntitle: Mohr's circle hand calculations: /, what);
    assert.equal(deck.meta.voice, "bf_emma", what);
    const results = deck.frames.filter((f) => f.kind === "frame" && f.section === "Results").map((f) => f.title);
    const titles = plain(M.handFrames(st).map((f) => f.title));
    assert.deepEqual(results, titles, what);
    // A frame title that wraps to a second line runs into the frame's body in beamdswitch.
    for (const x of titles) assert.ok(x.length <= 60, `${what}: frame title too long for one line: ${x}`);
    // One frame per step, but the 3D cubic takes three: the invariants, its solution, the values.
    assert.deepEqual([...new Set(titles.map((x) => Number(/^Hand calculation (\d+): /.exec(x)[1])))], plain(h.steps.map((s, i) => i + 1)), what);
    for (const s of h.steps) for (const e of s.eqs) for (const part of e.texParts) assert.ok(md.includes(part), `${what}: ${part}`);
    const full = parseDeck(T.deck(M.beamdswitchReport(st)));
    assert.deepEqual(full.frames.filter((f) => f.kind === "frame" && /^Hand calculation \d+: /.test(f.title)).map((f) => [f.section, f.title]), titles.map((x) => ["Results", x]), `${what}: in the page's deck`);
  }
});

/* ---------- the page ---------- */
function page(opts = {}) {
  const p = standIn(opts);
  p.run(html);
  p.status = () => p.$("hand-msg").textContent;
  return p;
}

test("the page shows the hand calculations for its state", () => {
  const p = page(), body = p.$("hand-body").innerHTML;
  for (const s of M.handCalc(M.defaultState()).steps) assert.ok(body.includes(s.title.replace(/'/g, "'")), s.title);
  assert.ok(body.includes('<div class="eq" role="math">C = (σx + σy)/2 = (80 + (−40))/2 = 20 MPa</div>'));
});

test("Save Markdown saves the hand calculations, and Copy Markdown copies the same text", async () => {
  const p = page(), want = T.deck(M.handReport(M.defaultState()));
  await p.$("save-hand").fire("click");
  assert.equal(p.status(), "Saved mohr-hand-calculations.md. It also opens in beamdswitch as a narrated deck.");
  const [file] = p.saved;
  assert.equal(file.name, "mohr-hand-calculations.md");
  assert.equal(file.blob.type, "text/markdown");
  assert.equal(await file.blob.text(), want);
  await p.$("copy-hand").fire("click");
  assert.equal(p.status(), "Copied the hand calculations as Markdown.");
  assert.equal(p.copied[0], want);
});

test("blocked downloads and clipboard fall back to Copy Markdown and a text to copy by hand", async () => {
  const p = page({ saveFails: true, clipboardFails: true });
  await p.$("save-hand").fire("click");
  assert.equal(p.status(), "Could not save: downloads are blocked. Use Copy Markdown instead.");
  await p.$("copy-hand").fire("click");
  assert.equal(p.$("fallback").hidden, false);
  assert.equal(p.$("fallback-label").textContent, "Clipboard access is blocked; the hand calculations are selected below. Press Ctrl+C or ⌘C.");
  checkDeck(p.$("fallback-text").value, "fallback");
});
