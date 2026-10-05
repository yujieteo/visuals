/* Universal Data Workbench: the DuckDB engine in a Web Worker, and its answers as plain rows.
 *
 * start() runs the pinned DuckDB-WASM worker and engine from runtime/ beside the page (downloads.json), loads the
 * Parquet extension from the same folder, then locks the engine (src/sql.js setup): no extension, URL or file
 * outside the registered files can be read after that, and the configuration cannot change. Files are registered
 * as browser File handles, so DuckDB reads them on this device and they never leave it.
 *
 * Every query goes through send(), so Cancel can stop the one that is running; the connection stays usable.
 * plainRows() turns DuckDB's Arrow answers into plain objects, here and in the Node checks.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./sql.js"));
  else root.DWEngine = factory(root.DWSql);
})(typeof self !== "undefined" ? self : this, function (Sql) {
  "use strict";

  /** One Arrow value as a plain value: 64-bit integers as numbers (as text beyond 2^53), other objects as text. */
  function plain(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === "bigint") return Number.isSafeInteger(Number(v)) ? Number(v) : String(v);
    if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") return v;
    return String(v);
  }

  /** The rows of an Arrow table or record batch as plain objects keyed by column name. */
  function plainRows(t) {
    const names = t.schema.fields.map((f) => f.name);
    return t.toArray().map((row) => {
      /** @type {Record<string, any>} */
      const out = {};
      for (const name of names) out[name] = plain(row[name]);
      return out;
    });
  }

  /**
   * Start the engine. The URLs name the worker, the engine file and the extension folder beside the page.
   * @param {{ workerUrl: string, wasmUrl: string, extensionRepository: string, memoryLimitBytes: number }} o
   */
  async function start(o) {
    const duck = /** @type {any} */ (globalThis).duckdb;
    const worker = new Worker(o.workerUrl);
    const db = new duck.AsyncDuckDB(new duck.VoidLogger(), worker);
    await db.instantiate(o.wasmUrl, null);
    await db.open({});
    const conn = await db.connect();
    for (const statement of Sql.setup({ memoryLimitBytes: o.memoryLimitBytes, extensionRepository: o.extensionRepository })) await conn.query(statement);
    const version = await db.getVersion();
    let files = 0, running = false;

    /** Run one statement and return its rows. @param {string} sql */
    async function query(sql) {
      running = true;
      try {
        const reader = await conn.send(sql, true);
        const rows = [];
        for await (const batch of reader) rows.push(...plainRows(batch));
        return rows;
      } finally {
        running = false;
      }
    }

    return {
      version,
      query,
      /** Stop the statement that is running, if any; it then fails with DuckDB's "canceled" error. */
      cancel: async () => (running ? conn.cancelSent() : false),
      /** Register a File for reading and return its engine path. @param {File} file */
      async register(file) {
        const path = Sql.filePath(++files, file.name);
        await db.registerFileHandle(path, file, duck.DuckDBDataProtocol.BROWSER_FILEREADER, true);
        return path;
      },
      /** Register bytes (a built-in example) and return the engine path. @param {string} name @param {Uint8Array} bytes */
      async registerBytes(name, bytes) {
        const path = Sql.filePath(++files, name);
        await db.registerFileBuffer(path, bytes);
        return path;
      },
    };
  }

  /** Whether an error is the engine's answer to Cancel. */
  const cancelled = (error) => /cancel/i.test(String(error?.message ?? error));
  /** Whether an error is the engine running out of its memory budget. */
  const outOfMemory = (error) => /out of memory|memory limit|could not allocate|failed to allocate/i.test(String(error?.message ?? error));

  return { plain, plainRows, start, cancelled, outOfMemory };
});
