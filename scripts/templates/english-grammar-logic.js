/* Pure logic for the grammar laboratory: indexing, fragments, traversal, search
   and inspector descriptions. No DOM access, so tests can run it directly. */
(function (root) {
  "use strict";

  function index(D) {
    const concepts = new Map(), examples = new Map(), nodes = new Map(), chapterConcepts = new Map();
    D.concepts.forEach((c, i) => {
      concepts.set(c.id, Object.assign({ order: i }, c));
      const ch = c.references[0].chapter;
      if (!chapterConcepts.has(ch)) chapterConcepts.set(ch, []);
      chapterConcepts.get(ch).push(c.id);
    });
    D.examples.forEach((e) => {
      examples.set(e.id, e);
      const map = new Map();
      (function walk(n, parent, depth) {
        map.set(n.id, { node: n, parent: parent ? parent.id : null, depth: depth });
        (n.children || []).forEach((k) => walk(k, n, depth + 1));
      })(e.tree, null, 0);
      nodes.set(e.id, map);
    });
    const route = D.route.map((r) => r.concept);
    return { D, concepts, examples, nodes, chapterConcepts, route };
  }

  const VIEWS = ["tree", "compare"];

  /* "#concept", "#concept/example", "#concept/tree", "#concept/example/tree". */
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

  function formatHash(state) {
    return "#" + [state.concept, state.example, state.view].filter(Boolean).join("/");
  }

  function primaryItem(idx, conceptId, exampleId) {
    const c = idx.concepts.get(conceptId);
    return c.items.find((i) => i.ex === exampleId) || c.items[0];
  }

  /* Arrow-key traversal: up = containing constituent, down = first part, left/right = siblings. */
  function move(idx, exampleId, nodeId, dir) {
    const map = idx.nodes.get(exampleId), here = map.get(nodeId);
    if (!here) return nodeId;
    if (dir === "up") return here.parent || nodeId;
    if (dir === "down") return (here.node.children && here.node.children[0].id) || nodeId;
    if (dir === "home") return idx.examples.get(exampleId).tree.id;
    if (!here.parent) return nodeId;
    const sibs = map.get(here.parent).node.children, i = sibs.findIndex((k) => k.id === nodeId);
    const j = dir === "left" ? i - 1 : dir === "right" ? i + 1 : i;
    return j >= 0 && j < sibs.length ? sibs[j].id : nodeId;
  }

  function ancestors(idx, exampleId, nodeId) {
    const map = idx.nodes.get(exampleId), out = [];
    let cur = map.get(nodeId);
    while (cur && cur.parent) { out.push(cur.parent); cur = map.get(cur.parent); }
    return out;
  }

  function textOf(e, n) {
    if (!n.span) return "__";
    let out = "";
    e.tokens.slice(n.span[0], n.span[1]).forEach((t) => {
      if (out && !(t.k === "p" && ".,!?;:".includes(t.t))) out += " ";
      out += t.t;
    });
    return out;
  }

  function catName(D, cat) { return D.labels.categories[cat] || cat; }
  function fnName(D, fn) { return D.labels.functions[fn] || fn; }

  /* Fields for the inspector. Fields that do not apply are left out rather than filled in. */
  function describe(idx, exampleId, nodeId) {
    const D = idx.D, e = idx.examples.get(exampleId), map = idx.nodes.get(exampleId), here = map.get(nodeId);
    const n = here.node, parent = here.parent ? map.get(here.parent).node : null;
    const level = n.word !== undefined ? "word" : n.gap ? "gap" : n.cat === "Clause" ? "clause" : n.cat === "Coordination" ? "coordination" : "phrase";
    const out = { id: n.id, text: textOf(e, n), level: level, category: catName(D, n.cat), cat: n.cat };
    if (parent) {
      out.fn = n.fn;
      out.function = fnName(D, n.fn);
      out.container = { id: parent.id, category: catName(D, parent.cat), text: textOf(e, parent) };
    } else {
      out.top = true;
    }
    if (n.head) {
      const h = map.get(n.head).node;
      out.head = { id: h.id, text: textOf(e, h), category: catName(D, h.cat), function: fnName(D, h.fn) };
    }
    if (n.children) out.contains = n.children.map((k) => ({ id: k.id, text: textOf(e, k), function: fnName(D, k.fn), category: catName(D, k.cat) }));
    if (n.cx) out.construction = n.cx;
    if (n.form) out.form = n.form;
    if (n.anchor) {
      // An anchor that contains the supplement (a clause) is described without the supplement itself.
      const host = map.get(n.anchor).node, inside = host.span[0] <= n.span[0] && n.span[1] <= host.span[1];
      const text = inside ? textOf(e, { span: [host.span[0], n.span[0]] }).replace(/[\s,\u2013\u2014-]+$/, "") : textOf(e, host);
      out.anchor = { id: n.anchor, text: text };
    }
    if (n.gap) out.gap = { id: n.gap, text: textOf(e, map.get(n.gap).node) };
    if (n.fn && n.fn.includes("+")) out.fused = true;
    return out;
  }

  function announce(d) {
    const fn = d.top ? "Top level" : d.function;
    return fn + ": " + d.category + ", “" + d.text + "”";
  }

  function norm(s) { return String(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, "'").trim(); }

  /* Search concepts, canonical names, abbreviations, aliases, example sentences and words. */
  function search(idx, query, limit) {
    const q = norm(query);
    if (!q) return { query: "", results: [] };
    const results = [], seen = new Set();
    const add = (r) => { const key = r.type + "|" + r.concept + "|" + (r.example || "") + "|" + r.label; if (!seen.has(key)) { seen.add(key); results.push(r); } };
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

  function maxDepth(idx, exampleId) {
    let m = 0;
    for (const v of idx.nodes.get(exampleId).values()) if (v.node.word === undefined && !v.node.gap) m = Math.max(m, v.depth);
    return m;
  }

  /* Tidy tree layout: each subtree gets at least its own label width; parents centre over children. */
  function layout(idx, exampleId, measure) {
    const e = idx.examples.get(exampleId), D = idx.D, gapX = 12, rowH = 72, pos = new Map();
    const label = (n) => (n.fn ? n.fn + ": " : "") + n.cat;
    function width(n) {
      const own = Math.max(measure(label(n)), n.word !== undefined || n.gap ? measure(textOf(e, n)) : 0) + 16;
      if (!n.children) return (n._w = own);
      const kids = n.children.reduce((s, k) => s + width(k), 0) + gapX * (n.children.length - 1);
      return (n._w = Math.max(own, kids));
    }
    function place(n, x, depth) {
      if (n.children) {
        const kids = n.children.reduce((s, k) => s + k._w, 0) + gapX * (n.children.length - 1);
        let cx = x + (n._w - kids) / 2;
        n.children.forEach((k) => { place(k, cx, depth + 1); cx += k._w + gapX; });
        const first = pos.get(n.children[0].id), last = pos.get(n.children[n.children.length - 1].id);
        pos.set(n.id, { x: (first.x + last.x) / 2, y: depth * rowH, w: Math.max(measure(label(n)) + 16, 40), label: label(n) });
      } else {
        pos.set(n.id, { x: x + n._w / 2, y: depth * rowH, w: n._w, label: label(n), leaf: true, text: textOf(e, n) });
      }
    }
    const total = width(e.tree);
    place(e.tree, 0, 0);
    let depth = 0;
    for (const v of idx.nodes.get(exampleId).values()) depth = Math.max(depth, v.depth);
    const clean = (n) => { delete n._w; (n.children || []).forEach(clean); };
    clean(e.tree);
    return { width: total, height: (depth + 1) * rowH + 24, rowH: rowH, pos: pos, catName: (c) => catName(D, c) };
  }

  /* Ctrl+K or Cmd+K, unless the keystroke is going into a text field (including the search box itself). */
  function isSearchShortcut(ev) {
    if (!ev || ev.isComposing || String(ev.key).toLowerCase() !== "k" || !(ev.ctrlKey || ev.metaKey) || ev.altKey || ev.shiftKey) return false;
    const t = ev.target, tag = t && t.tagName ? String(t.tagName).toUpperCase() : "";
    const typing = tag === "TEXTAREA" || tag === "SELECT" || !!(t && t.isContentEditable) ||
      (tag === "INPUT" && !/^(button|checkbox|radio|submit|reset|range|color|file|image)$/i.test(t.type || "text"));
    return !typing;
  }

  root.EGLogic = { index, parseHash, formatHash, primaryItem, move, ancestors, textOf, describe, announce, search, visibleBands, maxDepth, layout, norm, isSearchShortcut };
})(typeof globalThis !== "undefined" ? globalThis : this);
