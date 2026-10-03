// FBD Drawer: the definition of done in its specification (section 10).
// Reference drawings 1 to 5 are fixtures in examples.json; each
// must survive JSON and Markdown round trips identically. Drawing 6 (touch
// only) is checked in a browser with tools/touch-build.js.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadCore, HTML_URL } from "../tools/core.mjs";

const F = loadCore();
const EXAMPLES = JSON.parse(fs.readFileSync(new URL("../examples.json", import.meta.url), "utf8"));
const html = fs.readFileSync(HTML_URL, "utf8");
const example = (id) => structuredClone(EXAMPLES.examples.find((e) => e.id === id).drawing);
const plain = (x) => JSON.parse(JSON.stringify(x)); // strip the VM realm's prototypes
const doc = (id) => { const r = F.load(example(id)); assert.deepEqual(plain(r.errors), []); return r.doc; };

test("the page embeds exactly the five reference drawings in examples.json", () => {
  const m = /<script type="application\/json" id="fbd-examples">([\s\S]*?)<\/script>/.exec(html);
  assert.ok(m, "examples block missing");
  assert.deepEqual(JSON.parse(m[1]), EXAMPLES);
  assert.deepEqual(EXAMPLES.examples.map((e) => e.id), ["cantilever", "inclined-plane", "simply-supported-imperial", "aircraft-top", "freeform-plate"]);
});

for (const ex of EXAMPLES.examples) {
  test(`${ex.id}: saving is identity, and JSON and Markdown round trips are identical`, () => {
    const d = doc(ex.id);
    const json = F.serialize(d);
    assert.equal(json, JSON.stringify(ex.drawing, null, 2) + "\n", "the fixture is already canonical");
    const viaJson = F.parseJSON(json);
    assert.deepEqual(plain(viaJson.errors), []);
    assert.equal(F.serialize(viaJson.doc), json);
    assert.deepEqual(plain(viaJson.doc), plain(d));
    const md = F.toMarkdown(d);
    const viaMd = F.fromMarkdown(md);
    assert.deepEqual(plain(viaMd.errors), []);
    assert.equal(F.serialize(viaMd.doc), json);
    assert.deepEqual(plain(viaMd.doc), plain(d));
    assert.equal(F.toMarkdown(viaMd.doc), md, "Markdown is deterministic");
    assert.equal(F.parseFile(md).errors.length, 0);
    assert.equal(F.parseFile(json).errors.length, 0);
  });
}

test("Markdown carries the drawing, the schedules, the axes and the JSON, with blanks as —", () => {
  const md = F.toMarkdown(doc("freeform-plate"));
  assert.match(md, /^!\[Freeform plate with loads left blank\]\(data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+\)$/m);
  const svg = Buffer.from(/base64,([A-Za-z0-9+/=]+)\)/.exec(md)[1], "base64").toString("utf8");
  assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  for (const h of ["## Axes", "## Bodies", "## Joints", "## Loads", "## Supports", "## Drawing data"]) assert.ok(md.includes(`\n${h}\n`), h);
  assert.match(md, /\| f1 \| Force \| Applied \| — \| — \| ∠-60° \| joint j4 \|/);
  assert.match(md, /\| f2 \| Force \| Applied \| F<sub>1<\/sub> \| — \|/);
  assert.match(md, /\| f3 \| Force \| Applied \| θ \| — \|/);
  assert.match(md, /\| m1 \| Moment \| Applied \| — \| — \| counter-clockwise ↺ \|/);
  assert.match(md, /\| q1 \| Distributed \| Applied \| — \| — \|/);
  assert.doesNotMatch(md, /=\s*[-\d.]+\s*[+*/]/, "no equations: there is no solver");
  assert.ok(md.trimEnd().endsWith("```"), "the JSON block closes the file");
});

test("loads with nothing set draw as clean arrows with no text", () => {
  const d = doc("freeform-plate");
  const r = F.renderScene(d, { map: (x, y) => [x * 0.3, -y * 0.3], k: 0.3, a: 1, pal: F.EXPORT_PAL });
  const texts = [...r.svg.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map((m) => m[1].replace(/<[^>]+>/g, ""));
  assert.deepEqual(texts.filter((t) => !["x", "y", "+"].includes(t)).sort(), ["F1", "θ"].sort());
});

test("units: values are stored canonically and imperial input converts on entry", () => {
  const q = (t, kind, unit = null) => F.parseQuantity(t, kind, unit).value;
  assert.equal(q("2 m", "length"), 2000);
  assert.equal(q("2", "length", "m"), 2000, "a bare number uses the display unit");
  assert.equal(q("12 in", "length"), 304.8);
  assert.equal(q("20 ft", "length"), 6096);
  assert.ok(Math.abs(q("3 ft 6 in", "length") - 1066.8) < 1e-9);
  assert.ok(Math.abs(q(`3' 6"`, "length") - 1066.8) < 1e-9);
  assert.equal(q("10 kN", "force"), 10000);
  assert.equal(q("1 lbf", "force"), 4.4482216152605);
  assert.equal(q("5 kN·m", "moment"), 5e6);
  assert.equal(q("5 kNm", "moment"), 5e6);
  assert.equal(q("2 kN/m", "distributed"), 2);
  assert.match(F.parseQuantity("2 furlongs", "length", "mm").error, /Unknown length unit/);
  const d = doc("simply-supported-imperial");
  assert.equal(F.joint(d, "j2").x, 6096, "20 ft span stored as 6096 mm");
  assert.equal(F.body(d, "b1").depth, 304.8);
  assert.equal(d.geometry.loads.find((l) => l.id === "q1").w2, q("2 kip/ft", "distributed"));
  assert.equal(F.formatQuantity(6096, "length", "ft"), "20 ft");
  const md = F.toMarkdown(d);
  assert.match(md, /\| b1 \| Beam \(depth 1 ft\) \| — \| j1, j2 \| 20 ft \|/);
  assert.match(md, /\| q1 \| Distributed \| Applied \| w \| 0 to 2 kip\/ft \|/);
});

test("switching the unit system never alters geometry", () => {
  const d = doc("cantilever"), before = plain(d.geometry);
  for (const system of ["imperial", "SI"]) {
    d.view.units = { system, ...Object.fromEntries(["length", "force", "moment", "distributed"].map((k) => [k, F.SYSTEM_UNITS[system][k][0]])) };
    assert.deepEqual(plain(d.geometry), before);
    assert.equal(F.serialize(F.load(d).doc).includes('"x": 3000'), true);
  }
});

test("drawing 1: the 3000 mm member measures 3000 mm, on screen and in exports", () => {
  const d = doc("cantilever");
  const beam = F.body(d, "b1");
  assert.equal(F.memberLength(d, beam), 3000);
  const dimText = (unit, k) => {
    d.view.units.length = unit;
    const r = F.renderScene(d, { map: (x, y) => [x * k, -y * k], k, a: 1, pal: F.EXPORT_PAL });
    return r;
  };
  assert.match(dimText("mm", 0.2).svg, />3000 mm</);
  assert.match(dimText("m", 5).svg, />3 m</, "whatever the zoom");
  // The beam is drawn at scale: 3000 mm is 3000 k px long.
  for (const k of [0.1, 1, 12]) {
    const r = dimText("mm", k);
    const quad = /<path d="M([\d.-]+) [\d.-]+L([\d.-]+) [\d.-]+L/.exec(r.svg);
    assert.ok(Math.abs(Number(quad[2]) - Number(quad[1]) - 3000 * k) < 0.02, `k=${k}`);
  }
  // Exports ignore the view zoom and fit the content.
  d.view.units.length = "m";
  const svg = F.exportSVG(d);
  assert.match(svg, />3 m</);
  const w = Number(/width="(\d+)"/.exec(svg)[1]);
  assert.ok(w > F.EXPORT_SIZE && w < F.EXPORT_SIZE + 400, `export width ${w}`);
});

test("drawing 1 contains the loads, supports and dimension the specification lists", () => {
  const d = doc("cantilever"), g = d.geometry;
  assert.deepEqual(g.supports.map((s) => s.kind), ["fixed"]);
  assert.ok(g.loads.some((l) => l.kind === "force" && l.style === "applied" && l.magnitude === 10000));
  assert.ok(g.loads.some((l) => l.kind === "distributed" && l.w1 === 2 && l.w2 === 2 && l.s1 === 0 && l.s2 === 3000));
  assert.ok(g.loads.some((l) => l.kind === "moment" && l.style === "applied" && l.at.joint === "j2"));
  assert.ok(g.loads.filter((l) => l.style === "reaction").length >= 3);
  assert.ok(g.bodies.some((b) => b.type === "line" && b.role === "dimension"));
});

test("drawing 2: rotated triad with polar, component and point-at input", () => {
  const d = doc("inclined-plane"), L = (id) => d.geometry.loads.find((l) => l.id === id);
  assert.equal(d.view.triad.rotation, 30);
  assert.deepEqual(plain(d.view.triad.labels), ["x'", "y'"]);
  assert.equal(F.displayAngle(d, L("f2")), 90, "N is 90° from x′");
  assert.equal(F.loadDir(d, L("f2")), 120);
  assert.equal(L("f3").input.mode, "components");
  const c = F.components(d, L("f3"));
  assert.ok(Math.abs(c[0] - 245.25) < 1e-9 && Math.abs(c[1]) < 1e-9, "friction is (245.25, 0) N along x′");
  assert.equal(L("f1").input.mode, "toward");
  const at = F.resolveAt(d, L("f1").at), to = L("f1").input.toward;
  assert.ok(Math.abs(F.wrap360(F.deg(Math.atan2(to.y - at.y, to.x - at.x))) - L("f1").dir) < 1e-9, "weight points at its target point");
  assert.equal(F.displayAngle(d, L("f1")), -120);
  assert.match(F.loadText(d, L("f3")), /F_f = 245\.25 N \(245\.25, 0\) N/);
});

test("rotating the triad or switching preset never moves stored geometry", () => {
  for (const ex of EXAMPLES.examples) {
    const d = doc(ex.id), geometry = plain(d.geometry);
    const dirs = d.geometry.loads.filter((l) => l.kind !== "distributed").map((l) => F.loadDir(d, l));
    for (const step of [(v) => { v.triad.rotation = 37; }, (v) => F.applyPreset(v, "aircraft", "top"), (v) => F.applyPreset(v, "aircraft", "side"), (v) => F.applyPreset(v, "aircraft", "front"), (v) => F.applyPreset(v, "engineering")]) {
      step(d.view);
      assert.deepEqual(plain(d.geometry), geometry, ex.id);
      assert.deepEqual(d.geometry.loads.filter((l) => l.kind !== "distributed").map((l) => F.loadDir(d, l)), dirs, ex.id);
      for (const a of [0, 30, -135, 90]) assert.equal(F.toTriad(d.view, F.fromTriad(d.view, a)), a);
    }
  }
});

test("aircraft preset: views relabel the triad and show PORT/STBD where the view has a y axis", () => {
  const v = F.defaultView();
  const cases = { top: [["x", "y"], 90, -1, true], side: [["x", "z"], 180, 1, false], front: [["y", "z"], 180, 1, true] };
  for (const [view, [labels, rotation, ySense, sides]] of Object.entries(cases)) {
    F.applyPreset(v, "aircraft", view);
    assert.deepEqual(plain(v.triad.labels), labels);
    assert.equal(v.triad.rotation, rotation);
    assert.equal(v.triad.ySense, ySense);
    const d = doc("aircraft-top");
    d.view.triad = { ...v.triad, x: d.view.triad.x, y: d.view.triad.y };
    const svg = F.exportSVG(d);
    assert.equal(/>STBD</.test(svg) && />PORT</.test(svg), sides, view);
  }
  // Body axes: thrust forward, lift out of the page from above, yaw clockwise from above.
  F.applyPreset(v, "aircraft", "top");
  assert.deepEqual(plain(F.bodyAxis(v, "x", 1)), { plane: "in", dir: 90 });
  assert.deepEqual(plain(F.bodyAxis(v, "y", 1)), { plane: "in", dir: 0 });
  assert.deepEqual(plain(F.bodyAxis(v, "z", -1)), { plane: "out" });
  F.applyPreset(v, "aircraft", "front");
  assert.deepEqual(plain(F.bodyAxis(v, "x", 1)), { plane: "out" });
  const d = doc("aircraft-top"), labels = d.geometry.loads.map((l) => l.label).sort();
  assert.deepEqual(labels, ["D", "L", "Pitch", "Roll", "T", "W", "Yaw"].sort());
  assert.equal(d.geometry.markers[0].kind, "cg");
  const md = F.toMarkdown(d);
  assert.match(md, /\| Preset \| Aircraft body axes, top view \|/);
  assert.match(md, /right-hand rule/);
  assert.match(md, /## Markers/);
});

test("loading reports clear errors instead of dropping content", () => {
  const bad = example("cantilever");
  bad.geometry.loads[0].colour = "red";
  bad.geometry.loads[1].at = { body: "b9", edge: 0, s: 1, n: 0 };
  bad.geometry.bodies[0].joints = ["j1", "j7"];
  const r = F.load(bad);
  assert.equal(r.doc, undefined);
  assert.deepEqual(plain(r.errors), [
    "geometry.loads[0].colour: unknown field",
    'geometry.bodies[0].joints[1]: unknown joint "j7"',
    'geometry.loads[1].at.body: unknown body "b9"',
  ]);
  assert.match(F.load({ ...example("cantilever"), version: 2 }).errors[0], /newer than this tool/);
  assert.match(F.parseJSON("{").errors[0], /Not valid JSON/);
  assert.match(F.fromMarkdown("# nothing here").errors[0], /No ```json block/);
});

test("loading rejects ids that are not simple identifiers, from JSON and Markdown", () => {
  const hostile = 'x"><img src=x onerror=alert(1)>';
  const bad = example("cantilever");
  bad.geometry.loads[0].id = hostile;
  bad.geometry.joints[0].id = "j 1";
  const r = F.load(bad);
  assert.equal(r.doc, undefined);
  assert.ok(r.errors.includes("geometry.joints[0].id: id may use only letters, digits, _ and -"), plain(r.errors));
  assert.ok(r.errors.includes("geometry.loads[0].id: id may use only letters, digits, _ and -"), plain(r.errors));
  const md = F.toMarkdown(doc("cantilever")).replace(/"id": "f1"/, `"id": ${JSON.stringify(hostile)}`);
  assert.ok(F.parseFile(md).errors.some((e) => /loads\[\d+\]\.id: id may use only/.test(e)));
});

test("a slope is shown only while it still describes the stored direction", () => {
  const d = doc("cantilever"), l = d.geometry.loads.find((x) => x.kind === "force" && x.plane === "in" && x.dirRef === "global");
  l.show.angle = true;
  l.input = { mode: "slope", slope: [4, 3], toward: null };
  l.dir = F.fromTriad(d.view, F.deg(Math.atan2(3, 4)));
  assert.match(F.angleText(d, l), /^slope 4:3$/);
  assert.match(F.toMarkdown(d), /, slope 4:3 \|/);
  d.view.triad.rotation = 30;
  assert.doesNotMatch(F.angleText(d, l), /slope/);
  assert.doesNotMatch(F.toMarkdown(d), /slope 4:3/);
  d.view.triad.rotation = 0;
  l.dir = 60;
  assert.equal(F.angleText(d, l), "∠60°");
  assert.doesNotMatch(F.toMarkdown(d), /slope 4:3/);
});

test("labels: subscripts and Greek letters", () => {
  assert.deepEqual(plain(F.richRuns("F_1")), [{ t: "F", pos: 0 }, { t: "1", pos: -1 }]);
  assert.deepEqual(plain(F.richRuns("F_{AB}")), [{ t: "F", pos: 0 }, { t: "AB", pos: -1 }]);
  assert.equal(F.plainLabel("\\alpha + \\Omega_\\theta"), "α + Ωθ");
  assert.equal(F.htmlLabel("M_B"), "M<sub>B</sub>");
});
