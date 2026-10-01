import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import vm from "node:vm";
import { assertButtonsExport, assertInlined, assertStandardDeck, assertTemplateCopy, openPage, read } from "./data-visuals-beamdswitch.mjs";

const html = read("index.html");
const block = (id) => new RegExp(`<script id="${id}">\\n([\\s\\S]*?)</script>`).exec(html)[1];
const load = () => { const ctx = {}; ctx.self = ctx; vm.runInNewContext(block("infer-a-theory-phrases"), ctx); vm.runInNewContext(block("infer-a-theory-engine"), ctx); return ctx; };
const ctx = load(), IT = ctx.InferTheory, PH = ctx.InferPhraseData, TABLE = IT.phraseTable(PH);
const T = (await import("node:module")).createRequire(import.meta.url)("../beamdswitch.js");
const plain = (v) => JSON.parse(JSON.stringify(v));
const close = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (tol ${tol})`);
const claims = (text, scale = 10, mode = "continuous") => IT.parse(text, { scale, mode });
// The worked example is the most expensive run; do it once.
const WORKED = IT.analyse(IT.exampleState());

test("the parser covers every grammar class and reads scale only when the sentence states it", () => {
  const cases = [
    ["Values are usually near 8.", "location", "median"], ["Values vary a lot.", "spread", "spread"], ["Values tend to stay similar.", "persistence", "rho"],
    ["High values are usually followed by high values.", "correlation", "rho"], ["High values tend to be followed by low values.", "anticorrelation", "rho"],
    ["The effect lasts for about three seconds.", "lag", "tau"], ["Large downward excursions happen more often than Gaussian noise predicts.", "tails", "tailLo"],
    ["Positive and negative deviations look similar.", "symmetry", "kelly"], ["Large downward deviations are more common than large upward deviations.", "skew", "tailAsym"],
    ["When the value is low, it usually stays low.", "conditional", "condLow"], ["Values above 8 are very rare.", "threshold", "thrAbove"],
    ["After averaging over one minute, the distribution looks Gaussian.", "scale", "gauss"], ["The 10-second average is much less variable than the one-second values.", "comparison", "varRatio"],
    ["The lag-1 correlation is about 0.7.", "correlation", "rho"], ["The mean is approximately 8.", "location", "mean"], ["95% of observations lie between 4 and 12.", "numeric", "cover"],
    ["Events beyond 3σ happen roughly once in 100 observations.", "tails", "exceed"],
  ];
  for (const [s, cls, kind] of cases) { const p = claims(s); assert.equal(p.status, "ok", s); assert.equal(p.cls, cls, s); assert.equal(p.claims[0].kind, kind, s); }
  assert.equal(claims("The quantity tends to increase.").status, "nonstationary");
  assert.match(claims("The process changed after some point.").notes[0], /Split the observations into regimes/);
  // Scale: from the sentence when stated, else the card's; never invented from prose.
  assert.equal(claims("After averaging over a minute, the distribution looks approximately Gaussian.", 10).claims[0].scale, 60);
  assert.equal(claims("At 10-second resolution, bandwidth usually changes gradually.", 1).scale, 10);
  const two = claims("The variance is about 6 at 1 second and 1.8 at 10 seconds.", 5).claims;
  assert.deepEqual(plain(two).map((c) => [c.kind, c.value, c.scale]), [["var", 6, 1], ["var", 1.8, 10]]);
  assert.equal(claims("Values tend to stay similar.", 7).claims[0].scale, 7, "no scale in the sentence: the card's scale");
  assert.equal(claims("The effect lasts for about three seconds.", 10).claims[0].scale, 10, "a duration is not an observation scale");
});

test("unsupported sentences are not guessed, and numbers are checked", () => {
  for (const s of ["My cat prefers tuna on Tuesdays.", "The colour is blue.", "Bandwidth is fine."]) {
    const p = claims(s);
    assert.equal(p.status, "unsupported", s);
    assert.deepEqual(plain(p.claims), []);
    assert.equal(p.notes.at(-1), "I could not translate this observation reliably.");
  }
  assert.equal(claims("The lag-1 correlation is about 1.7.").status, "invalid");
  assert.equal(claims("Values above 8 are something.").status, "ambiguous");
  assert.equal(IT.analyse({ ...IT.blankState(), observations: [IT.observation("Bandwidth is fine.", 1)] }).status, "empty");
});

test("proposition and magnitude uncertainty are different claims", () => {
  const prop = claims("It is very likely that a poor 10-second interval is followed by another poor interval.");
  assert.equal(prop.confidence.phrase, "very likely");
  assert.deepEqual([prop.claims[0].kind, prop.claims[0].form, prop.claims[0].op, prop.claims[0].value], ["rho", "prop", ">", 0]);
  const mag = claims("The correlation is probably around 0.7.");
  assert.equal(mag.confidence.phrase, "probably");
  assert.deepEqual([mag.claims[0].form, mag.claims[0].value], ["mag", 0.7]);
  // P(C > 0) = q is virtual evidence with odds q : (1 − q); it never sets C = q.
  const c = { ...prop.claims[0], q: 0.85 };
  close(Math.exp(IT.claimLogLik(c, 0.5) - IT.claimLogLik(c, -0.5)), 0.85 / 0.15, 1e-6, "likelihood ratio");
  const m = { ...mag.claims[0], q: 0.9, uniform: 0.5 };
  assert.ok(IT.claimLogLik(m, 0.7) > IT.claimLogLik(m, 0.2) + 2, "a magnitude claim prefers values near 0.7");
  assert.ok(Number.isFinite(IT.claimLogLik(m, -0.9)), "but never rules anything out at q < 1");
  assert.equal(IT.claimLogLik({ ...c, q: 1, hard: true }, -0.5), -Infinity, "a deliberate hard constraint does rule out");
});

test("phrase data: Kent reference, survey calibration and working probability stay distinct", () => {
  const csv = read("probly.csv").trim().split("\n"), head = csv[0].split(",");
  assert.equal(createHash("sha256").update(read("probly.csv")).digest("hex"), PH.EMPIRICAL_PHRASE_DATA.source.sha256);
  assert.deepEqual(plain(PH.EMPIRICAL_PHRASE_DATA.columns.map((c) => c[0])), head, "the embedded columns are the CSV's, in order");
  PH.EMPIRICAL_PHRASE_DATA.columns.forEach(([, answers], j) => assert.deepEqual(plain(answers), csv.slice(1).map((r) => +r.split(",")[j]), head[j]));
  assert.equal(PH.EMPIRICAL_PHRASE_DATA.respondents, csv.length - 1);
  const likely = IT.phraseInfo("likely", TABLE);
  assert.deepEqual([likely.kent.lo, likely.kent.hi, likely.kent.as], [63, 87, "probable"], "Kent lists “likely” under “probable”: 75 ± 12");
  assert.equal(likely.basis, "survey median");
  assert.equal(likely.recommended, likely.survey.median / 100);
  const even = IT.phraseInfo("chances about even", TABLE);
  assert.deepEqual([even.survey, even.basis, even.recommended], [null, "middle of Kent's range", 0.5]);
  const unknown = IT.phraseInfo("very likely", TABLE);
  assert.deepEqual([unknown.known, unknown.kent, unknown.survey, unknown.recommended], [false, null, null, null], "no invented calibration");
  assert.ok(unknown.nearest.includes("highly likely"));
  // Only the working probability enters: an unknown phrase stays pending until given a meaning.
  const o = IT.observation("It is very likely that values tend to stay similar.", 10, { mode: "phrase", phrase: "very likely" });
  o.interpretation = claims(o.text);
  assert.equal(IT.buildConstraints([o], "continuous", TABLE).constraints[0].usable, false);
  o.confidence.q = 0.8;
  assert.equal(IT.buildConstraints([o], "continuous", TABLE).constraints[0].q, 0.8);
  assert.deepEqual(plain(IT.workingProbability({ mode: "range", lo: 0.9, hi: 0.7 })), { q: 0.8, lo: 0.7, hi: 0.9 });
  // Exact 0 or 1 is a hard constraint and needs to be allowed deliberately.
  const hard = { ...o, confidence: { mode: "exact", q: 1 } };
  assert.match(IT.buildConstraints([hard], "continuous", TABLE).constraints[0].reason, /hard constraint/);
  assert.equal(IT.buildConstraints([{ ...hard, allowHard: true }], "continuous", TABLE).constraints[0].usable, true);
});

test("solvers: the transfer matrix reproduces exact Gaussian results; Gaussian block averages stay Gaussian", () => {
  for (const rho of [0, 0.5, 0.9]) {
    const th = { mode: "continuous", g: { phi2: (1 - rho) / (2 * (1 + rho)), k1: rho / (2 * (1 - rho * rho)) } };
    const G = IT.solveGauss(th), M = IT.solveTM(th, null, 64);
    close(G.var, 1, 1e-9, "spectral variance"); close(G.cov(1), rho, 1e-9, "AR(1) lag-1"); close(G.cov(3), rho ** 3, 1e-9, "AR(1) lag-3");
    close(M.var, G.var, 1e-3, `TM variance ρ=${rho}`); close(M.cov(1) / M.var, rho, 1e-3, "TM lag-1"); close(M.logZ, G.logZ, 1e-4, "TM free energy");
    for (const b of [1, 2, 6]) {
      const d = M.block(b), sd = Math.sqrt(IT.blockCov(G.cov, b, 0));
      close(d.sd, sd, 1e-3 * sd, `block ${b} SD`);
      for (const k of [1, 2, 2.5]) close(Math.log(d.cdf(d.mean - k * d.sd) / IT.Phi(-k)), 0, 0.04, `block ${b} lower tail at ${k}σ stays Gaussian (ρ=${rho})`);
      close(d.quantile(0.9) - d.mean, sd * 1.2815515655, 0.01 * sd, `block ${b} 90th percentile`);
    }
  }
  // With no neighbour coupling the chain's marginal is the site density itself.
  const t = IT.solveTM({ mode: "continuous", g: { tail: 2.5 }, w: 1 }, null, 64);
  const site = (z) => (1 + z * z) ** -2.5, xs = Array.from({ length: 4001 }, (_, i) => -40 + i * 0.02), Z = xs.reduce((s, x) => s + site(x) * 0.02, 0);
  close(t.cdf(-1), xs.filter((x) => x < -1).reduce((s, x) => s + site(x) * 0.02, 0) / Z, 2e-3, "Student-t site CDF");
});

test("heavy tails come from genuine families: a positive φ⁴ lightens tails, a Student-t potential fattens them", () => {
  const lnR = (th, k = 2.5) => { const s = IT.solve(th, { M: 64 }), d = s.block(1); return Math.log(d.cdf(d.mean - k * d.sd) / IT.Phi(-k)); };
  assert.ok(lnR({ mode: "continuous", g: { phi2: 0.5, phi4: 0.2 } }) < -0.3, "φ⁴ > 0: fewer large deviations than a Gaussian of the same SD");
  assert.ok(lnR({ mode: "continuous", g: { tail: 2 }, w: 1 }) > 0.3, "Student-t: more large deviations");
  assert.equal(IT.normalizable({ mode: "continuous", g: { phi2: 0.5, phi3: 0.1 } }).ok, false, "φ³ needs a higher even term");
  assert.equal(IT.normalizable({ mode: "continuous", g: { tail: 0.4 }, w: 1 }).ok, false, "a tail power below 1/2 is not normalisable alone");
  assert.equal(IT.momentExists({ mode: "continuous", g: { tail: 2 }, w: 1 }, 4), false, "Student-t with 2g − 1 = 3: no fourth moment");
  assert.equal(IT.momentExists({ mode: "continuous", g: { tail: 2 }, w: 1 }, 2), true);
  assert.equal(IT.momentExists({ mode: "continuous", g: { phi2: 0.1, tail: 0.6 }, w: 1 }, 6), true, "a Gaussian core makes every moment exist");
  assert.match(IT.basisCheck("continuous", ["phi2", "phi4", "k2"]).problems[0], /only the lag-1 coupling/);
});

test("maximum entropy recovers the couplings that produced the moments", () => {
  const th = { mode: "continuous", g: { phi2: 0.4, k1: 0.7 } }, s = IT.solve(th);
  const fit = IT.maxentFit({ mode: "continuous", g: {} }, ["phi2", "k1"], ["phi2", "k1"].map((id) => s.opMean(id)), [0.5, 0]);
  assert.ok(fit.ok); close(fit.values[0], 0.4, 1e-7, "g₂"); close(fit.values[1], 0.7, 1e-7, "k₁");
  const th2 = { mode: "continuous", g: { phi2: 0.3, k1: 0.5, tailLo: 1.2, tailHi: 0.4 }, w: 1 }, s2 = IT.solve(th2, { M: 64 }), ids = Object.keys(th2.g);
  const f2 = IT.maxentFit({ mode: "continuous", g: {}, w: 1 }, ids, ids.map((id) => s2.opMean(id)), [0.5, 0.2, 0.5, 0.5], { grid: s2.grid });
  assert.ok(f2.ok); f2.values.forEach((v, i) => close(v, th2.g[ids[i]], 1e-5, ids[i]));
  const b = IT.solveBinary({ mode: "binary", g: { h: 0.3, J1: 0.6 } });
  const fb = IT.maxentFit({ mode: "binary", g: {} }, ["h", "J1"], [b.opMean("h"), b.opMean("J1")], [0, 0]);
  close(fb.values[0], 0.3, 1e-6, "h"); close(fb.values[1], 0.6, 1e-6, "J₁");
});

test("binary decimation of the nearest-neighbour Ising chain obeys tanh J′ = tanh² J exactly", () => {
  const exactM = (h, J) => { const s = IT.solveBinary({ mode: "binary", g: { h, J1: J } }); return s.m; };
  for (const J of [0.2, 0.6, 1.1]) {
    const d = IT.decimateNN(0, J);
    close(Math.tanh(d.J), Math.tanh(J) ** 2, 1e-12, `closed form J=${J}`);
    close(d.h, 0, 1e-12, "no field generated at h = 0");
    const flow = IT.rgFlow({ mode: "binary", g: { h: 0, J1: J } }, { rungs: 3 });
    let t = Math.tanh(J);
    for (const r of flow.rungs.slice(1)) { t = t * t; close(Math.tanh(r.projected.g.J1), t, 1e-7, `projected flow J=${J}, n=${r.n}`); assert.equal(r.diag.verdict, "exact"); close(r.diag.kl, 0, 1e-9, "exact decimation: zero KL"); }
  }
  // With a field the decimated chain is still nearest-neighbour; the magnetisation is unchanged by decimation.
  const d = IT.decimateNN(0.3, 0.8);
  close(exactM(d.h, d.J), exactM(0.3, 0.8), 1e-9, "retained spins keep the magnetisation");
  close(IT.ringKL({ mode: "binary", g: { h: 0.3, J1: 0.8 } }, { mode: "binary", g: { h: d.h, J1: d.J } }), 0, 1e-12, "16-spin ring: exact");
  // A lag-2 coupling generates new operators: the projection is no longer exact.
  const f2 = IT.rgFlow({ mode: "binary", g: { h: 0, J1: 0.6, J2: 0.3 } }, { rungs: 2 });
  assert.ok(f2.rungs[1].diag.kl > 1e-6, "truncation error is reported, not hidden");
  assert.notEqual(f2.rungs[1].diag.verdict, "exact");
});

test("relevance: the numerical RG linearisation at the Gaussian fixed point reproduces the known eigenvalues", () => {
  const rel = IT.relevance("continuous", ["phi1", "phi2", "phi3", "phi4", "k1"]);
  const by = Object.fromEntries(rel.diag.map((d) => [d.id, d.lambda]));
  close(by.phi1, Math.SQRT2, 0.02, "φ: relevant, √2"); close(by.phi2, 1, 0.02, "φ²: marginal");
  close(by.phi3, Math.SQRT1_2, 0.02, "φ³: 2^(−1/2)"); close(by.phi4, 0.5, 0.02, "φ⁴: 1/2"); close(by.k1, 0.5, 0.02, "k₁: 1/2");
  assert.deepEqual(plain(rel.diag.map((d) => d.class)), ["relevant", "marginal", "irrelevant", "irrelevant", "irrelevant"]);
  const b = IT.relevance("binary", ["h", "J1"]);
  close(b.diag[0].lambda, 1, 1e-6, "h at the free-spin point: marginal under decimation"); close(b.diag[1].lambda, 0, 1e-6, "J₁: J′ ∝ J², irrelevant");
});

test("identifiability: a singular Hessian is reported as non-identifiable rather than inverted", () => {
  const eig = IT.identifiability([[600, 600], [600, 600]]);
  assert.deepEqual(plain(eig.map((e) => e.class)).sort(), ["non-identifiable", "strong"]);
  const flat = eig.find((e) => e.class === "non-identifiable");
  close(Math.abs(flat.vector[0]), Math.SQRT1_2, 1e-9, "the flat direction is g₁ − g₂");
  assert.ok(IT.identifiability([[0, 0], [0, 0]]).every((e) => e.class === "non-identifiable"));
  assert.ok(IT.identifiability([[-5, 0], [0, 300]]).some((e) => e.class === "non-identifiable"), "negative curvature is not information");
  assert.equal(IT.badNumbers(IT.identifiability([[0, 0], [0, 0]])).length, 0);
});

test("contradictions are flagged, never averaged away; model inadequacy names missing structure", () => {
  const st = (texts) => ({ ...IT.blankState(), observations: texts.map((t) => IT.observation(t, 1)) });
  const spread = IT.analyse(IT.interpretAll(st(["Values almost never fluctuate.", "Large fluctuations occur most of the time.", "The lag-1 correlation is about 0.5."])), { uvDepth: 0, skipHessian: true });
  assert.equal(spread.conflicts.length, 1);
  assert.match(spread.conflicts[0].text, /Observations 1 and 2 impose incompatible constraints on the spread/);
  const nums = IT.analyse(IT.interpretAll(st(["The lag-1 correlation is about 0.9.", "The lag-1 correlation is about 0.1."])), { uvDepth: 0, skipHessian: true });
  assert.match(nums.conflicts[0].text, /incompatible constraints on the lag-r correlation/);
  const bad = IT.analyse(IT.interpretAll(st(["Large deviations occur much more often than a Gaussian model predicts.", "Values tend to stay similar."])), { uvDepth: 0, skipHessian: true });
  assert.equal(bad.adequacy.adequate, false, "a Gaussian basis cannot explain heavy tails");
  assert.ok(bad.adequacy.suggest.some((s) => ["tailLo", "tail", "tailHi"].includes(s.id)), "it suggests a genuine tail operator");
  assert.ok(!bad.adequacy.suggest.some((s) => s.id === "phi4"), "never a positive φ⁴ for heavy tails");
  const trend = IT.interpretAll(st(["The quantity tends to increase.", "Values tend to stay similar."]));
  const tr = IT.analyse(trend, { uvDepth: 0, skipHessian: true });
  assert.equal(tr.nonstationary, true);
  assert.ok(IT.adequacy(tr.constraints, tr.ens, tr.basis, true).suggest.some((s) => s.id === "nonstationary"));
});

test("the worked example: effective action, coupling uncertainty, forward RG, widening inverse RG, a recommendation", () => {
  const r = WORKED;
  assert.equal(r.status, "ok");
  assert.equal(r.refStep, 10);
  assert.deepEqual(plain(r.basis), ["phi2", "tailLo", "tailHi", "k1"]);
  assert.equal(IT.actionPlain(r.basis, "continuous"), "S[φ] = g₂ Σ φₜ² + g_tail− Σ V₋(φₜ) + g_tail+ Σ V₊(φₜ) + k₁ Σ (φₜ₊₁ − φₜ)²");
  assert.deepEqual(plain(r.constraints.map((c) => [c.kind, c.scale, c.usable])), [["rho", 10, true], ["rho", 10, true], ["tailLo", 10, true], ["gauss", 60, true]]);
  assert.equal(r.constraints[1].q, 0.85, "“very likely” is in neither source: the example states its own meaning");
  const row = (id) => r.couplings.find((x) => x.id === id);
  assert.equal(row("k1").ident === "moderate" || row("k1").ident === "strong", true, "k₁ is reasonably constrained");
  assert.ok(row("k1").q05 > 0, "persistence: k₁ > 0");
  for (const id of ["phi1", "phi4", "k2"]) assert.equal(row(id).status, "omitted", `${id} omitted, not zero`);
  assert.ok(r.directions.weak >= 1, "underdetermination is explicit");
  // Forward RG: short-range correlation washes out and fluctuations shrink; the flow moves toward the Gaussian family.
  const a = r.ir[0].exact, z = r.ir.at(-1).exact;
  assert.ok(z.rho1.q50 < a.rho1.q50 / 5 && z.sd.q50 < a.sd.q50 / 2);
  assert.ok(Math.abs(z.gauss.q50) <= Math.abs(r.ir[1].exact.gauss.q50) + 0.02, "no further from Gaussian at 10 min than at 20 s");
  // Inverse RG: an ensemble whose predictions widen toward finer scales and that stops when identifiability is lost.
  assert.ok(r.uv.length >= 2);
  for (let i = 1; i < r.uv.length; i++) assert.ok(r.uv[i].medianRatio >= r.uv[i - 1].medianRatio - 0.02, "uncertainty grows toward the UV");
  assert.equal(r.uv.at(-1).label, "not identifiable");
  assert.ok(r.uv[0].n > 50 && r.uv[0].ess > 10, "an ensemble, not a single backward line");
  const sd = r.uv[0].predictions["uv:sd"];
  assert.ok(sd.q95 > sd.q05 && sd.q05 >= 0.99, "fine-scale values are at least as variable as the 10 s averages, with uncertainty");
  // Experimental design: ranked by expected information gain, in English with a mathematical target.
  assert.ok(r.ranking.length >= 8);
  for (let i = 1; i < r.ranking.length; i++) assert.ok(r.ranking[i - 1].gain.nats >= r.ranking[i].gain.nats);
  const rec = IT.recommendation(r);
  assert.match(rec.english, /^[A-Z].+\.$/); assert.ok(rec.math.length > 0); assert.ok(rec.bits > 0);
  assert.deepEqual(plain(IT.badNumbers({ c: r.couplings, ir: r.ir, uv: r.uv.map((l) => [l.predictions, l.couplings]), rank: r.ranking.map((x) => x.gain), d: r.directions })), []);
});

test("inference is deterministic", () => {
  // A fresh engine (its own realm) and the shared one give identical numbers.
  const opts = { uvDepth: 1, skipHessian: true }, fresh = load().InferTheory;
  const key = (r) => JSON.stringify({ c: r.couplings, ir: r.ir, u: r.uv.map((l) => l.predictions), k: r.ranking.map((x) => [x.id, x.gain.nats]) });
  assert.equal(key(fresh.analyse(fresh.exampleState(), opts)), key(IT.analyse(IT.exampleState(), opts)));
});

test("expected information gain: zero for an uninformative measurement, bounded by the prior entropy", () => {
  const ens = WORKED.uv[0].ens, cand = IT.candidates("continuous", WORKED.basis, false, 10)[0];
  const flat = { ...ens, members: ens.members.map((m) => ({ ...m, vals: { ...m.vals, [cand.spec.key]: 0.5 } })) };
  close(IT.infoGain(cand, flat, null).nats, 0, 1e-9, "every theory predicts the same value");
  const g = IT.infoGain(cand, ens, null), H = -ens.weights.reduce((s, w) => s + (w > 0 ? w * Math.log(w) : 0), 0);
  assert.ok(g.nats > 0 && g.nats <= H + 1e-9);
  const cost = IT.rankExperiments(ens, IT.candidates("continuous", WORKED.basis, false, 10), { useCost: true });
  for (let i = 1; i < cost.length; i++) assert.ok(cost[i - 1].score >= cost[i].score, "ranked by information per unit cost");
  const target = IT.rankExperiments(ens, IT.candidates("continuous", WORKED.basis, false, 10), { target: "t:uvTail" });
  assert.ok(target.length && target.every((r) => r.gain.nats >= 0));
});

test("the binary field: an Ising-like chain whose couplings are probability parameters", () => {
  const st = IT.exampleState(IT.BINARY_EXAMPLE), r = IT.analyse(st, { uvDepth: 1, skipHessian: true });
  assert.equal(r.status, "ok");
  assert.deepEqual(plain(r.constraints.map((c) => c.kind)), ["pMinus", "condMinus"]);
  const J = r.couplings.find((x) => x.id === "J1");
  assert.ok(J.q50 > 0, "bad followed by bad: persistence J₁ > 0");
  assert.ok(r.ir.length > 2 && r.ir.every((b) => b.worst === "exact"), "nearest-neighbour decimation is exact at every step");
  assert.equal(claims("Bad intervals are uncommon.", 10, "binary").claims[0].kind, "pMinus");
  const asked = IT.analyse({ ...st, objective: { ...st.objective, type: "target" } }, { uvDepth: 1, skipHessian: true });
  assert.equal(asked.objective, asked.targets[0].key, "an unset or stale target falls back to the first offered prediction");
  assert.ok(asked.ranking.some((x) => x.gain.nats > 0));
});

test("raw.json matches the engine", () => {
  const raw = JSON.parse(read("raw.json"));
  assert.deepEqual(raw.limits, plain(IT.LIMITS));
  assert.deepEqual(raw.defaults, plain(IT.DEFAULTS));
  assert.deepEqual(raw.frequency_readings, plain(IT.FREQUENCY));
  assert.deepEqual(raw.dictionary, plain(IT.DICTIONARY));
  assert.deepEqual(Object.keys(raw.operators), Object.keys(IT.OPS));
  for (const [k, o] of Object.entries(IT.OPS)) assert.deepEqual(raw.operators[k], { mode: o.mode, symbol: o.sym, operator: o.op, kind: o.kind, name: o.name, meaning: o.meaning });
  assert.deepEqual(raw.worked_example.observations.map((o) => o.text), plain(IT.WORKED.observations.map((o) => o[0])));
  assert.deepEqual(raw.phrase_sources.kent, plain(PH.KENT_DATA.source));
  assert.deepEqual(raw.phrase_sources.survey, plain(PH.EMPIRICAL_PHRASE_DATA.source));
  assert.equal(IT.DICTIONARY.length, 17);
});

test("the page is one offline file with the metadata it promises", () => {
  assert.match(html, /<title>Infer a Theory — From Observations to Effective Actions and Renormalisation<\/title>/);
  assert.match(html, /<meta name="description" content="Turn qualitative observations into probabilistic effective actions, coupling estimates, Wilsonian RG flows, predictions, and informative next experiments\.">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/teoyujie\.org\/visuals\/infer-a-theory">/);
  assert.match(html, /<meta property="og:url" content="https:\/\/teoyujie\.org\/visuals\/infer-a-theory">/);
  assert.match(html, /<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'/);
  assert.deepEqual([...html.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1]), [' id="beamdswitch"', ' id="infer-a-theory-phrases"', ' id="infer-a-theory-engine"', ' id="infer-a-theory-ui"'], "inline scripts only");
});

test("every deck opens in beamdswitch as the standard narrated template", () => {
  assertTemplateCopy("infer-a-theory");
  assertInlined(html, "beamdswitch", read("beamdswitch.js"), "infer-a-theory");
  const md = T.deck(IT.report(IT.exampleState(), WORKED));
  assertStandardDeck(md, "worked example");
  assert.ok(md.includes(IT.recommendation(WORKED).english), "the deck ends on the page's recommendation");
  assertStandardDeck(T.deck(IT.report(IT.blankState(), null)), "blank analysis");
  assertStandardDeck(T.deck(IT.report(IT.exampleState(IT.BINARY_EXAMPLE), IT.analyse(IT.exampleState(IT.BINARY_EXAMPLE), { uvDepth: 1, skipHessian: true }))), "binary");
});

test("the page boots, its WebMCP tools answer, and the deck buttons export the page as set", async () => {
  const page = await openPage("infer-a-theory");
  assert.equal(page.run('document.getElementById("app").hidden'), false, "the app replaces the no-JavaScript text");
  assert.equal(page.run('document.getElementById("nojs").hidden'), true);
  const tools = page.run("InferTheoryTools");
  assert.deepEqual(plain(tools.map((t) => t.name)), ["get_metadata", "get_current_state", "interpret_observation", "rank_next_experiments"]);
  for (const t of tools) assert.equal(t.annotations.readOnlyHint, true);
  const call = async (name, args = {}) => JSON.parse((await tools.find((t) => t.name === name).execute(args)).content[0].text);
  assert.equal((await call("get_metadata")).url, "https://teoyujie.org/visuals/infer-a-theory");
  const state = await call("get_current_state");
  assert.equal(state.example, "football");
  assert.deepEqual(state.observations.map((o) => o.status), ["ok", "ok", "ok", "ok"]);
  const one = await call("interpret_observation", { text: "It is very likely that a bad interval is followed by another bad interval.", scale_seconds: 10 });
  assert.equal(one.claims[0].kind, "rho");
  assert.equal(one.phrase.known, false);
  assert.equal((await call("interpret_observation", { text: "Purple monkey dishwasher.", scale_seconds: 1 })).status, "unsupported");
  assert.ok(Array.isArray(await call("rank_next_experiments")));
  await assertButtonsExport(page, "infer-a-theory", T.deck(IT.report(IT.exampleState(), null)));
});
