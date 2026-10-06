/* Universal Data Workbench: the resource policy, checked before a file is imported.
 *
 * The engine's memory budget depends on the device: 2 GiB on a desktop, 512 MiB on a phone (step 7 measured
 * emulated phones, which cannot show a real phone's memory; a real phone's measurement may change it), 1 GiB on any
 * other device; where the browser reports its memory (navigator.deviceMemory),
 * at most a quarter of it. The person can choose a smaller budget before the engine starts.
 *
 * A file's estimate is what DuckDB was measured to hold for it (tests/engine.test.mjs, "memory estimate"): a CSV,
 * read as text, takes about 2.3 times its size, so the estimate is 2.5 times; a Parquet file takes about 4 times its
 * size before compression, so the estimate is 16 bytes for each value (rows times columns, with the row column)
 * plus that size. Imported tables may fill at most half the budget (STORAGE_SHARE); the other half is room for
 * the queries that profile them. A file whose estimate does not fit in what is left is never truncated quietly: the
 * page says so before the import and offers a seeded sample of rows that fits, fewer columns, or skipping it.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DWPreflight = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const MiB = 2 ** 20, GiB = 2 ** 30;
  const CSV_FACTOR = 2.5;
  const VALUE_BYTES = 16;
  const STORAGE_SHARE = 0.5;
  const BUDGETS = { desktop: 2 * GiB, phone: 512 * MiB, other: 1 * GiB };
  const CHOICES = [256 * MiB, 512 * MiB, 1 * GiB, 2 * GiB];
  const SAMPLE_SEED = 20261005;
  const MIN_SAMPLE = 1000;

  /**
   * The device class and its budget.
   * @param {{ coarsePointer: boolean, screenMax: number, deviceMemoryGiB?: number | null }} d
   */
  function device(d) {
    const kind = !d.coarsePointer ? "desktop" : d.screenMax < 1100 ? "phone" : "other";
    let budget = BUDGETS[kind];
    const basis = [kind === "desktop" ? "a desktop" : kind === "phone" ? "a phone, until a real phone is measured" : "a device of unknown class"];
    if (d.deviceMemoryGiB && d.deviceMemoryGiB > 0 && d.deviceMemoryGiB * GiB / 4 < budget) {
      budget = d.deviceMemoryGiB * GiB / 4;
      basis.push(`a quarter of the ${d.deviceMemoryGiB} GiB this browser reports`);
    }
    return { kind, budget, basis: basis.join("; ") };
  }

  /**
   * The memory a file is expected to take once imported: a CSV from its size, a Parquet file from its rows, its
   * columns and its size before compression.
   * @param {"csv" | "parquet"} kind @param {number} bytes @param {number} [rows] @param {number} [columns]
   */
  const estimate = (kind, bytes, rows = 0, columns = 0) => (kind === "csv" ? bytes * CSV_FACTOR : VALUE_BYTES * rows * (columns + 1) + bytes);

  /** Rows in a CSV of `bytes`, from the line count of its first `sampleBytes`. */
  function csvRows(bytes, sampleBytes, sampleLines) {
    if (sampleBytes <= 0 || sampleLines <= 0) return 0;
    if (sampleBytes >= bytes) return Math.max(0, sampleLines - 1);
    return Math.max(1, Math.round((bytes / sampleBytes) * sampleLines) - 1);
  }

  /**
   * Whether a file fits what the budget leaves for tables (half of it, less what is imported already), and the
   * options when it does not: a seeded sample of rows sized to fit (with a 10% margin) and the share of columns
   * that would fit.
   * @param {{ estimate: number, rows: number, columns: number, budget: number, used: number }} o
   */
  function decide(o) {
    const left = Math.max(0, o.budget * STORAGE_SHARE - o.used);
    if (o.estimate <= left) return { fits: true, left };
    const share = left / o.estimate;
    const sampleRows = Math.floor(o.rows * share * 0.9);
    const columns = Math.floor(o.columns * share * 0.9);
    return {
      fits: false, left,
      sample: sampleRows >= MIN_SAMPLE ? { rows: sampleRows, seed: SAMPLE_SEED } : null,
      maxColumns: columns >= 1 ? columns : 0,
    };
  }

  /**
   * A queued file's choice checked again just before its import, against what the tables imported since left: a
   * sample shrinks to fit; a choice that no longer fits waits for a new one, with the reason.
   * @param {{ choice: string, estimate: number, rows: number, columns: number, kept: number, sample?: { rows: number, seed: number } | null }} q
   * @param {number} budget @param {number} used
   */
  function recheck(q, budget, used) {
    const d = decide({ estimate: q.estimate, rows: q.rows, columns: q.columns, budget, used });
    const wait = (problem) => ({ ok: false, decision: d, problem });
    if (q.choice === "full" && !d.fits) return wait("Not imported: the tables imported before it used the room it needed. Choose a sample, fewer columns or skip.");
    if (q.choice === "sample" && !d.fits) {
      if (!d.sample) return wait("Not imported: no sample of this file fits what the budget has left.");
      return { ok: true, decision: { sample: q.sample && q.sample.rows <= d.sample.rows ? q.sample : d.sample }, problem: "" };
    }
    if (q.choice === "columns" && withColumns(q.estimate, q.kept, q.columns) > d.left) {
      return wait(`Not imported: ${q.kept} column${q.kept === 1 ? "" : "s"} no longer fit what the budget has left. Keep fewer, take a sample or skip.`);
    }
    return { ok: true, decision: {}, problem: "" };
  }

  /**
   * The choices after an import ran out of memory: the estimate proved too low, so it doubles, and is at least
   * 10% more than the room that was left, so the file never shows as fitting again.
   * @param {{ estimate: number, rows: number, columns: number }} q @param {number} budget @param {number} used
   */
  function afterOutOfMemory(q, budget, used) {
    const left = Math.max(0, budget * STORAGE_SHARE - used);
    const estimate = Math.max(2 * q.estimate, 1.1 * left);
    return { estimate, decision: decide({ estimate, rows: q.rows, columns: q.columns, budget, used }) };
  }

  /** The estimate of a file read with only some of its columns: proportional to the number of columns kept. */
  const withColumns = (estimateBytes, kept, total) => (total > 0 ? estimateBytes * (kept / total) : estimateBytes);

  /** Bytes as KB, MB or GB (binary units, the way the budget is set). */
  function bytes(n) {
    if (!Number.isFinite(n)) return "unknown";
    if (n >= GiB) return `${(n / GiB).toFixed(n >= 10 * GiB ? 0 : 1)} GiB`;
    if (n >= MiB) return `${(n / MiB).toFixed(n >= 10 * MiB ? 0 : 1)} MiB`;
    if (n >= 1024) return `${Math.round(n / 1024)} KiB`;
    return `${n} B`;
  }

  return { MiB, GiB, CSV_FACTOR, VALUE_BYTES, STORAGE_SHARE, BUDGETS, CHOICES, SAMPLE_SEED, MIN_SAMPLE, device, estimate, csvRows, decide, recheck, afterOutOfMemory, withColumns, bytes };
});
