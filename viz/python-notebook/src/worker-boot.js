// The first code of the PyScript worker (src/runtime-patches.js puts it before polyscript's worker source).
//
// It takes the boot message that the page posts before polyscript's own first message, then:
//   - serves every runtime file (Pyodide, the standard library, the wheels, the lock file and kernel.py) from the
//     Blobs of that message, at https://pyodide.invalid/v<version>/full/<name> (.invalid never resolves);
//   - refuses every other fetch, XMLHttpRequest, importScripts, WebSocket and EventSource, and reports each refusal
//     to the page, so a refused request is counted, never hidden;
//   - makes importScripts throw: Pyodide 314 probes it to detect a classic worker and refuses to start in one;
//   - connects the kernel (kernel.py) to the page through the MessagePort of the boot message.
// blob: and data: URLs are internal to the browser and pass to the native functions.
"use strict";
(() => {
  const nativeFetch = self.fetch.bind(self);
  const NativeXHR = self.XMLHttpRequest;
  const internal = (url) => /^(?:blob|data):/i.test(String(url));
  const TYPES = { wasm: "application/wasm", mjs: "text/javascript", js: "text/javascript", json: "application/json", py: "text/x-python" };
  /** @type {Map<string, Blob>} */
  const files = new Map();
  const served = [];
  const refused = [];
  /** @type {MessagePort | null} */
  let port = null;
  const send = (message, transfer) => port && port.postMessage(message, transfer || []);

  const refuse = (kind, url) => {
    const entry = { kind, url: String(url).slice(0, 500) };
    refused.push(entry);
    send({ type: "refused", ...entry });
    return new TypeError(`${kind} ${entry.url} refused: this notebook makes no network request`);
  };
  const urlOf = (input) => (typeof input === "string" ? input : input instanceof URL ? input.href : input && input.url) || "";

  self.fetch = async (input, init) => {
    const url = urlOf(input);
    const blob = files.get(url.split(/[?#]/)[0]);
    if (blob) {
      served.push(url);
      const ext = (url.split(/[?#]/)[0].match(/\.(\w+)$/) || [])[1] || "";
      return new Response(blob, { status: 200, headers: { "Content-Type": TYPES[ext] || "application/octet-stream" } });
    }
    if (internal(url)) return nativeFetch(input, init);
    throw refuse("fetch", url);
  };
  self.XMLHttpRequest = class extends NativeXHR {
    open(method, url, ...rest) {
      if (!internal(url)) throw refuse("XMLHttpRequest", url);
      return super.open(method, url, ...rest);
    }
  };
  self.importScripts = (...urls) => {
    // Pyodide's own probe, importScripts("data:text/javascript,"), must throw but is not a request to count.
    if (urls.every(internal)) throw new TypeError("importScripts is not available in this worker");
    throw refuse("importScripts", urls.join(" "));
  };
  for (const name of ["WebSocket", "EventSource", "WebTransport"]) {
    if (name in self) self[name] = class { constructor(url) { throw refuse(name, url); } };
  }

  /** The Python kernel: { run, info } from kernel.py, called with callPromising so input() can wait. */
  let kernel = null;
  let pyodide = null;
  const waiting = new Map();
  let nextAsk = 1;

  const HOME = "/notebook";
  const listFiles = () => {
    const out = [];
    const walk = (dir, rel) => {
      for (const name of pyodide.FS.readdir(dir)) {
        if (name === "." || name === ".." || name === "__pycache__" || (rel === "" && name.startsWith("."))) continue;
        const path = `${dir}/${name}`;
        const stat = pyodide.FS.stat(path);
        if (pyodide.FS.isDir(stat.mode)) walk(path, `${rel}${name}/`);
        else if (out.length < 2000) out.push({ path: `${rel}${name}`, bytes: stat.size, mtime: Number(stat.mtime) });
      }
    };
    if (pyodide.FS.analyzePath(HOME).exists) walk(HOME, "");
    return out;
  };
  const writeFile = (path, bytes) => {
    const full = `${HOME}/${path}`;
    pyodide.FS.mkdirTree(full.slice(0, full.lastIndexOf("/")));
    pyodide.FS.writeFile(full, bytes);
  };

  const handle = async (data) => {
    switch (data.type) {
      case "run":
        try {
          await kernel.run.callPromising(JSON.stringify(data));
        } catch (error) {
          send({ type: "out", id: data.id, json: JSON.stringify({ kind: "fatal", text: String(error && error.message || error) }) });
        }
        send({ type: "files", files: listFiles() });
        break;
      case "write":
        for (const f of data.files) writeFile(f.path, new Uint8Array(await f.blob.arrayBuffer()));
        send({ type: "written", id: data.id, files: listFiles() });
        break;
      case "read": {
        let bytes = null;
        try { bytes = pyodide.FS.readFile(`${HOME}/${data.path}`); } catch { bytes = null; }
        send({ type: "file", id: data.id, path: data.path, bytes }, bytes ? [bytes.buffer] : []);
        break;
      }
      case "answer": {
        const resolve = waiting.get(data.ask);
        waiting.delete(data.ask);
        if (resolve) resolve(data.cancelled ? null : String(data.value));
        break;
      }
      case "probe":
        send({ type: "probe", id: data.id, served: served.length, refused: refused.slice(), heap: pyodide ? pyodide._module.HEAPU8.length : 0 });
        break;
    }
  };

  self.addEventListener("message", function boot(event) {
    const data = event.data;
    if (!data || data.pynb !== "boot") return;
    event.stopImmediatePropagation();
    self.removeEventListener("message", boot);
    for (const [name, blob] of Object.entries(data.files)) files.set(data.index + name, blob);
    port = event.ports[0];
    port.onmessage = (e) => { handle(e.data).catch((error) => send({ type: "error", text: String(error && error.stack || error) })); };
    self.__pynbShim = URL.createObjectURL(new Blob([data.shim], { type: "text/javascript" }));
    self.__pynb = Object.freeze({
      boot: data,
      // A module import needs a JavaScript MIME type; the page makes its Blobs without one.
      moduleURL: (name) => URL.createObjectURL(new Blob([files.get(data.index + name)], { type: "text/javascript" })),
      loaded: (py) => { pyodide = py; },
      // kernel.py calls these through the js module.
      ready: (api) => {
        kernel = { run: api.run, info: api.info };
        send({ type: "ready", info: JSON.parse(api.info()), served: served.length, files: listFiles() });
      },
      emit: (id, json) => send({ type: "out", id, json }),
      ask: (id, prompt, password) => new Promise((resolve) => {
        const ask = nextAsk++;
        waiting.set(ask, resolve);
        send({ type: "ask", id, ask, prompt: String(prompt), password: !!password });
      }),
      cancelAsks: () => { for (const resolve of waiting.values()) resolve(null); waiting.clear(); },
    });
  }, { capture: true });

  self.__pynbFail = (error) => send({ type: "fail", text: String(error && error.stack || error) });
  self.addEventListener("error", (event) => self.__pynbFail(event.error || event.message));
  self.addEventListener("unhandledrejection", (event) => self.__pynbFail(event.reason));
})();
