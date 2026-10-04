import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { parseDeck, splitSentences } from "./fixtures/beamdswitch/deck.mjs";
import { parsePlot } from "./fixtures/beamdswitch/plot.mjs";
import { page } from "./page-harness.mjs";

const require = createRequire(import.meta.url);
const B = require("../engine.js");
const T = require("../beamdswitch.js");
const H = require("../handcalc.js");
const raw = require("../raw.json");
const { sig, sci, shortNf } = B.format;
/** @typedef {ReturnType<typeof B.solve>} Result */
/** @typedef {Parameters<typeof B.toUnits>[1]} Quantity */
/** @typedef {import("./fixtures/beamdswitch/deck.mjs").DeckNode} DeckNode */
/** @typedef {Extract<DeckNode, { type: "div" }>} DeckDiv */
/** @typedef {{ id: string, label: string, length: number, material: string, section: object, supports: object[], loads: object[] }} Preset */
/** @typedef {{ id: string, label: string }} Material */
/** @template T @param {T | undefined | null} x @param {string} what @returns {T} */
const found = (x, what) => { assert.ok(x, what); return x; };

/** @type {{ shape: string, label: string, dims: [string, number, Quantity][] }} */
const SECTION = { shape: "rect", label: "Solid rectangle b × h", dims: [["Width b", 0.1, "length"], ["Depth h", 0.2, "length"]] };
/** @param {Preset} p */
function solvePreset(p) {
  /** @type {Material} */
  const material = found(raw.materials.find((/** @type {Material} */ m) => m.id === p.material), p.material);
  const r = B.solve({ length: p.length, material, section: B.sectionProperties(p.section), supports: p.supports, loads: p.loads });
  const extremes = B.extremes(r);
  r.extremes = extremes;
  return { r: { ...r, extremes }, material };
}
/** @param {Preset} p @param {string} units @param {string} origin */
function deckFor(p, units, origin) {
  const { r, material } = solvePreset(p);
  const md = H.deck(H.beamReport(r, { units, origin, at: p.length / 3, title: p.label, section: SECTION, material: { label: material.label } }));
  return { r, md, deck: parseDeck(md) };
}
/* Beams beyond the presets: a right-end fixed support, actions at both ends, a trapezoidal load, an overhang, no load. */
/** @type {Preset[]} */
const EXTRA = [
  { id: "right-cantilever", label: "Right-hand cantilever", length: 4, supports: [{ kind: "fixed", x: 4 }],
    loads: [{ kind: "point", x: 0, F: -3000 }, { kind: "moment", x: 4, C: 2000 }, { kind: "dist", x1: 1, x2: 4, q1: -1000, q2: -4000 }] },
  { id: "overhang", label: "Overhanging beam", length: 7.5, supports: [{ kind: "pin", x: 1.25 }, { kind: "fixed", x: 5 }],
    loads: [{ kind: "point", x: 7.5, F: -8000 }, { kind: "moment", x: 0, C: -5000 }, { kind: "dist", x1: 0, x2: 7.5, q1: 2000, q2: -6000 }] },
  { id: "unloaded", label: "Unloaded beam", length: 3, supports: [{ kind: "pin", x: 0 }, { kind: "pin", x: 3 }], loads: [] },
].map((p) => ({ ...p, material: "timber", section: { shape: "rect", b: 0.05, h: 0.15 } }));
/* Every preset and extra beam in every unit convention, from both origins. */
const CASES = [.../** @type {Preset[]} */ (raw.presets), ...EXTRA].flatMap((p) => Object.keys(B.UNIT_SYSTEMS).flatMap((units) => ["left", "mid"].map((origin) => ({ p, units, origin }))));
/** @param {DeckNode[]} children @param {string} name @param {DeckDiv[]} [out] @returns {DeckDiv[]} */
const divs = (children, name, out = []) => {
  for (const c of children) if (c.type === "div") { if (c.name === name) out.push(c); divs(c.children, name, out); }
  return out;
};
/** @param {DeckDiv} node */
const textOf = (node) => node.children.flatMap((c) => (c.type === "md" ? [c.text] : [])).join("\n");

test("the deck for every preset, unit convention and origin parses in beamdswitch into the standard template", () => {
  const skeleton = readFileSync(new URL("./fixtures/beamdswitch/beamdswitch-report.md", import.meta.url), "utf8");
  const standard = [...skeleton.matchAll(/^# (.+)$/gm)].map((m) => m[1]);
  assert.deepEqual(standard, T.SECTIONS.map(([, title]) => title), "the site's templates/beamdswitch-report.md and beamdswitch.js name the same sections");
  // The hand calculations go in as their own section, before Checks and takeaway.
  const sections = [...standard.slice(0, -1), "Hand calculations", standard.at(-1)];
  for (const { p, units, origin } of CASES) {
    const { deck } = deckFor(p, units, origin), what = `${p.id} ${units} ${origin}`;
    assert.equal(deck.frames[0].kind, "title", what);
    assert.equal(deck.meta.title, `Beam analysis: ${p.label}`, what);
    assert.equal(deck.meta.voice, "bf_emma", what);
    assert.deepEqual(deck.frames.filter((f) => f.kind === "section").map((f) => f.title), sections, what);
    const plots = deck.frames.flatMap((f) => divs(f.children, "plot"));
    assert.equal(plots.length, 3, `${what}: shear, moment and deflection plots`);
    for (const plot of plots) assert.deepEqual(parsePlot(textOf(plot)).errors, [], what);
    const last = found(deck.frames.at(-1), what);
    assert.equal(last.section, "Checks and takeaway", what);
    assert.equal(divs(last.children, "key").length, 1, `${what}: ends on a ::: key`);
  }
});

test("every frame has its own narration, written as plain spoken prose", () => {
  for (const { p, units, origin } of CASES) {
    const { md, deck } = deckFor(p, units, origin), what = `${p.id} ${units} ${origin}`;
    // Written in the deck, not filled in by beamdswitch's defaults: one ::: narration per slide.
    assert.equal(md.match(/^::: narration$/gm)?.length, deck.frames.length, what);
    for (const f of deck.frames) {
      assert.ok(splitSentences(f.narration).length > 0, `${what}: "${f.title}" is narrated`);
      assert.doesNotMatch(f.narration, /[$\\`*_#|<>×⁰¹²³⁴⁵⁶⁷⁸⁹⁻]/, `${what}: "${f.title}" reads as speech`);
    }
  }
});

test("the plotted shear, moment and deflection are the solver's own, in the chosen units and origin", () => {
  for (const { p, units, origin } of CASES) {
    const { r, deck } = deckFor(p, units, origin), what = `${p.id} ${units} ${origin}`;
    const L = r.model.length, o = origin === "mid" ? L / 2 : 0;
    const [V, M, v] = deck.frames.flatMap((f) => divs(f.children, "plot")).map((d) => parsePlot(textOf(d)));
    const toX = (/** @type {number} */ x) => B.toUnits(x - o, "length", units);
    assert.deepEqual(V.x.map((x) => +x.toPrecision(9)), [toX(0), toX(L)].map((x) => +x.toPrecision(9)), what);
    // Sample between events, clear of the jumps.
    const ev = r.displacements.map((d) => d.x);
    /** @type {number[]} */
    const xs = [];
    for (let i = 1; i < ev.length; i++) for (const t of [0.01, 0.25, 0.5, 0.75, 0.99]) xs.push(ev[i - 1] + t * (ev[i] - ev[i - 1]));
    const scale = { V: Math.abs(r.extremes.V.value), M: Math.abs(r.extremes.M.value), v: Math.abs(r.extremes.v.value) };
    for (const x of xs) {
      const exact = B.internal(r, x, "right"), dv = B.deflection(r, x).v, xd = toX(x);
      /** @param {import("./fixtures/beamdswitch/plot.mjs").PlotSpec} curve @param {number} si @param {Quantity} quantity @param {"V" | "M" | "v"} key */
      const close = (curve, si, quantity, key) => {
        const got = curve.curves[0].f(xd), want = B.toUnits(si, quantity, units), tol = 1e-7 * B.toUnits(scale[key], quantity, units);
        assert.ok(Math.abs(got - want) <= tol, `${what} ${key}(${xd}) = ${got}, solver ${want}`);
      };
      close(V, exact.V, "force", "V");
      close(M, exact.M, "moment", "M");
      close(v, dv, "length", "v");
    }
  }
});

test("the numbers in the deck are the solver's results, in the page's own digits", () => {
  for (const { p, units, origin } of CASES) {
    const { r, md, deck } = deckFor(p, units, origin), what = `${p.id} ${units} ${origin}`;
    const u = B.UNIT_SYSTEMS[units], show = (/** @type {number} */ si, /** @type {Quantity} */ q) => B.toUnits(si, q, u), ex = r.extremes;
    const at = (/** @type {number} */ x) => `${sig(show(B.fromOrigin(x, r.model.length, origin), "length"))} ${u.symbol.length}`;
    const frame = (/** @type {RegExp} */ re) => found(deck.frames.find((f) => re.test(f.title)), `${what}: a frame titled ${re}`);
    const parse = (/** @type {string} */ t) => Number(t.replace("−", "-").replace(/,/g, "").replace(/×10([⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)$/, (_, /** @type {string} */ e) => `e${[...e].map((c) => (c === "⁻" ? "-" : "⁰¹²³⁴⁵⁶⁷⁸⁹".indexOf(c))).join("")}`));
    /** @param {string} text @param {number} si @param {Quantity} quantity @param {string} label */
    const near = (text, si, quantity, label) => {
      const want = show(si, quantity);
      assert.ok(Math.abs(parse(text) - want) <= 5e-4 * Math.abs(want) + 1e-300, `${what} ${label}: ${text} vs ${want}`);
    };

    // Reactions: the table rows hold each solver reaction, formatted as the page's reaction list.
    const rows = [...md.matchAll(/^\| (\d+), (pin|fixed) \| (\S+) \| (\S+) \| (\S+) \|$/gm)];
    assert.equal(rows.length, r.reactions.length, what);
    r.reactions.forEach((re, i) => {
      const [, n, kind, x, F, Mz] = rows[i];
      assert.deepEqual([Number(n), kind, x], [i + 1, re.kind, sig(show(B.fromOrigin(re.x, r.model.length, origin), "length"))], what);
      assert.equal(F, shortNf(show(re.Fy, "force")), what);
      near(F, re.Fy, "force", `reaction ${i + 1}`);
      if (re.kind === "fixed") { assert.equal(Mz, shortNf(show(re.Mz, "moment")), what); near(Mz, re.Mz, "moment", `reaction moment ${i + 1}`); }
    });

    // Extremes: title, equation and takeaway carry the page's four significant figures and location.
    for (const [key, quantity, word] of /** @type {["V" | "M" | "v", Quantity, string][]} */ ([["V", "force", "shear"], ["M", "moment", "moment"], ["v", "length", "deflection"]])) {
      const value = sig(show(ex[key].value, quantity), 4);
      const f = frame(new RegExp(`^Largest ${word}: `));
      assert.ok(f.title.startsWith(`Largest ${word}: ${value} ${u.symbol[quantity]}`) && f.title.includes(`at x = ${at(ex[key].x)}`), `${what}: ${f.title}`);
      near(value, ex[key].value, quantity, word);
    }
    assert.ok(frame(/^Largest deflection/).title.endsWith(`(L/${B.spanRatio(r.model.length, ex.v.value)})`), what);
    const stress = Math.abs(ex.M.value) * /** @type {number} */ (r.model.section.c) / r.model.section.I;
    assert.ok(md.includes(`Peak bending stress ${sig(show(stress, "stress"), 4)} ${u.symbol.stress}.`), what);
    assert.ok(md.includes(`relative error ${sci(B.residual(r.equilibrium))}.`), what);
    const deg = B.indeterminacy(r.model.supports);
    assert.ok(deck.frames.some((f) => f.title === (deg > 0 ? `Indeterminate to degree ${deg}: equilibrium needs ${["", "one compatibility condition", "two compatibility conditions"][deg]}` : "Statically determinate: equilibrium alone gives the reactions")), what);
  }
});

test("the narration reads the numbers in the chosen units", () => {
  const p = found(raw.presets.find((/** @type {Preset} */ x) => x.id === "fixed-fixed-point"), "fixed-fixed-point");
  const { r, deck } = deckFor(p, "kN-m", "mid");
  const said = deck.frames.map((f) => f.narration).join(" ");
  const [left] = r.reactions;
  assert.ok(said.includes(`The fixed support at x equals minus 3 metres pushes up with ${shortNf(left.Fy / 1e3)} kilonewtons`), said);
  assert.match(said, /The beam is 6 metres long, with x measured from mid-span, so it runs from minus 3 metres to 3 metres\./);
  assert.match(said, /a downward point force of 40 kilonewtons at x equals minus 1 metre\./);
  assert.ok(said.includes(`the largest bending moment is minus ${sig(Math.abs(r.extremes.M.value) / 1e3, 4)} kilonewton metres, hogging`), said);
  const mm = deckFor(found(raw.presets.find((/** @type {Preset} */ x) => x.id === "pin-pin-udl"), "pin-pin-udl"), "N-mm", "left").deck.frames.map((f) => f.narration).join(" ");
  assert.match(mm, /a uniform downward load of 10 newtons per millimetre from x equals 0 millimetres to 6000 millimetres/);
  assert.match(mm, /second moment of area of 6\.667 times ten to the 7 millimetres to the fourth/);
});

test("the template refuses a report that would not open as intended in beamdswitch", () => {
  const frame = { title: "F", body: "text", narration: "Said." };
  const good = { meta: { title: "T" }, narration: "Hello.", setup: [frame], method: [frame], results: [frame], checks: [{ ...frame, key: "Remember this." }] };
  assert.equal(parseDeck(T.deck(good)).frames.length, 1 + 4 * 2);
  assert.throws(() => T.deck({ ...good, results: [{ ...frame, narration: "" }] }), /needs a narration/);
  assert.throws(() => T.deck({ ...good, results: [{ ...frame, narration: "It is $x$." }] }), /plain spoken prose/);
  assert.throws(() => T.deck({ ...good, results: [{ ...frame, body: "a\n## sneaky frame" }] }), /heading/);
  assert.throws(() => T.deck({ ...good, results: [{ ...frame, body: "a\n:::" }] }), /::: line/);
  assert.throws(() => T.deck({ ...good, method: [] }), /Method section needs at least one frame/);
  assert.throws(() => T.deck({ ...good, checks: [frame] }), /::: key/);
});

test("the beamdswitch button saves the page's beam as a deck whose numbers match the page", async () => {
  for (const [preset, units, origin] of [["pin-pin-udl", "N-mm", "left"], ["fixed-fixed-point", "kN-m", "mid"], ["continuous", "lbf-in", "mid"], ["cantilever", "kip-in", "left"]]) {
    const p = await page(), what = `${preset} ${units} ${origin}`;
    p.choose("preset", preset);
    p.choose("units", units);
    p.choose("origin", origin);
    assert.equal(await p.save("save-beamdswitch"), "Saved beamdiag-beamdswitch.md: open it in beamdswitch.", what);
    const [file] = p.saved;
    assert.equal(file.name, "beamdiag-beamdswitch.md");
    assert.equal(file.blob.type, "text/markdown");
    const md = await file.blob.text(), deck = parseDeck(md);
    assert.ok(deck.frames.every((f) => f.narration), what);
    // The headline results under the figure: value and location, as the page shows them.
    /** @type {[string, string][]} */
    const stats = p.document.getElementById("stats").children.map((/** @type {import("./page-harness.mjs").Element} */ li) => [li.children[0].textContent, li.children[1].textContent]);
    for (const [big, small] of stats.slice(1, 4)) {
      const where = found(small.match(/at x = (.+?)(?: \(|$)/), `${what}: ${small}`)[1];
      assert.ok(deck.frames.some((f) => f.title.includes(big) && f.title.includes(`at x = ${where}`)), `${what}: ${big} at ${where}`);
    }
    assert.ok(md.includes(found(stats.find(([, s]) => s.startsWith("peak bending stress")), what)[0]), what);
    // Each reaction the page lists appears in the deck's reaction table with the same digits.
    for (const li of p.document.getElementById("reactions").children) {
      const [, x, F, Mz] = found(li.children[1].textContent.match(/at (\S+) \S+: (\S+) \S+(?:, (\S+) \S+)?$/), `${what}: ${li.children[1].textContent}`);
      assert.ok(new RegExp(`^\\| \\d+, (pin|fixed) \\| ${x} \\| ${F} \\| ${Mz ?? "—"} \\|$`, "m").test(md), `${what}: ${li.children[1].textContent}`);
    }
  }
});

test("the deck is titled after a preset only while the beam is still that preset", async () => {
  /** @typedef {Awaited<ReturnType<typeof page>>} Page */
  /** @type {Preset} */
  const preset = found(raw.presets.find((/** @type {Preset} */ x) => x.id === "continuous"), "continuous");
  const titled = async (/** @type {Page} */ p) => { assert.match(await p.save("save-beamdswitch"), /^Saved/); return parseDeck(await found(p.saved.at(-1), "a saved deck").blob.text()).meta.title; };
  const removeFirst = (/** @type {string} */ id) => (/** @type {Page} */ p) => p.document.getElementById(id).children[0].children[1].dispatch("click");
  /** @type {Record<string, (p: Page) => void>} */
  const edits = {
    "add support": (p) => p.document.getElementById("add-support").dispatch("click"),
    "add point load": (p) => p.buttons[0].dispatch("click"),
    "remove support": removeFirst("supports"),
    "remove load": removeFirst("loads"),
    "change section shape": (p) => p.choose("shape", "circle"),
    "change material": (p) => p.choose("material", found(raw.materials.find((/** @type {Material} */ m) => m.id !== preset.material), "another material").id),
  };
  for (const [what, edit] of Object.entries(edits)) {
    const p = await page();
    p.choose("preset", preset.id);
    assert.equal(await titled(p), `Beam analysis: ${preset.label}`, what);
    edit(p);
    assert.equal(p.document.getElementById("preset").value, "", what);
    assert.equal(p.document.getElementById("preset-note").textContent, "", what);
    assert.equal(await titled(p), "Beam analysis", what);
  }
});

test("Copy deck copies the same deck the beamdswitch button saves, without downloading", async () => {
  /** @type {string[]} */
  const copied = [];
  const p = await page({ navigator: { clipboard: { writeText: async (/** @type {string} */ t) => { copied.push(t); } } } });
  assert.equal(await p.save("copy-beamdswitch"), "Copied the beamdswitch deck: paste it into beamdswitch.");
  assert.equal(p.saved.length, 0);
  assert.equal(copied.length, 1);
  assert.equal(parseDeck(copied[0]).meta.title, `Beam analysis: ${raw.presets[0].label}`);
  assert.match(await p.save("save-beamdswitch"), /^Saved/);
  assert.equal(await found(p.saved.at(-1), "a saved deck").blob.text(), copied[0]);
});

test("Copy deck says so when the clipboard is blocked", async () => {
  const denied = await page({ navigator: { clipboard: { writeText: async () => { throw new Error("NotAllowedError"); } } } });
  assert.equal(await denied.save("copy-beamdswitch"), "Could not copy the beamdswitch deck: the clipboard is blocked here.");
  const missing = await page();
  assert.equal(await missing.save("copy-beamdswitch"), "Could not copy the beamdswitch deck: the clipboard is blocked here.");
  assert.equal(missing.saved.length, 0);
});

test("nothing is saved for beamdswitch while the beam cannot be solved", async () => {
  const p = await page();
  p.input("length", -1);
  assert.equal(await p.save("save-beamdswitch"), "Fix the beam first: there is no solution to save.");
  assert.equal(p.saved.length, 0);
  assert.equal(await p.save("copy-beamdswitch"), "Fix the beam first: there is no solution to copy.");
});
