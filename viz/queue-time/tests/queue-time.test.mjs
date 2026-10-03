import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { assertButtonsExport, assertInlined, assertStandardDeck, assertTemplateCopy, openPage, read } from "./data-visuals-beamdswitch.mjs";

const html = read("index.html");
const engine = /** @type {RegExpExecArray} */ (/<script id="queue-time-engine">\n([\s\S]*?)<\/script>/.exec(html))[1];
/* A fresh engine, typed as the page's (types/page.d.ts). */
/** @returns {typeof QueueTime} */
const load = () => {
  /** @type {{ self?: unknown, QueueTime?: typeof QueueTime }} */
  const ctx = {};
  ctx.self = ctx; vm.runInNewContext(engine, ctx);
  return /** @type {typeof QueueTime} */ (ctx.QueueTime);
};
const Q = load();
const T = (await import("node:module")).createRequire(import.meta.url)("../beamdswitch.js");
const plain = (/** @type {unknown} */ v) => JSON.parse(JSON.stringify(v));
/* The estimate of a moving queue: most cases here have a counter open. */
const est = (/** @type {Parameters<typeof Q.estimate>[0]} */ x) => { const e = Q.estimate(x); assert.ok(e.kind !== "stopped", "the queue is moving"); return e; };
/* The rough rule for a queue with a counter open. */
const rough = (/** @type {Parameters<typeof Q.roughRule>[0]} */ s) => { const v = Q.roughRule(s); assert.ok(v !== null, "a counter is open"); return v; };

test("the default queue reads as an estimate with a range around the rough rule", () => {
  const e = est(Q.defaults()), h = Q.headline(e);
  assert.equal(e.kind, "wait");
  assert.ok(e.lo < e.mid && e.mid < e.hi, "a central estimate inside a plausible interval");
  assert.ok(Math.abs(e.mean - rough(e.s)) < 1.5, `mean ${e.mean} near the rough rule ${Q.roughRule(e.s)}`);
  assert.equal(h.head, `About ${Math.round(e.mid)} min`);
  assert.equal(h.sub, `Likely ${Math.floor(e.lo)}–${Math.ceil(e.hi)} min`);
  assert.equal(Q.describe(e), `8 people ahead, 2 counters, estimated wait ${Math.floor(e.lo)} to ${Math.ceil(e.hi)} minutes.`);
});

test("estimates are deterministic and move the right way with each input", () => {
  assert.deepEqual(plain(load().estimate({ people: 12, counters: 3 })), plain(est({ people: 12, counters: 3 })), "a fresh engine gives the same numbers");
  let prev = -1;
  for (let n = 0; n <= 40; n++) { const m = est({ people: n }).mid; assert.ok(m >= prev, `more people never shortens the wait (${n})`); prev = m; }
  assert.ok(est({ counters: 3 }).mid < est({ counters: 2 }).mid);
  assert.ok(est({ pace: "fast" }).mid < est({ pace: "typical" }).mid && est({ pace: "typical" }).mid < est({ pace: "slow" }).mid);
  assert.ok(Math.abs(est({ pace: "custom", custom: 4 }).mid - 2 * est({ pace: "custom", custom: 2 }).mid) < 1e-9, "times scale with the pace");
  assert.ok(est({ weights: ["slow", "slow"] }).mid > est({}).mid && est({ weights: ["quick", "quick"] }).mid < est({}).mid);
  assert.ok(est({ structure: "separate" }).mid > est({}).mid, "a line per counter: only your counter serves your line");
});

test("edge cases: nobody ahead, no counters, huge queues, spare counters, very fast service", () => {
  const zero = est({ people: 0 });
  assert.equal(zero.kind, "next");
  assert.equal(Q.headline(zero).head, "You’re next");
  assert.match(Q.headline(zero).sub, /^Almost no queue wait/);
  const stopped = Q.estimate({ counters: 0 });
  assert.equal(stopped.kind, "stopped");
  assert.equal(Q.headline(stopped).head, "Queue is not moving");
  assert.equal(Q.roughRule(stopped.s), null);
  assert.equal(Q.describe(stopped), "8 people ahead, 0 counters. The queue is not moving.");
  // The guard is this process's CPU time, not wall-clock: suites run files in parallel and load
  // stretches elapsed time. In this vm context the 400-run simulation takes about 0.8 s of CPU
  // (about 60 ms in a page, where global lookups are cheap); 10 s still catches a blow-up.
  const cpu0 = process.cpuUsage(), big = est({ people: 1e9, counters: 50 }), cpu = process.cpuUsage(cpu0);
  assert.ok((cpu.user + cpu.system) / 1000 < 10_000, "999 people at 50 counters stays fast");
  assert.equal(big.kind, "wait");
  assert.equal(big.s.people, 999);
  assert.equal(big.s.counters, 50);
  assert.ok(Number.isFinite(big.lo) && Number.isFinite(big.hi) && Number.isFinite(big.mean), "a finite range for a huge queue");
  assert.ok(big.lo <= big.mid && big.mid <= big.hi && big.mid > 30);
  assert.ok(Math.abs(big.mean - rough(big.s)) < 2, `mean ${big.mean} near the rough rule ${Q.roughRule(big.s)}`);
  assert.match(Q.headline(est({ people: 999, counters: 1 })).head, /^About \d+ h$/);
  const spare = est({ people: 2, counters: 10 });
  assert.ok(spare.mid > 0 && spare.mid < est({ people: 2, counters: 1 }).mid);
  const fast = Q.headline(est({ pace: "custom", custom: 0.05 }));
  assert.equal(fast.head, "Less than a minute");
  assert.doesNotMatch(fast.head + fast.sub, /0\.\d/, "no meaningless decimals");
  for (const bad of [{ people: -5 }, { people: "abc" }, { counters: 1e6 }, { pace: "toString" }, { pace: "custom", custom: -1 }, { weights: "x" }]) {
    const e = Q.estimate(bad);
    assert.ok(e.kind === "stopped" || Number.isFinite(e.mid), JSON.stringify(bad));
  }
  assert.equal(Q.scenario({ people: -5 }).people, 0);
  assert.equal(Q.scenario({ pace: "toString" }).pace, "typical");
  assert.equal(Q.scenario({ pace: "custom", custom: 999 }).minutes, 120);
});

test("durations and ranges avoid false precision", () => {
  /** @type {[number, string][]} */
  const cases = [[0, "0 min"], [0.1, "a few seconds"], [0.5, "30 s"], [0.97, "1 min"], [7.4, "7 min"], [59.6, "1 h"], [75, "1 h 15 min"], [800, "13 h"]];
  for (const [m, t] of cases) assert.equal(Q.dur(m), t, String(m));
  assert.equal(Q.span(0.1, 0.5), "under a minute");
  assert.equal(Q.span(0.3, 2.2), "up to 3 min");
  assert.equal(Q.span(6.3, 11.1), "6–12 min");
  assert.equal(Q.span(7, 7.2), "7–8 min");
  assert.equal(Q.span(62, 98), "1 h – 1 h 40 min");
  assert.equal(Q.speak("Likely 6–12 min"), "Likely 6 to 12 minutes");
  assert.equal(Q.speak("1 h 5 min"), "1 hour 5 minutes");
  assert.equal(Q.paceText(0.3), "20 s per person");
  assert.equal(Q.paceText(1.64), "1.6 min per person");
  assert.equal(Q.rateText(2.4), "2.4 people per minute");
  assert.equal(Q.rateText(0.2), "12 people per hour");
});

test("comparisons say what changed and the difference, without judging", () => {
  const k = Q.compare(Q.defaults(), { ...Q.defaults(), counters: 3 });
  assert.equal(k.changes, "3 counters instead of 2.");
  assert.match(k.diff, /^About \d+ min less waiting\.$/);
  const m = Q.compare(Q.defaults(), { ...Q.defaults(), people: 13, pace: "fast" });
  assert.equal(m.changes, "Queue B has 5 more people and faster service (1 min instead of 2 min per person).");
  assert.equal(Q.compare(Q.defaults(), Q.defaults()).changes, "Same as the first queue.");
  assert.equal(Q.compare(Q.defaults(), Q.defaults()).diff, "About the same wait.");
  assert.equal(Q.compare(Q.defaults(), { ...Q.defaults(), counters: 0 }).diff, "Queue B is not moving.");
  assert.equal(Q.compare({ ...Q.defaults(), people: 9 }, Q.defaults()).changes, "1 fewer person.");
  for (const x of [k, m]) assert.doesNotMatch(x.changes + x.diff, /\b(good|bad|optimal|best|worst)\b/i);
});

test("back-estimation finds the pace that reproduces the measured wait", () => {
  for (const [x, actual] of /** @type {[Parameters<typeof Q.backEstimate>[0], number][]} */ ([[Q.defaults(), 10], [{ people: 12, counters: 3 }, 9], [{ people: 3, counters: 1, structure: "separate" }, 4]])) {
    const b = Q.backEstimate(x, actual);
    assert.ok(b, JSON.stringify(x));
    assert.ok(Math.abs(est({ ...x, pace: "observed", custom: b.minutes }).mean - actual) < 1e-6, JSON.stringify(x));
    assert.equal(b.throughput, b.counters / b.minutes);
    assert.match(b.pace, /^Observed pace: about /);
  }
  assert.equal(Q.backEstimate(Q.defaults(), 10)?.rate.startsWith("Observed throughput: about "), true);
  assert.equal(Q.backEstimate({ counters: 0 }, 10), null);
  assert.equal(Q.backEstimate(Q.defaults(), 0), null);
  const o = Q.observed({ start: 0, taps: 3, end: 5 * 60000 }, 0, Q.defaults());
  assert.ok(o && o.minutes !== null);
  assert.equal(o.text, "3 people served in 5 min");
  assert.ok(Math.abs(o.minutes - 2 / 0.6) < 1e-9, "2 counters finishing 0.6 people a minute: about 3.3 min each");
  assert.equal(Q.observed({ start: 0, taps: 0, end: null }, 60000, Q.defaults())?.minutes, null);
  const sep = { ...Q.defaults(), counters: 3, structure: "separate", people: 4 }, watched = Q.observed({ start: 0, taps: 7.5 * 2, end: 10 * 60000 }, 0, sep);
  assert.ok(watched && watched.minutes !== null);
  assert.ok(Math.abs(watched.minutes - 2) < 1e-9, "taps at all 3 counters, 1.5 people a minute: 2 min each, not 0.67");
  assert.ok(Math.abs(est({ ...sep, pace: "custom", custom: watched.minutes }).mid - 8) < 3, "4 ahead in your own line at 2 min each: about 8 min");
});

test("timers come from timestamps, so a paused or backgrounded page keeps the right time", () => {
  const t0 = 1_700_000_000_000, t = Q.startTimer(t0);
  assert.equal(Q.elapsed(t, t0), 0);
  // No ticks happen while the phone is locked for 7 minutes 30 seconds.
  assert.equal(Q.elapsed(t, t0 + 450_000), 7.5);
  assert.equal(Q.clock(Q.elapsed(t, t0 + 450_000)), "7 min");
  assert.equal(Q.elapsed(Q.startTimer(t0, 5), t0), 5, "already waiting 5 min");
  assert.equal(Q.elapsed(t, t0 - 1000), 0, "a clock step backwards never shows negative time");
  assert.equal(Q.clock(0.4), "under a minute");
  assert.equal(Q.clock(125), "2 h 5 min");
  assert.equal(Q.elapsed(Q.startTimer(t0, 1e9), t0), 600, "bounded");
});

test("food orders compare elapsed with an expected range and never invent the kitchen", () => {
  assert.deepEqual(plain(Q.FOOD_PRESETS), [10, 15, 20, 30]);
  const g = Q.foodRange({ expected: "15" });
  assert.deepEqual([g.lo, g.hi, g.whatIf], [12, 20, null]);
  assert.deepEqual([Q.foodRange({ expected: "custom", custom: 22 }).lo, Q.foodRange({ expected: "custom", custom: 22 }).hi], [18, 29]);
  assert.equal(Q.foodRange({ expected: "custom", custom: "" }).f.minutes, 15);
  const w = Q.foodRange({ expected: "20", complexity: "complex", busy: "packed" });
  assert.ok(w.whatIf, "a what-if range");
  assert.equal(w.whatIf.text, "With a complex order and a packed counter");
  assert.ok(w.whatIf.lo > w.lo && w.whatIf.hi > w.hi);
  assert.equal(Q.foodStatus(5, g), "Before the expected range");
  assert.equal(Q.foodStatus(15, g), "Within the expected range");
  assert.equal(Q.foodStatus(24, g), "About 4 min past the expected range");
  assert.equal(Q.visible({ ahead: 7, done: 1, minutes: 5 }).rate, null, "one completion is not enough");
  const v = Q.visible({ ahead: 7, done: 3, minutes: 5 });
  assert.ok(v.rate !== null, "three completions give a rate");
  assert.ok(v.lo < v.mid && v.mid < v.hi && Math.abs(v.mid - 8 / 0.6) < 3);
  const more = Q.visible({ ahead: 7, done: 12, minutes: 20 });
  assert.ok(more.rate !== null);
  assert.ok(more.hi - more.lo < v.hi - v.lo, "watching more orders narrows the range");
  assert.equal(Q.watchedText(v), "3 orders done in 5 min, 7 orders ahead");
});

test("raw.json matches the engine", () => {
  const raw = JSON.parse(read("raw.json"));
  assert.deepEqual(raw.paces_minutes_per_person, plain(Q.PACES));
  assert.deepEqual(raw.food_presets_minutes, plain(Q.FOOD_PRESETS));
  assert.deepEqual(raw.limits, plain(Q.LIMITS));
  assert.deepEqual(raw.model, plain(Q.MODEL));
  assert.deepEqual(raw.initial.queue, plain(Q.defaults()));
  assert.deepEqual(raw.initial.food, plain(Q.foodDefaults()));
});

test("the page is one offline file with the metadata it promises", () => {
  assert.match(html, /<title>How long will this queue take\?<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/teoyujie\.org\/visuals\/queue-time">/);
  assert.match(html, /<meta property="og:url" content="https:\/\/teoyujie\.org\/visuals\/queue-time">/);
  assert.match(html, /<meta name="description" content="[^"]+">/);
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+rel="stylesheet"|@import|fetch\(|XMLHttpRequest|type="module"|serviceWorker/);
  assert.match(html, /prefers-reduced-motion/);
  assert.match(html, /prefers-color-scheme:dark/);
  assert.match(html, /<div id="nojs">[\s\S]*\(8 × 2\) ÷ 2 ≈ 8 minutes/, "worked example without JavaScript");
  assert.match(html, /<div id="app" hidden>/, "controls stay hidden without JavaScript");
});

const STATE = { mode: "queue", queue: Q.defaults(), compare: null, observed: false, qDone: null, food: Q.foodDefaults(), fDone: null };
const states = [
  STATE,
  { ...STATE, queue: { ...Q.defaults(), counters: 0 } },
  { ...STATE, queue: { ...Q.defaults(), people: 0, weights: [] } },
  { ...STATE, queue: { ...Q.defaults(), structure: "separate", weights: ["quick", "slow"] }, compare: { ...Q.defaults(), people: 14, counters: 3 } },
  { ...STATE, queue: { ...Q.defaults(), pace: "observed", custom: 2.3 }, compare: { ...Q.defaults(), people: 18 }, observed: true },
  { ...STATE, qDone: { scenario: Q.defaults(), offset: 0, kind: "wait", lo: 6.2, hi: 11.8, actual: 10.2 } },
  { ...STATE, mode: "food" },
  { ...STATE, mode: "food", food: { ...Q.foodDefaults(), complexity: "complex", busy: "packed", visible: true, ahead: 7, done: 3, minutes: 5 } },
  { ...STATE, mode: "food", fDone: { actual: 18.4, lo: 12, hi: 20 } },
];

test("every scenario's deck opens in beamdswitch as the standard narrated template", () => {
  assertTemplateCopy("queue-time");
  assertInlined(html, "beamdswitch", read("beamdswitch.js"), "queue-time");
  for (const st of states) {
    const md = T.deck(Q.report(st)), what = JSON.stringify(st).slice(0, 120);
    assertStandardDeck(md, what);
    if (st.mode === "queue" && st.queue.counters !== 0) assert.ok(md.includes(Q.headline(est(st.queue)).head), what);
  }
  assert.match(T.deck(Q.report(states[5])), /^## Estimated 6–12 min, actual 10 min$/m);
  assert.match(T.deck(Q.report(states[8])), /^## Expected 12–20 min, actual 18 min$/m);
});

test("the page boots, its WebMCP tools answer, and the deck buttons export the page as set", async () => {
  const page = await openPage("queue-time");
  const tools = page.run("QueueTimeTools");
  assert.deepEqual(plain(tools.map((/** @type {WebMcpTool} */ t) => t.name)), ["get_metadata", "get_current_state", "estimate_queue", "estimate_food_wait"]);
  for (const t of tools) assert.equal(t.annotations.readOnlyHint, true);
  const call = async (/** @type {string} */ name, args = {}) => JSON.parse((await tools.find((/** @type {WebMcpTool} */ t) => t.name === name).execute(args)).content[0].text);
  assert.equal((await call("get_current_state")).queue.head, Q.headline(est(Q.defaults())).head);
  assert.equal((await call("estimate_queue", { people: 8, counters: 0 })).head, "Queue is not moving");
  assert.equal((await call("estimate_queue", { people: 12, counters: 3, minutes_per_person: 1.5 })).scenario.minutes, 1.5);
  assert.deepEqual((await call("estimate_food_wait", { expected_minutes: 15, elapsed_minutes: 14 })).status, "Within the expected range");
  assert.equal((await call("get_metadata")).url, "https://teoyujie.org/visuals/queue-time");
  // Change the queue through the page's own input handler, then export.
  page.run(`document.getElementById("app").listeners.input[0]({ target: { type: "number", value: "12", dataset: { scn: "a", f: "people" } } })`);
  await assertButtonsExport(page, "queue-time", T.deck(Q.report({ ...STATE, queue: { ...Q.defaults(), people: 12 } })));
});
