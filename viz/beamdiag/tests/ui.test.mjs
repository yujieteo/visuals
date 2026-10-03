import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

/**
 * A stand-in element: a Proxy that answers every property the page reads, a no-op function for
 * anything it has not set, so its type is any.
 * @typedef {any} StandIn
 */
function page() {
  /** @type {Map<string, StandIn>} */
  const elements = new Map();
  /** @type {StandIn[]} */
  const created = [];
  /** @type {{ name: string, execute(input: object): Promise<{ content: { text: string }[] }> }[]} */
  const tools = [];
  /** @type {string[]} */
  const paths = [];
  /** @returns {StandIn} */
  function element() {
    const classes = new Set(), handlers = new Map();
    /** @type {Record<string | symbol, any>} */
    const target = {
      value: "", textContent: "", disabled: false, dataset: {}, clientWidth: 700,
      classList: { add: (/** @type {string} */ x) => classes.add(x), remove: (/** @type {string} */ x) => classes.delete(x), contains: (/** @type {string} */ x) => classes.has(x) },
      addEventListener: (/** @type {string} */ name, /** @type {(event: object) => void} */ fn) => handlers.set(name, fn),
      dispatch: (/** @type {string} */ name) => handlers.get(name)?.({}),
      setAttribute: (/** @type {string} */ name, /** @type {string} */ value) => { if (name === "d") paths.push(value); },
      querySelector: () => null, querySelectorAll: () => [], closest: () => null,
      getBoundingClientRect: () => ({ left: 0, width: 700 }),
      replaceChildren() { this.textContent = ""; },
    };
    const el = new Proxy(target, { get: (t, k) => k in t ? t[k] : () => {} });
    created.push(el);
    return el;
  }
  const document = {
    getElementById: (/** @type {string} */ id) => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
    createElement: element, createElementNS: element, createTextNode: (/** @type {string} */ text) => text,
    querySelectorAll: (/** @type {string} */ selector) => selector === "[data-add]" ? ["point", "moment", "dist"].map((kind) => {
      const el = document.getElementById(`add-${kind}`); el.dataset.add = kind; return el;
    }) : [],
    querySelector: (/** @type {string} */ selector) => created.findLast((el) => selector === `[data-field="${el.dataset.field}"]`) ?? null,
    activeElement: null,
  };
  const ctx = vm.createContext({ document, Option: function () { return element(); }, navigator: { modelContext: { registerTool: (/** @type {typeof tools[number]} */ tool) => tools.push(tool) } }, requestAnimationFrame: () => 0, cancelAnimationFrame() {}, setTimeout: (/** @type {() => void} */ fn) => { fn(); return 1; }, clearTimeout() {} });
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  for (const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(script[1], ctx);
  const get = document.getElementById;
  // These checks are written in metres and newtons; the page opens in N, mm, MPa.
  get("units").value = "N-m"; get("units").dispatch("change");
  // The deck is built only when shown, downloaded or copied; keep it shown.
  get("deck-details").open = true; get("deck-details").dispatch("toggle");
  const edit = (/** @type {StandIn} */ el, /** @type {unknown} */ value) => { el.value = String(value); el.dispatch("input"); };
  return {
    ctx, get, edit, paths, created,
    field: (/** @type {string} */ name) => document.querySelector(`[data-field="${name}"]`),
    current: async () => {
      const tool = tools.find((t) => t.name === "get_current_beam");
      assert.ok(tool, "the page registers get_current_beam");
      return JSON.parse((await tool.execute({})).content[0].text);
    },
  };
}

test("an exactly balanced default preset reports a zero relative error, not an infinite exponent", () => {
  const p = page();
  const stats = p.created.map((el) => el.textContent).filter((t) => typeof t === "string" && t.includes("relative error"));
  assert.ok(stats.length > 0);
  for (const text of stats) assert.doesNotMatch(text, /Infinity|NaN/);
  assert.ok(stats.some((text) => text.endsWith("relative error 0")));
});

test("invalid edits invalidate exports and mark all retained results stale, then recover", () => {
  const p = page();
  assert.ok(p.get("deck").textContent.includes("BEGIN BULK"));
  for (const [field, value, restore] of /** @type {[string, number, number][]} */ ([["supports.1.x", 7, 6], ["section.b", -1, 100]])) {
    p.edit(p.field(field), value);
    assert.equal(p.get("deck").textContent, "");
    assert.notEqual(p.get("export-status").textContent, "");
    for (const id of ["plots", "stats", "table"]) assert.equal(p.get(id).classList.contains("stale"), true);
    p.edit(p.field(field), restore);
    assert.ok(p.get("deck").textContent.includes("BEGIN BULK"));
    assert.equal(p.get("export-status").textContent, "");
    for (const id of ["plots", "stats", "table"]) assert.equal(p.get(id).classList.contains("stale"), false);
  }
});

test("incomplete length edits preserve support, force, couple and distributed-end attachments", async () => {
  const p = page();
  const original = (await p.current()).model;
  for (const kind of ["point", "moment"]) {
    p.get(`add-${kind}`).dispatch("click");
    const model = (await p.current()).model;
    p.edit(p.field(`loads.${model.loads.length - 1}.x`), original.length);
  }
  for (const value of ["", "0", "-1", "8"]) p.edit(p.get("length"), value);
  const model = (await p.current()).model;
  assert.equal(model.supports[1].x, 8);
  for (const load of model.loads) {
    if (load.kind === "dist") { assert.equal(load.x1, 0); assert.equal(load.x2, 8); }
    else assert.equal(load.x, 8);
  }
  // Choosing an example moves focus to it, which ends the length edit.
  p.get("length").dispatch("blur");
  p.get("preset").value = "pin-pin-udl";
  p.get("preset").dispatch("change");
  p.edit(p.get("length"), "");
  p.edit(p.get("length"), "10");
  assert.equal((await p.current()).model.supports[1].x, 10);
  assert.ok(p.get("deck").textContent.includes("BEGIN BULK"));
});

test("length typing never captures interior coordinates that match an intermediate length", async () => {
  const p = page();
  p.get("add-support").dispatch("click");
  p.edit(p.field("supports.2.x"), 1);
  for (const kind of ["point", "moment"]) {
    for (const x of [1, 6]) {
      p.get(`add-${kind}`).dispatch("click");
      const model = (await p.current()).model;
      p.edit(p.field(`loads.${model.loads.length - 1}.x`), x);
    }
  }
  for (const [x1, x2] of [[1, 6], [0, 1]]) {
    p.get("add-dist").dispatch("click");
    const model = (await p.current()).model;
    const i = model.loads.length - 1;
    p.edit(p.field(`loads.${i}.x1`), x1);
    p.edit(p.field(`loads.${i}.x2`), x2);
  }
  const original = (await p.current()).model;
  for (const value of ["", "1", "12"]) p.edit(p.get("length"), value);
  const resized = (await p.current()).model;
  assert.equal(resized.length, 12);
  for (const group of ["supports", "loads"]) {
    original[group].forEach((/** @type {Record<string, number>} */ record, /** @type {number} */ i) => {
      for (const key of ["x", "x1", "x2"]) {
        if (key in record) assert.equal(resized[group][i][key], record[key] === 6 ? 12 : record[key], `${group}.${i}.${key}`);
      }
    });
  }
  assert.ok(p.get("deck").textContent.includes("BEGIN BULK"));

  p.get("length").dispatch("blur");
  p.edit(p.field("supports.1.x"), 11);
  p.edit(p.field("loads.1.x"), 12);
  for (const value of ["", "2", "20"]) p.edit(p.get("length"), value);
  const next = (await p.current()).model;
  assert.equal(next.supports[1].x, 11);
  assert.equal(next.supports[2].x, 1);
  assert.equal(next.loads[1].x, 20);
  assert.equal(next.loads[2].x, 20);
  assert.ok(p.get("deck").textContent.includes("BEGIN BULK"));
});

test("all diagram axes render sample counts beyond JavaScript argument limits", () => {
  const p = page();
  vm.runInContext(`BeamDiag.diagram = () => Array.from({ length: 300000 }, (_, i) => ({ x: i / 299999 * 6, V: i % 2 ? 2000 : -1000, M: i % 2 ? 3000 : -2000, v: i % 2 ? 0.004 : -0.003 }));`, p.ctx);
  p.paths.length = 0;
  p.edit(p.get("divisions"), 4);
  const diagrams = p.paths.filter((path) => path.startsWith("M") && (path.match(/L/g) || []).length >= 299999);
  assert.equal(diagrams.length, 5);
  for (const path of diagrams) assert.doesNotMatch(path, /NaN|Infinity/);
  assert.ok(p.get("deck").textContent.includes("BEGIN BULK"));
});
