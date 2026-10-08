/* Checks for Mohr's beamdswitch deck, and a small stand-in DOM to click its beamdswitch and Copy deck
   buttons in Node. Copied from the site's tests/beamdswitch-deck-checks.mjs, with paths pointing at this
   repository. The decks are parsed with beamdswitch's own parsers, and the site's report outline is read
   from a read-only copy, all in tests/fixtures/beamdswitch/. The template rule in scripts/rules.py
   checks the shared template. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { parseDeck, splitSentences } from "./fixtures/beamdswitch/deck.mjs";
import { parsePlot } from "./fixtures/beamdswitch/plot.mjs";
/** @import { Deck, DeckNode } from "./fixtures/beamdswitch/deck.mjs" */
/** @typedef {Extract<DeckNode, { type: "div" }>} DeckDiv */

export { parseDeck, parsePlot };

/** @param {string} path */
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
export const SECTIONS = [...read("./fixtures/beamdswitch/beamdswitch-report.md").matchAll(/^# (.+)$/gm)].map((m) => m[1]);

/**
 * Every ::: name div in a frame body, nested ones included.
 * @param {DeckNode[]} children @param {string} name @param {DeckDiv[]} [out]
 * @returns {DeckDiv[]}
 */
export const divs = (children, name, out = []) => {
  for (const c of children) if (c.type === "div") { if (c.name === name) out.push(c); divs(c.children, name, out); }
  return out;
};
/** @param {DeckDiv} node */
export const textOf = (node) => node.children.filter((c) => c.type === "md").map((c) => c.text).join("\n");
/** @param {Deck} deck */
export const plotsOf = (deck) => deck.frames.flatMap((f) => divs(f.children, "plot")).map((d) => parsePlot(textOf(d)));

/* Parse a deck and check it is the standard template with narration on every slide; returns the deck. */
/** @param {string} md @param {string} what */
export function checkDeck(md, what) {
  const deck = parseDeck(md);
  assert.equal(deck.frames[0].kind, "title", what);
  assert.ok(deck.meta.title, `${what}: has a title`);
  assert.match(deck.meta.voice ?? "", /^[a-z]{2}_[a-z]+$/, `${what}: names its narration voice`);
  assert.deepEqual(deck.frames.filter((f) => f.kind === "section").map((f) => f.title), SECTIONS, `${what}: the template's sections, in order`);
  for (const s of SECTIONS) assert.ok(deck.frames.some((f) => f.kind === "frame" && f.section === s), `${what}: ${s} has a frame`);
  const last = deck.frames.at(-1);
  assert.ok(last, `${what}: has frames`);
  assert.equal(last.section, "Checks and takeaway", what);
  assert.equal(divs(last.children, "key").length, 1, `${what}: ends on a ::: key`);
  // Written in the deck, not filled in by beamdswitch's defaults: one ::: narration per slide.
  assert.equal(md.match(/^::: narration$/gm)?.length, deck.frames.length, `${what}: one narration per slide`);
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

/* ---------- a stand-in DOM: enough for a page script to start and for its buttons to be clicked ---------- */
/**
 * The event a stand-in element's listeners receive.
 * @typedef {{ type: string, target: Element, preventDefault(): void, stopPropagation(): void }} StandInEvent
 */
export class Element {
  constructor(tag = "div") {
    this.tag = tag;
    /** @type {any[]} the page script's children: elements, text nodes, whatever it appends */
    this.children = [];
    /** @type {Record<string, string>} */
    this.dataset = {};
    /** @type {Record<string, string>} */
    this.attrs = {};
    /** @type {Record<string, ((event: StandInEvent) => unknown)[]>} */
    this.listeners = {};
    /** @type {Record<string, string>} */
    this.style = {};
    this._value = "";
    this.value = "";
    this.textContent = "";
    this.innerHTML = "";
    this.hidden = false;
    this.checked = false;
    this.disabled = false;
    this.placeholder = "";
    /** @type {unknown[]} */
    this.files = [];
    this.classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
  }
  get value() { return this._value; }
  set value(/** @type {unknown} */ v) { this._value = String(v); }
  /** @param {string} type @param {(event: StandInEvent) => unknown} fn */
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  removeEventListener() {}
  /** @param {string} type */
  async fire(type, target = this) { for (const fn of this.listeners[type] || []) await fn({ type, target, preventDefault() {}, stopPropagation() {} }); }
  /** @param {string} k @param {unknown} v */
  setAttribute(k, v) { this.attrs[k] = String(v); }
  /** @param {string} k */
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  /** @param {string} k */
  removeAttribute(k) { delete this.attrs[k]; }
  get parentElement() { return this; }
  /** @returns {Element[]} */
  get tBodies() {
    // A subclass's own kind of element, as standIn's Node option makes.
    const Kind = /** @type {typeof Element} */ (this.constructor);
    const self = /** @type {this & { _tBodies?: Element[] }} */ (this);
    return (self._tBodies ??= [new Kind("tbody")]);
  }
  /** @template T @param {T} c */
  appendChild(c) { this.children.push(c); return c; }
  /** @param {...unknown} c */
  append(...c) { this.children.push(...c); }
  /** @param {...unknown} c */
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
  /** @param {{ type: string }} e */
  dispatchEvent(e) { this.fire(e.type); return true; }
  select() {}
  getContext() {
    /** @type {Record<string | symbol, unknown>} */
    const context = {};
    return new Proxy(context, { get: (t, k) => (k in t ? t[k] : k === "measureText" ? () => ({ width: 0 }) : () => {}), set: (t, k, v) => ((t[k] = v), true) });
  }
}
/** @type {any} the shared default every stand-in element inherits, as a page reads input.validity */
(Element.prototype).validity = { badInput: false };

/*
 * Run a page's inline scripts in a fresh context with a stand-in DOM. Downloads are recorded in
 * `saved` (or throw when saveFails), clipboard writes in `copied` (or throw when clipboardFails).
 * `select(selector)` returns the elements a querySelectorAll call should see; `Node` is the element
 * class, for a page that needs more of the DOM than Element offers.
 */
/**
 * @param {object} [options]
 * @param {boolean} [options.saveFails]
 * @param {boolean} [options.clipboardFails]
 * @param {(selector: string) => Element[]} [options.select]
 * @param {Record<string, unknown>} [options.globals]
 * @param {typeof Element} [options.Node]
 */
export function standIn({ saveFails = false, clipboardFails = false, select = () => [], globals = {}, Node = Element } = {}) {
  /** @type {Map<string, Element>} */
  const nodes = new Map();
  /** @type {{ name: unknown, blob: Blob | undefined }[]} */
  const saved = [];
  /** @type {string[]} */
  const copied = [];
  /** @type {Map<string | null, Blob>} */
  const blobs = new Map();
  const document = {
    body: new Node("body"), documentElement: new Node("html"), activeElement: null,
    /** @param {string} id */
    getElementById(id) { if (!nodes.has(id)) nodes.set(id, new Node()); return /** @type {Element} */ (nodes.get(id)); },
    /** @param {string} tag */
    createElement(tag) {
      // The page sets an anchor's download and href as plain properties.
      const e = /** @type {Element & { download?: string, href?: string }} */ (new Node(tag));
      if (tag === "a") e.click = () => { if (saveFails) throw new Error("downloads are blocked"); saved.push({ name: e.download ?? e.getAttribute("download"), blob: blobs.get(e.href ?? e.getAttribute("href")) }); };
      return e;
    },
    createElementNS: (/** @type {string} */ _, /** @type {string} */ tag) => new Node(tag),
    createTextNode: (/** @type {string} */ text) => ({ textContent: text }),
    querySelector: (/** @type {string} */ s) => select(s)[0] || null,
    querySelectorAll: (/** @type {string} */ s) => select(s),
    addEventListener() {}, removeEventListener() {},
  };
  let n = 0;
  const navigator = { clipboard: { writeText: async (/** @type {string} */ t) => { if (clipboardFails) throw new Error("clipboard blocked"); copied.push(t); } } };
  const context = vm.createContext({
    document, navigator, console, Blob, structuredClone,
    URL: { createObjectURL: (/** @type {Blob} */ b) => { const href = `blob:${++n}`; blobs.set(href, b); return href; }, revokeObjectURL() {} },
    location: { href: "https://example.test/", hash: "", search: "" }, history: { replaceState() {} },
    setTimeout: () => 0, clearTimeout() {}, requestAnimationFrame: () => 0, addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
    getComputedStyle: () => ({ getPropertyValue: () => "", fontFamily: "serif" }), devicePixelRatio: 1,
    Event: class { constructor(/** @type {string} */ type) { this.type = type; } }, ...globals,
  });
  context.window = context; context.self = context;
  const run = (/** @type {string} */ html) => { for (const m of html.matchAll(/<script(?: id="[^"]*")?>([\s\S]*?)<\/script>/g)) vm.runInContext(m[1], context); };
  return { document, context, saved, copied, run, $: (/** @type {string} */ id) => document.getElementById(id) };
}
