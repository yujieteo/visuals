import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

// The page inlines its pure logic as <script id="eg-logic"> and its data as JSON; run both directly.
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
/** @param {string} id */
const script = (id) => /** @type {RegExpMatchArray} */ (html.match(new RegExp(`<script[^>]*id="${id}"[^>]*>([\\s\\S]*?)</script>`)))[1];
const dataText = script("eg-data");
/** @type {GrammarData} */
const D = JSON.parse(dataText);
const context = vm.createContext({});
vm.runInContext(script("eg-logic"), context);
/** @type {EGLogicApi} */
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

test("malformed percent escapes in the fragment fall back instead of throwing", () => {
  for (const bad of ["#subject%2", "#%E0%A4%A", "#%"]) {
    const p = L.parseHash(bad, idx);
    assert.equal(p.invalid, true, bad);
    assert.equal(p.concept, D.route[0].concept, bad);
  }
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
  const measure = (/** @type {string} */ s) => s.length * 7;
  for (const e of D.examples) {
    const map = idx.nodes.get(e.id);
    const lay = L.layout(idx, e.id, measure);
    assert.equal(lay.pos.size, map.size, e.id);
    for (const [id, v] of map) {
      const d = L.describe(idx, e.id, id);
      assert.equal(d.text, L.textOf(e, v.node));
      if (v.node.children) assert.deepEqual(d.contains.map((/** @type {{ id: string }} */ k) => k.id), v.node.children.map((k) => k.id));
      if (v.node.word !== undefined) assert.equal(lay.pos.get(id)?.text, e.tokens[v.node.word].t);
    }
    // Every word token is a selectable leaf, punctuation never is.
    const leaves = [...map.values()].filter((v) => v.node.word !== undefined).map((v) => /** @type {number} */ (v.node.word)).sort((a, b) => a - b);
    assert.deepEqual(leaves, e.tokens.map((t, i) => (t.k === "w" ? i : -1)).filter((i) => i >= 0));
    // Unfolding everything shows every phrase node; the selected node's ancestors are always visible.
    const all = L.visibleBands(idx, e.id, L.maxDepth(idx, e.id), e.tree.id);
    assert.equal(all.length, [...map.values()].filter((v) => v.node.word === undefined && !v.node.gap).length);
    const shallow = new Set(L.visibleBands(idx, e.id, 0, e.focus).map((b) => b.id));
    for (const a of L.ancestors(idx, e.id, e.focus)) assert.ok(shallow.has(a), `${e.id}: ancestor ${a} hidden`);
  }
});

/** @param {string} ex @param {string} id */
const target = (ex, id) => idx.nodes.get(ex).has(id) || !!L.markOf(idx, ex, id);

test("contrasts and concept references resolve to real nodes or punctuation marks", () => {
  for (const k of D.contrasts) {
    for (const side of /** @type {const} */ (["a", "b"])) assert.ok(target(k[side].ex, k[side].node), k.id);
    assert.ok(k.concepts.length > 0);
  }
  for (const c of D.concepts) for (const i of c.items) assert.ok(target(i.ex, i.node), `${c.id} -> ${i.ex}@${i.node}`);
});

test("every chapter of the outline has concepts", () => {
  assert.equal(D.chapters.length, 20);
  for (const ch of D.chapters) assert.ok(idx.chapterConcepts.has(ch.n), `chapter ${ch.n}`);
});

test("text is rebuilt with the spacing of the displayed example, inside words and around quotation marks", () => {
  // The top-level unit reads exactly as the displayed example, without its final terminal.
  for (const e of D.examples) assert.equal(L.textOf(e, e.tree), e.kind === "word" ? e.text : e.text.replace(/[.!?]$/, ""), e.id);
  const quoted = idx.examples.get("called-it-disaster");
  assert.equal(L.textOf(quoted, quoted.tree), "Kim called it “a disaster”");
  assert.equal(L.describe(idx, "called-it-disaster", "pc").text, "a disaster");
});

test("word structures: the word is the top, its pieces are parts of it, and spelling changes are described", () => {
  const words = D.examples.filter((e) => e.kind === "word");
  assert.ok(words.length >= 20);
  for (const e of words) {
    const map = idx.nodes.get(e.id);
    assert.equal(e.tokens.map((t) => t.t).join(""), e.text, e.id);
    for (const [id, v] of map) {
      const d = L.describe(idx, e.id, id);
      assert.equal(d.level, v.parent ? "part" : "word", `${e.id}@${id}`);
      if (v.node.alt) assert.equal(JSON.stringify(d.spelling), JSON.stringify({ base: v.node.base, alt: v.node.alt }));
    }
  }
  const happy = L.describe(idx, "w-unhappiness", "happy");
  assert.equal(happy.text, "happi");
  assert.equal(happy.function, "Base");
  assert.equal(happy.container.text, "unhappi");
  assert.equal(L.describe(idx, "w-unhappiness", "ness").category, "Suffix");
});

test("punctuation marks: each one is selectable, attached to a constituent, and traversable", () => {
  const marked = /** @type {(Example & { marks: Mark[] })[]} */ (D.examples.filter((e) => e.marks));
  assert.ok(marked.length >= 10);
  for (const e of marked) {
    const ids = new Set(e.marks.map((m) => m.id));
    // Every punctuation token of a punctuated example belongs to exactly one mark.
    e.tokens.forEach((t, i) => { if (t.k === "p") assert.equal(e.marks.filter((m) => m.i === i).length, 1, `${e.id}: token ${i}`); });
    for (const m of e.marks) {
      assert.ok(!idx.nodes.get(e.id).has(m.id), `${e.id}: ${m.id} clashes with a node`);
      const d = L.describe(idx, e.id, m.id);
      assert.equal(d.level, "mark");
      assert.equal(d.text, e.tokens[m.i].t);
      assert.equal(d.marks.id, m.bounds);
      assert.equal(JSON.stringify(L.spanOf(idx, e.id, m.id)), JSON.stringify([m.i, m.i + 1]));
      assert.equal(L.move(idx, e.id, m.id, "up"), m.bounds);
      assert.equal(L.move(idx, e.id, m.id, "home"), e.tree.id);
      assert.equal(L.ancestors(idx, e.id, m.id)[0], m.bounds);
      for (const dir of ["left", "right", "down"]) assert.ok(ids.has(L.move(idx, e.id, m.id, dir)), `${e.id}: ${dir} from ${m.id}`);
      if (m.pair) assert.equal(d.pair.id, m.pair);
      assert.match(L.announce(d), /^Punctuation: /);
      // The constituent it marks lists it.
      assert.ok(L.describe(idx, e.id, m.bounds).punctuation.some((/** @type {{ id: string }} */ x) => x.id === m.id), `${e.id}: ${m.bounds} lists ${m.id}`);
    }
  }
  const comma = L.describe(idx, "kim-my-neighbour", "m1");
  assert.equal(comma.category, "Comma");
  assert.equal(comma.marks.text, "my neighbour");
  assert.equal(comma.marks.side, "the start of");
  assert.equal(comma.pair.id, "m2");
});

test("antecedent links are described from the anaphor, and never inside a word", () => {
  const she = L.describe(idx, "before-she-left", "she");
  assert.equal(JSON.stringify(she.antecedent), JSON.stringify({ id: "kim", text: "Kim" }));
  assert.equal(L.describe(idx, "she-locked-before-kim-left", "she").antecedent, undefined);
  assert.equal(L.describe(idx, "red-bike-blue-one", "one").antecedent.text, "bike");
  let links = 0;
  for (const e of D.examples) for (const v of idx.nodes.get(e.id).values()) if (v.node.ante) {
    links++;
    assert.notEqual(e.kind, "word");
    assert.ok(idx.nodes.get(e.id).has(v.node.ante), e.id);
  }
  assert.ok(links >= 5);
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
  for (const r of cake) if (r.type === "example") assert.ok(idx.examples.get(/** @type {string} */ (r.example)).concepts.includes(r.concept));
});

test("emitted page registers three read-only tools without requiring a DOM", () => {
  /** @type {any} a stand-in that answers every property, call and construction with itself */
  const inert = new Proxy(function () {}, {
    get: (_, key) => (key === Symbol.toPrimitive ? () => 0 : key === Symbol.iterator ? [][Symbol.iterator].bind([]) : key === "then" ? undefined : inert),
    set: () => true,
    apply: () => inert,
    construct: () => inert,
  });
  /** @type {Map<string, ModelContextTool>} */
  const tools = new Map();
  /** @type {any} */
  const ctx = vm.createContext({
    navigator: { modelContext: { registerTool(/** @type {ModelContextTool} */ tool) { assert.equal(tools.has(tool.name), false); tools.set(tool.name, tool); } } },
    document: new Proxy({ modelContext: undefined, title: "t", getElementById: (/** @type {string} */ id) => (id === "eg-data" ? { textContent: dataText } : inert) }, { get: (/** @type {Record<string | symbol, unknown>} */ t, k) => (k in t ? t[k] : inert) }),
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
  for (const tool of tools.values()) assert.equal(/** @type {{ readOnlyHint?: boolean }} */ (tool.annotations).readOnlyHint, true);
});

test("Ctrl+K and Cmd+K go to search, except while typing in a text field", () => {
  /** @param {object} over @param {{ tagName: string, type?: string }} [target] */
  const key = (over, target = { tagName: "BODY" }) => L.isSearchShortcut(/** @type {any} a stand-in event with only the fields the shortcut reads */ ({ key: "k", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, target, ...over }));
  assert.equal(key({ ctrlKey: true }), true);
  assert.equal(key({ metaKey: true }), true);
  assert.equal(key({ ctrlKey: true, key: "K" }), true, "with Caps Lock on");
  assert.equal(key({ ctrlKey: true }, { tagName: "BUTTON" }), true, "from a focused button");
  assert.equal(key({ ctrlKey: true }, { tagName: "INPUT", type: "checkbox" }), true, "from a checkbox");
  assert.equal(key({}), false, "plain k");
  assert.equal(key({ ctrlKey: true, key: "j" }), false);
  assert.equal(key({ ctrlKey: true, shiftKey: true }), false);
  assert.equal(key({ ctrlKey: true, altKey: true }), false);
  assert.equal(key({ ctrlKey: true, isComposing: true }), false);
  assert.equal(key({ key: "Escape" }), false, "Escape is left to the drawer");
  for (const target of [{ tagName: "INPUT", type: "search" }, { tagName: "INPUT", type: "text" }, { tagName: "INPUT" }, { tagName: "TEXTAREA" }, { tagName: "SELECT" }, { tagName: "DIV", isContentEditable: true }])
    assert.equal(key({ ctrlKey: true }, target), false, `not while typing in ${target.tagName} ${target.type || ""}`);
});
