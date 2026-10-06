// Scientific Modelling, piece 7: convective heat transfer. The exact polynomial kernel, each declared model against
// tools/convective_references.py, the declaration test of each piece 7 model, the empirical layer (named
// correlations refused outside their ranges, cited boundaries with an unresolved transition band), the import of
// numerical results with provenance, the failure examples with their failed check and next action, invalidation,
// and the agreement of the page's data with the Markdown record and the deck.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { assertStandardDeck } from "../../../scripts/kit/checks.mjs";

const require = createRequire(import.meta.url);
const Q = require("../src/rational.js");
const P = require("../src/htpoly.js");
const HN = require("../src/htnum.js");
const CV = require("../src/convective.js");
const EM = require("../src/empirical.js");
const R = require("../src/record.js");
const D = require("../src/declare.js");
const Model = require("../src/model.js");
const Report = require("../src/report.js");
const VisualKit = require("../../../scripts/kit/kit.js");
const Beamdswitch = require("../../../scripts/templates/beamdswitch.js");
const DATA = require("../raw.json");
const ENGINE = Model.engineData(DATA);
const REF = DATA.heatrefs;

const MODELS = { "advection-channel": "advection-channel", "couette-heating": "couette-heating", "thermocapillary-layer": "thermocapillary-flow", "mixed-channel": "mixed-convection",
  "pipe-wall-temperature": "tube-convection", "conjugate-channel": "conjugate-channel", "plate-correlation": "plate-convection", "wall-natural-correlation": "natural-wall" };
const FAMILIES = ["advection-diffusion", "viscous-heat-generation", "thermocapillary-heat-transport", "conjugate-heat-transfer"];
const HEAT_EXAMPLES = ["plate-convection", "tube-convection", "natural-wall", "mixed-convection", "couette-heating", "thermocapillary-flow", "conjugate-channel"];
const state = (example, patch = {}) => VisualKit.normalize(Model.FIELDS, { example, tool: "regime", ...patch }).state;
const confirmed = (example) => R.confirm(R.fromExample(ENGINE, example));
const derive = (example, patch = {}, rec = confirmed(example)) => Model.derive(state(example, patch), DATA, rec);
const result = (d, id) => d.results.find((r) => r.id === id);
const q = (s) => Q.parse(s);

test("exact kernel: rational polynomials, their integrals and the Thomas algorithm in fractions", () => {
  const x = P.X;
  assert.ok(P.eq(P.mul(P.sub(P.ONE, x), P.add(P.ONE, x)), P.poly([1, 0, -1])), "(1 − x)(1 + x) = 1 − x²");
  assert.ok(Q.eq(P.definite(P.poly([0, q("-1/2"), q("3/4")]), 0, 1), Q.ZERO), "∫₀¹ (3x² − 2x)/4 dx = 0");
  const sol = HN.thomasExact([Q.ZERO, Q.ONE], [q("2"), q("2")], [Q.ONE, Q.ZERO], [q("3"), q("3")]);
  assert.deepEqual(sol.map(Q.str), ["1", "1"], "2a + b = 3, a + 2b = 3 gives a = b = 1 exactly");
  const st = HN.meshStudy(1 + 1 / 4, 1 + 1 / 16, 1 + 1 / 64, 2);
  assert.ok(Math.abs(st.p - 2) < 1e-12 && Math.abs(st.extrapolated - 1) < 1e-12, "a second-order sequence gives p = 2 and its limit");
});

test("the declarations of piece 7: four new families and eight models, each with the six parts, its standard example and the seven heat-transfer examples", () => {
  const list = D.declarations(DATA).filter((d) => d.piece === 7);
  assert.deepEqual(list.map((d) => d.id).sort(), Object.keys(MODELS).sort());
  assert.deepEqual([...new Set(list.map((d) => d.family))].filter((f) => FAMILIES.includes(f)).sort(), [...FAMILIES].sort());
  for (const d of list) {
    assert.deepEqual(D.problemsOf(d), [], d.id);
    assert.equal(d.acceptance.example, MODELS[d.id]);
    for (const m of ["dominant-balance", "asymptotic", "stability", "bifurcation"]) assert.ok(d.methods[m].reason.length > 40, `${d.id}: the reason of ${m}`);
  }
  assert.deepEqual(DATA.roadmap.families.filter((f) => f.piece === 7).map((f) => f.id), FAMILIES);
  assert.ok(DATA.roadmap.current >= 7);
  for (const ex of HEAT_EXAMPLES) assert.ok(Model.EXAMPLES.some((e) => e.id === ex), ex);
  // Each convection example declares a governing-equation model or a named correlation, and says which.
  const correlation = list.filter((d) => /correlation/.test(d.title)).map((d) => d.id).sort();
  assert.deepEqual(correlation, ["plate-correlation", "wall-natural-correlation"]);
});

test("each piece 7 record matches its declared dimensionless form exactly and passes every acceptance check", () => {
  const params = {};
  for (const [id, ex] of Object.entries(MODELS)) {
    const rg = derive(ex).regime;
    assert.ok(rg.ready, `${ex}: ${rg.message} ${rg.problems?.join(" ")}`);
    assert.equal(rg.declaration.id, id);
    assert.ok(rg.acceptance.length >= 3 && rg.acceptance.every((a) => a.passed), `${ex}: ${rg.acceptance.filter((a) => !a.passed).map((a) => a.title).join("; ")}`);
    params[ex] = Object.fromEntries(rg.params.map((p) => [p.id, p.exact ?? p.record]));
  }
  assert.equal(params["advection-channel"].Pe, "20", "Pe = UL/α = 20 exactly");
  assert.equal(params["couette-heating"].Br, "4/15", "Br = μU²/(kΔT) exactly");
  assert.equal(params["thermocapillary-flow"].Ms, "-163/9", "the signed Marangoni number keeps the sign of dγ/dT");
  assert.deepEqual(params["conjugate-channel"], { K: "80/3", Yo: "3/2", PeH: "5" });
});

test("viscous heat generation: the Couette profile, the energy balance and the zero-dissipation limit equal SymPy's, exactly", () => {
  const out = CV.couette({ mu: q("0.1"), U: q("2"), H: q("0.001"), k: q("0.15"), T0: Q.ZERO, T1: q("10"), cp: q("2000") }, "isothermal");
  for (const c of out.checks) assert.ok(c.passed && c.status === "exact", c.title);
  assert.equal(out.values.theta, "-2/15 η^2 + 17/15 η");
  assert.equal(REF.couette.balance, "Br");
  assert.equal(REF.couette.flux1, "1 - Br/2");
  const hot = CV.couette({ mu: q("0.1"), U: q("2"), H: q("0.001"), k: q("0.15"), T0: Q.ZERO, T1: q("1"), cp: q("2000") }, "isothermal");
  assert.match(hot.checks.find((c) => c.id === "cou-maximum").title, /\|Br\| > 2.*interior extreme at η\* = 1\/2 \+ 1\/Br = 7\/8/s, "Br = 8/3: the maximum is inside at 1/2 + 3/8");
});

test("thermocapillary transport: the stress condition, the sign, the return flow and the transport factor 1 + Ma²/1680 equal SymPy's", () => {
  const p = { gammaT: q("-6.5e-5"), b: q("100"), d: q("0.001"), L: q("0.02"), mu: q("0.0046"), k: q("0.117"), rho: q("920"), cp: q("1630") };
  const out = CV.thermocapillary(p);
  for (const c of out.checks) assert.ok(c.passed && c.status === "exact", c.title);
  assert.equal(REF.capillary.transport, "-1/1680");
  assert.deepEqual(REF.capillary.F, ["0", "-1/2", "3/4"]);
  assert.equal(out.values.s, -1, "dγ/dT < 0 and b > 0: the surface moves toward the colder side");
  assert.ok(out.values.us < 0);
  const flipped = CV.thermocapillary({ ...p, gammaT: q("6.5e-5") });
  assert.equal(flipped.values.s, 1, "the sign of dγ/dT reverses the flow");
  assert.equal(flipped.values.enhancement, out.values.enhancement, "but not the transport factor, which is even in the sign");
  assert.equal(flipped.values.Mad, out.values.Mad, "Ma_d is a positive magnitude");
});

test("mixed convection: forced and buoyancy limits and the exact reversal boundary Gr/Re = 72; the boundary is not a constant Ri", () => {
  assert.equal(REF.mixed.P, "-12");
  assert.deepEqual(REF.mixed.reversal_B.sort(), ["-72", "72"]);
  const base = { D: q("0.02"), U: q("0.01"), g: q("-9.81"), beta: q("2.1e-4"), Th: q("10"), Tc: Q.ZERO, rho: q("997"), mu: q("8.9e-4") };
  const out = CV.mixedChannel(base);
  for (const c of out.checks) assert.ok(c.passed && c.status === "exact", c.title);
  assert.ok(out.values.reversed && out.values.GrRe > 72);
  const opposing = CV.mixedChannel({ ...base, g: q("9.81") });
  assert.equal(opposing.values.s, -out.values.s, "gravity along the flow reverses the sign");
  const rg = derive("mixed-convection").regime;
  const rev = rg.layers.find((l) => l.id === "reversal");
  const pts = rev.curves.flatMap((c) => c.points);
  for (const [re, gr] of pts) assert.ok(Math.abs(gr / re - 72) / 72 < 0.05, "the drawn boundary lies on Gr = 72 Re");
  const ri = pts.map(([re, gr]) => gr / re ** 2);
  assert.ok(Math.max(...ri) / Math.min(...ri) > 10, "along it the bulk Richardson number changes by more than a factor of 10");
});

test("internal flow: Nu = 48/11 exact for a uniform flux, the Graetz eigenvalue for a uniform wall temperature against mpmath, kept apart", () => {
  const out = CV.tube({ D: q("0.01"), U: q("0.05"), k: q("0.613"), rho: q("997"), mu: q("8.55e-4"), cp: q("4179"), x: q("2") }, "temperature", { references: REF, literature: DATA.convective.literature });
  assert.equal(out.values.NuQExact, REF.tube.NuQ);
  assert.ok(Math.abs(out.values.lambda0 - REF.graetz.lambda0) < 1e-7, `${out.values.lambda0} against ${REF.graetz.lambda0}`);
  assert.ok(Math.abs(out.values.study.p - 4) < 0.3, "RK4 converges at fourth order");
  assert.ok(Math.abs(out.values.NuT - 3.657) <= 0.001, "Lienhard eqn. (7.23)");
  for (const c of out.checks) assert.ok(c.passed, c.title);
  const d = derive("tube-convection");
  assert.equal(result(d, "r-cv-tube-entry").status, "evidence", "the station is past the entry length 0.034 Re Pr D");
  assert.match(result(d, "r-cv-tube-gnielinski").title, /refused here: Re = 583 is outside 2300 ≤ Re ≤ 5×10\^6/);
});

test("conjugate heat transfer: the exact fully developed solution, second-order mesh convergence, interface continuity and balances", () => {
  assert.equal(REF.conjugate.wall_minus_mean, "17/35");
  assert.equal(REF.conjugate.Nu_f, "140/17");
  const ex = CV.conjugateExact(q("1/2"), q("80/3"));
  assert.equal(Q.str(ex.wm), "17/35");
  assert.equal(Q.str(ex.ow), "3/160");
  const st = derive("conjugate-channel").stability;
  const ids = st.analysis.results.map((r) => [r.id, r.status]);
  for (const id of ["r-cv-cj-convergence", "r-cv-cj-developed", "r-cv-cj-interface", "r-cv-cj-energy"]) assert.deepEqual(ids.find(([i]) => i === id), [id, "numerical"], id);
  const out = CV.conjugate({ U: q("7.5e-4"), H: q("0.001"), t: q("0.0005"), Lh: q("0.08"), kf: q("0.6"), ks: q("16"), rho: q("1000"), cp: q("4000") });
  assert.ok(out.values.study.p > 1.6 && out.values.study.p < 2.4, `observed order ${out.values.study.p}`);
  assert.ok(out.values.mismatch[2] < out.values.mismatch[1] && out.values.mismatch[1] < out.values.mismatch[0], "the interface flux mismatch decreases");
});

test("advection–diffusion: exact discrete conservation, cell-Péclet oscillation, mesh orders and the exact flux against mpmath", () => {
  const out = CV.advChannel({ U: q("0.00028"), L: q("0.01"), alpha: q("1.4e-7") });
  for (const c of out.checks) assert.ok(c.passed, c.title);
  assert.ok(Math.abs(out.values.J - REF.advection.J) < 1e-12 * REF.advection.J);
  const ex = CV.adExact(20);
  for (const [x, v] of Object.entries(REF.advection.theta)) assert.ok(Math.abs(ex.theta(Number(x)) - v) < 1e-12, `θ(${x})`);
  const d4 = CV.adDiscrete(q("20"), 5, "central");
  assert.ok(d4.t.some((v, i) => i > 0 && Q.cmp(v, d4.t[i - 1]) > 0), "P = 4 > 2: the central solution rises somewhere, so it oscillates");
});

test("the empirical layer: each correlation is refused outside its range, the transition range is unresolved, and the constants reproduce the book", () => {
  const lam = EM.find(DATA, "plate-laminar-local");
  assert.ok(EM.evaluate(lam, { Re: 1e5, Pr: 0.7 }).ok);
  assert.deepEqual(EM.evaluate(lam, { Re: 1e5, Pr: 0.5 }).refused, ["Pr = 0.5 is outside 0.6 ≤ Pr"]);
  assert.equal(EM.evaluate(lam, { Re: 6e5, Pr: 0.7 }).value, null, "no extrapolation into the transition range");
  assert.equal(EM.regionOf(DATA.convective.boundaries.plate, 1e6).status, "unresolved");
  const cc = EM.find(DATA, "wall-cc-laminar"), ex = DATA.convective.literature.example81;
  const ra = (ex.g * ex.beta * ex.dT * ex.L ** 3) / (ex.nu * ex.alpha);
  assert.ok(Math.abs(EM.formValue(cc, { Ra: ra, Pr: ex.Pr }) - 47.33) < 0.05, "Lienhard's Example 8.1: Nu_L = 47.33");
  assert.ok(!EM.evaluate(cc, { Ra: 2e9, Pr: 0.7 }).ok && EM.evaluate(EM.find(DATA, "wall-cc-all"), { Ra: 2e9, Pr: 0.7 }).ok, "above 10⁹ only eqn. (8.13b)");
  const d = derive("plate-convection");
  const layers = d.regime.layers.filter((l) => l.kind === "empirical");
  assert.ok(layers.length === 2 && layers.every((l) => l.boundary === "empirical" && l.evidence.length && /measured|data|holds/.test(l.criterion)));
  assert.equal(d.regime.layerKinds.find((k) => k.id === "empirical").piece, 7);
  assert.ok(Math.abs(CV.blasius().s - REF.blasius.fpp0) < 1e-9, "f''(0) against SciPy");
});

test("imported numerical results: provenance and definitions are required, and points outside the range are kept but not compared", () => {
  const spec = DATA.convective.imports["plate-convection"];
  assert.ok(EM.validateImport(REF.sample, spec).ok);
  const bare = { ...REF.sample, provenance: { source: "x" } };
  assert.match(EM.validateImport(bare, spec).errors.join(" "), /provenance has no method/);
  const wrong = { ...REF.sample, definitions: { ...REF.sample.definitions, NuRe: "Nu_L/Re_L^(1/2), mean" } };
  assert.match(EM.validateImport(wrong, spec).errors.join(" "), /must define NuRe/);
  const rec = R.edit(R.fromExample(ENGINE, "plate-convection"), (inp) => { inp.evidence.push({ id: "ev-import-1", kind: "numerical-results", source: "import", claim: "Imported.", results: REF.sample }); }, "Imported.");
  const d = derive("plate-convection", {}, R.confirm(rec));
  const r = result(d, "r-cv-import-ev-import-1");
  assert.equal(r.status, "numerical");
  assert.match(r.title, /7 of 8 points are inside the range.*does not compare 1 point outside/s);
  // The record holds the import as evidence: a JSON round trip keeps it.
  const back = R.validate(JSON.parse(JSON.stringify(rec)));
  assert.equal(back.record.evidence.find((e) => e.id === "ev-import-1").results.points.length, 8);
});

test("failure examples: the plate in its transition range and a heat loss at the free surface show the failed check and the next action", () => {
  const plate = derive("fail-plate-transition");
  for (const id of ["r-cv-pl-region", "r-cv-pl-local"]) {
    const r = result(plate, id);
    assert.equal(r.status, "unresolved", id);
    assert.ok(r.next.length > 10, `${id}: next action`);
  }
  const loss = derive("fail-surface-loss");
  assert.equal(loss.regime.reason, "separate-declaration");
  assert.match(loss.regime.next, /adiabatic free surface/);
});

test("an edit invalidates exactly the piece 7 results that read the changed input", () => {
  const rec = confirmed("couette-heating");
  const edited = R.edit(rec, (inp) => { inp.variables.find((v) => v.id === "v-U").value = "3"; }, "Changed U.");
  const d = derive("couette-heating", {}, edited);
  const mine = d.results.filter((r) => r.id.startsWith("r-cv-"));
  assert.ok(mine.length >= 4 && mine.every((r) => !r.valid && r.invalidatedBy.includes("v-U")));
});

test("agreement: for each piece 7 example the page's results, the Markdown record and the deck show the same statuses and the derivation", () => {
  for (const ex of [...Object.values(MODELS), "fail-plate-transition"]) {
    const s = state(ex);
    const d = Model.derive(s, DATA, confirmed(ex));
    const report = Report.report(s, d, DATA);
    const md = VisualKit.markdown(report);
    const deck = Beamdswitch.deck(report);
    assertStandardDeck(deck, ex);
    const mine = d.results.filter((x) => x.id.startsWith("r-cv-"));
    assert.ok(mine.length >= 3, ex);
    for (const r of mine) {
      const line = Report.resultLine(r);
      assert.ok(md.includes(line) && deck.includes(line), `${ex}: ${r.id}`);
    }
    for (const disp of d.stability.analysis.displays) for (const t of disp.tex) assert.ok(md.includes(`$$${t}$$`), `${ex}: ${disp.title}`);
  }
});
