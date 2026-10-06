// The constructed laws of group 4 against independent references: the finite mixture, the compound Poisson law, the
// empirical law, the kernel density model and the truncated law. The identities use closed forms or sums that the
// tests compute themselves (a convolution for the compound law, the truncated normal moments, the Poisson PMF). Each
// sampler runs 3 fixed seeds of 20,000 draws: a discrete law takes the chi-square test of helpers.mjs with p > 1e-6,
// a continuous law the Kolmogorov–Smirnov statistic √n·D < 2.6 (a false failure below 3e-6 for each assertion), and
// the mean must be within 5.5 standard errors where the variance is finite (below 4e-8). The about 250 assertions
// together fail with a probability below 1e-3 for correct samplers.
import assert from "node:assert/strict";
import test from "node:test";
import { Co, L, Rng, S, data, gofPValue } from "./helpers.mjs";

const SEEDS = [11, 2026, 4294967295], N = 20000, KS = 2.6;
/** @param {number} a @param {number} b @param {number} tol */
const near = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

/** N draws of a sampler with one seed, each from its own replicate stream. @param {any} s @param {number} seed */
function draws(s, seed) {
  const stats = { proposals: 0, accepts: 0, violations: 0 }, xs = new Float64Array(N), r = Rng.stream(seed, "test", 0, 0);
  for (let i = 0; i < N; i++) { r.reset(i, 0); xs[i] = /** @type {number} */ (s.draw(r, stats)); }
  return { xs, stats };
}
/** √n times the Kolmogorov–Smirnov distance of draws to a CDF. @param {Float64Array} xs @param {(x: number) => number} cdf */
function ks(xs, cdf) {
  const s = Float64Array.from(xs).sort();
  let d = 0;
  for (let i = 0; i < s.length; i++) { const F = cdf(s[i]); d = Math.max(d, Math.abs(F - i / s.length), Math.abs(F - (i + 1) / s.length)); }
  return d * Math.sqrt(s.length);
}

const CASES = /** @type {[string, any][]} */ ([
  ["mixture_poisson", { w: [0.7, 0.3], lambda: [2, 9] }],
  ["mixture_poisson", { w: [0.35, 0.65], lambda: [0, 4.2] }],
  ["mixture_binomial", { w: [0.7, 0.3], n: 50, p: [0.01, 0.06] }],
  ["mixture_normal", { w: [0.4, 0.6], mu: [-1, 2], sigma: [0.5, 1] }],
  ["truncated_poisson", { lambda: 2, lower: 1, upper: Infinity }],
  ["truncated_negbin", { r: 0.5, p: 0.2, lower: 2, upper: Infinity }],
  ["truncated_mixture_geometric", { w: [0.1, 0.9], p: [0.02, 0.0005], lower: 50, upper: Infinity }],
  ["truncated_normal", { mu: 0, sigma: 1, lower: 0.5, upper: 2 }],
  ["truncated_exponential", { rate: 1, lower: 3, upper: Infinity }],
  ["compound_poisson", { freq: 3, lambda: 2 }],
  ["compound_geometric", { freq: 12, p: 0.4 }],
  ["compound_categorical", { freq: 9, p: [0.35, 0.3, 0.2, 0.1, 0.05] }],
  ["empirical", { x: [1.5, 2, 2, 3.7, -1], w: 1 }],
  ["empirical", { x: [0, 1, 2, 3], w: [57, 203, 383, 525] }],
  ["kde", { x: [0, 1, 5, 5.5], w: [1, 2, 1, 1], h: 0.6 }],
]);

test("the five constructed laws are in the catalogue with every part, and their code resolves from their names", () => {
  const ids = ["mixture", "compound", "empirical", "kde", "truncated"];
  for (const id of ids) {
    const l = data.laws.find((/** @type {any} */ x) => x.id === id);
    assert.ok(l, `${id} is in the catalogue`);
    assert.equal(l.type, "constructed");
    for (const k of ["name", "convention", "support"]) assert.ok(l[k]?.length > 3, `${id}: ${k}`);
    assert.ok((l.pmf ?? l.pdf)?.length > 10, `${id}: a formula`);
    assert.ok(l.params.length >= 2 && l.params.every((/** @type {any} */ p) => p.domain), `${id}: parameters with domains`);
    assert.ok(l.limits.length >= 3, `${id}: limiting cases`);
    for (const k of ["mean", "variance", "existence"]) assert.ok(l.moments[k], `${id}: moments.${k}`);
    for (const k of ["mgf", "cf"]) assert.ok(l.transforms[k], `${id}: transforms.${k}`);
  }
  for (const [name, p] of CASES) {
    const law = Co.resolve(name);
    assert.ok(law, `${name} resolves`);
    assert.ok(ids.includes(Co.catalogueOf(law)), `${name} belongs to a catalogue law`);
    assert.deepEqual(law.check(p), [], `${name} ${JSON.stringify(p)} passes its check`);
  }
  assert.equal(Co.resolve("mixture_multinomial"), null, "a vector law has no mixture");
  assert.equal(Co.resolve("compound_nosuchlaw"), null);
  assert.match(Co.resolve("mixture_poisson").check({ w: [0.5, 0.4], lambda: [1, 2] })[0], /add to 0\.9/);
  assert.match(Co.resolve("truncated_poisson").check({ lambda: 1, lower: 5.5, upper: 5.7 })[0], /nothing to keep/);
  assert.match(Co.resolve("compound_normal").check({ freq: 2, mu: 1, sigma: 1 })[0], /negative values/);
  assert.equal(Co.resolve("mixture_empirical"), null, "a law with vector parameters has no mixture");
  assert.match(Co.resolve("compound_empirical").check({ freq: 2, x: [0.5, 1], w: 1 })[0], /not all integers/);
});

test("PMF, CDF, survival function and quantile function agree for each law, and the moments equal sums or integrals", () => {
  for (const [name, p] of CASES) {
    const law = Co.resolve(name);
    const m = law.moments(p);
    if (!law.continuous) {
      // A sum over the support: the mass, the mean and the variance; and F + S = 1 and the quantile inverts F.
      const xs = law.atoms ? law.atoms(p).x : null, s = law.support(p);
      const points = xs ?? Array.from({ length: Math.min(200000, (s.hi === Infinity ? 200000 : s.hi) - s.lo + 1) }, (_, i) => s.lo + i);
      let mass = 0, m1 = 0, m2 = 0;
      for (const k of points) { const w = law.pmf(k, p); mass += w; m1 += w * k; m2 += w * k * k; }
      assert.ok(near(mass, 1, 1e-9) || s.hi === Infinity && mass > 1 - 1e-6, `${name}: the masses add to ${mass}`);
      if (m.mean !== null && s.hi < Infinity) { assert.ok(near(m1, m.mean, 1e-9), `${name}: mean ${m.mean} against ${m1}`); assert.ok(near(m2 - m1 * m1, m.variance, 1e-8), `${name}: variance`); }
      for (const k of points.slice(0, 50)) {
        assert.ok(near(law.cdf(k, p) + law.sf(k, p), 1, 1e-12), `${name}: F + S = 1 at ${k}`);
        // The middle of the jump of F at k, so the rounding of F and S does not decide the value.
        const u = law.cdf(k, p) - law.pmf(k, p) / 2;
        if (law.pmf(k, p) > 1e-9) assert.equal(law.quantile(u, p), k, `${name}: Q(F(${k}) − p(${k})/2) = ${k}`);
      }
    } else {
      // An integral of the quantile function gives the mean; F(Q(u)) = u; the density integrates to the CDF.
      const n = 20000;
      let m1 = 0, m2 = 0;
      for (let j = 0; j < n; j++) { const x = law.quantile((j + 0.5) / n, p); m1 += x / n; m2 += (x * x) / n; }
      if (m.mean !== null) assert.ok(Math.abs(m1 - m.mean) < 2e-3 * Math.max(1, Math.sqrt(m.variance ?? 1)), `${name}: mean ${m.mean} against ${m1}`);
      for (const u of [1e-6, 0.01, 0.3, 0.5, 0.9, 0.999]) {
        const x = law.quantile(u, p);
        assert.ok(Math.abs(law.cdf(x, p) - u) < 1e-9, `${name}: F(Q(${u})) = ${law.cdf(x, p)}`);
        assert.ok(near(law.cdf(x, p) + law.sf(x, p), 1, 1e-12), `${name}: F + S = 1`);
        if (law.isf) assert.ok(Math.abs(law.sf(law.isf(1 - u, p), p) - (1 - u)) < 1e-9, `${name}: the inverse survival function`);
      }
      if (law.pdf) {
        const a = law.quantile(0.2, p), b = law.quantile(0.7, p), k = 2000, h = (b - a) / k;
        let I = 0;
        for (let j = 0; j < k; j++) I += (h / 6) * (law.pdf(a + j * h, p) + 4 * law.pdf(a + (j + 0.5) * h, p) + law.pdf(a + (j + 1) * h, p));
        assert.ok(Math.abs(I - 0.5) < 1e-6, `${name}: ∫ f over [Q(0.2), Q(0.7)] = ${I}`);
      }
    }
  }
});

test("independent references: the zero-truncated Poisson law, truncated normal moments, Panjer against a convolution, the KDE moments", () => {
  const tp = Co.resolve("truncated_poisson"), P = L.BY_ID.poisson;
  for (const lam of [0.5, 2, 7]) {
    const p = { lambda: lam, lower: 1, upper: Infinity }, Z = 1 - Math.exp(-lam);
    assert.ok(near(tp.moments(p).mean, lam / Z, 1e-12), `zero-truncated Poisson mean for λ = ${lam}`);
    for (const k of [1, 2, 5]) assert.ok(near(tp.pmf(k, p), P.pmf(k, { lambda: lam }) / Z, 1e-12));
  }
  // Truncated N(0, 1) on [a, b]: E = (φ(a) − φ(b))/Z, Var = 1 + (aφ(a) − bφ(b))/Z − E².
  const tn = Co.resolve("truncated_normal");
  for (const [a, b] of [[0.5, 2], [-1, 1], [0, Infinity], [2, Infinity]]) {
    const Z = S.normalCdf(b) - S.normalCdf(a), fa = S.normalPdf(a), fb = b === Infinity ? 0 : S.normalPdf(b), bfb = b === Infinity ? 0 : b * fb;
    const mean = (fa - fb) / Z, variance = 1 + (a * fa - bfb) / Z - mean * mean;
    const m = tn.moments({ mu: 0, sigma: 1, lower: a, upper: b });
    assert.ok(Math.abs(m.mean - mean) < 1e-7, `truncated normal [${a}, ${b}] mean ${m.mean} against ${mean}`);
    assert.ok(Math.abs(/** @type {number} */ (m.variance) - variance) < 1e-6, `truncated normal [${a}, ${b}] variance`);
  }
  // Compound Poisson with categorical terms: P(S = s) = Σ_n P(N = n) P(Y_1 + … + Y_n = s), by repeated convolution.
  const cp = Co.resolve("compound_categorical"), q = { freq: 2.5, p: [0.5, 0.3, 0.2] };
  const f = [0, 0.5, 0.3, 0.2], exact = new Float64Array(41);
  let conv = new Float64Array(41);
  conv[0] = 1;
  for (let n = 0; n <= 40; n++) {
    const pn = P.pmf(n, { lambda: 2.5 });
    for (let s = 0; s <= 40; s++) exact[s] += pn * conv[s];
    const next = new Float64Array(41);
    for (let s = 0; s <= 40; s++) for (let j = 1; j <= 3 && s + j <= 40; j++) next[s + j] += conv[s] * f[j];
    conv = next;
  }
  for (let s = 0; s <= 30; s++) assert.ok(Math.abs(cp.pmf(s, q) - exact[s]) < 1e-14, `compound P(S = ${s})`);
  // Compound Poisson with exponential terms: P(S ≤ x) = e^(−λ) Σ_n λ^n/n! · P(Gamma(n, 1) ≤ x); the lattice of step h is within h·λ of it.
  const ce = Co.resolve("compound_exponential"), lam = 3;
  for (const x of [0, 1, 3, 6]) {
    let F = Math.exp(-lam);
    for (let n = 1; n < 60; n++) F += P.pmf(n, { lambda: lam }) * S.gammaPQ(n, Math.max(x, 1e-300)).P;
    const t = ce.table({ freq: lam, rate: 1 });
    assert.ok(Math.abs(ce.cdf(x, { freq: lam, rate: 1 }) - F) < 2 * lam * t.h + 1e-12, `compound exponential F(${x}) = ${ce.cdf(x, { freq: lam, rate: 1 })} against ${F}`);
  }
  // The kernel density model: mean = weighted mean, variance = weighted variance + h², Silverman's rule.
  const kd = Co.kde, kp = { x: [0, 1, 5, 5.5], w: [1, 2, 1, 1], h: 0.6 };
  const mean = (0 + 2 + 5 + 5.5) / 5, v = ((0 - mean) ** 2 + 2 * (1 - mean) ** 2 + (5 - mean) ** 2 + (5.5 - mean) ** 2) / 5;
  assert.ok(near(kd.moments(kp).mean, mean, 1e-12) && near(kd.moments(kp).variance, v + 0.36, 1e-12));
  assert.ok(kd.silverman({ x: [1, 2, 3, 4, 5, 6, 7, 8], w: 1, h: 1 }) > 0);
});

for (const kind of ["reference", "inverse", "rejection"]) {
  test(`${kind}: each constructed law's draws fit its own CDF or PMF and its mean, for 3 seeds`, () => {
    for (const [name, p] of CASES) {
      const law = Co.resolve(name), s = kind === "rejection" ? law.rejection(p, 1) : kind === "inverse" ? law.inverse(p) : law.reference(p);
      if ("unavailable" in s) { assert.ok(s.unavailable.length > 20, `${name}: ${kind} states why it is not available`); continue; }
      const m = law.moments(p);
      for (const seed of SEEDS) {
        const d = draws(s, seed);
        if (law.continuous) {
          const stat = ks(d.xs, (x) => law.cdf(x, p));
          assert.ok(stat < KS, `${name} ${kind} seed ${seed}: √n·D = ${stat.toFixed(3)}`);
        } else {
          /** @type {Map<number, number>} */
          const counts = new Map();
          for (const x of d.xs) counts.set(x, (counts.get(x) ?? 0) + 1);
          if (law.atoms) {
            // A law of finitely many values: the chi-square statistic over its values, with no pooling.
            const at = law.atoms(p);
            let chi = 0;
            at.x.forEach((/** @type {number} */ x, /** @type {number} */ i) => { const e = at.p[i] * N; chi += ((counts.get(x) ?? 0) - e) ** 2 / e; });
            assert.ok(S.chiSquareSf(chi, at.x.length - 1) > 1e-6, `${name} ${kind} seed ${seed}: chi-square ${chi}`);
          } else assert.ok(gofPValue(law, p, counts, N) > 1e-6, `${name} ${kind} seed ${seed}: chi-square p-value`);
        }
        if (m.mean !== null && m.variance !== null && m.variance > 0) {
          const mean = d.xs.reduce((a, b) => a + b, 0) / N, z = (mean - m.mean) / Math.sqrt(m.variance / N);
          assert.ok(Math.abs(z) < 5.5, `${name} ${kind} seed ${seed}: mean ${mean} is ${z.toFixed(2)} standard errors from ${m.mean}`);
        }
        if (kind === "rejection" && s.acceptance) assert.ok(Math.abs(d.stats.accepts / d.stats.proposals - s.acceptance) < 6 * Math.sqrt(s.acceptance / d.stats.proposals) + 1e-3, `${name} acceptance rate`);
      }
    }
  });
}

test("the assumption failures: a mixture envelope that is too small shows violations, and a cut table caps the draws", () => {
  const law = Co.resolve("mixture_poisson"), p = { w: [0.7, 0.3], lambda: [2, 9] };
  const bad = /** @type {any} */ (law.rejection(p, 0.5)), d = draws(bad, 7);
  assert.match(bad.exactness, /not exact/);
  assert.ok(d.stats.violations > 0, "proposals above the envelope are counted");
  const cut = /** @type {any} */ (law.inverse(p, 0.99)), top = law.quantile(0.99, p);
  assert.ok(draws(cut, 7).xs.every((x) => x <= top), "no draw passes the 0.99 quantile");
});
