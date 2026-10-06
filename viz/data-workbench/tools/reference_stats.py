#!/usr/bin/env python3
"""Write tests/fixtures/stats-reference.json: reference values for test catalogue v1 (catalog.md), computed by
SciPy, statsmodels and pymannkendall, so the folder's Node checks compare the page's statistics with them.

Not a test: the checks read the committed JSON and need no Python packages. Run it again only when a case or
a pinned version changes, in a scratch environment with the versions below:

    python3 -m venv /tmp/dw-ref && /tmp/dw-ref/bin/pip install scipy==1.13.1 statsmodels==0.14.6 pymannkendall==1.4.3 numpy==2.0.2
    /tmp/dw-ref/bin/python tools/reference_stats.py

Each dataset is generated here from a fixed seed and stored in the JSON with its expected values. Where no
library computes a value (the Bonett–Wright interval of rho, Hedges' g and its interval, omega-squared, the
bias-corrected Cramér's V, Gilbert's interval of Sen's slope, the CUSUM statistic), it is written out below from
its published formula, apart from the page's JavaScript.
"""
import json
import math
import sys
from pathlib import Path

import numpy as np
import pymannkendall
import scipy
import statsmodels
from scipy import special, stats
from statsmodels.stats.oneway import anova_oneway

HERE = Path(__file__).resolve().parent.parent
OUT = HERE / "tests" / "fixtures" / "stats-reference.json"
PINNED = {"scipy": "1.13.1", "statsmodels": "0.14.6", "pymannkendall": "1.4.3", "numpy": "2.0.2"}
Z = stats.norm.ppf(0.975)


def num(x):
    """A float for JSON: infinities and NaN as strings, which the checks read back."""
    x = float(x)
    if math.isnan(x):
        return "NaN"
    if math.isinf(x):
        return "Infinity" if x > 0 else "-Infinity"
    return x


def nums(xs):
    return [num(x) for x in xs]


def spearman_case(name, x, y):
    r = stats.spearmanr(x, y)
    n = len(x)
    se = math.sqrt((1 + r.statistic ** 2 / 2) / (n - 3))
    z = math.atanh(r.statistic)
    return {"name": name, "x": nums(x), "y": nums(y), "n": n, "rho": num(r.statistic), "p": num(r.pvalue),
            "ci": [num(math.tanh(z - Z * se)), num(math.tanh(z + Z * se))]}


def welch_case(name, a, b):
    r = stats.ttest_ind(a, b, equal_var=False)
    na, nb = len(a), len(b)
    va, vb = np.var(a, ddof=1), np.var(b, ddof=1)
    diff = np.mean(a) - np.mean(b)
    se = math.sqrt(va / na + vb / nb)
    df = (va / na + vb / nb) ** 2 / ((va / na) ** 2 / (na - 1) + (vb / nb) ** 2 / (nb - 1))
    half = stats.t.ppf(0.975, df) * se
    n = na + nb
    sp = math.sqrt(((na - 1) * va + (nb - 1) * vb) / (n - 2))
    d = diff / sp
    j = 1 - 3 / (4 * n - 9)
    g = j * d
    seg = j * math.sqrt(n / (na * nb) + d * d / (2 * n))
    return {"name": name, "a": nums(a), "b": nums(b), "t": num(r.statistic), "df": num(df), "p": num(r.pvalue),
            "difference": num(diff), "differenceCi": [num(diff - half), num(diff + half)], "g": num(g), "gCi": [num(g - Z * seg), num(g + Z * seg)]}


def anova_case(name, groups):
    r = anova_oneway(groups, use_var="unequal", welch_correction=True)
    ns = np.array([len(g) for g in groups])
    means = np.array([np.mean(g) for g in groups])
    variances = np.array([np.var(g, ddof=1) for g in groups])
    big_n, k = ns.sum(), len(groups)
    grand = (ns * means).sum() / big_n
    ssb = (ns * (means - grand) ** 2).sum()
    ssw = ((ns - 1) * variances).sum()
    msw = ssw / (big_n - k)
    omega = max(0.0, (ssb - (k - 1) * msw) / (ssb + ssw + msw))
    return {"name": name, "groups": [nums(g) for g in groups], "f": num(r.statistic), "df": [num(r.df[0]), num(r.df[1])], "p": num(r.pvalue), "omega": num(omega)}


def cramer_v(x2, n, r, c):
    phi = max(0.0, x2 / n - (r - 1) * (c - 1) / (n - 1))
    rr = r - (r - 1) ** 2 / (n - 1)
    cc = c - (c - 1) ** 2 / (n - 1)
    return math.sqrt(phi / min(rr - 1, cc - 1))


def chi_case(name, table):
    t = np.array(table)
    r = stats.chi2_contingency(t, correction=False)
    return {"name": name, "table": table, "x2": num(r.statistic), "df": int(r.dof), "p": num(r.pvalue),
            "v": num(cramer_v(r.statistic, t.sum(), *t.shape)), "minExpected": num(r.expected_freq.min())}


def fisher_case(name, table):
    r = stats.fisher_exact(table)
    ci = stats.contingency.odds_ratio(table, kind="sample").confidence_interval(0.95)
    return {"name": name, "table": table, "oddsRatio": num(r.statistic), "p": num(r.pvalue), "ci": [num(ci.low), num(ci.high)]}


def permutation_case(name, table, draws, seed):
    """The permutation p-value estimated with many more random tables than the page draws (Patefield's algorithm)."""
    t = np.array(table)
    x2 = stats.chi2_contingency(t, correction=False).statistic
    tables = stats.random_table(t.sum(axis=1), t.sum(axis=0), seed=seed).rvs(draws)
    rows, cols = t.sum(axis=1), t.sum(axis=0)
    expected = np.outer(rows, cols) / t.sum()
    sims = (((tables - expected) ** 2) / expected).sum(axis=(1, 2))
    p = float(np.mean(sims >= x2 * (1 - 1e-12)))
    return {"name": name, "table": table, "x2": num(x2), "p": num(p), "draws": draws, "se": num(math.sqrt(p * (1 - p) / draws)),
            "v": num(cramer_v(x2, t.sum(), *t.shape))}


def gilbert_ci(x, var_s):
    n = len(x)
    slopes = np.sort([(x[j] - x[i]) / (j - i) for i in range(n - 1) for j in range(i + 1, n)])
    big_n = len(slopes)
    c = Z * math.sqrt(var_s)
    lo = int(min(big_n - 1, max(0, round((big_n - c) / 2) - 1)))
    hi = int(min(big_n - 1, max(0, round((big_n + c) / 2))))
    return [num(slopes[lo]), num(slopes[hi])]


def kendall_case(name, x):
    """Hamed–Rao with the autocorrelations of lags 1 to 3; a correction that would narrow the variance is not made,
    which leaves the original test's values."""
    r = pymannkendall.hamed_rao_modification_test(x, lag=3)
    plain = pymannkendall.original_test(x)
    if r.var_s < plain.var_s:
        r = plain
    return {"name": name, "x": nums(x), "p": num(r.p), "z": num(r.z), "tau": num(r.Tau), "s": num(r.s), "varS": num(r.var_s),
            "slope": num(r.slope), "slopeCi": gilbert_ci(np.asarray(x, dtype=float), r.var_s)}


def bartlett_lrv(e, bandwidth):
    n = len(e)
    v = float(np.dot(e, e) / n)
    for j in range(1, bandwidth + 1):
        v += 2 * (1 - j / (bandwidth + 1)) * float(np.dot(e[:-j], e[j:]) / n)
    return v


def shift_case(name, x):
    """CUSUM of the centred series over √(n · Bartlett long-run variance), p from the Kolmogorov distribution."""
    x = np.asarray(x, dtype=float)
    n = len(x)
    e = x - x.mean()
    bandwidth = int(math.floor(4 * (n / 100) ** (2 / 9)))
    lrv = bartlett_lrv(e, bandwidth)
    cusum = np.cumsum(e)[:-1]
    at = int(np.argmax(np.abs(cusum))) + 1
    stat = float(np.abs(cusum).max() / math.sqrt(n * lrv))
    before, after = x[:at].mean(), x[at:].mean()
    resid = np.concatenate([x[:at] - before, x[at:] - after])
    return {"name": name, "x": nums(x), "statistic": num(stat), "p": num(special.kolmogorov(stat)), "bandwidth": bandwidth, "at": at,
            "shift": num(after - before), "shiftSd": num(abs(after - before) / math.sqrt(bartlett_lrv(resid, bandwidth)))}


def shape_case(name, x):
    x = np.asarray(x, dtype=float)
    return {"name": name, "x": nums(x), "skew": num(stats.skew(x, bias=False)), "kurt": num(stats.kurtosis(x, bias=False))}


def main():
    versions = {"scipy": scipy.__version__, "statsmodels": statsmodels.__version__, "pymannkendall": pymannkendall.__version__, "numpy": np.__version__}
    if versions != PINNED:
        sys.exit(f"reference_stats.py: expected {PINNED}, found {versions}")
    rng = np.random.default_rng(20261006)
    x40 = rng.normal(size=40)
    y40 = np.round(0.6 * x40 + rng.normal(size=40), 1)
    x200 = rng.uniform(0, 10, size=200)
    ar = [0.0]
    for _ in range(59):
        ar.append(0.6 * ar[-1] + rng.normal())
    sparse = [[3, 0, 1], [0, 4, 0], [1, 1, 2]]
    out = {
        "about": "Reference values for the Universal Data Workbench's test catalogue v1, written by tools/reference_stats.py.",
        "versions": versions,
        "seed": 20261006,
        "distributions": {
            "normSf": [[z, num(stats.norm.sf(z))] for z in (-2.5, 0.0, 1.0, 1.96, 3.5, 8.0, 12.0)],
            "normQuantile": [[p, num(stats.norm.ppf(p))] for p in (1e-12, 1e-4, 0.025, 0.3, 0.5, 0.975, 0.999999)],
            "tTwoSided": [[t, df, num(2 * stats.t.sf(abs(t), df))] for t, df in ((0.5, 3), (2.0, 10), (4.2, 7.5), (12.0, 1999), (40.0, 30))],
            "tQuantile": [[p, df, num(stats.t.ppf(p, df))] for p, df in ((0.975, 1), (0.975, 4), (0.975, 29.3), (0.975, 1000))],
            "fSf": [[f, d1, d2, num(stats.f.sf(f, d1, d2))] for f, d1, d2 in ((0.8, 2, 20), (3.0, 4, 37.2), (25.0, 11, 300.5), (120.0, 5, 50))],
            "chi2Sf": [[x, k, num(stats.chi2.sf(x, k))] for x, k in ((0.5, 1), (10.0, 3), (40.0, 12), (300.0, 20))],
            "kolmogorovSf": [[x, num(special.kolmogorov(x))] for x in (0.3, 0.5, 0.8, 1.0, 1.36, 2.0, 3.5)],
        },
        "spearman": [
            spearman_case("40 pairs with ties", x40, y40),
            spearman_case("12 weak pairs", rng.normal(size=12), rng.normal(size=12)),
            spearman_case("200 pairs, monotone and curved", x200, np.round(np.exp(x200 / 3) + rng.normal(scale=2, size=200), 2)),
        ],
        "welch": [
            welch_case("8 against 15, unequal spread", rng.normal(10, 1, size=8), rng.normal(11, 3, size=15)),
            welch_case("40 against 60", rng.normal(50, 10, size=40), rng.normal(55, 8, size=60)),
        ],
        "anova": [
            anova_case("3 groups, unequal spread", [rng.normal(0, 1, size=10), rng.normal(0.8, 2, size=15), rng.normal(0.2, 0.5, size=20)]),
            anova_case("6 groups", [rng.normal(m, s, size=n) for m, s, n in ((5, 1, 12), (5.5, 1.5, 9), (4.8, 1, 30), (6, 2, 14), (5.2, 0.7, 25), (5, 1.1, 18))]),
            anova_case("4 groups of 30 or more", [rng.normal(m, s, size=n) for m, s, n in ((10, 2, 30), (11, 3, 42), (10.5, 1.5, 35), (12, 2.5, 31))]),
        ],
        "chiSquare": [
            chi_case("3 by 4", [[20, 15, 30, 10], [25, 30, 20, 15], [10, 20, 25, 30]]),
            chi_case("2 by 2, no continuity correction", [[30, 20], [15, 35]]),
            chi_case("5 by 3", [[12, 8, 10], [9, 14, 7], [11, 10, 12], [6, 9, 15], [13, 7, 9]]),
        ],
        "fisher": [
            fisher_case("8 2 1 5", [[8, 2], [1, 5]]),
            fisher_case("a zero cell", [[0, 5], [7, 3]]),
            fisher_case("12 5 3 9", [[12, 5], [3, 9]]),
        ],
        "permutation": [
            permutation_case("3 by 3, sparse", sparse, 400000, 7),
            permutation_case("2 by 4, sparse", [[5, 1, 0, 2], [1, 4, 3, 0]], 400000, 8),
        ],
        "mannKendall": [
            kendall_case("24 periods, trend and autocorrelation", np.round(np.arange(24) * 0.3 + np.array(ar[:24]), 3)),
            kendall_case("40 periods, no trend", np.round(rng.normal(size=40), 3)),
            kendall_case("15 periods with ties", [3, 4, 4, 5, 3, 6, 6, 7, 5, 8, 8, 8, 9, 7, 10]),
            kendall_case("30 periods, alternating", np.round(np.array([(-1) ** i for i in range(30)]) * 0.8 + rng.normal(size=30) * 0.3, 3)),
        ],
        "levelShift": [
            shift_case("60 periods, shift after 35", np.round(np.concatenate([rng.normal(200, 3, size=35), rng.normal(207, 3, size=25)]), 2)),
            shift_case("60 periods, AR(1), no shift", np.round(ar, 3)),
            shift_case("30 periods, no shift", np.round(rng.normal(0, 1, size=30), 3)),
        ],
        "by": {"p": nums(np.concatenate([rng.uniform(0, 0.02, size=6), [0.01, 0.01], rng.uniform(0, 1, size=12)]))},
        "shape": [shape_case("lognormal", np.round(rng.lognormal(3, 0.5, size=300), 2)), shape_case("two modes", np.round(np.concatenate([rng.normal(0, 1, 150), rng.normal(5, 1, 150)]), 3))],
    }
    out["by"]["adjusted"] = nums(stats.false_discovery_control(np.array(out["by"]["p"], dtype=float), method="by"))
    OUT.write_text(json.dumps(out, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(HERE)}")


if __name__ == "__main__":
    main()
