"""Independent reference values for the flow families of piece 6 (src/flows.js).

The page's engine is its own JavaScript. This script recomputes, with other software:

  internal  P, S, f·Re and Nu of the fully developed pipe and channel flows with a uniform wall heat flux (SymPy)
  nozzle    the exit Mach numbers on both branches, the critical and exit-shock pressure ratios and the choked mass-flow parameter
            of air (γ = 7/5) for the exit area ratio of the standard example (mpmath, 30 digits; SymPy for the square)
  jump      the conjugate depth, the head loss and the alternate depth of the standard example (SymPy, exact radicals)
  blasius   f''(0), the 99 % thickness and the displacement and momentum thicknesses of the Blasius solution
            (mpmath ODE solver and root finder, 30 digits)
  airfoil   the cylinder forces (SymPy integrals), the thin-airfoil coefficients of the parabolic camber line (SymPy),
            and the lift coefficients of the Joukowski airfoil and of the circular arc of the standard example (mpmath)

and writes data/flows.json with the versions it used. CI never runs this script: the tests compare the engine with
the committed file. Run it again after a change to a flow example or declaration:

    uv run --with sympy==1.14.0 --with mpmath==1.3.0 python tools/flow_references.py
"""
import json
import platform
from pathlib import Path

import mpmath
import sympy

HERE = Path(__file__).resolve().parent.parent
mpmath.mp.dps = 30


def internal(j):
    """Exact P, S, f·Re and Nu with (X^j U')' = -P X^j, mean of U = 1, (X^j θ')' = S X^j U, θ'(1) = 1."""
    X, P, S = sympy.symbols("X P S", positive=True)
    w = X**j
    U = sympy.integrate(sympy.integrate(-P * w, (X, 0, X)) / w, X)
    U = U - U.subs(X, 1)
    P_val = sympy.solve(sympy.Eq((j + 1) * sympy.integrate(U * w, (X, 0, 1)), 1), P)[0]
    U = sympy.expand(U.subs(P, P_val))
    flux = sympy.integrate(S * U * w, (X, 0, X)) / w
    S_val = sympy.solve(sympy.Eq(flux.subs(X, 1), 1), S)[0]
    theta = sympy.integrate(sympy.expand(flux.subs(S, S_val)), X)
    theta_m = sympy.integrate(U * theta * w, (X, 0, 1)) / sympy.integrate(U * w, (X, 0, 1))
    dh = 2 if j else 4
    tau = -sympy.diff(U, X).subs(X, 1)
    return {"P": str(P_val), "S": str(S_val), "fRe": str(sympy.nsimplify(8 * tau * dh)), "Nu": str(sympy.nsimplify(dh / (theta.subs(X, 1) - theta_m)))}


def nozzle(eps):
    g = mpmath.mpf(7) / 5
    ar = lambda M: (1 / M) * ((1 + (g - 1) / 2 * M**2) / ((g + 1) / 2)) ** ((g + 1) / (2 * (g - 1)))
    pr = lambda M: (1 + (g - 1) / 2 * M**2) ** (-g / (g - 1))
    sub = mpmath.findroot(lambda M: ar(M) - eps, (mpmath.mpf("0.01"), mpmath.mpf("0.999")), solver="bisect")
    sup = mpmath.findroot(lambda M: ar(M) - eps, (mpmath.mpf("1.001"), mpmath.mpf(20)), solver="bisect")
    phi2 = sympy.Rational(7, 5) * sympy.Rational(5, 6) ** 6
    p2 = pr(sup) * (2 * g * sup**2 - (g - 1)) / (g + 1)
    return {"gamma": "7/5", "eps": float(eps), "M_sub": float(sub), "M_sup": float(sup), "p1": float(pr(sub)), "p3": float(pr(sup)), "p2": float(p2),
            "phi": float(mpmath.sqrt(g) * (2 / (g + 1)) ** ((g + 1) / (2 * (g - 1)))), "phi2": str(phi2)}


def jump(g, q, h1):
    g, q, h1 = sympy.Rational(g), sympy.Rational(q), sympy.Rational(h1)
    F = q**2 / (g * h1**3)
    r = (sympy.sqrt(1 + 8 * F) - 1) / 2
    h2 = r * h1
    E = lambda h: h + q**2 / (2 * g * h**2)
    h = sympy.symbols("h", positive=True)
    roots = [x for x in sympy.solve(sympy.Eq(E(h), E(h1)), h) if sympy.simplify(x - h1) != 0]
    alt = max(roots, key=lambda x: float(x)) if F > 1 else min(roots, key=lambda x: float(x))
    return {"g": str(g), "q": str(q), "h1": str(h1), "Fr1sq": str(F), "h2": float(h2), "r": float(r), "dE": float(E(h1) - E(h2)),
            "loss_formula": float((h2 - h1) ** 3 / (4 * h1 * h2)), "h_alt": float(alt), "h_c": float((q**2 / g) ** sympy.Rational(1, 3))}


def blasius():
    def run(s, eta):
        sol = mpmath.odefun(lambda x, y: [y[1], y[2], -y[0] * y[2] / 2], 0, [0, 0, s])
        return sol(eta)
    eta_max = 14
    s = mpmath.findroot(lambda s: run(s, eta_max)[1] - 1, mpmath.mpf("0.332"))
    sol = mpmath.odefun(lambda x, y: [y[1], y[2], -y[0] * y[2] / 2], 0, [0, 0, s])
    eta99 = mpmath.findroot(lambda e: sol(e)[1] - mpmath.mpf("0.99"), mpmath.mpf("4.9"))
    end = sol(eta_max)
    return {"fpp0": {"value": float(s), "digits": mpmath.nstr(s, 20), "eta_max": eta_max}, "eta99": float(eta99),
            "dstar": float(eta_max - end[0]), "theta": float(2 * s), "H": float((eta_max - end[0]) / (2 * s))}


def airfoil(alpha_deg, m, eps):
    psi, G = sympy.symbols("psi G", real=True)
    cp = 1 - (2 * sympy.sin(psi) + G) ** 2
    lift = sympy.expand(sympy.integrate(cp * sympy.sin(psi), (psi, 0, 2 * sympy.pi)) / sympy.pi)
    drag = sympy.simplify(sympy.integrate(cp * sympy.cos(psi), (psi, 0, 2 * sympy.pi)))
    th, mm = sympy.symbols("theta m", positive=True)
    slope = 4 * mm * sympy.cos(th)
    A0 = -sympy.integrate(slope, (th, 0, sympy.pi)) / sympy.pi
    A1 = 2 * sympy.integrate(slope * sympy.cos(th), (th, 0, sympy.pi)) / sympy.pi
    A2 = 2 * sympy.integrate(slope * sympy.cos(2 * th), (th, 0, sympy.pi)) / sympy.pi
    a = mpmath.radians(alpha_deg)

    def cl(e, k):
        z0 = mpmath.mpc(-e, k * (1 + e))
        rad = abs(1 - z0)
        beta = mpmath.atan2(z0.imag, 1 + e)
        gam = 4 * mpmath.pi * rad * mpmath.sin(a + beta)
        zmap = lambda t: (z0 + rad * mpmath.expj(t)) + 1 / (z0 + rad * mpmath.expj(t))
        dist = lambda t: abs(zmap(t) - 2)
        t0 = mpmath.findroot(lambda t: mpmath.diff(dist, t), -beta + mpmath.pi)
        return 2 * gam / dist(t0)
    return {"cylinder": {"lift_over_pi": str(lift), "drag": str(drag)}, "thin": {"A0_minus_alpha": str(A0), "A1": str(A1), "A2": str(A2)},
            "alpha_deg": alpha_deg, "m": m, "eps": eps, "cl_joukowski": float(cl(mpmath.mpf(eps), 2 * mpmath.mpf(m))), "cl_arc": float(cl(0, 2 * mpmath.mpf(m))),
            "cl_thin": float(2 * mpmath.pi * (a + 2 * mpmath.mpf(m)))}


def main():
    out = {
        "about": "Reference values for the flow families of piece 6, independent of the page's engine. Written by tools/flow_references.py; CI compares the engine with this file and never runs the script.",
        "tool": "tools/flow_references.py",
        "versions": {"python": platform.python_version(), "sympy": sympy.__version__, "mpmath": mpmath.__version__},
        "internal": {"pipe": internal(1), "channel": internal(0)},
        "nozzle": nozzle(mpmath.mpf(2)),
        "jump": jump("9.81", "0.8", "0.2"),
        "blasius": blasius(),
        "airfoil": airfoil(4, "0.02", "0.08"),
    }
    (HERE / "data" / "flows.json").write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
