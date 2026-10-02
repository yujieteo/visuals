/* Checks for the Structural Distortion Explorer's beamdswitch deck, and a small stand-in DOM to click
   its beamdswitch and Copy deck buttons in Node. Copied from the site's tests/beamdswitch-deck-checks.mjs,
   with paths pointing at this repository. The decks are parsed with beamdswitch's own parsers, and the
   site's shared template and its report outline are compared against read-only copies, all in
   tests/fixtures/beamdswitch/. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { parseDeck, splitSentences } from "./fixtures/beamdswitch/deck.mjs";
import { parsePlot } from "./fixtures/beamdswitch/plot.mjs";

export { parseDeck, parsePlot };

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
export const TEMPLATE = read("./fixtures/beamdswitch/template.js");
export const SECTIONS = [...read("./fixtures/beamdswitch/beamdswitch-report.md").matchAll(/^# (.+)$/gm)].map((m) => m[1]);

export const divs = (children, name, out = []) => {
  for (const c of children) if (c.type === "div") { if (c.name === name) out.push(c); divs(c.children, name, out); }
  return out;
};
export const textOf = (node) => node.children.filter((c) => c.type === "md").map((c) => c.text).join("\n");
export const plotsOf = (deck) => deck.frames.flatMap((f) => divs(f.children, "plot")).map((d) => parsePlot(textOf(d)));

/* Parse a deck and check it is the standard template with narration on every slide; returns the deck. */
export function checkDeck(md, what) {
  const deck = parseDeck(md);
  assert.equal(deck.frames[0].kind, "title", what);
  assert.ok(deck.meta.title, `${what}: has a title`);
  assert.match(deck.meta.voice ?? "", /^[a-z]{2}_[a-z]+$/, `${what}: names its narration voice`);
  assert.deepEqual(deck.frames.filter((f) => f.kind === "section").map((f) => f.title), SECTIONS, `${what}: the template's sections, in order`);
  for (const s of SECTIONS) assert.ok(deck.frames.some((f) => f.kind === "frame" && f.section === s), `${what}: ${s} has a frame`);
  const last = deck.frames.at(-1);
  assert.equal(last.section, "Checks and takeaway", what);
  assert.equal(divs(last.children, "key").length, 1, `${what}: ends on a ::: key`);
  // Written in the deck, not filled in by beamdswitch's defaults: one ::: narration per slide.
  assert.equal(md.match(/^::: narration$/gm).length, deck.frames.length, `${what}: one narration per slide`);
  for (const f of deck.frames) {
    assert.ok(splitSentences(f.narration).length > 0, `${what}: "${f.title}" is narrated`);
    assert.doesNotMatch(f.narration, /[$\\`*_#|<>×⁰¹²³⁴⁵⁶⁷⁸⁹⁻·∠°σ]/, `${what}: "${f.title}" reads as speech: ${f.narration}`);
  }
  for (const plot of plotsOf(deck)) {
    assert.deepEqual(plot.errors, [], what);
    assert.ok(plot.curves.length > 0, what);
  }
  return deck;
}

/* checkDeck, then every plot with the frame it sits on; each curve must be finite across its x range. */
export function checkDeckPlots(md, what) {
  const deck = checkDeck(md, what);
  const plots = deck.frames.flatMap((f) => divs(f.children, "plot").map((d) => ({ frame: f, spec: parsePlot(textOf(d)) })));
  for (const { frame, spec } of plots) for (const c of spec.curves) for (let i = 0; i <= 20; i++) {
    const x = spec.x[0] + ((spec.x[1] - spec.x[0]) * i) / 20;
    assert.ok(Number.isFinite(c.f(x)), `${what}: "${c.src}" on "${frame.title}" is finite at x = ${x}`);
  }
  return { deck, plots };
}

/* The page's copy of the template is the site's shared one, unchanged, and the built page inlines
   that copy verbatim. */
export function assertSharedTemplate(page = "index.html") {
  assert.equal(read("../beamdswitch.js"), TEMPLATE, "beamdswitch.js must stay identical to the site's templates/beamdswitch.js (tests/fixtures/beamdswitch/template.js)");
  assert.ok(read(`../${page}`).includes(TEMPLATE.trimEnd()), `${page} inlines beamdswitch.js`);
}

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
    MutationObserver: class { observe() {} },
    Event: class { constructor(type) { this.type = type; } }, ...globals,
  });
  context.window = context; context.self = context;
  const run = (html) => { for (const m of html.matchAll(/<script(?: id="[^"]*")?>([\s\S]*?)<\/script>/g)) vm.runInContext(m[1], context); };
  return { document, context, saved, copied, run, $: (id) => document.getElementById(id) };
}
