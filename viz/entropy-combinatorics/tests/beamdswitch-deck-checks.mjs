/* A small stand-in DOM to boot the page in Node and click its beamdswitch and Copy deck buttons;
   tests/entropy-combinatorics.test.mjs parses the decks with beamdswitch's own parser (a read-only
   copy in tests/fixtures/beamdswitch/). */
import vm from "node:vm";

/* ---------- a stand-in DOM: enough for a page script to start and for its buttons to be clicked ---------- */
export class Element {
  constructor(tag = "div") {
    Object.assign(this, { tag, children: [], dataset: {}, attrs: {}, listeners: {}, style: {}, value: "", textContent: "", innerHTML: "", hidden: false, checked: false, disabled: false, placeholder: "", files: [] });
    this.classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
  }
  get value() { return this._value; }
  set value(v) { this._value = String(v); }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  removeEventListener() {}
  async fire(type, target = this) { for (const fn of this.listeners[type] || []) await fn({ type, target, preventDefault() {}, stopPropagation() {} }); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; }
  get parentElement() { return this; }
  get tBodies() { return (this._tBodies ??= [new this.constructor("tbody")]); }
  appendChild(c) { this.children.push(c); return c; }
  append(...c) { this.children.push(...c); }
  replaceChildren(...c) { this.children = c; }
  remove() {}
  click() {}
  focus() {}
  blur() {}
  closest() { return this; }
  contains() { return false; }
  scrollIntoView() {}
  querySelector() { return null; }
  querySelectorAll() { return []; }
  getBoundingClientRect() { return { width: 600, height: 400, left: 0, top: 0, right: 600, bottom: 400 }; }
  dispatchEvent(e) { this.fire(e.type); return true; }
  select() {}
  getContext() { return new Proxy({}, { get: (t, k) => (k in t ? t[k] : k === "measureText" ? () => ({ width: 0 }) : () => {}), set: (t, k, v) => ((t[k] = v), true) }); }
}
Element.prototype.validity = { badInput: false };

/*
 * Run a page's inline scripts in a fresh context with a stand-in DOM. Downloads are recorded in
 * `saved` (or throw when saveFails), clipboard writes in `copied` (or throw when clipboardFails).
 * `select(selector)` returns the elements a querySelectorAll call should see; `Node` is the element
 * class, for a page that needs more of the DOM than Element offers.
 */
export function standIn({ saveFails = false, clipboardFails = false, select = () => [], globals = {}, Node = Element } = {}) {
  const nodes = new Map(), saved = [], copied = [], blobs = new Map();
  const document = {
    body: new Node("body"), documentElement: new Node("html"), activeElement: null,
    getElementById(id) { if (!nodes.has(id)) nodes.set(id, new Node()); return nodes.get(id); },
    createElement(tag) {
      const e = new Node(tag);
      if (tag === "a") e.click = () => { if (saveFails) throw new Error("downloads are blocked"); saved.push({ name: e.download ?? e.getAttribute("download"), blob: blobs.get(e.href ?? e.getAttribute("href")) }); };
      return e;
    },
    createElementNS: (_, tag) => new Node(tag),
    createTextNode: (text) => ({ textContent: text }),
    querySelector: (s) => select(s)[0] || null,
    querySelectorAll: (s) => select(s),
    addEventListener() {}, removeEventListener() {},
  };
  let n = 0;
  const navigator = { clipboard: { writeText: async (t) => { if (clipboardFails) throw new Error("clipboard blocked"); copied.push(t); } } };
  const context = vm.createContext({
    document, navigator, console, Blob, structuredClone,
    URL: { createObjectURL: (b) => { const href = `blob:${++n}`; blobs.set(href, b); return href; }, revokeObjectURL() {} },
    location: { href: "https://example.test/", hash: "", search: "" }, history: { replaceState() {} },
    setTimeout: () => 0, clearTimeout() {}, requestAnimationFrame: () => 0, addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
    getComputedStyle: () => ({ getPropertyValue: () => "", fontFamily: "serif" }), devicePixelRatio: 1,
    Event: class { constructor(type) { this.type = type; } }, ...globals,
  });
  context.window = context; context.self = context;
  const run = (html) => { for (const m of html.matchAll(/<script(?: id="[^"]*")?>([\s\S]*?)<\/script>/g)) vm.runInContext(m[1], context); };
  return { document, context, saved, copied, run, $: (id) => document.getElementById(id) };
}
