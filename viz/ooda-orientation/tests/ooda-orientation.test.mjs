import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { openPage } from "./beamdswitch-decks.mjs";

// The page inlines its pure logic as <script id="oo-logic"> and its data as JSON; run the shipped code directly.
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
/** @param {string} id */
const script = (id) => /** @type {RegExpMatchArray} */ (html.match(new RegExp(`<script[^>]*id="${id}"[^>]*>([\\s\\S]*?)</script>`)))[1];
/** @type {Orient.Data} */
const D = JSON.parse(script("oo-data").replace(/<\\\//g, "</"));
const context = vm.createContext({});
vm.runInContext(script("oo-logic"), context);
/** @type {Orient.Logic} */
const L = context.OrientLogic;
L.init(D);

/** @param {unknown} x */
const plain = (x) => JSON.parse(JSON.stringify(x));
/** @param {string} id */
const example = (id) => /** @type {import("../src/ooda-orientation-logic.js").Example} */ (D.examples.find((e) => e.id === id));
/** @param {import("../src/ooda-orientation-logic.js").Example} e @param {number} [upto] */
const rp = (e, upto) => { const r = L.replay(e, upto); return { s: r.state, alias: r.alias }; };
/** @param {string} id @param {number} [upto] */
const replay = (id, upto) => rp(example(id), upto);
/** @param {string} id @param {(step: import("../src/ooda-orientation-logic.js").Command) => boolean} pred */
const stepIndex = (id, pred) => example(id).steps.findIndex(pred);
/** @param {Orient.State} state @param {import("../src/ooda-orientation-logic.js").Command} cmd */
function ok(state, cmd) {
  const r = L.apply(state, cmd);
  assert.equal(r.error, undefined, `${cmd.do}: ${r.error && r.error.message}`);
  return r;
}
/** @param {Orient.State} state @param {import("../src/ooda-orientation-logic.js").Command} cmd @param {string} code */
function rejects(state, cmd, code) {
  const before = JSON.stringify(state);
  const r = L.apply(state, cmd);
  assert.ok(r.error, `${cmd.do} should be rejected`);
  assert.equal(r.error.code, code);
  assert.equal(JSON.stringify(r.state), before, "a rejected command leaves the state untouched");
  return r.error;
}
// A small situation built from commands; returns the state and the ids each named step created.
/** @param {import("../src/ooda-orientation-logic.js").Command[]} cmds */
function build(cmds) {
  let s = L.blank();
  /** @type {Record<string, string>} */
  const ids = {};
  for (const c of cmds) {
    const resolved = JSON.parse(JSON.stringify(c), (/** @type {string} */ k, /** @type {unknown} */ v) => (typeof v === "string" && v.startsWith("@") ? ids[v.slice(1)] : v));
    const r = ok(s, resolved);
    s = r.state;
    if (c.as) ids[c.as] = /** @type {string} */ (r.id);
  }
  return { s, ids };
}
const base = () => [
  { do: "new", title: "Customers are not responding", tempo: "moderate" },
  { do: "item", type: "signal", text: "Three customers cancelled this week", as: "sig" },
  { do: "item", type: "interpretation", text: "Customers are cancelling because delivery is slow", as: "inf" },
  { do: "item", type: "unknown", text: "Would faster delivery change retention?", as: "unk" },
  { do: "item", type: "boundary", text: "Our existing customers", as: "bnd" },
  { do: "item", type: "assumption", text: "Customers mainly care about price", as: "asm" },
  { do: "item", type: "constraint", text: "We cannot hire before next quarter", as: "con" },
  { do: "orient", inside: "a delivery-speed problem", explains: "cancellations follow late deliveries", matters: "delivery time", observe: "faster delivery reduces cancellations", move: "Speed up delivery", mechanism: "slow delivery causes cancellations", boundary: "@bnd", falsifier: "Cancellations continue after delivery speeds up" },
];

/* ---------- section 80: invariants ---------- */

test("observation integrity: an inference cannot silently become an observation", () => {
  const { s, ids } = build(base());
  const inf = s.items.find((i) => i.id === ids.inf);
  assert.ok(inf);
  assert.equal(inf.ledger, "inferred");
  const e = rejects(s, { do: "edit", id: ids.inf, ledger: "observed" }, "observation-integrity");
  assert.match(e.message, /cannot become an observation/);
  rejects(s, { do: "edit", id: ids.unk, ledger: "observed" }, "observation-integrity");
  rejects(s, { do: "item", type: "interpretation", text: "x", ledger: "observed" }, "bad-ledger");
  // Recording it as observed needs a source and adds a separate observation, leaving the inference intact.
  rejects(s, { do: "promote", id: ids.inf, note: "" }, "source-required");
  const r = ok(s, { do: "promote", id: ids.inf, note: "Asked two of them on the phone", text: "Two cancelling customers said delivery was too slow" });
  const promoted = r.state.items.find((i) => i.id === r.id), original = r.state.items.find((i) => i.id === ids.inf);
  assert.ok(promoted && promoted.origin);
  assert.equal(promoted.ledger, "observed");
  assert.deepEqual(plain(promoted.refs), [ids.inf]);
  assert.equal(promoted.origin.promotedFrom, ids.inf);
  assert.deepEqual(plain(original), plain(inf), "the inference itself is unchanged");
  assert.ok(r.state.links.some((l) => l.from === ids.inf && l.to === r.id && l.kind === "observed-as"));
  // Demoting an observation to an inference is honest and allowed for flexible types only.
  rejects(s, { do: "edit", id: ids.sig, ledger: "inferred" }, "bad-ledger");
});

test("a challenged observation keeps its text and gains a qualification", () => {
  const { s, ids } = build(base());
  let t = ok(s, { do: "qualify", id: ids.sig, qualifier: "stale" }).state;
  t = ok(t, { do: "qualify", id: ids.sig, qualifier: "sampled" }).state;
  const sig = t.items.find((i) => i.id === ids.sig);
  assert.ok(sig);
  assert.equal(sig.text, "Three customers cancelled this week");
  assert.deepEqual(plain(sig.provenance), ["stale", "sampled"]);
  rejects(t, { do: "qualify", id: ids.sig, qualifier: "made-up" }, "bad-qualifier");
  // Nothing is deleted: withdrawing keeps the item in the state.
  const w = ok(t, { do: "withdraw", id: ids.sig, reason: "duplicate" }).state;
  assert.equal(w.items.length, t.items.length);
  assert.equal(w.items.find((i) => i.id === ids.sig)?.status, "withdrawn");
});

test("prediction immutability: a prediction cannot change after its action begins", () => {
  const { s, ids } = build([...base(), { do: "action", type: "probe", text: "Ask five customers why they left", expected: "Most mention delivery time", reconsider: "Most mention price", as: "act" }]);
  const a = s.actions.find((x) => x.id === ids.act);
  assert.ok(a);
  const pid = /** @type {string} */ (a.prediction);
  let t = ok(s, { do: "editPrediction", id: pid, text: "Most mention slow delivery" }).state;
  t = ok(t, { do: "editAction", id: ids.act, expected: "Most mention delivery time" }).state;
  t = ok(t, { do: "start", id: ids.act }).state;
  const p = t.predictions.find((x) => x.id === pid);
  assert.ok(p);
  assert.equal(p.locked, true);
  assert.equal(p.original, "Most mention delivery time");
  rejects(t, { do: "editPrediction", id: pid, text: "Some mention delivery" }, "prediction-locked");
  rejects(t, { do: "editAction", id: ids.act, expected: "Anything" }, "action-started");
  // The orientation the action relies on is frozen too; past versions stay as they were.
  rejects(t, { do: "orient", inside: "a pricing problem" }, "orientation-locked");
  assert.equal(L.locked(t, L.current(t)), true);
});

test("locked predictions: a post-outcome edit attempt is rejected as prediction drift", () => {
  const { s } = replay("stalled-project");
  const p = s.predictions[0];
  assert.equal(p.locked, true);
  assert.equal(p.status, "observed");
  const e = rejects(s, { do: "editPrediction", id: p.id, text: "The result reveals something interesting" }, "prediction-drift");
  assert.match(e.message, /cannot change after the outcome is known/);
  // The result and interpretation sit beside the frozen original; the original text is never rewritten.
  assert.equal(p.text, p.original);
  assert.notEqual(p.result, p.text);
  const t = ok(s, { do: "interpret", id: p.id, interpretation: "The prototype settled it." }).state;
  assert.equal(t.predictions[0].text, p.original);
  assert.equal(t.predictions[0].interpretation, "The prototype settled it.");
});

test("history preservation: superseding or rejecting orientations never deletes observations, predictions or outcomes", () => {
  for (const e of D.examples) {
    let prev = L.blank();
    for (let n = 1; n <= e.steps.length; n += 1) {
      const { s } = rp(e, n);
      assert.deepEqual(plain(s.history.slice(0, prev.history.length)), plain(prev.history), `${e.id} step ${n}: history is append-only`);
      for (const k of /** @type {const} */ (["items", "orientations", "predictions", "actions", "outcomes", "links"])) {
        const ids = new Set(s[k].map((/** @type {{ id: string }} */ x) => x.id));
        for (const x of prev[k]) assert.ok(ids.has(x.id), `${e.id} step ${n}: ${k} ${x.id} survives`);
      }
      for (const o of prev.orientations.filter((x) => x.status === "superseded" || x.status === "rejected"))
        assert.deepEqual(plain(s.orientations.find((x) => x.id === o.id)), plain(o), `${e.id} step ${n}: a past orientation is unchanged`);
      prev = s;
    }
  }
  const { s } = replay("southwest");
  rejects(s, { do: "orient", id: s.orientations[0].id, inside: "rewritten" }, "historical");
});

test("referential integrity holds after every step, and broken references are refused", () => {
  for (const e of D.examples)
    for (let n = 1; n <= e.steps.length; n += 1) {
      const { s } = rp(e, n);
      assert.deepEqual(plain(L.check(s)), [], `${e.id} step ${n}`);
      for (const a of s.actions) assert.ok(s.orientations.some((o) => o.id === a.orientation));
      for (const p of s.predictions) assert.ok(s.orientations.some((o) => o.id === p.orientation));
      for (const h of s.history.filter((x) => x.kind === "transition")) assert.ok([h.from, h.to].every((id) => s.orientations.some((o) => o.id === id)));
    }
  const { s, ids } = build(base());
  rejects(s, { do: "action", orientation: "o999", type: "probe", text: "x" }, "untraced-action");
  rejects(s, { do: "orient", items: ["i999"] }, "bad-ref");
  const broken = plain(replay("stalled-project").s);
  broken.actions[0].orientation = "o999";
  assert.ok(L.check(broken).length > 0);
  assert.equal(L.importText(JSON.stringify(broken)).ok, false);
  const edge = plain(replay("southwest").s);
  edge.history.find((/** @type {{ kind: string }} */ h) => h.kind === "transition").to = "o404";
  assert.equal(L.importText(JSON.stringify(edge)).ok, false, "a lineage edge must reference valid orientations");
  const orphan = plain(s);
  orphan.predictions.push({ id: "p77", orientation: "o404", action: null, text: "x", locked: false, original: null, status: "pending", result: "", interpretation: "" });
  assert.equal(L.importText(JSON.stringify(orphan)).ok, false, "a prediction must belong to an existing orientation");
  assert.ok(ids.sig);
});

test("a draft action is abandoned, not carried over, when a new orientation is adopted", () => {
  const { s, ids } = build([...base(),
    { do: "action", type: "probe", text: "Call three customers who cancelled", expected: "They mention slow delivery", reconsider: "Nobody mentions delivery", as: "act" },
    { do: "reorient" },
    { do: "move", op: "a-negate", targets: ["@asm"], replacement: { text: "Customers care about reliability more than price" }, as: "rep" },
    { do: "candidate", inside: "a reliability problem", from: ["@rep"], items: ["@rep", "@bnd"], boundary: "@bnd", mechanism: "unreliable delivery loses customers", move: "Fix reliability", as: "o1" },
    { do: "adopt", id: "@o1" }]);
  const old = s.actions.find((a) => a.id === ids.act);
  assert.ok(old);
  assert.equal(old.status, "abandoned");
  assert.equal(old.orientation, s.orientations[0].id, "the abandoned action stays traced to the model it came from");
  assert.ok(s.predictions.some((p) => p.id === old.prediction), "its prediction is kept");
  assert.ok(s.history.some((h) => h.kind === "abandon" && h.action === ids.act && h.orientation === s.orientations[0].id));
  assert.equal(L.currentAction(s), null);
  assert.equal(L.readiness(s).action, false);
  assert.deepEqual(plain(L.check(s)), []);
  assert.match(L.markdown(s), /## Current decision\n\nNo action chosen yet\./);
  assert.equal(L.records(s).find((r) => r.id === ids.act)?.location, "Loop 1 · abandoned");
  rejects(s, { do: "start", id: ids.act }, "untraced-action");
  rejects(s, { do: "editAction", id: ids.act, text: "x" }, "action-started");
  const r = ok(s, { do: "action", type: "probe", text: "Track missed delivery windows for a week", expected: "Missed windows precede cancellations", reconsider: "No link appears" });
  const fresh = r.state.actions.find((a) => a.id === r.id);
  assert.ok(fresh);
  assert.equal(fresh.orientation, ids.o1);
  assert.equal(L.currentAction(r.state)?.id, r.id);
  assert.match(L.actionSentence(r.state, fresh), /a reliability problem/);
  const started = ok(r.state, { do: "start", id: r.id }).state;
  assert.equal(started.actions.find((a) => a.id === ids.act)?.status, "abandoned");
  assert.equal(L.importText(L.exportJSON(started)).ok, true);
});

test("export integrity: JSON export and import round-trip without semantic loss", () => {
  for (const e of D.examples)
    for (const n of [1, Math.floor(e.steps.length / 2), e.steps.length]) {
      const { s } = rp(e, n);
      const r = L.importText(L.exportJSON(s));
      assert.equal(r.ok, true, `${e.id} at ${n}`);
      assert.deepEqual(plain(r.state), plain(s));
      assert.equal(L.markdown(r.state), L.markdown(s));
      assert.deepEqual(plain(L.diagnostics(r.state)), plain(L.diagnostics(s)));
    }
  const json = JSON.parse(L.exportJSON(replay("snowmobile").s));
  assert.equal(json.schemaVersion, L.SCHEMA);
  for (const k of ["schemaVersion", "situation", "intent", "tempo", "mode", "items", "orientations", "predictions", "actions", "outcomes", "history", "links", "uiPreferences"]) assert.ok(k in json, k);
});

test("contradiction persistence: adopting a new orientation does not make a contradiction disappear", () => {
  const i = stepIndex("southwest", (st) => st.do === "adopt");
  const before = replay("southwest", i).s, after = replay("southwest", i + 1).s;
  const c = before.items.find((x) => x.type === "contradiction");
  assert.ok(c);
  assert.equal(c.status, "open");
  assert.equal(after.items.find((x) => x.id === c.id)?.status, "open", "still open after adoption");
  assert.notEqual(L.current(before)?.id, L.current(after)?.id);
  rejects(after, { do: "resolve", id: c.id, status: "dismissed", reason: "" }, "reason-required");
  const d = ok(after, { do: "resolve", id: c.id, status: "dismissed", reason: "Bus riders were never our market" }).state;
  assert.equal(d.items.find((x) => x.id === c.id)?.reason, "Bus riders were never our market");
  rejects(after, { do: "withdraw", id: c.id }, "use-resolve");
  // The stalled project resolves its contradiction explicitly, with the reason recorded.
  const sp = replay("stalled-project").s.items.find((x) => x.type === "contradiction");
  assert.ok(sp);
  assert.equal(sp.status, "resolved");
  assert.match(sp.reason ?? "", /Explained by O1/);
});

test("rejected candidates remain visible in the lineage", () => {
  const { s } = replay("southwest");
  const rejected = s.orientations.filter((o) => o.status === "rejected");
  assert.equal(rejected.length, 1);
  const rows = L.lineage(s);
  assert.deepEqual(plain(rows.map((r) => [r.label, r.status, r.depth])), [["O0", "superseded", 0], ["O1", "adopted", 1], ["O2", "rejected", 1]]);
  const t = s.history.find((h) => h.kind === "transition");
  assert.ok(t);
  assert.deepEqual(plain(t.rejected), [rejected[0].id]);
  assert.ok(L.markdown(s).includes("### O2 (rejected)"));
  // Retaining the current orientation rejects open candidates but keeps them.
  let r = ok(replay("southwest", stepIndex("southwest", (st) => st.do === "adopt")).s, { do: "retain" }).state;
  assert.equal(r.orientations.filter((o) => o.status === "rejected").length, 2);
  assert.equal(L.label(r, /** @type {Orient.Orientation} */ (L.current(r))), "O0");
});

// Opens the page on a stored situation; typing into the palette draws its rows, and Enter chooses the first.
async function page(/** @type {Orient.State} */ s, /** @type {Record<string, unknown>} */ globals = {}) {
  const stored = JSON.stringify(s);
  /** @type {string[]} */
  const writes = [];
  const localStorage = { getItem: (/** @type {string} */ k) => (k === L.KEY ? stored : null), setItem: (/** @type {string} */ k, /** @type {string} */ v) => writes.push(v), removeItem() {} };
  const pg = await openPage("ooda-orientation", { globals: { localStorage, ...globals } });
  /** @param {string} q @param {boolean} [enter] */
  const palette = async (q, enter) => {
    pg.run("document").getElementById("pal-input").value = q;
    await pg.run("document").getElementById("pal-input").dispatch("input");
    if (enter) for (const fn of pg.run("document").getElementById("pal-input").listeners.keydown) await fn({ key: "Enter", preventDefault() {} });
    await new Promise((r) => setImmediate(r));
    return [...pg.run("document").getElementById("pal-list").innerHTML.matchAll(/<li role="option"[^>]*class="([^"]*)"[^>]*><span class="ty">([^<]*)<\/span><span class="ti">([^<]*)<\/span>/g)].map(([, cls, type, title]) => ({ cls, type, title }));
  };
  return { pg, writes, palette };
}

test("reduced motion changes presentation only: the state has no motion setting and the transition view is data", async () => {
  const { s } = replay("southwest");
  assert.deepEqual(Object.keys(s.uiPreferences), ["stage"]);
  const t = /** @type {string} */ (s.history.find((h) => h.kind === "transition")?.id);
  assert.deepEqual(plain(L.signature(s, t)), plain(L.signature(JSON.parse(L.exportJSON(s)), t)));
  // The same situation opened with and without a reduced-motion preference exports and stores the same thing.
  const out = [];
  for (const matches of [false, true]) {
    const { pg, writes, palette } = await page(s, { matchMedia: (/** @type {string} */ q) => ({ matches: matches && /reduce/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }) });
    await palette("Copy Markdown", true);
    await pg.click("copy-beamdswitch");
    out.push({ copied: pg.copied, writes });
  }
  assert.equal(out[0].copied.length, 2);
  assert.equal(out[0].copied[0], L.markdown(s));
  assert.deepEqual(out[1], out[0]);
  for (const w of out[1].writes) assert.deepEqual(JSON.parse(w), plain(s));
});

/* ---------- search (sections 47-52, 83) ---------- */

test("search never mutates the planner state, and historical navigation leaves the adopted orientation alone", () => {
  const { s } = replay("southwest");
  const frozen = JSON.stringify(s);
  /** @param {any} o */
  const deepFreeze = (o) => { Object.freeze(o); for (const v of Object.values(o)) if (v && typeof v === "object" && !Object.isFrozen(v)) deepFreeze(v); return o; };
  const f = deepFreeze(JSON.parse(frozen));
  for (const q of ["", "airlines", "O0", "boundary", "Adopt", "reorient", "x", "short-distance transport", "Move the competitive boundary"]) {
    const r = L.search(f, q, 50);
    for (const x of r.results) L.navigate(f, x);
  }
  assert.equal(JSON.stringify(f), frozen);
  const hist = L.search(s, "a new airline competing", 10).results.find((r) => r.type === "Historical orientation");
  assert.ok(hist, "the superseded O0 is searchable");
  assert.equal(hist.location, "Lineage · O0 superseded");
  assert.equal(hist.loop, 1);
  const nav = L.navigate(s, hist);
  assert.deepEqual(plain(nav), { stage: "lineage", id: s.orientations[0].id, inspect: s.orientations[0].id });
  assert.equal(L.current(s)?.id, s.orientations[1].id, "the adopted orientation is unchanged");
});

test("search covers current signals, historical orientations, assumptions, predictions, actions, methodology and operations", () => {
  const { s } = replay("stalled-project");
  /** @param {string} q */
  const first = (q) => L.search(s, q, 5).results[0];
  assert.equal(first("The last three plans each missed their dates").type, "Signal");
  assert.equal(first("The last three plans each missed their dates").location, "Reality ledger");
  assert.equal(first("O0: a planning problem").type, "Historical orientation");
  assert.equal(first("Uncertainty is too high for a detailed long-range plan to be useful").type, "Assumption");
  assert.equal(first("Uncertainty is too high for a detailed long-range plan to be useful").location, "Current orientation");
  const pred = first("The result reveals which of the two possible directions is viable");
  assert.equal(pred.type, "Prediction");
  assert.equal(pred.location, "Prediction ledger");
  assert.equal(pred.loop, 1);
  assert.equal(first("Produce one small artifact or test that exposes the next uncertainty").type, "Action");
  assert.equal(first("Orientation is the centre, not step two").type, "Help");
  const op = first("Move the competitive boundary");
  assert.equal(op.type, "Destruction operation");
  assert.equal(op.location, "Method");
  assert.equal(first("A stalled project").type, "Example");
  assert.equal(first("Monster Chess").type, "Example card");
  const two = L.search(s, "A two-day prototype", 5).results;
  assert.deepEqual(plain(two.slice(0, 2).map((r) => r.type)), ["Signal", "Outcome"], "the outcome and the observation it added to the ledger");
});

test("ranking is exact > prefix > contained phrase > all tokens > partial tokens", () => {
  const { s } = build([
    { do: "new", title: "Ranking" },
    { do: "item", type: "signal", text: "zebra crossing delays" },
    { do: "item", type: "signal", text: "zebra crossing" },
    { do: "item", type: "signal", text: "the zebra crossing is busy" },
    { do: "item", type: "signal", text: "crossing near a zebra" },
    { do: "item", type: "signal", text: "zebras sometimes cross" },
  ]);
  const r = L.search(s, "zebra crossing", 10).results;
  assert.deepEqual(plain(r.map((x) => [x.title, x.rank])), [["zebra crossing", 0], ["zebra crossing delays", 1], ["the zebra crossing is busy", 2], ["crossing near a zebra", 3], ["zebras sometimes cross", 4]]);
  assert.deepEqual(plain(L.search(s, "zebra crossing", 10).results.map((x) => x.title)), plain(r.map((x) => x.title)), "deterministic");
  assert.equal(L.search(s, "ZEBRA   Crossing!", 10).results[0].title, "zebra crossing", "case and punctuation are ignored");
});

test("commands appear in the same palette and stay distinguishable from records", () => {
  const { s } = replay("stalled-project");
  const none = L.search(s, "", 50).results;
  assert.ok(none.length >= 15 && none.every((r) => r.kind === "command" && r.type === "Command"));
  for (const t of ["Add signal", "Add assumption", "Add contradiction", "Reorient", "Deep reset", "Compare candidates", "Record outcome", "Open lineage", "Show prediction ledger", "New situation", "Import JSON", "Export JSON", "Copy Markdown", "Reset", "How this works"])
    assert.ok(none.some((r) => r.title === t), t);
  const mixed = L.search(s, "reorient", 30).results;
  assert.ok(mixed.some((r) => r.kind === "command") && mixed.some((r) => r.kind === "record"));
  for (const r of mixed) assert.equal(r.kind === "command", r.type === "Command");
  assert.equal(mixed[0].title, "Reorient");
});

test("the palette draws commands with their own class and records without it", async () => {
  const s = replay("stalled-project").s;
  const { palette, writes } = await page(s);
  const rows = await palette("reorient");
  assert.deepEqual(plain(rows.map((r) => r.title)), plain(L.search(s, "reorient", 40).results.map((r) => r.title)));
  assert.ok(rows.some((r) => r.cls === "cmd") && rows.some((r) => r.cls === ""));
  for (const r of rows) assert.equal(r.cls === "cmd", r.type === "Command", r.title);
  for (const w of writes) assert.deepEqual(JSON.parse(w), plain(s), "drawing the palette leaves the state alone");
});

test("search stays fast for several hundred local records", () => {
  let s = replay("stalled-project").s;
  for (let i = 0; i < 300; i += 1) s = ok(s, { do: "item", type: i % 2 ? "signal" : "assumption", text: `Observation number ${i} about delivery and planning`, attach: false }).state;
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 20; i += 1) L.search(s, "delivery planning " + i, 40);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 20;
  assert.ok(ms < 30, `one search took ${ms.toFixed(1)} ms`);
});

/* ---------- section 81: diagnostics ---------- */

/** @param {Orient.State} s */
const rules = (s) => L.diagnostics(s).map((d) => d.rule);

test("diagnostic: reworded-but-equivalent candidates", () => {
  const s = replay("southwest", stepIndex("southwest", (st) => st.do === "adopt")).s;
  const rw = L.diagnostics(s).filter((d) => d.rule === "rewording");
  assert.equal(rw.length, 1);
  assert.equal(rw[0].message, "You changed the wording, not the orientation.");
  assert.equal(rw[0].target, s.orientations[2].id, "O2 rewords O0");
  assert.notEqual(s.orientations[2].inside, s.orientations[0].inside, "the wording did change");
});

test("diagnostic: an unchanged boundary across every alternative", () => {
  const { s, ids } = build([...base(), { do: "reorient" },
    { do: "move", op: "a-negate", targets: ["@asm"], replacement: { text: "Customers care about reliability more than price" }, as: "rep" },
    { do: "candidate", inside: "a reliability problem", from: ["@rep"], items: ["@rep", "@bnd"], boundary: "@bnd", mechanism: "unreliable delivery loses customers", move: "Fix reliability" }]);
  const d = L.diagnostics(s).find((x) => x.rule === "boundary-lock");
  assert.ok(d);
  assert.equal(d.message, "Every candidate preserves the same system boundary.");
  assert.ok(!rules(s).includes("rewording"), "different assumptions and move: not a rewording");
  // Moving the boundary for one candidate lifts the lock, and guided mode challenges boundaries while it holds.
  assert.ok(L.guided(s).some((g) => g.op === "b-move"));
  const t = ok(s, { do: "move", op: "b-widen", targets: [ids.bnd], replacement: { text: "Customers and the people who recommend us" } });
  const u = ok(t.state, { do: "candidate", inside: "a referral problem", from: [t.id], boundary: t.id, move: "Ask for referrals", mechanism: "referrals drive retention" }).state;
  assert.ok(!rules(u).includes("boundary-lock"));
});

test("diagnostic: a model without a falsifier is hard to test, not invalid", () => {
  const { s } = build([...base(), { do: "orient", falsifier: "" }]);
  const d = L.diagnostics(s).find((x) => x.rule === "untestable");
  assert.ok(d);
  assert.equal(d.message, "You have not identified an observation that could weaken this orientation.");
  assert.equal(L.current(s)?.status, "adopted", "it stays adopted; only labelled");
  assert.ok(L.contrast(s)[0].hardToTest);
  assert.ok(L.guided(s).some((g) => g.op === "a-evidence"));
});

test("diagnostic: repeated failed actions under an unchanged orientation flag tempo substitution", () => {
  /** @param {number} n */
  const fail = (n) => [{ do: "action", type: "maneuver", text: `Push harder ${n}`, expected: "More renewals", reconsider: "No change", as: `a${n}` }, { do: "start", id: `@a${n}` },
    { do: "outcome", action: `@a${n}`, observed: "Renewals did not change", effect: "not", attribution: "orientation", predictions: [{ status: "not-observed" }] }];
  const { s } = build([...base(), ...fail(1), ...fail(2)]);
  assert.ok(!rules(s).includes("tempo-substitution"), "two failures alone are a reason to reorient, not yet tempo substitution");
  assert.deepEqual(plain(L.triggers(s).map((t) => t.id)), ["failed-predictions", "action-failures"]);
  const faster = ok(s, { do: "tempo", value: "high" }).state;
  const d = L.diagnostics(faster).find((x) => x.rule === "tempo-substitution");
  assert.ok(d);
  assert.equal(d.message, "You are increasing action tempo without changing the orientation that produced repeated failures.");
  assert.ok(L.triggers(faster).some((t) => t.id === "tempo"));
  const again = ok(s, { do: "action", type: "maneuver", text: "Push harder 3", expected: "More renewals", reconsider: "No change" }).state;
  assert.ok(rules(again).includes("tempo-substitution"), "a third action from the same orientation also counts");
});

test("diagnostic: an untested constraint", () => {
  const { s, ids } = build(base());
  const d = L.diagnostics(s).filter((x) => x.rule === "untested-constraint");
  assert.equal(d.length, 1);
  assert.equal(d[0].target, ids.con);
  assert.equal(d[0].message, "This constraint has not yet been tested as genuinely fixed.");
  assert.ok(!rules(ok(s, { do: "edit", id: ids.con, tested: true }).state).includes("untested-constraint"));
});

test("diagnostic: an action with little discriminatory value", () => {
  const { s } = build([...base(), { do: "action", type: "probe", text: "Send a newsletter", expected: "", reconsider: "Nobody opens it" }]);
  assert.ok(rules(s).includes("low-information"), "no expected signal");
  const { s: t } = build([...base(), { do: "action", type: "maneuver", text: "Send a newsletter", expected: "Some opens", reconsider: "x", consistency: { sameUnderAll: "yes", dominates: "no" } }]);
  assert.equal(L.diagnostics(t).find((x) => x.rule === "low-information")?.message, "This action appears to produce little information about which orientation is better.");
  const { s: u } = build([...base(), { do: "action", type: "probe", text: "Ask five customers why they left", expected: "Most mention delivery", reconsider: "Most mention price", consistency: { sameUnderAll: "no", discriminator: "What leavers say" } }]);
  assert.ok(!rules(u).includes("low-information"));
  const { s: v } = build([...base(), { do: "action", type: "probe", text: "Ship it", expected: "x", reconsider: "y", consistency: { sameUnderAll: "yes", dominates: "yes" } }]);
  assert.ok(!rules(v).includes("low-information"), "the same action under every candidate, when acting dominates, is fine");
});

test("diagnostic: an observation that contains an inference", () => {
  const { s, ids } = build([...base(), { do: "item", type: "signal", text: "Customers left because the app is slow", as: "bad" }]);
  const d = L.diagnostics(s).filter((x) => x.rule === "collapse");
  assert.deepEqual(plain(d.map((x) => x.target)), [ids.bad]);
  assert.equal(d[0].message, "This statement is currently labelled as an observation but contains an interpretation.");
  for (const t of ["They probably want a discount", "Users don't care about colour", "It seems slower", "I think sales fell"]) assert.ok(rules(ok(s, { do: "item", type: "signal", text: t }).state).includes("collapse"), t);
});

test("diagnostic: a prediction edited after the outcome is prevented, and a tampered record is flagged", () => {
  const { s } = replay("stalled-project");
  rejects(s, { do: "editPrediction", id: s.predictions[0].id, text: "Anything at all" }, "prediction-drift");
  const tampered = plain(s);
  tampered.predictions[0].text = "The result was exactly what happened";
  const r = L.importText(JSON.stringify(tampered));
  assert.equal(r.ok, true, "the archive is readable");
  const d = L.diagnostics(r.state).find((x) => x.rule === "prediction-drift");
  assert.ok(d);
  assert.equal(d.message, "The expected result changed after the outcome was known.");
  assert.match(d.detail, /Original: The result reveals which of the two possible directions is viable/);
  assert.ok(L.markdown(r.state).includes("before acting I expected the result reveals which"), "Markdown keeps the original");
});

test("triggers can say keep acting, and explain themselves when they fire", () => {
  const { s } = replay("stalled-project");
  assert.deepEqual(plain(L.triggers(s)), []);
  const k = ok(s, { do: "keep" }).state;
  assert.equal(k.history.at(-1)?.kind, "keep");
  assert.equal(L.current(k)?.id, L.current(s)?.id);
  const { s: c, ids } = build([...base(), { do: "contradiction", text: "Cancellations did not drop when delivery sped up", refs: ["@sig"] }]);
  assert.deepEqual(plain(L.triggers(c).map((t) => t.id)), ["contradiction"]);
  const st = ok(c, { do: "qualify", id: ids.sig, qualifier: "stale" }).state;
  assert.ok(L.triggers(st).some((t) => t.id === "stale"));
  const { s: none } = build([{ do: "new", title: "Nothing yet" }]);
  assert.deepEqual(plain(L.triggers(none).map((t) => t.id)), ["no-action"]);
});

/* ---------- destruction and creation ---------- */

test("destruction requires a real replacement, respects depth and stays traceable", () => {
  const { s, ids } = build([...base(), { do: "reorient" }]);
  rejects(s, { do: "move", op: "a-negate", targets: [ids.asm], replacement: { text: "   " } }, "replacement-required");
  rejects(s, { do: "move", op: "g-remove", targets: [], replacement: { text: "x" } }, "deep-required");
  rejects(s, { do: "move", op: "b-move", targets: [ids.asm], replacement: { text: "x" } }, "bad-target");
  rejects(s, { do: "move", op: "c-merge", targets: [], replacement: { text: "x" } }, "bad-target");
  let t = s;
  for (const [op, target, text] of [["a-negate", ids.asm, "Customers care about reliability"], ["b-widen", ids.bnd, "Customers and their colleagues"], ["k-resource", ids.con, "A small team can talk to every customer"]])
    t = ok(t, { do: "move", op, targets: [target], replacement: { text } }).state;
  const e = rejects(t, { do: "move", op: "x-reverse", targets: [ids.inf], replacement: { text: "Slow delivery follows cancellations" } }, "move-limit");
  assert.match(e.message, /Deep reset/);
  const deep = ok(t, { do: "reorient", deep: true }).state;
  const r = ok(deep, { do: "move", op: "x-reverse", targets: [ids.inf], replacement: { text: "Slow delivery follows cancellations" } });
  const created = r.state.items.find((i) => i.id === r.id);
  assert.ok(created && created.origin);
  assert.equal(created.type, "causal");
  assert.deepEqual(plain(created.origin.from), [ids.inf]);
  const frag = L.fragments(r.state);
  assert.deepEqual(plain(frag.filter((f) => f.kind === "destroyed").map((f) => f.id)).sort(), [ids.asm, ids.bnd, ids.con, ids.inf].sort());
  assert.equal(frag.filter((f) => f.kind === "created").length, 4);
  rejects(r.state, { do: "candidate", inside: "x", from: [] }, "untraced-candidate");
  rejects(r.state, { do: "candidate", inside: "x", from: [ids.asm] }, "untraced-candidate");
  let c = r.state;
  for (let i = 0; i < 4; i += 1) c = ok(c, { do: "candidate", inside: "candidate " + i, from: [r.id], move: "move " + i }).state;
  rejects(c, { do: "candidate", inside: "fifth", from: [r.id] }, "candidate-limit");
  assert.equal(c.orientations.at(-1)?.creation.from[0], r.id, "a candidate records where it came from");
});

test("guided suggestions follow visible weaknesses; random jolts are a fixed visible sequence", () => {
  const sw = replay("southwest", stepIndex("southwest", (st) => st.do === "reorient") + 1).s;
  assert.deepEqual(plain(L.guided(sw).map((g) => g.op)), ["x-reverse", "x-common", "x-correlated"], "a contradiction challenges the causal model first");
  const snow = replay("snowmobile", stepIndex("snowmobile", (st) => st.do === "reorient") + 1).s;
  assert.ok(L.guided(snow).some((g) => g.op === "a-evidence"), "no falsifier challenges testability");
  let s = sw;
  const seen = [];
  for (let i = 0; i < D.jolts.length + 2; i += 1) { seen.push(L.jolt(s).op); s = ok(s, { do: "jolt" }).state; }
  assert.deepEqual(seen, [...D.jolts.map((j) => j.op), D.jolts[0].op, D.jolts[1].op]);
  assert.deepEqual(seen, (() => { let t = sw; const o = []; for (let i = 0; i < D.jolts.length + 2; i += 1) { o.push(L.jolt(t).op); t = L.apply(t, { do: "jolt" }).state; } return o; })(), "replays identically");
});

test("creation offers prompts built from fragments, never conclusions", () => {
  const i = stepIndex("southwest", (st) => st.do === "candidate");
  const s = replay("southwest", i).s;
  const p = L.creationPrompts(s);
  assert.equal(p[0].id, "boundary-signal");
  assert.equal(p[0].text, "What orientation appears if you combine the boundary “Short-distance transport for the same journey: cars, buses and airlines” with the observation “Most people travelling between these cities drive or take the bus”?");
  for (const x of p) assert.match(x.text, /\?$/);
  assert.equal(s.orientations.length, 1, "prompting creates nothing");
});

test("Deep Memory surfaces a previously weakened assumption and a repeated open contradiction", () => {
  let s = replay("stalled-project").s;
  s = ok(s, { do: "reorient" }).state;
  const r = ok(s, { do: "move", op: "x-common", targets: [s.items.find((i) => i.text.startsWith("Uncertainty is too high"))?.id], replacement: { type: "assumption", text: "The problem is insufficient planning quality" } });
  const c = ok(r.state, { do: "candidate", inside: "a planning problem again", from: [r.id], keyAssumption: "Better planning will fix it" });
  const mem = L.deepMemory(c.state, c.state.orientations.find((o) => o.id === c.id));
  assert.equal(mem.length, 1);
  assert.equal(mem[0].text, "You previously used this same assumption in O0: “The problem is insufficient planning quality”. It was weakened by outcome R1.");
  // A contradiction left open while an earlier orientation was replaced is remembered too.
  const sw = replay("southwest").s;
  const m2 = L.deepMemory(sw, L.current(sw));
  assert.ok(m2.some((m) => m.kind === "unexplained" && m.text.startsWith("A previous orientation, O0, was replaced while the same contradiction stayed open")));
});

test("contrast uses visible dimensions, never a numeric score", () => {
  const s = replay("southwest", stepIndex("southwest", (st) => st.do === "adopt")).s;
  const rows = L.contrast(s);
  assert.deepEqual(plain(rows.map((r) => r.label)), ["O0", "O1", "O2"]);
  for (const r of rows) {
    for (const d of D.dimensions) assert.ok(d.id in r, d.id);
    for (const [k, v] of Object.entries(r)) if (k !== "basis") assert.notEqual(typeof v, "number", `${k} is not a number`);
  }
  assert.deepEqual(plain(rows[1].basis), { supporting: 2, contradictions: 1, untested: 1, weakened: 0, observed: 0, partial: 0, failed: 0 });
  assert.deepEqual(plain(L.basisText(rows[1].basis)), ["2 supporting observations", "1 contradiction", "1 untested assumption", "0 successful predictions"]);
  assert.doesNotMatch(html.replace(/\bno score\b/gi, ""), /\bscore\b/i, "the only mention of a score says there is none");
});

test("a commitment needs a reconsideration trigger; one meaningful move per loop", () => {
  const { s, ids } = build([...base(), { do: "action", type: "commitment", text: "Sign a two-year courier contract", expected: "Cancellations halve", reconsider: "", as: "a" }]);
  rejects(s, { do: "start", id: ids.a }, "commitment-trigger");
  rejects(s, { do: "action", type: "probe", text: "Another", expected: "x" }, "one-action");
  const t = ok(s, { do: "editAction", id: ids.a, reconsider: "Cancellations do not fall within a month" }).state;
  assert.equal(ok(t, { do: "start", id: ids.a }).state.actions[0].status, "started");
  assert.deepEqual(plain(L.readiness(t)), { orientation: true, action: true, expected: true, reconsider: true });
  assert.equal(L.actionSentence(t, t.actions[0]), "Because I currently believe the situation is primarily a delivery-speed problem, I will sign a two-year courier contract, and I expect to observe cancellations halve.");
});

/* ---------- section 82: worked examples ---------- */

test("Southwest-style: the competitive boundary itself is replaced, and the model and action use the new one", () => {
  const { s, alias } = replay("southwest");
  const item = (/** @type {string} */ id) => s.items.find((i) => i.id === id);
  const [o0, o1] = s.orientations;
  assert.equal(item(/** @type {string} */ (o0.boundary))?.text, "Airlines flying the same routes");
  assert.equal(o1.boundary, alias.b2);
  assert.equal(item(o1.boundary)?.text, "Short-distance transport for the same journey: cars, buses and airlines");
  assert.equal(/** @type {string[]} */ (item(alias.b2)?.origin?.from)[0], alias.b1, "the new boundary was produced by destroying the old one");
  assert.equal(s.workspace, null);
  assert.equal(L.current(s)?.id, o1.id);
  const t = s.history.find((h) => h.kind === "transition");
  assert.ok(t);
  assert.ok(t.destroyed.includes(alias.b1) && t.created.includes(alias.b2) && !t.kept.includes(alias.b1));
  assert.equal(t.moves[0].op, "b-move");
  assert.ok(!o1.items.includes(alias.b1), "the old boundary is not part of the new model");
  assert.ok(o1.items.includes(alias.a2) && !o1.items.includes(alias.a1));
  assert.notEqual(o1.mechanism, o0.mechanism);
  const a = s.actions[0];
  assert.equal(a.orientation, o1.id);
  assert.ok(a.refs.includes(alias.b2), "the action relies on the new boundary");
  assert.equal(L.equivalent(s, o1, o0), false);
});

test("Snowmobile: objects are detached from their functions and their properties recombined", () => {
  const { s, alias } = replay("snowmobile");
  const item = (/** @type {string} */ id) => s.items.find((i) => i.id === id);
  const t = /** @type {Orient.Transition | undefined} */ (s.history.find((h) => h.kind === "transition"));
  assert.ok(t);
  assert.equal(t.deep, true);
  const detach = t.moves.filter((m) => m.op === "f-detach");
  assert.deepEqual(plain(detach.map((m) => m.targets[0])), [alias.f1, alias.f2, alias.f3, alias.f4]);
  for (const [fn, prop, obj] of [["f1", "p1", "j1"], ["f2", "p2", "j2"], ["f3", "p3", "j3"], ["f4", "p4", "j4"]]) {
    assert.equal(item(alias[fn])?.type, "function");
    assert.deepEqual(plain(item(alias[fn])?.refs), [alias[obj]], `${fn} names the object's conventional function`);
    assert.equal(item(alias[prop])?.type, "function");
    assert.deepEqual(plain(item(alias[prop])?.origin?.from), [alias[fn]], `${prop} is a property freed from ${fn}`);
    assert.ok(t.destroyed.includes(alias[fn]) && t.created.includes(alias[prop]) && t.kept.includes(alias[obj]));
  }
  const combine = t.moves.find((m) => m.op === "f-combine");
  assert.ok(combine);
  assert.deepEqual(plain(combine.targets), [alias.p1, alias.p2, alias.p3, alias.p4]);
  const sm = item(alias.j5);
  assert.ok(sm && sm.origin);
  assert.equal(sm.type, "object");
  assert.match(sm.text, /^Snowmobile/);
  assert.deepEqual(plain(sm.origin.from), [alias.p1, alias.p2, alias.p3, alias.p4]);
  const o = L.current(s);
  assert.ok(o);
  assert.ok(o.items.includes(alias.j5) && [alias.f1, alias.f2, alias.f3, alias.f4].every((f) => !o.items.includes(f)));
  assert.deepEqual(plain(o.creation.from), [alias.p1, alias.p2, alias.p3, alias.p4, alias.j5]);
  assert.deepEqual(plain(s.actions[0].refs), [alias.j5]);
});

test("Stalled project: observation → contradiction → destroyed planning assumption → alternative → action → expected signal → observation", () => {
  const ex = example("stalled-project");
  /** @param {(step: import("../src/ooda-orientation-logic.js").Command) => boolean} pred */
  const at = (pred) => replay("stalled-project", stepIndex("stalled-project", pred) + 1);
  const obs = at((/** @type {import("../src/ooda-orientation-logic.js").Command} */ st) => st.as === "s3").s;
  assert.deepEqual(plain(obs.items.filter((i) => i.ledger === "observed").map((i) => i.text)), ["The last three plans each missed their dates", "Work expanded beyond each plan's estimate", "Planning time doubled over two months and throughput did not rise"]);
  const { s: con, alias: ca } = at((/** @type {import("../src/ooda-orientation-logic.js").Command} */ st) => st.do === "contradiction");
  const c = con.items.find((i) => i.id === ca.c1);
  assert.ok(c);
  assert.deepEqual(plain(c.refs), [ca.s3, ca.a1]);
  assert.deepEqual(plain(L.triggers(con).map((t) => t.id)), ["contradiction"]);
  const { s: mv, alias: ma } = at((/** @type {import("../src/ooda-orientation-logic.js").Command} */ st) => st.do === "move");
  assert.equal(L.fragments(mv).find((f) => f.id === ma.a1)?.kind, "destroyed");
  assert.equal(mv.items.find((i) => i.id === ma.a2)?.text, "Uncertainty is too high for a detailed long-range plan to be useful");
  const { s: ad, alias: aa } = at((/** @type {import("../src/ooda-orientation-logic.js").Command} */ st) => st.do === "adopt");
  const o1 = L.current(ad);
  assert.ok(o1);
  assert.equal(o1.id, aa.o1);
  assert.ok(o1.items.includes(aa.a2) && !o1.items.includes(aa.a1));
  assert.ok(ad.history.find((h) => h.kind === "transition")?.destroyed.includes(aa.a1));
  const { s, alias } = replay("stalled-project");
  const a = s.actions[0];
  assert.equal(a.orientation, alias.o1);
  assert.ok(a.refs.includes(alias.a2));
  assert.equal(L.expectedOf(s, a), "The result reveals which of the two possible directions is viable");
  assert.equal(a.status, "done");
  const r = s.outcomes[0];
  assert.equal(r.action, a.id);
  assert.equal(s.predictions[0].status, "observed");
  assert.ok(s.items.some((i) => i.origin && i.origin.outcome === r.id && i.text === r.observed), "the result re-enters reality as an observation");
  assert.equal(s.items.find((i) => i.id === alias.a1)?.status, "weakened");
  assert.equal(s.items.find((i) => i.id === alias.a2)?.status, "supported");
  assert.equal(s.loop, 2);
  assert.equal(ex.steps.at(-1)?.do, "outcome");
});

test("worked examples replay deterministically", () => {
  for (const e of D.examples) assert.equal(L.exportJSON(rp(e).s), L.exportJSON(rp(e).s), e.id);
});

/* ---------- section 84: persistence ---------- */

/** @param {Record<string, string>} [initial] */
function memoryStorage(initial) {
  const m = new Map(initial ? Object.entries(initial) : []);
  return { getItem: (/** @type {string} */ k) => (m.has(k) ? m.get(k) ?? null : null), setItem: (/** @type {string} */ k, /** @type {unknown} */ v) => { m.set(k, String(v)); }, removeItem: (/** @type {string} */ k) => { m.delete(k); }, map: m };
}

test("refresh restores the current state; reset clears it", () => {
  const store = memoryStorage();
  const { s } = replay("southwest");
  assert.equal(L.save(store, s), true);
  assert.deepEqual(plain(L.load(store).state), plain(s));
  assert.equal(L.clear(store), true);
  assert.deepEqual(plain(L.load(store)), { state: null });
  const broken = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); }, removeItem() { throw new Error("denied"); } };
  assert.equal(L.save(broken, s), false);
  assert.equal(L.load(broken).message, "Browser storage is unavailable. The planner will still work, but refresh will lose unsaved changes. Export JSON to keep the situation.");
});

test("import replaces state only after valid parsing; malformed JSON and future schemas fail safely", () => {
  for (const bad of ["{", "", "null", "[]", '{"schemaVersion":"2"}', JSON.stringify({ schemaVersion: 2, items: "nope" })]) {
    const r = L.importText(bad);
    assert.equal(r.ok, false, bad);
    assert.equal(r.message, "This file is not a valid Orient state. Your current situation has not been changed.");
    assert.equal(r.state, undefined);
  }
  const future = L.importText(JSON.stringify({ ...replay("snowmobile").s, schemaVersion: L.SCHEMA + 1 }));
  assert.deepEqual(plain(future), { ok: false, message: "This file was created by a newer version of Orient and cannot be opened safely here." });
  const store = memoryStorage({ [L.KEY]: "{not json" });
  assert.equal(L.load(store).state, null);
  assert.equal(store.map.get(L.KEY), "{not json", "a broken stored value is not overwritten by loading");
});

test("an old supported schema migrates deterministically", () => {
  const v1 = {
    schemaVersion: 1,
    situation: { title: "Old plan", description: "From the draft format", tempo: "high", mode: "team" },
    intent: "Ship by June",
    items: [{ id: "s1", kind: "signal", text: "Two deadlines missed", observed: true, notes: ["stale"] },
      { id: "a1", kind: "assumption", text: "We need more planning", observed: false },
      { id: "u1", kind: "unknown", text: "Is the scope fixed?", observed: null }],
    orientations: [{ id: "o1", parent: null, status: "superseded", statement: { model: "a planning problem", evidence: "deadlines slipped", lever: "detail", prediction: "a detailed plan is met" }, boundary: "Our team", assumptions: ["a1"], falsifier: "" },
      { id: "o2", parent: "o1", status: "adopted", statement: { model: "an uncertainty problem", evidence: "planning did not help", lever: "small tests", prediction: "a test settles it" }, boundary: "", assumptions: [], falsifier: "The test settles nothing" }],
    predictions: [{ id: "p1", orientation: "o2", action: "x1", text: "A test settles it", frozen: true, outcome: "observed" }],
    actions: [{ id: "x1", orientation: "o2", kind: "probe", text: "Run one test", reconsider: "It settles nothing", status: "done" }],
    outcomes: [{ id: "r1", action: "x1", observed: "It settled the choice", interpretation: "As expected" }],
  };
  const a = L.importText(JSON.stringify(v1)), b = L.importText(JSON.stringify(v1));
  assert.equal(a.ok, true);
  assert.equal(a.migrated, true);
  assert.equal(L.exportJSON(/** @type {Orient.State} */ (a.state)), L.exportJSON(/** @type {Orient.State} */ (b.state)), "deterministic");
  const s = a.state;
  assert.equal(s.schemaVersion, L.SCHEMA);
  assert.deepEqual(plain(L.check(s)), []);
  assert.deepEqual(plain(s.items.slice(0, 3).map((i) => [i.id, i.type, i.ledger, i.provenance])), [["s1", "signal", "observed", ["stale"]], ["a1", "assumption", "inferred", []], ["u1", "unknown", "unknown", []]]);
  assert.equal(s.items.find((i) => i.id === s.intent)?.text, "Ship by June");
  assert.equal(s.tempo, "high");
  assert.equal(s.mode, "team");
  assert.equal(L.current(s)?.inside, "an uncertainty problem");
  assert.equal(s.items.find((i) => i.id === s.orientations[0].boundary)?.text, "Our team");
  assert.deepEqual(plain([s.predictions[0].locked, s.predictions[0].original, s.predictions[0].status]), [true, "A test settles it", "observed"]);
  assert.equal(s.actions[0].prediction, "p1");
  assert.equal(L.lineage(s).length, 2);
  // A draft left under a superseded orientation migrates as abandoned, so a new action can follow the adopted one.
  const stale = plain(v1);
  stale.actions.push({ id: "x2", orientation: "o1", kind: "probe", text: "Write the detailed plan", reconsider: "", status: "draft" });
  const m = L.importText(JSON.stringify(stale));
  assert.equal(m.ok, true);
  assert.deepEqual(plain(m.state.actions.map((x) => [x.id, x.status])), [["x1", "done"], ["x2", "abandoned"]]);
  assert.equal(L.currentAction(m.state), null);
  rejects(m.state, { do: "start", id: "x2" }, "untraced-action");
  const next = ok(m.state, { do: "action", type: "probe", text: "Run a second test" });
  assert.equal(next.state.actions.find((x) => x.id === next.id)?.orientation, "o2");
  const forged = plain(m.state);
  forged.actions.find((/** @type {{ id: string }} */ x) => x.id === "x2").status = "draft";
  assert.equal(L.importText(L.exportJSON(forged)).ok, false, "a draft must follow the adopted orientation");
  // New objects get fresh ids after migration.
  const t = ok(s, { do: "item", type: "signal", text: "New" });
  assert.ok(!["s1", "a1", "u1", "o1", "o2", "p1", "x1", "r1"].includes(/** @type {string} */ (t.id)));
  assert.equal(L.importText(JSON.stringify({ ...v1, schemaVersion: 0 })).ok, false, "a version with no migration fails safely");
});

test("Markdown export is a readable reasoning record", () => {
  const md = L.markdown(replay("stalled-project").s);
  const heads = md.split("\n").filter((l) => /^#{1,3} /.test(l));
  assert.deepEqual(heads, ["# My project keeps slipping even though I spend more time planning it", "## Current reality", "### Observed", "### Inferred", "### Unknown", "### Contradictions",
    "## Orientation lineage", "### O0 (superseded)", "### O1 (adopted)", "## Current orientation", "## Current decision", "## Prediction ledger", "## Outcomes"]);
  assert.ok(md.includes("Because the situation is primarily a high-uncertainty project where long-range plans hide the open questions,\nI will produce one small artifact or test that exposes the next uncertainty (probe),\nI expect the result reveals which of the two possible directions is viable.\nReconsider if the artifact reveals"));
  assert.ok(md.includes("Destroyed The problem is insufficient planning quality; I need a better plan. Created Uncertainty is too high"));
});
