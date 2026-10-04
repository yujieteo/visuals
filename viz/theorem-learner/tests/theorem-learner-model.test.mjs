// Theorem Learner: the model's own checks: proof references, selection and highlights, the theory graph, the tree,
// the paged search and the correspondence between the page's selected proof and the exported slides. Expected values
// come from the data's own definitions (roles, edges, steps), recomputed here, not read back from the view.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const Model = /** @type {any} */ (require("../src/model.js"));
const Report = /** @type {any} */ (require("../report.js"));
const D = require("../raw.json");
const VisualKit = require("../../../scripts/kit/kit.js");
const at = (/** @type {Record<string, unknown>} */ patch) => Model.derive(VisualKit.normalize(Model.FIELDS, patch).state, D);
const ix = Model.index(D);

test("proof references: every role, edge and conclusion names a step of its proof; every hypothesis has one role", () => {
  assert.ok(ix.proofs.length > 0);
  for (const p of ix.proofs) {
    const t = ix.theorems[p.th];
    assert.ok(t.pf.includes(ix.proofById.get(p.id)), `${p.id} is listed by its theorem`);
    assert.ok(p.stp.length >= 3 && p.stp.length <= 7, `${p.id} has 3 to 7 steps`);
    const n = p.stp.length;
    for (const [a, b] of p.ed) assert.ok(a >= 0 && a < n && b >= 0 && b < n && a !== b, `${p.id} edge ${a}->${b}`);
    assert.ok(p.cl >= 0 && p.cl < n);
    assert.ok(!p.ed.some((/** @type {number[]} */ e) => e[0] === p.cl), `${p.id}: the conclusion step has no outgoing edge`);
    // Every step reaches the conclusion along the edges.
    const reach = new Set([p.cl]);
    for (let pass = 0; pass < n; pass++) for (const [a, b] of p.ed) if (reach.has(b)) reach.add(a);
    assert.equal(reach.size, n, `${p.id}: every step leads to the conclusion`);
    const hyps = (t.hy ?? []).map((/** @type {any} */ h) => h.id);
    for (const h of hyps) assert.equal(p.ro.filter((/** @type {any} */ r) => r.h === h).length, 1, `${p.id}: one role for ${h}`);
    for (const r of p.ro) {
      assert.ok(hyps.includes(r.h));
      if (!r.un) assert.ok(r.st.length > 0, `${p.id}: the role of ${r.h} names its steps`);
      for (const k of r.st) assert.ok(k >= 0 && k < n);
    }
  }
});

test("segments: every marked concept is a concept of the snapshot and has a 'why here' in its proof", () => {
  const nc = ix.concepts.length;
  for (const p of ix.proofs) {
    const t = ix.theorems[p.th];
    const marked = new Set([...Model.segConcepts(t.st), ...Model.segConcepts(t.cn), ...(t.hy ?? []).flatMap((/** @type {any} */ h) => Model.segConcepts(h.seg)),
      ...Model.segConcepts(p.sl), ...Model.segConcepts(p.sc), ...p.ro.flatMap((/** @type {any} */ r) => Model.segConcepts(r.why)),
      ...p.stp.flatMap((/** @type {any} */ s) => [...Model.segConcepts(s.sl), ...Model.segConcepts(s.dt)])]);
    for (const ci of marked) {
      assert.ok(ci >= 0 && ci < nc, `${p.id}: concept index ${ci}`);
      assert.ok(String(ci) in p.cw, `${p.id}: ${ix.concepts[ci].id} has a why here`);
    }
    for (const s of p.stp) for (const ci of s.cs) assert.ok(marked.has(ci));
  }
});

test("selection: a hypothesis lights the steps of its role; a step lights its inputs and outputs", () => {
  const d = at({ sel: "wd:Q752375", proof: "local-bounds", hyp: "h:compact" });
  const p = d.surface.proof;
  const role = p.roles.find((/** @type {any} */ r) => r.h === "h:compact");
  assert.equal(d.surface.highlight.mode, "hypothesis");
  assert.deepEqual(d.surface.highlight.steps, role.steps);
  const s = at({ sel: "wd:Q752375", proof: "local-bounds", step: "s:finite" });
  const k = s.surface.proof.steps.findIndex((/** @type {any} */ x) => x.id === "s:finite");
  const raw = ix.proofs[ix.proofById.get("proof:wd:Q752375:local-bounds")];
  assert.deepEqual(s.surface.highlight.inputs, raw.ed.filter((/** @type {number[]} */ e) => e[1] === k).map((/** @type {number[]} */ e) => e[0]));
  assert.deepEqual(s.surface.highlight.outputs, raw.ed.filter((/** @type {number[]} */ e) => e[0] === k).map((/** @type {number[]} */ e) => e[1]));
  assert.ok(s.surface.highlight.hyps.includes("h:compact"), "the hypothesis whose role names the step is an input");
});

test("selection: a proof change changes the slogan, roles, steps, evidence and the export", () => {
  const a = at({ sel: "wd:Q752375", proof: "compact-image" });
  const b = at({ sel: "wd:Q752375", proof: "local-bounds" });
  assert.notDeepEqual(a.surface.proof.slogan, b.surface.proof.slogan);
  assert.notDeepEqual(a.surface.proof.roles, b.surface.proof.roles);
  assert.notDeepEqual(a.surface.proof.steps.map((/** @type {any} */ s) => s.id), b.surface.proof.steps.map((/** @type {any} */ s) => s.id));
  assert.notDeepEqual(a.surface.proof.source, b.surface.proof.source);
  const ra = JSON.stringify(Report.report(VisualKit.normalize(Model.FIELDS, { sel: "wd:Q752375", proof: "compact-image" }).state, a, D));
  const rb = JSON.stringify(Report.report(VisualKit.normalize(Model.FIELDS, { sel: "wd:Q752375", proof: "local-bounds" }).state, b, D));
  assert.notEqual(ra, rb);
  assert.ok(rb.includes("Cover the space by bounded neighborhoods."));
  assert.ok(!ra.includes("Cover the space by bounded neighborhoods."));
});

test("export correspondence: one slide per step, in order, each with its slogan, inputs, output and notes", () => {
  for (const ex of Model.EXAMPLES.filter((/** @type {any} */ e) => e.state.view === "proof")) {
    const st = VisualKit.normalize(Model.FIELDS, ex.state).state;
    const d = Model.derive(st, D);
    const r = Report.report(st, d, D);
    const stepFrames = r.method.filter((/** @type {any} */ f) => /^Step \d+:/.test(f.title));
    assert.equal(stepFrames.length, d.surface.proof.steps.length, ex.id);
    d.surface.proof.steps.forEach((/** @type {any} */ s, /** @type {number} */ k) => {
      const f = stepFrames[k];
      assert.ok(f.title.startsWith(`Step ${s.number}:`));
      assert.ok(f.body.includes(Model.flat(s.slogan)), `${ex.id} step ${s.number} slogan`);
      assert.match(f.body, /Inputs: /);
      assert.match(f.body, /Output: /);
      assert.ok(f.notes && f.notes.length > 10, "speaker notes hold the full argument");
    });
    assert.ok(r.setup[0].body.includes(Model.flat(d.surface.statement)), "the first slide is the exact statement");
    assert.ok(r.checks.some((/** @type {any} */ f) => f.key), "the takeaway carries the key field");
  }
});

test("verification: no explanation is Lean-checked, and a formal declaration never makes it so", () => {
  for (const p of ix.proofs) {
    assert.equal(p.vf.lean, false);
    const v = Model.verification(ix.theorems[p.th], p);
    assert.equal(v.leanCheckedProof.present, false);
    if (ix.theorems[p.th].formal) assert.equal(v.formalDeclaration.present, true);
  }
  const d = at({ sel: "wd:Q752375" });
  assert.match(String(d.surface.formal.difference), /minimum/, "the formal record says it documents only the minimum");
});

test("theory graph: typed edges, a retained expansion, and shared mechanisms that keep proofs apart", () => {
  const g = at({ view: "graph", gfocus: "wd:Q752375" }).graph;
  const proves = g.edges.filter((/** @type {any} */ e) => e.type === "proves" && e.to === "wd:Q752375");
  assert.equal(proves.length, ix.theorems[ix.theoremById.get("wd:Q752375")].pf.length, "each proof proves the theorem");
  for (const e of g.edges) assert.ok(e.type in Model.EDGE_TYPES && e.label);
  const open = at({ view: "graph", gfocus: "wd:Q752375", gopen: "proof:wd:Q752375:local-bounds" }).graph;
  assert.ok(open.nodes.length > g.nodes.length, "an expanded node adds its neighbours");
  assert.ok(open.nodes.some((/** @type {any} */ n) => n.id === "m:finite-subcover"));
  const m = at({ view: "graph", gfocus: "m:finite-subcover" }).graph;
  const occ = m.edges.filter((/** @type {any} */ e) => e.type === "occurs-in");
  assert.ok(occ.length >= 2, "the finite-subcover move occurs in at least two proofs");
  assert.equal(new Set(occ.map((/** @type {any} */ e) => e.to)).size, occ.length, "each proof stays its own node");
  assert.ok(at({ view: "graph" }).graph.entry.length > 0, "basic concepts are offered as entry points");
});

test("tree: a theorem's children are its proof's lemmas and concepts; known items stop the expansion", () => {
  const d = at({ view: "tree", troot: "wd:Q752375", tdepth: 2 });
  const p = ix.proofs[ix.theorems[ix.theoremById.get("wd:Q752375")].pf[0]];
  const want = new Set(p.stp.flatMap((/** @type {any} */ s) => s.cs).map((/** @type {number} */ ci) => ix.concepts[ci].id));
  for (const id of want) assert.ok(d.tree.root.children.some((/** @type {any} */ c) => c.id === id), id);
  const data = { ...D, profile: { known: { "c:compact-space": 0 } } };
  const t = Model.treeOf(VisualKit.normalize(Model.FIELDS, { tdepth: 3 }).state, data, "wd:Q752375", []);
  const c = t.root.children.find((/** @type {any} */ x) => x.id === "c:compact-space");
  assert.equal(c.known, true);
  assert.equal(c.children.length, 0);
});

test("search: bounded pages of 10 with the total count and a next page", () => {
  const p0 = at({ view: "find", fq: "theorem" }).find;
  assert.ok(p0.total > 10);
  assert.equal(p0.items.length, 10);
  assert.equal(p0.pages, Math.ceil(p0.total / 10));
  const p1 = at({ view: "find", fq: "theorem", fpage: 1 }).find;
  assert.notDeepEqual(p1.items.map((/** @type {any} */ x) => x.id), p0.items.map((/** @type {any} */ x) => x.id));
  const decl = at({ view: "find", fq: "IsCompact.exists_isMinOn", fkind: "declarations" }).find;
  assert.ok(decl.items.some((/** @type {any} */ x) => x.id === "wd:Q752375"), "declaration names are searchable");
});

test("unknown content stays unknown: a theorem without a proof shows no invented step", () => {
  const without = ix.theorems.find((/** @type {any} */ t) => !t.pf.length);
  if (!without) return;
  const d = at({ sel: without.id });
  assert.equal(d.surface.proof, null);
  assert.equal(d.surface.proofs.length, 0);
});

test("state: an unknown theorem, proof or step falls back with a notice", () => {
  const d = at({ sel: "wd:nope", proof: "nope", step: "s:nope" });
  assert.ok(d.notes.some((/** @type {string} */ n) => /not in this snapshot/.test(n)));
  const e = at({ sel: "wd:Q752375", proof: "nope" });
  assert.ok(e.notes.some((/** @type {string} */ n) => /not a proof of/.test(n)));
  assert.equal(e.surface.proof.slug, e.surface.proofs[0].slug);
});
