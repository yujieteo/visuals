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

async function page() {
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
    setTimeout: () => 1, clearTimeout() {},
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
