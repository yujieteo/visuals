/* Theorem Learner: proofs from concepts to results: the domain model.
 *
 * raw.json (te-learning/1) holds one gzip pack, `core`, with the theorems, the proofs, the mechanisms, the evidence,
 * the concepts and the concept generality links (pipeline/assemble.py). Text arrives as explicit segments: a plain
 * string, or [text, concept index] for a marked concept word; nothing here finds concepts by string matching.
 *
 * FIELDS is the semantic state that the URL, the view JSON and the exports share: the selected theorem (sel), proof
 * (proof, a slug inside the theorem), step, hypothesis (hyp) and concept, the view, the theory-graph focus and its
 * expanded nodes, the prerequisite-tree options and the paged search. derive() computes every shown value from the
 * state and the dataset alone, through indexes built once (index()). It touches no DOM, so node tests run it.
 */
/** @param {any} root the global object @param {() => any} factory */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Model = api;
})(/** @type {any} */ (typeof self !== "undefined" ? self : this), function () {
  "use strict";

  const SLUG = "theorem-learner";
  const SCHEMA_VERSION = 1;
  const VIEWS = ["proof", "graph", "tree", "concepts", "find", "about"];
  const LEVELS = ["school", "undergrad", "graduate", "research"];
  const LEVEL_NAMES = ["school", "undergraduate", "graduate", "research"];
  const DEPTHS = ["understand", "apply", "prove"];
  const BANDS = ["under 1 hour", "hours", "days", "weeks", "months"];
  const COMPONENTS = ["eff", "res", "pra", "rea", "hyp", "pro", "app"];
  const COMPONENT_NAMES = ["Effectiveness", "Research influence", "Practical impact", "Reach", "Low hypothesis burden", "Proof simplicity", "Application simplicity"];
  const CONCEPT_COMPONENT_NAMES = ["Unifying power", "Research influence", "Practical impact", "Reach", "Low prerequisite burden", "Example accessibility", "Computability"];
  const PRESETS = { balanced: [25, 25, 20, 15, 5, 5, 5], practitioner: [25, 10, 35, 15, 5, 2, 8], researcher: [25, 35, 10, 15, 5, 7, 3] };
  const CONCEPT_PRESETS = { balanced: [25, 25, 20, 15, 5, 5, 5], practitioner: [20, 10, 35, 15, 5, 5, 10], researcher: [25, 35, 10, 15, 5, 7, 3] };
  const PAGE = 10;
  const DEFAULT_THEOREM = "wd:Q752375";
  /** Theory-graph edge types: label, and how the line is drawn (never by colour alone). */
  const EDGE_TYPES = {
    defines: { label: "defines", pattern: "solid" },
    "used-at": { label: "used at", pattern: "dotted" },
    supplies: { label: "supplies", pattern: "dash-dot" },
    proves: { label: "proves", pattern: "thick" },
    "special-case-of": { label: "special case of", pattern: "dashed" },
    "occurs-in": { label: "occurs in", pattern: "long-dash" },
  };
  const GRAPH_CAP = 10;
  const TREE_NODES = 300;

  /** @param {string} key @param {string} label @param {string[]} values @param {string} def @returns {KitField} */
  const en = (key, label, values, def) => ({ type: "enum", label, values, default: def });
  /** @param {string} label @param {number} def @param {number} min @param {number} max @returns {KitField} */
  const int = (label, def, min, max) => ({ type: "integer", label, default: def, min, max, step: 1 });
  /** @param {string} label @param {string} [def] @returns {KitField} */
  const str = (label, def = "") => ({ type: "string", label, default: def });

  /** @type {Record<string, KitField>} */
  const FIELDS = {
    view: en("view", "View", VIEWS, "proof"),
    sel: str("Theorem"),
    proof: str("Proof"),
    step: str("Step"),
    hyp: str("Hypothesis"),
    concept: str("Concept"),
    fq: str("Search"),
    fkind: en("fkind", "Search in", ["all", "theorems", "concepts", "declarations"], "all"),
    fpage: int("Search page", 0, 0, 100000),
    gfocus: str("Graph focus"),
    gopen: str("Expanded graph nodes"),
    troot: str("Tree root"),
    tdepth: int("Tree depth", 3, 1, 6),
    tshow: en("tshow", "Tree members", ["both", "results", "concepts"], "both"),
    depth: en("depth", "Learning depth", DEPTHS, "understand"),
    preset: en("preset", "Score weights", ["balanced", "practitioner", "researcher"], "balanced"),
  };

  /** Named states with stable ids. @type {KitExample[]} */
  const EXAMPLES = [
    { id: "extreme-value", label: "Extreme value theorem: compact image", state: { view: "proof", sel: "wd:Q752375", proof: "compact-image" } },
    { id: "local-bounds", label: "Extreme value theorem: local bounds, compactness highlighted", state: { view: "proof", sel: "wd:Q752375", proof: "local-bounds", hyp: "h:compact" } },
    { id: "ivt-bisection", label: "Intermediate value theorem: bisection, step 3 selected", state: { view: "proof", sel: "wd:Q245098", proof: "bisection", step: "s:point" } },
    { id: "compact-graph", label: "Theory graph around compact spaces", state: { view: "graph", gfocus: "c:compact-space" } },
    { id: "evt-tree", label: "Prerequisite tree of the extreme value theorem", state: { view: "tree", troot: "wd:Q752375" } },
    { id: "compact-concept", label: "The concept of a compact space", state: { view: "concepts", concept: "c:compact-space" } },
    { id: "search-compact", label: "Search: compact", state: { view: "find", fq: "compact" } },
  ];

  /* ---------- the pack ---------- */

  const cache = new WeakMap();
  /** @param {any} data */
  function slot(data) {
    let s = cache.get(data);
    if (!s) cache.set(data, (s = {}));
    return s;
  }
  /** @param {any} data @param {string} name @param {any} value */
  function prime(data, name, value) { slot(data)[name] = value; }
  /** The decoded core pack: from the cache, else with zlib in node, else null. @param {any} data */
  function core(data) {
    const s = slot(data);
    if (s.core !== undefined) return s.core;
    if (typeof require !== "function") return null;
    // eslint-disable-next-line no-undef
    const zlib = require("node:zlib");
    s.core = JSON.parse(zlib.gunzipSync(Buffer.from(data.packs.core.gz, "base64")).toString("utf8"));
    return s.core;
  }

  /* ---------- indexes, built once ---------- */

  /** @param {any} data */
  function index(data) {
    const s = slot(data);
    if (s.index) return s.index;
    const c = core(data);
    const { theorems, proofs, mechanisms, evidence, concepts, links } = c;
    const theoremById = new Map(theorems.map((/** @type {any} */ t, /** @type {number} */ i) => [t.id, i]));
    const conceptById = new Map(concepts.map((/** @type {any} */ x, /** @type {number} */ i) => [x.id, i]));
    const proofById = new Map(proofs.map((/** @type {any} */ p, /** @type {number} */ i) => [p.id, i]));
    const mechanismById = new Map(mechanisms.map((/** @type {any} */ m, /** @type {number} */ i) => [m.id, i]));
    const evidenceById = new Map(evidence.map((/** @type {any} */ e, /** @type {number} */ i) => [e.id, i]));
    /** @type {number[][]} */
    const proofsByTheorem = theorems.map((/** @type {any} */ t) => t.pf);
    /** @type {any[][]} */
    const stepsByProof = proofs.map((/** @type {any} */ p) => p.stp);
    /** Hypothesis "theorem index/h:id" -> [{proof, steps}]. @type {Map<string, any[]>} */
    const rolesByHypothesis = new Map();
    proofs.forEach((/** @type {any} */ p, /** @type {number} */ pi) => {
      for (const r of p.ro) {
        const key = `${p.th}/${r.h}`;
        if (!rolesByHypothesis.has(key)) rolesByHypothesis.set(key, []);
        /** @type {any[]} */ (rolesByHypothesis.get(key)).push({ proof: pi, steps: r.st, unused: r.un });
      }
    });
    /** @type {number[][]} */
    const proofsByMechanism = mechanisms.map((/** @type {any} */ m) => m.pf);
    // Concepts -> the proofs and steps that use them.
    /** @type {Map<number, { proof: number, steps: number[] }[]>} */
    const usesOfConcept = new Map();
    proofs.forEach((/** @type {any} */ p, /** @type {number} */ pi) => {
      p.stp.forEach((/** @type {any} */ st, /** @type {number} */ k) => {
        for (const ci of st.cs) {
          if (!usesOfConcept.has(ci)) usesOfConcept.set(ci, []);
          const list = /** @type {any[]} */ (usesOfConcept.get(ci));
          const last = list[list.length - 1];
          if (last && last.proof === pi) last.steps.push(k);
          else list.push({ proof: pi, steps: [k] });
        }
      });
    });
    // The theory graph: typed edges between concepts, mechanisms, proofs and theorems.
    /** @type {Map<string, { to: string, type: string, label: string, dir: string }[]>} */
    const adjacencyByNode = new Map();
    /** @param {string} a @param {string} b @param {string} type @param {string} label */
    const edge = (a, b, type, label) => {
      if (!adjacencyByNode.has(a)) adjacencyByNode.set(a, []);
      if (!adjacencyByNode.has(b)) adjacencyByNode.set(b, []);
      /** @type {any[]} */ (adjacencyByNode.get(a)).push({ to: b, type, label, dir: "out" });
      /** @type {any[]} */ (adjacencyByNode.get(b)).push({ to: a, type, label, dir: "in" });
    };
    concepts.forEach((/** @type {any} */ x, /** @type {number} */ i) => {
      for (const j of new Set([...(x.pre ?? []), ...(x.rq ?? [])])) if (j !== i) edge(concepts[j].id, x.id, "defines", EDGE_TYPES.defines.label);
    });
    for (const ln of links) {
      const special = ln.type === "specializes" ? ln.from : ln.to;
      const general = ln.type === "specializes" ? ln.to : ln.from;
      edge(concepts[special].id, concepts[general].id, "special-case-of", EDGE_TYPES["special-case-of"].label);
    }
    proofs.forEach((/** @type {any} */ p) => {
      edge(p.id, theorems[p.th].id, "proves", EDGE_TYPES.proves.label);
      /** @type {Map<number, number[]>} */
      const usedAt = new Map();
      /** @type {Map<number, number[]>} */
      const supplied = new Map();
      p.stp.forEach((/** @type {any} */ st, /** @type {number} */ k) => {
        for (const ci of st.cs) usedAt.set(ci, [...(usedAt.get(ci) ?? []), k + 1]);
        for (const ti of st.lm) supplied.set(ti, [...(supplied.get(ti) ?? []), k + 1]);
      });
      for (const [ci, ks] of usedAt) edge(concepts[ci].id, p.id, "used-at", `used at step ${ks.join(", ")}`);
      for (const [ti, ks] of supplied) edge(theorems[ti].id, p.id, "supplies", `supplies step ${ks.join(", ")}`);
      for (const mi of p.me) edge(mechanisms[mi].id, p.id, "occurs-in", EDGE_TYPES["occurs-in"].label);
    });
    theorems.forEach((/** @type {any} */ t) => {
      for (const [type, j, dir] of t.rel) {
        if (type === "special-case" && dir === "out") edge(t.id, theorems[j].id, "special-case-of", EDGE_TYPES["special-case-of"].label);
        if (type === "generalization" && dir === "in") edge(t.id, theorems[j].id, "special-case-of", EDGE_TYPES["special-case-of"].label);
      }
    });
    const conceptText = concepts.map((/** @type {any} */ x) => [x.n, ...(x.al ?? []), x.id, flat(x.rem), flat(x.adef), x.def ?? ""].join(" ").toLowerCase());
    s.index = { c, theorems, proofs, mechanisms, evidence, concepts, links, theoremById, conceptById, proofById, mechanismById, evidenceById,
      proofsByTheorem, stepsByProof, rolesByHypothesis, proofsByMechanism, usesOfConcept, adjacencyByNode, conceptText };
    return s.index;
  }

  /** Segments -> plain text. @param {any[] | null | undefined} segs */
  function flat(segs) {
    if (!segs) return "";
    return segs.map((x) => (typeof x === "string" ? x : x[0])).join("");
  }
  /** The concept indices that a list of segments marks. @param {any[] | null | undefined} segs @returns {number[]} */
  const segConcepts = (segs) => (segs ?? []).filter((x) => typeof x !== "string").map((x) => x[1]);

  /* ---------- scores (kept behind a disclosure on the page) ---------- */

  /** @param {string} s @returns {number[]} */
  const parseScores = (s) => [...s].map((ch) => (ch === "u" ? -1 : ch === "n" ? -2 : Number(ch)));
  /** The te-rubric/1 aggregate: null when a weighted component is unknown, with its interval. @param {string} s @param {number[]} w */
  function aggregate(s, w) {
    const sc = parseScores(s);
    let lo = 0, hi = 0;
    /** @type {number[]} */
    const missing = [];
    for (let i = 0; i < 7; i++) {
      if (!w[i]) continue;
      if (sc[i] >= 0) { lo += (w[i] * sc[i]) / 4; hi += (w[i] * sc[i]) / 4; } else { hi += w[i]; missing.push(i); }
    }
    return { v: missing.length ? null : round(lo), lo: round(lo), hi: round(hi), missing };
  }
  /** @param {number} x */
  const round = (x) => Math.round(x * 100) / 100;

  /* ---------- the proof surface ---------- */

  /** The theorem the state selects, else the default, else the first theorem with a proof. @param {any} ix @param {string} sel */
  function theoremIndex(ix, sel) {
    if (sel && ix.theoremById.has(sel)) return ix.theoremById.get(sel);
    if (ix.theoremById.has(DEFAULT_THEOREM)) return ix.theoremById.get(DEFAULT_THEOREM);
    const k = ix.theorems.findIndex((/** @type {any} */ t) => t.pf.length);
    return k >= 0 ? k : 0;
  }

  /** The slug of a proof's public id (proof:<theorem id>:<slug>). @param {string} id */
  const slugOf = (id) => id.slice(id.lastIndexOf(":") + 1);

  /**
   * The selected theorem with its selected proof and the highlights that the hypothesis, step or concept selection
   * gives. A hypothesis lights the steps of its role; a step lights its inputs (the steps that feed it and the
   * hypotheses whose roles name it) and its outputs (the steps it feeds); a concept lights the steps that mark it
   * and the hypotheses about it.
   * @param {Record<string, any>} state @param {any} data @param {string[]} notes
   */
  function proofSurface(state, data, notes) {
    const ix = index(data);
    if (state.sel && !ix.theoremById.has(state.sel)) notes.push(`The theorem "${String(state.sel).slice(0, 60)}" is not in this snapshot; the default theorem is shown.`);
    const ti = theoremIndex(ix, state.sel);
    const t = ix.theorems[ti];
    const proofList = t.pf.map((/** @type {number} */ pi) => ({ i: pi, id: ix.proofs[pi].id, slug: slugOf(ix.proofs[pi].id), name: ix.proofs[pi].n }));
    let sel = proofList.find((/** @type {any} */ p) => p.slug === state.proof) ?? null;
    if (state.proof && !sel && proofList.length) notes.push(`The proof "${String(state.proof).slice(0, 40)}" is not a proof of ${t.n}; its first proof is shown.`);
    if (!sel) sel = proofList[0] ?? null;
    const hypotheses = (t.hy ?? []).map((/** @type {any} */ h) => ({ id: h.id, seg: h.seg, concept: h.c }));
    let proof = null;
    const hl = { steps: /** @type {number[]} */ ([]), inputs: /** @type {number[]} */ ([]), outputs: /** @type {number[]} */ ([]), hyps: /** @type {string[]} */ ([]), edges: /** @type {number[][]} */ ([]), mode: "none" };
    if (sel) {
      const p = ix.proofs[sel.i];
      const n = p.stp.length;
      /** @type {number[][]} */
      const into = Array.from({ length: n }, () => []);
      /** @type {number[][]} */
      const outOf = Array.from({ length: n }, () => []);
      for (const [a, b] of p.ed) { into[b].push(a); outOf[a].push(b); }
      const stepIdx = p.stp.findIndex((/** @type {any} */ s) => s.id === state.step);
      if (state.step && stepIdx < 0) notes.push(`"${String(state.step).slice(0, 40)}" is not a step of this proof.`);
      const hypRoles = p.ro.map((/** @type {any} */ r) => ({ h: r.h, why: r.why, steps: r.st, unused: r.un }));
      if (state.hyp && !hypRoles.some((/** @type {any} */ r) => r.h === state.hyp)) notes.push(`"${String(state.hyp).slice(0, 40)}" is not a hypothesis of ${t.n}.`);
      const ci = state.concept ? ix.conceptById.get(state.concept) : undefined;
      if (stepIdx >= 0) {
        hl.mode = "step";
        hl.steps = [stepIdx];
        hl.inputs = into[stepIdx];
        hl.outputs = outOf[stepIdx];
        hl.hyps = hypRoles.filter((/** @type {any} */ r) => r.steps.includes(stepIdx)).map((/** @type {any} */ r) => r.h);
        hl.edges = p.ed.filter((/** @type {number[]} */ e) => e[0] === stepIdx || e[1] === stepIdx);
      } else if (state.hyp && hypRoles.some((/** @type {any} */ r) => r.h === state.hyp)) {
        hl.mode = "hypothesis";
        hl.hyps = [state.hyp];
        hl.steps = hypRoles.find((/** @type {any} */ r) => r.h === state.hyp).steps;
      } else if (ci !== undefined) {
        hl.mode = "concept";
        hl.steps = p.stp.map((/** @type {any} */ s, /** @type {number} */ k) => (s.cs.includes(ci) ? k : -1)).filter((/** @type {number} */ k) => k >= 0);
        hl.hyps = hypotheses.filter((/** @type {any} */ h) => h.concept === ci || segConcepts(h.seg).includes(ci)).map((/** @type {any} */ h) => h.id);
      }
      proof = {
        i: sel.i, id: p.id, slug: sel.slug, name: p.n, slogan: p.sl, scope: p.sc,
        roles: hypRoles,
        steps: p.stp.map((/** @type {any} */ s, /** @type {number} */ k) => ({
          k, number: k + 1, id: s.id, slogan: s.sl, detail: s.dt, concepts: s.cs,
          lemmas: s.lm.map((/** @type {number} */ j) => ({ id: ix.theorems[j].id, name: ix.theorems[j].n })),
          inputs: into[k], outputs: outOf[k],
          hyps: hypRoles.filter((/** @type {any} */ r) => r.steps.includes(k)).map((/** @type {any} */ r) => r.h),
          conclusion: k === p.cl,
        })),
        edges: p.ed, conclusion: p.cl,
        conceptWhy: p.cw,
        mechanisms: p.me.map((/** @type {number} */ m) => ({ id: ix.mechanisms[m].id, name: ix.mechanisms[m].n, slogan: ix.mechanisms[m].sl, others: ix.mechanisms[m].pf.filter((/** @type {number} */ q) => q !== sel.i).length })),
        evidence: p.ev.map((/** @type {number} */ e) => ix.evidence[e]),
        source: p.src,
        verification: verification(t, p),
      };
    }
    const w = PRESETS[/** @type {"balanced"} */ (state.preset)] ?? PRESETS.balanced;
    return {
      i: ti, id: t.id, name: t.n, type: t.t, level: LEVELS[t.lv], statement: t.st, statementBasis: t.stb, hypotheses, conclusion: t.cn,
      proofs: proofList, proof, highlight: hl, unknown: t.unk,
      formal: t.formal ? { ...t.formal, evidence: ix.evidence[t.formal.ev] } : null,
      evidence: t.ev.map((/** @type {number} */ e) => ix.evidence[e]),
      score: aggregate(t.s, w), scores: t.s, confidence: t.c, effort: t.ef, aliases: t.al, note: t.why,
      prerequisites: t.pre.map((/** @type {number} */ j) => ({ id: ix.theorems[j].id, name: ix.theorems[j].n })),
      relations: t.rel.map((/** @type {any[]} */ r) => ({ type: r[0], dir: r[2], id: ix.theorems[r[1]].id, name: ix.theorems[r[1]].n })),
      keyConcepts: t.kc.map((/** @type {number} */ ci) => ({ id: ix.concepts[ci].id, name: ix.concepts[ci].n })),
    };
  }

  /**
   * The four verification statuses, kept apart (the spec's evidence table). A formal declaration of the theorem never
   * makes an authored proof Lean-checked.
   * @param {any} t @param {any} p
   */
  function verification(t, p) {
    return {
      formalDeclaration: t.formal ? { present: true, decl: t.formal.decl, difference: t.formal.difference } : { present: false },
      authoredExplanation: { present: true, route: p.src.kind === "lean" ? (p.src.follows ? `follows the mathlib proof of ${p.src.decl}` : `differs from the mathlib proof of ${p.src.decl}`) : p.src.kind === "web" ? "from a web source" : "authored" },
      checkedCorrespondence: { present: Boolean(p.vf.checked) },
      leanCheckedProof: { present: Boolean(p.vf.lean) },
    };
  }

  /**
   * One concept reminder: the definition (reusable), why it matters here (specific to the selected proof, or to the
   * statement when no proof is selected) and the steps where the proof uses it.
   * @param {any} data @param {number} ci @param {any} surface the proof surface (or null)
   */
  function reminderOf(data, ci, surface) {
    const ix = index(data);
    const x = ix.concepts[ci];
    const p = surface?.proof ?? null;
    const why = p ? p.conceptWhy[String(ci)] ?? null : null;
    const usedAt = p ? p.steps.filter((/** @type {any} */ s) => s.concepts.includes(ci)).map((/** @type {any} */ s) => ({ number: s.number, id: s.id, slogan: s.slogan })) : [];
    const hyps = surface ? surface.hypotheses.filter((/** @type {any} */ h) => h.concept === ci || segConcepts(h.seg).includes(ci)).map((/** @type {any} */ h) => h.id) : [];
    return {
      i: ci, id: x.id, name: x.n, kind: x.k, level: x.lv === null ? null : LEVELS[x.lv],
      reminder: x.rem ?? null, definition: x.adef ?? (x.def ? [x.def] : null), definitionBasis: x.adef ? "authored" : x.defb ?? null,
      examples: x.ex ?? [], why, usedAt, hyps, proofName: p?.name ?? null,
    };
  }

  /* ---------- the theory graph ---------- */

  /** The kind of a graph node id. @param {any} ix @param {string} id */
  function nodeKind(ix, id) {
    if (ix.conceptById.has(id)) return "concept";
    if (ix.proofById.has(id)) return "proof";
    if (ix.mechanismById.has(id)) return "mechanism";
    if (ix.theoremById.has(id)) return "theorem";
    return null;
  }
  /** @param {any} ix @param {string} id */
  function nodeLabel(ix, id) {
    const k = nodeKind(ix, id);
    if (k === "concept") return ix.concepts[ix.conceptById.get(id)].n;
    if (k === "theorem") return ix.theorems[ix.theoremById.get(id)].n;
    if (k === "mechanism") return ix.mechanisms[ix.mechanismById.get(id)].n;
    if (k === "proof") {
      const p = ix.proofs[ix.proofById.get(id)];
      return `${p.n} (proof of ${ix.theorems[p.th].n})`;
    }
    return id;
  }

  /**
   * The local neighbourhood of the focus and of every expanded node: each node's neighbours, at most GRAPH_CAP per
   * edge type in the drawing (the list holds all of them). Nodes keep the distance at which they first appear.
   * @param {Record<string, any>} state @param {any} data @param {string[]} notes
   */
  function graphOf(state, data, notes) {
    const ix = index(data);
    const entry = entryPoints(ix);
    const focus = state.gfocus && nodeKind(ix, state.gfocus) ? state.gfocus : null;
    if (state.gfocus && !focus) notes.push(`"${String(state.gfocus).slice(0, 60)}" is not a node of the theory graph.`);
    if (!focus) return { focus: null, entry, nodes: [], edges: [], lists: [], open: [] };
    const open = splitList(state.gopen).filter((id) => nodeKind(ix, id));
    /** @type {Map<string, number>} */
    const dist = new Map([[focus, 0]]);
    /** @type {{ from: string, to: string, type: string, label: string }[]} */
    const edges = [];
    const seenEdge = new Set();
    /** @type {any[]} */
    const lists = [];
    for (const id of [focus, ...open.filter((x) => x !== focus)]) {
      if (!dist.has(id)) continue; // an expanded node outside the shown neighbourhood waits until it is shown again
      const adj = ix.adjacencyByNode.get(id) ?? [];
      /** @type {Map<string, any[]>} */
      const byType = new Map();
      for (const e of adj) {
        const key = `${e.type}:${e.dir}`;
        if (!byType.has(key)) byType.set(key, []);
        /** @type {any[]} */ (byType.get(key)).push(e);
      }
      /** @type {any[]} */
      const groups = [];
      for (const [key, list] of byType) {
        const [type, dir] = key.split(":");
        list.sort((a, b) => nodeLabel(ix, a.to).localeCompare(nodeLabel(ix, b.to)));
        groups.push({ type, dir, total: list.length, items: list.map((e) => ({ id: e.to, label: nodeLabel(ix, e.to), kind: nodeKind(ix, e.to), edge: e.label })) });
        for (const e of list.slice(0, GRAPH_CAP)) {
          if (!dist.has(e.to)) dist.set(e.to, /** @type {number} */ (dist.get(id)) + 1);
          const from = dir === "out" ? id : e.to, to = dir === "out" ? e.to : id;
          const k = `${from}|${to}|${type}`;
          if (!seenEdge.has(k)) { seenEdge.add(k); edges.push({ from, to, type, label: e.label }); }
        }
      }
      lists.push({ id, label: nodeLabel(ix, id), kind: nodeKind(ix, id), groups });
    }
    const nodes = [...dist].map(([id, d]) => ({ id, d, kind: nodeKind(ix, id), label: nodeLabel(ix, id), open: id === focus || open.includes(id) }));
    return { focus, entry, nodes, edges, lists, open };
  }

  /** Basic concepts as entry points: school or undergraduate level, used by proofs, those with a reminder and the most used first. @param {any} ix */
  function entryPoints(ix) {
    return ix.concepts.map((/** @type {any} */ x, /** @type {number} */ i) => ({ i, x, uses: (ix.usesOfConcept.get(i) ?? []).length }))
      .filter((/** @type {any} */ e) => e.uses > 0 && e.x.lv !== null && e.x.lv <= 1)
      .sort((/** @type {any} */ a, /** @type {any} */ b) => Number(Boolean(b.x.rem)) - Number(Boolean(a.x.rem)) || b.uses - a.uses || a.x.n.localeCompare(b.x.n))
      .slice(0, 16).map((/** @type {any} */ e) => ({ id: e.x.id, name: e.x.n, uses: e.uses }));
  }

  /* ---------- the prerequisite tree ---------- */

  /**
   * A tree of prerequisites. A theorem's children are the lemmas its proof cites and the concepts its proof marks
   * (the selected proof when the root is the selected theorem, else its first proof), then its judged prerequisite
   * results; without a proof, its key concepts and judged prerequisites. A concept's children are its authored
   * requirements, else the catalog's prerequisites. Each item expands once; known items stop the expansion.
   * @param {Record<string, any>} state @param {any} data @param {string} rootId @param {string[]} notes
   */
  function treeOf(state, data, rootId, notes) {
    const ix = index(data);
    const known = data.profile?.known ?? {};
    const k0 = nodeKind(ix, rootId);
    if (k0 !== "theorem" && k0 !== "concept") { notes.push(`The tree root "${String(rootId).slice(0, 60)}" is neither a theorem nor a concept.`); return null; }
    const depthIdx = DEPTHS.indexOf(state.depth);
    const expanded = new Set(), onStack = new Set();
    let count = 0, truncated = false;
    /** @type {any[]} */
    const study = [];
    /** @param {string} id */
    const kids = (id) => {
      /** @type {{ id: string, edge: string }[]} */
      const out = [];
      if (nodeKind(ix, id) === "theorem") {
        const t = ix.theorems[ix.theoremById.get(id)];
        const pick = id === state.sel && state.proof ? t.pf.find((/** @type {number} */ q) => slugOf(ix.proofs[q].id) === state.proof) ?? t.pf[0] : t.pf[0];
        if (pick !== undefined) {
          const p = ix.proofs[pick];
          if (state.tshow !== "concepts") for (const j of new Set(p.stp.flatMap((/** @type {any} */ s) => s.lm))) out.push({ id: ix.theorems[j].id, edge: `supplies a step of ${p.n}` });
          if (state.tshow !== "results") for (const ci of new Set([...(t.hy ?? []).flatMap((/** @type {any} */ h) => (h.c !== null ? [h.c] : [])), ...p.stp.flatMap((/** @type {any} */ s) => s.cs)])) out.push({ id: ix.concepts[ci].id, edge: `used in ${p.n}` });
        } else if (state.tshow !== "results") for (const ci of t.kc) out.push({ id: ix.concepts[ci].id, edge: "key concept" });
        if (state.tshow !== "concepts") for (const j of t.pre) out.push({ id: ix.theorems[j].id, edge: "judged prerequisite" });
      } else if (state.tshow !== "results") {
        const x = ix.concepts[ix.conceptById.get(id)];
        for (const j of x.rq ?? x.pre) out.push({ id: ix.concepts[j].id, edge: x.rq ? "used in its definition (authored)" : "catalog prerequisite" });
      }
      const seen = new Set();
      return out.filter((e) => e.id !== id && !seen.has(e.id) && seen.add(e.id));
    };
    /** @param {string} id @param {number} depth @param {string | null} edge @returns {any} */
    function visit(id, depth, edge) {
      count++;
      const kind = nodeKind(ix, id);
      const rec = kind === "theorem" ? ix.theorems[ix.theoremById.get(id)] : ix.concepts[ix.conceptById.get(id)];
      const node = /** @type {any} */ ({ id, kind, name: rec.n, level: rec.lv === null ? null : LEVELS[rec.lv], band: rec.ef ? rec.ef[depthIdx] ?? "x" : "x", known: id in known, edge, children: [], ref: false, cycle: false, more: 0 });
      if (onStack.has(id)) { node.cycle = true; return node; }
      if (expanded.has(id)) { node.ref = true; return node; }
      expanded.add(id);
      const ch = kids(id);
      if (node.known && depth > 0) { node.more = ch.length; return node; }
      if (depth >= state.tdepth) { node.more = ch.length; study.push(node); return node; }
      onStack.add(id);
      for (const c of ch) {
        if (count >= TREE_NODES) { truncated = true; node.more = ch.length - node.children.length; break; }
        node.children.push(visit(c.id, depth + 1, c.edge));
      }
      onStack.delete(id);
      if (!node.known) study.push(node);
      return node;
    }
    const root = visit(rootId, 0, null);
    return { root, unique: expanded.size, truncated, depth: state.tdepth, study: study.map((n) => ({ id: n.id, kind: n.kind, name: n.name, level: n.level, band: n.band })) };
  }

  /* ---------- search, bounded and paged ---------- */

  /**
   * Offline search over theorem names, aliases, statements, declaration names and modules, and over concept names,
   * aliases and reminders: every word must match. Ten results per page, with the total count.
   * @param {Record<string, any>} state @param {any} data
   */
  function findOf(state, data) {
    const ix = index(data);
    const words = String(state.fq).toLowerCase().split(/\s+/).filter(Boolean);
    /** @type {any[]} */
    const hits = [];
    if (words.length) {
      if (state.fkind === "all" || state.fkind === "theorems" || state.fkind === "declarations") {
        ix.theorems.forEach((/** @type {any} */ t, /** @type {number} */ i) => {
          const hay = state.fkind === "declarations" ? `${t.formal?.decl ?? ""} ${t.q.split(" ").filter((/** @type {string} */ w) => w.includes(".")).join(" ")}`.toLowerCase() : t.q;
          if (words.every((w) => hay.includes(w))) hits.push({ kind: "theorem", i, id: t.id, name: t.n, type: t.t, proofs: t.pf.length, decl: t.formal?.decl ?? null, rank: t.pf.length ? 0 : 1 });
        });
      }
      if (state.fkind === "all" || state.fkind === "concepts") {
        ix.concepts.forEach((/** @type {any} */ x, /** @type {number} */ i) => {
          if (words.every((w) => ix.conceptText[i].includes(w))) hits.push({ kind: "concept", i, id: x.id, name: x.n, type: x.k, proofs: (ix.usesOfConcept.get(i) ?? []).length, decl: x.decl, rank: x.rem ? 0 : 1 });
        });
      }
    }
    hits.sort((a, b) => a.rank - b.rank || Number(!a.name.toLowerCase().startsWith(words[0] ?? "")) - Number(!b.name.toLowerCase().startsWith(words[0] ?? "")) || a.name.localeCompare(b.name) || a.i - b.i);
    const pages = Math.max(1, Math.ceil(hits.length / PAGE));
    const page = Math.min(state.fpage, pages - 1);
    return { query: state.fq, kind: state.fkind, total: hits.length, page, pages, size: PAGE, items: hits.slice(page * PAGE, page * PAGE + PAGE) };
  }

  /* ---------- the concept page ---------- */

  /** @param {Record<string, any>} state @param {any} data @param {string[]} notes */
  function conceptPage(state, data, notes) {
    const ix = index(data);
    let ci = state.concept ? ix.conceptById.get(state.concept) : undefined;
    if (state.concept && ci === undefined) notes.push(`The concept "${String(state.concept).slice(0, 60)}" is not in this snapshot.`);
    if (ci === undefined) ci = ix.conceptById.get("c:compact-space") ?? 0;
    const x = ix.concepts[ci];
    const w = CONCEPT_PRESETS[/** @type {"balanced"} */ (state.preset)] ?? CONCEPT_PRESETS.balanced;
    /** @param {number} li */
    const linkOf = (li) => {
      const ln = ix.links[li];
      return { id: ln.id, type: ln.type, to: { id: ix.concepts[ln.to].id, name: ix.concepts[ln.to].n }, steps: ln.steps, why: ln.why };
    };
    const incoming = ix.links.map((/** @type {any} */ ln, /** @type {number} */ li) => (ln.to === ci ? li : -1)).filter((/** @type {number} */ li) => li >= 0)
      .map((/** @type {number} */ li) => ({ ...linkOf(li), from: { id: ix.concepts[ix.links[li].from].id, name: ix.concepts[ix.links[li].from].n } }));
    const uses = (ix.usesOfConcept.get(ci) ?? []).map((/** @type {any} */ u) => {
      const p = ix.proofs[u.proof];
      return { proof: p.id, slug: slugOf(p.id), name: p.n, theorem: ix.theorems[p.th].id, theoremName: ix.theorems[p.th].n, steps: u.steps.map((/** @type {number} */ k) => ({ number: k + 1, id: p.stp[k].id, slogan: p.stp[k].sl })), why: p.cw[String(ci)] ?? null };
    });
    return {
      ...reminderOf(data, ci, null), aliases: x.al, assessment: x.j === 2 ? "full" : x.j === 1 ? "light" : "added by a theorem file",
      catalogDefinition: x.def, catalogBasis: x.defb, score: aggregate(x.s, w), scores: x.s, confidence: x.c,
      requires: (x.rq ?? x.pre).map((/** @type {number} */ j) => ({ id: ix.concepts[j].id, name: ix.concepts[j].n })), requiresBasis: x.rq ? "authored" : "catalog",
      links: (x.ln ?? []).map(linkOf), incoming, uses,
      neededBy: (ix.adjacencyByNode.get(x.id) ?? []).filter((/** @type {any} */ e) => e.type === "defines" && e.dir === "out").slice(0, 30).map((/** @type {any} */ e) => ({ id: e.to, name: nodeLabel(ix, e.to) })),
      nlab: x.nl, mathlib: x.decl, papers: x.ap,
    };
  }

  /* ---------- derive ---------- */

  /** @param {string} list */
  const splitList = (list) => [...new Set(String(list ?? "").split(",").map((x) => x.trim()).filter(Boolean))];

  /**
   * Every value the page shows, from the state, the dataset and the profile (known items) only.
   * @param {Record<string, any>} state @param {any} data
   */
  function derive(state, data) {
    /** @type {string[]} */
    const notes = [];
    const ix = index(data);
    const surface = proofSurface(state, data, notes);
    const ci = state.concept ? ix.conceptById.get(state.concept) : undefined;
    if (state.concept && ci === undefined && state.view !== "concepts") notes.push(`The concept "${String(state.concept).slice(0, 60)}" is not in this snapshot.`);
    const cov = data.coverage.learning;
    return {
      snapshot: data.snapshot.id,
      surface,
      reminder: ci !== undefined ? reminderOf(data, ci, surface) : null,
      graph: state.view === "graph" ? graphOf(state, data, notes) : null,
      tree: state.view === "tree" ? treeOf(state, data, state.troot && nodeKind(ix, state.troot) ? state.troot : surface.id, notes) : null,
      concept: state.view === "concepts" ? conceptPage(state, data, notes) : null,
      find: state.view === "find" ? findOf(state, data) : null,
      counts: { theorems: ix.theorems.length, withProofs: cov.theorems_with_proofs, proofs: ix.proofs.length, concepts: ix.concepts.length, reminders: cov.concepts_with_reminders, mechanisms: ix.mechanisms.length },
      notes,
    };
  }

  /* ---------- labels ---------- */

  /** @param {number | null} v */
  const scoreLabel = (v) => (v === null ? "unknown" : (Math.round(v * 100) / 100).toFixed(2).replace(/\.?0+$/, ""));
  /** @param {string} band */
  const bandLabel = (band) => (band === "x" ? "does not apply" : `band ${band} (${BANDS[Number(band) - 1]})`);

  return {
    SLUG, SCHEMA_VERSION, FIELDS, EXAMPLES, VIEWS, LEVELS, LEVEL_NAMES, DEPTHS, BANDS, COMPONENTS, COMPONENT_NAMES, CONCEPT_COMPONENT_NAMES,
    PRESETS, CONCEPT_PRESETS, EDGE_TYPES, PAGE, GRAPH_CAP, TREE_NODES, DEFAULT_THEOREM,
    prime, core, index, flat, segConcepts, aggregate, proofSurface, reminderOf, graphOf, treeOf, findOf, conceptPage, nodeKind, nodeLabel,
    verification, slugOf, splitList, scoreLabel, bandLabel, derive,
  };
});
