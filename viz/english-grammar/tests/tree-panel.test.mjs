// The grammar laboratory's Tree panel, run from the built page in a recording stand-in DOM: every child the page
// appends is kept as passed, so a null that a real browser would print as the text "null" is caught.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

/** @typedef {(event: object) => void} Listener */
class El {
  /** @param {string} tag */
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    /** @type {unknown[]} every child as the page passed it */
    this.kids = [];
    /** @type {Record<string, string>} */
    this.attrs = {};
    /** @type {Record<string, Listener[]>} */
    this.listeners = {};
    /** @type {Record<string, string>} */
    this.style = {};
    /** @type {Record<string, string>} */
    this.dataset = {};
    this.classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
    this.className = "";
    this.open = false;
    this.hidden = false;
  }
  /** @param {unknown[]} kids */
  append(...kids) { this.kids.push(...kids); }
  /** @param {unknown[]} kids */
  replaceChildren(...kids) { this.kids = kids; }
  set textContent(v) { this.kids = v ? [String(v)] : []; }
  get textContent() { return this.kids.join(""); }
  get lastChild() { return this.kids[this.kids.length - 1] ?? null; }
  /** @param {string} k @param {string} v */
  setAttribute(k, v) { this.attrs[k] = String(v); if (k.startsWith("data-")) this.dataset[k.slice(5)] = String(v); }
  /** @param {string} k */
  getAttribute(k) { return this.attrs[k] ?? null; }
  /** @param {string} k */
  removeAttribute(k) { delete this.attrs[k]; }
  /** @param {string} type @param {Listener} fn */
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  contains() { return false; }
  closest() { return null; }
  remove() {}
  focus() {}
  select() {}
  scrollIntoView() {}
  getContext() { return null; }
}

test("the Tree panel of an example without punctuation appends no null", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  /** @param {string} id */
  const script = (id) => {
    const m = new RegExp(`<script[^>]*id="${id}"[^>]*>([\\s\\S]*?)</script>`).exec(html);
    assert.ok(m, id);
    return m[1];
  };
  /** @type {El[]} */
  const made = [];
  /** @type {Map<string, El>} */
  const byId = new Map([["eg-data", Object.assign(new El("script"), { kids: [script("eg-data")] })]]);
  const make = (/** @type {string} */ tag) => { const e = new El(tag); made.push(e); return e; };
  /** @type {Listener[]} */
  const hashListeners = [];
  const location = { hash: "#category-and-function/tree" };
  const document = {
    body: new El("body"), activeElement: null, createElement: make, createElementNS: (/** @type {string} */ _ns, /** @type {string} */ tag) => make(tag),
    getElementById: (/** @type {string} */ id) => { if (!byId.has(id)) byId.set(id, new El("div")); return byId.get(id); },
    querySelector: () => new El("div"), addEventListener() {},
  };
  const context = vm.createContext({
    document, location, navigator: { platform: "Linux" }, URL, Blob, console,
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    getComputedStyle: () => ({ fontFamily: "serif" }),
    setTimeout: () => 0,
    addEventListener: (/** @type {string} */ type, /** @type {Listener} */ fn) => { if (type === "hashchange") hashListeners.push(fn); },
  });
  context.window = context;
  vm.runInContext(script("eg-logic"), context);
  vm.runInContext(script("eg-ui"), context);
  const tree = made.find((e) => e.tagName === "DETAILS" && e.attrs["data-view"] === "tree");
  assert.ok(tree, "the concept page has a Tree disclosure");
  assert.equal(tree.open, true, "the #…/tree link opens the Tree");
  tree.listeners.toggle.forEach((fn) => fn({}));
  assert.ok(tree.kids.length > 1, "the Tree panel is drawn");
  assert.ok(!made.some((e) => e.className === "tree-marks"), "this example has no punctuation marks");
  assert.deepEqual(tree.kids.filter((k) => k === null || k === undefined || k === "null"), [], "no null among the Tree panel's children");
});
