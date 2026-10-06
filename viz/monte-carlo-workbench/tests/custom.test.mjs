// The custom law inputs of group 4: the law line of the model text, the safe compilation of its expressions
// (including the complex arithmetic of a CF), the checks of each of the 9 input kinds with the statuses checked,
// failed and unverified, the sampling labels exact, approximate and unavailable, and the samplers against the exact
// law that each input describes. A sampler runs 3 fixed seeds of 20,000 draws; it passes when √n·D < 2.6 for a
// continuous law (a false failure below 3e-6 for each assertion) or the chi-square p-value is above 1e-6 for a
// discrete law. The stated tolerance also admits the approximation error of each tabulated law, which is far
// below the statistical error here. The about 60 assertions together fail with a probability below 1e-4.
import assert from "node:assert/strict";
import test from "node:test";
import { Co, Cu, D, En, M, Rng, S, X, data, recordOf } from "./helpers.mjs";

const SEEDS = [11, 2026, 4294967295], N = 20000, KS = 2.6;

/** Compile one law line of model text and bind it to its parameters. @param {string} line */
function lawOf(line) {
  const { record, errors } = D.parse(`title: t\n${line}\n`);
  assert.deepEqual(errors, [], line);
  const r = Cu.compile(record.laws[0], Co.taken);
  assert.ok(r.law, `${line}: ${r.errors?.join(" ")}`);
  return r.law;
}
/** The status of each check by id. @param {any} law @param {any} p */
const statuses = (law, p) => Object.fromEntries(law.report(p).checks.map((/** @type {any} */ c) => [c.id, c.status]));
/** √n·D of N draws of a sampler with one seed. @param {any} s @param {number} seed @param {(x: number) => number} cdf */
function ksOf(s, seed, cdf) {
  const r = Rng.stream(seed, "test", 0, 0), xs = new Float64Array(N);
  for (let i = 0; i < N; i++) { r.reset(i, 0); xs[i] = s.draw(r); }
  xs.sort();
  let d = 0;
  for (let i = 0; i < N; i++) { const F = cdf(xs[i]); d = Math.max(d, Math.abs(F - i / N), Math.abs(F - (i + 1) / N)); }
  return d * Math.sqrt(N);
}

test("the law line: every clause, the round trip through the record, and the errors of a malformed line", () => {
  const text = `title: T
param a0 = 2.5
law Sev(a) pdf(x) = a*x^(-a - 1) on [1, inf] where a > 1 obs [1.3, 2.2, 5.1] grid 2048 {MW} "severity"
law Die table(k) = [1, 2, 3] probs [0.2, 0.3, 0.5]
X ~ Sev(a = a0)
Y ~ truncated_Sev(a = a0, lower = 2, upper = 10)
prob big = X > 3
`;
  const { record, errors } = D.parse(text);
  assert.deepEqual(errors, []);
  assert.deepEqual(record.laws[0], { name: "Sev", params: ["a"], kind: "pdf", arg: "x", expr: "a*x^(-a - 1)", on: ["1", "inf"], where: "a > 1", obs: "[1.3, 2.2, 5.1]", grid: 2048, unit: "MW", note: "severity" });
  assert.deepEqual(D.parse(D.print(record)).record, record, "parse(print(r)) = r");
  // The record keeps its laws through En.complete, so a saved model record holds them.
  assert.deepEqual(En.complete(JSON.parse(JSON.stringify(record))).laws, record.laws);
  for (const [line, re] of [["law S pdf(x) = x on [0]", /on \[lo, hi\]/], ["law S pdf(x) = x on [0, 1] grid many", /whole number/], ["law S spline(x) = x", /not an input kind/],
    ["law S pdf(x) = x on [0, 1] on [0, 2]", /comes twice/]]) {
    assert.match(D.parse(`title: t\n${/** @type {string} */ (line)}\n`).errors.join(" "), /** @type {RegExp} */ (re), /** @type {string} */ (line));
  }
});

test("compilation is safe: unknown names, JavaScript and catalogue names are refused, and i is the imaginary unit only in a CF", () => {
  /** @param {any} def */
  const errs = (def) => Cu.compile({ params: [], arg: "x", ...def }, Co.taken).errors?.join(" ") ?? "";
  assert.match(errs({ name: "A", kind: "pdf", expr: "constructor(x)", on: ["0", "1"] }), /not a function/);
  assert.match(errs({ name: "A", kind: "pdf", expr: "x.constructor", on: ["0", "1"] }), /not part of the expression language/);
  assert.match(errs({ name: "A", kind: "pdf", expr: "y*x", on: ["0", "1"] }), /not a parameter/);
  assert.match(errs({ name: "poisson", kind: "pdf", expr: "x", on: ["0", "1"] }), /catalogue/);
  assert.match(errs({ name: "mixture_A", kind: "pdf", expr: "x", on: ["0", "1"] }), /catalogue/);
  assert.match(errs({ name: "A", params: ["i"], kind: "cf", expr: "exp(i*t)", arg: "t" }), /imaginary unit/);
  assert.match(errs({ name: "A", kind: "pmf", expr: "0.5" }), /states its support/);
  assert.match(errs({ name: "A", kind: "cf", arg: "t", expr: "t > 0" }), /no comparison/);
  // The complex evaluator: the normal CF e^(iμt − σ²t²/2) and the gamma MGF at an imaginary argument.
  const cf = Cu.ccompile(X.parse("exp(i*m*t - s^2*t^2/2)"), new Map([["m", 0], ["s", 1], ["t", 2]]), true);
  const v = cf([1.5, 2, 0.7]), want = [Math.exp(-2 * 0.49) * Math.cos(1.05), Math.exp(-2 * 0.49) * Math.sin(1.05)];
  assert.ok(Math.abs(v[0] - want[0]) < 1e-15 && Math.abs(v[1] - want[1]) < 1e-15);
  const g = Cu.ccompile(X.parse("(1 - t*th)^(-k)"), new Map([["k", 0], ["th", 1], ["t", 2]]), false)([2, 1, [0, 0.5]]);
  const z = /** @type {[number, number]} */ ([1, -0.5]), d = (z[0] ** 2 + z[1] ** 2) ** 2;
  // (1 − 0.5i)^(−2) = conj((1 − 0.5i)²)/|1 − 0.5i|⁴ = (0.75 + i)/1.5625.
  assert.ok(Math.abs(g[0] - 0.75 / d) < 1e-15 && Math.abs(g[1] - 1 / d) < 1e-15);
});

test("each of the 9 input kinds: its checks, its sampling labels, and its law against the exact law it describes", () => {
  const cases = [
    { line: "law B pdf(x) = 6*x*(1 - x) on [0, 1]", p: {}, cdf: (/** @type {number} */ x) => 3 * x * x - 2 * x ** 3, checked: ["nonnegative", "normalisation", "boundaries", "consistency"], unverified: ["constraints"], sampling: ["approximate", "approximate", "approximate"] },
    { line: "law Lg(s) logpdf(x) = -x/s - 2*log(1 + exp(-x/s)) - log(s) where s > 0", p: { s: 1.5 }, cdf: (/** @type {number} */ x) => 1 / (1 + Math.exp(-x / 1.5)), checked: ["constraints", "nonnegative", "normalisation", "boundaries", "consistency"], sampling: ["approximate", "approximate", "unavailable"] },
    { line: "law Q4 density(x) = exp(-x^4)", p: {}, cdf: null, checked: ["normalisation"], sampling: ["approximate", "approximate", "unavailable"] },
    { line: "law G(p) pmf(k) = (1 - p)^k*p on [0, inf] where p > 0 and p < 1", p: { p: 0.3 }, pmf: (/** @type {number} */ k) => 0.3 * 0.7 ** k, checked: ["constraints", "boundaries", "nonnegative", "normalisation"], sampling: ["approximate", "approximate", "unavailable"] },
    { line: "law Bn pmf(k) = exp(lgamma(11) - lgamma(k + 1) - lgamma(11 - k))*0.3^k*0.7^(10 - k) on [0, 10]", p: {}, pmf: (/** @type {number} */ k) => Math.exp(S.lchoose(10, k)) * 0.3 ** k * 0.7 ** (10 - k), checked: ["boundaries", "nonnegative", "normalisation"], sampling: ["exact", "exact", "exact"] },
    { line: "law Die table(k) = [1, 2, 3, 4, 5, 6] probs [0.15, 0.15, 0.15, 0.15, 0.15, 0.25]", p: {}, pmf: (/** @type {number} */ k) => (k === 6 ? 0.25 : k >= 1 && k <= 5 ? 0.15 : 0), checked: ["boundaries", "nonnegative", "normalisation"], sampling: ["exact", "exact", "exact"] },
    { line: "law Max3 cdf(x) = x^3 on [0, 1]", p: {}, cdf: (/** @type {number} */ x) => x ** 3, checked: ["nonnegative", "monotonicity", "boundaries", "normalisation", "consistency"], sampling: ["approximate", "approximate", "unavailable"] },
    { line: "law Wq(k, lam) quantile(u) = lam*(-log(1 - u))^(1/k) where k > 0 and lam > 0", p: { k: 1.5, lam: 2 }, cdf: (/** @type {number} */ x) => (x <= 0 ? 0 : 1 - Math.exp(-((x / 2) ** 1.5))), checked: ["constraints", "boundaries", "monotonicity"], unverified: ["consistency"], sampling: ["exact", "exact", "unavailable"] },
    { line: "law Gm(k, th) mgf(t) = (1 - t*th)^(-k) on [0, inf] where k > 0 and th > 0", p: { k: 2, th: 1 }, cdf: (/** @type {number} */ x) => (x <= 0 ? 0 : 1 - Math.exp(-x) * (1 + x)), checked: ["constraints", "normalisation", "existence", "nonnegative", "monotonicity", "inversion", "boundaries", "consistency"], unverified: ["definite"], sampling: ["approximate", "approximate", "unavailable"] },
    { line: "law Lp cf(t) = 1/(1 + t^2)", p: {}, cdf: (/** @type {number} */ x) => (x < 0 ? Math.exp(x) / 2 : 1 - Math.exp(-x) / 2), checked: ["normalisation", "consistency", "inversion", "boundaries"], unverified: ["definite"], sampling: ["approximate", "approximate", "unavailable"] },
  ];
  for (const c of cases) {
    const law = lawOf(c.line), st = statuses(law, c.p), rep = law.report(c.p);
    for (const id of c.checked) assert.equal(st[id], "checked", `${c.line}: ${id} is checked (${JSON.stringify(st)})`);
    for (const id of c.unverified ?? []) assert.equal(st[id], "unverified", `${c.line}: ${id} is unverified`);
    assert.deepEqual([rep.sampling.independent, rep.sampling.inverse, rep.sampling.rejection], c.sampling, `${c.line}: sampling labels`);
    assert.deepEqual(law.check(c.p), [], `${c.line}: no failed check`);
    assert.ok(rep.controls.length >= 1 && rep.sources.length >= 1, `${c.line}: approximation controls and error sources`);
    // The tabulated law against the exact one, at its quartiles: within the approximation error.
    if (c.cdf) for (const u of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      const x = law.quantile(u, c.p);
      assert.ok(Math.abs(c.cdf(x) - u) < 2e-4, `${c.line}: exact F(Q(${u})) = ${c.cdf(x)}`);
    }
    if (c.pmf) for (let k = 0; k <= 8; k++) assert.ok(Math.abs(law.pmf(k, c.p) - c.pmf(k)) < 1e-12, `${c.line}: p(${k})`);
    // The samplers: 3 seeds each, against the exact law.
    for (const kind of ["reference", "inverse", "rejection"]) {
      const s = kind === "reference" ? law.reference(c.p) : kind === "inverse" ? law.inverse(c.p, undefined) : law.rejection(c.p, 1);
      if ("unavailable" in s) continue;
      for (const seed of SEEDS) {
        if (c.cdf) assert.ok(ksOf(s, seed, c.cdf) < KS, `${c.line} ${kind} seed ${seed}`);
        else if (c.pmf) {
          const r = Rng.stream(seed, "test", 0, 0), counts = new Map();
          for (let i = 0; i < N; i++) { r.reset(i, 0); const x = s.draw(r); counts.set(x, (counts.get(x) ?? 0) + 1); }
          let chi = 0, df = -1, rest = N, restE = N;
          for (let k = 0; k <= 12; k++) { const e = c.pmf(k) * N; if (e < 5) continue; chi += ((counts.get(k) ?? 0) - e) ** 2 / e; df++; rest -= counts.get(k) ?? 0; restE -= e; }
          if (restE > 5) { chi += (rest - restE) ** 2 / restE; df++; }
          assert.ok(S.chiSquareSf(chi, df) > 1e-6, `${c.line} ${kind} seed ${seed}: chi-square ${chi} on ${df}`);
        }
      }
    }
  }
});

test("failed and unverified checks: each says why, a failed check stops sampling, and an unverified tail is stated", () => {
  /** @param {string} line @param {any} p */
  const fails = (line, p) => { const law = lawOf(line); return { st: statuses(law, p), errs: law.check(p), rep: law.report(p) }; };
  let r = fails("law H pdf(x) = x on [0, 1]", {});
  assert.equal(r.st.normalisation, "failed");
  assert.match(r.errs[0], /∫f = 0\.5, not 1/);
  assert.deepEqual(Object.values(r.rep.sampling), ["unavailable", "unavailable", "unavailable"]);
  r = fails("law H density(x) = x on [0, 1]", {});
  assert.equal(r.st.normalisation, "checked", "the same expression as an unnormalised density is valid");
  r = fails("law H pdf(x) = 1 - 2*x on [0, 1]", {});
  assert.equal(r.st.nonnegative, "failed");
  r = fails("law W cdf(x) = x + 0.1*sin(4*pi*x) on [0, 1]", {});
  assert.equal(r.st.monotonicity, "failed");
  r = fails("law J cdf(x) = if(x < 0.5, x/2, 0.5 + x/2) on [0, 1]", {});
  assert.equal(r.st.consistency, "failed", "a jump of F is an atom, which a CDF input does not take");
  r = fails("law Qd quantile(u) = 1 - u", {});
  assert.equal(r.st.monotonicity, "failed");
  r = fails("law Cs mgf(t) = cos(t)", {});
  assert.equal(r.st.monotonicity, "failed", "cos t is concave near 0, and an MGF is convex");
  r = fails("law Mx mgf(t) = 1/(1 - t^2/2)^0 + exp(1/t^2)", {});
  assert.ok(r.errs.length > 0, "an MGF that is not finite near 0 fails");
  r = fails("law Big cf(t) = 2*exp(-abs(t))", {});
  assert.equal(r.st.normalisation, "failed", "φ(0) = 2");
  r = fails("law Nh cf(t) = exp(i*t^2 - abs(t))", {});
  assert.equal(r.st.consistency, "failed", "φ(−t) is not the conjugate of φ(t)");
  r = fails("law S(a) pdf(x) = a*x^(-a - 1) on [1, inf] where a > 1", { a: 0.8 });
  assert.equal(r.st.constraints, "failed");
  r = fails("law T pdf(x) = 2*x on [0, 1] obs [0.2, 1.5]", {});
  assert.equal(r.st.observations, "failed", "an observation outside the support");
  // The zeta law with s = 2: the partial sum to 65,536 terms leaves about 9.3e-6, so the normalisation is unverified and the sampling approximate.
  r = fails("law Z2 pmf(k) = 6/(pi^2*k^2) on [1, inf]", {});
  assert.equal(r.st.normalisation, "unverified");
  assert.equal(r.rep.sampling.independent, "approximate");
  // The Cauchy CF: the table misses about 0.5 % of the mass, so the boundaries are unverified.
  r = fails("law Cy cf(t) = exp(-abs(t))", {});
  assert.equal(r.st.boundaries, "unverified");
  assert.equal(r.st.definite, "unverified");
  // A heavy Pareto density: its moments are unknown to the page, so the engine shows them as unknown, never as numbers.
  const { record } = D.parse("title: t\nlaw Pa pdf(x) = 1.5*x^(-2.5) on [1, inf]\nX ~ Pa()\nmean m = X\n");
  const c = En.prepare(record, { seed: 1, method: "independent", overrides: {} });
  assert.ok(c.ok);
  assert.equal(En.momentStatus(c)[0].mean, "unknown");
  assert.equal(En.reference(c, En.momentStatus(c))[0].values[0], null);
});

test("the custom input examples of the catalogue: each kind once, the failing ones fail their check, and the page shows the report", () => {
  const inputs = data.models.filter((/** @type {any} */ m) => m.kind === "input");
  assert.deepEqual([...new Set(inputs.map((/** @type {any} */ m) => recordOf(m.id).laws[0].kind))].sort(), Object.keys(Cu.KINDS).sort(), "an example of each input kind");
  assert.equal(inputs.filter((/** @type {any} */ m) => m.fails).length, 3);
  for (const m of inputs) {
    const state = { ...Object.fromEntries(Object.entries(M.FIELDS).map(([k, f]) => [k, f.default])), ...M.exampleState(m) };
    const d = M.derive(state);
    assert.equal(d.ok, !m.fails, `${m.id}: ${d.errors?.join(" ")}`);
    assert.ok(d.custom?.length === 1 && d.custom[0].uses.length >= 1, `${m.id}: the report of its law`);
    const st = d.custom[0].uses[0].report.checks.map((/** @type {any} */ c) => c.status);
    assert.equal(st.includes("failed"), !!m.fails, `${m.id}: ${st.join(", ")}`);
    assert.ok(st.every((/** @type {string} */ x) => ["checked", "failed", "unverified"].includes(x)));
  }
  assert.ok(Cu.ALERTS.join(" ").includes("An MGF need not exist") && Cu.ALERTS.join(" ").includes("Numerical checks do not prove"));
});

test("a custom law with parameters: the arguments read parameters only, each alternative gets its own table, and runs repeat exactly", () => {
  const bad = D.parse("title: t\nlaw Pe(a) pdf(x) = a*exp(-a*x) on [0, inf]\nR ~ exponential(rate = 1)\nX ~ Pe(a = R)\nmean m = X\n").record;
  assert.match(En.prepare(bad, { seed: 1, method: "independent", overrides: {} }).errors.join(" "), /read only parameters/);
  const text = "title: t\nparam a = 1\nlaw Pe(a) pdf(x) = a*exp(-a*x) on [0, inf]\nX ~ Pe(a = a)\nprob big = X > 2\nalt \"a = 1\": a = 1\nalt \"a = 2\": a = 2\n";
  const rec = D.parse(text).record, c = En.prepare(rec, { seed: 9, method: "independent", overrides: {} });
  assert.ok(c.ok, c.errors?.join(" "));
  const refs = En.reference(c, En.momentStatus(c));
  assert.ok(Math.abs(/** @type {number} */ (refs[0].values[0]) - Math.exp(-2)) < 1e-6 && Math.abs(/** @type {number} */ (refs[1].values[0]) - Math.exp(-4)) < 1e-6, "the reference of each alternative");
  const a = En.block(c, 3, {}), b = En.block(En.prepare(rec, { seed: 9, method: "independent", overrides: {} }), 3, {});
  assert.deepEqual(a.methods[0].acc, b.methods[0].acc, "the same seed gives the same block");
});
