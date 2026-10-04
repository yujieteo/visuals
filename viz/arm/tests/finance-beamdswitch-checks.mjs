/* Shared checks for the beamdswitch decks of the finance visualisations (airbnb, arm, marvell, panw,
   breeden-litzenberger-density, convex-payoffs), and a small stand-in DOM to click their beamdswitch
   and Copy deck buttons in Node. Decks are parsed with beamdswitch's own parsers (read-only copies in
   tests/fixtures/beamdswitch/), as the site's tests do. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { parseDeck, splitSentences } from "./fixtures/beamdswitch/deck.mjs";
import { parsePlot } from "./fixtures/beamdswitch/plot.mjs";
/** @import { Deck, DeckNode } from "./fixtures/beamdswitch/deck.mjs" */
/** @typedef {Extract<DeckNode, { type: "div" }>} DeckDiv */

/** @param {string} path */
export const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
// This repository holds one page; its slug names the files the page saves.
export const SLUG = JSON.parse(read("meta.json")).slug;

/* SHA-256 of yujieteo/site templates/beamdswitch.js, the site's standard report template. Every
   page folder carries it unchanged. Set SITE_REPO to a site checkout to compare against the file. */
const TEMPLATE_SHA256 = "f9ce9c6eb07842a2fa50dd72c828cb53c09f412c6bb1505d825d081b5b4362c7";
const SECTIONS = [...read("tests/fixtures/beamdswitch/report-template.md").matchAll(/^# (.+)$/gm)].map((m) => m[1]);

export function assertTemplateCopy() {
  const copy = read("beamdswitch.js");
  assert.equal(createHash("sha256").update(copy).digest("hex"), TEMPLATE_SHA256,
    "beamdswitch.js must stay identical to the site's templates/beamdswitch.js");
  if (process.env.SITE_REPO)
    assert.equal(copy, readFileSync(`${process.env.SITE_REPO}/templates/beamdswitch.js`, "utf8"),
      "the site's templates/beamdswitch.js and beamdswitch.js must stay identical");
}

/* The page inlines each script verbatim in its own <script id="..."> block; returns that block's source. */
/** @param {string} html @param {string} id */
const inlined = (html, id) => new RegExp(`<script id="${id}">\\n([\\s\\S]*?)</script>`).exec(html)?.[1];
/** @param {string} html @param {string} id @param {string} source */
export function assertInlined(html, id, source) {
  const block = inlined(html, id);
  assert.ok(block !== undefined, `${SLUG}: the page has a <script id="${id}"> block`);
  assert.equal(block, source, `${SLUG}: the page inlines ${id} unchanged`);
}

// Every deck names its narrator, so beamdswitch never narrates in silence: a voice id such as bf_emma.
/** @param {Deck} deck @param {string} what */
function assertVoice(deck, what) {
  assert.match(deck.meta.voice ?? "", /^[a-z]{2}_[a-z]+$/, `${what}: declares a voice in its front matter`);
}

/* Loads UMD scripts (the template and a report) into one context and returns its globals. */
/** @param {...string} sources */
export function load(...sources) {
  const context = vm.createContext({});
  context.self = context;
  for (const s of sources) vm.runInContext(s, context);
  return context;
}

/** @param {DeckNode[]} children @param {string} name @param {DeckDiv[]} [out] @returns {DeckDiv[]} */
const divs = (children, name, out = []) => {
  for (const c of children) if (c.type === "div") { if (c.name === name) out.push(c); divs(c.children, name, out); }
  return out;
};
/** @param {DeckDiv} node */
const textOf = (node) => node.children.filter((c) => c.type === "md").map((c) => c.text).join("\n");

/* The deck opens in beamdswitch as the standard template: a title slide, the four sections in order,
   every slide narrated in plain spoken prose written in the deck, ending on one ::: key. Every plot
   parses and is finite across its x range, and the front matter names a voice. Returns the parsed deck. */
/** @param {string} md @param {string} what */
export function assertStandardDeck(md, what) {
  const deck = parseDeck(md);
  assertVoice(deck, what);
  assert.equal(deck.frames[0].kind, "title", what);
  assert.ok(deck.meta.title, `${what}: has a title`);
  assert.deepEqual(deck.frames.filter((f) => f.kind === "section").map((f) => f.title), SECTIONS, `${what}: the template's sections, in order`);
  for (const s of SECTIONS) assert.ok(deck.frames.some((f) => f.kind === "frame" && f.section === s), `${what}: ${s} has a frame`);
  const last = deck.frames.at(-1);
  assert.ok(last, `${what}: has frames`);
  assert.equal(last.section, SECTIONS.at(-1), what);
  assert.equal(divs(last.children, "key").length, 1, `${what}: ends on a ::: key`);
  // Written in the deck, not filled in by beamdswitch's defaults: one ::: narration per slide.
  assert.equal(md.match(/^::: narration$/gm)?.length, deck.frames.length, `${what}: one narration per slide`);
  for (const f of deck.frames) {
    assert.ok(splitSentences(f.narration).length > 0, `${what}: "${f.title}" is narrated`);
    assert.doesNotMatch(f.narration, /[$\\`*_#|<>×⁰¹²³⁴⁵⁶⁷⁸⁹⁻%&≈·∠°σΔ]/, `${what}: "${f.title}" reads as speech: ${f.narration}`);
  }
  for (const f of deck.frames) for (const d of divs(f.children, "plot")) {
    const spec = parsePlot(textOf(d));
    assert.deepEqual(spec.errors, [], what);
    assert.ok(spec.curves.length > 0, what);
    for (const c of spec.curves) for (let i = 0; i <= 20; i++) {
      const x = spec.x[0] + ((spec.x[1] - spec.x[0]) * i) / 20;
      assert.ok(Number.isFinite(c.f(x)), `${what}: "${c.src}" on "${f.title}" is finite at x = ${x}`);
    }
  }
  return deck;
}

/* ---------- a stand-in DOM: enough for a page script to start and for its controls to be clicked ---------- */
/**
 * The event a stand-in element's listeners receive.
 * @typedef {{ type: string, target: Element, currentTarget: Element, preventDefault(): void }} StandInEvent
 */
class Element {
  constructor(tag = "div") {
    this.tag = tag;
    /** @type {unknown[]} */
    this.children = [];
    /** @type {Record<string, string>} */
    this.dataset = {};
    /** @type {Record<string, string>} */
    this.attrs = {};
    /** @type {Record<string, ((event: StandInEvent) => unknown)[]>} */
    this.listeners = {};
    /** @type {Record<string, string>} */
    this.style = {};
    this.textContent = "";
    this.innerHTML = "";
    this.value = "";
  }
  /** @param {string} type @param {(event: StandInEvent) => unknown} fn */
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  /** @param {string} type */
  async fire(type) { for (const fn of this.listeners[type] || []) await fn({ type, target: this, currentTarget: this, preventDefault() {} }); }
  /** @param {string} k @param {unknown} v */
  setAttribute(k, v) { this.attrs[k] = String(v); }
  /** @param {string} k */
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  /** @param {...unknown} c */
  append(...c) { this.children.push(...c); }
  /** @param {...unknown} c */
  replaceChildren(...c) { this.children = c; }
  remove() {}
  click() {}
  getBoundingClientRect() { return { width: 960, height: 400, left: 0, top: 0, right: 960, bottom: 400 }; }
}

/*
 * Runs a page's inline scripts in a fresh context. `controls` maps a querySelectorAll selector to the
 * elements it returns (each { dataset }); downloads land in `saved` ({ name, text }) and clipboard
 * writes in `copied`. With `blockSave`, the browser refuses to make the download. `$(id)` is the
 * element with that id.
 */
/** @param {Record<string, Record<string, string>[]>} [controls] */
export function openPage(controls = {}, { blockSave = false } = {}) {
  const html = read("index.html");
  /** @type {Map<string, Element>} */
  const nodes = new Map();
  /** @type {Map<string, Element[]>} */
  const lists = new Map();
  /** @type {Map<string | undefined, Blob>} */
  const blobs = new Map();
  /** @type {{ name: string | undefined, blob: Blob | undefined }[]} */
  const saved = [];
  /** @type {string[]} */
  const copied = [];
  /** @param {string} id */
  const byId = (id) => { if (!nodes.has(id)) nodes.set(id, new Element()); return /** @type {Element} */ (nodes.get(id)); };
  for (const [selector, items] of Object.entries(controls)) lists.set(selector, items.map((d) => Object.assign(new Element("button"), { dataset: { ...d } })));
  const document = {
    body: new Element("body"), modelContext: undefined,
    getElementById: byId,
    querySelector: (/** @type {string} */ s) => (/^#[\w-]+$/.test(s) ? byId(s.slice(1)) : null),
    querySelectorAll: (/** @type {string} */ s) => lists.get(s) || [],
    createElementNS: (/** @type {string} */ _, /** @type {string} */ tag) => new Element(tag),
    /** @param {string} tag */
    createElement(tag) {
      // The page sets an anchor's download and href as plain properties.
      const e = /** @type {Element & { download?: string, href?: string }} */ (new Element(tag));
      if (tag === "a") e.click = () => saved.push({ name: e.download, blob: blobs.get(e.href) });
      return e;
    },
  };
  let n = 0;
  const context = vm.createContext({
    document, console, Blob, JSON, Math,
    navigator: { clipboard: { writeText: async (/** @type {string} */ t) => { copied.push(t); } } },
    URL: { createObjectURL: (/** @type {Blob} */ b) => { if (blockSave) throw new Error("download blocked"); const href = `blob:${++n}`; blobs.set(href, b); return href; }, revokeObjectURL() {} },
    setTimeout: () => 0, addEventListener() {},
  });
  context.window = context.self = context;
  for (const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) vm.runInContext(m[1], context);
  const $ = byId;
  /** @param {string} selector @param {string} key @param {string} value */
  const pick = (selector, key, value) => {
    const el = lists.get(selector)?.find((e) => e.dataset[key] === value);
    assert.ok(el, `${SLUG}: a ${selector} with ${key} ${value}`);
    return el;
  };
  /** @returns {Promise<void>} */
  const settle = () => new Promise((r) => setImmediate(r));
  return {
    saved, copied, $, pick,
    click: async (/** @type {Element} */ el) => { await el.fire("click"); await settle(); },
    /* Clicks beamdswitch then Copy deck, and returns the saved file and the copied text. */
    async exportDeck() {
      const before = saved.length;
      await this.click($("save-beamdswitch"));
      assert.equal(saved.length, before + 1, `${SLUG}: one download per click`);
      const file = saved.at(-1), status = $("deck-status").textContent;
      assert.ok(file?.blob, `${SLUG}: the download holds a deck`);
      await this.click($("copy-beamdswitch"));
      return { name: file.name, text: await file.blob.text(), status, copied: copied.at(-1) };
    },
  };
}

/* On a page whose download is blocked, the beamdswitch button saves nothing, writes nothing to the
   clipboard on its own, and points to Copy deck. */
/** @param {Record<string, Record<string, string>[]>} [controls] */
export async function assertBlockedSave(controls) {
  const page = openPage(controls, { blockSave: true });
  await page.click(page.$("save-beamdswitch"));
  assert.deepEqual([page.saved.length, page.copied.length], [0, 0], `${SLUG}: nothing saved or copied`);
  assert.equal(page.$("deck-status").textContent, "Could not save the beamdswitch deck here: use Copy deck to paste it into beamdswitch.", SLUG);
}
