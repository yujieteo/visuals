// Scientific Modelling: the Dimensionless Number Finder against the specification's worked examples (sections 5 and
// 10), the SymPy references of data/references.json (tools/references.py, run once with pinned versions), and the
// zero-scale, dependent-input and override cases. Every example's record is confirmed, then run through derive().
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const Q = require("../src/rational.js");
const LA = require("../src/linalg.js");
const R = require("../src/record.js");
const Model = require("../src/model.js");
const VisualKit = require("../../../scripts/kit/kit.js");
const DATA = require("../raw.json");
const ENGINE = Model.engineData(DATA);

const run = (example, patch = {}, edit = null) => {
  let rec = R.fromExample(ENGINE, example);
  if (edit) rec = R.edit(rec, edit, "test edit");
  return Model.derive(VisualKit.normalize(Model.FIELDS, { example, ...patch }).state, DATA, R.confirm(rec));
};

test("section 5: D, det D_R = -1, rank 4, the exponent equations and the three groups of the specification, exactly", () => {
  const f = run("heat-transfer-pi").finder;
  assert.deepEqual(f.vars.map((v) => v.symbol), ["h", "k", "rho", "mu", "c_p", "U", "L"]);
  assert.deepEqual(f.D, [["1", "1", "1", "1", "0", "0", "0"], ["0", "1", "-3", "-1", "2", "1", "1"], ["-3", "-3", "0", "-1", "-2", "-1", "0"], ["-1", "-1", "0", "0", "-1", "0", "0"]]);
  assert.deepEqual([f.n, f.r, f.m], [7, 4, 3]);
  assert.deepEqual(f.repeating.symbols, ["rho", "U", "L", "k"]);
  assert.deepEqual(f.repeating.DR, [["1", "0", "0", "1"], ["-3", "1", "1", "1"], ["0", "-1", "0", "-3"], ["0", "0", "0", "-1"]]);
  assert.equal(f.repeating.det, "-1");
  // The table of section 5, in the order mass, length, time, temperature.
  const eq = Object.fromEntries(f.exponentEquations.map((q) => [q.symbol, q]));
  assert.deepEqual(eq.h.lines.map((l) => l.text), ["1+a+d=0", "-3a+b+c+d=0", "-3-b-3d=0", "-1-d=0"]);
  assert.deepEqual(eq.mu.lines.map((l) => l.text), ["1+a+d=0", "-1-3a+b+c+d=0", "-1-b-3d=0", "-d=0"]);
  assert.deepEqual(eq.c_p.lines.map((l) => l.text), ["a+d=0", "2-3a+b+c+d=0", "-2-b-3d=0", "-1-d=0"]);
  assert.deepEqual(eq.h.solution, ["0", "0", "1", "-1"]);
  assert.deepEqual(eq.mu.solution, ["-1", "-1", "-1", "0"]);
  assert.deepEqual(eq.c_p.solution, ["1", "1", "1", "-1"]);
  assert.deepEqual(f.groups.map((g) => g.exps), [{ "v-h": "1", "v-k": "-1", "v-L": "1" }, { "v-rho": "-1", "v-mu": "1", "v-U": "-1", "v-L": "-1" }, { "v-k": "-1", "v-rho": "1", "v-cp": "1", "v-U": "1", "v-L": "1" }]);
  assert.deepEqual(f.groups.map((g) => g.names.map((n) => n.label)), [["Nu"], ["Re⁻¹"], ["Pe"]], "the direct basis is Nu, Re^-1, Pe");
  assert.deepEqual(f.familiar.groups.map(Model.groupLabel), ["Nu", "Re", "Pr"], "the familiar basis is Nu, Re, Pr");
  assert.deepEqual(f.familiar.T, [["1", "0", "0"], ["0", "-1", "1"], ["0", "0", "1"]], "Re = (Re^-1)^-1 and Pr = Re^-1 Pe");
  assert.equal(f.familiar.det, "-1");
  assert.ok(f.checks.every((c) => c.passed && c.status === "exact"), JSON.stringify(f.checks.filter((c) => !c.passed)));
  assert.equal(f.correlation.relation, "Nu=f\\left(Re,\\;Pr\\right)");
});

test("section 10 fin: the time row is -3 times the mass row, rank 3, and the familiar basis is the specification's basis", () => {
  const f = run("straight-fin").finder;
  const row = (b) => f.D[f.rows.findIndex((r) => r.base === b)].map(Number);
  assert.deepEqual(row("T"), row("M").map((x) => (x ? -3 * x : 0)));
  assert.deepEqual([f.n, f.r, f.m], [7, 3, 4]);
  assert.equal(f.repeating.det, "1", "the M, L, Θ rows of k, L, ΔT have determinant 1");
  assert.deepEqual(f.repeating.DRrows, ["M", "L", "Θ"]);
  assert.deepEqual(f.familiar.groups.map((g) => g.label), ["Q̇L/(kA_c·ΔT)", "hPL²/(kA_c)", "PL/A_c", "A_c/L²"]);
  assert.deepEqual(f.familiar.groups.map((g) => g.catalogue), ["Qfin", "lambda2", "PLA", "AL2"]);
  assert.ok(f.familiar.equivalent);
  const values = Object.fromEntries(f.groups.filter((g) => g.value).map((g) => [g.label, g.value.lo]));
  assert.deepEqual(values, { "hL/k": "1/160", "P/L": "22/25", "A_c/L²": "2/125" }, "exact values from h = 25, k = 200, P = 0.044, A_c = 4e-5, L = 0.05");
});

test("the slab: θ, X, Fo and Bi from the variable list, with the coordinates kept out of the repeating set", () => {
  const f = run("transient-slab").finder;
  assert.deepEqual(f.familiar.groups.map(Model.groupLabel), ["θ", "Bi", "X", "Fo"]);
  const out = Object.fromEntries(f.repeating.excluded.map((e) => [e.symbol, e.reason]));
  assert.match(out.x, /coordinate/);
  assert.match(out.t, /coordinate/);
  assert.match(out.DT, /quantity of interest/);
});

test("every SymPy reference case: the same D, the same rank, and a kernel of the same span as the engine's groups", () => {
  assert.equal(DATA.references.versions.sympy, "1.14.0");
  assert.ok(DATA.references.cases.length >= 8);
  for (const c of DATA.references.cases) {
    const f = run(c.example).finder;
    assert.ok(f.ready, c.example);
    assert.deepEqual(f.vars.map((v) => v.symbol), c.symbols, c.example);
    assert.deepEqual(f.D, c.D, `${c.example}: D`);
    assert.equal(f.r, c.rank, `${c.example}: rank`);
    assert.equal(f.m, c.groups, `${c.example}: groups`);
    const groups = f.groups.map((g) => f.vars.map((v) => Q.parse(g.exps[v.id] ?? "0")));
    for (const k of c.kernel) assert.ok(LA.express(groups, k.map((x) => Q.parse(x))) !== null, `${c.example}: SymPy's kernel vector ${k} is a combination of the groups`);
    if (c.det_DR !== null && c.preferred.join(",") === f.repeating.symbols.join(",")) assert.equal(f.repeating.det, c.det_DR, `${c.example}: det D_R`);
  }
});

test("zero scale: U = 0 is refused as a repeating variable, the next valid set is used and the changed interpretation is stated", () => {
  const d = run("fail-zero-scale");
  const f = d.finder;
  assert.deepEqual(f.repeating.symbols, ["rho", "L", "k", "mu"]);
  assert.match(f.repeating.excluded.find((e) => e.symbol === "U").reason, /value is 0/);
  assert.equal(d.zeroNote.length, 1);
  assert.match(d.zeroNote[0], /U now appears only in UρL\/μ, with a positive exponent/);
  assert.deepEqual(f.familiar.groups.map(Model.groupLabel), ["Nu", "Re", "Pr"]);
});

test("dependent inputs: ν = μ/ρ keeps 4 algebraic groups but only 3 that can vary, and the fixed group stays out of f", () => {
  const f = run("fail-dependent").finder;
  assert.equal(f.m, 4);
  assert.equal(f.constraints.free, 3);
  assert.deepEqual(f.constraints.items.map((c) => [c.id, c.monomial, c.value]), [["e-nu", true, "1"]]);
  assert.equal(f.familiar.groups.find((g) => g.fixed).label, "ρν/μ");
  assert.equal(f.correlation.relation, "Nu=f\\left(Re,\\;Pr\\right)");
});

test("the researcher's repeating set: a valid set changes the basis to an equivalent one; an invalid set is refused with its reason", () => {
  const own = run("heat-transfer-pi", { repeating: "rho,L,k,mu" }).finder;
  assert.deepEqual(own.repeating.symbols, ["rho", "L", "k", "mu"]);
  assert.equal(own.repeating.override.error, null);
  assert.deepEqual(own.groups.map((g) => g.names[0].label), ["Nu", "Pr", "Re"]);
  for (const [set, reason] of [["rho,L,k", /rank is 4/], ["rho,U,L,mu", /not independent/], ["rho,U,L,zz", /not in the Pi set/]]) {
    const f = run("heat-transfer-pi", { repeating: set }).finder;
    assert.match(f.repeating.override.error, reason, set);
    assert.deepEqual(f.repeating.symbols, ["rho", "U", "L", "k"], `${set}: the automatic set stays`);
  }
});

test("a dimensionless input keeps its meaning and forms a group by itself; a conductivity without a phase gives both names", () => {
  const d = run("heat-transfer-pi", {}, (inp) => {
    inp.variables.push(R.variable({ id: "v-ang", symbol: "phi", meaning: "Flow angle", quantity: "angle", unit: "rad", pi: true }));
    inp.variables.find((v) => v.id === "v-k").phase = "";
  });
  const f = d.finder;
  const ang = f.groups.find((g) => g.contains.length === 1 && g.contains[0] === "v-ang");
  assert.equal(ang.meaning, "angle");
  const hl = f.groups.find((g) => g.label === "hL/k");
  assert.deepEqual(hl.names.map((n) => n.id).sort(), ["Bi", "Nu"]);
  assert.ok(hl.names.every((n) => n.assumes.some((a) => /is the (fluid|solid) conductivity/.test(a))), "each name states the phase it assumes");
  assert.ok(hl.names.find((n) => n.id === "Bi").assumes.includes("L is the Biot length"), "Bi also states that L must be the Biot length");
});
