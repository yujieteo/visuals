"""Independent reference values for the fluid-structure interaction family (the typical section), computed with
mpmath and SciPy.

The page's engine is its own JavaScript (src/flutter.js): Bessel functions by series and Hankel's expansion, the
k and p-k methods, a Hessenberg-QR eigenvalue solver and Brent's method. This script recomputes the same results
in another way, and writes data/flutterrefs.json with the versions it used:

- Theodorsen's function C(k) = H1(k) / (H1(k) + i H0(k)), with mpmath's Hankel functions at 30 digits.
- The flutter point of the frequency-domain method: mpmath.findroot on the two real equations Re det = 0 and
  Im det = 0 of the flutter determinant in the unknowns k and X = (omega_theta/omega)^2, at 30 digits.
- The onset of the time-domain model with the R. T. Jones approximation: scipy.linalg.eigvals of the state
  matrix, built here from the record's equations independently of the page, and scipy.optimize.brentq on the
  largest real part.
- One time response, x(tau) = expm(tau A) x0, with scipy.linalg.expm.

CI never runs this script: the tests compare the page's engine with the committed file. Run it again after a change
to the flutter examples:

    uv run --with mpmath==1.3.0 --with numpy==2.3.3 --with scipy==1.16.2 python tools/flutter_references.py
"""
import json
import platform
from fractions import Fraction
from pathlib import Path

import mpmath as mp
import numpy as np
import scipy
from scipy.linalg import eigvals, expm
from scipy.optimize import brentq

HERE = Path(__file__).resolve().parent.parent
mp.mp.dps = 30
JONES = {"C1": 0.165, "eps1": 0.0455, "C2": 0.335, "eps2": 0.3}
K_POINTS = [0.01, 0.05, 0.1, 0.2, 0.3, 0.5, 1.0, 2.0, 5.0, 10.0, 14.0, 20.0]


def theodorsen(k):
    """C(k) from mpmath's Hankel functions of the second kind."""
    h1 = mp.hankel2(1, k)
    h0 = mp.hankel2(0, k)
    return h1 / (h1 + 1j * h0)


def determinant(P, k, X):
    """The flutter determinant of the Georgia Tech worksheet at reduced frequency k and X = (w_theta/w)^2."""
    a, xt, mu, r2, s = P["a"], P["xt"], P["mu"], P["r2"], P["sigma"]
    c = theodorsen(k)
    lh = 1 - 2j * c / k
    lt = -a - 1j / k - 2 * c / k**2 - 2j * (mp.mpf(1) / 2 - a) * c / k
    mh = -a + 2j * (mp.mpf(1) / 2 + a) * c / k
    mt = mp.mpf(1) / 8 + a**2 - 1j * (mp.mpf(1) / 2 - a) / k + 2 * (mp.mpf(1) / 2 + a) * c / k**2 + 2j * (mp.mpf(1) / 4 - a**2) * c / k
    return (mu * (1 - s**2 * X) + lh) * (mu * r2 * (1 - X) + mt) - (mu * xt + lt) * (mu * xt + mh)


def flutter_point(P, k0, X0):
    """(k, X) with det = 0 and X real: the onset of the frequency-domain method."""
    f = lambda k, X: [mp.re(determinant(P, k, X)), mp.im(determinant(P, k, X))]
    k, X = mp.findroot(f, (mp.mpf(k0), mp.mpf(X0)))
    omega = 1 / mp.sqrt(X)
    return {"k": float(k), "Omega": float(omega), "V": float(omega / k), "X": float(X),
            "residual": float(abs(determinant(P, k, X)))}


def state_matrix(P, V):
    """The Jones state matrix, assembled as M x'' = F from the record's equations, independently of the page."""
    a, xt, mu, r2, s = (float(P[k]) for k in ("a", "xt", "mu", "r2", "sigma"))
    C1, C2, e1, e2 = JONES["C1"], JONES["C2"], JONES["eps1"], JONES["eps2"]
    M = np.array([[mu + 1, mu * xt - a], [mu * xt - a, mu * r2 + 1 / 8 + a * a]])
    # x = [xi, theta, xi', theta', l1, l2]; q = xi' + V theta + (1/2 - a) theta'; qe = (1 - C1 - C2) q + l1 + l2
    q = np.array([0, V, 1, 0.5 - a, 0, 0])
    qe = (1 - C1 - C2) * q + np.array([0, 0, 0, 0, 1, 1])
    plunge = -(np.array([mu * s * s, 0, 0, V, 0, 0]) + 2 * V * qe)
    pitch = -(np.array([0, mu * r2, 0, V * (0.5 - a), 0, 0]) - 2 * V * (a + 0.5) * qe)
    acc = np.linalg.solve(M, np.vstack([plunge, pitch]))
    A = np.zeros((6, 6))
    A[0, 2] = A[1, 3] = 1
    A[2:4] = acc
    A[4] = V * e1 * C1 * q
    A[4, 4] -= V * e1
    A[5] = V * e2 * C2 * q
    A[5, 5] -= V * e2
    return A


def state_onset(P):
    growth = lambda V: max(eigvals(state_matrix(P, V)).real)
    Vs = np.linspace(0.05, 4.0, 400)
    for v0, v1 in zip(Vs, Vs[1:]):
        if growth(v0) < 0 <= growth(v1):
            V = brentq(growth, v0, v1, xtol=1e-14)
            ev = eigvals(state_matrix(P, V))
            p = ev[np.argmax(ev.real)]
            return {"V": V, "Omega": abs(p.imag), "k": abs(p.imag) / V, "kind": "flutter" if abs(p.imag) > 1e-9 else "divergence"}
    return None


def case(cid, a, e, mu, r2, sigma, k0, X0, response_speed):
    ex = {"a": Fraction(a), "e": Fraction(e), "mu": Fraction(mu), "r2": Fraction(r2), "sigma": Fraction(sigma)}
    ex["xt"] = ex["e"] - ex["a"]
    P = {k: mp.mpf(v.numerator) / v.denominator for k, v in ex.items()}
    theo = flutter_point(P, k0, X0)
    ss = state_onset(ex)
    one_plus_2a = 1 + 2 * ex["a"]
    VD2 = ex["mu"] * ex["r2"] / one_plus_2a if one_plus_2a > 0 else None
    A = state_matrix(ex, response_speed)
    x = expm(20.0 * A) @ np.array([0, 1, 0, 0, 0, 0], dtype=float)
    return {
        "id": cid,
        "parameters": {k: str(ex[k]) for k in ("a", "e", "mu", "r2", "sigma")},
        "theodorsen": theo,
        "state": ss,
        "divergence": {"V2": str(VD2) if VD2 is not None else None, "V": float(mp.sqrt(mp.mpf(VD2.numerator) / VD2.denominator)) if VD2 else None},
        "response": {"V": response_speed, "tau": 20.0, "x": [float(v) for v in x]},
        "eigenvalues": {"V": 1.0, "values": sorted(([float(z.real), float(z.imag)] for z in eigvals(state_matrix(ex, 1.0))), key=lambda z: (z[1], z[0]))},
    }


def main():
    out = {
        "about": "Reference values for the typical-section flutter family, independent of the page's engine. Written by tools/flutter_references.py; CI compares the engine with this file and never runs the script.",
        "tool": "tools/flutter_references.py",
        "versions": {"python": platform.python_version(), "mpmath": mp.__version__, "numpy": np.__version__, "scipy": scipy.__version__},
        "settings": {"precision": "mpmath at 30 decimal digits for C(k) and the frequency-domain flutter point",
                     "frequency": "mpmath.findroot on Re det = 0 and Im det = 0 in (k, X)",
                     "state": "scipy.linalg.eigvals and scipy.optimize.brentq (xtol 1e-14) on the largest real part",
                     "response": "scipy.linalg.expm at tau = 20 from theta = 1"},
        "theodorsen": [{"k": k, "re": float(mp.re(theodorsen(k))), "im": float(mp.im(theodorsen(k)))} for k in K_POINTS],
        "cases": [
            case("flutter", "-1/5", "-1/10", "20", "4/25", "2/5", 0.32, 2.76, 1.5),
            case("flutter-hp", "-1/5", "-1/10", "20", "6/25", "2/5", 0.30, 2.37, 1.5),
        ],
    }
    path = HERE / "data" / "flutterrefs.json"
    path.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {path.relative_to(HERE)}")


if __name__ == "__main__":
    main()
