import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

// engine.js is inlined into the page by build.py; without the page shell it defines the model and UI helpers and does not boot.
const dir = new URL("../data/convexity-action-engine/", import.meta.url);
const raw = JSON.parse(await readFile(new URL("raw.json", dir), "utf8"));
const meta = JSON.parse(await readFile(new URL("meta.json", dir), "utf8"));
const data = {
  sources: raw.sources, modifiers: raw.modifiers, actions: raw.actions, observed: raw.observed, drm: raw.drm, studies: raw.studies,
  categories: Object.fromEntries(Object.entries(raw.categories).map(([k, v]) => [k, { label: v.label, prior: v.prior }])),
  fetched: meta.fetched, assumptions: meta.assumptions, instances: 0,
};
const source = (await readFile(new URL("engine.js", dir), "utf8")).replace("%%DATA%%", JSON.stringify(data));

function load(saved = {}) {
  const store = new Map(Object.entries(saved).map(([k, v]) => [`cae:${k}`, JSON.stringify(v)]));
  const context = vm.createContext({
    Intl,
    navigator: {},
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
  });
  vm.runInContext(`${source}\n;globalThis.E={attrVal,ctxChanges,resetCtx,pageKey,C,LENSES,LENSGROUPS,VIEWS,VIEWGROUPS,VFN};`, context);
  return context.E;
}

test("toggle states are written as ARIA true/false, other booleans as presence", () => {
  const { attrVal } = load();
  assert.equal(attrVal("aria-pressed", true), "true");
  assert.equal(attrVal("aria-pressed", false), "false");
  assert.equal(attrVal("aria-expanded", false), "false");
  assert.equal(attrVal("hidden", true), "");
  assert.equal(attrVal("hidden", false), null);
  assert.equal(attrVal("open", null), null);
  assert.equal(attrVal("title", "x"), "x");
});

test("grouped pickers keep every decision lens and every chart", () => {
  const E = load();
  // Arrays made inside the vm have another realm's prototype; copy them before deep comparison.
  const lenses = E.LENSGROUPS.flatMap((g) => g[1]);
  assert.deepEqual([...lenses].sort(), [...E.LENSES.map((l) => l.id)].sort());
  assert.equal(new Set(lenses).size, lenses.length);
  const views = E.VIEWGROUPS.flatMap((g) => g[1]);
  assert.deepEqual([...views].sort(), [...E.VIEWS.map((v) => v[0])].sort());
  assert.equal(new Set(views).size, views.length);
  for (const v of views) assert.equal(typeof E.VFN[v], "function", v);
});

test("changed settings are listed against the defaults and reset clears them", () => {
  assert.deepEqual([...load().ctxChanges()], []);
  const E = load({ ctx: { T: 30, E: 0.2, lens: "eu", live: false, W: { hea: 1.5, car: 1, lrn: 1, soc: 1, joy: 1, rec: 1, hom: 1, fin: 1 } } });
  assert.deepEqual([...E.ctxChanges()], ["h", "T", "E", "W", "lens"]);
  E.resetCtx();
  assert.deepEqual([...E.ctxChanges()], []);
  assert.equal(E.C.lens, "convex");
  assert.equal(E.C.live, true);
});

test("switching chart or comparison set stays on the same page; opening another action does not", () => {
  const { pageKey } = load();
  assert.equal(pageKey({ name: "a", id: "swim", view: "tail" }), pageKey({ name: "a", id: "swim", view: null }));
  assert.equal(pageKey({ name: "compare", id: null, actions: ["swim"] }), pageKey({ name: "compare", id: null, actions: ["swim", "do-nothing"] }));
  assert.notEqual(pageKey({ name: "a", id: "swim" }), pageKey({ name: "a", id: "go-to-the-gym" }));
});
