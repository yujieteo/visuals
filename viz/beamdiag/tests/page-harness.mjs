/* Runs the built page in a small stand-in DOM, enough for its script to build forms, draw and save figures. */
import { readFile } from "node:fs/promises";
import vm from "node:vm";

/** @typedef {(event: any) => unknown} Listener a page handler; the tests hand it whatever event shape it reads */
export class Element {
  constructor(tag = "div") {
    /** @type {any[]} the page script's children: elements and text nodes, read back by the tests as it built them */
    this.children = [];
    /** @type {Record<string, string>} */
    this.dataset = {};
    /** @type {Record<string, any>} the attributes as the page set them, numbers or strings, read back by the tests as set */
    this.attrs = {};
    /** @type {Record<string, Listener[]>} */
    this.listeners = {};
    this.tag = tag;
    this.value = ""; this.classList = { add() {}, remove() {}, contains() { return false; } };
    /** @type {string | undefined} */
    this.textContent = undefined;
    /** @type {string | undefined} */
    this.className = undefined;
    this.open = false;
    /** @type {boolean | undefined} */
    this.hidden = undefined;
    /** @type {number | undefined} a test sets it to lay the figure out at that width */
    this.clientWidth = undefined;
    /** @type {string | undefined} what the page sets on an anchor it clicks to save a file */
    this.download = undefined;
    /** @type {string | undefined} */
    this.href = undefined;
    /** @type {(() => void) | undefined} */
    this.click = undefined;
  }
  get localName() { return this.tag; }
  /** @param {...unknown} children */
  append(...children) { this.children.push(...children); }
  /** @param {...unknown} children */
  replaceChildren(...children) { this.children = children; }
  /** @param {unknown} child */
  add(child) { this.append(child); }
  remove() {}
  /** @param {string} key @param {unknown} value */
  setAttribute(key, value) { this.attrs[key] = value; }
  /** @param {string} key */
  getAttribute(key) { return key in this.attrs ? String(this.attrs[key]) : null; }
  /** @param {string} key */
  removeAttribute(key) { delete this.attrs[key]; }
  /** @param {string} type @param {Listener} fn */
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  /** @param {string} type */
  dispatch(type) { for (const fn of this.listeners[type] || []) fn({ target: this }); }
  querySelector() { return null; }
  focus() {}
}

const escape = (/** @type {unknown} */ s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
class XMLSerializer {
  /** @param {Element} node @returns {string} */
  serializeToString(node, root = true) {
    const attrs = Object.entries(node.attrs).map(([k, v]) => ` ${k}="${escape(v)}"`).join("");
    const ns = root ? ' xmlns="http://www.w3.org/2000/svg"' : "";
    const inner = (node.textContent != null ? escape(node.textContent) : "") + node.children.map((c) => this.serializeToString(c, false)).join("");
    return `<${node.tag}${ns}${attrs}>${inner}</${node.tag}>`;
  }
}

/* A canvas that paints every pixel white, as the figure's background does. */
class Canvas extends Element {
  constructor() {
    super("canvas"); this.width = 300; this.height = 150;
    /** @type {{ src: string, w: number, h: number }[]} */
    this.drawn = [];
  }
  getContext() {
    const canvas = this;
    return {
      fillRect() {},
      /** @param {{ src: string }} img @param {number} x @param {number} y @param {number} w @param {number} h */
      drawImage(img, x, y, w, h) { canvas.drawn.push({ src: img.src, w, h }); },
      /** @param {number} x @param {number} y @param {number} w @param {number} h */
      getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(w * h * 4).fill(255) }; },
    };
  }
  /** @param {(blob: Blob) => void} done @param {string} type */
  toBlob(done, type) { done(new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type })); }
}

/** @typedef {{ name: string, execute(input?: object): Promise<{ content: { text: string }[] }> } & Record<string, any>} Tool a tool as the page registers it */
/** @param {{ runTimers?: boolean, navigator?: object }} [options] */
export async function page({ runTimers = false, navigator = {} } = {}) {
  /** @type {Map<string, Element>} */
  const nodes = new Map();
  /** @type {Map<string, Tool>} */
  const tools = new Map();
  const buttons = ["point", "moment"].map((kind) => {
    const b = new Element("button"); b.dataset.add = kind; return b;
  });
  /** @type {{ name: string | undefined, blob: Blob }[]} */
  const saved = [];
  /** @type {Map<string, Blob>} */
  const urls = new Map();
  /** @type {Canvas[]} */
  const canvases = [];
  const all = () => {
    /** @type {Element[]} */
    const out = [];
    const visit = (/** @type {Element} */ e) => { out.push(e); for (const c of e.children || []) visit(c); };
    for (const e of nodes.values()) visit(e);
    return out;
  };
  const document = {
    body: new Element("body"),
    /** @param {string} id */
    getElementById(id) { if (!nodes.has(id)) nodes.set(id, new Element()); return /** @type {Element} */ (nodes.get(id)); },
    /** @param {string} tag */
    createElement(tag) {
      if (tag === "canvas") { const c = new Canvas(); canvases.push(c); return c; }
      const e = new Element(tag);
      if (tag === "a") e.click = () => { saved.push({ name: e.download, blob: /** @type {Blob} */ (urls.get(/** @type {string} */ (e.href))) }); };
      return e;
    },
    createElementNS: (/** @type {string} */ _, /** @type {string} */ tag) => new Element(tag),
    createTextNode: (/** @type {string} */ text) => ({ textContent: text }),
    /** @param {string} selector */
    querySelector(selector) { const field = selector.match(/^\[data-field="(.+)"\]$/)?.[1]; return all().find((e) => e.dataset?.field === field) || null; },
    /** @param {string} selector */
    querySelectorAll(selector) {
      if (selector === "[data-add]") return buttons;
      if (selector === "[data-field]") return all().filter((e) => e.dataset?.field);
      return [];
    },
    modelContext: { registerTool: (/** @type {Tool} */ tool) => tools.set(tool.name, tool) },
  };
  let reads = 0, writes = 0;
  const context = vm.createContext({ document, navigator, console,
    Option: class extends Element { constructor(/** @type {string} */ label, /** @type {string} */ value) { super("option"); this.value = value; } },
    location: { get hash() { reads++; return "#m=obsolete-model"; } },
    history: { replaceState() { writes++; } },
    setTimeout: (/** @type {() => void} */ fn) => { if (runTimers) fn(); return 1; }, clearTimeout() {},
    Blob, Response, TextEncoder, CompressionStream, XMLSerializer,
    URL: { createObjectURL(/** @type {Blob} */ blob) { const url = `blob:${urls.size}`; urls.set(url, blob); return url; }, revokeObjectURL() {} },
    Image: class {
      /** @type {string | undefined} */
      _src = undefined;
      /** @type {() => void} */
      onload = () => {};
      set src(/** @type {string} */ v) { this._src = v; Promise.resolve().then(() => this.onload()); }
      get src() { return /** @type {string} */ (this._src); }
    },
  });
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) vm.runInContext(match[1], context);
  /* Type into a field one keystroke at a time, then leave it. */
  /** @param {string} id @param {...unknown} values */
  const type = (id, ...values) => {
    const e = document.getElementById(id);
    for (const value of values) { e.value = String(value); e.dispatch("input"); }
    e.dispatch("change"); e.dispatch("blur");
  };
  const input = (/** @type {string} */ id, /** @type {unknown} */ value) => type(id, value);
  /** @param {string} name @param {unknown} value */
  const field = (name, value, event = "input") => {
    const e = /** @type {Element} */ (document.querySelector(`[data-field="${name}"]`));
    e.value = String(value); e.dispatch(event);
  };
  const choose = (/** @type {string} */ id, /** @type {string} */ value) => { const e = document.getElementById(id); e.value = value; e.dispatch("change"); };
  const current = async () => JSON.parse((await /** @type {Tool} */ (tools.get("get_current_beam")).execute()).content[0].text);
  /* Click a save or copy button and wait for the page to report the outcome. */
  /** @param {string} id */
  const save = async (id, statusId = "figure-status") => {
    const status = document.getElementById(statusId);
    status.textContent = "";
    document.getElementById(id).dispatch("click");
    for (const until = Date.now() + 20000; Date.now() < until && !/^(Saved|Copied|Could not|Fix)/.test(status.textContent ?? "");) await new Promise((r) => setImmediate(r));
    return status.textContent;
  };
  return { document, buttons, tools, input, type, field, choose, current, save, saved, canvases, urlAccess: () => ({ reads, writes }) };
}
