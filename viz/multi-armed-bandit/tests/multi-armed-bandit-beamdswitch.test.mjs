import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { parseDeck } from "./fixtures/beamdswitch/deck.mjs";
import { assertStandardDeck, load, openPage, read } from "./beamdswitch-decks.mjs";

const SLUG = "multi-armed-bandit";
/** @type {import("./beamdswitch-template").BeamdswitchTemplate} */
const T = load(`beamdswitch.js`);
/** @type {typeof import("../report.js")} */
const R = load(`report.js`);
const html = read(`index.html`);
/** @param {string} id */
const script = (id) => /** @type {RegExpExecArray} */ (new RegExp(`<script[^>]*id="${id}"[^>]*>([\\s\\S]*?)</script>`).exec(html))[1];
/** @type {import("../src/multi-armed-bandit-logic.js").PageData} */
const D = JSON.parse(script("mab-data").replace(/<\\\//g, "</"));
const context = vm.createContext({});
context.self = context;
vm.runInContext(script("mab-logic"), context);
/** @type {typeof import("../src/multi-armed-bandit-logic.js")} */
const L = context.BanditLogic;
const DATE = "2026-10-01";
/** @template S @param {{ state?: S, error?: string }} r @returns {S} */
const ok = (r) => { assert.equal(r.error, undefined, r.error); return /** @type {S} */ (r.state); };
/** @param {Mab.State} s @param {import("../src/multi-armed-bandit-logic.js").Sim} sim */
const simViewOf = (s, sim) => (sim.methods.ts.pulls ? L.simView(sim, s.variants.map((v) => v.name)) : null);
/** @param {Mab.State} s @param {import("../src/multi-armed-bandit-logic.js").Sim} [sim] @param {string} [date] */
const deckFor = (s, sim = L.simCreate(s), date = DATE) => T.deck(R.report(s, L.view(s), simViewOf(s, sim), D, date));
/** @param {string} md */
const plainText = (md) => md.replace(/\\(.)/g, "$1");
const today = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };

test("every template parses as the standard narrated deck with bf_emma, the four sections and a final key", () => {
  for (const t of D.templates) {
    const s = L.fromTemplate(D, t.id, 5), md = deckFor(s);
    const deck = assertStandardDeck(md, t.id);
    assert.equal(deck.meta.voice, "bf_emma");
    assert.equal(deck.meta.title, s.title);
    assert.equal(deck.meta.date, "Snapshot " + DATE);
    assert.ok(deck.meta.author && deck.meta.subtitle);
    assert.match(md, /^---\ntitle: .*\nsubtitle: .*\nauthor: .*\ndate: .*\nvoice: bf_emma\n---/);
    for (const sec of ["# Set-up", "# Method", "# Results", "# Checks and takeaway"]) assert.match(md, new RegExp("^" + sec + "$", "m"));
    assert.equal(deck.frames.at(-1)?.title, "Next step");
    assert.ok(!md.includes("## Simulation"), "no simulation frame before the simulation has run");
    assert.ok(plainText(md).includes(t.fictional ? "Fictional example counts" : "Evidence entered by the user"), t.id);
  }
});

test("the deck quotes the page's own numbers and both recommendations", () => {
  const s = website(), V = L.view(s), md = plainText(deckFor(s));
  for (const r of V.rows) for (const k of /** @type {const} */ (["mean", "interval", "sample", "ucb", "posterior"])) assert.ok(md.includes(r.text[k]), `${r.name} ${k}`);
  assert.ok(md.includes("Page A: prior Beta(1, 1) plus 8 successes and 92 failures gives Beta(9, 93), mean 8.82%."));
  assert.ok(md.includes("Thompson Sampling recommends " + V.ts.name));
  assert.ok(md.includes("UCB1 recommends " + V.ucb.name));
  assert.ok(md.includes("UCB1 suggests **" + V.ucb.name + "** (score " + V.ucb.value + ")"));
  assert.ok(md.includes("Neither method declares the experiment finished"));
  // Exporting is a snapshot: the state is unchanged afterwards.
  const before = JSON.stringify(s);
  deckFor(s);
  assert.equal(JSON.stringify(s), before);
});
function website() { return L.fromTemplate(D, "website", 7); }

test("simulation results appear once it has run, labelled partial or complete", () => {
  const s = website(), sim = L.simCreate(s);
  for (let i = 0; i < 10; i += 1) L.simStep(sim);
  let md = plainText(deckFor(s, sim));
  assertStandardDeck(deckFor(s, sim), "partial");
  assert.ok(md.includes("## Simulation"));
  assert.ok(md.includes("Partial run: 10 of 1,000 pulls per method. Seed 42"));
  assert.match(md, /This simulation is a partial run\./);
  while (L.simStep(sim));
  md = plainText(deckFor(s, sim));
  assert.ok(md.includes("Complete: 1,000 pulls per method."));
  const V = L.simView(sim, s.variants.map((v) => v.name));
  for (const m of V.methods) assert.ok(md.includes("**" + m.label + "**: " + m.text.successes + " successes in 1,000 pulls (" + m.text.rate + "); expected regret " + m.text.regret), m.label);
});

test("adversarial labels cannot create headings, front matter or ::: delimiters, and narration stays speech", () => {
  const evil = ["# Heading", "## Frame", "::: key", ":::", "---", "\"quoted\"", "x\n# y", "<script>alert(1)</script>", "a | b * c _d_ $x$ `code` [l](u) ~~~", "100% & ★"];
  let s = L.fromTemplate(D, "custom", 2);
  s = ok(L.setText(s, "title", "\"Title\"\n---\nvoice: am_adam"));
  s = ok(L.setText(s, "success", "::: narration\n# Owned"));
  s = ok(L.setText(s, "unit", "---"));
  while (s.variants.length < evil.length) s = ok(L.addVariant(s));
  evil.forEach((name, i) => { s = ok(L.rename(s, i, name)); });
  s = ok(L.setCounts(s, 0, "3", "10"));
  const sim = L.simCreate(s);
  for (let i = 0; i < 25; i += 1) L.simStep(sim);
  const md = deckFor(s, sim);
  const deck = assertStandardDeck(md, "adversarial");
  assert.equal(deck.meta.voice, "bf_emma");
  assert.equal(deck.meta.title, "\"Title\" --- voice: am_adam");
  assert.equal(md.match(/^---$/gm)?.length, 2, "front matter opens and closes once");
  assert.deepEqual(deck.frames.filter((f) => f.kind === "section").map((f) => f.title), ["Set-up", "Method", "Results", "Checks and takeaway"]);
  assert.deepEqual(deck.frames.filter((f) => f.kind === "frame").map((f) => f.title),
    ["The experiment", "Assumptions", "Thompson Sampling", "UCB1", "Evidence", "Scores behind the recommendations", "Recommendations", "Simulation", "Hand check", "Next step"]);
  for (const line of md.split("\n")) {
    if (/^#{1,2} /.test(line)) assert.match(line, /^(# (Set-up|Method|Results|Checks and takeaway)|## [A-Z][\w ]+)$/, line);
    if (/^\s*:{3}/.test(line)) assert.match(line, /^::: (narration|key|notes)$|^:::$/, line);
    assert.doesNotMatch(line, /^\s*(```|~~~)/, line);
  }
  assert.ok(!md.includes("<script>"), "angle brackets are escaped");
  const text = plainText(md);
  for (const name of evil) assert.ok(text.includes(name.replace(/\s+/g, " ")), name);
});

test("the page's Save deck and Copy deck export the deck of the restored experiment", async () => {
  const s = ok(L.select(website(), "v2"));
  const sim = L.simCreate(s);
  const stored = L.serialise(s, sim);
  const localStorage = { getItem: (/** @type {string} */ k) => (k === "multi-armed-bandit:v1" ? stored : null), setItem() {}, removeItem() {} };
  const page = await openPage(SLUG, { globals: { localStorage } });
  const expected = deckFor(s, sim, today());
  await page.click("save-beamdswitch");
  assert.deepEqual(page.saved, [{ name: `${SLUG}-beamdswitch.md`, text: expected }]);
  await page.click("copy-beamdswitch");
  assert.deepEqual(page.copied, [expected]);
  await page.click("export-json");
  assert.equal(page.saved.length, 2);
  assert.equal(page.saved[1].name, "multi-armed-bandit-experiment.json");
  assert.deepEqual(L.parse(page.saved[1].text).state, L.parse(stored).state, "export after a restore is the same document");
});

test("the page registers exactly three read-only WebMCP tools that report the committed state", async () => {
  const s = website(), stored = L.serialise(s, L.simCreate(s)), /** @type {ModelContextTool[]} */ tools = [];
  const localStorage = { getItem: () => stored, setItem() {}, removeItem() {} };
  const navigator = { modelContext: { registerTool: (/** @type {ModelContextTool} */ t) => tools.push(t) }, clipboard: { writeText: async () => {} } };
  await openPage(SLUG, { globals: { localStorage, navigator } });
  assert.deepEqual(tools.map((t) => t.name), ["get_data", "get_metadata", "query"]);
  for (const t of tools) assert.equal(/** @type {{ readOnlyHint?: boolean }} */ (t.annotations).readOnlyHint, true);
  /** @param {string} name @param {object} [input] @returns {Promise<any>} the tool's JSON result */
  const call = async (name, input) => JSON.parse(/** @type {{ content: { text: string }[] }} */ (await /** @type {ModelContextTool} */ (tools.find((t) => t.name === name)).execute(input)).content[0].text);
  const data = await call("get_data");
  const V = L.view(s);
  assert.equal(data.experiment.variants[0].posteriorMean, "8.82%");
  assert.equal(data.recommendations.thompson.variant, V.ts.name);
  assert.equal(data.recommendations.ucb1.score, V.ucb.value);
  assert.equal(data.simulation.pulls, 0);
  const meta = await call("get_metadata");
  assert.equal(meta.url, "https://teoyujie.org/visuals/multi-armed-bandit/");
  assert.equal(meta.templates.length, 5);
  const q = await call("query", { text: "page b" });
  assert.deepEqual(q.results.map((/** @type {{ type: string, name: string }} */ r) => [r.type, r.name]), [["variant", "Page B"]]);
  assert.equal((await call("query", {})).total, 8);
  assert.equal(L.serialise(s, L.simCreate(s)), stored, "the tools change nothing");
});

test("narration helpers make plain speech", () => {
  assert.equal(R.speak("8.82% & ★ <b>"), "8.82 percent and b");
  assert.equal(R.speak("drew <0.01% and >99.99%"), "drew less than 0.01 percent and more than 99.99 percent");
  assert.equal(R.md("# a|b"), "\\# a\\|b");
  assert.equal(R.front("\"x\""), "'\"x\"'");
  assert.equal(parseDeck(T.deck({ meta: { title: R.front("'y'") }, narration: "n.", setup: [{ title: "a", narration: "a." }], method: [{ title: "b", narration: "b." }], results: [{ title: "c", narration: "c." }], checks: [{ title: "d", key: "k", narration: "d." }] })).meta.title, "'y'");
});

test("the deck groups large counts as the page does", () => {
  const s = ok(L.setCounts(ok(L.setCounts(website(), 0, "250000", "1000000")), 1, "0", "1000000")), V = L.view(s), md = plainText(deckFor(s));
  assert.equal(V.totalText, "2,000,020");
  assert.ok(md.includes("Completed trials: 2,000,020"), "grouped total");
  assert.ok(md.includes("plus 250,000 successes and 750,000 failures gives"), "grouped hand check");
  assert.match(parseDeck(deckFor(s)).frames.find((f) => f.title === "Hand check")?.narration ?? "", /250,000 successes and 750,000 failures/);
});

test("a fresh session is autosaved, so a reload restores the same Thompson samples", async () => {
  /** @type {[string, string][]} */
  const writes = [];
  /** @type {ModelContextTool[]} */
  const tools = [];
  const now = (/** @type {() => void} */ fn) => { fn(); return 0; };
  await openPage(SLUG, { globals: { setTimeout: now, localStorage: { getItem: () => null, setItem: (/** @type {string} */ k, /** @type {string} */ v) => writes.push([k, v]), removeItem() {} } } });
  assert.ok(writes.length > 0, "the fresh session was saved");
  assert.deepEqual([...new Set(writes.map(([k]) => k))].sort(), ["multi-armed-bandit:hours:v1", "multi-armed-bandit:v1"], "the experiment and the hours plan are saved under their own keys");
  const [, stored] = /** @type {[string, string]} */ (writes.filter(([k]) => k === "multi-armed-bandit:v1").at(-1)), r = L.parse(stored);
  assert.equal(r.error, undefined);
  const navigator = { modelContext: { registerTool: (/** @type {ModelContextTool} */ t) => tools.push(t) }, clipboard: { writeText: async () => {} } };
  await openPage(SLUG, { globals: { navigator, localStorage: { getItem: () => stored, setItem() {}, removeItem() {} } } });
  const data = JSON.parse(/** @type {{ content: { text: string }[] }} */ (await tools[0].execute()).content[0].text);
  assert.deepEqual(data.experiment.variants.map((/** @type {{ thompsonSample: string }} */ v) => v.thompsonSample), JSON.parse(JSON.stringify(L.view(/** @type {Mab.State} */ (r.state)).rows.map((x) => x.text.sample))));
});

test("invalid prior and simulation inputs keep the entered text while their error stands", async () => {
  const s = website(), stored = L.serialise(s, L.simCreate(s));
  const page = await openPage(SLUG, { globals: { localStorage: { getItem: () => stored, setItem() {}, removeItem() {} } } });
  const input = (/** @type {string} */ id) => page.run(`document.getElementById(${JSON.stringify(id)})`);
  const enter = async (/** @type {string} */ id, /** @type {string} */ v) => { input(id).value = v; await input(id).dispatch("change"); };
  await enter("prior-b", "500");
  assert.equal(input("prior-b").getAttribute("aria-invalid"), "true");
  await page.click("btn-resample");
  assert.equal(input("prior-b").value, "500");
  await enter("sim-budget", "5000");
  assert.equal(input("sim-budget").getAttribute("aria-invalid"), "true");
  await page.click("sim-step");
  assert.equal(input("sim-budget").value, "5000");
  assert.match(input("e-sim").textContent, /Pulls per method/);
});
