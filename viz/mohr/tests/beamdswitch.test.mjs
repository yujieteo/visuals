import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { checkDeck, checkDeckPlots, parseDeck, standIn } from "./beamdswitch-deck-checks.mjs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const script = (id) => new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`).exec(html)[1];
// The engine and the inlined template, as the page runs them.
const ctx = vm.createContext({});
ctx.self = ctx;
vm.runInContext(script("mohr-engine"), ctx);
vm.runInContext(script("mohr-beamdswitch"), ctx);
const M = ctx.Mohr, T = ctx.Beamdswitch;

/* Every preset, then the conventions, units, planes, criteria and failure modes the page offers. */
const edit = (id, f) => { const s = M.presetState(id); f(s); return s; };
const CASES = [
  ...M.PRESETS.map((p) => [`preset ${p.id}`, M.presetState(p.id)]),
  ["compression positive, convention B", edit(1, (s) => { s.conventions.normalSign = "compression-positive"; s.conventions.shear2D = "B"; })],
  ["GPa and %, 6 digits", edit(6, (s) => { s.units = { stress: "GPa", strain: "%" }; s.view.digits = 6; })],
  ["ksi and mm/mm, tensor shear", edit(8, (s) => { s.units = { stress: "ksi", strain: "mm/mm" }; s.conventions.strainShear = "tensor"; })],
  ["psi, plane strain", edit(1, (s) => { s.units.stress = "psi"; s.constraint = "plane-strain"; })],
  ["rotation about x", edit(6, (s) => { s.plane.axis = "x"; s.plane.angleDeg = 30; })],
  ["rotation about principal axis 1", edit(6, (s) => { s.plane.axis = "1"; s.plane.angleDeg = -20; })],
  ["plane by direction cosines", edit(6, (s) => { s.plane = { ...s.plane, mode: "cosines", l: 1, m: 1, n: 1 }; })],
  ["von Mises, failing", edit(1, (s) => { s.failure = { ...s.failure, criterion: "von-mises", sigmaY: 100 }; })],
  ["Rankine", edit(1, (s) => { s.failure = { ...s.failure, criterion: "rankine", sigmaT: 60, sigmaC: 200 }; })],
  ["Mohr-Coulomb with a cutoff", edit(1, (s) => { s.failure = { ...s.failure, criterion: "mohr-coulomb", c: 50, phiDeg: 25, tensionCutoff: 70 }; })],
  ["principal entry", edit(1, (s) => { s.entryMode = "principal"; s.constraint = "general"; s.principal = { s1: 120, s2: 30, s3: -45 }; })],
  ["invalid material, stress-driven", edit(1, (s) => { s.material.nu = 0.7; })],
  ["invalid material, strain-driven", edit(8, (s) => { s.material.E = 0; })],
  ["zero tensor", edit(1, (s) => { s.stress = { sx: 0, sy: 0, sz: 0, txy: 0, tyz: 0, tzx: 0 }; })],
].map(([what, st]) => ({ what, st }));
const deckFor = (st) => T.deck(M.beamdswitchReport(st));

test("every state's deck opens in beamdswitch as the standard template, narrated on every slide", () => {
  for (const { what, st } of CASES) {
    const { deck } = checkDeckPlots(deckFor(st), what);
    assert.match(deck.meta.title, /^Mohr's circle analysis: (plane stress|plane strain|general 3D), (stress|strain)-driven$/, what);
  }
});

test("the principal values, circles and failure check are the page's, in its digits, units and sign", () => {
  for (const { what, st } of CASES) {
    const md = deckFor(st), { deck, plots } = checkDeckPlots(md, what), r = M.analyse(st), d = st.view.digits;
    const snap = (x, ref) => (Math.abs(x) <= 1e-12 * ref ? 0 : x);
    for (const [res, isStress] of [[r.stress, true], [r.strain, false]]) {
      if (!res) { assert.ok(!deck.frames.some((f) => f.title.startsWith(`Principal ${isStress ? "stresses" : "strains"}`)), `${what}: no ${isStress ? "stress" : "strain"} side`); continue; }
      const ref = M.vec.frob(res.T) || 1, show = (v) => (isStress ? M.dStress : M.dStrain)(st, snap(v, ref)), mag = (v) => (isStress ? M.dStressMag : M.dStrainMag)(st, snap(v, ref));
      const sym = isStress ? "σ" : "ε", unit = isStress ? st.units.stress : M.STRAIN_LABEL[st.units.strain];
      const title = `Principal ${isStress ? "stresses" : "strains"}: ${res.principal.values.map((v, i) => `${sym}${i + 1} = ${M.fmt(show(v), d)}`).join(", ")} ${unit}`;
      const i = deck.frames.findIndex((f) => f.title === title);
      assert.ok(i > 0, `${what}: ${title}`);
      // The three circles: each curve peaks at its radius over its centre.
      const circles = plots.find((p) => p.frame === deck.frames[i]).spec.curves;
      res.circles.forEach((k, j) => {
        const C = show(k.centre), R = mag(k.radius);
        assert.ok(Math.abs(circles[j].f(C) - R) <= 1e-9 * Math.max(1, R), `${what}: circle ${k.i}–${k.j}`);
        if (R > 0) assert.ok(Math.abs(circles[j].f(C + R * 0.6) - R * 0.8) <= 1e-9 * R, `${what}: circle ${k.i}–${k.j} shape`);
      });
    }
    const drivenRes = r.stressDriven ? r.stress : r.strain, c = drivenRes.circle;
    const ref = M.vec.frob(drivenRes.T) || 1, show = (v) => (r.stressDriven ? M.dStress : M.dStrain)(st, Math.abs(v) <= 1e-12 * ref ? 0 : v);
    const mag = (v) => (r.stressDriven ? M.dStressMag : M.dStrainMag)(st, Math.abs(v) <= 1e-12 * ref ? 0 : v);
    const two = deck.frames.find((f) => f.title.startsWith(`The 2D ${r.stressDriven ? "stress" : "strain"} circle about`));
    assert.ok(two.title.includes(`C = ${M.fmt(show(c.C), d)}, R = ${M.fmt(mag(c.R), d)}`), `${what}: ${two.title}`);
    const [up, down] = plots.find((p) => p.frame === two).spec.curves;
    assert.ok(Math.abs(up.f(show(c.C)) - mag(c.R)) <= 1e-9 * Math.max(1, mag(c.R)) && Math.abs(down.f(show(c.C)) + mag(c.R)) <= 1e-9 * Math.max(1, mag(c.R)), `${what}: 2D circle`);
    if (r.failure) {
      const fos = M.fosText(r.failure.fos, d);
      assert.ok(deck.frames.some((f) => f.title === `${M.CRITERION_NAME[st.failure.criterion]}: FoS ${fos}, ${r.failure.pass ? "PASS" : "FAIL"}`), `${what}: failure check`);
      assert.ok(md.includes(` ${M.CRITERION_NAME[st.failure.criterion]} FoS ${fos}, ${r.failure.pass ? "PASS" : "FAIL"}.\n:::`), `${what}: the takeaway`);
    } else assert.ok(deck.frames.some((f) => f.title.endsWith("needs the stress tensor")), `${what}: no failure check without stress`);
    for (const w of r.warnings) assert.ok(md.includes(`- Warning: ${w.message}`), `${what}: ${w.message}`);
  }
});

test("the narration reads the numbers in the page's units and sign convention", () => {
  const said = (st) => parseDeck(deckFor(st)).frames.map((f) => f.narration).join(" ");
  const one = said(M.presetState(1));
  assert.match(one, /The principal stresses are 87\.08 megapascals, 0 megapascals and minus 47\.08 megapascals\./);
  assert.match(one, /the Tresca criterion gives a factor of safety of 1\.863\./);
  assert.match(one, /sigma x equal to 80 megapascals, sigma y equal to minus 40 megapascals and tau x y equal to 30 megapascals/);
  const comp = said(CASES.find((c) => c.what === "compression positive, convention B").st);
  assert.match(comp, /The principal stresses are 47\.08 megapascals, 0 megapascals and minus 87\.08 megapascals\./);
  assert.match(comp, /with compression positive/);
  assert.match(said(CASES.find((c) => c.what === "GPa and %, 6 digits").st), /gigapascals/);
  assert.match(said(M.presetState(8)), /The principal strains are 809\.9 microstrain, minus 209\.9 microstrain and minus 257\.1 microstrain\./);
});

/* ---------- the page's buttons ---------- */
function page(opts = {}) {
  const p = standIn(opts);
  p.run(html);
  p.status = () => p.$("io-msg").textContent;
  return p;
}

test("the beamdswitch button saves the state's deck, and Copy deck copies the same deck", async () => {
  const p = page();
  await p.$("save-beamdswitch").fire("click");
  assert.equal(p.status(), "Saved mohr-beamdswitch.md: open it in beamdswitch.");
  const [file] = p.saved;
  assert.equal(file.name, "mohr-beamdswitch.md");
  assert.equal(file.blob.type, "text/markdown");
  const md = await file.blob.text();
  assert.match(checkDeck(md, "saved").meta.title, /^Mohr's circle analysis: /);
  await p.$("copy-beamdswitch").fire("click");
  assert.equal(p.status(), "Copied the beamdswitch deck: paste it into beamdswitch.");
  assert.equal(p.copied[0], md);
  assert.equal(p.$("fallback-text").value, "", "nothing in the fallback panel");
});

test("a blocked download says to use Copy deck, and a blocked clipboard shows the deck to copy by hand", async () => {
  const p = page({ saveFails: true, clipboardFails: true });
  await p.$("save-beamdswitch").fire("click");
  assert.equal(p.status(), "Could not save: downloads are blocked. Use Copy deck instead.");
  assert.equal(p.saved.length, 0);
  await p.$("copy-beamdswitch").fire("click");
  assert.equal(p.$("fallback").hidden, false);
  assert.equal(p.$("fallback-label").textContent, "Clipboard access is blocked; the deck is selected below. Press Ctrl+C or ⌘C.");
  checkDeck(p.$("fallback-text").value, "fallback");
  assert.equal(p.copied.length, 0);
});
