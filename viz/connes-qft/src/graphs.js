/* Connes QFT laboratory: QED Feynman graphs as combinatorial objects.
 *
 * A graph is { id, name, vertices: [{ id, x, y, kind }], edges: [{ id, a, b, type, flavor, bend }] }.
 * kind is "v" (a QED vertex −ieγ^μ), "ct" (a two-point residue left by contracting a self-energy or
 * vacuum-polarization subgraph) or "ext" (the free end of an external leg). type is "e" (fermion,
 * directed a → b along the charge-flow arrow) or "g" (photon). flavor "mu" marks a muon line.
 *
 * Everything here is computed from that structure: valence and charge flow, the loop number
 * L = I − V + C, connectedness, one-particle irreducibility, the superficial degree of divergence,
 * the divergent proper 1PI subgraphs, contraction Γ/γ and a canonical form for isomorphism.
 */
(function (factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./core.js"));
  else factory(self.ConnesQFT);
})(function (Q) {
  "use strict";

  const isExt = (g, vid) => vByID(g, vid).kind === "ext";
  function vByID(g, id) { const v = g.vertices.find((u) => u.id === id); if (!v) throw new Error(`no vertex ${id} in ${g.id}`); return v; }
  const internalVertices = (g) => g.vertices.filter((v) => v.kind !== "ext");
  const internalEdges = (g) => g.edges.filter((e) => !isExt(g, e.a) && !isExt(g, e.b));
  const externalLegs = (g) => g.edges.filter((e) => isExt(g, e.a) || isExt(g, e.b));

  /* External leg counts: fermion legs E_e (with how many point in and out) and photon legs E_γ. */
  function externalCounts(g) {
    let Ee = 0, Eg = 0, inn = 0, out = 0;
    for (const e of externalLegs(g)) {
      if (e.type === "g") Eg++;
      else { Ee++; if (isExt(g, e.a)) inn++; else out++; }
    }
    return { Ee, Eg, in: inn, out };
  }

  /* Valence and charge flow: a QED vertex has one fermion line in, one out (same flavour) and one photon. */
  function validate(g) {
    const issues = [];
    for (const v of internalVertices(g)) {
      let fin = 0, fout = 0, ph = 0;
      const flavors = new Set();
      for (const e of g.edges) {
        if (e.type === "e") {
          if (e.b === v.id) { fin++; flavors.add(e.flavor || "e"); }
          if (e.a === v.id) { fout++; flavors.add(e.flavor || "e"); }
        } else {
          if (e.a === v.id) ph++;
          if (e.b === v.id) ph++;
        }
      }
      if (v.kind === "v") {
        if (fin !== 1 || fout !== 1 || ph !== 1) issues.push({ vertex: v.id, kind: "valence", message: `vertex ${v.id} has ${fin} fermion in, ${fout} out, ${ph} photon; a QED vertex needs 1, 1, 1` });
        else if (flavors.size > 1) issues.push({ vertex: v.id, kind: "flavour", message: `vertex ${v.id} changes flavour; QED conserves each lepton's charge flow` });
      } else if (v.kind === "ct") {
        const ok = (fin === 1 && fout === 1 && ph === 0) || (fin === 0 && fout === 0 && ph === 2);
        if (!ok) issues.push({ vertex: v.id, kind: "valence", message: `two-point vertex ${v.id} must join two fermion ends (1 in, 1 out) or two photon ends` });
      }
    }
    for (const v of g.vertices.filter((u) => u.kind === "ext")) {
      const deg = g.edges.filter((e) => e.a === v.id || e.b === v.id).length;
      if (deg !== 1) issues.push({ vertex: v.id, kind: "leg", message: `external end ${v.id} must carry exactly one line` });
    }
    for (const e of g.edges) if (isExt(g, e.a) && isExt(g, e.b)) issues.push({ edge: e.id, kind: "leg", message: `line ${e.id} joins two external ends` });
    return { ok: issues.length === 0, issues, chargeFlow: !issues.some((i) => i.kind === "flavour" || i.kind === "valence") };
  }

  /* Union–find components of the internal graph (internal vertices, internal edges), optionally without one edge. */
  function components(g, { skipEdge = null, edges = null, vertices = null } = {}) {
    const vs = vertices || internalVertices(g).map((v) => v.id);
    const es = (edges || internalEdges(g)).filter((e) => e.id !== skipEdge);
    const parent = new Map(vs.map((v) => [v, v]));
    const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
    for (const e of es) { if (!parent.has(e.a) || !parent.has(e.b)) continue; const ra = find(e.a), rb = find(e.b); if (ra !== rb) parent.set(ra, rb); }
    const roots = new Set(vs.map(find));
    return { count: roots.size, find };
  }
  const loopNumber = (g) => internalEdges(g).length - internalVertices(g).length + components(g).count;
  const isConnected = (g) => components(g).count === 1;
  /* Internal edges whose removal disconnects the graph (one-particle-reducible lines). */
  function bridges(g) {
    const base = components(g).count;
    return internalEdges(g).filter((e) => components(g, { skipEdge: e.id }).count > base).map((e) => e.id);
  }
  const is1PI = (g) => isConnected(g) && bridges(g).length === 0;
  /* Superficial degree of divergence in d = 4 for QED: ω = 4 − (3/2)E_e − E_γ, and by power counting
     ω = 4L − 2I_γ − I_e + (fermion two-point insertions) + 2 (photon two-point insertions). */
  function superficialDegree(g) {
    const { Ee, Eg } = externalCounts(g);
    const ie = internalEdges(g), Ig = ie.filter((e) => e.type === "g").length, Ie = ie.length - Ig;
    const L = loopNumber(g);
    let ctE = 0, ctG = 0;
    for (const v of internalVertices(g)) if (v.kind === "ct") { if (g.edges.some((e) => e.type === "e" && (e.a === v.id || e.b === v.id))) ctE++; else ctG++; }
    return { fromLegs: 4 - 1.5 * Ee - Eg, fromPowerCounting: 4 * L - 2 * Ig - Ie + ctE + 2 * ctG, L, Ig, Ie, loopPower: 4 * L, propagatorPower: -(2 * Ig + Ie), numeratorPower: ctE + 2 * ctG };
  }
  /* Residue type from external legs. */
  function residue({ Ee, Eg }) {
    if (Ee === 2 && Eg === 0) return { id: "se", name: "electron self-energy", divergent: true };
    if (Ee === 0 && Eg === 2) return { id: "vp", name: "vacuum polarization", divergent: true };
    if (Ee === 2 && Eg === 1) return { id: "vx", name: "vertex", divergent: true };
    if (Ee === 0 && Eg === 4) return { id: "lbl", name: "light-by-light", divergent: false, note: "ω = 0, but gauge invariance makes the sum of these graphs finite; it needs no counterterm" };
    if (Ee === 0 && Eg % 2 === 1) return { id: "furry", name: `${Eg}-photon`, divergent: false, note: "vanishes by Furry's theorem (charge conjugation) when the fermion-loop orientations are summed" };
    return { id: "other", name: `${Ee} fermion, ${Eg} photon legs`, divergent: false };
  }

  /* Fundamental cycles of a spanning forest: one independent loop momentum per non-tree internal edge. */
  function cycleBasis(g) {
    const ie = internalEdges(g), adj = new Map(internalVertices(g).map((v) => [v.id, []]));
    for (const e of ie) { adj.get(e.a).push(e); if (e.b !== e.a) adj.get(e.b).push(e); }
    const parent = new Map(), parentEdge = new Map(), depth = new Map(), tree = new Set();
    for (const start of adj.keys()) {
      if (parent.has(start)) continue;
      parent.set(start, null); depth.set(start, 0);
      const queue = [start];
      while (queue.length) {
        const v = queue.shift();
        for (const e of adj.get(v)) {
          const w = e.a === v ? e.b : e.a;
          if (!parent.has(w)) { parent.set(w, v); parentEdge.set(w, e.id); depth.set(w, depth.get(v) + 1); tree.add(e.id); queue.push(w); }
        }
      }
    }
    const pathUp = (a, b) => {
      const ea = [], eb = [];
      while (depth.get(a) > depth.get(b)) { ea.push(parentEdge.get(a)); a = parent.get(a); }
      while (depth.get(b) > depth.get(a)) { eb.push(parentEdge.get(b)); b = parent.get(b); }
      while (a !== b) { ea.push(parentEdge.get(a)); eb.push(parentEdge.get(b)); a = parent.get(a); b = parent.get(b); }
      return [...ea, ...eb];
    };
    return ie.filter((e) => !tree.has(e.id)).map((e) => ({ chord: e.id, edges: [e.id, ...pathUp(e.a, e.b)] }));
  }

  /* ---------- subgraphs ---------- */
  /* A subgraph is a set of internal edge ids; its vertices are their endpoints. */
  function subgraphInfo(g, edgeIds) {
    const set = new Set(edgeIds);
    const es = g.edges.filter((e) => set.has(e.id));
    const vs = new Set();
    es.forEach((e) => { vs.add(e.a); vs.add(e.b); });
    const comp = components(g, { edges: es, vertices: [...vs] });
    const L = es.length - vs.size + comp.count;
    // External legs of γ: every line of Γ not in γ that ends on a vertex of γ (once per end).
    let Ee = 0, Eg = 0, full = true;
    for (const e of g.edges) {
      if (set.has(e.id)) continue;
      const ends = (vs.has(e.a) ? 1 : 0) + (vs.has(e.b) ? 1 : 0);
      if (ends === 2) full = false;
      if (e.type === "e") Ee += ends; else Eg += ends;
    }
    const brs = es.filter((e) => components(g, { edges: es.filter((f) => f.id !== e.id), vertices: [...vs] }).count > comp.count).map((e) => e.id);
    const res = residue({ Ee, Eg });
    return { edges: [...set].sort(), vertices: [...vs].sort(), L, connected: comp.count === 1, onePI: comp.count === 1 && brs.length === 0, full, Ee, Eg, omega: 4 - 1.5 * Ee - Eg, residue: res };
  }
  /* Every proper, connected, full 1PI subgraph with at least one loop, flagged divergent when its residue
     is one of QED's three divergent ones (self-energy, vacuum polarization, vertex). */
  function onePISubgraphs(g) {
    const ie = internalEdges(g);
    if (ie.length > 16) throw new Error("graph too large for subgraph enumeration");
    const out = [];
    for (let mask = 1; mask < 1 << ie.length; mask++) {
      if (mask === (1 << ie.length) - 1) continue; // γ ≠ Γ
      const ids = ie.filter((_, i) => mask & (1 << i)).map((e) => e.id);
      const info = subgraphInfo(g, ids);
      if (!info.connected || !info.onePI || !info.full || info.L < 1) continue;
      out.push(info);
    }
    out.sort((a, b) => a.edges.length - b.edges.length || a.edges.join().localeCompare(b.edges.join()));
    return out;
  }
  const divergentSubgraphs = (g) => onePISubgraphs(g).filter((s) => s.residue.divergent);
  /* Relations between two subgraphs: nested (edges of one inside the other), disjoint (no common vertex) or overlapping. */
  function relation(s, t) {
    const se = new Set(s.edges), te = new Set(t.edges);
    if (s.edges.every((e) => te.has(e))) return "inside";
    if (t.edges.every((e) => se.has(e))) return "contains";
    const tv = new Set(t.vertices);
    if (!s.vertices.some((v) => tv.has(v))) return "disjoint";
    return "overlap";
  }
  /* Containment forest (Hasse diagram) of a family of subgraphs plus Γ itself: each subgraph's parent is the smallest one containing it. */
  function containmentTree(g, subs) {
    const all = [...subs, { edges: internalEdges(g).map((e) => e.id).sort(), vertices: internalVertices(g).map((v) => v.id), whole: true }];
    return all.map((s, i) => {
      let parent = -1, best = Infinity;
      all.forEach((t, j) => { if (i !== j && relation(s, t) === "inside" && t.edges.length < best && t.edges.length > s.edges.length) { best = t.edges.length; parent = j; } });
      return { index: i, parent, edges: s.edges, whole: !!s.whole };
    });
  }

  /* ---------- contraction Γ/γ ---------- */
  /* Contract each (vertex-disjoint) subgraph to a single vertex. Two-leg residues become "ct" vertices. */
  function contract(g, subs) {
    let h = { ...g, id: `${g.id}/`, vertices: g.vertices.map((v) => ({ ...v })), edges: g.edges.map((e) => ({ ...e })) };
    subs.forEach((s, k) => {
      const vs = new Set(s.vertices), es = new Set(s.edges);
      const pts = h.vertices.filter((v) => vs.has(v.id));
      const nid = `c${k}_${s.vertices.join("")}`;
      const nv = { id: nid, x: Q.sum(pts.map((p) => p.x)) / pts.length, y: Q.sum(pts.map((p) => p.y)) / pts.length, kind: s.residue && s.residue.id === "vx" ? "v" : "ct", from: s.residue ? s.residue.id : null };
      h.vertices = [...h.vertices.filter((v) => !vs.has(v.id)), nv];
      h.edges = h.edges.filter((e) => !es.has(e.id)).map((e) => ({ ...e, a: vs.has(e.a) ? nid : e.a, b: vs.has(e.b) ? nid : e.b }));
    });
    return h;
  }

  /* ---------- canonical form (isomorphism) ---------- */
  function permutations(arr) {
    if (arr.length <= 1) return [arr.slice()];
    const out = [];
    arr.forEach((x, i) => { for (const p of permutations([...arr.slice(0, i), ...arr.slice(i + 1)])) out.push([x, ...p]); });
    return out;
  }
  function vertexSignature(g, v) {
    const parts = [v.kind];
    for (const e of g.edges) {
      if (e.a === v.id || e.b === v.id) {
        const ext = (e.a === v.id && isExt(g, e.b)) || (e.b === v.id && isExt(g, e.a));
        const dir = e.type === "e" ? (e.a === v.id ? "o" : "i") : "";
        parts.push(`${e.type}${e.flavor === "mu" ? "m" : ""}${dir}${ext ? "x" : ""}${e.a === e.b ? "s" : ""}`);
      }
    }
    return parts.sort().join(",");
  }
  /* Canonical string: the lexicographically least edge list over all vertex labellings respecting signatures. */
  function canonicalKey(g) {
    const iv = internalVertices(g);
    const sig = new Map(iv.map((v) => [v.id, vertexSignature(g, v)]));
    const classes = [...new Set([...sig.values()])].sort().map((s) => iv.filter((v) => sig.get(v.id) === s).map((v) => v.id));
    const options = classes.map((c) => permutations(c));
    let best = null;
    const encode = (label) => {
      const items = g.edges.map((e) => {
        const fl = e.flavor === "mu" ? "m" : "";
        if (isExt(g, e.a)) return `${e.type}${fl}>${label.get(e.b)}`;
        if (isExt(g, e.b)) return `${e.type}${fl}<${label.get(e.a)}`;
        if (e.type === "g") { const [x, y] = [label.get(e.a), label.get(e.b)].sort((p, q) => p - q); return `g${fl}:${x}-${y}`; }
        return `e${fl}:${label.get(e.a)}>${label.get(e.b)}`;
      }).sort();
      const kinds = iv.map((v) => [label.get(v.id), v.kind]).sort((p, q) => p[0] - q[0]).map((p) => p[1]).join("");
      return `${kinds}|${items.join(";")}`;
    };
    const rec = (ci, label, next) => {
      if (ci === classes.length) { const k = encode(label); if (best === null || k < best) best = k; return; }
      for (const perm of options[ci]) { const l2 = new Map(label); perm.forEach((id, j) => l2.set(id, next + j)); rec(ci + 1, l2, next + perm.length); }
    };
    let total = 1;
    for (const o of options) total *= o.length;
    if (total > 50000) throw new Error("graph too large for canonical form");
    rec(0, new Map(), 0);
    return best;
  }

  /* ---------- full analysis ---------- */
  function analyse(g) {
    const val = validate(g);
    const counts = externalCounts(g);
    const L = loopNumber(g), I = internalEdges(g).length, V = internalVertices(g).length, C = components(g).count;
    const sd = superficialDegree(g);
    const brs = bridges(g);
    let subs = [], div = [];
    try { subs = onePISubgraphs(g); div = subs.filter((s) => s.residue.divergent); } catch (e) { /* too large */ }
    const omega = sd.fromLegs;
    return {
      id: g.id, name: g.name, valid: val.ok, issues: val.issues, chargeFlow: val.chargeFlow,
      I, V, C, L, loopFormula: `L = I − V + C = ${I} − ${V} + ${C} = ${L}`,
      connected: C === 1, bridges: brs, onePI: C === 1 && brs.length === 0,
      external: counts, residue: residue(counts), omega, omegaParts: sd,
      verdict: L === 0 ? "tree level: no loop integral" : omega >= 0 && residue(counts).divergent ? "superficially divergent" : omega >= 0 ? "superficially divergent by power counting, but finite (see note)" : "superficially convergent",
      cycles: cycleBasis(g), divergentSubgraphs: div, onePISubgraphs: subs,
      overlapping: div.some((s, i) => div.some((t, j) => i < j && relation(s, t) === "overlap")),
    };
  }

  /* ---------- catalogue (layouts in a 200 × 120 box) ---------- */
  const V = (id, x, y, kind = "v") => ({ id, x, y, kind });
  const X = (id, x, y) => ({ id, x, y, kind: "ext" });
  const Ef = (id, a, b, bend = 0, flavor = "e") => ({ id, a, b, type: "e", flavor, bend });
  const Eg = (id, a, b, bend = 0) => ({ id, a, b, type: "g", bend });
  const CATALOGUE = [
    { id: "tree_emu", name: "e⁻μ⁻ → e⁻μ⁻ (tree)", order: 0, note: "one-photon exchange between an electron line and a muon line",
      vertices: [X("i1", 15, 22), X("o1", 185, 22), V("v1", 100, 34), X("i2", 15, 98), X("o2", 185, 98), V("v2", 100, 86)],
      edges: [Ef("p1", "i1", "v1"), Ef("p3", "v1", "o1"), Ef("p2", "i2", "v2", 0, "mu"), Ef("p4", "v2", "o2", 0, "mu"), Eg("q", "v1", "v2")] },
    { id: "sigma1", name: "electron self-energy Σ₁", order: 1, residue: "se", note: "the electron emits and reabsorbs a photon",
      vertices: [X("i", 10, 80), V("v1", 60, 80), V("v2", 140, 80), X("o", 190, 80)],
      edges: [Ef("pin", "i", "v1"), Ef("e1", "v1", "v2"), Ef("pout", "v2", "o"), Eg("k", "v1", "v2", -55)] },
    { id: "pi1", name: "vacuum polarization Π₁", order: 1, residue: "vp", note: "a fermion loop inserted in the photon line",
      vertices: [X("i", 8, 60), V("v1", 62, 60), V("v2", 138, 60), X("o", 192, 60)],
      edges: [Eg("qin", "i", "v1"), Ef("k1", "v1", "v2", -42), Ef("k2", "v2", "v1", -42), Eg("qout", "v2", "o")] },
    { id: "lambda1", name: "vertex correction Λ₁", order: 1, residue: "vx", note: "the one-loop correction to −ieγ^μ",
      vertices: [X("q", 100, 8), V("v0", 100, 38), V("v1", 52, 84), V("v2", 148, 84), X("i", 18, 112), X("o", 182, 112)],
      edges: [Eg("qx", "q", "v0"), Ef("pin", "i", "v1"), Ef("e1", "v1", "v0"), Ef("e2", "v0", "v2"), Ef("pout", "v2", "o"), Eg("k", "v1", "v2", 22)] },
    { id: "sigma2_rainbow", name: "rainbow self-energy (nested)", order: 2, residue: "se", note: "Σ₁ nested inside Σ₁",
      vertices: [X("i", 6, 92), V("v1", 30, 92), V("v2", 72, 92), V("v3", 128, 92), V("v4", 170, 92), X("o", 194, 92)],
      edges: [Ef("pin", "i", "v1"), Ef("e1", "v1", "v2"), Ef("e2", "v2", "v3"), Ef("e3", "v3", "v4"), Ef("pout", "v4", "o"), Eg("k1", "v1", "v4", -78), Eg("k2", "v2", "v3", -40)] },
    { id: "sigma2_crossed", name: "crossed self-energy (overlapping)", order: 2, residue: "se", note: "two overlapping vertex subgraphs",
      vertices: [X("i", 6, 92), V("v1", 30, 92), V("v2", 72, 92), V("v3", 128, 92), V("v4", 170, 92), X("o", 194, 92)],
      edges: [Ef("pin", "i", "v1"), Ef("e1", "v1", "v2"), Ef("e2", "v2", "v3"), Ef("e3", "v3", "v4"), Ef("pout", "v4", "o"), Eg("k1", "v1", "v3", -62), Eg("k2", "v2", "v4", -62)] },
    { id: "sigma2_vp", name: "self-energy with a vacuum-polarization insertion", order: 2, residue: "se", note: "Π₁ nested in the photon of Σ₁",
      vertices: [X("i", 6, 100), V("v1", 40, 100), V("v2", 160, 100), X("o", 194, 100), V("v3", 70, 46), V("v4", 130, 46)],
      edges: [Ef("pin", "i", "v1"), Ef("e1", "v1", "v2"), Ef("pout", "v2", "o"), Eg("k1", "v1", "v3"), Ef("l1", "v3", "v4", -30), Ef("l2", "v4", "v3", -30), Eg("k2", "v4", "v2")] },
    { id: "pi2_se", name: "vacuum polarization with a self-energy insertion", order: 2, residue: "vp", note: "Σ₁ nested on the fermion loop of Π₁",
      vertices: [X("i", 6, 70), V("v1", 44, 70), V("v2", 156, 70), X("o", 194, 70), V("a", 74, 34), V("b", 126, 34)],
      edges: [Eg("qin", "i", "v1"), Ef("u1", "v1", "a"), Ef("u2", "a", "b"), Ef("u3", "b", "v2"), Ef("d", "v2", "v1", -40), Eg("qout", "v2", "o"), Eg("k", "a", "b", -26)] },
    { id: "pi2_crossed", name: "vacuum polarization with an internal photon (overlapping)", order: 2, residue: "vp", note: "two overlapping vertex subgraphs",
      vertices: [X("i", 6, 64), V("v1", 44, 64), V("v2", 156, 64), X("o", 194, 64), V("a", 100, 22), V("b", 100, 106)],
      edges: [Eg("qin", "i", "v1"), Ef("u1", "v1", "a", -10), Ef("u2", "a", "v2", -10), Ef("d1", "v2", "b", -10), Ef("d2", "b", "v1", -10), Eg("qout", "v2", "o"), Eg("k", "a", "b")] },
    { id: "lambda2_ladder", name: "ladder vertex (nested)", order: 2, residue: "vx", note: "Λ₁ nested inside Λ₁",
      vertices: [X("q", 100, 6), V("v0", 100, 30), V("v2", 70, 60), V("v3", 130, 60), V("v1", 40, 90), V("v4", 160, 90), X("i", 10, 116), X("o", 190, 116)],
      edges: [Eg("qx", "q", "v0"), Ef("pin", "i", "v1"), Ef("e1", "v1", "v2"), Ef("e2", "v2", "v0"), Ef("e3", "v0", "v3"), Ef("e4", "v3", "v4"), Ef("pout", "v4", "o"), Eg("k1", "v1", "v4", 16), Eg("k2", "v2", "v3", 10)] },
    { id: "sigma3_rainbow", name: "three-loop rainbow (doubly nested)", order: 3, residue: "se", note: "Σ₁ inside Σ₁ inside Σ₁",
      vertices: [X("i", 4, 104), V("v1", 20, 104), V("v2", 50, 104), V("v3", 82, 104), V("v4", 118, 104), V("v5", 150, 104), V("v6", 180, 104), X("o", 196, 104)],
      edges: [Ef("pin", "i", "v1"), Ef("e1", "v1", "v2"), Ef("e2", "v2", "v3"), Ef("e3", "v3", "v4"), Ef("e4", "v4", "v5"), Ef("e5", "v5", "v6"), Ef("pout", "v6", "o"), Eg("k1", "v1", "v6", -92), Eg("k2", "v2", "v5", -64), Eg("k3", "v3", "v4", -34)] },
    { id: "sigma3_double", name: "self-energy with two disjoint insertions", order: 3, residue: "se", note: "two Σ₁ side by side inside Σ₁",
      vertices: [X("i", 4, 104), V("v1", 18, 104), V("a1", 46, 104), V("b1", 86, 104), V("a2", 114, 104), V("b2", 154, 104), V("v2", 182, 104), X("o", 196, 104)],
      edges: [Ef("pin", "i", "v1"), Ef("e1", "v1", "a1"), Ef("e2", "a1", "b1"), Ef("e3", "b1", "a2"), Ef("e4", "a2", "b2"), Ef("e5", "b2", "v2"), Ef("pout", "v2", "o"), Eg("k0", "v1", "v2", -92), Eg("k1", "a1", "b1", -34), Eg("k2", "a2", "b2", -34)] },
    { id: "pi1_chain", name: "two Π₁ in a chain (one-particle reducible)", order: 2, residue: "vp", note: "cutting the middle photon disconnects it: not 1PI",
      vertices: [X("i", 4, 60), V("v1", 30, 60), V("v2", 80, 60), V("v3", 120, 60), V("v4", 170, 60), X("o", 196, 60)],
      edges: [Eg("qin", "i", "v1"), Ef("a1", "v1", "v2", -30), Ef("a2", "v2", "v1", -30), Eg("mid", "v2", "v3"), Ef("b1", "v3", "v4", -30), Ef("b2", "v4", "v3", -30), Eg("qout", "v4", "o")] },
    { id: "lbl", name: "light-by-light box", order: 1, residue: "lbl", note: "ω = 0 by power counting, finite by gauge invariance",
      vertices: [X("x1", 20, 14), X("x2", 180, 14), X("x3", 180, 106), X("x4", 20, 106), V("a", 60, 36), V("b", 140, 36), V("c", 140, 84), V("d", 60, 84)],
      edges: [Eg("g1", "x1", "a"), Eg("g2", "x2", "b"), Eg("g3", "x3", "c"), Eg("g4", "x4", "d"), Ef("l1", "a", "b"), Ef("l2", "b", "c"), Ef("l3", "c", "d"), Ef("l4", "d", "a")] },
  ];
  const byId = (id) => { const g = CATALOGUE.find((c) => c.id === id); if (!g) throw new Error(`no catalogue graph ${id}`); return g; };
  /* Literature counts of QED vertex graphs contributing to the electron g − 2 at each order (Kinoshita and
     collaborators; Aoyama, Hayakawa, Kinoshita & Nio, PRL 109, 111807 (2012)). Not computed here. */
  const G2_GRAPH_COUNTS = [{ loops: 1, count: 1 }, { loops: 2, count: 7 }, { loops: 3, count: 72 }, { loops: 4, count: 891 }, { loops: 5, count: 12672 }];

  const api = {
    isExt, vByID, internalVertices, internalEdges, externalLegs, externalCounts, validate, components, loopNumber, isConnected, bridges, is1PI,
    superficialDegree, residue, cycleBasis, subgraphInfo, onePISubgraphs, divergentSubgraphs, relation, containmentTree, contract, canonicalKey, analyse,
    CATALOGUE, byId, G2_GRAPH_COUNTS,
  };
  Q.graphs = api;
  return api;
});
