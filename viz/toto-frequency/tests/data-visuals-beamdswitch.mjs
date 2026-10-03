// Shared checks for this visualisation's beamdswitch deck (ported from yujieteo/site tests/data-visuals-beamdswitch.mjs).
// The deck is parsed with beamdswitch's own parser, vendored read-only in tests/fixtures/beamdswitch/, and the folder's
// beamdswitch.js is compared against the vendored copy of the site's templates/beamdswitch.js there.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { parseDeck, splitSentences } from "./fixtures/beamdswitch/deck.mjs";

const root = new URL("../", import.meta.url);
export const read = (path) => readFileSync(new URL(path, root), "utf8");
const skeleton = read("tests/fixtures/beamdswitch/report-template.md");
export const SECTIONS = [...skeleton.matchAll(/^# (.+)$/gm)].map((m) => m[1]);

// The folder's beamdswitch.js is the site's shared template, unchanged (the vendored copy in tests/fixtures/beamdswitch/).
export function assertTemplateCopy(slug) {
  assert.equal(read("beamdswitch.js"), read("tests/fixtures/beamdswitch/beamdswitch.js"),
    `tests/fixtures/beamdswitch/beamdswitch.js and beamdswitch.js must stay identical (${slug})`);
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
// a narration voice named, every slide narrated in plain spoken prose written in the deck, ending on one ::: key.
export function assertStandardDeck(md, what) {
  const deck = parseDeck(md);
  assert.equal(deck.frames[0].kind, "title", what);
  assert.match(deck.meta.voice ?? "", /^[a-z]{2}_[a-z]+$/, `${what}: names its narration voice`);
  assert.deepEqual(deck.frames.filter((f) => f.kind === "section").map((f) => f.title), SECTIONS, what);
  assert.equal(md.match(/^::: narration$/gm).length, deck.frames.length, `${what}: one ::: narration per slide`);
  for (const f of deck.frames) {
    assert.ok(splitSentences(f.narration).length > 0, `${what}: "${f.title}" is narrated`);
    assert.doesNotMatch(f.narration, /[$\\`*_#|<>×⁰¹²³⁴⁵⁶⁷⁸⁹⁻%&≈]/, `${what}: "${f.title}" reads as speech: ${f.narration}`);
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

// Runs a built page's scripts in the stand-in DOM. click(id) clicks a button and waits for its handlers;
// saved holds each downloaded file's text and copied each clipboard write. A modelContext, if given,
// receives the page's WebMCP tool registrations.
export async function openPage(slug, { modelContext } = {}) {
  const html = read("index.html");
  const byId = new Map(), bySelector = new Map(), urls = new Map(), created = [], saved = [], copied = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    const id = /\bid="([^"]+)"/.exec(m[1])?.[1];
    if (id) byId.set(id, element("script", { textContent: m[2] }));
  }
  const get = (map, key) => { if (!map.has(key)) map.set(key, element("div")); return map.get(key); };
  const document = element("document", {
    body: element("body"), documentElement: element("html"), activeElement: null, modelContext,
    getElementById: (id) => get(byId, id),
    createTextNode: (text) => element("#text", { textContent: String(text), nodeType: 3 }),
    querySelector: (s) => (/^#[\w-]+$/.test(s) ? get(byId, s.slice(1)) : get(bySelector, s)),
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
    location: { hash: "", search: "", pathname: `/visuals/${slug}/`, href: `https://teoyujie.org/visuals/${slug}/` },
    history: { replaceState() {}, pushState() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    URL: Object.assign(function (u) { return new URL(u); }, {
      createObjectURL(blob) { const url = `blob:${urls.size}`; urls.set(url, blob); return url; }, revokeObjectURL() {} }),
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    matchMedia: () => element("media", { matches: false }), getComputedStyle: () => element("style"),
    addEventListener() {}, removeEventListener() {}, scrollTo() {}, innerWidth: 1200, innerHeight: 800, scrollX: 0, scrollY: 0, devicePixelRatio: 1,
    ResizeObserver: class { observe() {} disconnect() {} }, IntersectionObserver: class { observe() {} disconnect() {} },
  });
  context.window = context.self = context.globalThis = context;
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) if (!/type="application\/json"/.test(m[1])) vm.runInContext(m[2], context);
  const click = async (id) => { await get(byId, id).dispatch("click"); await new Promise((r) => setImmediate(r)); };
  // Clicks the latest drawn control whose attributes and text match, as the page redraws its controls.
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
