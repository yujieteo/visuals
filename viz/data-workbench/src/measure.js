/* Universal Data Workbench: "Measure this device" (step 7).
 *
 * run() measures what this device can do with the page's own pipeline: tables of the planted example
 * (src/examples.js, 15 columns, seed 20261006) of 10,000, 100,000, 250,000, 500,000 and 1,000,000 rows, one after
 * another. Each rung is checked against the memory budget first, as an import is (src/preflight.js), then read,
 * profiled, given its typed copy, every chart of grammar v1 drawn and its statistics run; each phase is timed, and
 * the rung's tables are dropped before the next. The ladder stops at the first rung that does not fit the budget,
 * reaches the memory limit, fails, or takes longer than the 2-minute target, or when the person cancels; the result
 * says which, and the largest table this device completed.
 *
 * Nothing the person imported is read or changed: the rungs are tables of their own, and the page runs the
 * measurement only when no table is imported, so the whole budget is the measurement's. The result holds the device
 * as the browser reports it and no data. The page shows it, copies it as Markdown and saves it as JSON; a result
 * sent from a real phone becomes the real-phone row of the published limits (limits.json).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./examples.js"), require("./preflight.js"), require("./profile.js"), require("./charts.js"), require("./chartspec.js"),
      require("./family.js"));
  } else root.DWMeasure = factory(root.DWExamples, root.DWPreflight, root.DWProfile, root.DWCharts, root.DWChartSpec, root.DWFamily);
})(typeof self !== "undefined" ? self : this, function (Examples, Preflight, Profile, Charts, ChartSpec, Family) {
  "use strict";

  const VERSION = 1;
  const SEED = 20261006;
  const LADDER = [10000, 100000, 250000, 500000, 1000000];
  const TARGET_MS = 120000;
  const COLUMNS = 15;

  const ms = (a, b) => Math.round(b - a);

  /**
   * One rung: a planted table of `rows` rows through the whole pipeline. Returns its record; status is "done",
   * "refused" (does not fit the budget), "limit" (the memory limit), "cancelled" or "failed".
   * @param {{ query: (sql: string) => Promise<any[]>, register: (name: string, bytes: Uint8Array) => Promise<string> | string }} api
   * @param {number} rows @param {{ budget: number, n: number, stopped?: () => boolean, cancelled?: (e: any) => boolean, outOfMemory?: (e: any) => boolean,
   *   progress?: (text: string, done: number, total: number) => void, now?: () => number }} o
   */
  async function rung(api, rows, o) {
    const now = o.now ?? (() => performance.now());
    const say = o.progress ?? (() => {});
    const text = Examples.planted(SEED, rows);
    const bytes = new TextEncoder().encode(text);
    const estimate = Preflight.estimate("csv", bytes.length);
    const fit = Preflight.decide({ estimate, rows, columns: COLUMNS, budget: o.budget, used: 0 });
    const out = { rows, columns: COLUMNS, bytes: bytes.length, estimate: Math.round(estimate), status: "done", reason: "",
      readMs: null, profileMs: null, copyMs: null, firstMs: null, chartsMs: null, statsMs: null, allMs: null, candidates: 0, valid: 0, tests: 0 };
    if (!fit.fits) {
      return { ...out, status: "refused", reason: `does not fit the budget: its estimate, ${Preflight.bytes(estimate)}, is more than the ${Preflight.bytes(fit.left)} the budget leaves for tables, so an import would offer a sample or fewer columns` };
    }
    // A name a chart specification accepts (lower-case first); the page runs the measurement only with no table imported.
    const table = `dw_measure_${o.n}`, stage = `__dw_stage_measure_${o.n}`;
    const begun = now();
    try {
      say(`Measuring ${rows.toLocaleString("en-US")} rows: reading`, 0, 5);
      const path = await api.register(`measure-${rows}.csv`, bytes);
      const imported = await Profile.importFile(api.query, { kind: "csv", path, table, n: o.n, stopped: o.stopped });
      const read = now();
      out.readMs = ms(begun, read);
      const all = imported.columns.map((c, i) => ({ ...c, position: i })).filter((c) => c.name !== imported.rowColumn);
      const columns = [];
      for (const c of all) {
        if (o.stopped?.()) throw new Error("cancelled");
        say(`Measuring ${rows.toLocaleString("en-US")} rows: profiling column ${columns.length + 1} of ${all.length}`, 1, 5);
        columns.push(await Profile.profileColumn(api.query, { table, rowColumn: imported.rowColumn, column: { ...c, position: columns.length } }));
      }
      Profile.pairRoles(columns);
      const profiled = now();
      out.profileMs = ms(read, profiled);
      const { classes, plan, ctx } = Charts.prepare({ name: table, rowColumn: imported.rowColumn, rows: imported.rows, sample: null, columns });
      const copy = Charts.stagePlan(ctx, stage);
      say(`Measuring ${rows.toLocaleString("en-US")} rows: the typed copy`, 2, 5);
      if (copy) {
        await api.query(copy.sql);
        ctx.stage = copy.stage;
      }
      const copied = now();
      out.copyMs = ms(profiled, copied);
      out.candidates = plan.total;
      for (const [i, c] of plan.candidates.entries()) {
        if (o.stopped?.()) throw new Error("cancelled");
        if (i % 10 === 0) say(`Measuring ${rows.toLocaleString("en-US")} rows: chart ${i + 1} of ${plan.total}`, 3, 5);
        const r = await Charts.evaluate(api.query, ChartSpec.make(c, ctx), ctx);
        if (r.outcome === "valid") {
          out.valid += 1;
          if (out.firstMs === null) out.firstMs = ms(begun, now());
        }
      }
      const charted = now();
      out.chartsMs = ms(copied, charted);
      say(`Measuring ${rows.toLocaleString("en-US")} rows: statistics`, 4, 5);
      const fam = await Family.run(api.query, { table, name: table, run: 1, ctx, classes, columns, stopped: o.stopped });
      if (fam.status !== "complete") throw new Error(o.stopped?.() ? "cancelled" : `the statistics stopped: ${fam.reason}`);
      out.tests = fam.m;
      out.statsMs = ms(charted, now());
      out.allMs = ms(begun, now());
    } catch (error) {
      if (o.stopped?.() || o.cancelled?.(error)) Object.assign(out, { status: "cancelled", reason: "you cancelled" });
      else if (o.outOfMemory?.(error)) Object.assign(out, { status: "limit", reason: `the engine reached its ${Preflight.bytes(o.budget)} memory budget` });
      else Object.assign(out, { status: "failed", reason: String(error?.message ?? error).split("\n")[0].slice(0, 200) });
      out.allMs = ms(begun, now());
    } finally {
      for (const t of [stage, table]) await api.query(`DROP TABLE IF EXISTS "${t}"`).catch(() => {});
    }
    return out;
  }

  /**
   * The ladder: every rung of `ladder` until one does not complete, takes longer than the 2-minute target, or the
   * person cancels. Returns the result record.
   * @param {Parameters<typeof rung>[0]} api
   * @param {Parameters<typeof rung>[2] & { device: Record<string, any>, engine: Record<string, any>, ladder?: number[], date?: string }} o
   */
  async function run(api, o) {
    const rungs = [];
    let stopped = "";
    for (const [i, rows] of (o.ladder ?? LADDER).entries()) {
      if (o.stopped?.()) { stopped = "you cancelled"; break; }
      const r = await rung(api, rows, { ...o, n: i + 1 });
      rungs.push(r);
      if (r.status !== "done") { stopped = `${rows.toLocaleString("en-US")} rows: ${r.reason}`; break; }
      if (r.allMs > TARGET_MS) { stopped = `${rows.toLocaleString("en-US")} rows took ${(r.allMs / 1000).toFixed(0)} s, longer than the 2-minute target, so larger tables were not tried`; break; }
    }
    const done = rungs.filter((r) => r.status === "done");
    const ladder = o.ladder ?? LADDER;
    if (!stopped && done.length === ladder.length) stopped = "every rung completed";
    return { version: VERSION, measured: o.date ?? new Date().toISOString(), table: `the planted example, ${COLUMNS} columns, seed ${SEED}`, device: o.device, engine: o.engine,
      budget: o.budget, rungs, largest: done.length ? done[done.length - 1].rows : 0, stopped };
  }

  const secs = (v) => (v === null || v === undefined ? "–" : `${(v / 1000).toFixed(1)} s`);

  /** The result as Markdown, to copy and send. */
  function markdown(r) {
    const d = r.device ?? {};
    const lines = [
      `## Measure this device: ${r.measured.slice(0, 10)}`, "",
      `- Device: ${d.label ?? "unknown"}; ${d.kind ?? "?"} class; memory budget ${Preflight.bytes(r.budget)}${d.deviceMemoryGiB ? `; the browser reports ${d.deviceMemoryGiB} GiB` : ""}${d.cores ? `; ${d.cores} cores` : ""}`,
      `- Browser: ${d.userAgent ?? "unknown"}`,
      `- Engine: DuckDB ${r.engine?.duckdb ?? "?"} (DuckDB-WASM ${r.engine?.duckdbWasm ?? "?"}), one thread`,
      `- Table: ${r.table}`,
      `- Largest table completed: ${r.largest ? `${r.largest.toLocaleString("en-US")} rows` : "none"}; stopped: ${r.stopped}`, "",
      "| Rows | CSV | Status | Read | Profile | Typed copy | First figure | Charts | Statistics | All |",
      "| ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
      ...r.rungs.map((x) => `| ${x.rows.toLocaleString("en-US")} | ${Preflight.bytes(x.bytes)} | ${x.status}${x.reason && x.status !== "done" ? `: ${x.reason}` : ""} | ${secs(x.readMs)} | ${secs(x.profileMs)} | ${secs(x.copyMs)} | ${secs(x.firstMs)} | ${secs(x.chartsMs)}${x.candidates ? ` (${x.valid} of ${x.candidates})` : ""} | ${secs(x.statsMs)} | ${secs(x.allMs)} |`),
      "", "```json", JSON.stringify(r), "```", "",
    ];
    return lines.join("\n");
  }

  return { VERSION, SEED, LADDER, TARGET_MS, COLUMNS, rung, run, markdown, secs };
});
