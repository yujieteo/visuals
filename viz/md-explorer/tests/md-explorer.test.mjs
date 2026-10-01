import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const raw = JSON.parse(await readFile(new URL("../raw.json", import.meta.url), "utf8"));
// Like the HTML tokenizer, a script element's text ends at the first "</script".
const script = (id) => new RegExp(`<script id="${id}">([\\s\\S]*?)</script`, "i").exec(html)[1];
const markedSrc = script("marked-lib");
const coreSrc = script("mdx-core");
const uiSrc = script("mdx-ui");
const ctx = {};
vm.createContext(ctx);
vm.runInContext(markedSrc, ctx);
vm.runInContext(coreSrc, ctx);
const C = ctx.MdxCore;

// Values come from another vm realm; compare them as plain JSON.
const J = (x) => JSON.parse(JSON.stringify(x));
const deq = (a, b, ...msg) => assert.deepEqual(J(a), J(b), ...msg);
const tabsWorld = (files) => {
  const tabs = Object.entries(files).map(([name, src], i) => ({ id: "t" + (i + 1), title: name, linkName: name, doc: C.parseDoc(src) }));
  return { tabs };
};
const nodes = (src) => C.parseDoc(src).nodes.map((n) => ({ slug: n.slug, title: n.title, depth: n.depth, parent: n.parent }));

test("marked is pinned, inlined unmodified and its licence is recorded", () => {
  assert.match(html, /marked v18\.0\.14/);
  assert.match(markedSrc, /^\/\*\*\n \* marked v18\.0\.14 - a markdown parser/);
  const sha = createHash("sha256").update(markedSrc).digest("hex");
  assert.ok(html.includes(`sha256 of the inlined script text\n  (the whole body of the marked-lib script element): ${sha}`), "recorded sha256 matches the inlined marked");
  assert.match(html, /marked licence \(MIT\)[\s\S]*Permission is hereby granted, free of charge/);
  assert.equal(C.META.parser.version, "18.0.14");
});

/* The page's UI script, run in a vm against a minimal DOM. Timers are fake;
   advance(ms) runs whatever falls due. Network APIs record any call. */
function bootPage(saved) {
  const net = [];
  const tools = [];
  const timers = new Map();
  let now = 0, seq = 0;
  const on = {};
  const els = {};
  const classList = () => { const set = new Set(); return { add: (...c) => c.forEach((x) => set.add(x)), remove: (...c) => c.forEach((x) => set.delete(x)), toggle: (c, f) => ((f ?? !set.has(c)) ? set.add(c) : set.delete(c)), contains: (c) => set.has(c) }; };
  const mkEl = (id) => {
    const l = {};
    return {
      id, value: "", textContent: "", innerHTML: "", checked: false, hidden: false, scrollTop: 0, dataset: {}, style: {}, classList: classList(), listeners: l,
      lastElementChild: { insertAdjacentHTML() {} },
      addEventListener(type, fn) { (l[type] ||= []).push(fn); },
      fire(type, ev = {}) { for (const fn of l[type] || []) fn(ev); },
      setAttribute() {}, removeAttribute() {}, getAttribute: () => null, querySelector: () => null, querySelectorAll: () => [],
      scrollIntoView() {}, focus() {}, select() {}, dispatchEvent() {},
    };
  };
  const byId = (id) => (els[id] ||= mkEl(id));
  const setTimeout = (fn, ms = 0) => { timers.set(++seq, { at: now + ms, fn }); return seq; };
  const clearTimeout = (id) => timers.delete(id);
  const advance = (ms) => {
    const end = now + ms;
    for (;;) {
      let due = null;
      for (const [id, t] of timers) if (t.at <= end && (!due || t.at < due[1].at)) due = [id, t];
      if (!due) break;
      timers.delete(due[0]);
      now = due[1].at;
      due[1].fn();
    }
    now = end;
  };
  let hash = "";
  const fire = (type) => { for (const fn of on[type] || []) fn({}); };
  const location = {
    get hash() { return hash; },
    set hash(h) { h = h[0] === "#" ? h : "#" + h; if (h !== hash) { hash = h; setTimeout(() => fire("hashchange")); } },
    replace(h) { hash = h; },
  };
  const ls = new Map(saved ? [["md-explorer-v1", JSON.stringify(saved)]] : []);
  const record = (name) => function () { net.push(name); };
  const g = {
    setTimeout, clearTimeout, location, console,
    history: { replaceState: (_s, _t, h) => { hash = h; }, back() {}, forward() {} },
    localStorage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: (k) => ls.delete(k) },
    document: { getElementById: byId, body: mkEl("body"), documentElement: mkEl("html"), createElement: mkEl, execCommand: () => false },
    navigator: { platform: "Linux", modelContext: { registerTool: (t) => tools.push(t) }, sendBeacon: record("sendBeacon") },
    addEventListener: (type, fn) => (on[type] ||= []).push(fn),
    matchMedia: () => ({ matches: false }),
    confirm: () => true,
    fetch: record("fetch"), XMLHttpRequest: record("XMLHttpRequest"), WebSocket: record("WebSocket"), EventSource: record("EventSource"), importScripts: record("importScripts"),
  };
  vm.createContext(g);
  vm.runInContext("var self = globalThis, window = globalThis;", g);
  for (const src of [markedSrc, coreSrc, uiSrc]) vm.runInContext(src, g);
  const tool = async (name, input) => JSON.parse((await tools.find((t) => t.name === name).execute(input)).content[0].text);
  const tabEvent = (id, part) => ({ target: { closest: (sel) => (sel === ".tab" ? { dataset: { id } } : sel === part ? {} : null) } });
  return {
    net, tools, advance, tool, ls, el: byId,
    type(text) { byId("editor").value = text; byId("editor").fire("input"); },
    clickTab(id) { byId("tabstrip").fire("click", tabEvent(id, ".name")); },
    closeTab(id) { byId("tabstrip").fire("click", tabEvent(id, ".close")); },
  };
}
const savedTabs = (files) => ({ v: 1, seq: files.length, active: "t1", tabs: files.map(([name, content], i) => ({ id: "t" + (i + 1), name, pinned: true, content, untitled: 0 })) });

test("the page is one offline file: every script is inline and runs, and nothing fetches", async () => {
  const doc = html.replace(/<!--[\s\S]*?-->/g, "");
  // Script elements as the HTML tokenizer sees them: each body runs to the first "</script".
  const scripts = [...doc.matchAll(/<script\b([^>]*)>[\s\S]*?<\/script/gi)].map((m) => m[1].trim());
  deq(scripts, ['id="marked-lib"', 'id="mdx-core"', 'id="mdx-ui"']);
  const rels = [...doc.matchAll(/<link\b[^>]*\brel="([^"]*)"[^>]*\bhref="([^"]*)"/gi)].map((m) => [m[1], m[2]]);
  deq(rels, [["icon", "data:,"]]);
  const meta = (name) => (new RegExp(`<meta (?:name|http-equiv)="${name}" content="([^"]*)">`).exec(doc) || [])[1];
  const csp = Object.fromEntries(meta("Content-Security-Policy").split(";").map((d) => d.trim().split(/\s+/)).filter((d) => d[0]).map(([k, ...v]) => [k, v]));
  // Nothing may load or connect except inline code and https (or data:) images.
  deq(csp, { "default-src": ["'none'"], "script-src": ["'unsafe-inline'"], "style-src": ["'unsafe-inline'"], "img-src": ["https:", "data:"], "base-uri": ["'none'"], "form-action": ["'none'"] });
  deq(Object.fromEntries(meta("viewport").split(",").map((kv) => kv.trim().split("="))), { width: "device-width", "initial-scale": "1" });

  const page = bootPage();
  page.type("# Edited\n\n[x](https://example.com) ![i](https://example.com/i.png)");
  page.advance(1000);
  page.clickTab("t2");
  page.advance(1000);
  for (const t of page.tools) await t.execute({ query: "link", markdown: "# M", tabId: "t1" });
  deq(page.net, []);
});

test("raw.json is the engine's META and the page registers exactly its WebMCP tools", async () => {
  deq(raw, C.META);
  const page = bootPage();
  deq(page.tools.map((t) => t.name).sort(), [...C.META.webmcp_tools].sort());
  deq(await page.tool("get_metadata"), C.META);
  deq((await page.tool("list_tabs")).tabs.map((t) => t.title), C.DEMO_TABS.map((t) => t.name));
});

test("closing the only tab loads the demo into the editor, so edits go to the demo tab", async () => {
  const page = bootPage(savedTabs([["mine.md", "# Mine"]]));
  assert.equal(page.el("editor").value, "# Mine");
  page.closeTab("t1");
  page.advance(1000);
  const tabs = await page.tool("list_tabs");
  assert.equal(page.el("editor").value, C.DEMO_TABS[0].content);
  page.type(page.el("editor").value + "\n\n## Added");
  page.advance(1000);
  const saved = JSON.parse(page.ls.get("md-explorer-v1"));
  assert.equal(saved.tabs.find((t) => t.id === tabs.active).content, C.DEMO_TABS[0].content + "\n\n## Added");
});

test("switching tabs right after typing still reparses the edited tab", async () => {
  const page = bootPage(savedTabs([["a.md", "# A"], ["b.md", "# B\n\n[to a](a.md#a2)"]]));
  page.type("# A\n\n## A2");
  page.advance(100);
  page.clickTab("t2");
  page.advance(1000);
  const [a] = (await page.tool("get_outline", { tabId: "t1" })).outline;
  deq([a.slug, a.children.map((n) => n.slug)], ["a", ["a2"]]);
  assert.equal((await page.tool("list_tabs")).active, "t2");
  assert.match(page.el("doc").innerHTML, /<a class="int" href="#\/tab\/t1\/a2">to a<\/a>/);
});

test("GitHub-style slugs, duplicates suffixed -1, -2 per tab", () => {
  const s = C.makeSlugger();
  assert.equal(s("Hello, World!"), "hello-world");
  assert.equal(s("Hello World"), "hello-world-1");
  assert.equal(s("hello world"), "hello-world-2");
  assert.equal(s("  Spaces  twice "), "--spaces--twice-");
  assert.equal(s("Café & naïve_ok"), "café--naïve_ok");
  assert.equal(s("Über-cool 2.0"), "über-cool-20");
  deq(nodes("# A\n# A\n# A").map((n) => n.slug), ["a", "a-1", "a-2"]);
  // Slugs come from the heading's text, not its markup; entities decode.
  deq(nodes("# The *big* `code` [link](x) & more &amp; less").map((n) => n.slug), ["the-big-code-link--more--less"]);
});

test("section tree: Intro, skipped levels, multiple H1s, fenced headings", () => {
  const src = "Before any heading.\n\n# One\n\n### Deep\n\ntext\n\n## Two\n\n```\n# not a heading\n## nor this\n```\n\n~~~\n# nor this\n~~~\n\n    # indented code\n\n# Three\n\nSetext\n------\n";
  deq(nodes(src), [
    { slug: "", title: "Intro", depth: 0, parent: -1 },
    { slug: "one", title: "One", depth: 1, parent: -1 },
    { slug: "deep", title: "Deep", depth: 3, parent: 1 },
    { slug: "two", title: "Two", depth: 2, parent: 1 },
    { slug: "three", title: "Three", depth: 1, parent: -1 },
    { slug: "setext", title: "Setext", depth: 2, parent: 4 },
  ]);
  const d = C.parseDoc(src);
  deq(d.roots, [0, 1, 4]);
  deq(C.subtree(d, 1), [1, 2, 3]);
  // The Deep section ends where Two starts; One's subtree runs to Three.
  assert.equal(d.nodes[2].end, d.nodes[3].start);
  assert.equal(d.nodes[1].subEnd, d.nodes[4].start);
  assert.match(d.nodes[3].text, /# not a heading/);
  // No Intro when only whitespace or link definitions precede the first heading.
  deq(nodes("\n\n[x]: https://a.example\n\n# H").map((n) => n.slug), ["h"]);
  deq(nodes(""), []);
  // A heading of only punctuation keeps a slug distinct from the Intro's.
  deq(nodes("intro\n\n# !!!").map((n) => n.slug), ["", "-1"]);
});

test("the H1 names an untitled tab; pinned names win; Untitled numbering", () => {
  const d = C.parseDoc("text\n\n## Sub\n\n# First *H1*\n\n# Second");
  assert.equal(C.tabTitle({ pinned: false, untitled: 1 }, d), "First H1");
  assert.equal(C.tabTitle({ pinned: true, name: "notes.md" }, d), "notes.md");
  assert.equal(C.tabTitle({ pinned: false, untitled: 1 }, C.parseDoc("## no h1")), "Untitled");
  assert.equal(C.tabTitle({ pinned: false, untitled: 3 }, C.parseDoc("")), "Untitled 3");
  assert.equal(C.nextUntitled([{ untitled: 1 }, { untitled: 2 }, { untitled: 4 }]), 3);
});

test("keeping the reader's place: same slug, else nearest remaining heading", () => {
  const before = C.parseDoc("# A\n\n## B\n\ntext\n\n## C\n\n## D");
  const cIdx = before.bySlug.get("c");
  const after = C.parseDoc("# A\n\n## B\n\ntext\n\n## C renamed\n\n## D");
  const i = C.nearestNode(after, "c", before.nodes[cIdx].offset);
  assert.equal(after.nodes[i].slug, "c-renamed");
  // C removed: D now starts where C did, so it is the nearest remaining heading;
  // with more text in its place, the heading above the old position wins.
  const removed = C.parseDoc("# A\n\n## B\n\ntext\n\n## D");
  assert.equal(removed.nodes[C.nearestNode(removed, "c", before.nodes[cIdx].offset)].slug, "d");
  const shifted = C.parseDoc("# A\n\n## B\n\ntext and much more text\n\n## D");
  assert.equal(shifted.nodes[C.nearestNode(shifted, "c", before.nodes[cIdx].offset)].slug, "b");
  assert.equal(after.nodes[C.nearestNode(after, "d", 0)].slug, "d");
});

test("links: #anchor, other.md and other.md#anchor resolve; missing targets are broken", () => {
  const w = tabsWorld({ "guide.md": "# Guide\n\n## Dup\n\n## Dup\n", "Other.md": "Intro\n\n# Other\n\n## Part two" });
  const r = (href, from = "t1") => J(C.resolveLink(w, from, href));
  deq(r("#guide"), { kind: "internal", tabId: "t1", slug: "guide" });
  deq(r("#dup-1"), { kind: "internal", tabId: "t1", slug: "dup-1" });
  deq(r("other.md"), { kind: "internal", tabId: "t2", slug: "", whole: true });
  deq(r("OTHER.MD#part-two"), { kind: "internal", tabId: "t2", slug: "part-two" });
  deq(r("./docs/other.md#Part-Two"), { kind: "internal", tabId: "t2", slug: "part-two" });
  deq(r("other#part-two"), { kind: "internal", tabId: "t2", slug: "part-two" });
  deq(r("other.md#part%20two"), { kind: "internal", tabId: "t2", slug: "part-two" });
  deq(r("#"), { kind: "internal", tabId: "t1", slug: "guide", whole: true });
  assert.equal(r("#nope").kind, "broken");
  assert.match(r("#nope").reason, /No section "#nope" in guide\.md/);
  assert.equal(r("missing.md").kind, "broken");
  assert.match(r("missing.md#x").reason, /No tab named "missing\.md"/);
  assert.equal(r("other.md#nope").kind, "broken");
  assert.equal(r("https://example.com/a#b").kind, "external");
  assert.equal(r("mailto:a@b.example").kind, "external");
  // Tabs named only by their H1 are not link targets: only filenames and pinned names are.
  const w2 = { tabs: [{ id: "t1", title: "Notes", linkName: null, doc: C.parseDoc("# Notes") }] };
  assert.equal(C.resolveLink(w2, "t1", "notes.md").kind, "broken");
});

test("rendered links: in-app routes, external new tab, broken style with tooltip", () => {
  const w = tabsWorld({ "a.md": "# A\n\n[in](#b) [x](b.md#c) [ext](https://example.com) [bad](#zzz) [gone](gone.md) <https://auto.example>\n\n# B", "b.md": "# C" });
  const out = C.renderTokens(w.tabs[0].doc.tokens, w, "t1");
  assert.match(out, /<a class="int" href="#\/tab\/t1\/b">in<\/a>/);
  assert.match(out, /<a class="int" href="#\/tab\/t2\/c">x<\/a>/);
  assert.match(out, /<a class="ext" href="https:\/\/example\.com" target="_blank" rel="noopener noreferrer">ext<\/a>/);
  assert.match(out, /<a class="broken" aria-disabled="true" title="No section &quot;#zzz&quot; in a\.md">bad<\/a>/);
  assert.match(out, /<a class="broken" aria-disabled="true" title="No tab named &quot;gone\.md&quot;">gone<\/a>/);
  assert.match(out, /href="https:\/\/auto\.example" target="_blank" rel="noopener noreferrer"/);
  assert.match(out, /<h1 id="a">A<\/h1>/);
  // Reference-style links resolve like inline ones.
  const ref = C.renderMarkdown("# Top\n\n[go][t] and [ext][e]\n\n[t]: #top\n[e]: https://example.com");
  assert.match(ref, /<a class="int" href="#\/tab\/t\/top">go<\/a>/);
  assert.match(ref, /<a class="ext" href="https:\/\/example\.com"/);
});

test("backlinks list same-tab and cross-tab sections, labelled with the source tab", () => {
  const w = tabsWorld({
    "a.md": "# A\n\n## Target\n\n## Same\n\nsee [t](#target)",
    "b.md": "# B\n\n[t](a.md#target) and [whole](a.md)\n\n## Other\n\n[again](A.MD#Target)",
  });
  deq(C.backlinks(w, "t1", "target"), [
    { tabId: "t1", tabTitle: "a.md", slug: "same", title: "Same", crossTab: false },
    { tabId: "t2", tabTitle: "b.md", slug: "b", title: "B", crossTab: true },
    { tabId: "t2", tabTitle: "b.md", slug: "other", title: "Other", crossTab: true },
  ]);
  // A link to the whole tab counts as a link to its first section.
  deq(C.backlinks(w, "t1", "a").map((b) => b.slug), ["b"]);
});

test("the backlink index updates one tab at a time and matches a full rebuild", () => {
  const files = {
    "a.md": "# A\n\n## Target\n\nsee [t](#target)",
    "b.md": "# B\n\n[t](a.md#target) [c](c.md#c1)\n\n## Other\n\n[twice](a.md#target) [again](a.md#target)",
    "c.md": "# C\n\n## C1",
  };
  const w = tabsWorld(files);
  const idx = C.makeBacklinks();
  idx.build(w);
  const same = (label) => {
    for (const t of w.tabs) for (const n of t.doc.nodes) deq(idx.query(w, t.id, n.slug), C.backlinks(w, t.id, n.slug), `${label}: ${t.id}#${n.slug}`);
  };
  same("built");
  const edit = (i, src) => { w.tabs[i].doc = C.parseDoc(src); idx.refresh(w, w.tabs[i].id); };
  // The target heading is renamed away, then comes back under another tab's edit.
  edit(0, "# A\n\n## Moved\n\nsee [t](#target)");
  deq(idx.query(w, "t1", "target"), []);
  same("target renamed");
  edit(0, "# A\n\n## Target");
  deq(idx.query(w, "t1", "target").map((b) => b.slug), ["b", "other"]);
  same("target restored");
  // Links from the edited tab itself.
  edit(1, "# B\n\n[c](c.md)");
  deq(idx.query(w, "t3", "c").map((b) => b.slug), ["b"]);
  deq(idx.query(w, "t3", "c1"), []);
  same("source edited");
  // Renaming a tab re-resolves links by its old and new names.
  w.tabs[2].linkName = "d.md";
  idx.refresh(w, "t3");
  deq(idx.query(w, "t3", "c"), []);
  same("renamed");
  // Closing a tab removes its links; adding one resolves links that name it.
  w.tabs.splice(1, 1);
  idx.refresh(w, "t2");
  same("closed");
  w.tabs.push({ id: "t4", title: "c.md", linkName: "c.md", doc: C.parseDoc("# C again\n\n[back](a.md#target)") });
  idx.refresh(w, "t4");
  deq(idx.query(w, "t1", "target").map((b) => [b.tabId, b.slug]), [["t4", "c-again"]]);
  same("added");
});

test("tags: after whitespace or line start, not in code, URLs or links", () => {
  const d = C.parseDoc([
    "#start of line and #mid-word_1 plus #Caps",
    "",
    "no: a#b, (#paren), **x**#after, `#code`, https://x.example/#frag, [#linktext](https://y.example), <https://z.example/#auto>, \\#escaped, # heading-like, #1digit",
    "",
    "```",
    "#in-fence",
    "```",
    "",
    "    #indented-code",
    "",
    "- item #listed",
    "- [ ] task #tasked",
    "",
    "> quoted #quoted",
    "",
    "| a | b |",
    "|---|---|",
    "| #cell | ~~#struck~~ |",
    "",
    "# Heading #intitle",
    "",
    "Line one",
    "#second-line and *emph #inside*",
  ].join("\n"));
  const intro = d.nodes[0];
  deq(intro.tags.slice().sort(), ["caps", "cell", "listed", "mid-word_1", "quoted", "start", "tasked"].sort());
  const h = d.nodes[1];
  deq(h.tags.slice().sort(), ["inside", "intitle", "second-line"]);
  // The same scanner drives chips in the rendered HTML.
  const out = C.renderMarkdown("x #one `#two` [#three](https://a.example) #four");
  assert.match(out, /<a class="tag" href="#\/tag\/one" data-tag="one">#one<\/a>/);
  assert.match(out, /<a class="tag" href="#\/tag\/four" data-tag="four">#four<\/a>/);
  assert.doesNotMatch(out, /data-tag="two"|data-tag="three"/);
});

test("tag view groups matching sections by tab, with snippets", () => {
  const w = tabsWorld({ "a.md": "# A\n\nabout #x here\n\n## A2\n\nnone", "b.md": "# B\n\n## B1\n\nalso #X" });
  const g = J(C.tagSections(w, "x"));
  deq(g.map((t) => [t.tabTitle, t.hits.map((h) => h.slug)]), [["a.md", ["a"]], ["b.md", ["b1"]]]);
  deq(g[0].hits[0].snippet.find((s) => s.hl), { t: "#x", hl: true });
  deq(C.tagCounts(w.tabs.map((t) => t.doc)), [["x", 2]]);
});

test("search: tab titles and headings above tags, tags above body text; grouped by tab", () => {
  const w = tabsWorld({ "alpha.md": "# Alpha\n\n## Budget\n\nThe budget is fine.\n\n## Notes\n\n#budget item", "beta.md": "# Beta\n\nbudget talk here" });
  const idx = new Map(w.tabs.map((t) => [t.id, C.indexTab(t.id, t.title, t.doc)]));
  const hits = J(C.search(idx, "budget"));
  deq(hits.map((h) => [h.type, h.tabId, h.slug]), [
    ["heading", "t1", "budget"],
    ["tag", "t1", "notes"],
    ["text", "t1", "budget"],
    ["text", "t1", "notes"],
    ["text", "t2", "beta"],
  ]);
  deq(C.groupHits(hits).map((g) => [g.tabId, g.hits.length]), [["t1", 4], ["t2", 1]]);
  assert.equal(J(C.search(idx, "alpha"))[0].type, "tab");
  // Fuzzy: letters in order match headings; scattered letters do not.
  assert.equal(J(C.search(idx, "bdgt"))[0].slug, "budget");
  assert.equal(C.search(idx, "zzq").length, 0);
  // Narrowed to one tab.
  deq(J(C.search(idx, "budget", { tabId: "t2" })).map((h) => h.tabId), ["t2"]);
  // Body snippets highlight the match; multi-word queries need every word.
  const t = J(C.search(idx, "talk here"))[0];
  assert.equal(t.type, "text");
  assert.equal(t.snippet.find((s) => s.hl).t, "talk here");
  assert.equal(C.search(idx, "talk nowhere").length, 0);
  assert.equal(C.search(idx, "   ").length, 0);
});

test("routes: format, parse and fall back to the nearest valid parent", () => {
  deq(C.parseRoute("#/tab/t3/a%20b"), { kind: "tab", tabId: "t3", slug: "a b" });
  deq(C.parseRoute("#/tab/t3/"), { kind: "tab", tabId: "t3", slug: "" });
  deq(C.parseRoute("#/tab/t3"), { kind: "tab", tabId: "t3", slug: null });
  deq(C.parseRoute("#/tag/Foo"), { kind: "tag", name: "foo" });
  assert.equal(C.parseRoute("#hello"), null);
  assert.equal(C.formatRoute({ kind: "tab", tabId: "t1", slug: "café" }), "#/tab/t1/caf%C3%A9");
  assert.equal(C.formatRoute({ kind: "tag", name: "a-b" }), "#/tag/a-b");
  const w = tabsWorld({ "a.md": "# A\n\n## B", "b.md": "text\n\n# C" });
  deq(C.resolveRoute(w, { kind: "tab", tabId: "t1", slug: "b" }), { kind: "tab", tabId: "t1", slug: "b" });
  deq(C.resolveRoute(w, { kind: "tab", tabId: "t1", slug: "gone" }), { kind: "tab", tabId: "t1", slug: "a", fellBack: true });
  deq(C.resolveRoute(w, { kind: "tab", tabId: "t9", slug: "b" }), { kind: "tab", tabId: "t1", slug: "a", fellBack: true });
  deq(C.resolveRoute(w, { kind: "tab", tabId: "t2", slug: null }), { kind: "tab", tabId: "t2", slug: "", fellBack: false });
});

/* ---------- security ---------- */
const ALERT = /<(script|img|iframe|svg|a|div|b|style|object)\b[^>]*\b(on\w+|src|href)=/i;

test("pasted HTML never becomes elements: <script>, onerror= and friends render as text", () => {
  const src = [
    "<script>alert(1)</script>",
    "",
    "<img src=x onerror=alert(1)>",
    "",
    "inline <b onmouseover=alert(1)>bold</b> and <svg onload=alert(1)> and <iframe src=javascript:alert(1)></iframe>",
    "",
    "<div style=\"x\" onclick=\"alert(1)\">",
    "*md inside*",
    "</div>",
    "",
    "<!-- comment --> <style>body{display:none}</style>",
  ].join("\n");
  const out = C.renderMarkdown(src);
  assert.doesNotMatch(out, /<script|<img|<iframe|<svg|<style|<div style|<b /i);
  assert.match(out, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(out, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(out, /&lt;b onmouseover=alert\(1\)&gt;/);
  assert.doesNotMatch(out.replace(/&lt;[\s\S]*?&gt;/g, ""), ALERT);
});

test("only http, https, mailto and # links are live; javascript:, data: and others are inert text", () => {
  const bad = [
    "javascript:alert(1)", "JaVaScRiPt:alert(1)", "java&#x09;script:alert(1)", "&#106;avascript:alert(1)",
    "data:text/html,<script>alert(1)</script>", "vbscript:msgbox(1)", "file:///etc/passwd", "//evil.example/x",
    "%6a%61vascript:alert(1)",
  ];
  for (const href of bad) {
    const out = C.renderMarkdown(`[click](<${href}>) and [r][r]\n\n[r]: <${href}>`);
    assert.doesNotMatch(out, /<a\b[^>]*href=/, `${href} is not a live link: ${out}`);
  }
  const auto = C.renderMarkdown("<javascript:alert(1)> <data:text/html,x>");
  assert.doesNotMatch(auto, /<a\b/);
  assert.match(auto, /<span class="blocked"[^>]*>javascript:alert\(1\)<\/span>/);
  const ok = C.renderMarkdown("[m](mailto:a@b.example) [h](http://a.example) [s](https://a.example)");
  assert.equal((ok.match(/<a class="ext"/g) || []).length, 3);
  // classifyHref is what gates every href.
  for (const href of bad) assert.notEqual(C.classifyHref(href).kind, "external", href);
});

test("images: https only, lazy, alt kept; everything else is its alt text", () => {
  const out = C.renderMarkdown("![ok](https://a.example/i.png \"t\") ![plain](http://a.example/i.png) ![d](data:image/png;base64,AAAA) ![rel](i.png) ![js](javascript:alert(1)) ![p](//a.example/i.png)");
  assert.equal((out.match(/<img /g) || []).length, 1);
  assert.match(out, /<img src="https:\/\/a\.example\/i\.png" alt="ok" loading="lazy" referrerpolicy="no-referrer" title="t">/);
  for (const alt of ["plain", "d", "rel", "js", "p"]) assert.match(out, new RegExp(`<span class="img-alt"[^>]*>${alt}</span>`));
  // An attribute cannot be broken out of.
  const q = C.renderMarkdown('![a" onerror="alert(1)](https://a.example/"onerror="x)');
  assert.doesNotMatch(q, /" onerror="/);
});

test("task boxes are read-only, code blocks get a copy button, tables scroll in a wrapper", () => {
  const out = C.renderMarkdown("- [x] done\n- [ ] todo\n\n```js\nlet a = '<b>';\n```\n\n| a | b |\n|---|:-:|\n| 1 | ~~2~~ |");
  assert.match(out, /<input type="checkbox" disabled checked> done/);
  assert.match(out, /<input type="checkbox" disabled> todo/);
  assert.match(out, /<div class="codeblock"><span class="lang">js<\/span><button type="button" class="copy">Copy<\/button><pre><code>let a = &#39;&lt;b&gt;&#39;;<\/code><\/pre><\/div>/);
  assert.match(out, /<div class="tablewrap"><table>/);
  assert.match(out, /<del>2<\/del>/);
  assert.match(html, /\.tablewrap\{overflow-x:auto/);
});

test("the demo documents every feature and has no broken links except the deliberate ones", () => {
  const w = tabsWorld(Object.fromEntries(C.DEMO_TABS.map((t) => [t.name, t.content])));
  const all = C.DEMO_TABS.map((t) => t.content).join("\n");
  for (const re of [/^# /m, /^## /m, /\]\(#/, /\.md#/, / #[a-z]/, /^\| --- \|/m, /^- \[x\] /m, /^```/m]) assert.match(all, re);
  const broken = [];
  for (const t of w.tabs) for (const n of t.doc.nodes) for (const href of n.links) {
    const r = C.resolveLink(w, t.id, href);
    if (r.kind === "broken") broken.push(href);
  }
  deq(broken, ["#no-such-heading", "nowhere.md"]);
  // Cross-tab backlinks exist in the demo.
  assert.ok(C.backlinks(w, "t1", "links").some((b) => b.crossTab));
});

test("large input: ~5 MB and 1,000+ sections parse, index and search in reasonable time", () => {
  let src = "";
  let i = 0;
  while (src.length < 5e6) {
    i++;
    src += `## Section ${i} #tag${i % 40}\n\nSome **bold** text, a [link](#section-${Math.max(1, i - 1)}) and \`code\`.\n\n- item\n- [x] task\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n\`\`\`\ncode ${i}\n\`\`\`\n\n` + "Filler paragraph lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor.\n\n".repeat(30);
  }
  const t0 = performance.now();
  const doc = C.parseDoc(src);
  const idx = new Map([["t1", C.indexTab("t1", "big", doc)]]);
  const t1 = performance.now();
  const hits = C.search(idx, "section 999");
  const t2 = performance.now();
  assert.ok(doc.nodes.length >= 1000, `${doc.nodes.length} sections`);
  assert.equal(hits[0].type, "heading");
  assert.equal(hits[0].slug, "section-999-tag39");
  assert.ok(t1 - t0 < 5000, `parse+index took ${Math.round(t1 - t0)} ms`);
  assert.ok(t2 - t1 < 1000, `search took ${Math.round(t2 - t1)} ms`);
  // Large subtrees render in chunks.
  const chunks = C.chunkTokens(doc.tokens, 0, doc.tokens.length, 120000);
  assert.ok(chunks.length > 30);
  assert.equal(chunks.reduce((s, c) => s + c.length, 0), doc.tokens.length);
});
