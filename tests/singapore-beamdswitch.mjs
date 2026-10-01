// Shared checks for the beamdswitch decks of haze-singapore, singapore-covid-governance-hindsight,
// social-values-surveydata, tourist-attractions and graduate-employment-survey, adapted from the
// site's tests/data-visuals-beamdswitch.mjs. Each deck is parsed with beamdswitch's own parser,
// vendored read-only in tests/fixtures/beamdswitch/ with the site's report template.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { parseDeck, splitSentences } from "./fixtures/beamdswitch/deck.mjs";

const root = new URL("../", import.meta.url);
const require = createRequire(import.meta.url);
export const read = (path) => readFileSync(new URL(path, root), "utf8");
export const load = (path) => require(new URL(path, root).pathname);
// The order of templates/beamdswitch-report.md in the site.
export const SECTIONS = ["Set-up", "Method", "Results", "Checks and takeaway"];

// The folder's beamdswitch.js is the site's shared template, unchanged. The vendored fixture is that
// template; set SITE_REPO to a site checkout to compare with its templates/beamdswitch.js directly.
export function assertTemplateCopy(slug) {
  const template = read("tests/fixtures/beamdswitch/beamdswitch.js");
  assert.equal(read(`viz/${slug}/beamdswitch.js`), template, `viz/${slug}/beamdswitch.js must stay identical to the site's templates/beamdswitch.js`);
  const site = process.env.SITE_REPO && new URL(`file://${process.env.SITE_REPO.replace(/\/?$/, "/")}templates/beamdswitch.js`);
  if (site && existsSync(site)) assert.equal(template, readFileSync(site, "utf8"), "tests/fixtures/beamdswitch/beamdswitch.js must match the site's template");
}

// The page inlines each script verbatim in its own <script id="..."> block.
export function assertInlined(html, id, source, what) {
  const m = new RegExp(`<script id="${id}">\\n([\\s\\S]*?)</script>`).exec(html);
  assert.ok(m, `${what}: the page has a <script id="${id}"> block`);
  assert.equal(m[1], source, `${what}: the page inlines ${id} unchanged`);
}

const divs = (children, name, out = []) => {
  for (const c of children) if (c.type === "div") { if (c.name === name) out.push(c); divs(c.children, name, out); }
  return out;
};

// The deck opens in beamdswitch as the standard template: title slide, the four sections in order,
// every slide narrated in plain spoken prose written in the deck, ending on one ::: key.
export function assertStandardDeck(md, what) {
  const deck = parseDeck(md);
  assert.equal(deck.frames[0].kind, "title", what);
  assert.deepEqual(deck.frames.filter((f) => f.kind === "section").map((f) => f.title), SECTIONS, what);
  assert.equal(md.match(/^::: narration$/gm).length, deck.frames.length, `${what}: one ::: narration per slide`);
  for (const f of deck.frames) {
    assert.ok(splitSentences(f.narration).length > 0, `${what}: "${f.title}" is narrated`);
    assert.doesNotMatch(f.narration, /[$\\`*_#|<>×⁰¹²³⁴⁵⁶⁷⁸⁹⁻%&≈µ³]/, `${what}: "${f.title}" reads as speech: ${f.narration}`);
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
    listeners, append: (...kids) => { own.children = [...own.children, ...kids]; },
    addEventListener: (type, fn) => (listeners[type] ??= []).push(fn),
    removeEventListener() {},
    setAttribute: (key, v) => { own[key] = String(v); },
    getAttribute: (key) => (key in own ? String(own[key]) : null),
    dispatch: (type, event = {}) => Promise.all((listeners[type] || []).map((fn) => fn({ type, target: self, currentTarget: self, preventDefault() {}, stopPropagation() {}, ...event }))),
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
// Runs a built page's inline scripts in the stand-in DOM. click(id) clicks a button and waits for its handlers;
// saved holds each downloaded file's text and copied each clipboard write. globals adds stand-ins (such as d3).
export async function openPage(slug, { globals = {} } = {}) {
  const html = read(`viz/${slug}/index.html`);
  const byId = new Map(), bySelector = new Map(), urls = new Map(), saved = [], copied = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    const id = /\bid="([^"]+)"/.exec(m[1])?.[1];
    if (id) byId.set(id, element("script", { textContent: m[2] }));
  }
  const get = (map, key) => { if (!map.has(key)) map.set(key, element("div")); return map.get(key); };
  const document = element("document", {
    body: element("body"), documentElement: element("html"), activeElement: null, modelContext: undefined,
    getElementById: (id) => get(byId, id),
    querySelector: (s) => (/^#[\w-]+$/.test(s) ? get(byId, s.slice(1)) : get(bySelector, s)),
    querySelectorAll: () => [],
    createElement: (tag) => {
      const e = element(tag);
      if (tag === "a") e.click = async () => saved.push({ name: e.download, text: await urls.get(e.href).text() });
      return e;
    },
  });
  const context = vm.createContext({
    document, console, Intl, Blob, URLSearchParams, TextEncoder, JSON, Math, Date,
    navigator: { clipboard: { writeText: async (text) => { copied.push(text); } } },
    location: { hash: "", search: "", pathname: `/viz/${slug}/`, href: `https://example.org/viz/${slug}/` },
    history: { replaceState() {}, pushState() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    URL: Object.assign(function (u) { return new URL(u); }, {
      createObjectURL(blob) { const url = `blob:${urls.size}`; urls.set(url, blob); return url; }, revokeObjectURL() {} }),
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    performance: { now: () => 0 },
    matchMedia: () => element("media", { matches: false }), getComputedStyle: () => element("style"),
    addEventListener() {}, removeEventListener() {}, scrollTo() {}, innerWidth: 1200, innerHeight: 800, scrollX: 0, scrollY: 0, devicePixelRatio: 1,
    ResizeObserver: class { observe() {} disconnect() {} }, IntersectionObserver: class { observe() {} disconnect() {} },
    ...globals,
  });
  context.window = context.self = context.globalThis = context;
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) if (!/\bsrc=|type="application\/json"/.test(m[1])) vm.runInContext(m[2], context);
  const click = async (id) => { await get(byId, id).dispatch("click"); await new Promise((r) => setImmediate(r)); };
  return { html, run: (code) => vm.runInContext(code, context), click, saved, copied };
}

// Clicking beamdswitch downloads the deck of the page as set; Copy deck puts that same deck on the clipboard.
export async function assertButtonsExport(page, slug, expected) {
  await page.click("save-beamdswitch");
  assert.deepEqual(page.saved, [{ name: `${slug}-beamdswitch.md`, text: expected }]);
  await page.click("copy-beamdswitch");
  assert.deepEqual(page.copied, [expected]);
}

// The page's deck-row matches the site's: a beamdswitch button, a Copy deck button and a status line,
// and the hint never claims the download falls back to the clipboard.
export function assertDeckButtons(html, what) {
  assert.match(html, /<button type="button" id="save-beamdswitch"[^>]*>beamdswitch<\/button>/, what);
  assert.match(html, /<button type="button" id="copy-beamdswitch"[^>]*>Copy deck<\/button>/, what);
  assert.match(html, /id="deck-status"[^>]*role="status"/, what);
  assert.ok(html.includes('href="https://teoyujie.org/visuals/beamdswitch/"'), `${what}: links beamdswitch`);
  assert.doesNotMatch(html, /saving is blocked|copied (it )?instead|falls? back to the clipboard/i, `${what}: no clipboard-fallback claim`);
}
