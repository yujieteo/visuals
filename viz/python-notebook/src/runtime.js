// The Python runtime on the page side: the pinned file list, its bytes (embedded in a portable file, or fetched
// from runtime/ on the website), and one Python session per PyScript worker.
//
// Every file is checked against its byte count and SHA-256 from downloads.json before Python sees it. A session
// talks to kernel.py through a MessagePort; Stop and Restart terminate the worker, and a terminated session's
// messages are dropped.
(function (root, factory) {
  const node = typeof module === "object" && module.exports;
  const api = factory();
  if (node) module.exports = api;
  else (root.PyNb = root.PyNb || {}).runtime = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /** @typedef {{path: string, url: string, sha256: string, bytes: number, kind: string, name?: string, version?: string, license: string, required?: boolean, lock?: object}} RuntimeFile */

  const hex = (buffer) => Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
  const sha256 = async (bytes) => hex(await crypto.subtle.digest("SHA-256", bytes));
  const fileName = (path) => path.slice(path.lastIndexOf("/") + 1);

  /** The Pyodide lock file of the pinned wheels, with nothing else in it. @param {{lock_info: object, downloads: RuntimeFile[]}} manifest */
  function lockText(manifest) {
    const packages = {};
    for (const file of manifest.downloads) {
      if (file.kind === "wheel" && file.lock) packages[file.name] = { unvendored_tests: false, ...file.lock };
    }
    return JSON.stringify({ info: manifest.lock_info, packages });
  }

  /** Check bytes against a pin; throws with the file name on a difference. @param {RuntimeFile} file @param {ArrayBuffer | Uint8Array} bytes */
  async function verify(file, bytes) {
    if (bytes.byteLength !== file.bytes) throw new Error(`${file.path}: ${bytes.byteLength} bytes, the pin says ${file.bytes}`);
    const digest = await sha256(bytes);
    if (digest !== file.sha256) throw new Error(`${file.path}: SHA-256 ${digest}, the pin says ${file.sha256}`);
  }

  /**
   * The runtime files from the base64 blocks of a portable file, checked. Save HTML copy reads the blocks
   * again, so no second copy of the text is kept here.
   * @param {{downloads: RuntimeFile[]}} manifest @param {Document} doc
   */
  async function loadEmbedded(manifest, doc) {
    const blocks = new Map();
    for (const node of doc.querySelectorAll("script[data-pynb-asset]")) blocks.set(node.getAttribute("data-pynb-asset"), node);
    const files = {};
    for (const file of manifest.downloads) {
      const node = blocks.get(file.path);
      if (!node) throw new Error(`${file.path} is not embedded in this file`);
      const bytes = globalThis.PyNb.portable.fromBase64(node.textContent.trim());
      await verify(file, bytes);
      files[fileName(file.path)] = new Blob([bytes]);
    }
    return files;
  }

  /**
   * The runtime files fetched from the site (or its offline cache), checked.
   * @param {{downloads: RuntimeFile[]}} manifest @param {(done: number, total: number, path: string) => void} progress @param {RequestInit} [init]
   */
  async function loadFetched(manifest, progress, init) {
    const total = manifest.downloads.reduce((sum, f) => sum + f.bytes, 0);
    let done = 0;
    const files = {};
    for (const file of manifest.downloads) {
      const response = await fetch(file.path, init);
      if (!response.ok) throw new Error(`${file.path}: HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      await verify(file, bytes);
      files[fileName(file.path)] = new Blob([bytes]);
      done += file.bytes;
      progress(done, total, file.path);
    }
    return files;
  }

  const text = (id) => {
    const node = document.getElementById(id);
    if (!node) throw new Error(`the page has no #${id}`);
    return node.textContent;
  };

  /**
   * One Python session: one PyScript worker running kernel.py. onMessage gets every message of this session
   * and none after terminate().
   */
  class Session {
    /**
     * @param {{manifest: {pyodide: string, lock_info: object, downloads: RuntimeFile[]}, files: Record<string, Blob>, onMessage: (m: any) => void}} options
     */
    constructor({ manifest, files, onMessage }) {
      this.alive = true;
      this.started = performance.now();
      const index = `https://pyodide.invalid/v${manifest.pyodide}/full/`;
      const channel = new MessageChannel();
      this.port = channel.port1;
      this.port.onmessage = (event) => { if (this.alive) onMessage(event.data); };
      const packages = manifest.downloads.filter((f) => f.kind === "wheel").map((f) => f.name);
      const boot = {
        pynb: "boot", version: manifest.pyodide, index, lock: lockText(manifest), packages,
        shim: text("pynb-shim"),
        files: { ...files, "kernel.py": new Blob([text("pynb-kernel")], { type: "text/x-python" }) },
      };
      /** @type {Worker | null} */
      this.worker = null;
      const failed = (text) => { if (this.alive) onMessage({ type: "fail", text }); };
      globalThis.PyNbPatches.prepare(boot, [channel.port2], (worker) => {
        this.worker = worker;
        if (!this.alive) worker.terminate();
        worker.addEventListener("error", (event) => failed(String(event.message || "worker error")));
      });
      // polyscript fetches the main script on the page; a page-made blob: URL keeps that fetch in memory. PyWorker
      // resolves when polyscript has run kernel.py; the kernel's own "ready" message is what counts.
      this.kernelURL = URL.createObjectURL(boot.files["kernel.py"]);
      globalThis.pynbVendor.PyWorker(this.kernelURL, {}).catch((error) => failed(String(error && error.message || error)));
    }

    /** @param {object} message @param {Transferable[]} [transfer] */
    post(message, transfer) {
      if (this.alive) this.port.postMessage(message, transfer || []);
    }

    terminate() {
      this.alive = false;
      this.port.onmessage = null;
      this.port.close();
      if (this.worker) this.worker.terminate();
      URL.revokeObjectURL(this.kernelURL);
    }
  }

  return { lockText, verify, loadEmbedded, loadFetched, Session, sha256, fileName };
});
