// The benchmark table of step 7: a generated table of 50 columns, as CSV and as Parquet, written at test time and
// never committed. The same seed and row count give the same bytes on every machine.
//
//   id                    whole numbers 1, 2, 3 ...                       an identifier, never a measure
//   order_date, ship_date dates over 2023 to 2025; a ship date 0 to 14 days after its order date
//   note                  mostly distinct text                            labels
//   m01 ... m20           measures: normal, log-normal, uniform, exponential, counts, with 1% missing in m05 and
//                         -999 stand-ins in m09
//   c01 ... c26           categories: regions, ratings 1 to 5, yes or no, codes of 20 to 200 levels
//
// At 1,000,000 rows the CSV is about 250 MB, the size of the spec's desktop target.
//
//   node tools/bench_data.mjs csv OUT.csv [ROWS]        write the CSV
//   node tools/bench_data.mjs parquet IN.csv OUT.parquet  write the same table as Parquet, with typed columns
import { createWriteStream } from "node:fs";
import { createRequire } from "node:module";
import { once } from "node:events";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
/** @type {any} */ const Examples = require("../src/examples.js");

export const SEED = 20261006;
export const COLUMNS = 50;

const REGIONS = ["North", "South", "East", "West", "Central", "Islands"];
const SIZES = ["S", "M", "L", "XL"];
const WORDS = ["late", "early", "gift", "repeat", "bulk", "urgent", "return", "online", "store", "phone"];

/** The header: 50 names in column order. */
export function header() {
  const m = Array.from({ length: 20 }, (_, i) => `m${String(i + 1).padStart(2, "0")}`);
  const c = Array.from({ length: 26 }, (_, i) => `c${String(i + 1).padStart(2, "0")}`);
  return ["id", "order_date", "ship_date", "note", ...m, ...c];
}

/**
 * One row generator: call it with the row index for the row's fields, in header order.
 * @param {number} seed
 */
export function rows(seed = SEED) {
  const u = Examples.random(seed);
  const normal = () => Math.sqrt(-2 * Math.log(1 - u())) * Math.cos(2 * Math.PI * u());
  const start = Date.UTC(2023, 0, 1), days = 3 * 365;
  const pick = (list) => list[Math.floor(u() * list.length)];
  return (/** @type {number} */ i) => {
    const day = start + Math.floor(u() * days) * 86400000;
    const ship = day + Math.floor(u() * 15) * 86400000;
    const base = normal();
    const m = [
      (50 + 10 * base).toFixed(1),                       // m01 normal
      (20 + 5 * base + 3 * normal()).toFixed(1),         // m02 correlated with m01
      Math.exp(2 + 2.2 * normal()).toFixed(2),           // m03 log-normal over decades: a log axis
      (100 * u()).toFixed(2),                            // m04 uniform
      u() < 0.01 ? "" : (-Math.log(1 - u()) * 30).toFixed(1), // m05 exponential, 1% missing
      String(Math.round(5 + 3 * Math.abs(normal()) * 4)),  // m06 counts
      (1000 + 200 * normal()).toFixed(0),                // m07
      (0.5 + 0.1 * normal()).toFixed(3),                 // m08
      i % 997 === 3 ? "-999" : (15 + 4 * normal()).toFixed(1), // m09 with stand-ins
      (u() * u() * 500).toFixed(1),                      // m10 skewed
      (70 + 12 * normal()).toFixed(2),                   // m11
      (3 * base + 10 * u()).toFixed(2),                  // m12
      String(Math.floor(u() * 10000)),                   // m13 whole numbers
      (200 + 20 * normal()).toFixed(0),                  // m14
      (40 * u() + 2 * normal()).toFixed(2),              // m15
      Math.exp(1 + 0.4 * normal()).toFixed(2),           // m16
      (5 * normal()).toFixed(2),                         // m17 signed
      (60 + 15 * u()).toFixed(2),                        // m18
      (12 + 3 * normal()).toFixed(2),                    // m19
      (u() < 0.02 ? 300 + 50 * u() : 30 + 5 * normal()).toFixed(1), // m20 with a far cluster
    ];
    const c = [
      pick(REGIONS),                                     // c01 six regions
      u() < 0.5 ? "A" : "B",                             // c02
      String(Math.min(5, Math.max(1, Math.round(3 + normal())))), // c03 ratings
      u() < 0.7 ? "yes" : "no",                          // c04
      pick(SIZES),                                       // c05
      `kd${Math.floor(u() * 20)}`,                        // c06 20 levels
      `pt${Math.floor(u() * 50)}`,                        // c07 50 levels
      `q${Math.floor(u() * u() * 200)}`,                 // c08 200 levels, skewed
      String(1 + Math.floor(u() * 7)),                   // c09 weekdays as numbers
      u() < 0.1 ? "no" : "yes",                          // c10
      pick(["red", "green", "blue"]),                    // c11
      String(Math.floor(u() * 4)),                       // c12
      pick(WORDS),                                       // c13
      `g${Math.floor(u() * 12)}`,                        // c14 12 levels
      String(Math.min(10, Math.floor(-Math.log(1 - u()) * 2))), // c15 0 to 10
      u() < 0.33 ? "low" : u() < 0.5 ? "mid" : "high",    // c16
      `rg${Math.floor(u() * 30)}`,                        // c17
      String(2020 + Math.floor(u() * 6)),                // c18 six years as levels
      pick(["x", "y"]),                                  // c19
      `tp${Math.floor(u() * 8)}`,                         // c20
      String(Math.floor(u() * 3)),                       // c21
      pick(REGIONS.slice(0, 4)),                         // c22
      `st${Math.floor(u() * 100)}`,                       // c23 100 levels
      u() < 0.05 ? "rare" : "common",                    // c24
      String(1 + Math.floor(u() * 12)),                  // c25 months as numbers
      pick(["on", "off"]),                               // c26
    ];
    const note = `${pick(WORDS)} order ${(i * 7919 + Math.floor(u() * 7919)) % 1000003}`;
    return [String(i + 1), new Date(day).toISOString().slice(0, 10), new Date(ship).toISOString().slice(0, 10), note, ...m, ...c];
  };
}

/**
 * Write the CSV of `count` rows to `out`, a chunk of 10,000 rows at a time; returns its size in bytes.
 * @param {string} out @param {number} count @param {number} [seed]
 */
export async function writeCsv(out, count, seed = SEED) {
  const stream = createWriteStream(out);
  const row = rows(seed);
  let bytes = 0;
  const write = async (text) => {
    bytes += Buffer.byteLength(text);
    if (!stream.write(text)) await once(stream, "drain");
  };
  await write(`${header().join(",")}\n`);
  for (let i = 0; i < count; i += 10000) {
    const lines = [];
    for (let j = i; j < Math.min(count, i + 10000); j++) lines.push(row(j).join(","));
    await write(`${lines.join("\n")}\n`);
  }
  stream.end();
  await once(stream, "finish");
  return bytes;
}

/**
 * Write the same table as Parquet with typed columns (dates as DATE, numbers as numbers), through an engine left
 * open for writing (tests/engine.mjs with locked: false).
 * @param {{ query: (sql: string) => Promise<any[]> }} open @param {string} csv @param {string} out
 */
export async function writeParquet(open, csv, out) {
  const q = (/** @type {string} */ p) => `'${p.replace(/'/g, "''")}'`;
  await open.query(`COPY (SELECT * FROM read_csv(${q(csv)}, header = true, sample_size = -1)) TO ${q(out)} (FORMAT parquet, ROW_GROUP_SIZE 122880)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [kind, a, b] = process.argv.slice(2);
  if (kind === "csv") {
    const bytes = await writeCsv(a, Number(b ?? 1000000));
    console.log(JSON.stringify({ csv: a, bytes }));
  } else if (kind === "parquet") {
    const { engine } = await import("../tests/engine.mjs");
    await writeParquet(await engine({ locked: false }), a, b);
    console.log(JSON.stringify({ parquet: b }));
  } else {
    console.error("usage: node tools/bench_data.mjs csv OUT.csv [ROWS] | parquet IN.csv OUT.parquet");
    process.exit(2);
  }
}
