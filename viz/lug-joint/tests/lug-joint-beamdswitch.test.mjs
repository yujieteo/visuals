import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { checkDeck, plotsOf, standIn } from "./beamdswitch-deck-checks.mjs";

const require = createRequire(import.meta.url);
const L = require("../engine.js");
const T = require("../beamdswitch.js");
const raw = require("../raw.json");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

const oblique = raw.examples.find((e) => e.id === "oblique-demo").input;
const joint = (over = {}) => {
  const x = L.normalise({ ...oblique, ...over, load: { ...oblique.load, ...(over.load || {}) } });
  for (const m of ["female", "male"]) Object.assign(x[m], (over.members || {})[m] || {});
  return x;
};
/* Joints that reach every branch of the report: the page's examples, a transverse load, unbushed members,
   a pin strong in bending, low ductility with B and B0.05, and a wT left blank. */
const JOINTS = {
  ...Object.fromEntries(raw.examples.map((e) => [e.id, L.normalise(e.input)])),
  transverse: joint({ load: { alpha: 90 } }),
  unbushed: joint({ members: { female: { bushed: false }, male: { bushed: false } } }),
  "strong pin": joint({ load: { alpha: 0 }, pin: { FtuP: 2000, FsuP: 1200, kbP: 1.56 } }),
  "low ductility": joint({ members: { male: { eu: 0.03, B: 0.9, B005: 1 } } }),
  "blank tang width": joint({ members: { female: { wT: null } } }),
};
const UNITS = [...L.PRESETS.map((p) => p.units), { force: "kN", length: "mm", stress: "GPa" }];
const CASES = Object.entries(JOINTS).flatMap(([name, x]) => UNITS.map((units) => ({ x: { ...x, units }, what: `${name} ${Object.values(units).join(" ")}` })));
const fsText = (v) => (v == null ? "—" : v === Infinity ? "∞" : v.toFixed(3));
const msText = (v) => (v == null ? "—" : v === Infinity ? "∞" : (v >= 0 ? "+" : "") + v.toFixed(3));

test("the deck for every joint and unit convention parses in beamdswitch into the standard template, narrated on every slide", () => {
  for (const { x, what } of CASES) {
    const deck = checkDeck(T.deck(L.jointReport(x)), what);
    assert.match(deck.meta.title, /^Lug and pin joint: (axial|oblique|transverse) load at α = /, what);
    assert.equal(plotsOf(deck).length, x.load.alpha > 0 ? 1 : 0, `${what}: the Eq. 9-31 plot only under a transverse component`);
  }
});

test("the numbers in the deck are the solver's, in the chosen units and the page's digits", () => {
  for (const { x, what } of CASES) {
    const r = L.solve(x), md = T.deck(L.jointReport(x));
    const n = (v) => (v == null ? "—" : L.fmt(L.fromCanonical(v, "force", x.units.force)));
    for (const row of r.rows) {
      const line = `| ${row.mode}${row === r.controlling.ultimate ? " ◂" : ""} | ${row.eq} | ${n(row.allowable)} | ${n(row.ultLoad)} | ${fsText(row.FSu)} | ${msText(row.MSu)} | ${fsText(row.FSy)} | ${msText(row.MSy)} |`;
      assert.ok(md.includes(line), `${what}: ${line}`);
    }
    assert.ok(md.includes(`## Joint allowable Pall = ${n(r.joint.Pall)} ${x.units.force} (Eq. ${r.joint.PallEq}), ${r.joint.PallMode}`), what);
    assert.ok(md.includes(`## Controlling mode: ${r.controlling.ultimate.mode}, ultimate MS ${msText(r.controlling.ultimate.MSu)}`), what);
    assert.ok(md.includes(`## Yield cap ${L.fmt(r.cap)}; factored loads ${n(r.loads.Pu)} ${x.units.force} ultimate`), what);
    const tests = L.selfTests();
    assert.ok(md.includes(`## Self-tests: ${tests.filter((t) => t.pass).length} of ${tests.length} pass`), what);
  }
});

test("the plotted interaction is the page's Eq. 9-31 curve", () => {
  const [plot] = plotsOf(checkDeck(T.deck(L.jointReport(JOINTS["oblique-demo"])), "oblique"));
  assert.deepEqual(plot.x, [0, 1]);
  for (const [px, py] of L.interactionCurve(90)) assert.ok(Math.abs(plot.curves[0].f(px) - py) <= 1e-12, `${px}: ${plot.curves[0].f(px)} vs ${py}`);
});

test("the narration reads the joint in words and units", () => {
  const said = (x) => checkDeck(T.deck(L.jointReport(x)), "narration").frames.map((f) => f.narration).join(" ");
  const si = said(JOINTS["sec-9-6"]);
  assert.match(si, /The ultimate load is 133400 newtons, along the lug axis, with an ultimate factor of 1\.5 and a fitting factor of 1\.15\./);
  assert.match(si, /The controlling ultimate mode is pin bending, stage 2 \(load shift\): an allowable of 168300 newtons/);
  const us = said({ ...JOINTS["sec-9-6"], units: { force: "lbf", length: "in", stress: "psi" } });
  assert.match(us, /The hole is 1 inches across and the pin 0\.75 inches/);
  assert.match(us, /The joint allows 37850 pounds-force\./);
});

test("a joint the page cannot solve has no report", () => {
  assert.equal(L.jointReport(joint({ load: { alpha: 120 } })), null);
});

/* ---------- the page's buttons ---------- */
function page(opts) {
  const p = standIn(opts);
  p.run(html);
  return p;
}
const cells = (tr) => [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").trim());

test("the beamdswitch button saves the page's joint as a deck whose numbers match the page", async () => {
  for (const [example, units] of [["sec-9-6", "N-mm-MPa"], ["oblique-demo", "kip-in-ksi"], ["oblique-demo", "N-m-Pa"]]) {
    const p = page(), what = `${example} ${units}`;
    Object.assign(p.$("example"), { value: example });
    await p.$("example").fire("change");
    Object.assign(p.$("preset"), { value: units });
    await p.$("preset").fire("change");
    await p.$("save-beamdswitch").fire("click");
    assert.equal(p.$("deck-status").textContent, "Saved lug-joint-beamdswitch.md: open it in beamdswitch.", what);
    const [file] = p.saved;
    assert.equal(file.name, "lug-joint-beamdswitch.md");
    assert.equal(file.blob.type, "text/markdown");
    const md = await file.blob.text();
    checkDeck(md, what);
    assert.ok(md.includes(`- Units: ${Object.values(L.PRESETS.find((q) => q.id === units).units).join(", ")}`), what);
    // Each row of the page's failure-mode table, as the page shows it, is a row of one of the deck's tables;
    // the deck leaves out the yield allowable and yield load columns so each table fits on a slide.
    const rows = [...p.$("modes").innerHTML.matchAll(/<tr[^>]*>(<td[\s\S]*?)<\/tr>/g)].map((m) => cells(m[1]));
    assert.ok(rows.length > 10, what);
    for (const row of rows) assert.ok(md.includes(`| ${row.filter((_, i) => i !== 6 && i !== 7).join(" | ")} |`), `${what}: ${row}`);
    const [pall] = [...p.$("stats").innerHTML.matchAll(/<b>([^<]*)<\/b>/g)].map((m) => m[1]);
    assert.ok(md.includes(`Pall = ${pall}`), `${what}: ${pall}`);
  }
});

test("Copy deck copies the same deck, and saving falls back to the clipboard when it is blocked", async () => {
  const p = page();
  await p.$("copy-beamdswitch").fire("click");
  assert.equal(p.$("deck-status").textContent, "Copied the beamdswitch deck: paste it into beamdswitch.");
  await p.$("save-beamdswitch").fire("click");
  assert.equal(p.copied[0], await p.saved[0].blob.text());

  const blocked = page({ saveFails: true });
  await blocked.$("save-beamdswitch").fire("click");
  assert.equal(blocked.$("deck-status").textContent, "Copied the beamdswitch deck, as saving is blocked here: paste it into beamdswitch.");
  checkDeck(blocked.copied[0], "copied");

  const neither = page({ saveFails: true, clipboardFails: true });
  await neither.$("save-beamdswitch").fire("click");
  assert.equal(neither.$("deck-status").textContent, "Could not save or copy the beamdswitch deck here.");
  await neither.$("copy-beamdswitch").fire("click");
  assert.equal(neither.$("deck-status").textContent, "Copy failed: the browser blocked clipboard access.");
});

test("nothing is saved or copied while the joint cannot be solved", async () => {
  const p = page();
  await p.$("inputs").fire("input", { dataset: { sec: "geometry", key: "D" }, type: "number", value: "" });
  await p.$("save-beamdswitch").fire("click");
  assert.equal(p.$("deck-status").textContent, "Fix the inputs first: there is no solution to save.");
  await p.$("copy-beamdswitch").fire("click");
  assert.equal(p.$("deck-status").textContent, "Fix the inputs first: there is no solution to copy.");
  assert.equal(p.saved.length + p.copied.length, 0);
});
