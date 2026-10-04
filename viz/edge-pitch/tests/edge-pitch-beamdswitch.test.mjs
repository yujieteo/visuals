import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { checkDeck, plotsOf, standIn, Element } from "./beamdswitch-deck-checks.mjs";

const require = createRequire(import.meta.url);
const E = require("../engine.js");
const T = require("../beamdswitch.js");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

const joint = (patch = {}) => {
  const x = E.example();
  for (const [path, v] of Object.entries(patch)) E.set(x, path, v);
  return x;
};
/* Joints that reach every branch of the report: rows across and along the load, stagger, one row,
   bearing outside the tabulated range, a countersunk head, an entered sheet stress, one fastener along the load. */
const JOINTS = {
  example: joint(),
  staggered: joint({ "geometry.pattern": "staggered", "geometry.g": 8, "sheet.W": 127.2 }),
  along: joint({ "load.direction": "parallel" }),
  "single row": joint({ "geometry.pattern": "single", "geometry.rows": 1 }),
  "short end distance": joint({ "geometry.eEnd": 6.5 }),
  countersunk: joint({ "fastener.head": "countersunk", "fastener.csk": 1.2, "fastener.type": "bolt" }),
  "entered stress": joint({ "load.sigmaSheet": 260 }),
};
const CASES = Object.entries(JOINTS).flatMap(([name, x]) => ["SI", "US"].map((units) => ({ name, x, units, what: `${name} ${units}` })));
const deckFor = (x, units) => T.deck(E.jointReport(x, units));

test("the deck for every joint and unit system parses in beamdswitch into the standard template, narrated on every slide", () => {
  for (const { x, units, what } of CASES) {
    const deck = checkDeck(deckFor(x, units), what);
    assert.match(deck.meta.title, /^Edge margin and pitch: /, what);
    assert.equal(plotsOf(deck).length, 1, `${what}: the e/D margin plot`);
  }
});

test("the numbers in the deck are the solver's, in the page's units and digits", () => {
  for (const { x, units, what } of CASES) {
    const r = E.solve(x), md = deckFor(x, units);
    const u = (v, kind) => (v == null ? "—" : `${E.fmt(E.toDisplay(v, kind, units))} ${E.unitSym(kind, units)}`);
    const m = (v) => (v == null ? "—" : E.fmt(v));
    for (const c of r.strength) {
      const row = `| ${c.title} | ${c.allowable == null ? c.status || "—" : u(c.allowable, c.kind)} | ${u(c.applied, c.kind)} | ${m(c.ms)} |`;
      assert.ok(md.includes(row), `${what}: ${row}`);
    }
    for (const c of r.geometric) assert.ok(md.includes(`| ${c.title} | ${m(c.actual)} | ${m(c.minimum)} | ${m(c.ms)} | ${m(c.ratioToTypical)} |`), `${what}: ${c.title}`);
    const g = r.governing;
    assert.ok(md.includes(`## Governing strength mode: ${g ? `${g.title}, MS = ${m(g.ms)}` : "none evaluated"}`), what);
    assert.ok(md.includes(`## Geometric margins: ${r.governingGeom.title}, MS_geom = ${m(r.governingGeom.ms)}`), what);
    assert.ok(md.includes(`## Equal load share: ${u(r.derived.Pf, "force")} per fastener`), what);
    const tests = E.selfTests();
    assert.ok(md.includes(`## Self-test: ${tests.filter((t) => t.pass).length} of ${tests.length} checks pass`), what);
  }
});

test("the plotted margins are the solver's own bearing and shear-out sweep", () => {
  for (const { x, units, what } of CASES) {
    const [plot] = plotsOf(checkDeck(deckFor(x, units), what));
    assert.deepEqual(plot.x, [1.5, 3], what);
    for (const p of E.sweepED(x, 60, 1.5, 3)) {
      const [bearing, shearOut] = plot.curves.map((c) => c.f(p.eD));
      assert.ok(Math.abs(bearing - p.bearing) <= 1e-9 * Math.max(1, Math.abs(p.bearing)), `${what} bearing at e/D = ${p.eD}: ${bearing} vs ${p.bearing}`);
      assert.ok(Math.abs(shearOut - p.shearOut) <= 1e-9 * Math.max(1, Math.abs(p.shearOut)), `${what} shear-out at e/D = ${p.eD}: ${shearOut} vs ${p.shearOut}`);
    }
  }
});

test("the narration reads the joint in words and units", () => {
  const said = checkDeck(deckFor(JOINTS.example, "SI"), "example").frames.map((f) => f.narration).join(" ");
  assert.match(said, /The joint has 2 rows of 5 solid rivets, 10 in all, of diameter 4\.8 millimetres in holes of 4\.9 millimetres\./);
  assert.match(said, /Every fastener takes an equal share of the load, 1000 newtons\./);
  assert.match(said, /The governing strength mode is inter-rivet buckling: an allowable of 243\.7 megapascals against 54\.25 megapascals applied, a margin of 3\.492\./);
  const us = checkDeck(deckFor(JOINTS.example, "US"), "example US").frames.map((f) => f.narration).join(" ");
  assert.match(us, /of diameter 0\.189 inches/);
  assert.match(us, /kips per square inch/);
});

test("a joint the page cannot solve has no report", () => {
  assert.equal(E.jointReport(joint({ "sheet.t": -1 })), null);
});

/* ---------- the page's buttons ---------- */
async function page(opts = {}) {
  const unitButtons = ["SI", "US"].map((units) => Object.assign(new Element("button"), { dataset: { units } }));
  const p = standIn({ ...opts, select: (s) => (s === "[data-units]" ? unitButtons : []) });
  p.run(html);
  p.units = (u) => unitButtons.find((b) => b.dataset.units === u).fire("click");
  return p;
}
const cells = (tr) => [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1].replace(/<span class="muted">\([^)]*\)<\/span>/g, "").replace(/<[^>]+>/g, "").trim());

test("the beamdswitch button saves the page's joint as a deck whose numbers match the page", async () => {
  for (const units of ["SI", "US"]) {
    const p = await page();
    await p.units(units);
    await p.$("save-beamdswitch").fire("click");
    assert.equal(p.$("status").textContent, "Saved edge-pitch-beamdswitch.md: open it in beamdswitch.", units);
    const [file] = p.saved;
    assert.equal(file.name, "edge-pitch-beamdswitch.md");
    assert.equal(file.blob.type, "text/markdown");
    const md = await file.blob.text();
    checkDeck(md, units);
    assert.match(md, units === "US" ? /^- Units: in, lbf, ksi$/m : /^- Units: mm, N, MPa$/m);
    // Each row of the page's strength table, as the page shows it, is a row of the deck's table.
    const rows = [...p.$("strength").innerHTML.matchAll(/<tr[^>]*>(<td[\s\S]*?)<\/tr>/g)].map((m) => cells(m[1]));
    assert.equal(rows.length, 7, units);
    for (const [title, allowable, applied, ms] of rows) assert.ok(md.includes(`| ${title} | ${allowable} | ${applied} | ${ms} |`), `${units}: ${title}`);
    const stats = [...p.$("stats").innerHTML.matchAll(/<b[^>]*>([^<]*)<\/b>/g)].map((m) => m[1]);
    assert.ok(md.includes(`MS = ${stats[0]}`) && md.includes(`MS_geom = ${stats[1]}`) && md.includes(`${stats[2]} per fastener`), `${units}: ${stats}`);
  }
});

test("Copy deck copies the same deck, and saving falls back to the clipboard when it is blocked", async () => {
  const p = await page();
  await p.$("copy-beamdswitch").fire("click");
  assert.equal(p.$("status").textContent, "Copied the beamdswitch deck: paste it into beamdswitch.");
  await p.$("save-beamdswitch").fire("click");
  assert.equal(p.copied[0], await p.saved[0].blob.text());

  const blocked = await page({ saveFails: true });
  await blocked.$("save-beamdswitch").fire("click");
  assert.equal(blocked.$("status").textContent, "Copied the beamdswitch deck, as saving is blocked here: paste it into beamdswitch.");
  assert.equal(blocked.saved.length, 0);
  checkDeck(blocked.copied[0], "copied");

  const neither = await page({ saveFails: true, clipboardFails: true });
  await neither.$("save-beamdswitch").fire("click");
  assert.equal(neither.$("status").textContent, "Could not save or copy the beamdswitch deck here.");
  await neither.$("copy-beamdswitch").fire("click");
  assert.equal(neither.$("status").textContent, "Copy failed: the browser blocked clipboard access.");
});

test("nothing is saved or copied while the joint cannot be solved", async () => {
  const p = await page();
  Object.assign(p.$("in-sheet-t"), { value: "" });
  await p.$("in-sheet-t").fire("input");
  await p.$("save-beamdswitch").fire("click");
  assert.equal(p.$("status").textContent, "Fix the joint first: there is no solution to save.");
  await p.$("copy-beamdswitch").fire("click");
  assert.equal(p.$("status").textContent, "Fix the joint first: there is no solution to copy.");
  assert.equal(p.saved.length + p.copied.length, 0);
});
