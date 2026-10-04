/* The narrated beamdswitch deck: written with the site's unchanged shared template, parsed with
   beamdswitch's own parsers, narrated on every slide in the bf_emma voice, and carrying the page's own
   numbers. The page also boots against a stand-in DOM here, so its WebMCP tools and its beamdswitch and
   Copy deck buttons are exercised without a browser. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { Element, checkDeck, standIn } from "./beamdswitch-deck-checks.mjs";

const html = readFileSync(new URL("../diagonal-tension.html", import.meta.url), "utf8");
/** @param {string} id @returns {string} the text of the page's script with that id */
const script = (id) => /** @type {RegExpExecArray} */ (new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`).exec(html))[1];
/** @type {{ self?: object, DiagonalTension?: Engine, Beamdswitch?: typeof Beamdswitch }} */
const ctx = vm.createContext({});
ctx.self = ctx;
vm.runInContext(script("dt-engine"), ctx);
vm.runInContext(script("dt-beamdswitch"), ctx);
const DT = /** @type {Engine} */ (ctx.DiagonalTension), T = /** @type {typeof Beamdswitch} */ (ctx.Beamdswitch);
const workerScript = /** @type {RegExpExecArray} */ (/<script type="text\/plain" id="dt-worker">([\s\S]*?)<\/script>/.exec(html))[1];
const J = (/** @type {unknown} */ x) => JSON.parse(JSON.stringify(x));

/* A stand-in for the browser's Worker: it runs the source the page put in its Blob in a fresh vm
   context and answers asynchronously, as a real worker does; terminate drops later messages. */
/** @typedef {{ self?: object, postMessage?: (data: unknown) => void, onmessage?: (e: { data: unknown }) => void }} WorkerScope */
class StandInWorker {
  static source = "";
  /** @type {StandInWorker[]} */
  static made = [];
  /** @type {boolean | undefined} */
  dead;
  /** @type {(e: { data: unknown }) => void} set by the page */
  onmessage = () => {};
  constructor() {
    StandInWorker.made.push(this);
    /** @type {WorkerScope} */
    const ctx = vm.createContext({});
    ctx.self = ctx; ctx.postMessage = (data) => setImmediate(() => { if (!this.dead) this.onmessage({ data }); });
    vm.runInContext(StandInWorker.source, ctx);
    this.ctx = ctx;
  }
  /** @param {unknown} data */
  postMessage(data) { setImmediate(() => { if (!this.dead) /** @type {NonNullable<WorkerScope["onmessage"]>} */ (this.ctx.onmessage)({ data }); }); }
  terminate() { this.dead = true; }
}

/** A WebMCP tool as the page registers it.
    @typedef {{ name: string, annotations: { readOnlyHint: boolean }, execute(input?: object): Promise<{ content: { text: string }[] }> }} Tool */
/** @param {Map<string, Tool>} tools @param {string} name */
const tool = (tools, name) => { const t = tools.get(name); assert.ok(t, name); return t; };

/* Table rows with cells, so the page can render a result the worker returns. */
class Row extends Element {
  /** @type {Element[] | undefined} */
  _cells;
  get cells() { return (this._cells ??= Array.from({ length: 5 }, () => new Element("td"))); }
}

/** @type {[string, State][]} */
const CASES = [
  ["the demonstration example", DT.defaultState()],
  ["no stringers, an edge doubler", { ...DT.defaultState(), stringers: [], doubler: { x0: 0, y0: 0, Lx: 150, Ly: 120, t: 2 } }],
  ["negative shear flow, zero doubler thickness", { ...DT.defaultState(), load: { q: -40 }, doubler: { x0: 200, y0: 100, Lx: 200, Ly: 200, t: 0 } }],
];

test("every comparison's deck opens in beamdswitch as the standard template, narrated in bf_emma", () => {
  for (const [what, s] of CASES) {
    const r = DT.runComparison(s);
    assert.ok(r.ok, what);
    const md = T.deck(DT.beamdswitchReport(r)), deck = checkDeck(md, what);
    assert.equal(deck.meta.voice, "bf_emma", what);
    assert.match(deck.meta.title ?? "", /^Diagonal tension: skin, stringers and a doubler$/);
    // The numbers are the page's own, as its table formats them.
    const mass = r.rows.find((x) => x.id === "mass");
    assert.ok(mass, what);
    assert.ok(md.includes(`| Mass (kg) | ${DT.fmt(mass.a)} | ${DT.fmt(mass.b)} | ${DT.fmtPct(mass.pct)} |`), what);
    assert.ok(deck.frames.some((f) => f.title.startsWith("Principal tension by region")), what);
    // The takeaway names the region whose principal tension changes most, either way.
    const biggest = ["doubler", "band", "skin"].map((id) => ({ id, row: r.rows.find((x) => x.id === `max.s1.${id}`) })).flatMap(({ id, row }) => (row && row.pct != null ? [{ id, row, pct: row.pct }] : [])).sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))[0];
    if (biggest) assert.ok(md.includes(`the largest change in principal tension is in the ${r.summary.A.regions[biggest.id].label} (${DT.fmtPct(biggest.row.pct)})`), what);
  }
});

test("the report refuses a failed or missing solve", () => {
  assert.throws(() => DT.beamdswitchReport(null), /Run the comparison first/);
  assert.throws(() => DT.beamdswitchReport(DT.runComparison({ ...DT.defaultState(), panel: { L: -1, W: 400, t: 1 } })), /Run the comparison first/);
});

test("the page boots without a browser: WebMCP tools in their own workers, and the deck buttons gated on a validated run", async () => {
  /** @type {Map<string, Tool>} */
  const tools = new Map();
  const page = standIn({ Node: Row, globals: { Worker: StandInWorker, navigator: { modelContext: { registerTool: (/** @type {Tool} */ t) => tools.set(t.name, t) }, clipboard: { writeText: async (/** @type {string} */ t) => page.copied.push(t) } } } });
  page.$("dt-engine").textContent = script("dt-engine");
  page.$("dt-worker").textContent = workerScript;
  StandInWorker.source = `${script("dt-engine")}\n${workerScript}`;
  StandInWorker.made = [];
  page.run(html);
  assert.deepEqual([...tools.keys()], ["get_metadata", "get_current_state", "run_comparison", "run_self_tests"]);
  for (const t of tools.values()) assert.equal(t.annotations.readOnlyHint, true, t.name);
  /** @param {string} name @param {object} [input] */
  const call = async (name, input) => JSON.parse((await tool(tools, name).execute(input)).content[0].text);
  const settle = async (/** @type {() => unknown} */ ok) => { for (let i = 0; i < 1000 && !ok(); i++) await new Promise((r) => setImmediate(r)); };
  // Without a validated run the deck buttons do nothing.
  await page.$("save-beamdswitch").fire("click");
  await page.$("copy-beamdswitch").fire("click");
  assert.deepEqual(page.saved, []);
  assert.deepEqual(page.copied, []);
  assert.deepEqual(await call("get_metadata"), J(DT.META));
  const cur = await call("get_current_state");
  assert.deepEqual(cur.state, J(DT.defaultState()));
  assert.equal(cur.results, null, "no results until the worker answers");
  // The run tools solve in workers of their own: the page's running job, inputs and status are untouched,
  // Cancel on the page does not stop them, and each tool worker is terminated when it answers.
  const [pageWorker] = StandInWorker.made;
  const status = page.$("status").textContent;
  const pending = [call("run_comparison", { doubler: { x0: 100, y0: 100, Lx: 100, Ly: 100, t: 2 } }), call("run_comparison", { material: { E: 70000, nu: 0.7, rho: 2700 } }), call("run_self_tests")];
  assert.equal(StandInWorker.made.length, 4);
  assert.equal(pageWorker.dead, undefined, "the page's comparison keeps running");
  assert.equal(page.$("status").textContent, status);
  await page.$("cancel").fire("click");
  assert.equal(pageWorker.dead, true);
  const [run, bad, st] = await Promise.all(pending);
  assert.equal(run.ok, true);
  assert.deepEqual(run.rows, J(/** @type {Comparison} */ (DT.runComparison({ ...DT.defaultState(), doubler: { x0: 100, y0: 100, Lx: 100, Ly: 100, t: 2 } })).rows));
  assert.equal(bad.ok, false);
  assert.equal(bad.errors[0].field, "material.nu");
  assert.equal(st.passed, st.total);
  assert.ok(StandInWorker.made.every((w) => w.dead), "every tool worker is terminated");
  const after = await call("get_current_state");
  assert.deepEqual(after.state, J(DT.defaultState()), "the page's inputs are unchanged");
  assert.equal(after.results, null, "the tools' answers are not the page's results");
  // A validated page run enables the deck buttons.
  await page.$("run").fire("click");
  await settle(() => page.$("cancel").disabled);
  assert.equal((await call("get_current_state")).results.state.doubler.t, 1);
  await page.$("save-beamdswitch").fire("click");
  // Read through a cast: the earlier deepEqual(page.saved, []) narrowed it to an empty array.
  assert.deepEqual(/** @type {{ name: unknown }[]} */ (page.saved).map((x) => x.name), ["diagonal-tension-beamdswitch.md"]);
});

test("without Web Workers the page and its tools report that Workers are required and solve nothing", async () => {
  /** @type {Map<string, Tool>} */
  const tools = new Map();
  const page = standIn({ Node: Row, globals: { navigator: { modelContext: { registerTool: (/** @type {Tool} */ t) => tools.set(t.name, t) } } } });
  page.run(html);
  assert.match(page.$("status").textContent, /^Web Workers are required to run the solver/);
  for (const name of ["run_comparison", "run_self_tests"]) {
    const res = JSON.parse((await tool(tools, name).execute({})).content[0].text);
    assert.equal(res.ok, false, name);
    assert.match(res.error, /^Web Workers are required to run the solver/, name);
  }
});
