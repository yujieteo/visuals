import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { loadCore, HTML_URL } from "../tools/core.mjs";
import { checkDeck, standIn, Element } from "./beamdswitch-deck-checks.mjs";

const html = fs.readFileSync(HTML_URL, "utf8");
const F = loadCore();
// The core scripts include the shared template, which defines Beamdswitch beside FBD.
const T = (() => { const ctx = vm.createContext({}); for (const m of html.matchAll(/<script\b[^>]*\bdata-core\b[^>]*>([\s\S]*?)<\/script>/g)) vm.runInContext(m[1], ctx); return ctx.Beamdswitch; })();
const EXAMPLES = JSON.parse(fs.readFileSync(new URL("../examples.json", import.meta.url), "utf8")).examples;
const doc = (drawing) => { const r = F.load(structuredClone(drawing)); assert.equal(r.errors.length, 0); return r.doc; };
const imperial = (d) => { const x = structuredClone(d); x.view.units = { system: "imperial", length: "in", force: "lbf", moment: "lbf·in", distributed: "lbf/in" }; return x; };
const DOCS = {
  ...Object.fromEntries(EXAMPLES.map((e) => [e.id, doc(e.drawing)])),
  "cantilever in imperial units": imperial(doc(EXAMPLES[0].drawing)),
  "new drawing": F.newDoc(),
};
const deckFor = (d) => T.deck(F.beamdswitchReport(d));
const section = (md, heading) => md.split(`\n## ${heading}\n`)[1].split("\n## ")[0];
const tableRows = (text) => text.split("\n").filter((l) => /^\| (?!---|ID \|)/.test(l));

test("the deck for every reference drawing parses in beamdswitch into the standard template, narrated on every slide", () => {
  for (const [name, d] of Object.entries(DOCS)) {
    const deck = checkDeck(deckFor(d), name);
    assert.equal(deck.meta.title, `Free body diagram: ${d.title}`, name);
  }
});

test("the deck's schedules are the drawing's own, as the Markdown file writes them", () => {
  for (const [name, d] of Object.entries(DOCS)) {
    const md = deckFor(d), saved = F.toMarkdown(d);
    for (const [heading, rows] of [["Loads", tableRows(section(saved, "Loads"))], ["Bodies", tableRows(section(saved, "Bodies"))], ["Supports", tableRows(section(saved, "Supports"))], ["Axes", tableRows(section(saved, "Axes")).filter((r) => !r.startsWith("| Setting"))]])
      for (const row of rows) assert.ok(md.includes(row), `${name} ${heading}: ${row}`);
    // The drawing itself, exactly as the Markdown file embeds it.
    assert.ok(md.includes(`](${F.svgDataUri(F.exportSVG(d, { background: "white" }))})`), `${name}: the drawing`);
    for (const b of d.geometry.bodies.filter((x) => x.type === "line" && x.role === "dimension"))
      assert.ok(md.includes(`- ${b.id}`) && md.includes(`${F.formatQuantity(F.memberLength(d, b), "length", d.view.units.length)} between`), `${name}: dimension ${b.id}`);
  }
});

test("the narration reads the drawing in words and units", () => {
  const said = (d) => checkDeck(deckFor(d), "narration").frames.map((f) => f.narration).join(" ");
  const si = said(DOCS.cantilever);
  assert.match(si, /The drawing has 1 member, 2 joints, 3 applied loads, 3 reactions and 1 support\./);
  assert.match(si, /Body b1 is a beam 3 metres long at 0 degrees\./);
  assert.match(si, /Force f1, labelled P: applied, 10 kilonewtons, at minus 90 degrees, on b1, 2 metres from j1\./);
  assert.match(si, /Distributed load q1, labelled w: applied, 2 kilonewtons per metre, acting perpendicular to the member, along b1 from 0 metres to 3 metres from j1\./);
  assert.match(si, /Moment m2, labelled M A: a reaction, no magnitude set, counter-clockwise, at joint j1\./);
  assert.match(si, /Support s1 is a fixed support at joint j1\./);
  assert.match(si, /Dimension b2 measures 3 metres\./);
  const us = said(DOCS["cantilever in imperial units"]);
  assert.match(us, /Body b1 is a beam 118\.11 inches long/);
  // A load that sets its own unit keeps it, as the schedule does.
  assert.match(us, /Force f1, labelled P: applied, 10 kilonewtons, at minus 90 degrees, on b1, 78\.7402 inches from j1\./);
  assert.match(said(DOCS["inclined-plane"]), /Angles are measured from the x prime axis towards the y prime axis, which is counter-clockwise on the page, and the x prime axis is turned 30 degrees/);
  assert.match(said(DOCS["freeform-plate"]), /Force f3, labelled theta: applied, no magnitude set, at 0 degrees, on b1, 500 millimetres from j4\./);
});

test("a schedule longer than a slide is split over several slides, each narrated", () => {
  // The aircraft plate has 18 joints: three slides of at most seven.
  const deck = checkDeck(deckFor(DOCS["aircraft-top"]), "aircraft");
  const joints = deck.frames.filter((f) => f.title.startsWith("Joints, measured from the axes origin"));
  assert.deepEqual(joints.map((f) => f.title.replace(/^.*\(/, "(")), ["(1 of 3)", "(2 of 3)", "(3 of 3)"]);
  assert.equal(joints.map((f) => (f.narration.match(/Joint j\w+ is at /g) || []).length).reduce((x, y) => x + y), 18);
  assert.ok(deck.frames.some((f) => f.title === "Markers: 1 centre of gravity"));
  // An empty drawing still has one slide per schedule, saying it is empty.
  const empty = checkDeck(deckFor(DOCS["new drawing"]), "empty").frames.map((f) => f.narration).join(" ");
  assert.match(empty, /The drawing has no bodies yet\. The drawing has no joints yet\./);
  assert.match(empty, /No loads are drawn\. No supports are drawn\./);
});

/* ---------- the page's File menu ---------- */
function page(opts) {
  const p = standIn({ ...opts, globals: { localStorage: { getItem: () => null, setItem() {} }, innerWidth: 800, innerHeight: 600, confirm: () => true, CSS: { escape: (s) => s } } });
  for (const m of html.matchAll(/<script\b(?![^>]*application\/json)[^>]*>([\s\S]*?)<\/script>/g)) vm.runInContext(m[1], p.context);
  const A = p.context.FBDApp;
  A.openText(F.serialize(DOCS.cantilever), "cantilever.fbd.json");
  // Open the File menu and pick an item by its label, as a click on it does.
  p.menu = async (label) => {
    A.ACTIONS.find((a) => a.id === "file").run();
    const pop = p.document.body.children.findLast((e) => e.className === "menu-pop");
    const i = [...pop.innerHTML.matchAll(/data-i="(\d+)">([^<]*)</g)].find((m) => m[2] === label)[1];
    await pop.fire("click", Object.assign(new Element("button"), { dataset: { i } }));
  };
  return p;
}

test("the File menu's Save beamdswitch deck saves the page's drawing as a deck", async () => {
  const p = page();
  await p.menu("Save beamdswitch deck");
  assert.equal(p.$("toast").textContent, "Saved cantilever-with-point-load-udl-and-end-moment-beamdswitch.md: open it in beamdswitch.");
  const [file] = p.saved;
  assert.equal(file.name, "cantilever-with-point-load-udl-and-end-moment-beamdswitch.md");
  assert.equal(file.blob.type, "text/markdown");
  const md = await file.blob.text();
  checkDeck(md, "saved");
  assert.equal(md, deckFor(DOCS.cantilever));
});

test("Copy beamdswitch deck copies the same deck, and saving falls back to the clipboard when it is blocked", async () => {
  const p = page();
  await p.menu("Copy beamdswitch deck");
  assert.equal(p.$("toast").textContent, "Copied the beamdswitch deck: paste it into beamdswitch.");
  assert.equal(p.copied[0], deckFor(DOCS.cantilever));

  const blocked = page({ saveFails: true });
  await blocked.menu("Save beamdswitch deck");
  assert.equal(blocked.$("toast").textContent, "Copied the beamdswitch deck, as saving is blocked here: paste it into beamdswitch.");
  assert.equal(blocked.copied[0], deckFor(DOCS.cantilever));

  const neither = page({ saveFails: true, clipboardFails: true });
  await neither.menu("Save beamdswitch deck");
  assert.equal(neither.$("toast").textContent, "Could not save or copy the beamdswitch deck here.");
  await neither.menu("Copy beamdswitch deck");
  assert.equal(neither.$("toast").textContent, "Copy failed: the browser blocked clipboard access.");
});

test("long schedules split over slides of seven rows, each row its own body's or load's", () => {
  // Nine joints and nine loads: two joint slides and two load slides, numbered "(1 of 2)" and "(2 of 2)".
  const d = structuredClone(DOCS[EXAMPLES[0].id]);
  const j0 = d.geometry.joints[0];
  for (let k = 0; d.geometry.joints.length < 9; k++) d.geometry.joints.push({ ...j0, id: `Z${k}`, x: j0.x + 10 * (k + 1) });
  const l0 = d.geometry.loads[0];
  for (let k = 0; d.geometry.loads.length < 9; k++) d.geometry.loads.push({ ...structuredClone(l0), id: `L${k + 100}` });
  const md = deckFor(d);
  checkDeck(md, "nine joints and loads");
  assert.ok(md.includes("(1 of 2)\n") && md.includes("(2 of 2)\n"), "paged titles");
  const loadRows = F.loadRows(d);
  const loadTitle = md.match(/^## Loads: .*\(2 of 2\)$/m)[0].slice(3);
  assert.deepEqual(tableRows(section(md, loadTitle)), F.mdTable(["ID", "Type", "Style", "Label", "Magnitude", "Direction", "Position"], loadRows.slice(7)).trim().split("\n").slice(2));
  // The takeaway key and its narration say the same counts.
  const report = F.beamdswitchReport(d), last = report.checks.at(-1);
  assert.ok(last.narration.endsWith(last.key), last.narration);
});

test("a resize before boot queues no draw, so draw never runs before the toolbar exists", () => {
  // Regression: technical-e2e saw "Cannot set properties of null (setting 'disabled') at draw" on
  // chromium-mobile when a resize during loading drew before boot() built the Undo button.
  const frames = [], listeners = {};
  const p = standIn({ globals: {
    localStorage: { getItem: () => null, setItem() {} }, innerWidth: 800, innerHeight: 600, confirm: () => true, CSS: { escape: (s) => s },
    requestAnimationFrame: (cb) => frames.push(cb), addEventListener: (type, fn) => { listeners[type] = fn; },
  } });
  for (const m of html.matchAll(/<script\b(?![^>]*application\/json)([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (!/id="fbd-start"/.test(m[1])) vm.runInContext(m[2], p.context);
  }
  listeners.resize();
  assert.equal(frames.length, 0, "no draw is queued before boot");
  p.context.FBDBoot();
  assert.ok(frames.length > 0, "boot queues the first draw");
  const queued = frames.length;
  frames.splice(0).forEach((cb) => cb());
  listeners.resize();
  assert.equal(frames.length, 1, "after boot a resize queues a draw");
  assert.ok(queued >= 1);
});
