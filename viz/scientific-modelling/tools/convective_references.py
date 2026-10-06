"""Independent reference values for the convective heat-transfer models of piece 7 (src/convective.js).

The page's engine is its own JavaScript. This script recomputes, with other software:

  couette     the temperature profile, the wall heat fluxes and the energy balance of plane Couette flow with
              viscous heating (SymPy, exact)
  capillary   the thermocapillary return flow, its temperature and the transport integral -1/1680 (SymPy, exact)
  mixed       the mixed-convection profile in a vertical channel and the reversal value of Gr/Re (SymPy, exact)
  tube        Nu_D = 48/11 for a uniform wall heat flux (SymPy) and the first Graetz eigenvalue for a uniform wall
              temperature from the Kummer-function form of the eigenfunction (mpmath, 30 digits)
  conjugate   the fully developed fluid profile of the parallel-plate channel: theta_w - theta_m = 17/35 (SymPy)
  advection   the exact temperature and total flux of the channel segment at Pe = 20 (mpmath, 30 digits)
  pohlhausen  the Blasius f''(0) and Pohlhausen's theta'(0) at several Prandtl numbers (SciPy solve_bvp), written
              as the page's sample file of imported numerical results, with its provenance

and writes data/heatrefs.json with the versions it used. CI never runs this script: the tests compare the engine
with the committed file. Run it again after a change to a piece 7 example or declaration:

    uv run --with sympy==1.14.0 --with mpmath==1.3.0 --with scipy==1.16.2 --with numpy==2.3.3 python tools/convective_references.py
"""
import json
import platform
from pathlib import Path

import mpmath
import numpy
import scipy
import sympy
from scipy.integrate import solve_bvp

HERE = Path(__file__).resolve().parent.parent
mpmath.mp.dps = 30
DATE = "2026-10-06"


def poly(expr, x):
    """Coefficients of a polynomial, lowest power first, as text."""
    return [str(c) for c in reversed(sympy.Poly(sympy.expand(expr), x).all_coeffs())]


def couette():
    eta, br = sympy.symbols("eta Br")
    theta = sympy.Function("theta")
    sol = sympy.dsolve(sympy.Eq(theta(eta).diff(eta, 2), -br), theta(eta), ics={theta(0): 0, theta(1): 1}).rhs
    d = sympy.diff(sol, eta)
    return {"theta": str(sympy.expand(sol)), "flux0": str(sympy.simplify(d.subs(eta, 0))), "flux1": str(sympy.simplify(d.subs(eta, 1))),
            "balance": str(sympy.simplify(d.subs(eta, 0) - d.subs(eta, 1)))}


def capillary():
    z, g = sympy.symbols("z g")
    a, b = sympy.symbols("a b")
    F = g / 2 * z**2 + a * z
    s = sympy.solve([sympy.Eq(F.diff(z).subs(z, 1), 1), sympy.Eq(sympy.integrate(F, (z, 0, 1)), 0)], [g, a])
    F = sympy.expand(F.subs(s))
    G = sympy.integrate(sympy.integrate(F, (z, 0, z)), (z, 0, z))
    G = sympy.expand(G - sympy.integrate(G, (z, 0, 1)))
    return {"F": poly(F, z), "G": poly(G, z), "pressure": str(s[g]), "transport": str(sympy.integrate(F * G, (z, 0, 1))), "reversal": [str(r) for r in sympy.solve(F, z)]}


def mixed():
    eta, B, P = sympy.symbols("eta B P")
    W = sympy.Function("W")
    sol = sympy.dsolve(sympy.Eq(W(eta).diff(eta, 2), P + B * (sympy.Rational(1, 2) - eta)), W(eta), ics={W(0): 0, W(1): 0}).rhs
    p_val = sympy.solve(sympy.Eq(sympy.integrate(sol, (eta, 0, 1)), 1), P)[0]
    sol = sympy.expand(sol.subs(P, p_val))
    slope = sympy.diff(sol, eta)
    return {"profile": str(sol), "P": str(p_val), "reversal_B": [str(r) for r in sympy.solve(slope.subs(eta, 1), B) + sympy.solve(slope.subs(eta, 0), B)]}


def tube():
    r = sympy.symbols("r", positive=True)
    phi = sympy.Function("phi")
    rhs = 4 * (1 - r**2)
    flux = sympy.integrate(rhs * r, (r, 0, r)) / r
    phi = sympy.integrate(flux, (r, 0, r))
    w = (1 - r**2) * r
    mean = sympy.integrate(phi * w, (r, 0, 1)) / sympy.integrate(w, (r, 0, 1))
    nu_q = sympy.nsimplify(2 / (phi.subs(r, 1) - mean))
    f = lambda lam: mpmath.exp(-lam / 2) * mpmath.hyp1f1(mpmath.mpf(1) / 2 - lam / 4, 1, lam)
    lam0 = mpmath.findroot(f, 2.7)
    return {"NuQ": str(nu_q), "graetz": {"lambda0": float(lam0), "lambda0_text": mpmath.nstr(lam0, 20), "NuT": float(lam0**2 / 2),
            "method": "mpmath 1.3.0: the root of exp(−λ/2) ₁F₁(1/2 − λ/4; 1; λ) near 2.7"}}


def conjugate():
    Y = sympy.symbols("Y")
    u = sympy.Rational(3, 2) * (1 - Y**2)
    th = sympy.integrate(sympy.integrate(u, (Y, 0, Y)), (Y, 0, Y))
    mean = sympy.integrate(u * th, (Y, 0, 1)) / sympy.integrate(u, (Y, 0, 1))
    wm = sympy.nsimplify(th.subs(Y, 1) - mean)
    return {"wall_minus_mean": str(wm), "Nu_f": str(sympy.nsimplify(4 / wm)), "flux": str(sympy.diff(th, Y).subs(Y, 1))}


def advection(pe):
    pe = mpmath.mpf(pe)
    theta = lambda X: (1 - mpmath.exp(-pe * (1 - X))) / (1 - mpmath.exp(-pe))
    return {"Pe": float(pe), "J": float(pe / (1 - mpmath.exp(-pe))), "theta": {str(x): float(theta(mpmath.mpf(x))) for x in ("0.5", "0.9", "0.95", "0.99")}}


def pohlhausen(prs):
    """Blasius f''' + f f''/2 = 0 with Pohlhausen's theta'' + Pr f theta'/2 = 0 by solve_bvp on 0 <= eta <= 15."""
    eta = numpy.linspace(0, 15, 1501)

    def fun(x, y, pr):
        return numpy.vstack([y[1], y[2], -0.5 * y[0] * y[2], y[4], -0.5 * pr * y[0] * y[4]])

    def bc(ya, yb):
        return numpy.array([ya[0], ya[1], yb[1] - 1, ya[3], yb[3] - 1])

    guess = numpy.vstack([eta - 1.7 * (1 - numpy.exp(-eta)), 1 - numpy.exp(-eta), 0.33 * numpy.exp(-eta), 1 - numpy.exp(-eta), 0.33 * numpy.exp(-eta)])
    out, fpp = [], None
    for pr in prs:
        sol = solve_bvp(lambda x, y: fun(x, y, pr), bc, eta, guess, tol=1e-10, max_nodes=200000)
        assert sol.success, sol.message
        fpp = float(sol.sol(0)[2])
        out.append({"Pr": pr, "NuRe": round(float(sol.sol(0)[4]), 10)})
        guess = sol.sol(eta)
    return fpp, out


def main():
    prs = [0.5, 0.6, 0.7, 1.0, 2.0, 5.0, 10.0, 50.0]
    fpp, points = pohlhausen(prs)
    sample = {
        "schema": "scientific-modelling/numerical-results", "schemaVersion": 1, "example": "plate-convection",
        "provenance": {"source": "tools/convective_references.py of this page, run once and committed", "method": "Blasius and Pohlhausen similarity equations as one boundary-value problem on 0 ≤ η ≤ 15, collocation (scipy.integrate.solve_bvp)",
                       "software": f"SciPy {scipy.__version__}, NumPy {numpy.__version__}, Python {platform.python_version()}", "date": DATE, "tolerance": "solve_bvp tol = 1e-10; values rounded to 10 decimals",
                       "notes": "Pr = 0.5 lies outside the range Pr ≥ 0.6 of the correlation, so the page keeps that point but does not compare it."},
        "definitions": {"NuRe": "Nu_x/Re_x^(1/2), local, isothermal wall, laminar", "Pr": "nu/alpha"},
        "points": points,
    }
    out = {
        "about": "Reference values for the convective heat-transfer models of piece 7, independent of the page's engine, and the sample file of imported numerical results. Written by tools/convective_references.py; CI compares the engine with this file and never runs the script.",
        "tool": "tools/convective_references.py",
        "versions": {"python": platform.python_version(), "sympy": sympy.__version__, "mpmath": mpmath.__version__, "scipy": scipy.__version__, "numpy": numpy.__version__},
        "couette": couette(), "capillary": capillary(), "mixed": mixed(), "tube": tube(), "conjugate": conjugate(), "advection": advection(20),
        "blasius": {"fpp0": fpp}, "graetz": None, "sample": sample,
    }
    out["graetz"] = out["tube"]["graetz"]
    (HERE / "data" / "heatrefs.json").write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(out, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
