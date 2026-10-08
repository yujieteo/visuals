// Shared checks for the visualisations' beamdswitch decks. Each page inlines the site's standard
// report template (viz/<slug>/beamdswitch.js, a copy of the site's templates/beamdswitch.js, vendored
// here as tests/fixtures/beamdswitch/beamdswitch.js) and decks are parsed with beamdswitch's own
// parser (read-only copies in tests/fixtures/beamdswitch/), as the site's tests do.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { parseDeck, splitSentences } from "./fixtures/beamdswitch/deck.mjs";

const root = new URL("../", import.meta.url);
export const read = (path) => readFileSync(new URL(path, root), "utf8");
export const require = createRequire(import.meta.url);
const TEMPLATE_PATH = "tests/fixtures/beamdswitch/beamdswitch.js";
const SECTIONS = require(`../${TEMPLATE_PATH}`).SECTIONS.map(([, title]) => title);

// A site checkout to compare against as well, when one is at hand: SITE_REPO, or a sibling `site`.
const siteRepo = process.env.SITE_REPO || fileURLToPath(new URL("../../../../site/", import.meta.url));
const SITE_TEMPLATE = `${siteRepo.replace(/\/$/, "")}/templates/beamdswitch.js`;
const haveSite = existsSync(SITE_TEMPLATE);

// Every deck names its narrator, so beamdswitch never narrates in silence: a voice id such as bf_emma.
function assertVoice(deck, what) {
  assert.match(deck.meta.voice ?? "", /^[a-z]{2}_[a-z]+$/, `${what}: declares a voice in its front matter`);
}

// The folder's beamdswitch.js is the site's shared template, unchanged.
export function assertTemplateCopy(slug) {
  const copy = read(`beamdswitch.js`);
  assert.equal(copy, read(TEMPLATE_PATH), `${TEMPLATE_PATH} and beamdswitch.js must stay identical`);
  if (haveSite) assert.equal(copy, readFileSync(SITE_TEMPLATE, "utf8"), "the site's templates/beamdswitch.js and beamdswitch.js must stay identical");
}

// The page inlines each script verbatim in its own <script id="..."> block.

const divs = (children, name, out = []) => {
  for (const c of children) if (c.type === "div") { if (c.name === name) out.push(c); divs(c.children, name, out); }
  return out;
};

// The deck opens in beamdswitch as the standard template: title slide, the four sections in order,
// every slide narrated in plain spoken prose written in the deck, ending on one ::: key, with a voice.
export function assertStandardDeck(md, what) {
  const deck = parseDeck(md);
  assertVoice(deck, what);
  assert.equal(deck.frames[0].kind, "title", what);
  assert.ok(deck.meta.title, `${what}: has a title`);
  assert.deepEqual(deck.frames.filter((f) => f.kind === "section").map((f) => f.title), SECTIONS, what);
  assert.equal(md.match(/^::: narration$/gm).length, deck.frames.length, `${what}: one ::: narration per slide`);
  for (const f of deck.frames) {
    assert.ok(splitSentences(f.narration).length > 0, `${what}: "${f.title}" is narrated`);
    assert.doesNotMatch(f.narration, /[$\\`*_#|<>×⁰¹²³⁴⁵⁶⁷⁸⁹⁻%&≈·∠°σ£€µ]/, `${what}: "${f.title}" reads as speech: ${f.narration}`);
  }
  for (const s of SECTIONS) assert.ok(deck.frames.some((f) => f.kind === "frame" && f.section === s), `${what}: ${s} has a frame`);
  const last = deck.frames.at(-1);
  assert.equal(last.section, SECTIONS.at(-1), what);
  assert.equal(divs(last.children, "key").length, 1, `${what}: ends on a ::: key`);
  return deck;
}

// A permissive stand-in DOM: every element accepts any property, call or listener, and remembers what is set on it.
function element(tag, store = {}) {
  const listeners = {}, calls = new Map(), kids = new Map();
  const own = {
    tagName: String(tag).toUpperCase(), localName: tag, textContent: "", value: "", innerHTML: "", checked: false, hidden: false,
    disabled: false, firstChild: null, lastChild: null, nextSibling: null, previousSibling: null,
    length: 0, dataset: {}, children: [], childNodes: [], then: undefined,
    listeners, append: (...more) => { own.children = [...own.children, ...more]; },
    replaceChildren: (...more) => { own.children = more; },
    addEventListener: (type, fn) => (listeners[type] ??= []).push(fn),
    removeEventListener() {},
    setAttribute: (key, v) => { own[key] = String(v); },
    getAttribute: (key) => (key in own ? String(own[key]) : null),
    dispatch: (type) => Promise.all((listeners[type] || []).map((fn) => fn({ type, target: self, currentTarget: self, preventDefault() {}, stopPropagation() {} }))),
    [Symbol.iterator]: function* () {},
    [Symbol.toPrimitive]: (hint) => (hint === "number" ? 0 : ""),
    ...store,
  };
  const self = new Proxy(function () {}, {
    get(_, key) {
      if (key in own) return own[key];
      if (!kids.has(key)) kids.set(key, element(key));
      return kids.get(key);
    },
    set(_, key, v) { own[key] = v; return true; },
    has: () => true,
    apply(_, __, args) {
      const k = args.map((a) => (typeof a === "string" || typeof a === "number" ? a : typeof a)).join("\u0000");
      if (!calls.has(k)) calls.set(k, element("div"));
      return calls.get(k);
    },
  });
  return self;
}

// Runs a built page's scripts in the stand-in DOM. The page's own <button>s stand in with their attributes,
// data-* and text, found by id or by a [data-*] selector. click(id) clicks a button and waits for its handlers;
// press(match) clicks the latest drawn control that matches; saved holds each downloaded file's text and
// copied each clipboard write; run(code) evaluates code in the page's global scope.
export async function openPage(slug) {
  const html = read(`index.html`);
  const byId = new Map(), bySelector = new Map(), urls = new Map(), created = [], saved = [], copied = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    const id = /\bid="([^"]+)"/.exec(m[1])?.[1];
    if (id) byId.set(id, element("script", { textContent: m[2] }));
  }
  const get = (map, key) => { if (!map.has(key)) map.set(key, element("div")); return map.get(key); };
  for (const m of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
    const attrs = Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(([, k, v]) => [k, v]));
    const dataset = Object.fromEntries(Object.entries(attrs).filter(([k]) => k.startsWith("data-")).map(([k, v]) => [k.slice(5), v]));
    const b = element("button", { ...attrs, dataset, textContent: m[2].replace(/<[^>]*>/g, "") });
    created.push(b);
    if (attrs.id) byId.set(attrs.id, b);
  }
  const document = element("document", {
    body: element("body"), documentElement: element("html"), activeElement: null, modelContext: undefined,
    getElementById: (id) => get(byId, id),
    createTextNode: (text) => element("#text", { textContent: String(text), nodeType: 3 }),
    querySelector: (s) => (/^#[\w-]+$/.test(s) ? get(byId, s.slice(1)) : get(bySelector, s)),
    querySelectorAll: (s) => {
      const m = /^(\w*)\[data-([\w-]+)\]$/.exec(s);
      return m ? created.filter((e) => (!m[1] || e.localName === m[1]) && m[2] in e.dataset) : get(bySelector, `all ${s}`);
    },
    createElementNS: (_, tag) => element(tag),
    createElement: (tag) => {
      const e = element(tag);
      created.push(e);
      if (tag === "a") e.click = async () => saved.push({ name: e.download, text: await urls.get(e.href).text() });
      return e;
    },
  });
  const context = vm.createContext({
    document, console, Intl, Blob, URLSearchParams, TextEncoder, JSON, Math, Date,
    navigator: { clipboard: { writeText: async (text) => { copied.push(text); } } },
    location: { hash: "", search: "", pathname: `/`, href: `https://example.test/` },
    history: { replaceState() {}, pushState() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    URL: Object.assign(function (u) { return new URL(u); }, {
      createObjectURL(blob) { const url = `blob:${urls.size}`; urls.set(url, blob); return url; }, revokeObjectURL() {} }),
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    matchMedia: () => element("media", { matches: false }), getComputedStyle: () => element("style"), Event: class { constructor(type) { this.type = type; } },
    addEventListener() {}, removeEventListener() {}, scrollTo() {}, innerWidth: 1200, innerHeight: 800, scrollX: 0, scrollY: 0, devicePixelRatio: 1,
    ResizeObserver: class { observe() {} disconnect() {} }, IntersectionObserver: class { observe() {} disconnect() {} },
  });
  context.window = context.self = context.globalThis = context;
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) if (!/\bsrc=|type="application\/json"/.test(m[1])) vm.runInContext(m[2], context);
  const click = async (id) => { await get(byId, id).dispatch("click"); await new Promise((r) => setImmediate(r)); };
  const textOf = (e) => e.textContent + e.children.map(textOf).join("");
  const press = async (match) => {
    const e = created.findLast((x) => x.listeners.click && match({ attr: (k) => x.getAttribute(k), text: textOf(x) }));
    assert.ok(e, "the page drew the control");
    await e.dispatch("click");
  };
  return { run: (code) => vm.runInContext(code, context), click, press, saved, copied };
}

// Clicking beamdswitch downloads the deck of the page as set; Copy deck puts that same deck on the clipboard.
export async function assertButtonsExport(page, slug, expected) {
  await page.click("save-beamdswitch");
  assert.deepEqual(page.saved, [{ name: `${slug}-beamdswitch.md`, text: expected }]);
  await page.click("copy-beamdswitch");
  assert.deepEqual(page.copied, [expected]);
}
