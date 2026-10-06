/* Universal Data Workbench: the statistics of test catalogue v1 (catalog.md), as pure functions.
 *
 * The distributions the tests need, the eight tests of the catalogue computed from their sufficient statistics,
 * the Benjamini–Yekutieli adjustment and the effect measures the ranking reads. The engine computes the
 * sufficient statistics (src/statsql.js); the Node checks compare every function here with SciPy, statsmodels and
 * pymannkendall (tests/fixtures/stats-reference.json, written by tools/reference_stats.py).
 *
 *   T1 spearman      Spearman's rho from n and rho: p from t with n − 2 df; a Fisher-z interval with the Bonett–Wright SE
 *   T2 welchT        Welch's t from two groups' n, mean and variance: the mean difference and Hedges' g, each with an interval
 *   T3 welchAnova    Welch's one-way ANOVA of 3 to 12 groups: omega-squared
 *   T4 chiSquare     Pearson's chi-square of independence, no continuity correction: bias-corrected Cramér's V
 *   T5 fisher        Fisher's exact test of a 2 × 2 table, two-sided: the sample odds ratio with Woolf's interval
 *   T6 permutation   independence of an r × c table: 10,000 random tables with the same margins, seeded
 *   T7 mannKendall   Mann–Kendall with the Hamed–Rao variance correction (lags 1 to 3): Kendall's tau and Sen's slope
 *   T8 levelShift    CUSUM with a Bartlett long-run variance: p from the Kolmogorov distribution; the shift and where
 *   by               Benjamini–Yekutieli adjusted p-values
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DWStats = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ---------- special functions ---------- */

  const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];

  /** ln Γ(x) for x > 0, Lanczos (g = 7, 9 terms). */
  function lgamma(x) {
    if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
    const y = x - 1;
    let a = LANCZOS[0];
    for (let i = 1; i < 9; i++) a += LANCZOS[i] / (y + i);
    const t = y + 7.5;
    return 0.5 * Math.log(2 * Math.PI) + (y + 0.5) * Math.log(t) - t + Math.log(a);
  }

  /** ln C(n, k). */
  const lchoose = (n, k) => lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1);

  const TINY = 1e-300;

  /** The continued fraction of the incomplete beta function (modified Lentz). */
  function betacf(a, b, x) {
    let c = 1, d = 1 - ((a + b) * x) / (a + 1);
    if (Math.abs(d) < TINY) d = TINY;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= 2000; m++) {
      const m2 = 2 * m;
      let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
      c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
      d = 1 / d; h *= d * c;
      aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
      d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
      c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < 1e-16) break;
    }
    return h;
  }

  /**
   * The regularized incomplete beta function I_x(a, b), or its complement 1 − I_x(a, b) with `upper`, each computed
   * on the side that keeps a small tail precise.
   */
  function beta(x, a, b, upper = false) {
    if (!(x > 0)) return upper ? 1 : 0;
    if (!(x < 1)) return upper ? 0 : 1;
    const front = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log1p(-x));
    if (x < (a + 1) / (a + b + 2)) {
      const v = (front * betacf(a, b, x)) / a;
      return upper ? 1 - v : v;
    }
    const v = (front * betacf(b, a, 1 - x)) / b;
    return upper ? v : 1 - v;
  }

  /** The regularized incomplete gamma function P(a, x), or Q(a, x) = 1 − P(a, x) with `upper`. */
  function gamma(a, x, upper = false) {
    if (!(x > 0)) return upper ? 1 : 0;
    const lead = a * Math.log(x) - x - lgamma(a);
    if (x < a + 1) {
      let ap = a, del = 1 / a, sum = del;
      for (let n = 0; n < 100000; n++) {
        ap += 1;
        del *= x / ap;
        sum += del;
        if (Math.abs(del) < Math.abs(sum) * 1e-17) break;
      }
      const p = sum * Math.exp(lead);
      return upper ? 1 - p : p;
    }
    let b = x + 1 - a, c = 1 / TINY, d = 1 / b, h = d;
    for (let i = 1; i < 100000; i++) {
      const an = -i * (i - a);
      b += 2;
      d = an * d + b; if (Math.abs(d) < TINY) d = TINY;
      c = b + an / c; if (Math.abs(c) < TINY) c = TINY;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < 1e-16) break;
    }
    const q = Math.exp(lead) * h;
    return upper ? q : 1 - q;
  }

  /** P(Z > z) for a standard normal Z. */
  function normSf(z) {
    if (Number.isNaN(z)) return NaN;
    const q = 0.5 * gamma(0.5, (z * z) / 2, true);
    return z >= 0 ? q : 1 - q;
  }
  /** P(Z ≤ z). */
  const normCdf = (z) => normSf(-z);

  /** The p-quantile of the standard normal: Acklam's approximation with one Halley step. */
  function normQuantile(p) {
    if (!(p > 0)) return -Infinity;
    if (!(p < 1)) return Infinity;
    const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
    const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    const tail = (q) => (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    let x;
    if (p < 0.02425) x = tail(Math.sqrt(-2 * Math.log(p)));
    else if (p > 1 - 0.02425) x = -tail(Math.sqrt(-2 * Math.log1p(-p)));
    else {
      const q = p - 0.5, r = q * q;
      x = ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
    }
    // In the upper half the error is taken from the upper tail, which keeps its precision.
    const err = p < 0.5 ? normCdf(x) - p : (1 - p) - normSf(x);
    const u = err * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
    return x - u / (1 + (x * u) / 2);
  }

  /** P(T ≤ t) for Student's t with df degrees of freedom. */
  function tCdf(t, df) {
    if (!Number.isFinite(t)) return t > 0 ? 1 : 0;
    const tail = 0.5 * beta(df / (df + t * t), df / 2, 0.5);
    return t >= 0 ? 1 - tail : tail;
  }
  /** P(|T| ≥ |t|): the two-sided p-value of t. */
  const tTwoSided = (t, df) => (Number.isFinite(t) ? beta(df / (df + t * t), df / 2, 0.5) : 0);

  /** The p-quantile of Student's t (0 < p < 1), by bisection on the CDF. */
  function tQuantile(p, df) {
    if (!(df > 0) || !(p > 0 && p < 1)) return NaN;
    let lo = -1e3, hi = 1e3;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      if (tCdf(mid, df) < p) lo = mid; else hi = mid;
      if (hi - lo < 1e-12) break;
    }
    return (lo + hi) / 2;
  }

  /** P(F > f) for the F distribution with d1 and d2 degrees of freedom. */
  const fSf = (f, d1, d2) => (f > 0 ? beta(d2 / (d2 + d1 * f), d2 / 2, d1 / 2) : 1);

  /** P(X > x) for chi-square with k degrees of freedom. */
  const chi2Sf = (x, k) => gamma(k / 2, x / 2, true);

  /** P(K > x) for the Kolmogorov distribution, the limit of sup |Brownian bridge|. */
  function kolmogorovSf(x) {
    if (!(x > 0)) return 1;
    if (x < 1) {
      const k = (Math.PI * Math.PI) / (8 * x * x);
      let s = 0;
      for (let j = 1; j < 200; j += 2) {
        const term = Math.exp(-j * j * k);
        s += term;
        if (term < 1e-22) break;
      }
      return 1 - (Math.sqrt(2 * Math.PI) / x) * s;
    }
    let s = 0;
    for (let j = 1; j < 200; j++) {
      const term = Math.exp(-2 * j * j * x * x);
      s += j % 2 ? term : -term;
      if (term < 1e-300) break;
    }
    return Math.min(1, 2 * s);
  }

  /** A mean's 95% interval from n, mean and the sample standard deviation: mean ± t(0.975, n − 1) · sd / √n. */
  function meanInterval(n, mean, sd) {
    if (!(n >= 2) || !Number.isFinite(sd)) return { lo: null, hi: null };
    const half = tQuantile(0.975, n - 1) * (sd / Math.sqrt(n));
    return { lo: mean - half, hi: mean + half };
  }

  /* ---------- small helpers ---------- */

  /** mulberry32: a small seeded generator of uniform numbers in [0, 1). */
  function random(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Average ranks from 1, ties sharing the mean of their ranks (SciPy's rankdata, method "average"). */
  function ranks(values) {
    const order = values.map((v, i) => i).sort((a, b) => values[a] - values[b]);
    const out = new Array(values.length);
    for (let i = 0; i < order.length;) {
      let j = i;
      while (j + 1 < order.length && values[order[j + 1]] === values[order[i]]) j++;
      for (let k = i; k <= j; k++) out[order[k]] = (i + j) / 2 + 1;
      i = j + 1;
    }
    return out;
  }

  const sorted = (xs) => [...xs].sort((a, b) => a - b);
  /** The median of a sorted list. */
  const medianOf = (s) => (s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN);
  const Z975 = normQuantile(0.975);

  /* ---------- the catalogue ---------- */

  /**
   * T1, Spearman's rank correlation, from the number of complete pairs and rho (the Pearson correlation of average
   * ranks). As SciPy's spearmanr: t = rho √((n − 2) / ((1 + rho)(1 − rho))), two-sided p with n − 2 df. The 95%
   * interval is tanh(atanh(rho) ± 1.96 · SE), SE = √((1 + rho²/2) / (n − 3)) (Bonett and Wright, 2000).
   * @param {{ n: number, rho: number }} s
   */
  function spearman({ n, rho }) {
    const df = n - 2;
    const r = Math.max(-1, Math.min(1, rho));
    const t = Math.abs(r) === 1 ? Math.sign(r) * Infinity : r * Math.sqrt(df / ((r + 1) * (1 - r)));
    const p = tTwoSided(t, df);
    const se = Math.sqrt((1 + (r * r) / 2) / (n - 3));
    const z = Math.atanh(r);
    const ci = Math.abs(r) === 1 ? [r, r] : [Math.tanh(z - Z975 * se), Math.tanh(z + Z975 * se)];
    return { test: "T1", n, statistic: { name: "t", value: t }, df: [df], p, effect: { name: "rho", value: r, ci } };
  }

  /**
   * T2, Welch's two-sample t-test (SciPy's ttest_ind with equal_var=False), first group minus second. Effects: the
   * mean difference with a Welch 95% interval, and Hedges' g with its interval.
   * @param {{ n: number, mean: number, var: number }} a @param {{ n: number, mean: number, var: number }} b
   */
  function welchT(a, b) {
    const va = a.var / a.n, vb = b.var / b.n;
    const se = Math.sqrt(va + vb);
    const diff = a.mean - b.mean;
    const t = diff / se;
    const df = (va + vb) ** 2 / (va ** 2 / (a.n - 1) + vb ** 2 / (b.n - 1));
    const p = tTwoSided(t, df);
    const half = tQuantile(0.975, df) * se;
    return { test: "T2", n: a.n + b.n, statistic: { name: "t", value: t }, df: [df], p, effect: hedges(a, b), difference: { value: diff, ci: [diff - half, diff + half] } };
  }

  /**
   * Hedges' g of the first group against the second, J · d with d over the pooled SD and J = 1 − 3 / (4(n1 + n2) − 9),
   * with a 95% interval from SE = J · √((n1 + n2) / (n1 n2) + d² / (2 (n1 + n2))) (Borenstein et al., 2009).
   * @param {{ n: number, mean: number, var: number }} a @param {{ n: number, mean: number, var: number }} b
   */
  function hedges(a, b) {
    const n = a.n + b.n;
    const sp = Math.sqrt(((a.n - 1) * a.var + (b.n - 1) * b.var) / (n - 2));
    const d = (a.mean - b.mean) / sp;
    const j = 1 - 3 / (4 * n - 9);
    const g = j * d;
    const se = j * Math.sqrt(n / (a.n * b.n) + (d * d) / (2 * n));
    return { name: "Hedges' g", value: g, ci: [g - Z975 * se, g + Z975 * se] };
  }

  /**
   * T3, Welch's one-way ANOVA (statsmodels anova_oneway, use_var="unequal"). Effect: omega-squared.
   * @param {{ n: number, mean: number, var: number }[]} groups
   */
  function welchAnova(groups) {
    const k = groups.length;
    const w = groups.map((g) => g.n / g.var);
    const W = w.reduce((s, x) => s + x, 0);
    const mw = groups.reduce((s, g, i) => s + w[i] * g.mean, 0) / W;
    const between = groups.reduce((s, g, i) => s + w[i] * (g.mean - mw) ** 2, 0) / (k - 1);
    const tmp = groups.reduce((s, g, i) => s + (1 - w[i] / W) ** 2 / (g.n - 1), 0) / (k * k - 1);
    const f = between / (1 + 2 * (k - 2) * tmp);
    const df2 = 1 / (3 * tmp);
    const p = fSf(f, k - 1, df2);
    return { test: "T3", n: groups.reduce((s, g) => s + g.n, 0), statistic: { name: "F", value: f }, df: [k - 1, df2], p, effect: { name: "omega-squared", value: omegaSquared(groups), ci: null } };
  }

  /**
   * Omega-squared from the usual sums of squares, (SSB − (k − 1) MSW) / (SST + MSW), shown as 0 when negative.
   * @param {{ n: number, mean: number, var: number }[]} groups
   */
  function omegaSquared(groups) {
    const k = groups.length;
    const N = groups.reduce((s, g) => s + g.n, 0);
    const grand = groups.reduce((s, g) => s + g.n * g.mean, 0) / N;
    const ssb = groups.reduce((s, g) => s + g.n * (g.mean - grand) ** 2, 0);
    const ssw = groups.reduce((s, g) => s + (g.n > 1 ? (g.n - 1) * g.var : 0), 0);
    const msw = ssw / (N - k);
    const den = ssb + ssw + msw;
    return den > 0 ? Math.max(0, (ssb - (k - 1) * msw) / den) : 0;
  }

  /** Row and column totals of a table of counts. @param {number[][]} t */
  function margins(t) {
    const rows = t.map((r) => r.reduce((s, x) => s + x, 0));
    const cols = t[0].map((_, j) => t.reduce((s, r) => s + r[j], 0));
    return { rows, cols, n: rows.reduce((s, x) => s + x, 0) };
  }

  /** Pearson's chi-square of a table whose margins are all above 0. */
  function chiStatistic(t, m = margins(t)) {
    let x2 = 0;
    for (let i = 0; i < t.length; i++) for (let j = 0; j < t[i].length; j++) {
      const e = (m.rows[i] * m.cols[j]) / m.n;
      x2 += (t[i][j] - e) ** 2 / e;
    }
    return x2;
  }

  /**
   * Bias-corrected Cramér's V (Bergsma, 2013): φ² = X²/n less (r − 1)(c − 1)/(n − 1), over min(r̃, c̃) − 1 with the
   * corrected r̃ = r − (r − 1)²/(n − 1) and c̃ likewise.
   */
  function cramerV(x2, n, r, c) {
    if (!(n > 1) || r < 2 || c < 2) return 0;
    const phi = Math.max(0, x2 / n - ((r - 1) * (c - 1)) / (n - 1));
    const rr = r - (r - 1) ** 2 / (n - 1), cc = c - (c - 1) ** 2 / (n - 1);
    const den = Math.min(rr - 1, cc - 1);
    return den > 0 ? Math.sqrt(phi / den) : 0;
  }

  /**
   * The expected counts rule of T4: n at least 20, every expected count at least 1 and at least 80% of them at
   * least 5. Returns whether it holds and the facts.
   * @param {number[][]} t
   */
  function expectedRule(t) {
    const m = margins(t);
    const e = t.flatMap((r, i) => r.map((_, j) => (m.rows[i] * m.cols[j]) / m.n));
    const min = Math.min(...e);
    const share5 = e.filter((x) => x >= 5).length / e.length;
    return { ok: m.n >= 20 && min >= 1 && share5 >= 0.8, n: m.n, min, share5 };
  }

  /** T4, Pearson's chi-square test of independence without continuity correction (SciPy's chi2_contingency, correction=False). @param {number[][]} t */
  function chiSquare(t) {
    const m = margins(t);
    const x2 = chiStatistic(t, m);
    const df = (t.length - 1) * (t[0].length - 1);
    return { test: "T4", n: m.n, statistic: { name: "chi-square", value: x2 }, df: [df], p: chi2Sf(x2, df), effect: { name: "Cramér's V", value: cramerV(x2, m.n, t.length, t[0].length), ci: null } };
  }

  /**
   * T5, Fisher's exact test of a 2 × 2 table, two-sided: the sum of the hypergeometric probabilities of the tables
   * no more likely than the one observed (relative tolerance 1e-7, as R). Effect: the sample odds ratio ad / bc
   * (SciPy's), with Woolf's 95% interval exp(ln OR ± 1.96 √(1/a + 1/b + 1/c + 1/d)), unbounded when a cell is 0.
   * @param {number[][]} t [[a, b], [c, d]]
   */
  function fisher(t) {
    const [[a, b], [c, d]] = t;
    const n1 = a + b, n2 = c + d, n = a + c, N = n1 + n2;
    const lo = Math.max(0, n - n2), hi = Math.min(n, n1);
    const lp = (x) => lchoose(n1, x) + lchoose(n2, n - x) - lchoose(N, n);
    const obs = lp(a);
    let p = 0;
    for (let x = lo; x <= hi; x++) {
      const v = lp(x);
      if (v <= obs + Math.log1p(1e-7)) p += Math.exp(v);
    }
    const or = c > 0 && b > 0 ? (a * d) / (c * b) : a === 0 || d === 0 ? NaN : Infinity;
    const ci = a > 0 && b > 0 && c > 0 && d > 0
      ? [Math.exp(Math.log(or) - Z975 * Math.sqrt(1 / a + 1 / b + 1 / c + 1 / d)), Math.exp(Math.log(or) + Z975 * Math.sqrt(1 / a + 1 / b + 1 / c + 1 / d))]
      : [0, Infinity];
    const m = margins(t);
    return { test: "T5", n: N, statistic: { name: "odds ratio", value: or }, df: [], p: Math.min(1, p), effect: { name: "odds ratio", value: or, ci },
      v: cramerV(chiStatistic(t, m), N, 2, 2) };
  }

  /**
   * A hypergeometric draw by inversion from the mode: x successes in n draws from N items of which K are successes.
   * @param {() => number} u
   */
  function hypergeometric(u, N, K, n) {
    const lo = Math.max(0, n - (N - K)), hi = Math.min(n, K);
    if (lo >= hi) return lo;
    const m = Math.min(hi, Math.max(lo, Math.floor(((n + 1) * (K + 1)) / (N + 2))));
    const pm = Math.exp(lchoose(K, m) + lchoose(N - K, n - m) - lchoose(N, n));
    let left = u() - pm;
    if (left <= 0) return m;
    let down = m, up = m, pd = pm, pu = pm;
    while (down > lo || up < hi) {
      if (down > lo) {
        pd *= (down * (N - K - n + down)) / ((K - down + 1) * (n - down + 1));
        down -= 1;
        if ((left -= pd) <= 0) return down;
      }
      if (up < hi) {
        pu *= ((K - up) * (n - up)) / ((up + 1) * (N - K - n + up + 1));
        up += 1;
        if ((left -= pu) <= 0) return up;
      }
    }
    return m;
  }

  /**
   * A random table with the given row and column totals, as a random permutation of one field against the other
   * would give: each row a multivariate hypergeometric draw from what the columns have left.
   * @param {number[]} rows @param {number[]} cols @param {() => number} u
   */
  function randomTable(rows, cols, u) {
    const left = cols.slice();
    let pool = left.reduce((s, x) => s + x, 0);
    const out = [];
    for (let i = 0; i < rows.length - 1; i++) {
      const row = new Array(cols.length).fill(0);
      let need = rows[i], rest = pool;
      for (let j = 0; j < cols.length - 1 && need > 0; j++) {
        const x = hypergeometric(u, rest, left[j], need);
        row[j] = x;
        need -= x;
        rest -= left[j];
      }
      row[cols.length - 1] += need;
      for (let j = 0; j < cols.length; j++) left[j] -= row[j];
      pool -= rows[i];
      out.push(row);
    }
    out.push(left);
    return out;
  }

  /**
   * T6, a permutation test of independence for an r × c table: R random tables with the observed margins (each as
   * one random permutation of a field's values against the other's), seeded; p = (b + 1) / (R + 1), b the tables
   * whose chi-square is at least the observed one; its Monte Carlo standard error √(p (1 − p) / R).
   * @param {number[][]} t @param {{ seed: number, permutations?: number }} o
   */
  function permutation(t, o) {
    const R = o.permutations ?? 10000;
    const m = margins(t);
    const x2 = chiStatistic(t, m);
    const u = random(o.seed);
    let b = 0;
    for (let i = 0; i < R; i++) if (chiStatistic(randomTable(m.rows, m.cols, u), m) >= x2 * (1 - 1e-12)) b += 1;
    const p = (b + 1) / (R + 1);
    return { test: "T6", n: m.n, statistic: { name: "chi-square", value: x2 }, df: [], p, seed: o.seed, permutations: R, exceed: b, mcse: Math.sqrt((p * (1 - p)) / R),
      effect: { name: "Cramér's V", value: cramerV(x2, m.n, t.length, t[0].length), ci: null } };
  }

  /**
   * Mann–Kendall's S, its variance with ties, Kendall's tau-a and Sen's slope (the median of pairwise slopes) of a
   * series in time order, as pymannkendall computes them.
   * @param {number[]} x
   */
  function kendall(x) {
    const n = x.length;
    let s = 0;
    const slopes = [];
    for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) {
      s += Math.sign(x[j] - x[i]);
      slopes.push((x[j] - x[i]) / (j - i));
    }
    const counts = new Map();
    for (const v of x) counts.set(v, (counts.get(v) ?? 0) + 1);
    let ties = 0;
    for (const t of counts.values()) ties += t * (t - 1) * (2 * t + 5);
    slopes.sort((a, b) => a - b);
    return { n, s, varS: (n * (n - 1) * (2 * n + 5) - ties) / 18, tau: n > 1 ? s / (0.5 * n * (n - 1)) : 0, slopes, slope: medianOf(slopes) };
  }

  /** The autocorrelations of a series at lags 0 to n − 1 (pymannkendall's __acf). */
  function acf(x) {
    const n = x.length;
    const mean = x.reduce((s, v) => s + v, 0) / n;
    const y = x.map((v) => v - mean);
    const out = [];
    for (let k = 0; k < n; k++) {
      let s = 0;
      for (let i = 0; i + k < n; i++) s += y[i] * y[i + k];
      out.push(s / n);
    }
    return out.map((v) => v / out[0]);
  }

  /**
   * T7, the Mann–Kendall trend test with the Hamed–Rao (1998) variance correction, as pymannkendall's
   * hamed_rao_modification_test with lag=3: the series detrended by Sen's slope, its ranks' autocorrelations at lags
   * 1 to 3 that lie outside ±1.96/√n correct the variance of S. The correction only ever widens the variance: with
   * every lag, or with a factor below 1, the test rejects 8% of series without a trend at the 5% level (catalog.md).
   * Effects: Kendall's tau and Sen's slope a period, with Gilbert's (1987) 95% interval from the corrected variance.
   * @param {number[]} x
   */
  function mannKendall(x, lags = 3) {
    const n = x.length;
    const k = kendall(x);
    const rho = acf(ranks(x.map((v, i) => v - (i + 1) * k.slope)));
    const bound = Z975 / Math.sqrt(n);
    let sum = 0;
    for (let lag = 1; lag <= Math.min(lags, n - 1); lag++) if (Math.abs(rho[lag]) > bound) sum += (n - lag) * (n - lag - 1) * (n - lag - 2) * rho[lag];
    const factor = Math.max(1, 1 + (2 / (n * (n - 1) * (n - 2))) * sum);
    const varS = k.varS * factor;
    if (!(varS > 0)) return { test: "T7", n, failed: "The series has no variance." };
    const z = k.s > 0 ? (k.s - 1) / Math.sqrt(varS) : k.s < 0 ? (k.s + 1) / Math.sqrt(varS) : 0;
    const N = k.slopes.length, C = Z975 * Math.sqrt(varS);
    const at = (i) => k.slopes[Math.min(N - 1, Math.max(0, i))];
    return { test: "T7", n, statistic: { name: "z", value: z }, df: [], p: 2 * normSf(Math.abs(z)), s: k.s, varS, factor, lags,
      effect: { name: "Kendall's tau", value: k.tau, ci: null }, slope: { value: k.slope, ci: [at(Math.round((N - C) / 2) - 1), at(Math.round((N + C) / 2))] } };
  }

  /** The Bartlett-weighted long-run variance of a centred series with bandwidth L. */
  function longRunVariance(e, L) {
    const n = e.length;
    const g = (j) => { let s = 0; for (let i = 0; i + j < n; i++) s += e[i] * e[i + j]; return s / n; };
    let v = g(0);
    for (let j = 1; j <= L; j++) v += 2 * (1 - j / (L + 1)) * g(j);
    return v;
  }

  /**
   * T8, a level shift: the CUSUM of the centred series, max |S_k| / √(n σ²), with σ² the Bartlett long-run variance
   * of bandwidth floor(4 (n/100)^(2/9)); p from the Kolmogorov distribution (the limit of sup |Brownian bridge|).
   * Effect: the largest shift, after the period where |S_k| peaks, as the difference of the means after and before,
   * also in long-run SDs of the series about those two means (the noise, without the shift).
   * @param {number[]} x
   */
  function levelShift(x) {
    const n = x.length;
    const mean = x.reduce((s, v) => s + v, 0) / n;
    const e = x.map((v) => v - mean);
    const L = Math.floor(4 * (n / 100) ** (2 / 9));
    const lrv = longRunVariance(e, L);
    let s = 0, peak = 0, at = 1;
    for (let k = 1; k < n; k++) {
      s += e[k - 1];
      if (Math.abs(s) > peak) { peak = Math.abs(s); at = k; }
    }
    if (!(lrv > 0)) return { test: "T8", n, failed: "The series has no variance." };
    const stat = peak / Math.sqrt(n * lrv);
    const before = x.slice(0, at), after = x.slice(at);
    const mb = before.reduce((a, v) => a + v, 0) / before.length, ma = after.reduce((a, v) => a + v, 0) / after.length;
    const resid = x.map((v, i) => v - (i < at ? mb : ma));
    const noise = longRunVariance(resid, L);
    const shift = ma - mb;
    return { test: "T8", n, statistic: { name: "CUSUM", value: stat }, df: [], p: kolmogorovSf(stat), bandwidth: L, lrv,
      effect: { name: "shift in long-run SD", value: noise > 0 ? Math.abs(shift) / Math.sqrt(noise) : Infinity, ci: null }, shift: { value: shift, at, before: mb, after: ma } };
  }

  /**
   * Benjamini–Yekutieli adjusted p-values (SciPy's false_discovery_control, method="by"): p(k) · m · c(m) / k with
   * c(m) = Σ 1/i, made monotone from the largest down and capped at 1.
   * @param {number[]} ps
   */
  function by(ps) {
    const m = ps.length;
    if (!m) return [];
    let cm = 0;
    for (let i = 1; i <= m; i++) cm += 1 / i;
    const order = ps.map((p, i) => i).sort((a, b) => ps[a] - ps[b] || a - b);
    const out = new Array(m);
    let min = Infinity;
    for (let k = m; k >= 1; k--) {
      const i = order[k - 1];
      min = Math.min(min, (ps[i] * m * cm) / k);
      out[i] = Math.min(1, Math.max(0, min));
    }
    return out;
  }

  /* ---------- descriptive measures the ranking reads ---------- */

  /**
   * The shape of one measure: sample skewness G1 and excess kurtosis G2 (the engine's skewness and kurtosis), the
   * bimodality coefficient (G1² + 1) / (G2 + 3 (n − 1)² / ((n − 2)(n − 3))), and the share of values with robust z
   * above 3.5.
   * @param {{ n: number, skew: number | null, kurt: number | null, rare: number }} s
   */
  function shape(s) {
    const g = s.skew ?? 0, k = s.kurt ?? 0;
    const bc = s.n > 3 && s.skew !== null && s.kurt !== null ? (g * g + 1) / (k + (3 * (s.n - 1) ** 2) / ((s.n - 2) * (s.n - 3))) : null;
    return { n: s.n, skew: s.skew, kurt: s.kurt, bc, rare: s.n > 0 ? s.rare / s.n : 0, rareCount: s.rare };
  }

  /**
   * How rare a category's rarest level is: 1 − k · p_min, k levels with p_min the share of the smallest; 0 when
   * the levels are even, near 1 when one level holds a small part of an even share.
   * @param {{ level: string, n: number }[]} levels
   */
  function rarity(levels) {
    const n = levels.reduce((s, l) => s + l.n, 0);
    const k = levels.length;
    if (!(n > 0) || k < 2) return { k, n, value: 0, rarest: null };
    const rarest = levels.reduce((a, l) => (l.n < a.n || (l.n === a.n && String(l.level) < String(a.level)) ? l : a));
    return { k, n, value: Math.max(0, 1 - (k * rarest.n) / n), rarest: { level: rarest.level, n: rarest.n, share: rarest.n / n } };
  }

  return { lgamma, lchoose, beta, gamma, normSf, normCdf, normQuantile, tCdf, tTwoSided, tQuantile, fSf, chi2Sf, kolmogorovSf, meanInterval,
    random, ranks, medianOf, sorted, margins, chiStatistic, cramerV, expectedRule, spearman, welchT, welchAnova, chiSquare, fisher, hedges, omegaSquared,
    hypergeometric, randomTable, permutation, kendall, acf, mannKendall, longRunVariance, levelShift, by, shape, rarity };
});
