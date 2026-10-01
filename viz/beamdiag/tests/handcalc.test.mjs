import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { parseDeck, splitSentences } from "./fixtures/beamdswitch/deck.mjs";
import { page } from "./page-harness.mjs";

const require = createRequire(import.meta.url);
const B = require("../engine.js");
const H = require("../handcalc.js");
const raw = require("../raw.json");
const fixtures = require("../fixtures.json");
const reference = require("../reference.json");
const { sig, sci, shortNf } = B.format;

const UNITS = Object.keys(B.UNIT_SYSTEMS), ORIGINS = ["left", "mid"];
const solved = (model) => { const r = B.solve(model); r.extremes = B.extremes(r); return r; };
const presetModel = (p) => ({ length: p.length, material: raw.materials.find((m) => m.id === p.material), section: B.sectionProperties(p.section), supports: p.supports, loads: p.loads });
/* Each kind of beam the hand calculations must handle. */
const KINDS = {
  "simply-supported-udl": "determinate, two pins",
  "cantilever-tip-load": "cantilever",
  "overhang-mixed-asymmetric": "overhangs",
  "fixed-fixed-point-asymmetric": "indeterminate, fixed–fixed",
  "propped-cantilever-udl": "indeterminate, propped cantilever",
  "two-span-continuous-udl": "continuous spans",
  "continuous-32-span-fixed-ends-udl": "continuous spans, too many unknowns to write out",
};
/* Round-off far below the largest value of the same kind on the beam reads as zero, as on the page. */
function scales(r) {
  const ex = r.extremes;
  return { V: Math.abs(ex.V.value), M: Math.abs(ex.M.value), v: Math.abs(ex.v.value), theta: Math.abs(ex.v.value) / r.model.length };
}
const QUANTITY = { V: "force", M: "moment", v: "length", theta: "angle" };

test("the fixtures cover every kind of beam the hand calculations handle", () => {
  const ids = new Set(fixtures.cases.map((c) => c.id));
  for (const id of Object.keys(KINDS)) assert.ok(ids.has(id), `${id} (${KINDS[id]})`);
  const degrees = fixtures.cases.map((c) => B.indeterminacy(c.model.supports));
  assert.ok(degrees.includes(0) && degrees.some((d) => d > 0));
});

test("the hand chain reproduces the stiffness solver and reference.py on every fixture, unit convention and origin", () => {
  for (const c of fixtures.cases) {
    const r = solved(c.model), ref = reference.cases.find((x) => x.id === c.id), sc = scales(r);
    for (const units of UNITS) for (const origin of ORIGINS) {
      const what = `${c.id} ${units} ${origin}`, u = B.UNIT_SYSTEMS[units], D = H.derive(r, { units, origin });
      const toSI = (x, key) => B.fromUnits(x, QUANTITY[key], u);
      // Reactions: solved by hand from the written equations whenever they are written.
      const deg = B.indeterminacy(r.model.supports);
      assert.equal(D.written, deg === 0 || D.unknowns.length <= H.WRITE_UNKNOWNS, what);
      if (D.written) {
        assert.ok(D.hand, what);
        const reactions = D.unknowns.map((k, i) => [k, i]).filter(([k]) => k.kind === "R" || k.kind === "M");
        const size = Math.max(...ref.reactions.map((re) => Math.abs(re.Fy)), 1e-300), msize = Math.max(...ref.reactions.map((re) => Math.abs(re.Mz) + Math.abs(re.Fy) * r.model.length), 1e-300);
        for (const [k, i] of reactions) {
          const re = ref.reactions.find((x) => x.x === k.r.x), hand = toSI(D.hand[i], k.kind === "R" ? "V" : "M");
          const want = k.kind === "R" ? re.Fy : re.Mz, tol = 1e-7 * (k.kind === "R" ? size : msize);
          assert.ok(Math.abs(hand - want) <= tol, `${what} ${k.name}: hand ${hand}, reference ${want}`);
          assert.ok(Math.abs(D.solver[i] - D.hand[i]) <= 1e-7 * Math.abs(B.toUnits(k.kind === "R" ? size : msize, k.kind === "R" ? "force" : "moment", u)), `${what} ${k.name}: hand vs solver`);
        }
      }
      // Every segment: the hand chain at both ends against the solver and the exact reference.
      const points = new Map(ref.points.map((p) => [p.x, p]));
      for (const seg of D.segments) {
        for (const key of ["V", "M", "theta", "v"]) {
          const tol = 1e-6 * sc[key];
          for (const end of ["start", "end"]) {
            const hand = toSI(seg.hand[end][key], key), solver = toSI(seg[end][key], key);
            assert.ok(Math.abs(hand - solver) <= tol, `${what} segment ${seg.index} ${end} ${key}: hand ${hand}, solver ${solver}`);
            const p = points.get(end === "start" ? seg.a : seg.b);
            if (!p) continue;
            const exact = key === "V" ? p[end === "start" ? "Vright" : "Vleft"] : key === "M" ? p[end === "start" ? "Mright" : "Mleft"] : p[key];
            assert.ok(Math.abs(hand - exact) <= tol, `${what} segment ${seg.index} ${end} ${key}: hand ${hand}, reference ${exact}`);
          }
          // The written polynomials, evaluated at the far end, land on the solver's value there.
          const coef = seg.poly[key === "theta" ? "theta" : key], scale = key === "theta" || key === "v" ? D.c.EI : 1;
          const atEnd = coef.reduce((acc, k, n) => acc + k * seg.h ** n, 0) / scale;
          assert.ok(Math.abs(toSI(atEnd, key) - toSI(seg.end[key], key)) <= tol, `${what} segment ${seg.index} ${key}(h)`);
        }
      }
      assert.equal(D.segments.length, r.displacements.length - 1, what);
    }
  }
});

/* The presets, plus beams with a right-hand fixed end, an overhang and no load. */
const EXTRA = [
  { id: "right-cantilever", label: "Right-hand cantilever", length: 4, supports: [{ kind: "fixed", x: 4 }],
    loads: [{ kind: "point", x: 0, F: -3000 }, { kind: "moment", x: 4, C: 2000 }, { kind: "dist", x1: 1, x2: 4, q1: -1000, q2: -4000 }] },
  { id: "overhang", label: "Overhanging beam", length: 7.5, supports: [{ kind: "pin", x: 1.25 }, { kind: "fixed", x: 5 }],
    loads: [{ kind: "point", x: 7.5, F: -8000 }, { kind: "moment", x: 0, C: -5000 }, { kind: "dist", x1: 0, x2: 7.5, q1: 2000, q2: -6000 }] },
  { id: "unloaded", label: "Unloaded beam", length: 3, supports: [{ kind: "pin", x: 0 }, { kind: "pin", x: 3 }], loads: [] },
].map((p) => ({ ...p, material: "timber", section: { shape: "rect", b: 0.05, h: 0.15 } }));
const BEAMS = [...raw.presets, ...EXTRA];
const CASES = BEAMS.flatMap((p) => UNITS.flatMap((units) => ORIGINS.map((origin) => ({ p, units, origin }))));
const textOf = (blocks) => blocks.map((b) => b.p ?? b.eq ?? (b.list ? b.list.join("\n") : [b.table.head, ...b.table.rows].map((r) => r.join(" | ")).join("\n"))).join("\n");

test("every number shown is the solver's, written as the page writes it", () => {
  for (const { p, units, origin } of CASES) {
    const r = solved(presetModel(p)), u = B.UNIT_SYSTEMS[units], what = `${p.id} ${units} ${origin}`, sc = scales(r);
    const show = (si, q) => B.toUnits(si, q, u);
    const page = (si, key) => shortNf(show(Math.abs(si) <= 1e-10 * sc[key] ? 0 : si, QUANTITY[key]));
    const at = r.model.length * 0.37, parts = H.frames(r, { units, origin, at }), all = parts.flatMap((s) => s.frames);
    // Reactions: as the page's reaction list writes them.
    const reactions = textOf(all.filter((f) => /^Reactions/.test(f.title)).flatMap((f) => f.blocks));
    for (const re of r.reactions) {
      assert.ok(reactions.includes(B.speech.texNumber(shortNf(show(re.Fy, "force")))) || reactions.includes(shortNf(show(re.Fy, "force"))), `${what}: reaction ${shortNf(show(re.Fy, "force"))}`);
      if (re.kind === "fixed") assert.ok(reactions.includes(shortNf(show(re.Mz, "moment"))) || reactions.includes(B.speech.texNumber(shortNf(show(re.Mz, "moment")))), `${what}: support moment`);
    }
    // Each segment's table: the solver's V, M, θ and v at both ends, with the page's cleaning and digits.
    const segments = all.filter((f) => /^Segment \d+:/.test(f.title));
    assert.equal(segments.length, r.displacements.length - 1, what);
    segments.forEach((f, i) => {
      const a = r.displacements[i].x, b = r.displacements[i + 1].x, table = f.blocks.find((x) => x.table).table;
      const start = B.internal(r, a, "right"), end = B.internal(r, b, "left"), da = B.deflection(r, a), db = B.deflection(r, b);
      assert.deepEqual(table.rows.map((row) => row.slice(1)), [
        [page(start.V, "V"), page(end.V, "V")], [page(start.M, "M"), page(end.M, "M")],
        [page(da.theta, "theta"), page(db.theta, "theta")], [page(da.v, "v"), page(db.v, "v")],
      ], `${what} ${f.title}`);
      assert.ok(f.title.includes(`x = ${sig(show(B.fromOrigin(a, r.model.length, origin), "length"))} to ${sig(show(B.fromOrigin(b, r.model.length, origin), "length"))} ${u.symbol.length}`), `${what}: ${f.title}`);
    });
    // The selected point: the readout's values.
    const point = all.find((f) => f.title.startsWith("At the selected point")), pt = B.at(r, at), text = textOf(point.blocks);
    for (const [si, key] of [[pt.Vright, "V"], [pt.Mright, "M"], [pt.theta, "theta"], [pt.v, "v"]])
      assert.ok(text.includes(`= ${B.speech.texNumber(page(si, key))}`), `${what}: ${key} = ${page(si, key)} in ${text}`);
    assert.ok(point.title.endsWith(`x = ${sig(show(B.fromOrigin(at, r.model.length, origin), "length"))} ${u.symbol.length}`), what);
    // Peak stress and the equilibrium residual, as the results under the figure write them.
    const checks = textOf(all.at(-1).blocks);
    assert.ok(checks.includes(B.speech.texNumber(sig(show(Math.abs(r.extremes.M.value) * r.model.section.c / r.model.section.I, "stress"), 4))), `${what}: stress`);
    assert.ok(checks.includes(`Relative error of the two sums: ${sci(B.residual(r.equilibrium))}.`), what);
    // Every frame states its method honestly and says the solver is authoritative.
    assert.match(textOf(all[0].blocks), /The direct stiffness solver is authoritative/);
    const deg = B.indeterminacy(r.model.supports);
    assert.match(textOf(all[0].blocks), deg ? /compatibility, the force method, worked with Macaulay's double integration/ : /equilibrium alone/);
  }
});

test("a beam with too many unknowns states the set-up and lists the solver's values instead of a worked system", () => {
  const c = fixtures.cases.find((x) => x.id === "continuous-32-span-fixed-ends-udl"), r = solved(c.model);
  const D = H.derive(r, { units: "kN-m" });
  assert.equal(D.written, false);
  assert.equal(D.hand, null);
  const frames = H.frames(r, { units: "kN-m" }).flatMap((s) => s.frames);
  const system = frames.find((f) => f.title.startsWith("Compatibility"));
  assert.match(system.title, /too many to write out/);
  assert.ok(!system.blocks.some((b) => b.eq && /R_\{1\} \+/.test(b.eq)), "no numeric rows are written");
  assert.match(textOf(frames.find((f) => f.title === "Reactions from the compatibility equations").blocks), /These are the solver's values/);
});

test("the Markdown export parses in beamdswitch, with plain spoken narration on every slide and readable equations", () => {
  for (const { p, units, origin } of CASES) {
    const r = solved(presetModel(p)), what = `${p.id} ${units} ${origin}`;
    const md = H.markdown(r, { units, origin, at: r.model.length / 4, title: p.label }), deck = parseDeck(md);
    assert.equal(deck.meta.voice, "bf_emma", what);
    assert.equal(deck.meta.title, `Hand calculations: ${p.label}`, what);
    assert.deepEqual(deck.frames.filter((f) => f.kind === "section").map((f) => f.title),
      ["Method and reactions", "Shear, moment, slope and deflection by segment", "At the selected point", "Stress and equilibrium"], what);
    assert.equal(md.match(/^::: narration$/gm).length, deck.frames.length, what);
    for (const f of deck.frames) {
      assert.ok(splitSentences(f.narration).length > 0, `${what}: "${f.title}" is narrated`);
      assert.doesNotMatch(f.narration, /[$\\`*_#|<>×⁰¹²³⁴⁵⁶⁷⁸⁹⁻]/, `${what}: "${f.title}" reads as speech`);
    }
    // Display maths is one $$ … $$ per line; every inline $ pairs up; the page can draw every equation.
    for (const line of md.split("\n")) {
      if (line.startsWith("$$")) assert.match(line, /^\$\$ .+ \$\$$/, `${what}: ${line}`);
      else assert.equal((line.match(/\$/g) || []).length % 2, 0, `${what}: ${line}`);
    }
    for (const [, tex] of md.matchAll(/\$\$ (.+) \$\$/g)) assert.doesNotMatch(H.texText(tex), /\\/, `${what}: ${tex}`);
  }
});

test("the beamdswitch deck carries the hand calculations as their own narrated section", () => {
  for (const { p, units, origin } of CASES.filter((_, i) => i % 3 === 0)) {
    const r = solved(presetModel(p)), what = `${p.id} ${units} ${origin}`;
    const md = H.deck(H.beamReport(r, { units, origin, at: r.model.length / 2, title: p.label })), deck = parseDeck(md);
    assert.deepEqual(deck.frames.filter((f) => f.kind === "section").map((f) => f.title), ["Set-up", "Method", "Results", "Hand calculations", "Checks and takeaway"], what);
    assert.equal(deck.frames.find((f) => f.title === "Hand calculations").narration, "Part 4. Hand calculations.");
    assert.equal(deck.frames.find((f) => f.title === "Checks and takeaway").narration, "Part 5. Checks and takeaway.");
    const hand = deck.frames.filter((f) => f.section === "Hand calculations" && f.kind === "frame");
    assert.ok(hand.some((f) => /^Segment 1:/.test(f.title)) && hand.some((f) => f.title.startsWith("At the selected point")), what);
    assert.equal(md.match(/^::: narration$/gm).length, deck.frames.length, what);
    assert.equal(deck.meta.voice, "bf_emma", what);
  }
  // A long beam's deck carries a slide for every segment, as the Markdown does.
  const c = fixtures.cases.find((x) => x.id === "random-1"), r = solved(c.model);
  const deck = parseDeck(H.deck(H.beamReport(r, { units: "N-mm" })));
  const segs = deck.frames.filter((f) => f.section === "Hand calculations" && /^Segment \d+:/.test(f.title));
  assert.equal(segs.length, r.displacements.length - 1);
  const full = parseDeck(H.markdown(r, { units: "N-mm" })).frames.filter((f) => /^Segment \d+:/.test(f.title));
  assert.equal(full.length, r.displacements.length - 1);
});

test("deck adds only the hand section to the shared template's deck, with the template's frame rules", () => {
  const T = require("../beamdswitch.js");
  const frame = { title: "F", body: "text", narration: "Said." };
  const good = { meta: { title: "T" }, narration: "Hello.", setup: [frame], method: [frame], results: [frame], checks: [{ ...frame, key: "Remember this." }] };
  assert.equal(H.deck(good), T.deck(good));
  assert.equal(H.deck({ ...good, hand: [] }), T.deck(good));
  const md = H.deck({ ...good, hand: [{ title: "Reactions", body: "$$ R = 1 $$", narration: "One." }] });
  assert.equal(md.replace(/\n# Hand calculations\n[\s\S]*?(?=\n# Checks and takeaway\n)/, "").replace("Part 5. Checks", "Part 4. Checks"), T.deck(good));
  assert.throws(() => H.deck({ ...good, hand: [{ ...frame, narration: "" }] }), /needs a narration/);
  assert.throws(() => H.deck({ ...good, hand: [{ ...frame, narration: "It is $x$." }] }), /plain spoken prose/);
  assert.throws(() => H.deck({ ...good, hand: [{ ...frame, body: "a\n## sneaky frame" }] }), /heading/);
  assert.throws(() => H.deck({ ...good, checks: [frame], hand: [frame] }), /::: key/);
});

test("the TeX subset draws as text, fractions, superscripts and subscripts", () => {
  assert.deepEqual(H.texNodes("R_{2} = -\\frac{-180}{6}"), [
    "R", { t: "sub", c: ["2"] }, " = −", { t: "frac", n: ["−180"], d: ["6"] },
  ]);
  assert.equal(H.texText("\\langle x - 2 \\rangle^{3} \\quad \\theta(0) = 1{,}000\\ \\mathrm{kN\\cdot m^2}"), "⟨x − 2 ⟩^3 θ(0) = 1,000 kN·m^2");
  assert.equal(H.texText("\\sigma_{\\max} = \\frac{|M|_{\\max}\\, c}{I}"), "σ_max = (|M|_max c)/(I)");
});

/* The page's hand-calculation view. */
const node = (e) => [e, ...(e.children || []).flatMap(node)];
const text = (e) => node(e).map((n) => n.textContent ?? "").join("");
const pressPlot = (p, key) => {
  for (const fn of p.document.getElementById("plots").listeners.keydown)
    fn({ key, shiftKey: false, preventDefault() {}, target: { closest: () => null, classList: { contains: (c) => c === "plotarea" } } });
};

test("the page shows the hand calculations for every segment and the selected point, in its units and origin", async () => {
  const p = await page();
  p.choose("preset", "pin-pin-mixed");
  p.choose("units", "kN-m");
  p.choose("origin", "mid");
  const body = p.document.getElementById("hand-body"), parts = body.children;
  assert.deepEqual(parts.map((d) => d.children[0].textContent), ["Method and reactions", "Shear, moment, slope and deflection by segment", "Stress and equilibrium"]);
  const segments = parts[1].children.filter((e) => e.tag === "details");
  assert.equal(segments.length, 3);
  assert.ok(segments.every((d) => d.open));
  assert.equal(segments[0].children[0].textContent, "Segment 1: x = −4 to −1 m");
  // The equations are drawn as text with fractions, not left as TeX.
  const eqs = node(body).filter((e) => e.className === "eq");
  assert.ok(eqs.length > 10);
  for (const e of eqs) assert.doesNotMatch(text(e), /\\/);
  assert.ok(node(body).some((e) => e.className === "frac"));
  // The selected point follows the cursor: Home puts it at the left end, PageDown at the next event.
  const point = p.document.getElementById("hand-point");
  pressPlot(p, "Home");
  assert.equal(point.children[0].children[0].textContent, "At the selected point x = −4 m");
  pressPlot(p, "PageDown");
  assert.equal(point.children[0].children[0].textContent, "At the selected point x = −1 m");
  assert.match(text(point.children[0]), /A support or load acts here/);
  const readout = p.document.getElementById("readout").children.map((s) => s.children[1].textContent);
  const V = readout[1].split(" → ").at(-1).replace(/ kN$/, "");
  assert.ok(text(point.children[0]).includes(`= ${V} kN`), `${V} in ${text(point.children[0])}`);
});

test("Save Markdown and Copy Markdown hand over the same document, and nothing while the beam cannot be solved", async () => {
  const copied = [];
  const p = await page({ navigator: { clipboard: { writeText: async (t) => { copied.push(t); } } } });
  p.choose("preset", "continuous");
  assert.equal(await p.save("save-hand", "hand-status"), "Saved beamdiag-hand-calculations.md.");
  const [file] = p.saved;
  assert.equal(file.name, "beamdiag-hand-calculations.md");
  assert.equal(file.blob.type, "text/markdown");
  const md = await file.blob.text(), deck = parseDeck(md);
  assert.equal(deck.meta.title, `Hand calculations: ${raw.presets.find((x) => x.id === "continuous").label}`);
  assert.equal(deck.meta.voice, "bf_emma");
  assert.ok(deck.frames.some((f) => f.title.startsWith("At the selected point")));
  assert.equal(await p.save("copy-hand", "hand-status"), "Copied the hand calculations as Markdown.");
  assert.deepEqual(copied, [md]);
  // The narrated deck now carries the same hand calculations.
  assert.match(await p.save("save-beamdswitch"), /^Saved/);
  assert.ok(parseDeck(await p.saved.at(-1).blob.text()).frames.some((f) => f.title === "Hand calculations" && f.kind === "section"));
  p.input("length", -1);
  assert.equal(await p.save("save-hand", "hand-status"), "Fix the beam first: there is no solution to save.");
  assert.equal(await p.save("copy-hand", "hand-status"), "Fix the beam first: there is no solution to copy.");
  assert.equal(p.saved.length, 2);
  assert.match(text(p.document.getElementById("hand-body")), /Fix the beam first/);
});
