/* Runs the built page in a small stand-in DOM, enough for its script to build forms, draw and save figures. */
import { readFile } from "node:fs/promises";
import vm from "node:vm";

export class Element {
  constructor(tag = "div") {
    this.tag = tag; this.children = []; this.dataset = {}; this.attrs = {}; this.listeners = {};
    this.value = ""; this.classList = { add() {}, remove() {}, contains() { return false; } };
  }
  get localName() { return this.tag; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  add(child) { this.append(child); }
  remove() {}
  setAttribute(key, value) { this.attrs[key] = value; }
  getAttribute(key) { return key in this.attrs ? String(this.attrs[key]) : null; }
  removeAttribute(key) { delete this.attrs[key]; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  dispatch(type) { for (const fn of this.listeners[type] || []) fn({ target: this }); }
  querySelector() { return null; }
  focus() {}
}

const escape = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
class XMLSerializer {
  serializeToString(node, root = true) {
    const attrs = Object.entries(node.attrs).map(([k, v]) => ` ${k}="${escape(v)}"`).join("");
    const ns = root ? ' xmlns="http://www.w3.org/2000/svg"' : "";
    const inner = (node.textContent != null ? escape(node.textContent) : "") + node.children.map((c) => this.serializeToString(c, false)).join("");
    return `<${node.tag}${ns}${attrs}>${inner}</${node.tag}>`;
  }
}

/* A canvas that paints every pixel white, as the figure's background does. */
class Canvas extends Element {
  constructor() { super("canvas"); this.width = 300; this.height = 150; this.drawn = []; }
  getContext() {
    const canvas = this;
    return {
      fillRect() {},
      drawImage(img, x, y, w, h) { canvas.drawn.push({ src: img.src, w, h }); },
      getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(w * h * 4).fill(255) }; },
    };
  }
  toBlob(done, type) { done(new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type })); }
}

export async function page({ runTimers = false, navigator = {} } = {}) {
  const nodes = new Map(), tools = new Map(), buttons = ["point", "moment"].map((kind) => {
    const b = new Element("button"); b.dataset.add = kind; return b;
  });
  const saved = [], urls = new Map(), canvases = [];
  const all = () => {
    const out = [];
    const visit = (e) => { out.push(e); for (const c of e.children || []) visit(c); };
    for (const e of nodes.values()) visit(e);
    return out;
  };
  const document = {
    body: new Element("body"),
    getElementById(id) { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); },
    createElement(tag) {
      if (tag === "canvas") { const c = new Canvas(); canvases.push(c); return c; }
      const e = new Element(tag);
      if (tag === "a") e.click = () => { saved.push({ name: e.download, blob: urls.get(e.href) }); };
      return e;
    },
    createElementNS: (_, tag) => new Element(tag),
    createTextNode: (text) => ({ textContent: text }),
    querySelector(selector) { const field = selector.match(/^\[data-field="(.+)"\]$/)?.[1]; return all().find((e) => e.dataset?.field === field) || null; },
    querySelectorAll(selector) {
      if (selector === "[data-add]") return buttons;
      if (selector === "[data-field]") return all().filter((e) => e.dataset?.field);
      return [];
    },
    modelContext: { registerTool: (tool) => tools.set(tool.name, tool) },
  };
  let reads = 0, writes = 0;
  const context = vm.createContext({ document, navigator, console,
    Option: class extends Element { constructor(label, value) { super("option"); this.value = value; } },
    location: { get hash() { reads++; return "#m=obsolete-model"; } },
    history: { replaceState() { writes++; } },
    setTimeout: (fn) => { if (runTimers) fn(); return 1; }, clearTimeout() {},
    Blob, Response, TextEncoder, CompressionStream, XMLSerializer,
    URL: { createObjectURL(blob) { const url = `blob:${urls.size}`; urls.set(url, blob); return url; }, revokeObjectURL() {} },
    Image: class { set src(v) { this._src = v; Promise.resolve().then(() => this.onload()); } get src() { return this._src; } },
  });
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) vm.runInContext(match[1], context);
  /* Type into a field one keystroke at a time, then leave it. */
  const type = (id, ...values) => {
    const e = document.getElementById(id);
    for (const value of values) { e.value = String(value); e.dispatch("input"); }
    e.dispatch("change"); e.dispatch("blur");
  };
  const input = (id, value) => type(id, value);
  const field = (name, value, event = "input") => {
    const e = document.querySelector(`[data-field="${name}"]`);
    e.value = String(value); e.dispatch(event);
  };
  const choose = (id, value) => { const e = document.getElementById(id); e.value = value; e.dispatch("change"); };
  const current = async () => JSON.parse((await tools.get("get_current_beam").execute()).content[0].text);
  /* Click a save or copy button and wait for the page to report the outcome. */
  const save = async (id) => {
    const status = document.getElementById("figure-status");
    status.textContent = "";
    document.getElementById(id).dispatch("click");
    for (const until = Date.now() + 20000; Date.now() < until && !/^(Saved|Copied|Could not|Fix)/.test(status.textContent);) await new Promise((r) => setImmediate(r));
    return status.textContent;
  };
  return { document, buttons, tools, input, type, field, choose, current, save, saved, canvases, urlAccess: () => ({ reads, writes }) };
}
