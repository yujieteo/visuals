import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

// The page inlines its pure logic as <script id="eg-logic"> and its data as JSON; run both directly.
const html = await readFile(new URL("../viz/english-grammar/index.html", import.meta.url), "utf8");
const script = (id) => html.match(new RegExp(`<script[^>]*id="${id}"[^>]*>([\\s\\S]*?)</script>`))[1];
const dataText = script("eg-data");
const D = JSON.parse(dataText);
const context = vm.createContext({});
vm.runInContext(script("eg-logic"), context);
const L = context.EGLogic;
const idx = L.index(D);

test("every concept, example and view round-trips through the URL fragment", () => {
  for (const c of D.concepts) {
    for (const view of [null, "tree", "compare"]) {
      for (const item of [null, ...c.items]) {
        const state = { concept: c.id, example: item && item.ex, view };
        const parsed = L.parseHash(L.formatHash(state), idx);
        assert.equal(parsed.valid, true);
        assert.equal(parsed.concept, c.id);
        assert.equal(parsed.example, state.example);
        assert.equal(parsed.view, view);
      }
    }
  }
});

test("empty and invalid fragments fall back to a useful view", () => {
  const start = L.parseHash("", idx);
  assert.equal(start.start, true);
  assert.equal(start.concept, D.route[0].concept);
  for (const bad of ["#nope", "#subject/not-an-example", "#subject/tree/extra/more", "#subject/tree/kim-laughed"]) {
    const p = L.parseHash(bad, idx);
    assert.equal(p.invalid, true, bad);
    assert.ok(idx.concepts.has(p.concept), bad);
  }
  assert.equal(L.parseHash("#subject/bogus", idx).concept, "subject");
});

test("arrow-key traversal is consistent: up/down/left/right stay within the tree", () => {
  for (const e of D.examples) {
    const map = idx.nodes.get(e.id);
    for (const [id, v] of map) {
      const up = L.move(idx, e.id, id, "up");
      assert.equal(up, v.parent || id);
      const down = L.move(idx, e.id, id, "down");
      if (v.node.children) {
        assert.equal(map.get(down).parent, id);
        assert.equal(L.move(idx, e.id, down, "up"), id);
      } else assert.equal(down, id);
      const right = L.move(idx, e.id, id, "right");
      if (right !== id) {
        assert.equal(map.get(right).parent, v.parent);
        assert.equal(L.move(idx, e.id, right, "left"), id);
      }
      assert.equal(L.move(idx, e.id, id, "home"), e.tree.id);
    }
  }
});

test("word and phrase levels are separately inspectable, and the top level has no invented function", () => {
  const phrase = L.describe(idx, "kim-laughed", "subj");
  const word = L.describe(idx, "kim-laughed", "kim");
  assert.equal(phrase.level, "phrase");
  assert.equal(phrase.category, "Noun phrase");
  assert.equal(phrase.function, "Subject");
  assert.equal(phrase.head.id, "kim");
  assert.equal(word.level, "word");
  assert.equal(word.category, "Noun");
  assert.equal(word.function, "Head");
  assert.equal(word.container.id, "subj");
  for (const e of D.examples) {
    const top = L.describe(idx, e.id, e.tree.id);
    assert.equal(top.top, true);
    assert.equal(top.function, undefined);
  }
});

test("sentence strip, inspector and tree are derived from the same nodes", () => {
  const measure = (s) => s.length * 7;
  for (const e of D.examples) {
    const map = idx.nodes.get(e.id);
    const lay = L.layout(idx, e.id, measure);
    assert.equal(lay.pos.size, map.size, e.id);
    for (const [id, v] of map) {
      const d = L.describe(idx, e.id, id);
      assert.equal(d.text, L.textOf(e, v.node));
      if (v.node.children) assert.deepEqual(d.contains.map((k) => k.id), v.node.children.map((k) => k.id));
      if (v.node.word !== undefined) assert.equal(lay.pos.get(id).text, e.tokens[v.node.word].t);
    }
    // Every word token is a selectable leaf, punctuation never is.
    const leaves = [...map.values()].filter((v) => v.node.word !== undefined).map((v) => v.node.word).sort((a, b) => a - b);
    assert.deepEqual(leaves, e.tokens.map((t, i) => (t.k === "w" ? i : -1)).filter((i) => i >= 0));
    // Unfolding everything shows every phrase node; the selected node's ancestors are always visible.
    const all = L.visibleBands(idx, e.id, L.maxDepth(idx, e.id), e.tree.id);
    assert.equal(all.length, [...map.values()].filter((v) => v.node.word === undefined && !v.node.gap).length);
    const shallow = new Set(L.visibleBands(idx, e.id, 0, e.focus).map((b) => b.id));
    for (const a of L.ancestors(idx, e.id, e.focus)) assert.ok(shallow.has(a), `${e.id}: ancestor ${a} hidden`);
  }
});

test("contrasts and concept references resolve to real nodes", () => {
  for (const k of D.contrasts) {
    for (const side of ["a", "b"]) assert.ok(idx.nodes.get(k[side].ex).has(k[side].node), k.id);
    assert.ok(k.concepts.length > 0);
  }
  for (const c of D.concepts) for (const i of c.items) assert.ok(idx.nodes.get(i.ex).has(i.node), `${c.id} -> ${i.ex}@${i.node}`);
});

test("search finds canonical names, aliases, abbreviations and example words, and keeps aliases distinct", () => {
  assert.equal(L.search(idx, "").results.length, 0);
  assert.equal(L.search(idx, "zzzzqqq").results.length, 0);
  const subject = L.search(idx, "The subject").results[0];
  assert.equal(subject.type, "concept");
  assert.equal(subject.concept, "subject");
  const gerund = L.search(idx, "gerund").results;
  assert.ok(gerund.some((r) => r.type === "alias" && r.concept === "gerund-participle"));
  for (const r of gerund.filter((r) => r.type === "alias")) assert.notEqual(r.label, idx.concepts.get(r.concept).name);
  assert.ok(L.search(idx, "NP").results.some((r) => r.type === "abbreviation" && r.concept === "noun-phrase-structure"));
  const cake = L.search(idx, "cake").results;
  assert.ok(cake.some((r) => r.type === "example" && r.example === "cake-which-baked"));
  for (const r of cake) if (r.type === "example") assert.ok(idx.examples.get(r.example).concepts.includes(r.concept));
});

test("emitted page registers three read-only tools without requiring a DOM", () => {
  const inert = new Proxy(function () {}, {
    get: (_, key) => (key === Symbol.toPrimitive ? () => 0 : key === Symbol.iterator ? [][Symbol.iterator].bind([]) : key === "then" ? undefined : inert),
    set: () => true,
    apply: () => inert,
    construct: () => inert,
  });
  const tools = new Map();
  const ctx = vm.createContext({
    navigator: { modelContext: { registerTool(tool) { assert.equal(tools.has(tool.name), false); tools.set(tool.name, tool); } } },
    document: new Proxy({ modelContext: undefined, title: "t", getElementById: (id) => (id === "eg-data" ? { textContent: dataText } : inert) }, { get: (t, k) => (k in t ? t[k] : inert) }),
    location: { hash: "" },
    getComputedStyle: () => ({ fontFamily: "serif" }),
    addEventListener: () => {},
    setTimeout: () => 0,
    JSON, Map, Set,
  });
  ctx.window = ctx;
  ctx.window.matchMedia = () => ({ matches: false, addEventListener() {} });
  vm.runInContext(script("eg-logic"), ctx);
  ctx.window.EGLogic = ctx.EGLogic;
  vm.runInContext(script("eg-ui"), ctx);
  assert.deepEqual([...tools.keys()].sort(), ["get_data", "get_metadata", "query"]);
  for (const tool of tools.values()) assert.equal(tool.annotations.readOnlyHint, true);
});
