// Step 7, "Measure this device" (src/measure.js) with the pinned engine: the ladder through the page's own pipeline,
// its stops (a rung that does not fit the budget, the memory limit, Cancel), that it leaves no table behind, and the
// Markdown the page copies.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { engine } from "./engine.mjs";

const require = createRequire(import.meta.url);
/** @type {any} */ const Measure = require("../src/measure.js");
/** @type {any} */ const Engine = require("../src/engine.js");

const device = { label: "Node checks", kind: "desktop", userAgent: `Node ${process.version}` };
const engineInfo = { duckdb: "v1.5.4", duckdbWasm: "1.33.1-dev57.0" };

/** @param {any} e */
const api = (e) => ({ query: e.query, register: e.register });
/** @param {any} e */
const tables = async (e) => (await e.query("SELECT table_name FROM duckdb_tables()")).map((r) => r.table_name);

test("the ladder: each rung read, profiled, copied, charted and tested, and timed; no table left behind", async () => {
  const e = await engine();
  const r = await Measure.run(api(e), { budget: 2 ** 31, device, engine: engineInfo, ladder: [2000, 5000], date: "2026-10-06T00:00:00.000Z", cancelled: Engine.cancelled, outOfMemory: Engine.outOfMemory });
  assert.equal(r.stopped, "every rung completed");
  assert.equal(r.largest, 5000);
  for (const x of r.rungs) {
    assert.equal(x.status, "done", x.reason);
    assert.equal(x.candidates, 155, "every candidate of the planted example");
    assert.equal(x.valid, 155);
    assert.ok(x.tests > 0, "the statistics ran");
    for (const k of ["readMs", "profileMs", "copyMs", "firstMs", "chartsMs", "statsMs", "allMs"]) assert.ok(Number.isFinite(x[k]) && x[k] >= 0, `${k}: ${x[k]}`);
    assert.ok(x.firstMs <= x.allMs);
  }
  assert.deepEqual(await tables(e), [], "the rungs' tables and typed copies are dropped");
  const md = Measure.markdown(r);
  assert.match(md, /Largest table completed: 5,000 rows; stopped: every rung completed/);
  assert.match(md, /\| 2,000 \| .* \| done \|/);
  assert.deepEqual(JSON.parse(/```json\n(.*)\n```/.exec(md)?.[1] ?? "null"), r, "the Markdown carries the whole result as JSON");
});

test("the ladder stops at the first rung that does not fit the budget, before reading it", async () => {
  const e = await engine();
  // 2,000 rows (about 230 KB of CSV) fit a 4 MiB budget's 2 MiB for tables; 50,000 rows do not.
  const r = await Measure.run(api(e), { budget: 4 * 2 ** 20, device, engine: engineInfo, ladder: [2000, 50000, 100000] });
  assert.deepEqual(r.rungs.map((/** @type {any} */ x) => x.status), ["done", "refused"]);
  assert.equal(r.largest, 2000);
  assert.match(r.stopped, /^50,000 rows: does not fit the budget: its estimate, .* is more than the 2\.0 MiB the budget leaves for tables/);
  assert.equal(r.rungs[1].readMs, null, "a refused rung is never read");
});

test("the memory limit and Cancel each stop the ladder with the reason, keeping the rungs done", async () => {
  const small = await engine({ memoryLimitBytes: 48 * 2 ** 20 });
  // The budget the page would use lets the rung in, and the engine's own limit stops it: as on a device whose memory
  // runs out before the budget's estimate says.
  const limited = await Measure.run(api(small), { budget: 2 ** 31, device, engine: engineInfo, ladder: [2000, 400000], cancelled: Engine.cancelled, outOfMemory: Engine.outOfMemory });
  assert.deepEqual(limited.rungs.map((/** @type {any} */ x) => x.status), ["done", "limit"], JSON.stringify(limited.rungs.map((/** @type {any} */ x) => x.reason)));
  assert.equal(limited.largest, 2000);
  assert.deepEqual(await tables(small), [], "nothing of the stopped rung is kept");
  const e = await engine();
  let calls = 0;
  const cancelled = await Measure.run(api(e), { budget: 2 ** 31, device, engine: engineInfo, ladder: [2000, 5000], stopped: () => ++calls > 40 });
  assert.equal(cancelled.rungs.at(-1).status, "cancelled");
  assert.match(cancelled.stopped, /you cancelled/);
  assert.deepEqual(await tables(e), []);
});

test("the published limits (limits.json) state for each entry its device, browser, how it was run, the table, the times and the memory budget", async () => {
  const { readFileSync } = await import("node:fs");
  const limits = JSON.parse(readFileSync(new URL("../limits.json", import.meta.url), "utf8"));
  assert.ok(limits.benchmark.length >= 2, "the desktop benchmark, at least in Node and in a browser");
  for (const b of limits.benchmark) {
    for (const k of ["where", "device", "browser", "file", "measured"]) assert.ok(typeof b[k] === "string" && b[k].length > 0, `benchmark ${b.where}: ${k}`);
    assert.equal(b.rows, 1000000, "1,000,000 rows");
    assert.equal(b.columns, 50, "50 columns");
    assert.ok(b.bytes > 0 && Number.isFinite(b.budget), `${b.where}: the file's size and the memory budget`);
    assert.ok(Number.isFinite(b.firstMs) && Number.isFinite(b.allMs) && b.firstMs <= b.allMs, `${b.where}: the first figure and all, in order`);
    assert.match(b.measured, /^\d{4}-\d{2}-\d{2}/);
  }
  const how = new Set(limits.devices.map((/** @type {any} */ d) => d.how));
  assert.ok(how.has("measured") && how.has("emulated") && how.has("pending"), "measured devices, emulated phones labelled so, and the real phone still to come");
  for (const d of limits.devices) {
    assert.ok(d.device && d.browser && d.stopped, `${d.id}: its device, browser and why it stopped`);
    if (d.how === "pending") continue;
    assert.ok(Number.isFinite(d.budget) && Number.isFinite(d.largest) && Number.isFinite(d.largestMs), `${d.id}: budget, largest table and its time`);
    assert.match(d.measured, /^\d{4}-\d{2}-\d{2}/);
    assert.ok(d.rungs.length > 0 && d.rungs.every((/** @type {any} */ r) => r.rows > 0 && r.bytes > 0 && r.status), `${d.id}: every rung's size and status`);
    assert.equal(d.rungs.filter((/** @type {any} */ r) => r.status === "done").at(-1)?.rows ?? 0, d.largest, `${d.id}: the largest table is the last rung done`);
  }
  for (const d of limits.devices.filter((/** @type {any} */ x) => x.how === "emulated")) assert.match(d.device, /emulated/i, `${d.id}: says it is emulated`);
});
