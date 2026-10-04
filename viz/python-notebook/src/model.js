// The notebook document: nbformat 4 cells, outputs and metadata, separate from any Python session.
//
// A notebook keeps the nbformat object it was imported from, so every field this page does not use (unknown
// notebook, cell and output fields, unsupported output payloads, raw cells, attachments) goes out again on
// export with its value unchanged. Source and stream text are held as one string; export writes them as the
// list of lines Jupyter writes, which nbformat defines as the same value.
(function (root, factory) {
  const node = typeof module === "object" && module.exports;
  const api = factory();
  if (node) module.exports = api;
  else (root.PyNb = root.PyNb || {}).model = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /** Version of the page's own saved state (store.js); a different version is never read silently. */
  const SCHEMA = 1;
  const CELL_TYPES = ["code", "markdown", "raw"];
  const ID = /^[a-zA-Z0-9_-]{1,64}$/;
  // Output text that nbformat allows as a list of lines.
  const TEXT_MIME = (mime) => mime.startsWith("text/") || mime === "image/svg+xml";

  /** @typedef {{cell_type: string, id: string, source: string, metadata: object, outputs?: any[], execution_count?: number | null, attachments?: object, [key: string]: any}} Cell */
  /** @typedef {{nbformat: number, nbformat_minor: number, metadata: object, cells: Cell[], [key: string]: any}} Notebook */

  class NotebookError extends Error {}

  const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  const joined = (value) => (Array.isArray(value) ? value.join("") : value);
  const newId = () => {
    const bytes = new Uint8Array(8);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  };

  /** The lines of text, each with its own newline, as nbformat and Jupyter write them. @param {string} text */
  function splitLines(text) {
    return text.match(/[^\n]*\n|[^\n]+$/g) || [];
  }

  /** @param {"code" | "markdown" | "raw"} type @param {string} [source] @returns {Cell} */
  function newCell(type, source = "") {
    const cell = { cell_type: type, id: newId(), metadata: {}, source };
    if (type === "code") Object.assign(cell, { execution_count: null, outputs: [] });
    return cell;
  }

  /** A blank notebook with one empty code cell. @returns {Notebook} */
  function newNotebook() {
    return {
      nbformat: 4, nbformat_minor: 5,
      metadata: {
        kernelspec: { name: "python3", display_name: "Python 3 (Pyodide)", language: "python" },
        language_info: { name: "python", file_extension: ".py", mimetype: "text/x-python" },
      },
      cells: [newCell("code")],
    };
  }

  const fail = (where, message) => { throw new NotebookError(`${where}: ${message}`); };

  /** @param {any} output @param {string} where */
  function readOutput(output, where) {
    if (!isObject(output) || typeof output.output_type !== "string") fail(where, "an output needs an output_type");
    const out = { ...output };
    const kind = out.output_type;
    if (kind === "stream") {
      if (typeof out.name !== "string") fail(where, "a stream output needs a name");
      out.text = joined(out.text);
      if (typeof out.text !== "string") fail(where, "a stream output needs text");
    } else if (kind === "display_data" || kind === "execute_result" || kind === "update_display_data") {
      if (!isObject(out.data)) fail(where, `a ${kind} output needs a data object`);
      out.data = { ...out.data };
      for (const [mime, value] of Object.entries(out.data)) {
        if (TEXT_MIME(mime) || mime.startsWith("image/")) {
          if (Array.isArray(value) && value.every((part) => typeof part === "string")) out.data[mime] = value.join("");
        }
      }
      if (out.metadata === undefined) out.metadata = {};
    } else if (kind === "error") {
      if (typeof out.ename !== "string" || typeof out.evalue !== "string") fail(where, "an error output needs ename and evalue");
      if (!Array.isArray(out.traceback)) out.traceback = [];
    }
    // Any other output_type stays as it is: it is shown as unsupported and exported unchanged.
    return out;
  }

  /**
   * A notebook from .ipynb text. Throws NotebookError with a reason; the caller keeps its current notebook.
   * Missing, invalid or repeated cell ids get new ids, and the result says how many.
   * @param {string} text @returns {{notebook: Notebook, newIds: number}}
   */
  function parseIpynb(text) {
    let json;
    try { json = JSON.parse(text); } catch (error) { fail("notebook", `not JSON (${error.message})`); }
    if (!isObject(json)) fail("notebook", "the top level is not an object");
    if (json.nbformat !== 4) fail("notebook", `nbformat ${JSON.stringify(json.nbformat)} is not supported; this page reads nbformat 4`);
    if (!Number.isInteger(json.nbformat_minor) || json.nbformat_minor < 0) fail("notebook", "nbformat_minor is not a whole number");
    if (!Array.isArray(json.cells)) fail("notebook", "cells is not a list");
    if (json.metadata !== undefined && !isObject(json.metadata)) fail("notebook", "metadata is not an object");
    const seen = new Set();
    let newIds = 0;
    const cells = json.cells.map((raw, index) => {
      const where = `cell ${index + 1}`;
      if (!isObject(raw)) fail(where, "not an object");
      if (!CELL_TYPES.includes(raw.cell_type)) fail(where, `cell_type ${JSON.stringify(raw.cell_type)} is not code, markdown or raw`);
      const source = joined(raw.source);
      if (typeof source !== "string") fail(where, "source is not text");
      if (raw.metadata !== undefined && !isObject(raw.metadata)) fail(where, "metadata is not an object");
      const cell = { ...raw, source, metadata: raw.metadata === undefined ? {} : raw.metadata };
      if (typeof cell.id !== "string" || !ID.test(cell.id) || seen.has(cell.id)) {
        cell.id = newId();
        newIds++;
      }
      seen.add(cell.id);
      if (cell.cell_type === "code") {
        if (cell.outputs === undefined) cell.outputs = [];
        if (!Array.isArray(cell.outputs)) fail(where, "outputs is not a list");
        cell.outputs = cell.outputs.map((output, n) => readOutput(output, `${where}, output ${n + 1}`));
        if (cell.execution_count === undefined) cell.execution_count = null;
        if (cell.execution_count !== null && !Number.isInteger(cell.execution_count)) fail(where, "execution_count is not a whole number or null");
      }
      if (cell.attachments !== undefined && !isObject(cell.attachments)) fail(where, "attachments is not an object");
      return cell;
    });
    const notebook = { ...json, metadata: json.metadata || {}, cells };
    // Cell ids are nbformat 4.5; a notebook that now has them says so.
    if (notebook.nbformat_minor < 5) notebook.nbformat_minor = 5;
    return { notebook, newIds };
  }

  /** @param {any} output */
  function writeOutput(output) {
    const out = { ...output };
    if (out.output_type === "stream" && typeof out.text === "string") out.text = splitLines(out.text);
    if (isObject(out.data)) {
      out.data = { ...out.data };
      for (const [mime, value] of Object.entries(out.data)) {
        if (TEXT_MIME(mime) && typeof value === "string") out.data[mime] = splitLines(value);
      }
    }
    return out;
  }

  /** .ipynb text of a notebook (indent 1, as Jupyter writes). @param {Notebook} notebook */
  function toIpynb(notebook) {
    const cells = notebook.cells.map((cell) => {
      const out = { ...cell, source: splitLines(cell.source) };
      if (Array.isArray(cell.outputs)) out.outputs = cell.outputs.map(writeOutput);
      return out;
    });
    return JSON.stringify({ ...notebook, cells }, null, 1) + "\n";
  }

  /** A copy with a new id; a code cell keeps its outputs. @param {Cell} cell */
  function duplicateCell(cell) {
    return { ...structuredClone(cell), id: newId() };
  }

  /**
   * Add one output of a running cell. A stream that follows a stream of the same name joins it, as in
   * Jupyter. @param {Cell} cell @param {any} output
   */
  function appendOutput(cell, output) {
    const last = cell.outputs[cell.outputs.length - 1];
    if (output.output_type === "stream" && last && last.output_type === "stream" && last.name === output.name) {
      last.text += output.text;
    } else {
      cell.outputs.push(output);
    }
  }

  /** @param {Notebook} notebook @param {string} id */
  const indexOf = (notebook, id) => notebook.cells.findIndex((cell) => cell.id === id);

  /** Move a cell by delta places; false if it is already at that end. @param {Notebook} notebook @param {string} id @param {number} delta */
  function moveCell(notebook, id, delta) {
    const from = indexOf(notebook, id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= notebook.cells.length) return false;
    const [cell] = notebook.cells.splice(from, 1);
    notebook.cells.splice(to, 0, cell);
    return true;
  }

  /**
   * The relative path a data file gets in the notebook folder, or a NotebookError that says why the name is
   * unsafe. Folders are allowed; "..", absolute paths, backslashes, control characters and hidden names are not.
   * @param {string} name
   */
  function safePath(name) {
    const path = String(name).normalize("NFC").replace(/^\.\//, "");
    if (!path) fail("file name", "empty");
    if (path.length > 255) fail(path.slice(0, 40) + "…", "longer than 255 characters");
    if (path.startsWith("/")) fail(path, "an absolute path");
    if (/[\\\u0000-\u001f\u007f]/.test(path)) fail(path, "contains a backslash or a control character");
    for (const part of path.split("/")) {
      if (part === "" || part === "." || part === "..") fail(path, "has an empty, \".\" or \"..\" folder");
      if (part.startsWith(".")) fail(path, "has a hidden name (one that starts with \".\")");
    }
    return path;
  }

  /** The first free name "stem (2).ext", "stem (3).ext", … for a path that exists. @param {string} path @param {Set<string>} taken */
  function freePath(path, taken) {
    const slash = path.lastIndexOf("/") + 1;
    const dot = path.lastIndexOf(".");
    const cut = dot > slash ? dot : path.length;
    for (let n = 2; ; n++) {
      const candidate = `${path.slice(0, cut)} (${n})${path.slice(cut)}`;
      if (!taken.has(candidate)) return candidate;
    }
  }

  return {
    SCHEMA, NotebookError, newId, newCell, newNotebook, parseIpynb, toIpynb, splitLines,
    duplicateCell, appendOutput, moveCell, indexOf, safePath, freePath,
  };
});
