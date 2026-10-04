// Saved work: notebooks and their data files.
//
// The website version keeps them in IndexedDB (database "python-notebook", version 1), which holds large
// binary files; nothing goes into localStorage. A portable file keeps them in memory only, because storage
// under file:// is not reliable: there, Save HTML copy and Export .ipynb are the saves. Both stores have the
// same methods, so the page does not depend on which one it has.
//
// A database that a newer version of this page wrote is never read or changed: open() fails with a reason,
// and the page offers only its export controls. There is no migration yet (schema 1 is the first).
(function (root, factory) {
  const node = typeof module === "object" && module.exports;
  const api = factory();
  if (node) module.exports = api;
  else (root.PyNb = root.PyNb || {}).store = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const SCHEMA = 1;
  const NAME = "python-notebook";

  /** @typedef {{schema: number, id: string, name: string, created: number, updated: number, notebook: object}} NotebookRecord */
  /** @typedef {{notebook: string, path: string, blob: Blob, bytes: number, sha256: string, include: boolean, added: number}} FileRecord */

  /** A message for a failed storage operation that says what to do. @param {any} error */
  function reason(error) {
    const name = error && error.name;
    if (name === "QuotaExceededError") return "the browser storage is full";
    if (name === "VersionError") return "a newer version of this page saved this data; this page does not read or change it";
    if (name === "InvalidStateError" || name === "SecurityError") return "the browser does not allow storage here (for example, a private window)";
    return String(error && error.message || error || "unknown error");
  }

  /** @param {IDBRequest | IDBTransaction} request */
  const done = (request) => new Promise((resolve, reject) => {
    if ("oncomplete" in request) {
      request.oncomplete = () => resolve(undefined);
      request.onabort = request.onerror = () => reject(request.error || new Error("transaction aborted"));
    } else {
      request.onsuccess = () => resolve(/** @type {IDBRequest} */ (request).result);
      request.onerror = () => reject(request.error);
    }
  });

  class DatabaseStore {
    constructor() {
      this.kind = "browser";
      /** @type {IDBDatabase | null} */
      this.db = null;
    }

    async open() {
      if (typeof indexedDB === "undefined") throw new Error("this browser has no IndexedDB");
      const request = indexedDB.open(NAME, SCHEMA);
      request.onupgradeneeded = (event) => {
        const db = request.result;
        if (event.oldVersion === 0) {
          db.createObjectStore("notebooks", { keyPath: "id" });
          db.createObjectStore("files", { keyPath: ["notebook", "path"] }).createIndex("notebook", "notebook");
          db.createObjectStore("meta", { keyPath: "key" });
        }
      };
      this.db = await done(request);
      this.db.onversionchange = () => this.db && this.db.close();
    }

    /** @param {string[]} stores @param {IDBTransactionMode} mode @param {(tx: IDBTransaction) => any} body */
    async tx(stores, mode, body) {
      if (!this.db) throw new Error("storage is not open");
      const tx = this.db.transaction(stores, mode);
      const result = body(tx);
      await done(tx);
      return result instanceof IDBRequest ? result.result : result;
    }

    /** @returns {Promise<{id: string, name: string, updated: number}[]>} */
    async list() {
      const all = await this.tx(["notebooks"], "readonly", (tx) => tx.objectStore("notebooks").getAll());
      return all.map(({ id, name, updated }) => ({ id, name, updated })).sort((a, b) => b.updated - a.updated);
    }

    /** @param {string} id @returns {Promise<NotebookRecord | undefined>} */
    get(id) { return this.tx(["notebooks"], "readonly", (tx) => tx.objectStore("notebooks").get(id)); }

    /** @param {NotebookRecord} record */
    put(record) { return this.tx(["notebooks"], "readwrite", (tx) => { tx.objectStore("notebooks").put(record); }); }

    /** A notebook and all its data files. @param {string} id */
    remove(id) {
      return this.tx(["notebooks", "files"], "readwrite", (tx) => {
        tx.objectStore("notebooks").delete(id);
        tx.objectStore("files").delete(IDBKeyRange.bound([id, ""], [id, "￿"]));
      });
    }

    /** @param {string} notebook @returns {Promise<FileRecord[]>} */
    async files(notebook) {
      const all = await this.tx(["files"], "readonly", (tx) => tx.objectStore("files").index("notebook").getAll(notebook));
      return all.sort((a, b) => a.path.localeCompare(b.path));
    }

    /** @param {FileRecord} file */
    putFile(file) { return this.tx(["files"], "readwrite", (tx) => { tx.objectStore("files").put(file); }); }

    /** @param {string} notebook @param {string} path */
    removeFile(notebook, path) { return this.tx(["files"], "readwrite", (tx) => { tx.objectStore("files").delete([notebook, path]); }); }

    /** @param {string} key */
    async meta(key) {
      const row = await this.tx(["meta"], "readonly", (tx) => tx.objectStore("meta").get(key));
      return row ? row.value : undefined;
    }

    /** @param {string} key @param {any} value */
    setMeta(key, value) { return this.tx(["meta"], "readwrite", (tx) => { tx.objectStore("meta").put({ key, value }); }); }
  }

  /** The same methods, in memory: a portable file's notebooks live until the tab closes. */
  class MemoryStore {
    constructor() {
      this.kind = "memory";
      /** @type {Map<string, NotebookRecord>} */
      this.notebooks = new Map();
      /** @type {Map<string, FileRecord>} */
      this.fileMap = new Map();
      this.metaMap = new Map();
    }

    async open() {}
    async list() { return [...this.notebooks.values()].map(({ id, name, updated }) => ({ id, name, updated })).sort((a, b) => b.updated - a.updated); }
    async get(id) { const record = this.notebooks.get(id); return record && structuredClone(record); }
    async put(record) { this.notebooks.set(record.id, structuredClone(record)); }
    async remove(id) {
      this.notebooks.delete(id);
      for (const [key, file] of this.fileMap) if (file.notebook === id) this.fileMap.delete(key);
    }
    async files(notebook) { return [...this.fileMap.values()].filter((f) => f.notebook === notebook).sort((a, b) => a.path.localeCompare(b.path)); }
    async putFile(file) { this.fileMap.set(JSON.stringify([file.notebook, file.path]), { ...file }); }
    async removeFile(notebook, path) { this.fileMap.delete(JSON.stringify([notebook, path])); }
    async meta(key) { return this.metaMap.get(key); }
    async setMeta(key, value) { this.metaMap.set(key, value); }
  }

  return { SCHEMA, DatabaseStore, MemoryStore, reason };
});
