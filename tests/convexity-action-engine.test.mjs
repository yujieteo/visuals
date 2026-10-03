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

/** @typedef {{ name: string, annotations: { readOnlyHint: boolean }, execute(input: object): Promise<{ content: { text: string }[] }> }} Tool */
/**
 * The engine's helpers, run in a vm from data/convexity-action-engine/engine.js, a stale copy this repository does
 * not develop or type (see SKILLS.md), so its exports are read untyped.
 * @param {Record<string, unknown>} [saved] @returns {any}
 */
function load(saved = {}) {
  /** @type {Map<string, string>} */
  const store = new Map(Object.entries(saved).map(([k, v]) => [`cae:${k}`, JSON.stringify(v)]));
  const context = vm.createContext({
    Intl,
    navigator: {},
    localStorage: { getItem: (/** @type {string} */ k) => store.get(k) ?? null, setItem: (/** @type {string} */ k, /** @type {string} */ v) => store.set(k, v) },
  });
  vm.runInContext(`${source}\n;globalThis.E={attrVal,ctxChanges,resetCtx,pageKey,C,LENSES,LENSGROUPS,VIEWS,VIEWGROUPS,VFN};`, context);
  return context.E;
}

test("emitted page registers read-only tools that return action data", async () => {
  const html = await readFile(new URL("../viz/convexity-action-engine/index.html", import.meta.url), "utf8");
  /** @type {Map<string, Tool>} */
  const tools = new Map();
  /** @type {Map<string, string>} */
  const store = new Map();
  const context = vm.createContext({
    Intl,
    navigator: { modelContext: { registerTool(/** @type {Tool} */ tool) {
      assert.equal(tools.has(tool.name), false);
      tools.set(tool.name, tool);
    } } },
    document: { title: "Convexity Action Engine", getElementById: () => null },
    localStorage: { getItem: (/** @type {string} */ k) => store.get(k) ?? null, setItem: (/** @type {string} */ k, /** @type {string} */ v) => store.set(k, v) },
  });
  for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
    vm.runInContext(script[1], context);
  }
  assert.deepEqual([...tools.keys()].sort(), ["compare_actions", "get_action", "get_metadata", "search_actions"]);
  for (const tool of tools.values()) assert.equal(tool.annotations.readOnlyHint, true);
  const call = async (/** @type {string} */ name, input = {}) => JSON.parse((await /** @type {Tool} */ (tools.get(name)).execute(input)).content[0].text);
  const metadata = await call("get_metadata");
  assert.equal(metadata.canonical_actions, raw.actions.filter((/** @type {{ cat: string }} */ a) => a.cat !== "avoid").length);
  const search = await call("search_actions", { query: "swim", limit: 1 });
  assert.equal(search.results.length, 1);
  const action = await call("get_action", { id: "swim" });
  assert.equal(action.action.id, "swim");
  assert.equal((await call("get_action", { id: "nonexistent-action" })).error, "unknown id");
  const comparison = await call("compare_actions", { ids: ["swim", "do-nothing"] });
  assert.deepEqual(comparison.actions.map((/** @type {{ id: string }} */ a) => a.id).sort(), ["do-nothing", "swim"]);
  assert.ok(["swim", "do-nothing"].includes(comparison.top));
  assert.equal((await call("compare_actions", { ids: ["swim", "nonexistent-action"] })).error, "need at least two known ids");
  assert.equal(store.size, 0);
});

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
  const lenses = E.LENSGROUPS.flatMap((/** @type {[string, string[]]} */ g) => g[1]);
  assert.deepEqual([...lenses].sort(), [...E.LENSES.map((/** @type {{ id: string }} */ l) => l.id)].sort());
  assert.equal(new Set(lenses).size, lenses.length);
  const views = E.VIEWGROUPS.flatMap((/** @type {[string, string[]]} */ g) => g[1]);
  assert.deepEqual([...views].sort(), [...E.VIEWS.map((/** @type {string[]} */ v) => v[0])].sort());
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
