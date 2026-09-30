import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import vm from "node:vm";

const B = createRequire(import.meta.url)("../engine.js");

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
        const p = pts.find((p) => Math.abs(p.x - start - u) < 1e-8);
        assert.ok(p, `critical point at ${start + u}`);
        const v = q / (120 * E * I) * u ** 2 * (u - 1) ** 2 * (2 * u - 1);
        assert.ok(Math.abs(p.v - v) < 1e-12);
        assert.ok(Math.abs(B.internal(r, p.x).V) < 1e-6);
      }
      assert.ok(pts.some((p) => Math.abs(p.x - start - 0.5) < 1e-8));
      const extrema = B.extremes(r);
      for (const key of ["V", "M", "v"]) {
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

class Element {
  constructor(tag = "div") {
    this.tag = tag; this.children = []; this.dataset = {}; this.attrs = {}; this.listeners = {};
    this.value = ""; this.classList = { add() {}, remove() {}, contains() { return false; } };
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  add(child) { this.append(child); }
  setAttribute(key, value) { this.attrs[key] = value; }
  removeAttribute(key) { delete this.attrs[key]; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  dispatch(type) { for (const fn of this.listeners[type] || []) fn({ target: this }); }
  querySelector() { return null; }
  focus() {}
}

async function page({ runTimers = false } = {}) {
  const nodes = new Map(), tools = new Map(), buttons = ["point", "moment"].map((kind) => {
    const b = new Element("button"); b.dataset.add = kind; return b;
  });
  const all = () => {
    const out = [];
    const visit = (e) => { out.push(e); for (const c of e.children || []) visit(c); };
    for (const e of nodes.values()) visit(e);
    return out;
  };
  const document = {
    getElementById(id) { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); },
    createElement: (tag) => new Element(tag), createElementNS: (_, tag) => new Element(tag),
    createTextNode: (text) => ({ textContent: text }),
    querySelector(selector) { const field = selector.match(/^\[data-field="(.+)"\]$/)?.[1]; return all().find((e) => e.dataset?.field === field) || null; },
    querySelectorAll(selector) {
      if (selector === "[data-add]") return buttons;
      if (selector === "[data-field]") return all().filter((e) => e.dataset?.field);
      return [];
    },
    modelContext: { registerTool: (tool) => tools.set(tool.name, tool) },
  };
  let reads = 0, writes = 0;
  const context = vm.createContext({ document, navigator: {}, console,
    Option: class extends Element { constructor(label, value) { super("option"); this.value = value; } },
    location: { get hash() { reads++; return "#m=obsolete-model"; } },
    history: { replaceState() { writes++; } },
    setTimeout: (fn) => { if (runTimers) fn(); return 1; }, clearTimeout() {},
  });
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) vm.runInContext(match[1], context);
  const input = (id, value) => { const e = document.getElementById(id); e.value = String(value); e.dispatch("input"); };
  const current = async () => JSON.parse((await tools.get("get_current_beam").execute()).content[0].text);
  return { document, buttons, tools, input, current, urlAccess: () => ({ reads, writes }) };
}

test("length edits preserve every right-end attachment through invalid inputs and presets", async () => {
  const p = await page();
  assert.equal((await p.current()).model.length, 6);
  for (const b of p.buttons) b.dispatch("click");
  for (const field of ["loads.1.x", "loads.2.x"]) {
    const e = p.document.querySelector(`[data-field="${field}"]`);
    e.value = "6"; e.dispatch("input");
  }
  for (const value of ["", 0, -1, "", 8, "", 10]) p.input("length", value);
  let beam = await p.current();
  assert.equal(beam.model.length, 10);
  assert.equal(beam.model.supports[1].x, 10);
  assert.equal(beam.model.loads[0].x2, 10);
  assert.equal(beam.model.loads[1].x, 10);
  assert.equal(beam.model.loads[2].x, 10);
  const preset = p.document.getElementById("preset");
  preset.value = "pin-pin-udl"; preset.dispatch("change");
  p.input("length", ""); p.input("length", 7);
  beam = await p.current();
  assert.equal(beam.model.supports[1].x, 7);
  assert.equal(beam.model.loads[0].x2, 7);
  const deck = JSON.parse((await p.tools.get("export_nastran_bdf").execute({})).content[0].text);
  assert.ok(deck.bdf.split("\n").some((line) => line.trim() === "SOL 101"));
  assert.deepEqual(p.urlAccess(), { reads: 0, writes: 0 });
});

test("rendered short-span diagrams contain their extreme markers within the plotted ranges", async () => {
  const p = await page();
  const field = (name, value, event = "input") => {
    const e = p.document.querySelector(`[data-field="${name}"]`);
    e.value = String(value); e.dispatch(event);
  };
  p.input("length", 400);
  p.document.getElementById("add-support").dispatch("click");
  field("supports.2.x", 1);
  field("loads.0.x2", 1);
  field("loads.0.q1", -12);
  field("loads.0.q2", 12);
  const shape = p.document.getElementById("shape");
  shape.value = "custom"; shape.dispatch("change");
  field("section.I", 3000);
  for (let i = 0; i < 3; i++) field(`supports.${i}.kind`, "fixed", "change");
  const svg = p.document.getElementById("plots").children[0];
  const plot = svg.children.find((e) => e.attrs?.class === "plotarea");
  for (const color of ["var(--shear)", "var(--moment)", "var(--fg)"]) {
    const path = plot.children.find((e) => e.tag === "path" && e.attrs.stroke === color);
    const marker = plot.children.find((e) => e.tag === "circle" && e.attrs.fill === color);
    const ys = [...path.attrs.d.matchAll(/[ML][-\d.]+,([-\d.]+)/g)].map((match) => Number(match[1]));
    const lo = Math.min(...ys), hi = Math.max(...ys);
    assert.ok(hi - lo > 20, `${color} diagram must not be flat`);
    assert.ok(marker.attrs.cy >= lo - 0.01 && marker.attrs.cy <= hi + 0.01, `${color} marker lies within the curve's range`);
  }
});

// Parses a figure label number: plain ("−2.5", "30.00", "2.5e+21") or a power of ten ("−2.5×10¹²").
const labelNumber = (str) => {
  const m = str.replace(/,/g, "").replace(/−/g, "-").match(/^(-?[\d.]+(?:e[-+]\d+)?)(?:×10([⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+))?/);
  const e = m[2] ? Number([...m[2]].map((c) => (c === "⁻" ? "-" : "⁰¹²³⁴⁵⁶⁷⁸⁹".indexOf(c))).join("")) : 0;
  return Number(m[1]) * 10 ** e;
};

async function extremeBeam(magnitude, width) {
  const p = await page({ runTimers: true });
  p.document.getElementById("plots").clientWidth = width;
  for (const b of p.buttons) b.dispatch("click");
  const field = (name, value) => {
    const e = p.document.querySelector(`[data-field="${name}"]`);
    e.value = String(value); e.dispatch("input");
  };
  field("loads.1.x", 2);
  field("loads.2.x", 4);
  field("loads.0.q1", -magnitude);
  field("loads.0.q2", -magnitude / 2);
  field("loads.1.F", -3 * magnitude);
  field("loads.2.C", magnitude);
  const svg = p.document.getElementById("plots").children[0];
  return { p, svg, W: svg.attrs.width, H: svg.attrs.height };
}

function drawn(svg) {
  const out = [];
  const visit = (e) => {
    if (/\b(hit|ring)\b/.test(e.attrs?.class || "")) return;
    out.push(e);
    for (const c of e.children || []) visit(c);
  };
  visit(svg);
  return out;
}

for (const width of [700, 360]) {
  test(`extreme loads keep every diagram, arrow and label inside the ${width}px figure`, async () => {
    for (const magnitude of [1e9, 1e12, 1e15, 1e300]) {
      const { p, svg, W, H } = await extremeBeam(magnitude, width);
      const beam = (await p.current()).model;
      assert.equal(beam.loads[1].F, -3 * magnitude * 1e3, "the typed load is kept exactly");
      for (const e of drawn(svg)) {
        const where = `${magnitude}: ${e.tag} ${e.textContent ?? e.attrs.d ?? ""}`;
        if (e.tag === "text") {
          // Overestimates the rendered width: 7px per character at the 11–11.5px label sizes.
          const w = 7 * [...e.textContent].length, x = e.attrs.x, anchor = e.attrs["text-anchor"] || "start";
          const left = anchor === "end" ? x - w : anchor === "middle" ? x - w / 2 : x;
          assert.ok(left >= 0 && left + w <= W, `${where} fits horizontally (${left}..${left + w} of ${W})`);
          assert.ok(e.attrs.y - 12 >= 0 && e.attrs.y <= H, `${where} fits vertically`);
        }
        for (const [k, limit] of [["x1", W], ["x2", W], ["cx", W], ["y1", H], ["y2", H], ["cy", H]]) {
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

test("extreme-load diagrams fill their panels and label ticks and extremes exactly", async () => {
  for (const magnitude of [1e9, 1e15, 1e300]) {
    const { p, svg } = await extremeBeam(magnitude, 700);
    const result = (await p.current()).extremes;
    const plot = svg.children.find((e) => e.attrs?.class === "plotarea");
    const axes = plot.children.filter((e) => e.attrs?.class === "axis");
    const curves = ["var(--shear)", "var(--moment)", "var(--fg)"].map((color) =>
      plot.children.find((e) => e.tag === "path" && e.attrs.stroke === color));
    axes.forEach((axis, i) => {
      const grid = axis.children.filter((e) => e.tag === "line").slice(0, -1);
      const labels = axis.children.filter((e) => e.tag === "text").map((e) => labelNumber(e.textContent));
      assert.equal(grid.length, labels.length);
      // Tick labels are exact: evenly spaced values at evenly spaced grid lines, zero on the zero line.
      const step = labels[1] - labels[0], px = grid[1].attrs.y1 - grid[0].attrs.y1;
      labels.forEach((v, j) => {
        assert.ok(Math.abs(v - labels[0] - j * step) <= 1e-9 * Math.abs(step), `tick ${j} of axis ${i}`);
        assert.ok(Math.abs(grid[j].attrs.y1 - grid[0].attrs.y1 - j * px) < 1e-6);
      });
      const zero = axis.children.at(-1).attrs.y1;
      assert.ok(Math.abs(grid[0].attrs.y1 + (0 - labels[0]) / step * px - zero) < 1e-6, `zero line of axis ${i}`);
      const ys = [...curves[i].attrs.d.matchAll(/[ML][-\d.]+,([-\d.]+)/g)].map((m) => Number(m[1]));
      assert.ok(Math.max(...ys) - Math.min(...ys) > 40, `curve ${i} at ${magnitude} is scaled to its panel, not flat`);
      const gy = grid.map((g) => g.attrs.y1);
      assert.ok(Math.min(...ys) >= Math.min(...gy) - Math.abs(px) && Math.max(...ys) <= Math.max(...gy) + Math.abs(px),
        `curve ${i} stays within a tick step of its outer grid lines`);
    });
    const extremeLabels = plot.children.filter((e) => e.tag === "text" && e.attrs.class === "val").map((e) => e.textContent);
    for (const [key, scale] of [["shear", 1e3], ["moment", 1e3], ["deflection", 1e-3]]) {
      const expected = result[key].value / scale;
      assert.ok(extremeLabels.some((s) => Math.abs(labelNumber(s) - expected) <= 5e-4 * Math.abs(expected)),
        `${key} extreme ${expected} is labelled (${extremeLabels})`);
    }
  }
});

test("the cursor readout stays compact at 1e300 kN on a 360px figure", async () => {
  const { p } = await extremeBeam(1e300, 360);
  const readout = p.document.getElementById("readout");
  const values = Object.fromEntries(readout.children.map((s) => [s.children[0].textContent.trim(), s.children[1].textContent]));
  for (const [k, v] of Object.entries(values)) {
    // Overestimates the rendered width: 9px per character at the .875rem readout size; each entry wraps on its own.
    assert.ok(9 * [...`${k} ${v}`].length <= 360, `readout ${k} "${v}" fits its 360px container`);
  }
  assert.match(values.V, /×10[²³][⁰¹²³⁴⁵⁶⁷⁸⁹]{2} kN$/);
  assert.match(values.M, /×10[²³][⁰¹²³⁴⁵⁶⁷⁸⁹]{2} kN·m$/);
  assert.match(values.v, /×10[⁰¹²³⁴⁵⁶⁷⁸⁹]+ mm$/);
  assert.match(values.θ, /×10[⁰¹²³⁴⁵⁶⁷⁸⁹]+ mrad$/);
});

test("support-reaction boxes stay compact at 1e300 kN on a 360px figure", async () => {
  const { p } = await extremeBeam(1e300, 360);
  const boxes = p.document.getElementById("reactions").children.map((li) => li.children.map((c) => c.textContent || "").join(""));
  assert.ok(boxes.length > 0);
  for (const text of boxes) {
    // Same overestimate as the readout: 9px per character at .875rem, plus the swatch and padding.
    assert.ok(9 * [...text].length + 40 <= 360, `reaction "${text}" fits its 360px container`);
    assert.match(text, /×10[²³][⁰¹²³⁴⁵⁶⁷⁸⁹]{2} kN(, −?[\d.]+×10[⁰¹²³⁴⁵⁶⁷⁸⁹]+ kN·m)?$/);
  }
});

test("support-reaction boxes keep plain digits under normal loads", async () => {
  const p = await page();
  const boxes = p.document.getElementById("reactions").children.map((li) => li.children.map((c) => c.textContent || "").join(""));
  assert.ok(boxes.length > 0);
  for (const text of boxes) assert.match(text, /: −?[\d,.]+ kN(, −?[\d,.]+ kN·m)?$/);
});

test("the cursor readout keeps plain digits under normal loads", async () => {
  const p = await page();
  const readout = p.document.getElementById("readout");
  for (const s of readout.children) assert.match(s.children[1].textContent, /^−?[\d,.]+( → −?[\d,.]+)? (m|kN|kN·m|mm|mrad)$/);
});

test("normal loads keep the usual margin and plain-digit labels", async () => {
  const p = await page();
  const svg = p.document.getElementById("plots").children[0];
  const plot = svg.children.find((e) => e.attrs?.class === "plotarea");
  const axes = plot.children.filter((e) => e.attrs?.class === "axis");
  for (const axis of axes) {
    assert.equal(axis.children[0].attrs.x1, 64);
    for (const t of axis.children.filter((e) => e.tag === "text")) assert.match(t.textContent, /^−?[\d.]+$/);
  }
  const texts = drawn(svg).filter((e) => e.tag === "text").map((e) => e.textContent);
  assert.ok(texts.includes("−10 kN/m"));
  assert.ok(texts.includes("30.00 kN ↑"));
  assert.ok(texts.includes("45 kN·m"));
});

test("a point force larger than the last solved model keeps its arrow on the figure", async () => {
  const p = await page({ runTimers: true });
  p.buttons[0].dispatch("click");
  const e = p.document.querySelector('[data-field="loads.1.F"]');
  for (const value of [1e306, 1e300]) {
    e.value = String(value); e.dispatch("input");
    const svg = p.document.getElementById("plots").children[0];
    for (const line of drawn(svg).filter((n) => n.tag === "line")) {
      assert.ok(line.attrs.y1 >= 0 && line.attrs.y2 >= 0, `line at ${value} starts on the figure`);
    }
  }
});
