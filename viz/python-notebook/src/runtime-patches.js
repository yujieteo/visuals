// The three runtime patches that let PyScript 0.7.31 start Pyodide 314.0.5 from memory, also under file://.
//
// PyScript has no supported hook for this (tests/gate/ proves the method; vendor/manifest.json pins the versions).
// This classic script runs before the vendor bundle evaluates, so polyscript captures the Worker class below.
// When polyscript makes its worker from a Blob whose text starts with "/*@*/", the text is patched:
//
//   1. polyscript's Pyodide module URL (the jsDelivr template) becomes globalThis.__pynbShim, a blob: URL of
//      src/pyodide-shim.mjs that the worker makes from the boot message;
//   2. the default base URL of polyscript's URL helper, location.href (blob:null/<uuid> under file://), becomes
//      the page URL;
//   3. src/worker-boot.js goes first: it makes importScripts throw (Pyodide refuses to start in a classic worker),
//      serves the runtime from memory and refuses every other request.
//
// The source is also wrapped in a strict async function, because it has one top-level await. Each pattern must
// match exactly once; otherwise the Blob constructor throws, the worker is never made and Python does not start.
// A version change therefore cannot make the page use the network without notice: it fails closed.
"use strict";
(function () {
  var NativeBlob = globalThis.Blob;
  var NativeWorker = globalThis.Worker;
  var nativeCreateObjectURL = URL.createObjectURL;
  var MARK = "/*@*/";
  var PATCHES = [
    { name: "pyodide-module-url", pattern: /`https:\/\/cdn\.jsdelivr\.net\/pyodide\/v\$\{\w+\}\/full\/pyodide\.mjs`/g,
      replace: function () { return "globalThis.__pynbShim"; } },
    { name: "url-helper-base", pattern: /\((\w+),(\w+)=location\.href\)=>new URL\(\1,\2\.replace\(\/\^blob:\/,""\)\)\.href/g,
      replace: function (_, a, b) { return "(" + a + "," + b + "=" + JSON.stringify(pageURL()) + ')=>new URL(' + a + "," + b + '.replace(/^blob:/,"")).href'; } },
    { name: "import-scripts", pattern: /\bimportScripts\b/g, replace: function (m) { return m; } },
  ];
  var patchedBlobs = new WeakSet();
  var patchedURLs = new Set();
  /** @type {null | {message: object, transfer: Transferable[], onWorker: (worker: Worker) => void}} */
  var pending = null;

  function pageURL() {
    return location.href.split("#")[0];
  }

  function source(id) {
    var node = document.getElementById(id);
    if (!node) throw new Error("runtime patch: the page has no #" + id);
    return node.textContent || "";
  }

  // The patched worker text, or an Error that names the pattern that did not match exactly once.
  function patch(text) {
    for (var i = 0; i < PATCHES.length; i++) {
      var p = PATCHES[i];
      var count = (text.match(p.pattern) || []).length;
      if (count !== 1) throw new Error("runtime patch " + p.name + " matched " + count + " times, not once: the PyScript version is not the one the gate tested");
      text = text.replace(p.pattern, p.replace);
    }
    return source("pynb-worker-boot") + "\n(async function () {\n\"use strict\";\n" + text +
      "\n})().catch(function (error) { globalThis.__pynbFail && globalThis.__pynbFail(error); });\n";
  }

  globalThis.Blob = class PatchedBlob extends NativeBlob {
    /** @param {BlobPart[]} [parts] @param {BlobPropertyBag} [options] */
    constructor(parts, options) {
      var ours = Array.isArray(parts) && parts.length === 1 && typeof parts[0] === "string" && parts[0].startsWith(MARK);
      super(ours ? [patch(parts[0].slice(MARK.length))] : parts, options);
      if (ours) patchedBlobs.add(this);
    }
  };

  URL.createObjectURL = function (object) {
    var url = nativeCreateObjectURL.call(URL, object);
    if (patchedBlobs.has(object)) patchedURLs.add(url);
    return url;
  };

  globalThis.Worker = class PatchedWorker extends NativeWorker {
    /** @param {string | URL} url @param {WorkerOptions} [options] */
    constructor(url, options) {
      var ours = patchedURLs.has(String(url));
      // Chrome refuses a module worker from a page-made blob: URL under file://; a classic one works.
      super(url, ours ? Object.assign({}, options, { type: "classic" }) : options);
      if (!ours) return;
      patchedURLs.delete(String(url));
      if (!pending) {
        this.terminate();
        throw new Error("runtime patch: a PyScript worker started without a boot message");
      }
      var boot = pending;
      pending = null;
      // First message: polyscript posts its own only after the constructor returns.
      this.postMessage(boot.message, boot.transfer);
      boot.onWorker(this);
    }
  };

  globalThis.PyNbPatches = Object.freeze({
    names: PATCHES.map(function (p) { return p.name; }),
    /**
     * The boot message for the next PyScript worker; onWorker gets that worker once it exists.
     * @param {object} message @param {Transferable[]} transfer @param {(worker: Worker) => void} onWorker
     */
    prepare: function (message, transfer, onWorker) {
      pending = { message: message, transfer: transfer, onWorker: onWorker };
    },
    /** Whether the PyScript worker text in this page still matches every pattern once. @param {string} text */
    check: function (text) {
      return PATCHES.map(function (p) { return { name: p.name, count: (text.match(p.pattern) || []).length }; });
    },
  });
})();
