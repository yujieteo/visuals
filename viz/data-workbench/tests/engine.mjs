// The pinned engine in Node, for the folder's checks: the same DuckDB release, engine file, Parquet extension and
// Arrow bundle as the page (runtime_files.py node fetches them by SHA-256 into the ignored build/), started with
// the page's own lockdown (src/sql.js setup) and queried through the page's own plainRows.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
/** @type {typeof import("../src/sql.js")} */
const Sql = require("../src/sql.js");
/** @type {typeof import("../src/engine.js")} */
const Engine = require("../src/engine.js");

/** @type {{ blocking: string, wasm: string, home: string, repository: string } | null} */
let paths = null;

function layout() {
  if (!paths) {
    const script = fileURLToPath(new URL("../runtime_files.py", import.meta.url));
    paths = JSON.parse(execFileSync("python3", [script, "node"], { encoding: "utf8" }));
    // DuckDB's Node build looks for a cached extension under the home folder before it would fetch one.
    process.env.HOME = /** @type {any} */ (paths).home;
  }
  return /** @type {{ blocking: string, wasm: string, home: string, repository: string }} */ (paths);
}

/**
 * A fresh engine. locked: true runs the page's lockdown; false leaves it open, to write Parquet fixtures.
 * @param {{ locked?: boolean, memoryLimitBytes?: number }} [o]
 */
export async function engine(o = {}) {
  const p = layout();
  const duckdb = require(p.blocking);
  const bundle = { mainModule: p.wasm, mainWorker: "" };
  const db = await duckdb.createDuckDB({ mvp: bundle, eh: bundle }, new duckdb.VoidLogger(), duckdb.NODE_RUNTIME);
  await db.instantiate(() => {});
  const conn = db.connect();
  const setup = Sql.setup({ memoryLimitBytes: o.memoryLimitBytes ?? 2 ** 31, extensionRepository: p.repository });
  for (const statement of o.locked === false ? setup.slice(0, 4) : setup) conn.query(statement);
  let files = 0;
  return {
    db,
    /** @param {string} sql */
    query: async (sql) => Engine.plainRows(conn.query(sql)),
    /** @param {string} name @param {Uint8Array} bytes */
    register: (name, bytes) => {
      const path = Sql.filePath(++files, name);
      db.registerFileBuffer(path, bytes);
      return path;
    },
  };
}
