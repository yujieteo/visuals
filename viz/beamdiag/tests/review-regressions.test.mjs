import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { page } from "./page-harness.mjs";

const require = createRequire(import.meta.url);
const B = require("../engine.js");
/** @typedef {Awaited<ReturnType<typeof page>>} Page */
/** @typedef {import("./page-harness.mjs").Element} Element */
/** @template T @param {T | undefined | null} x @param {string} what @returns {T} */
const found = (x, what) => { assert.ok(x, what); return x; };
/** @param {Page} p @param {string} name */
const fieldOf = (p, name) => found(p.document.querySelector(`[data-field="${name}"]`), name);

test("short-span plot samples contain exact critical points for every axis", () => {
  for (const start of [0, 1]) for (const q of [-12000, 12000]) {
    const E = 200e9, I = 3e-9;
    const r = B.solve({ length: 400, material: { E, nu: 0.3 }, section: { A: 0.01, I },
      supports: [...new Set([0, start, start + 1, 400])].map((x) => ({ kind: "fixed", x })),
      loads: [{ kind: "dist", x1: start, x2: start + 1, q1: -q, q2: q }] });
    const ex = B.extremes(r).v;
    const t = (1 - 1 / Math.sqrt(5)) / 2;
    const expected = q / (120 * E * I) * t ** 2 * (t - 1) ** 2 * (2 * t - 1);
    assert.ok(Math.abs(Math.abs(ex.value) - Math.abs(expected)) < 1e-14);
    assert.ok(Math.min(Math.abs(ex.x - start - t), Math.abs(ex.x - start - (1 - t))) < 1e-8);
    assert.ok(Math.abs(B.deflection(r, ex.x).theta) < 1e-12);
    for (const count of [1, 800]) {
      const pts = B.diagram(r, count);
      for (const u of [t, 1 - t]) {
        const at = found(pts.find((p) => Math.abs(p.x - start - u) < 1e-8), `critical point at ${start + u}`);
        const v = q / (120 * E * I) * u ** 2 * (u - 1) ** 2 * (2 * u - 1);
        assert.ok(Math.abs(at.v - v) < 1e-12);
        assert.ok(Math.abs(B.internal(r, at.x).V) < 1e-6);
      }
      assert.ok(pts.some((p) => Math.abs(p.x - start - 0.5) < 1e-8));
      const extrema = B.extremes(r);
      for (const key of /** @type {const} */ (["V", "M", "v"])) {
        const values = pts.map((p) => p[key]);
        assert.ok(extrema[key].value >= Math.min(...values) - 1e-10);
        assert.ok(extrema[key].value <= Math.max(...values) + 1e-10);
        assert.ok(pts.some((p) => Math.abs(p[key] - extrema[key].value) < 1e-10));
      }
      const fine = B.diagram(B.solve({ ...r.model, divisions: 10000 }), count);
      assert.deepEqual(fine, pts);
      assert.ok(pts.length < count + 40);
    }
  }
});

test("length edits preserve every right-end attachment through invalid inputs and presets", async () => {
  const p = await page();
  assert.equal((await p.current()).model.length, 6);
  for (const b of p.buttons) b.dispatch("click");
  for (const field of ["loads.1.x", "loads.2.x"]) {
    const e = fieldOf(p, field);
    e.value = "6000"; e.dispatch("input");
  }
  for (const value of ["", 0, -1, "", 8000, "", 10000]) p.input("length", value);
  let beam = await p.current();
  assert.equal(beam.model.length, 10);
  assert.equal(beam.model.supports[1].x, 10);
  assert.equal(beam.model.loads[0].x2, 10);
  assert.equal(beam.model.loads[1].x, 10);
  assert.equal(beam.model.loads[2].x, 10);
  const preset = p.document.getElementById("preset");
  preset.value = "pin-pin-udl"; preset.dispatch("change");
  p.input("length", ""); p.input("length", 7000);
  beam = await p.current();
  assert.equal(beam.model.supports[1].x, 7);
  assert.equal(beam.model.loads[0].x2, 7);
  const deck = JSON.parse((await found(p.tools.get("export_nastran_bdf"), "export_nastran_bdf").execute({})).content[0].text);
  assert.ok(deck.bdf.split("\n").some((/** @type {string} */ line) => line.trim() === "SOL 101"));
  assert.deepEqual(p.urlAccess(), { reads: 0, writes: 0 });
});

test("rendered short-span diagrams contain their extreme markers within the plotted ranges", async () => {
  const p = await page();
  /** @param {string} name @param {unknown} value */
  const field = (name, value, event = "input") => {
    const e = fieldOf(p, name);
    e.value = String(value); e.dispatch(event);
  };
  p.input("length", 400000);
  p.document.getElementById("add-support").dispatch("click");
  field("supports.2.x", 1000);
  field("loads.0.x2", 1000);
  field("loads.0.q1", -12);
  field("loads.0.q2", 12);
  const shape = p.document.getElementById("shape");
  shape.value = "custom"; shape.dispatch("change");
  field("section.I", 3000); // mm⁴ in the default N, mm, MPa convention
  for (let i = 0; i < 3; i++) field(`supports.${i}.kind`, "fixed", "change");
  /** @type {Element} */
  const svg = p.document.getElementById("plots").children[0];
  /** @type {Element} */
  const plot = svg.children.find((/** @type {Element} */ e) => e.attrs?.class === "plotarea");
  for (const color of ["var(--shear)", "var(--moment)", "var(--fg)"]) {
    /** @type {Element} */
    const path = plot.children.find((/** @type {Element} */ e) => e.tag === "path" && e.attrs.stroke === color);
    /** @type {Element} */
    const marker = plot.children.find((/** @type {Element} */ e) => e.tag === "circle" && e.attrs.fill === color);
    const ys = [...path.attrs.d.matchAll(/[ML][-\d.]+,([-\d.]+)/g)].map((/** @type {RegExpMatchArray} */ match) => Number(match[1]));
    const lo = Math.min(...ys), hi = Math.max(...ys);
    assert.ok(hi - lo > 20, `${color} diagram must not be flat`);
    assert.ok(marker.attrs.cy >= lo - 0.01 && marker.attrs.cy <= hi + 0.01, `${color} marker lies within the curve's range`);
  }
});

// Parses a figure label number: plain ("−2.5", "30.00", "2.5e+21") or a power of ten ("−2.5×10¹²").
/** @param {string} str */
const labelNumber = (str) => {
  const m = found(str.replace(/,/g, "").replace(/−/g, "-").match(/^(-?[\d.]+(?:e[-+]\d+)?)(?:×10([⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+))?/), `a number: ${str}`);
  const e = m[2] ? Number([...m[2]].map((c) => (c === "⁻" ? "-" : "⁰¹²³⁴⁵⁶⁷⁸⁹".indexOf(c))).join("")) : 0;
  return Number(m[1]) * 10 ** e;
};

const UNITS = Object.values(B.UNIT_SYSTEMS);
const useUnits = (/** @type {Page} */ p, /** @type {string} */ id) => { const s = p.document.getElementById("units"); s.value = id; s.dispatch("change"); };
// Escapes a unit symbol such as "N·mm" or "lbf/in" for a regular expression.
const esc = (/** @type {string} */ str) => str.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/* A beam with every load kind whose magnitudes are typed in the `units` convention; loads sit 2 m
   and 4 m along the default 6 m beam whatever the convention. */
/** @param {number} magnitude @param {number} width */
async function extremeBeam(magnitude, width, units = "kN-m") {
  const p = await page({ runTimers: true });
  p.document.getElementById("plots").clientWidth = width;
  useUnits(p, units);
  for (const b of p.buttons) b.dispatch("click");
  /** @param {string} name @param {unknown} value */
  const field = (name, value) => {
    const e = fieldOf(p, name);
    e.value = String(value); e.dispatch("input");
  };
  field("loads.1.x", +B.toUnits(2, "length", units).toPrecision(10));
  field("loads.2.x", +B.toUnits(4, "length", units).toPrecision(10));
  field("loads.0.q1", -magnitude);
  field("loads.0.q2", -magnitude / 2);
  field("loads.1.F", -3 * magnitude);
  field("loads.2.C", magnitude);
  /** @type {Element} */
  const svg = p.document.getElementById("plots").children[0];
  return { p, svg, W: svg.attrs.width, H: svg.attrs.height };
}

/** @param {Element} svg */
function drawn(svg) {
  /** @type {Element[]} */
  const out = [];
  const visit = (/** @type {Element} */ e) => {
    if (/\b(hit|ring)\b/.test(e.attrs?.class || "")) return;
    out.push(e);
    for (const c of e.children || []) visit(c);
  };
  visit(svg);
  return out;
}

for (const width of [700, 360]) for (const { id } of UNITS) {
  test(`extreme loads keep every diagram, arrow and label inside the ${width}px figure in ${id}`, async () => {
    for (const magnitude of [1e9, 1e12, 1e15, 1e300]) {
      const { p, svg, W, H } = await extremeBeam(magnitude, width, id);
      const beam = (await p.current()).model;
      assert.equal(beam.loads[1].F, B.fromUnits(-3 * magnitude, "force", id), "the typed load is kept exactly");
      for (const e of drawn(svg)) {
        const where = `${magnitude}: ${e.tag} ${e.textContent ?? e.attrs.d ?? ""}`;
        if (e.tag === "text") {
          // Overestimates the rendered width: 7px per character at the 11–11.5px label sizes.
          const w = 7 * [.../** @type {string} */ (e.textContent)].length, x = e.attrs.x, anchor = e.attrs["text-anchor"] || "start";
          const left = anchor === "end" ? x - w : anchor === "middle" ? x - w / 2 : x;
          assert.ok(left >= 0 && left + w <= W, `${where} fits horizontally (${left}..${left + w} of ${W})`);
          assert.ok(e.attrs.y - 12 >= 0 && e.attrs.y <= H, `${where} fits vertically`);
        }
        for (const [k, limit] of /** @type {[string, number][]} */ ([["x1", W], ["x2", W], ["cx", W], ["y1", H], ["y2", H], ["cy", H]])) {
          if (k in e.attrs) assert.ok(e.attrs[k] >= 0 && e.attrs[k] <= limit, `${where} ${k}=${e.attrs[k]}`);
        }
        if (e.tag === "path") {
          let x = 0, y = 0;
          for (const [, cmd, args] of e.attrs.d.matchAll(/([MLlhA])([^MLlhAZz]*)/g)) {
            const n = args.trim().split(/[\s,]+/).map(Number);
            if (cmd === "M" || cmd === "L") [x, y] = n;
            else if (cmd === "l") { x += n[0]; y += n[1]; }
            else if (cmd === "h") x += n[0];
            else [x, y] = n.slice(-2);
            assert.ok(x >= 0 && x <= W && y >= 0 && y <= H, `${where} point ${x},${y}`);
          }
        }
      }
    }
  });
}

for (const { id } of UNITS) test(`extreme-load diagrams fill their panels and label ticks and extremes exactly in ${id}`, async () => {
  for (const magnitude of [1e9, 1e15, 1e300]) {
    const { p, svg } = await extremeBeam(magnitude, 700, id);
    const result = (await p.current()).extremes;
    /** @type {Element} */
    const plot = svg.children.find((/** @type {Element} */ e) => e.attrs?.class === "plotarea");
    /** @type {Element[]} */
    const axes = plot.children.filter((/** @type {Element} */ e) => e.attrs?.class === "axis");
    /** @type {Element[]} */
    const curves = ["var(--shear)", "var(--moment)", "var(--fg)"].map((color) =>
      plot.children.find((/** @type {Element} */ e) => e.tag === "path" && e.attrs.stroke === color));
    axes.forEach((axis, i) => {
      /** @type {Element[]} */
      const grid = axis.children.filter((/** @type {Element} */ e) => e.tag === "line").slice(0, -1);
      /** @type {number[]} */
      const labels = axis.children.filter((/** @type {Element} */ e) => e.tag === "text").map((/** @type {Element} */ e) => labelNumber(/** @type {string} */ (e.textContent)));
      assert.equal(grid.length, labels.length);
      // Tick labels are exact: evenly spaced values at evenly spaced grid lines, zero on the zero line.
      const step = labels[1] - labels[0], px = grid[1].attrs.y1 - grid[0].attrs.y1;
      labels.forEach((v, j) => {
        assert.ok(Math.abs(v - labels[0] - j * step) <= 1e-9 * Math.abs(step), `tick ${j} of axis ${i}`);
        assert.ok(Math.abs(grid[j].attrs.y1 - grid[0].attrs.y1 - j * px) < 1e-6);
      });
      const zero = axis.children.at(-1).attrs.y1;
      assert.ok(Math.abs(grid[0].attrs.y1 + (0 - labels[0]) / step * px - zero) < 1e-6, `zero line of axis ${i}`);
      const ys = [...curves[i].attrs.d.matchAll(/[ML][-\d.]+,([-\d.]+)/g)].map((/** @type {RegExpMatchArray} */ m) => Number(m[1]));
      assert.ok(Math.max(...ys) - Math.min(...ys) > 40, `curve ${i} at ${magnitude} is scaled to its panel, not flat`);
      const gy = grid.map((g) => g.attrs.y1);
      assert.ok(Math.min(...ys) >= Math.min(...gy) - Math.abs(px) && Math.max(...ys) <= Math.max(...gy) + Math.abs(px),
        `curve ${i} stays within a tick step of its outer grid lines`);
    });
    /** @type {string[]} */
    const extremeLabels = plot.children.filter((/** @type {Element} */ e) => e.tag === "text" && e.attrs.class === "val").map((/** @type {Element} */ e) => /** @type {string} */ (e.textContent));
    for (const [key, quantity] of /** @type {[string, Parameters<typeof B.toUnits>[1]][]} */ ([["shear", "force"], ["moment", "moment"], ["deflection", "length"]])) {
      const expected = B.toUnits(result[key].value, quantity, id);
      assert.ok(extremeLabels.some((s) => Math.abs(labelNumber(s) - expected) <= 5e-4 * Math.abs(expected)),
        `${key} extreme ${expected} is labelled (${extremeLabels})`);
    }
  }
});

for (const { id, symbol } of UNITS) test(`the cursor readout stays compact at 1e300 ${symbol.force} on a 360px figure`, async () => {
  const { p } = await extremeBeam(1e300, 360, id);
  const readout = p.document.getElementById("readout");
  /** @type {Record<string, string>} */
  const values = Object.fromEntries(readout.children.map((/** @type {Element} */ s) => [s.children[0].textContent.trim(), s.children[1].textContent]));
  for (const [k, v] of Object.entries(values)) {
    // Overestimates the rendered width: 9px per character at the .875rem readout size; each entry wraps on its own.
    assert.ok(9 * [...`${k} ${v}`].length <= 360, `readout ${k} "${v}" fits its 360px container`);
  }
  assert.match(values.V, new RegExp(`×10[²³][⁰¹²³⁴⁵⁶⁷⁸⁹]{2} ${esc(symbol.force)}$`));
  assert.match(values.M, new RegExp(`×10[²³][⁰¹²³⁴⁵⁶⁷⁸⁹]{2} ${esc(symbol.moment)}$`));
  assert.match(values.v, new RegExp(`×10[⁰¹²³⁴⁵⁶⁷⁸⁹]+ ${esc(symbol.length)}$`));
  assert.match(values.θ, /×10[⁰¹²³⁴⁵⁶⁷⁸⁹]+ rad$/);
});

for (const { id, symbol } of UNITS) test(`support-reaction boxes stay compact at 1e300 ${symbol.force} on a 360px figure`, async () => {
  const { p } = await extremeBeam(1e300, 360, id);
  /** @type {string[]} */
  const boxes = p.document.getElementById("reactions").children.map((/** @type {Element} */ li) => li.children.map((/** @type {Element} */ c) => c.textContent || "").join(""));
  assert.ok(boxes.length > 0);
  for (const text of boxes) {
    // Same overestimate as the readout: 9px per character at .875rem, plus the swatch and padding.
    assert.ok(9 * [...text].length + 40 <= 360, `reaction "${text}" fits its 360px container`);
    assert.match(text, new RegExp(`×10[²³][⁰¹²³⁴⁵⁶⁷⁸⁹]{2} ${esc(symbol.force)}(, −?[\\d.]+×10[⁰¹²³⁴⁵⁶⁷⁸⁹]+ ${esc(symbol.moment)})?$`));
  }
});

// Normal loads read in plain digits in kN, m; in N, mm the same moments are ~10⁷ N·mm and switch to powers of ten.
test("support-reaction boxes keep plain digits under normal loads", async () => {
  const p = await page();
  useUnits(p, "kN-m");
  /** @type {string[]} */
  const boxes = p.document.getElementById("reactions").children.map((/** @type {Element} */ li) => li.children.map((/** @type {Element} */ c) => c.textContent || "").join(""));
  assert.ok(boxes.length > 0);
  for (const text of boxes) assert.match(text, /: −?[\d,.]+ kN(, −?[\d,.]+ kN·m)?$/);
});

test("the cursor readout keeps plain digits under normal loads", async () => {
  const p = await page();
  useUnits(p, "kN-m");
  const readout = p.document.getElementById("readout");
  for (const s of readout.children) assert.match(s.children[1].textContent, /^−?[\d,.]+( → −?[\d,.]+)? (m|kN|kN·m|rad)$/);
});

test("normal loads keep the usual margin and plain-digit labels", async () => {
  const p = await page();
  useUnits(p, "kN-m");
  /** @type {Element} */
  const svg = p.document.getElementById("plots").children[0];
  /** @type {Element} */
  const plot = svg.children.find((/** @type {Element} */ e) => e.attrs?.class === "plotarea");
  /** @type {Element[]} */
  const axes = plot.children.filter((/** @type {Element} */ e) => e.attrs?.class === "axis");
  for (const axis of axes) {
    assert.equal(axis.children[0].attrs.x1, 64);
    for (const t of axis.children.filter((/** @type {Element} */ e) => e.tag === "text")) assert.match(t.textContent, /^−?[\d.]+$/);
  }
  const texts = drawn(svg).filter((e) => e.tag === "text").map((e) => e.textContent);
  assert.ok(texts.includes("−10 kN/m"));
  assert.ok(texts.includes("30.00 kN ↑"));
  assert.ok(texts.includes("45 kN·m"));
});

for (const { id } of UNITS) test(`a point force larger than the last solved model keeps its arrow on the figure in ${id}`, async () => {
  const p = await page({ runTimers: true });
  useUnits(p, id);
  p.buttons[0].dispatch("click");
  const e = fieldOf(p, "loads.1.F");
  for (const value of [1e306, 1e300]) {
    e.value = String(value); e.dispatch("input");
    const svg = p.document.getElementById("plots").children[0];
    for (const line of drawn(svg).filter((n) => n.tag === "line")) {
      assert.ok(line.attrs.y1 >= 0 && line.attrs.y2 >= 0, `line at ${value} starts on the figure`);
    }
  }
});

test("results too large to show in the chosen units are refused instead of drawn as Infinity", async () => {
  const p = await page({ runTimers: true });
  useUnits(p, "N-mm");
  const e = fieldOf(p, "loads.0.q1");
  e.value = "-1e303"; e.dispatch("input"); // −10³⁰⁶ N/m: finite in SI, but its moments overflow in N·mm
  const box = p.document.getElementById("error");
  assert.equal(box.hidden, false);
  assert.match(box.children[1].textContent, /too large to show in SI: N, mm, MPa/);
  const svg = p.document.getElementById("plots").children[0];
  for (const n of drawn(svg)) for (const k of ["x1", "x2", "y1", "y2", "cx", "cy"]) if (k in n.attrs) assert.ok(Number.isFinite(Number(n.attrs[k])), `${n.tag} ${k}`);
  // The same beam is shown once a convention with larger units is chosen.
  useUnits(p, "kN-m");
  assert.equal(box.hidden, true);
});

test("switching units converts what was entered, keeps the beam and results, and reads new input in the new units", async () => {
  const p = await page();
  const units = p.document.getElementById("units"), field = (/** @type {string} */ name) => fieldOf(p, name);
  const switchTo = (/** @type {string} */ id) => { units.value = id; units.dispatch("change"); };
  const deck = async () => JSON.parse((await found(p.tools.get("export_nastran_bdf"), "export_nastran_bdf").execute({})).content[0].text).bdf;
  const before = await p.current();
  assert.equal(units.value, "N-mm");
  assert.deepEqual(units.children.map((/** @type {Element} */ o) => o.value), ["kN-m", "N-m", "N-mm", "lbf-in", "kip-in"]);
  assert.equal(p.document.getElementById("length").value, 6000);
  assert.equal(field("loads.0.q1").value, -10);
  assert.equal(field("section.b").value, 100);
  assert.equal(p.document.getElementById("E").value, 200000);
  assert.match(await deck(), /^\$ Beam, L = 6000 mm:.*\n\$ Units N, mm, MPa \(N\/mm2\)\./);

  switchTo("kN-m");
  assert.equal(p.document.getElementById("length").value, 6);
  assert.equal(field("loads.0.q1").value, -10);
  assert.equal(field("section.b").value, 0.1);
  assert.deepEqual(await p.current(), before, "the beam and its results do not change");

  switchTo("lbf-in");
  assert.equal(p.document.getElementById("length").value, 236.2204724);
  assert.equal(field("loads.0.q1").value, -57.10147155);
  assert.equal(p.document.getElementById("E").value, 29007547.55);
  assert.deepEqual(await p.current(), before);
  assert.match(await deck(), /\n\$ Units lbf, in, psi \(lbf\/in2\)\./);
  // Typed values are read in the current convention: 240 in and −50 lbf/in.
  p.input("length", 240);
  field("loads.0.q1").value = "-50"; field("loads.0.q1").dispatch("input");
  const typed = await p.current();
  assert.ok(Math.abs(typed.model.length - 6.096) < 1e-12);
  assert.ok(Math.abs(typed.model.loads[0].q1 + 50 * 4.4482216152605 / 0.0254) < 1e-9);
  assert.equal(typed.model.supports[1].x, typed.model.length, "the right-end support follows the length");

  // Through every convention and back, the fields show what was typed.
  for (const id of ["kip-in", "N-m", "kN-m", "N-mm", "lbf-in"]) switchTo(id);
  assert.equal(p.document.getElementById("length").value, 240);
  assert.equal(field("loads.0.q1").value, -50);
  assert.deepEqual(await p.current(), typed);
});

test("End moves a support handle to exactly the beam end, even when L is not a whole number of steps", async () => {
  const p = await page();
  const units = p.document.getElementById("units");
  units.value = "lbf-in"; units.dispatch("change");
  const key = (/** @type {string} */ handle, /** @type {string} */ name) => {
    for (const fn of p.document.getElementById("plots").listeners.keydown) {
      fn({ key: name, shiftKey: false, preventDefault() {}, target: { closest: () => ({ dataset: { key: handle } }) } });
    }
  };
  key("s1", "ArrowLeft");
  assert.notEqual((await p.current()).model.supports[1].x, 6);
  key("s1", "End");
  assert.equal((await p.current()).model.supports[1].x, 6);
});

test("typing back a shown position in N-mm gives that exact position", async () => {
  const p = await page();
  p.input("length", 4600);
  p.buttons[0].dispatch("click"); // a point force at L/2 = 2300 mm
  const e = fieldOf(p, "supports.0.x");
  e.value = "2300"; e.dispatch("input");
  const beam = await p.current();
  assert.equal(beam.error, undefined);
  assert.equal(beam.model.supports[0].x, 2.3);
  assert.equal(beam.model.supports[0].x, beam.model.loads[1].x);
});

test("typing a shown lbf-in position lands on the position it shows", async () => {
  const p = await page();
  useUnits(p, "lbf-in");
  p.buttons[0].dispatch("click");
  const e = fieldOf(p, "loads.1.x");
  e.value = "236.2204724"; e.dispatch("input"); // the right support at 6 m, as shown
  const beam = await p.current();
  assert.equal(beam.error, undefined);
  assert.equal(beam.model.loads[1].x, 6);
});
