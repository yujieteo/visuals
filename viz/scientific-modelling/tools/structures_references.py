"""Independent reference values for the structures families of piece 5 (src/structures.js).

The page's engine is its own JavaScript. This script recomputes, with other software:

  elastica  λ = 4K(sin²(θ0/2))² of the perfect pinned elastica at six end rotations (mpmath, 30 digits), and the
            end rotation of the eccentric column at four loads (SciPy solve_bvp), for ê of the standard example
  modes     the eigenvalues of the same 8-element Hermite matrices of a pinned beam (SciPy eigh)
  plate     the Navier sums at the centre of a simply supported plate (mpmath, 30 digits)
  beam      the exact midspan deflection 5/384 of the pinned beam under a uniform load (SymPy)

and writes data/structures.json with the versions it used. CI never runs this script: the tests compare the
engine with the committed file. Run it again after a change to a structures example or declaration:

    uv run --with sympy==1.14.0 --with mpmath==1.3.0 --with numpy==2.3.3 --with scipy==1.16.2 python tools/structures_references.py
"""
import json
import platform
from pathlib import Path

import mpmath
import numpy as np
import scipy
import sympy
from scipy.integrate import solve_bvp
from scipy.linalg import eigh

HERE = Path(__file__).resolve().parent.parent
mpmath.mp.dps = 30


def example(examples, ex_id):
    return next(e for e in examples if e["id"] == ex_id)


def value(ex, symbol):
    v = next(v for v in ex["variables"] if v["symbol"] == symbol)
    return sympy.Rational(v["value"])


def elastica(examples):
    perfect = []
    for deg in [10, 30, 60, 90, 120, 150]:
        t = mpmath.mpf(deg) * mpmath.pi / 180
        lam = 4 * mpmath.ellipk(mpmath.sin(t / 2) ** 2) ** 2
        perfect.append({"theta0deg": deg, "lambda": float(lam)})
    ex = example(examples, "elastica")
    ehat = float(value(ex, "e") / value(ex, "L"))
    imperfect = []
    for mu in [0.5, 0.9, 1.1, 2.0]:
        lam = mu * float(mpmath.pi) ** 2
        s = np.linspace(0, 1, 401)
        if mu < 1:
            k = np.sqrt(lam)
            a = -ehat * k * np.tan(k / 2)
            guess = np.vstack([a * np.cos(k * s) + ehat * k * np.sin(k * s), -a * k * np.sin(k * s) + ehat * k * k * np.cos(k * s)])
        else:
            lo, hi = 0.0, float(mpmath.pi) - 1e-9
            for _ in range(200):
                mid = (lo + hi) / 2
                if 4 * float(mpmath.ellipk(mpmath.sin(mid / 2) ** 2)) ** 2 < lam:
                    lo = mid
                else:
                    hi = mid
            th = -(lo + hi) / 2
            guess = np.vstack([th * np.cos(np.pi * s), -th * np.pi * np.sin(np.pi * s)])
        sol = solve_bvp(lambda x, y: np.vstack([y[1], -lam * np.sin(y[0])]),
                        lambda ya, yb: np.array([ya[1] - lam * ehat, yb[1] - lam * ehat]), s, guess, tol=1e-9, bc_tol=1e-12, max_nodes=1000000)
        assert sol.success, sol.message
        imperfect.append({"lambda": lam, "ehat": ehat, "theta0": float(sol.sol(0)[0])})
    # The series λ/π² = 1 + c2 θ0² + c4 θ0⁴ + … from SymPy's series of the complete elliptic integral.
    t, m = sympy.symbols("theta0 m")
    K = sympy.series(sympy.elliptic_k(m), m, 0, 4).removeO()
    lam = sympy.series(((2 * K / sympy.pi) ** 2).subs(m, sympy.sin(t / 2) ** 2), t, 0, 7).removeO()
    series = [str(sympy.nsimplify(lam.coeff(t, k))) for k in (0, 2, 4, 6)]
    return {"perfect": perfect, "imperfect": imperfect, "series": series}


def hermite(n):
    h = 1.0 / n
    N = 2 * (n + 1)
    K = np.zeros((N, N))
    M = np.zeros((N, N))
    ke = np.array([[12, 6 * h, -12, 6 * h], [6 * h, 4 * h * h, -6 * h, 2 * h * h], [-12, -6 * h, 12, -6 * h], [6 * h, 2 * h * h, -6 * h, 4 * h * h]]) / h ** 3
    me = np.array([[156, 22 * h, 54, -13 * h], [22 * h, 4 * h * h, 13 * h, -3 * h * h], [54, 13 * h, 156, -22 * h], [-13 * h, -3 * h * h, -22 * h, 4 * h * h]]) * h / 420
    for e in range(n):
        d = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3]
        K[np.ix_(d, d)] += ke
        M[np.ix_(d, d)] += me
    keep = [i for i in range(N) if i not in (0, 2 * n)]
    return K[np.ix_(keep, keep)], M[np.ix_(keep, keep)]


def plate(beta, nu):
    """The centre values as double sums over odd m = 2i + 1 and n = 2j + 1, by mpmath.nsum with its extrapolation."""
    beta = mpmath.mpf(beta)
    nu = mpmath.mpf(nu)

    def term(i, j, moment):
        m, n = 2 * i + 1, 2 * j + 1
        q = m * m + n * n / beta ** 2
        s = (-1) ** int(i + j)
        return s * ((m * m + nu * n * n / beta ** 2) if moment else 1) / (m * n * q * q)

    w = mpmath.nsum(lambda i, j: term(i, j, False), [0, mpmath.inf], [0, mpmath.inf])
    mx = mpmath.nsum(lambda i, j: term(i, j, True), [0, mpmath.inf], [0, mpmath.inf])
    return {"beta": float(beta), "nu": float(nu), "w": float(16 * w / mpmath.pi ** 6), "mx": float(16 * mx / mpmath.pi ** 4)}


def main():
    examples = json.loads((HERE / "data" / "examples.json").read_text(encoding="utf-8"))["examples"]
    K, M = hermite(8)
    modes = [float(x) for x in eigh(K, M, eigvals_only=True)[:4]]
    X = sympy.symbols("X")
    W = (X - 2 * X ** 3 + X ** 4) / 24
    assert sympy.diff(W, X, 4) == 1 and W.subs(X, 0) == 0 and W.subs(X, 1) == 0
    doc = {
        "about": "Reference values for the structures families of piece 5, independent of the page's engine. Written by tools/structures_references.py; CI compares the engine with this file and never runs the script.",
        "tool": "tools/structures_references.py",
        "versions": {"python": platform.python_version(), "sympy": sympy.__version__, "mpmath": mpmath.__version__, "numpy": np.__version__, "scipy": scipy.__version__},
        "elastica": {**elastica(examples), "versions": {"mpmath": mpmath.__version__, "scipy": scipy.__version__}, "settings": "mpmath.ellipk at 30 digits; solve_bvp with tol 1e-9 and bc_tol 1e-12"},
        "modes": {"scipy8": modes, "versions": {"scipy": scipy.__version__}, "settings": "scipy.linalg.eigh on the 8-element Hermite stiffness and consistent mass of a pinned beam"},
        "plate": {"navier": [plate(1, 0.3), plate(2, 0.3)], "versions": {"mpmath": mpmath.__version__}, "settings": "mpmath.nsum over the odd terms at 30 digits"},
        "beam": {"midspan": str(W.subs(X, sympy.Rational(1, 2))), "versions": {"sympy": sympy.__version__}},
    }
    (HERE / "data" / "structures.json").write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote data/structures.json (mpmath {mpmath.__version__}, scipy {scipy.__version__})")


if __name__ == "__main__":
    main()
