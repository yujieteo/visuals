// Scientific Modelling: the Model Nondimensionalizer (spec sections 6 and 7). The worked slab reproduces section 7
// exactly, the fin reproduces section 10, the lumped body has no parameter left, a zero scale is refused with an
// alternative and the changed meaning, failed checks block it, a parameter that cancels is named, a chosen scale is
// a new version of the record, and SymPy's independent substitution gives the same dimensionless forms.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const S = require("../src/sym.js");
const R = require("../src/record.js");
const C = require("../src/check.js");
const N = require("../src/nondim.js");
const Model = require("../src/model.js");
const VisualKit = require("../../../scripts/kit/kit.js");
const DATA = require("../raw.json");
const ENGINE = Model.engineData(DATA);

const state = (example) => VisualKit.normalize(Model.FIELDS, { example }).state;
const derived = (example, rec = R.confirm(R.fromExample(ENGINE, example))) => Model.derive(state(example), DATA, rec);
const HATS = { isField: (n) => n === "theta", isCoordinate: (n) => n === "X" || n === "tau", depends: () => true, isVar: (n) => ["theta", "X", "tau"].includes(n) };
/** The canonical form of an equation "a = b" as a − b, in the dimensionless variables. */
const form = (text) => { const [a, b] = text.split("="); return S.sub(S.read(a, HATS), S.read(b, HATS)); };
const eq = (nd, id) => nd.equations.find((e) => e.id === id);
/** Is the engine's dimensionless form of `id` the expected one, exactly (canonical forms)? */
const sameForm = (nd, id, expected) => assert.ok(S.equal(form(eq(nd, id).dimensionlessPlain), form(expected)), `${id}: ${eq(nd, id).dimensionlessPlain} is ${expected}`);

test("the worked slab of section 7: the equation, the surface sign, the initial condition and the inverse transformation", () => {
  const nd = derived("transient-slab").nondim;
  assert.ok(nd.ready);
  const v = Object.fromEntries(nd.variables.map((x) => [x.name, x]));
  assert.deepEqual([v.x.hat, v.t.hat, v.T.hat], ["X", "tau", "theta"]);
  assert.ok(S.equal(S.read(v.x.scalePlain), S.read("L")) && S.equal(S.read(v.t.scalePlain), S.read("L^2*rho*c_p/k")), "x_c = L and t_c = L²/α = ρc_pL²/k");
  assert.equal(v.T.offsetPlain, "T_inf");
  assert.equal(v.T.scalePlain, "DT_i", "the temperature scale is T_i − T_∞");
  assert.ok(nd.variables.every((x) => x.inverseOk), "each inverse undoes its forward map");
  // T_t = (T_i − T_∞)(α/L²) θ_τ and T_xx = (T_i − T_∞)/L² θ_XX, with α = k/(ρ c_p).
  const der = (lhs) => nd.derivatives.find((x) => x.plain.startsWith(lhs)).plain.split(" = ")[1];
  const ctx = { ...HATS, isField: (n) => n === "theta" || n === "T" };
  assert.ok(S.equal(S.read(der("d(T,t)"), ctx), S.read("DT_i*k/(rho*c_p*L^2)*d(theta,tau)", ctx)));
  assert.ok(S.equal(S.read(der("d(T,x,x)"), ctx), S.read("DT_i/L^2*d(theta,X,X)", ctx)));
  sameForm(nd, "e-heat", "d(theta,tau) = d(theta,X,X)");
  sameForm(nd, "c-centre", "d(theta,X) = 0");
  sameForm(nd, "c-surface", "-d(theta,X) = h*L/k*theta");
  sameForm(nd, "c-initial", "theta = 1");
  assert.deepEqual(["c-centre", "c-surface", "c-initial"].map((id) => eq(nd, id).at.plain), ["0", "1", "0"], "θ_X(0, τ), the surface at X = 1, and τ = 0");
  assert.match(eq(nd, "c-surface").namedTex, /^-\\frac\{\\partial \\theta\}\{\\partial X\}=Bi\\,\\theta$/, "the surface sign stays: −θ_X = Bi θ");
  const params = nd.parameters.filter((p) => p.role === "parameter");
  assert.deepEqual(params.map((p) => [p.names.map((x) => x.id), p.independent]), [[["Bi"], true]], "Bi = hL/k is the one remaining constant parameter");
  assert.ok(nd.equations.every((e) => e.dimensionless && e.reverseOk), "every coefficient is dimensionless and every form comes back");
  assert.equal(nd.pi.absent.length, 0, "the model uses every Pi group: θ, X, Fo and Bi");
  assert.equal(nd.pi.rows.find((r) => r.what === "coordinate" && r.label === "τ").comboLabel, "Fo", "τ = Fo, the dimensionless time coordinate");
});

test("the straight fin of section 10: θ_XX − λ²θ = 0, θ(0) = 1, θ_X(1) = 0, the base heat flow, and the geometry the 1D model combines", () => {
  const nd = derived("straight-fin").nondim;
  sameForm(nd, "e-fin", "d(theta,X,X) - h*P*L^2/(k*A_c)*theta = 0");
  sameForm(nd, "c-base", "theta = 1");
  sameForm(nd, "c-tip", "d(theta,X) = 0");
  sameForm(nd, "e-Q", "Q_dot*L/(k*A_c*Delta_T) = -d(theta,X)");
  assert.equal(eq(nd, "e-Q").at.plain, "0", "the base heat flow is at X = 0");
  assert.match(eq(nd, "e-fin").namedTex, /\\lambda\^2\\,\\theta/);
  const lambda = nd.parameters.find((p) => p.names.some((x) => x.id === "lambda2"));
  assert.equal(lambda.value.fraction, "11/32", "λ² = hPL²/(kA_c) = 11/32 from the example's values");
  assert.ok(nd.parameters.some((p) => p.role === "output" && p.names.some((x) => x.id === "Qfin")), "Q̇L/(kA_cΔT) is an output, not a parameter");
  assert.deepEqual(nd.pi.absent.map((a) => a.label).sort(), ["A_c/L²", "PL/A_c"], "the 1D equation combines the geometry into λ²");
  const x = nd.scales.find((s) => s.name === "x");
  const balance = x.candidates.find((c) => c.source === "balance");
  assert.ok(S.equal(S.read(balance.plain), S.read("(k*A_c/(h*P))^(1/2)")), "the competing length 1/m from conduction against convection");
  assert.deepEqual(balance.ratio.names.map((x) => [x.id, x.power]), [["lambda2", "1/2"]], "the ratio of the two lengths is λ = (λ²)^(1/2) = mL");
});

test("the lumped body: dθ/dτ = −θ with no parameter left; Bi stays out of the equations and decides their validity", () => {
  const nd = derived("lumped-body").nondim;
  sameForm(nd, "e-energy", "d(theta,tau) = -theta");
  sameForm(nd, "c-initial", "theta = 1");
  assert.equal(nd.parameters.filter((p) => p.role === "parameter").length, 0);
  const t = nd.scales.find((s) => s.name === "t");
  assert.ok(S.equal(S.read(t.chosen.plain), S.read("rho*c_p*V/(h*A_s)")), "t_c = ρc_pV/(hA_s) from heat storage against convection");
  assert.equal(t.chosen.value, "130", "130 s for the 1 cm steel cube");
  assert.deepEqual(nd.pi.absent.map((a) => a.label), ["Bi"]);
  assert.match(nd.pi.absentWhy, /do not contain k/);
  assert.ok(nd.enters.filter((e) => ["rho", "c_p", "V", "A_s", "h"].includes(e.name)).every((e) => e.onlyScales), "these parameters change only the time unit");
});

test("a zero scale: T_i − T_∞ = 0 is refused, the heat-source scale replaces it, and the page states the changed meaning", () => {
  const d = derived("fail-zero-temperature-scale");
  const T = d.nondim.scales.find((s) => s.name === "T");
  const refused = T.candidates.find((c) => !c.valid);
  assert.equal(refused.plain, "DT_i");
  assert.match(refused.signWhy, /values of T_i and T_∞ give .* = 0/);
  assert.ok(S.equal(S.read(T.chosen.plain), S.read("q_v*L^2/k")));
  assert.match(T.changed, /now measures T − T_∞ in units of L²q̇_v\/k, not/);
  sameForm(d.nondim, "e-heat", "d(theta,tau) = d(theta,X,X) + 1");
  const initial = d.nondim.parameters.find((p) => p.where.includes("c-initial"));
  assert.equal(initial.value.lo, "0", "θ = (T_i − T_∞)k/(q̇_v L²) = 0 at τ = 0");
  const r = d.results.find((x) => x.id === "r-nd-refused-v-T");
  assert.equal(r.status, "unresolved");
  assert.match(r.next, /supply another nonzero scale/);
});

test("failure examples: a failed check blocks the Nondimensionalizer with its next action; a model without equations has nothing to do", () => {
  for (const [ex, code] of [["fail-dimensions", "dimension-mismatch"], ["fail-conditions", "missing-conditions"], ["fail-entry", "undefined-symbol"]]) {
    const d = derived(ex);
    assert.equal(d.nondim.ready, false, ex);
    assert.ok(d.nondim.blockedBy.some((id) => d.interp.issues.find((i) => i.id === id)?.code === code), `${ex}: blocked by ${code}`);
    const r = d.results.find((x) => x.id === "r-calc-nondimensionalize");
    assert.equal(r.status, "unresolved");
    assert.ok(r.next.length > 10, `${ex}: names the next action`);
  }
  const pi = derived("heat-transfer-pi");
  assert.equal(pi.nondim.reason, "no-equations");
  assert.ok(!pi.results.some((x) => x.id.startsWith("r-nd-")), "no result, because the record asks for the Finder only");
});

test("functions of dimensionless arguments: the Arrhenius source keeps E/(RT_w) and the temperature ratio as parameters", () => {
  const nd = derived("fail-unsupported").nondim;
  assert.ok(nd.ready, "the custom PDE is outside stability analysis, not outside nondimensionalization");
  sameForm(nd, "e-heat", "d(theta,tau) = d(theta,X,X) + exp(-E/(R*T_w)*(1 + q_0*L^2/(k*T_w)*theta)^(-1))");
  const groups = nd.parameters.filter((p) => p.role === "parameter").map((p) => S.read(p.plain));
  assert.equal(groups.length, 2, "two groups inside the exponential");
  for (const g of ["E/(R*T_w)", "q_0*L^2/(k*T_w)"]) assert.ok(groups.some((x) => S.equal(x, S.read(g))), g);
  assert.ok(nd.equations.every((e) => e.dimensionless && e.reverseOk));
});

test("no scale hides a parameter: a parameter that cancels from the model is named as unresolved", () => {
  const rec = R.fromExample(ENGINE, "transient-slab");
  const inp = R.inputs(rec);
  inp.variables.push(R.variable({ id: "v-a", symbol: "a", meaning: "A factor on both sides", quantity: "", dimension: "1", kind: "parameter", domain: "positive", pi: false }));
  inp.equations = inp.equations.map((e) => (e.id === "e-heat" ? { ...e, text: "a*rho*c_p*d(T,t) = a*k*d(T,x,x)" } : e));
  const it = C.interpret(inp, ENGINE);
  const nd = N.nondimensionalize(it, { scales: [], finder: null, groups: DATA.groups.groups });
  const a = nd.enters.find((e) => e.name === "a");
  assert.equal(a.hidden, true);
  assert.equal(nd.checks.find((c) => c.id === "x-nd-hidden").passed, false);
  assert.ok(nd.enters.filter((e) => e.name !== "a").every((e) => !e.hidden));
});

test("a chosen scale is a new version: it invalidates the Nondimensionalizer's results, not the Finder's, and runs once confirmed", () => {
  const rec = R.confirm(R.fromExample(ENGINE, "transient-slab"));
  const x = derived("transient-slab", rec).nondim.scales.find((s) => s.name === "x");
  const other = x.candidates.find((c) => !c.chosen && c.valid);
  const next = R.edit(rec, (inp) => { inp.scales.push({ id: "s-v-x", ...other.record }); }, "Chose k/h for x.");
  const d = derived("transient-slab", next);
  const stale = d.results.filter((r) => !r.valid).map((r) => r.id);
  assert.ok(stale.includes("r-nd-scale-v-x") && stale.includes("r-nd-eq-e-heat"), "the dimensionless results read the scale");
  assert.ok(!stale.some((id) => id === "r-rank" || id.startsWith("r-group")), "the Finder does not read scales");
  const again = derived("transient-slab", R.confirm(next));
  const nd = again.nondim;
  assert.equal(nd.scales.find((s) => s.name === "x").status, "confirmed", "a scale in the confirmed record is the researcher's");
  assert.ok(S.equal(S.read(eq(nd, "c-surface").at.plain), S.read("h*L/k")), "the surface now sits at X = Bi");
  sameForm(nd, "c-surface", "-d(theta,X) = theta");
  assert.ok(nd.parameters.some((p) => p.role === "geometry" || p.where.includes("c-surface")), "hL/k moves into the location of the condition");
});

test("SymPy agrees: its independent substitution and chain rule give the same factor and dimensionless form for every equation", () => {
  const refs = DATA.references.nondimensional;
  assert.ok(refs.length >= 5);
  let compared = 0;
  for (const ref of refs) {
    const nd = derived(ref.example).nondim;
    for (const f of ref.forms) {
      const mine = eq(nd, f.id);
      const ctx = { ...HATS };
      assert.ok(S.equal(form(mine.dimensionlessPlain), S.read(f.dimensionless, ctx)), `${ref.example} ${f.id}: ${mine.dimensionlessPlain} against SymPy ${f.dimensionless}`);
      assert.ok(S.equal(S.read(mine.factorPlain), S.read(f.factor)), `${ref.example} ${f.id}: the factor ${mine.factorPlain} against SymPy ${f.factor}`);
      compared++;
    }
  }
  assert.ok(compared >= 17, `${compared} forms compared`);
});
