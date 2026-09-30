import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

// The page draws with the DOM; this stand-in absorbs every DOM call so the emitted scripts run to their tool registrations.
const inert = new Proxy(function () {}, {
  get: (_, key) => (key === Symbol.toPrimitive ? () => 0 : key === Symbol.iterator ? [][Symbol.iterator].bind([]) : key === "then" ? undefined : inert),
  set: () => true,
  apply: () => inert,
  construct: () => inert,
});

test("emitted page registers read-only tools that return activity data", async () => {
  const html = await readFile(new URL("../viz/everyday-actions/index.html", import.meta.url), "utf8");
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  const dataset = scripts.find((s) => /id="dataset"/.test(s[1]))[2];
  const DATA = JSON.parse(dataset);
  const tools = new Map();
  const context = vm.createContext({
    navigator: { modelContext: { registerTool(tool) {
      assert.equal(tools.has(tool.name), false);
      tools.set(tool.name, tool);
    } } },
    document: new Proxy({ modelContext: undefined, getElementById: (id) => (id === "dataset" ? { textContent: dataset } : inert) }, { get: (t, k) => (k in t ? t[k] : inert) }),
    URLSearchParams,
    location: { search: "", hash: "" },
    history: { replaceState() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    ResizeObserver: function () { return inert; },
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    addEventListener: () => {},
    matchMedia: () => inert,
  });
  context.window = context;
  for (const script of scripts) if (!/type="application\/json"/.test(script[1])) vm.runInContext(script[2], context);
  assert.deepEqual([...tools.keys()].sort(), ["get_data", "get_metadata", "query"]);
  for (const tool of tools.values()) assert.equal(tool.annotations.readOnlyHint, true);
  const call = async (name, input = {}) => JSON.parse((await tools.get(name).execute(input)).content[0].text);
  const data = await call("get_data");
  assert.equal(data.total, DATA.activities.length);
  assert.deepEqual(data.rows.map((r) => r.activity_id), DATA.activities.map((r) => r.activity_id));
  const metadata = await call("get_metadata");
  assert.ok(Object.keys(metadata.sources).length > 0);
  const id = DATA.activities[0].activity_id;
  const activity = await call("query", { id });
  assert.ok(activity.total > 0);
  assert.ok(activity.measurements.every((m) => m.activity_id === id));
  assert.equal(activity.total, DATA.measurements.filter((m) => m.activity_id === id).length);
  const decision = await call("query", { id: DATA.decisions[0].id });
  assert.equal(decision.decision.id, DATA.decisions[0].id);
  const unknown = await call("query", { id: "nonexistent-activity" });
  assert.equal(unknown.total, 0);
  assert.equal(unknown.decision, null);
  assert.equal(unknown.next_steps.length, 1);
});
