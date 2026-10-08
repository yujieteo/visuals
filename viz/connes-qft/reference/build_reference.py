"""Independent reference values for the Connes QFT laboratory, in pure Python (standard library only).

Each value is computed here by a different method from the JavaScript engine (Simpson's rule instead
of Gauss-Legendre, closed-form Laurent coefficients instead of series arithmetic, exact rational
arithmetic for the Birkhoff recursion, Mandelstam closed forms instead of explicit spinors), so
agreement is a genuine cross-check. tests/reference.test.mjs compares the engine with the stored
values; tests/test_reference.py checks that reference.json is what this script produces.

    python reference/build_reference.py           write reference/reference.json
    python reference/build_reference.py --check   fail if reference.json is stale
"""

import json
import math
import sys
from fractions import Fraction
from pathlib import Path

HERE = Path(__file__).resolve().parent
ALPHA = 1 / 137.035999177  # CODATA 2022
ME = 0.51099895069  # MeV, CODATA 2022
MMU = 105.6583755  # MeV, CODATA 2022
MZ = 91188.0  # MeV, PDG 2024
EULER = 0.5772156649015329


def simpson(f, a, b, n=2000):
    if n % 2:
        n += 1
    h = (b - a) / n
    s = f(a) + f(b)
    for i in range(1, n):
        s += (4 if i % 2 else 2) * f(a + i * h)
    return s * h / 3


def rnd(x, digits=12):
    return float(f"{x:.{digits}g}")


# ---------- one-loop vacuum polarization, d = 4 - eps ----------
def vacuum_polarization(Q2, mu, alpha=ALPHA, m=ME):
    """Laurent coefficients a_-1, a_0, a_1 of Pi_2 = -(e^2/2 pi^2) int x(1-x) Gamma(eps/2) X^(eps/2),
    X = 4 pi mu^2 / Delta, using Gamma(eps/2) = 2/eps - gamma + c1 eps with c1 = (gamma^2 + pi^2/6)/4."""
    e2 = 4 * math.pi * alpha
    c1 = (EULER ** 2 + math.pi ** 2 / 6) / 4
    q2 = -Q2

    def logX(x):
        return math.log(4 * math.pi * mu * mu / (m * m - x * (1 - x) * q2))

    pre = -e2 / (2 * math.pi ** 2)
    am1 = pre * simpson(lambda x: x * (1 - x) * 2, 0, 1)
    a0 = pre * simpson(lambda x: x * (1 - x) * (logX(x) - EULER), 0, 1)
    a1 = pre * simpson(lambda x: x * (1 - x) * (logX(x) ** 2 / 4 - EULER * logX(x) / 2 + c1), 0, 1)
    msbar = (2 * alpha / math.pi) * simpson(lambda x: x * (1 - x) * math.log((m * m - x * (1 - x) * q2) / (mu * mu)), 0, 1)
    return {"Q2": Q2, "mu": mu, "a_minus1": rnd(am1), "a0": rnd(a0), "a1": rnd(a1), "msbar": rnd(msbar)}


# ---------- tree-level e mu -> e mu, Mandelstam closed form ----------
def emu(sqrt_s, theta, alpha=ALPHA, m=ME, M=MMU):
    s = sqrt_s ** 2
    p = math.sqrt((s - (m + M) ** 2) * (s - (m - M) ** 2)) / (2 * sqrt_s)
    E1, E2 = math.hypot(p, m), math.hypot(p, M)
    t = -2 * p * p * (1 - math.cos(theta))
    u = (E1 - E2) ** 2 - 2 * p * p * (1 + math.cos(theta))
    e4 = (4 * math.pi * alpha) ** 2
    S = m * m + M * M
    avg = 2 * e4 / t ** 2 * ((s - S) ** 2 + (u - S) ** 2 + 2 * t * S)
    return {"sqrtS": sqrt_s, "theta": theta, "t": rnd(t), "u": rnd(u), "avg": rnd(avg)}


# ---------- vertex form factor and Uehling ----------
def F2(q2, alpha=ALPHA, m=ME):
    return rnd(alpha / (2 * math.pi) * simpson(lambda u: m * m / (m * m - q2 * u * (1 - u)), 0, 1))


def uehling(mr, alpha=ALPHA):
    def g(s):
        u = math.cosh(s)
        return math.exp(-2 * mr * u) * (1 + 1 / (2 * u * u)) * math.sqrt(u * u - 1) / (u * u) * math.sinh(s)

    smax = math.acosh(1 + 40 / (2 * mr)) + 1
    return rnd(2 * alpha / (3 * math.pi) * simpson(g, 0, smax, 20000))


# ---------- toy Birkhoff decomposition, exact rationals ----------
class Laurent:
    """Exact Laurent series in eps with Fraction coefficients, truncated at order N."""

    N = 8

    def __init__(self, coeffs):
        self.c = {k: Fraction(v) for k, v in coeffs.items() if v != 0 and k <= self.N}

    def __add__(self, o):
        r = dict(self.c)
        for k, v in o.c.items():
            r[k] = r.get(k, 0) + v
        return Laurent(r)

    def __neg__(self):
        return Laurent({k: -v for k, v in self.c.items()})

    def __mul__(self, o):
        r = {}
        for i, a in self.c.items():
            for j, b in o.c.items():
                r[i + j] = r.get(i + j, 0) + a * b
        return Laurent(r)

    def pole(self):
        return Laurent({k: v for k, v in self.c.items() if k < 0})

    def regular(self):
        return Laurent({k: v for k, v in self.c.items() if k >= 0})


def toy_tree(size, factorial, L):
    """phi(T) = exp(-|T| eps L) / (T! eps^|T|) with L rational."""
    coeffs = {}
    for n in range(0, Laurent.N + size + 1):
        coeffs[n - size] = Fraction((-size * L) ** n) / math.factorial(n) / factorial
    return Laurent(coeffs)


def birkhoff_ladder(n, L):
    """Ladder trees l_1 .. l_n: Delta(l_k) = l_k x 1 + 1 x l_k + sum_j l_j x l_{k-j} (cuts of a chain)."""
    phi = {k: toy_tree(k, math.factorial(k), L) for k in range(1, n + 1)}
    minus, plus = {}, {}
    for k in range(1, n + 1):
        bar = phi[k]
        for j in range(1, k):
            bar = bar + minus[j] * phi[k - j]
        minus[k] = -bar.pole()
        plus[k] = bar.regular()
    return minus, plus


def birkhoff_cherry(L):
    """Tree with a root and two leaves (size 3, tree factorial 3): cuts give 2 (l_1 x l_2) + l_1 l_1 x l_1."""
    l1 = toy_tree(1, 1, L)
    l2 = toy_tree(2, 2, L)
    t = toy_tree(3, 3, L)
    m1 = -l1.pole()
    bar = t + Laurent({0: 2}) * m1 * l2 + m1 * m1 * l1
    return -bar.pole(), bar.regular()


def frac_text(f):
    return f"{f.numerator}/{f.denominator}" if f.denominator != 1 else str(f.numerator)


def toy_values(L):
    minus, plus = birkhoff_ladder(3, L)
    cm, cp = birkhoff_cherry(L)
    return {
        "L": frac_text(L),
        "sigma1": {"renormalized": frac_text(plus[1].c.get(0, Fraction(0))), "counterterm": {str(k): frac_text(v) for k, v in sorted(minus[1].c.items())}},
        "sigma2_rainbow": {"renormalized": frac_text(plus[2].c.get(0, Fraction(0))), "counterterm": {str(k): frac_text(v) for k, v in sorted(minus[2].c.items())}},
        "sigma3_rainbow": {"renormalized": frac_text(plus[3].c.get(0, Fraction(0))), "counterterm": {str(k): frac_text(v) for k, v in sorted(minus[3].c.items())}},
        "sigma3_double": {"renormalized": frac_text(cp.c.get(0, Fraction(0))), "counterterm": {str(k): frac_text(v) for k, v in sorted(cm.c.items())}},
        # the crossed self-energy is twice a two-ladder (its two maximal forests)
        "sigma2_crossed": {"renormalized": frac_text(2 * plus[2].c.get(0, Fraction(0))), "counterterm": {str(k): frac_text(2 * v) for k, v in sorted(minus[2].c.items())}},
    }


# ---------- finite spectral and operator models ----------
def product_spectrum(N, m):
    h = 2 * math.pi / N
    mus = [(2 / h) * abs(math.sin(math.pi * k / N)) for k in range(N)]
    vals = []
    for u in mus:
        v = math.sqrt(u * u + m * m)
        vals += [v, v, -v, -v]
    return [rnd(x) for x in sorted(vals)]


def circle_action(Lam, a):
    return rnd(sum(math.exp(-(((n + a) / Lam) ** 2)) for n in range(-400, 401)))


def build():
    return {
        "vacuum_polarization": [vacuum_polarization(4 * ME * ME, ME), vacuum_polarization(3 * ME * ME, 2 * ME), vacuum_polarization(100 * ME * ME, 10 * ME)],
        "emu": [emu(300, 1.0), emu(250, 2.1), emu(1000, 0.3)],
        "F2": [{"q2_over_m2": x, "F2": F2(x * ME * ME)} for x in (0, -1, -4)],
        "uehling": [{"mr": x, "correction": uehling(x)} for x in (0.05, 0.5, 2.0)],
        "alpha_inverse_at_mZ_one_loop_electron": rnd(137.035999177 - (2 / (3 * math.pi)) * math.log(MZ / ME)),
        "toy_birkhoff": toy_values(Fraction(1, 2)),
        "tomita_delta_spectrum": [rnd(a / b) for a in (0.5, 0.3, 0.2) for b in (0.5, 0.3, 0.2)],
        "product_spectrum": {"N": 6, "m": 0.7, "values": product_spectrum(6, 0.7)},
        "circle_spectral_action": {"Lambda": 2.5, "a": 0.3, "value": circle_action(2.5, 0.3)},
    }


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    text = json.dumps(build(), indent=1, sort_keys=True) + "\n"
    out = HERE / "reference.json"
    if "--check" in argv:
        if not out.exists() or out.read_text(encoding="utf-8") != text:
            print("reference/reference.json is stale; run python reference/build_reference.py", file=sys.stderr)
            return 1
        return 0
    out.write_text(text, encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
