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
/** @import { Deck, DeckNode } from "./fixtures/beamdswitch/deck.mjs" */
/** @typedef {Extract<DeckNode, { type: "div" }>} DeckDiv */

const root = new URL("../", import.meta.url);
/** @param {string} path */
export const read = (path) => readFileSync(new URL(path, root), "utf8");
const require = createRequire(import.meta.url);
/** A CommonJS script of this repository, by path from its root. @param {string} path @returns {any} its exports, untyped here; callers name the API they use */
export const load = (path) => require(fileURLToPath(new URL(path, root)));
const TEMPLATE_PATH = "tests/fixtures/beamdswitch/beamdswitch.js";
const SECTIONS = /** @type {import("./beamdswitch-template").BeamdswitchTemplate} */ (require(`../${TEMPLATE_PATH}`)).SECTIONS.map(([, title]) => title);

// A site checkout to compare against as well, when one is at hand: SITE_REPO, or a sibling `site`.
const siteRepo = process.env.SITE_REPO || fileURLToPath(new URL("../../../../site/", import.meta.url));
const SITE_TEMPLATE = `${siteRepo.replace(/\/$/, "")}/templates/beamdswitch.js`;
const haveSite = existsSync(SITE_TEMPLATE);

// The copy matches a site checkout's templates/beamdswitch.js.
/** @param {string} copy @param {string} sitePath @param {string} what */
function assertSiteTemplate(copy, sitePath, what) {
  assert.equal(copy, readFileSync(sitePath, "utf8"), `the site's templates/beamdswitch.js and ${what} must stay identical`);
}

// Every deck names its narrator, so beamdswitch never narrates in silence: a voice id such as bf_emma.
/** @param {Deck} deck @param {string} what */
function assertVoice(deck, what) {
  assert.match(deck.meta.voice ?? "", /^[a-z]{2}_[a-z]+$/, `${what}: declares a voice in its front matter`);
}

// The folder's beamdswitch.js is the site's shared template, unchanged.
/** @param {string} slug */
export function assertTemplateCopy(slug) {
  const copy = read(`beamdswitch.js`);
  assert.equal(copy, read(TEMPLATE_PATH), `${TEMPLATE_PATH} and beamdswitch.js must stay identical`);
  if (haveSite) assertSiteTemplate(copy, SITE_TEMPLATE, `beamdswitch.js`);
}

/** @param {DeckNode[]} children @param {string} name @param {DeckDiv[]} [out] @returns {DeckDiv[]} */
const divs = (children, name, out = []) => {
  for (const c of children) if (c.type === "div") { if (c.name === name) out.push(c); divs(c.children, name, out); }
  return out;
};

// The deck opens in beamdswitch as the standard template: title slide, the four sections in order,
// every slide narrated in plain spoken prose written in the deck, ending on one ::: key, with a voice.
/** @param {string} md @param {string} what */
export function assertStandardDeck(md, what) {
  const deck = parseDeck(md);
  assertVoice(deck, what);
  assert.equal(deck.frames[0].kind, "title", what);
  assert.ok(deck.meta.title, `${what}: has a title`);
  assert.deepEqual(deck.frames.filter((f) => f.kind === "section").map((f) => f.title), SECTIONS, what);
  assert.equal(md.match(/^::: narration$/gm)?.length, deck.frames.length, `${what}: one ::: narration per slide`);
  for (const f of deck.frames) {
    assert.ok(splitSentences(f.narration).length > 0, `${what}: "${f.title}" is narrated`);
    assert.doesNotMatch(f.narration, /[$\\`*_#|<>×⁰¹²³⁴⁵⁶⁷⁸⁹⁻%&≈·∠°σ£€µ]/, `${what}: "${f.title}" reads as speech: ${f.narration}`);
  }
  for (const s of SECTIONS) assert.ok(deck.frames.some((f) => f.kind === "frame" && f.section === s), `${what}: ${s} has a frame`);
  const last = deck.frames[deck.frames.length - 1];
  assert.equal(last.section, SECTIONS.at(-1), what);
  assert.equal(divs(last.children, "key").length, 1, `${what}: ends on a ::: key`);
  return deck;
}

// A permissive stand-in DOM: every element accepts any property, call or listener, and remembers what is set on it.
/**
 * @param {unknown} tag @param {Record<string, unknown>} [store]
 * @returns {any} a stand-in element that answers any property, call or listener, so its uses stay untyped
 */
function element(tag, store = {}) {
  /** @type {Record<string, ((event: object) => unknown)[]>} */
  const listeners = {};
  const calls = new Map(), kids = new Map();
  /** @type {Record<string | symbol, any>} the element's own state: whatever the page script sets */
  const own = {
    tagName: String(tag).toUpperCase(), localName: tag, textContent: "", value: "", innerHTML: "", checked: false, hidden: false,
    disabled: false, firstChild: null, lastChild: null, nextSibling: null, previousSibling: null,
    length: 0, dataset: {}, children: [], childNodes: [], then: undefined,
    listeners, append: (/** @type {unknown[]} */ ...more) => { own.children = [...own.children, ...more]; },
    replaceChildren: (/** @type {unknown[]} */ ...more) => { own.children = more; },
    addEventListener: (/** @type {string} */ type, /** @type {(event: object) => unknown} */ fn) => (listeners[type] ??= []).push(fn),
    removeEventListener() {},
    setAttribute: (/** @type {string} */ key, /** @type {unknown} */ v) => { own[key] = String(v); },
    getAttribute: (/** @type {string} */ key) => (key in own ? String(own[key]) : null),
    dispatch: (/** @type {string} */ type) => Promise.all((listeners[type] || []).map((fn) => fn({ type, target: self, currentTarget: self, preventDefault() {}, stopPropagation() {} }))),
    [Symbol.iterator]: function* () {},
    [Symbol.toPrimitive]: (/** @type {string} */ hint) => (hint === "number" ? 0 : ""),
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
    apply(_, __, /** @type {unknown[]} */ args) {
      const k = args.map((a) => (typeof a === "string" || typeof a === "number" ? a : typeof a)).join("\u0000");
      if (!calls.has(k)) calls.set(k, element("div"));
      return calls.get(k);
    },
  });
  return self;
}

// Runs a built page's scripts in the stand-in DOM. The page's own <button>s stand in with their attributes,
// data-* and text, found by id or by a [data-*] selector. click(id) clicks a button and waits for its handlers;
// saved holds each downloaded file's text and copied each clipboard write.
/** @param {string} slug */
export async function openPage(slug) {
  const html = read(`index.html`);
  /** @type {Map<string, any>} */
  const byId = new Map();
  /** @type {Map<string, any>} */
  const bySelector = new Map();
  /** @type {Map<string, Blob>} */
  const urls = new Map();
  /** @type {any[]} */
  const created = [];
  /** @type {{ name: string, text: string }[]} */
  const saved = [];
  /** @type {string[]} */
  const copied = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    const id = /\bid="([^"]+)"/.exec(m[1])?.[1];
    if (id) byId.set(id, element("script", { textContent: m[2] }));
  }
  /** @param {Map<string, any>} map @param {string} key */
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
    getElementById: (/** @type {string} */ id) => get(byId, id),
    createTextNode: (/** @type {unknown} */ text) => element("#text", { textContent: String(text), nodeType: 3 }),
    querySelector: (/** @type {string} */ s) => (/^#[\w-]+$/.test(s) ? get(byId, s.slice(1)) : get(bySelector, s)),
    querySelectorAll: (/** @type {string} */ s) => {
      const m = /^(\w*)\[data-([\w-]+)\]$/.exec(s);
      return m ? created.filter((e) => (!m[1] || e.localName === m[1]) && m[2] in e.dataset) : get(bySelector, `all ${s}`);
    },
    createElementNS: (/** @type {string} */ _, /** @type {string} */ tag) => element(tag),
    createElement: (/** @type {string} */ tag) => {
      const e = element(tag);
      created.push(e);
      if (tag === "a") e.click = async () => saved.push({ name: e.download, text: await /** @type {Blob} */ (urls.get(e.href)).text() });
      return e;
    },
  });
  const context = vm.createContext({
    document, console, Intl, Blob, URLSearchParams, TextEncoder, JSON, Math, Date,
    navigator: { clipboard: { writeText: async (/** @type {string} */ text) => { copied.push(text); } } },
    location: { hash: "", search: "", pathname: `/`, href: `https://example.test/` },
    history: { replaceState() {}, pushState() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    URL: Object.assign(function (/** @type {string} */ u) { return new URL(u); }, {
      createObjectURL(/** @type {Blob} */ blob) { const url = `blob:${urls.size}`; urls.set(url, blob); return url; }, revokeObjectURL() {} }),
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    matchMedia: () => element("media", { matches: false }), getComputedStyle: () => element("style"), Event: class { constructor(/** @type {string} */ type) { this.type = type; } },
    addEventListener() {}, removeEventListener() {}, scrollTo() {}, innerWidth: 1200, innerHeight: 800, scrollX: 0, scrollY: 0, devicePixelRatio: 1,
    ResizeObserver: class { observe() {} disconnect() {} }, IntersectionObserver: class { observe() {} disconnect() {} },
  });
  context.window = context.self = context.globalThis = context;
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) if (!/\bsrc=|type="application\/json"/.test(m[1])) vm.runInContext(m[2], context);
  const click = async (/** @type {string} */ id) => { await get(byId, id).dispatch("click"); await new Promise((r) => setImmediate(r)); };
  return { click, saved, copied };
}

// Clicking beamdswitch downloads the deck of the page as set; Copy deck puts that same deck on the clipboard.
/** @param {Awaited<ReturnType<typeof openPage>>} page @param {string} slug @param {string} expected */
export async function assertButtonsExport(page, slug, expected) {
  await page.click("save-beamdswitch");
  assert.deepEqual(page.saved, [{ name: `${slug}-beamdswitch.md`, text: expected }]);
  await page.click("copy-beamdswitch");
  assert.deepEqual(page.copied, [expected]);
}

// The page's deck-row matches the site's: a beamdswitch button, a Copy deck button and a status line,
// and the hint never claims the download falls back to the clipboard.
/** @param {string} html @param {string} what */
export function assertDeckButtons(html, what) {
  assert.match(html, /<button type="button" id="save-beamdswitch"[^>]*>beamdswitch<\/button>/, what);
  assert.match(html, /<button type="button" id="copy-beamdswitch"[^>]*>Copy deck<\/button>/, what);
  assert.match(html, /id="deck-status"[^>]*role="status"/, what);
  assert.ok(html.includes('href="https://teoyujie.org/visuals/beamdswitch/"'), `${what}: links beamdswitch`);
  assert.doesNotMatch(html, /saving is blocked|copied (it )?instead|falls? back to the clipboard/i, `${what}: no clipboard-fallback claim`);
}
