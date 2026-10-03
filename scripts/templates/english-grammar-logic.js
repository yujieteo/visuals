/* Pure logic for the grammar laboratory: indexing, fragments, traversal, search
   and inspector descriptions. No DOM access, so tests can run it directly. */
/**
 * The page's data (data/english-grammar, built into the page) and the index over it.
 * @typedef {{ t: string, k: string, g?: boolean }} Token
 * @typedef {{ id: string, cat: string, fn?: string, span?: [number, number], children?: GNode[], word?: string, gap?: string, head?: string,
 *   cx?: string, form?: string, anchor?: string, ante?: string, alt?: string, base?: string, at?: number, _w?: number }} GNode
 * @typedef {{ id: string, i: number, name: string, class: string, use: string, side: string, bounds: string, pair?: string }} Mark
 * @typedef {{ id: string, kind: string, text: string, tokens: Token[], tree: GNode, marks?: Mark[], concepts: string[], explanation: string,
 *   context?: string, usage?: string, predict?: { node: string, question: string, answer: string } }} Example
 * @typedef {{ ex: string, node: string }} Item
 * @typedef {{ chapter: string, label: string, section?: string, page?: number }} Reference
 * @typedef {{ id: string, name: string, references: Reference[], items: Item[], abbr?: string[], aliases?: string[], orientation: string,
 *   note?: string, related: string[] }} Concept
 * @typedef {{ n: string, title: string, sections: { id: string, title: string, page: number }[] }} Chapter
 * @typedef {{ concepts: string[], a: Item, b: Item, explanation: string }} Contrast
 * @typedef {{ concepts: Concept[], examples: Example[], route: { concept: string, orientation: string }[], chapters: Chapter[],
 *   confusions: { label: string, concept: string, example: string, orientation: string }[], contrasts: Contrast[], start: string,
 *   labels: { categories: Record<string, string>, functions: Record<string, string>, notation: Record<string, string> },
 *   key: string, book: unknown, verification: unknown, checked: unknown, assumptions: unknown }} GrammarData
 * @typedef {{ node: GNode, parent: string | null, depth: number }} Placed
 */
/**
 * A map whose lookups use keys taken from the same data, so every get finds its value.
 * @template K, V
 * @typedef {Omit<Map<K, V>, "get"> & { get(key: K): V }} SureMap
 */
/**
 * @typedef {{ D: GrammarData, concepts: SureMap<string, Concept & { order: number }>, examples: SureMap<string, Example>,
 *   nodes: SureMap<string, SureMap<string, Placed>>, marks: SureMap<string, Map<string, Mark>>, chapterConcepts: SureMap<string, string[]>,
 *   route: string[] }} Index
 * @typedef {{ concept: string, example: string | null, view: string | null, valid: boolean, invalid?: boolean, start?: boolean, raw?: string }} HashState
 * @typedef {{ type: string, concept: string, example?: string, label: string, detail: string, score: number }} SearchResult
 * @typedef {{ x: number, y: number, w: number, label: string, leaf?: boolean, text?: string }} Box
 */
/**
 * The logic the page publishes as EGLogic; the assignment at the end checks the functions against it.
 * @typedef {{ index(D: GrammarData): Index, parseHash(hash: unknown, idx: Index): HashState,
 *   formatHash(state: { concept: string, example?: string | null, view?: string | null }): string,
 *   primaryItem(idx: Index, conceptId: string, exampleId: string | null): Item, move(idx: Index, exampleId: string, nodeId: string, dir: string): string,
 *   ancestors(idx: Index, exampleId: string, nodeId: string): string[], spaceBefore(prev: Token | null, t: Token): boolean,
 *   textOf(e: Example, n: { span?: [number, number] }): string, describe(idx: Index, exampleId: string, nodeId: string): Record<string, any>,
 *   announce(d: Record<string, any>): string, search(idx: Index, query: string, limit?: number): { query: string, results: SearchResult[], total?: number },
 *   visibleBands(idx: Index, exampleId: string, depthLimit: number, selectedId: string): { id: string, depth: number }[],
 *   maxDepth(idx: Index, exampleId: string): number,
 *   layout(idx: Index, exampleId: string, measure: (text: string) => number): { width: number, height: number, rowH: number, pos: Map<string, Box>, catName: (c: string) => string },
 *   norm(s: unknown): string, isSearchShortcut(ev: KeyboardEvent | null | undefined): boolean, markOf(idx: Index, exampleId: string, id: string): Mark | null,
 *   spanOf(idx: Index, exampleId: string, id: string): [number, number] }} EGLogicApi
 */
(function (/** @type {{ EGLogic: EGLogicApi }} */ root) {
  "use strict";

  /** @param {GrammarData} D @returns {Index} */
  function index(D) {
    const concepts = new Map(), examples = new Map(), nodes = new Map(), marks = new Map(), chapterConcepts = new Map();
    D.concepts.forEach((c, i) => {
      concepts.set(c.id, Object.assign({ order: i }, c));
      const ch = c.references[0].chapter;
      if (!chapterConcepts.has(ch)) chapterConcepts.set(ch, []);
      chapterConcepts.get(ch).push(c.id);
    });
    D.examples.forEach((e) => {
      examples.set(e.id, e);
      const map = new Map();
      (function walk(/** @type {GNode} */ n, /** @type {GNode | null} */ parent, /** @type {number} */ depth) {
        map.set(n.id, { node: n, parent: parent ? parent.id : null, depth: depth });
        (n.children || []).forEach((k) => walk(k, n, depth + 1));
      })(e.tree, null, 0);
      nodes.set(e.id, map);
      marks.set(e.id, new Map((e.marks || []).map((m) => [m.id, m])));
    });
    const route = D.route.map((r) => r.concept);
    return { D, concepts, examples, nodes, marks, chapterConcepts, route };
  }

  const VIEWS = ["tree", "compare"];

  /* "#concept", "#concept/example", "#concept/tree", "#concept/example/tree". */
  /** @param {unknown} hash @param {Index} idx @returns {HashState} */
  function parseHash(hash, idx) {
    let raw = String(hash || "").replace(/^#/, "");
    try { raw = decodeURIComponent(raw); } catch (e) { return { invalid: true, raw: raw, concept: idx.route[0], example: null, view: null, valid: false }; }
    if (!raw) return { start: true, concept: idx.route[0], example: null, view: null, valid: true };
    const parts = raw.split("/").filter(Boolean);
    const concept = idx.concepts.get(parts[0]);
    if (!concept || parts.length > 3) return { invalid: true, raw: raw, concept: idx.route[0], example: null, view: null, valid: false };
    let example = null, view = null;
    for (const p of parts.slice(1)) {
      if (!view && VIEWS.includes(p)) view = p;
      else if (!example && !view && concept.items.some((i) => i.ex === p)) example = p;
      else return { invalid: true, raw: raw, concept: concept.id, example: null, view: null, valid: false };
    }
    return { concept: concept.id, example: example, view: view, valid: true };
  }

  /** @param {{ concept: string, example?: string | null, view?: string | null }} state */
  function formatHash(state) {
    return "#" + [state.concept, state.example, state.view].filter(Boolean).join("/");
  }

  /** @param {Index} idx @param {string} conceptId @param {string | null} exampleId */
  function primaryItem(idx, conceptId, exampleId) {
    const c = idx.concepts.get(conceptId);
    return c.items.find((i) => i.ex === exampleId) || c.items[0];
  }

  /** @param {Index} idx @param {string} exampleId @param {string} id @returns {Mark | null} */
  function markOf(idx, exampleId, id) { const m = idx.marks.get(exampleId); return (m && m.get(id)) || null; }

  /* Arrow-key traversal: up = containing constituent, down = first part, left/right = siblings.
     From a punctuation mark: up = the constituent it marks, left/right = the neighbouring marks. */
  /** @param {Index} idx @param {string} exampleId @param {string} nodeId @param {string} dir @returns {string} */
  function move(idx, exampleId, nodeId, dir) {
    const map = idx.nodes.get(exampleId), here = map.get(nodeId), mark = markOf(idx, exampleId, nodeId);
    if (mark) {
      if (dir === "up") return mark.bounds;
      if (dir === "home") return idx.examples.get(exampleId).tree.id;
      // @ts-expect-error an example with a mark has its list of marks
      const all = idx.examples.get(exampleId).marks, i = all.indexOf(mark), j = dir === "left" ? i - 1 : dir === "right" ? i + 1 : i;
      // @ts-expect-error as above
      return j >= 0 && j < all.length ? all[j].id : nodeId;
    }
    if (!here) return nodeId;
    if (dir === "up") return here.parent || nodeId;
    if (dir === "down") return (here.node.children && here.node.children[0].id) || nodeId;
    if (dir === "home") return idx.examples.get(exampleId).tree.id;
    if (!here.parent) return nodeId;
    // @ts-expect-error a parent node has children
    const sibs = map.get(here.parent).node.children, i = sibs.findIndex((k) => k.id === nodeId);
    const j = dir === "left" ? i - 1 : dir === "right" ? i + 1 : i;
    // @ts-expect-error as above
    return j >= 0 && j < sibs.length ? sibs[j].id : nodeId;
  }

  /** @param {Index} idx @param {string} exampleId @param {string} nodeId @returns {string[]} */
  function ancestors(idx, exampleId, nodeId) {
    const map = idx.nodes.get(exampleId), out = [], mark = markOf(idx, exampleId, nodeId);
    if (mark) out.push(mark.bounds);
    let cur = map.get(mark ? mark.bounds : nodeId);
    while (cur && cur.parent) { out.push(cur.parent); cur = map.get(cur.parent); }
    return out;
  }

  /* Whether a space is written before token t: not inside a word (g), not before closing punctuation,
     not after opening brackets and quotation marks. */
  /** @param {Token | null} prev @param {Token} t */
  function spaceBefore(prev, t) {
    return !!prev && !t.g && !(t.k === "p" && ".,!?;:)\u201d\u2019".includes(t.t)) && !(prev.k === "p" && "(\u201c\u2018".includes(prev.t));
  }

  /** @type {Record<string, string>} */
  const CLOSE = { "\u201c": "\u201d", "\u2018": "\u2019", "(": ")" };

  /* A span's tokens, plus any closing quotation mark or bracket just after it whose opener is inside it. */
  /** @param {Token[]} tokens @param {[number, number]} span */
  function balanced(tokens, span) {
    /** @type {string[]} */
    const open = [];
    let b = span[1];
    tokens.slice(span[0], span[1]).forEach((t) => {
      if (t.k !== "p") return;
      if (CLOSE[t.t]) open.push(CLOSE[t.t]);
      else if (open.length && open[open.length - 1] === t.t) open.pop();
    });
    while (open.length && b < tokens.length && tokens[b].k === "p" && tokens[b].t === open[open.length - 1]) { open.pop(); b++; }
    return tokens.slice(span[0], b);
  }

  /** @param {Example} e @param {{ span?: [number, number] }} n */
  function textOf(e, n) {
    if (!n.span) return "__";
    let out = "", /** @type {Token | null} */ prev = null;
    balanced(e.tokens, n.span).forEach((t) => {
      if (spaceBefore(prev, t)) out += " ";
      out += t.t;
      prev = t;
    });
    return out;
  }

  /** @param {GrammarData} D @param {string} cat */
  function catName(D, cat) { return D.labels.categories[cat] || cat; }
  /** @param {GrammarData} D @param {string} fn */
  function fnName(D, fn) { return D.labels.functions[fn] || fn; }

  /* Fields for the inspector. Fields that do not apply are left out rather than filled in. */
  /** @param {string} side */
  function sideText(side) { return side === "start" ? "the start of" : side === "end" ? "the end of" : "a boundary inside"; }

  /* A punctuation mark: what it is and which constituent boundary it marks. */
  /** @param {Index} idx @param {string} exampleId @param {Mark} m */
  function describeMark(idx, exampleId, m) {
    const D = idx.D, e = idx.examples.get(exampleId), map = idx.nodes.get(exampleId), b = map.get(m.bounds).node;
    /** @type {Record<string, any>} the inspector's fields */
    const out = { id: m.id, text: e.tokens[m.i].t, level: "mark", category: m.name.charAt(0).toUpperCase() + m.name.slice(1), cat: "mark",
      indicator: m["class"], use: m.use, side: m.side,
      marks: { id: b.id, text: textOf(e, b), category: catName(D, b.cat), function: b.fn ? fnName(D, b.fn) : null, side: sideText(m.side) } };
    // @ts-expect-error a paired mark's partner is another mark of the same example
    if (m.pair) { const p = markOf(idx, exampleId, m.pair); out.pair = { id: p.id, text: e.tokens[p.i].t, name: p.name }; }
    return out;
  }

  /** @param {Index} idx @param {string} exampleId @param {string} nodeId @returns {Record<string, any>} the inspector's fields, which vary with the kind of node */
  function describe(idx, exampleId, nodeId) {
    const mark = markOf(idx, exampleId, nodeId);
    if (mark) return describeMark(idx, exampleId, mark);
    const D = idx.D, e = idx.examples.get(exampleId), map = idx.nodes.get(exampleId), here = map.get(nodeId);
    const n = here.node, parent = here.parent ? map.get(here.parent).node : null;
    // Inside a word example the whole is a word and everything below it is a part of that word.
    const level = e.kind === "word" ? (parent ? "part" : "word") :
      n.word !== undefined ? "word" : n.gap ? "gap" : n.cat === "Clause" ? "clause" : n.cat === "Coordination" ? "coordination" : "phrase";
    /** @type {Record<string, any>} the inspector's fields, which vary with the kind of node */
    const out = { id: n.id, text: textOf(e, n), level: level, category: catName(D, n.cat), cat: n.cat };
    if (parent) {
      out.fn = n.fn;
      // @ts-expect-error every node below the top has a function
      out.function = fnName(D, n.fn);
      out.container = { id: parent.id, category: catName(D, parent.cat), text: textOf(e, parent) };
    } else {
      out.top = true;
    }
    if (n.head) {
      const h = map.get(n.head).node;
      // @ts-expect-error a head is a part of its phrase, so it has a function
      out.head = { id: h.id, text: textOf(e, h), category: catName(D, h.cat), function: fnName(D, h.fn) };
    }
    // @ts-expect-error every child has a function
    if (n.children) out.contains = n.children.map((k) => ({ id: k.id, text: textOf(e, k), function: fnName(D, k.fn), category: catName(D, k.cat) }));
    if (n.cx) out.construction = n.cx;
    if (n.form) out.form = n.form;
    if (n.anchor) {
      // An anchor that contains the supplement (a clause) is described without the supplement itself.
      // @ts-expect-error a supplement and its anchor both cover tokens
      const host = map.get(n.anchor).node, inside = host.span[0] <= n.span[0] && n.span[1] <= host.span[1];
      // @ts-expect-error as above
      const text = inside ? textOf(e, { span: [host.span[0], n.span[0]] }).replace(/[\s,\u2013\u2014-]+$/, "") : textOf(e, host);
      out.anchor = { id: n.anchor, text: text };
    }
    if (n.gap) out.gap = { id: n.gap, text: textOf(e, map.get(n.gap).node) };
    if (n.ante) out.antecedent = { id: n.ante, text: textOf(e, map.get(n.ante).node) };
    if (n.alt) out.spelling = { base: n.base, alt: n.alt };
    const marks = (e.marks || []).filter((m) => m.bounds === n.id);
    if (marks.length) out.punctuation = marks.map((m) => ({ id: m.id, text: e.tokens[m.i].t, name: m.name, side: sideText(m.side) }));
    if (n.fn && n.fn.includes("+")) out.fused = true;
    return out;
  }

  /** @param {Record<string, any>} d a description from describe() */
  function announce(d) {
    if (d.level === "mark") return "Punctuation: " + d.category.toLowerCase() + ", marking " + d.marks.side + " “" + d.marks.text + "”";
    const fn = d.top ? "Top level" : d.function;
    return fn + ": " + d.category + ", “" + d.text + "”";
  }

  /** @param {unknown} s */
  function norm(s) { return String(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, "'").trim(); }

  /* Search concepts, canonical names, abbreviations, aliases, example sentences and words. */
  /** @param {Index} idx @param {string} query @param {number} [limit] */
  function search(idx, query, limit) {
    const q = norm(query);
    if (!q) return { query: "", results: [] };
    const /** @type {SearchResult[]} */ results = [], seen = new Set();
    /** @param {SearchResult} r */
    const add = (r) => { const key = r.type + "|" + r.concept + "|" + (r.example || "") + "|" + r.label; if (!seen.has(key)) { seen.add(key); results.push(r); } };
    /** @param {string} text */
    const score = (text) => { const t = norm(text); return t === q ? 0 : t.startsWith(q) ? 1 : (" " + t).includes(" " + q) ? 2 : t.includes(q) ? 3 : -1; };
    for (const c of idx.concepts.values()) {
      const s = score(c.name);
      if (s >= 0) add({ type: "concept", concept: c.id, label: c.name, detail: c.references[0].label, score: s });
      (c.abbr || []).forEach((a) => { if (norm(a) === q) add({ type: "abbreviation", concept: c.id, label: a, detail: c.name, score: 0 }); });
      (c.aliases || []).forEach((a) => { const t = score(a); if (t >= 0) add({ type: "alias", concept: c.id, label: a, detail: c.name, score: t + 0.5 }); });
    }
    for (const e of idx.examples.values()) {
      const words = e.tokens.filter((t) => t.k === "w").map((t) => norm(t.t));
      const whole = score(e.text), word = words.includes(q) ? 1.5 : words.some((w) => w.startsWith(q)) && q.length > 2 ? 2.5 : -1;
      const s = whole >= 0 && whole < 3 ? whole + 1 : word >= 0 ? word + 1 : whole >= 0 ? 4 : -1;
      if (s >= 0) add({ type: "example", concept: e.concepts[0], example: e.id, label: e.text, detail: idx.concepts.get(e.concepts[0]).name, score: s });
    }
    results.sort((a, b) => a.score - b.score || a.label.localeCompare(b.label));
    return { query: query, results: results.slice(0, limit || 30), total: results.length };
  }

  /* Rows of bands for the sentence strip: phrase nodes visible at the current unfolding. */
  /** @param {Index} idx @param {string} exampleId @param {number} depthLimit @param {string} selectedId */
  function visibleBands(idx, exampleId, depthLimit, selectedId) {
    const map = idx.nodes.get(exampleId), anc = new Set(ancestors(idx, exampleId, selectedId));
    anc.add(selectedId);
    const out = [];
    for (const [id, v] of map) {
      if (v.node.word !== undefined || v.node.gap) continue;
      if (v.depth <= depthLimit || anc.has(id) || v.parent === selectedId) out.push({ id: id, depth: v.depth });
    }
    return out;
  }

  /** @param {Index} idx @param {string} exampleId */
  function maxDepth(idx, exampleId) {
    let m = 0;
    for (const v of idx.nodes.get(exampleId).values()) if (v.node.word === undefined && !v.node.gap) m = Math.max(m, v.depth);
    return m;
  }

  /* Tidy tree layout: each subtree gets at least its own label width; parents centre over children. */
  /** @param {Index} idx @param {string} exampleId @param {(text: string) => number} measure */
  function layout(idx, exampleId, measure) {
    const e = idx.examples.get(exampleId), D = idx.D, gapX = 12, rowH = 72, /** @type {Map<string, Box>} */ pos = new Map();
    /** @param {GNode} n */
    const label = (n) => (n.fn ? n.fn + ": " : "") + n.cat;
    /** @param {GNode} n @returns {number} */
    function width(n) {
      const own = Math.max(measure(label(n)), n.word !== undefined || n.gap ? measure(textOf(e, n)) : 0) + 16;
      if (!n.children) return (n._w = own);
      const kids = n.children.reduce((s, k) => s + width(k), 0) + gapX * (n.children.length - 1);
      return (n._w = Math.max(own, kids));
    }
    /** @param {GNode} n @param {number} x @param {number} depth */
    function place(n, x, depth) {
      if (n.children) {
        // @ts-expect-error width() has set every _w before place() runs
        const kids = n.children.reduce((s, k) => s + k._w, 0) + gapX * (n.children.length - 1);
        // @ts-expect-error as above
        let cx = x + (n._w - kids) / 2;
        // @ts-expect-error as above
        n.children.forEach((k) => { place(k, cx, depth + 1); cx += k._w + gapX; });
        const first = pos.get(n.children[0].id), last = pos.get(n.children[n.children.length - 1].id);
        // @ts-expect-error the children are placed before their parent
        pos.set(n.id, { x: (first.x + last.x) / 2, y: depth * rowH, w: Math.max(measure(label(n)) + 16, 40), label: label(n) });
      } else {
        // @ts-expect-error as above
        pos.set(n.id, { x: x + n._w / 2, y: depth * rowH, w: n._w, label: label(n), leaf: true, text: textOf(e, n) });
      }
    }
    const total = width(e.tree);
    place(e.tree, 0, 0);
    let depth = 0;
    for (const v of idx.nodes.get(exampleId).values()) depth = Math.max(depth, v.depth);
    /** @param {GNode} n @returns {void} */
    const clean = (n) => { delete n._w; (n.children || []).forEach(clean); };
    clean(e.tree);
    return { width: total, height: (depth + 1) * rowH + 24, rowH: rowH, pos: pos, catName: (/** @type {string} */ c) => catName(D, c) };
  }

  /* Ctrl+K or Cmd+K, unless the keystroke is going into a text field (including the search box itself). */
  /** @param {KeyboardEvent | null | undefined} ev */
  function isSearchShortcut(ev) {
    if (!ev || ev.isComposing || String(ev.key).toLowerCase() !== "k" || !(ev.ctrlKey || ev.metaKey) || ev.altKey || ev.shiftKey) return false;
    // @ts-expect-error the target of a key event is an element
    const /** @type {HTMLInputElement | null} */ t = ev.target, tag = t && t.tagName ? String(t.tagName).toUpperCase() : "";
    const typing = tag === "TEXTAREA" || tag === "SELECT" || !!(t && t.isContentEditable) ||
      // @ts-expect-error an INPUT tag means the target is set
      (tag === "INPUT" && !/^(button|checkbox|radio|submit|reset|range|color|file|image)$/i.test(t.type || "text"));
    return !typing;
  }

  /* The token span a node or mark covers, for highlighting. */
  /** @param {Index} idx @param {string} exampleId @param {string} id @returns {[number, number]} */
  function spanOf(idx, exampleId, id) {
    const mark = markOf(idx, exampleId, id);
    if (mark) return [mark.i, mark.i + 1];
    // @ts-expect-error every node the page highlights covers tokens
    return idx.nodes.get(exampleId).get(id).node.span;
  }

  root.EGLogic = { index, parseHash, formatHash, primaryItem, move, ancestors, spaceBefore, textOf, describe, announce, search, visibleBands, maxDepth, layout, norm, isSearchShortcut, markOf, spanOf };
})(typeof globalThis !== "undefined" ? globalThis : this);
