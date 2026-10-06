// Scientific Modelling, piece 8: heat exchangers, phase change, condensation, boiling correlations and radiation in a
// medium. The declarations and their records, each solver against tools/transfer_references.py and the cited
// references, the strict domain of the boiling correlation with its failure example, the optical-thickness limits,
// invalidation, and the agreement of the page's data with the Markdown record and the deck.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { assertStandardDeck } from "../../../scripts/kit/checks.mjs";

const require = createRequire(import.meta.url);
const Q = require("../src/rational.js");
const TR = require("../src/transfer.js");
const R = require("../src/record.js");
const D = require("../src/declare.js");
const Model = require("../src/model.js");
const Report = require("../src/report.js");
const VisualKit = require("../../../scripts/kit/kit.js");
const Beamdswitch = require("../../../scripts/templates/beamdswitch.js");
const DATA = require("../raw.json");
const ENGINE = Model.engineData(DATA);
const REF = DATA.transferrefs;

const MODELS = { "hx-parallel": "hx-parallel", "hx-counterflow": "hx-counterflow", "stefan-melting": "melting-front", "nusselt-film": "film-condensation", "rohsenow-water": "pool-boiling", "absorbing-slab": "absorbing-slab" };
const FAMILIES = ["heat-exchangers", "phase-change", "condensation", "boiling-correlations", "radiation-in-a-medium"];
const state = (example, patch = {}) => VisualKit.normalize(Model.FIELDS, { example, tool: "regime", ...patch }).state;
const confirmed = (example) => R.confirm(R.fromExample(ENGINE, example));
const derive = (example, patch = {}, rec = confirmed(example)) => Model.derive(state(example, patch), DATA, rec);
const mine = (d) => d.results.filter((r) => r.id.startsWith("r-tr-"));
const result = (d, id) => d.results.find((r) => r.id === `r-tr-${id}`);
const q = (s) => Q.parse(s);
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);

test("the declarations of piece 8: five families and six models, each with the six parts and its standard example, and the six heat-transfer examples", () => {
  const list = D.declarations(DATA).filter((d) => d.piece === 8);
  assert.deepEqual(list.map((d) => d.id).sort(), Object.keys(MODELS).sort());
  assert.deepEqual([...new Set(list.map((d) => d.family))].sort(), [...FAMILIES].sort());
  for (const d of list) {
    assert.deepEqual(D.problemsOf(d), [], d.id);
    assert.equal(d.acceptance.example, MODELS[d.id]);
    for (const m of ["dominant-balance", "asymptotic", "stability", "bifurcation"]) assert.ok(d.methods[m].reason.length > 40, `${d.id}: the reason of ${m}`);
  }
  assert.deepEqual(DATA.roadmap.families.filter((f) => f.piece === 8).map((f) => f.id), FAMILIES);
  assert.ok(DATA.roadmap.current >= 8);
  for (const ex of Object.values(MODELS)) assert.ok(Model.EXAMPLES.some((e) => e.id === ex), ex);
  // The boiling example declares a named correlation; the others declare governing-equation models.
  assert.deepEqual(list.filter((d) => /correlation/.test(d.title)).map((d) => d.id), ["rohsenow-water"]);
});

test("each piece 8 record matches its declared dimensionless form exactly and passes every acceptance check", () => {
  const params = {};
  for (const [id, ex] of Object.entries(MODELS)) {
    const rg = derive(ex).regime;
    assert.ok(rg.ready, `${ex}: ${rg.message} ${rg.problems?.join(" ")}`);
    assert.equal(rg.declaration.id, id);
    assert.ok(rg.acceptance.length >= 3 && rg.acceptance.every((a) => a.passed), `${ex}: ${rg.acceptance.filter((a) => !a.passed).map((a) => a.title).join("; ")}`);
    params[ex] = Object.fromEntries(rg.params.map((p) => [p.id, p.exact ?? p.record]));
  }
  assert.deepEqual(params["hx-parallel"], { NTU: "3/2", Cr: "1/2" }, "Example 3.5: NTU = 1.5 and C_r = 0.5 exactly");
  assert.deepEqual(params["hx-counterflow"], { NTU: "3/2", Cr: "1" });
  assert.equal(params["melting-front"].Ste_l, "422/3333");
  assert.equal(params["melting-front"].kappa, "93473/11781", "κ = α_s/α_l = k_sc_l/(k_lc_s)");
  assert.equal(params["film-condensation"].Ja, "421/22570");
  assert.equal(params["pool-boiling"].Xb, "6791/424316");
  assert.ok(Math.abs(params["pool-boiling"].Mb - 33.2829) < 1e-3, "the vapour density, not the liquid density, enters M_b");
  assert.deepEqual(params["absorbing-slab"], { tau_L: "1", r_1: "1/2", r_2: "3/10" });
});

test("heat exchangers: Example 3.5, equal heat loss and gain, the balanced limit and its exact series equal SymPy's", () => {
  const p = { U: q("500"), A: q("30"), Ch: q("10000"), Cc: q("20000"), Thin: q("423.15"), Tcin: q("313.15") };
  const par = TR.exchanger(p, "parallel", DATA.transfer.literature.ex35);
  for (const c of par.checks) assert.ok(c.passed, c.title);
  assert.ok(rel(par.values.eps, Number(REF.exchanger.parallel_eps)) < 1e-15, "ε against mpmath");
  assert.ok(Math.abs(par.values.Thout - 273.15 - 84.44) < 0.05 && Math.abs(par.values.Tcout - 273.15 - 72.78) < 0.05, "the outlet temperatures of Example 3.5");
  const bal = TR.exchanger({ ...p, Cc: q("10000") }, "counterflow");
  for (const c of bal.checks) assert.ok(c.passed, c.title);
  assert.equal(bal.groups.find((g) => g.id === "eps").exact, "3/5");
  assert.match(bal.checks.find((c) => c.id === "hx-balanced").title, /T_h,out = 84 °C and T_c,out = 106 °C, exactly. The temperature difference is 44 K at both ends/);
  assert.deepEqual(TR.counterflowSeries(q("3/2"), 4).map(Q.str), REF.exchanger.series, "the series coefficients equal SymPy's");
  // Parallel flow can never exceed 1/(1 + C_r); the counterflow form has no cancellation near C_r = 1.
  assert.ok(TR.effectiveness("parallel", 50, 0.5) <= 2 / 3);
  assert.ok(Math.abs(TR.effectiveness("counterflow", 1.5, 1 - 1e-12) - 0.6) < 1e-11 && Math.abs(TR.effectivenessNaive(1.5, 1 - 1e-12) - 0.6) > 1e-7);
});

test("phase change: λ equals mpmath's, the one-phase case is Font's equation, the energy balance closes and the transient front converges", () => {
  const p = { rho: q("917"), cl: q("4220"), cs: q("2100"), kl: q("0.5610"), ks: q("2.215"), ell: q("333300"), DTl: q("10"), DTs: q("10"), tr: q("3600") };
  const out = TR.stefan(p, REF);
  for (const c of out.checks) assert.ok(c.passed, c.title);
  assert.ok(rel(out.values.lambda, Number(REF.stefan.lambda)) < 1e-12);
  assert.ok(rel(out.values.lambda1, Number(REF.stefan.lambda1)) < 1e-12);
  assert.ok(out.values.balance.residual < 1e-9);
  assert.ok(Math.abs(out.values.frontMm - 9.136) < 0.01, "the front moves about 9.1 mm in one hour");
  // With T_i = T_m the two-phase equation is the one-phase equation.
  assert.equal(TR.lambda(0.2, 0, 3), TR.lambda(0.2, 0, 1));
  const st = out.checks.find((c) => c.id === "st-transient");
  assert.match(st.title, /observed order 2\.\d/);
});

test("condensation: the exact latent-energy balance, Example 8.6 and the refusal of a turbulent film", () => {
  const p = { g: q("9.806"), rhoF: q("961.9"), Drho: q("961.3"), nu: q("3.091e-7"), k: q("0.6773"), cp: q("4210"), hfg: q("2257e3"), hfgc: q("2281e3"), DT: q("10"), L: q("0.3") };
  const out = TR.film(p, DATA.transfer);
  for (const c of out.checks.filter((x) => x.status !== "evidence")) assert.ok(c.passed, c.title);
  assert.equal(out.checks.find((c) => c.id === "fc-balance").status, "exact");
  assert.ok(rel(out.values.deltaL, Number(REF.film.delta)) < 1e-12);
  assert.equal(out.values.region, "rippled", "Re_c ≈ 38: ripples, Nusselt's theory is low by up to about 20 %");
  const tall = TR.film({ ...p, L: q("30") }, DATA.transfer);
  const st = tall.checks.find((c) => c.id === "fc-state");
  assert.equal(st.status, "unresolved");
  assert.match(st.title, /turbulent film.*refuses the laminar result/i);
});

test("boiling correlations: Examples 9.2 and 9.5, and the strict refusal of the fluid, surface, pressure and regime outside the domain", () => {
  const d = derive("pool-boiling");
  const ok = mine(d);
  assert.ok(ok.every((r) => r.status !== "unresolved"), ok.filter((r) => r.status === "unresolved").map((r) => r.title).join("; "));
  assert.match(result(d, "bo-q").title, /474\.06 kW\/m²/);
  assert.ok(rel(474058.258, Number(REF.boiling.q)) < 1e-8 && rel(1259901.84, Number(REF.boiling.qmax)) < 1e-8);
  const f = derive("fail-boiling-domain");
  for (const id of ["bo-surface", "bo-pressure", "bo-regime", "bo-q"]) assert.equal(result(f, id).status, "unresolved", id);
  assert.match(result(f, "bo-q").title, /refuses Rohsenow's correlation here: the surface, the pressure, the regime/);
  assert.ok(result(f, "bo-q").next.length > 10, "a refusal names the next action");
  // Another fluid is refused, never extrapolated.
  const v = { mu: q("0.000282"), hfg: q("2257e3"), g: q("9.8"), Drho: q("957.603"), rhoG: q("0.597"), sigma: q("0.0589"), k: q("0.6791"), Csf: q("0.013"), DTe: q("15"), pressure: q("101325"), W: q("0.3") };
  const ben = TR.boiling(v, { fluid: "benzene", surface: "chromium", orientation: "horizontal, facing up", heater: "flat plate with side walls", pool: "saturated" }, DATA.transfer);
  assert.equal(ben.values.q, null);
  assert.equal(ben.checks.find((c) => c.id === "bo-fluid").status, "unresolved");
});

test("radiation in a medium: E_3 and the reference table, the quadrature and energy checks, and the optical-thickness boundaries", () => {
  for (const r of REF.slab.E3) assert.ok(rel(TR.En(3, r.x), Number(r.E3)) < 1e-13, `E3(${r.x})`);
  for (const row of DATA.transfer.literature.beach.rows) {
    assert.ok(Math.abs(TR.slabEm(row.tau) - row.emission) <= 5e-5, `emissivity at ${row.tau}`);
    assert.ok(Math.abs(2 * TR.En(3, row.tau) - row.transmission) <= 5e-5, `transmissivity at ${row.tau}`);
  }
  for (const [tol, b] of Object.entries(REF.slab.boundaries)) {
    const e = Number(tol);
    assert.ok(Math.abs(TR.slabErrors(b.thin).thin - e) < 1e-9 * Math.max(1, 1 / e) && Math.abs(TR.slabErrors(b.thick).thick - e) < 1e-12 && Math.abs(TR.slabErrors(b.rosseland).rosseland - e) < 1e-12, tol);
  }
  const d = derive("absorbing-slab");
  for (const id of ["sl-reference", "sl-quadrature", "sl-energy", "sl-en"]) assert.equal(result(d, id).status, "numerical", id);
  assert.match(result(d, "sl-rosseland").title, /outside the assumption τ ≫ 1/);
  // The map: the Rosseland layer meets 0.01 only above τ_L ≈ 6.98.
  const ros = d.regime.layers.find((l) => l.id === "rosseland");
  const edge = ros.curves[0].points[0][0];
  assert.ok(Math.abs(edge - REF.slab.boundaries["1e-2"].rosseland) / REF.slab.boundaries["1e-2"].rosseland < 1e-6, `the drawn Rosseland boundary ${edge}`);
});

test("an edit invalidates exactly the piece 8 results that read the changed input", () => {
  const rec = confirmed("hx-parallel");
  const edited = R.edit(rec, (inp) => { inp.variables.find((v) => v.id === "v-A").value = "40"; }, "Changed A.");
  const d = derive("hx-parallel", {}, edited);
  assert.ok(mine(d).length >= 6 && mine(d).every((r) => !r.valid && r.invalidatedBy.includes("v-A")));
  const again = derive("hx-parallel", {}, R.confirm(edited));
  assert.equal(again.regime.params.find((p) => p.id === "NTU").exact, "2");
});

test("agreement: for each piece 8 example the page's results, the Markdown record and the deck show the same statuses and the derivation", () => {
  for (const ex of [...Object.values(MODELS), "fail-boiling-domain"]) {
    const s = state(ex);
    const d = Model.derive(s, DATA, confirmed(ex));
    const report = Report.report(s, d, DATA);
    const md = VisualKit.markdown(report);
    const deck = Beamdswitch.deck(report);
    assertStandardDeck(deck, ex);
    assert.ok(mine(d).length >= 5, ex);
    for (const r of mine(d)) {
      const line = Report.resultLine(r);
      assert.ok(md.includes(line) && deck.includes(line), `${ex}: ${r.id}`);
    }
    for (const disp of d.stability.analysis.displays) for (const t of disp.tex) assert.ok(md.includes(`$$${t}$$`), `${ex}: ${disp.title}`);
  }
});
