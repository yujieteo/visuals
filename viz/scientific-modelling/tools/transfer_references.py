"""Independent reference values for the declared models of piece 8 (src/transfer.js).

The page's engine is its own JavaScript. This script recomputes, with other software:

  exchanger  the counterflow effectiveness series in 1 - C_r about the balanced exchanger for NTU = 3/2 (SymPy,
             exact) and the parallel-flow effectiveness of Lienhard's Example 3.5 (mpmath, 30 digits)
  stefan     the root lambda of the two-phase Neumann equation and of the one-phase equation for the groups of the
             melting example (mpmath findroot, 30 digits)
  film       delta(L)^4 of the condensation example as an exact fraction (SymPy)
  boiling    the heat flux of Rohsenow's correlation and the peak heat flux of the pool-boiling example (mpmath)
  slab       E_3 at several arguments (mpmath expint) and the optical thicknesses where the thin form 2 tau_L, the
             opaque form 1 and Rosseland diffusion reach the tolerances 0.1, 0.01 and 0.001 (mpmath findroot)

and writes data/transferrefs.json with the versions it used. CI never runs this script: the tests compare the engine
with the committed file. Run it again after a change to a piece 8 example or declaration:

    uv run --with sympy==1.14.0 --with mpmath==1.3.0 python tools/transfer_references.py
"""
import json
import platform
from pathlib import Path

import mpmath
import sympy

HERE = Path(__file__).resolve().parent.parent
mpmath.mp.dps = 30
R = sympy.Rational


def exchanger():
    ntu, r = R(3, 2), sympy.symbols("r")
    eps = (1 - sympy.exp(-ntu * r)) / (1 - (1 - r) * sympy.exp(-ntu * r))
    series = sympy.series(eps, r, 0, 4).removeO()
    coeffs = [str(sympy.nsimplify(series.coeff(r, k))) for k in range(4)]
    n, cr = mpmath.mpf(3) / 2, mpmath.mpf(1) / 2
    parallel = (1 - mpmath.exp(-(1 + cr) * n)) / (1 + cr)
    return {"NTU": "3/2", "series": coeffs, "parallel_eps": mpmath.nstr(parallel, 25)}


def stefan():
    # The melting example: water and ice from Lienhard's Tables A.2 and A.3, one density 917 kg/m^3, 10 K either side.
    cl, cs, kl, ks, ell, dtl, dts = R(4220), R(2100), R("0.5610"), R("2.215"), R(333300), R(10), R(10)
    ste_l, ste_s, kappa = cl * dtl / ell, cs * dts / ell, ks * cl / (kl * cs)
    sl, ss, ka = (mpmath.mpf(sympy.N(x, 40)) for x in (ste_l, ste_s, kappa))
    nu = 1 / mpmath.sqrt(ka)

    def f(lam):
        return sl / (mpmath.exp(lam**2) * mpmath.erf(lam)) - ss / (nu * mpmath.exp(nu**2 * lam**2) * mpmath.erfc(nu * lam)) - lam * mpmath.sqrt(mpmath.pi)

    lam = mpmath.findroot(f, 0.2)
    lam1 = mpmath.findroot(lambda x: x * mpmath.exp(x**2) * mpmath.erf(x) - sl / mpmath.sqrt(mpmath.pi), 0.25)
    return {"SteL": str(ste_l), "SteS": str(ste_s), "kappa": str(kappa), "lambda": mpmath.nstr(lam, 25), "lambda1": mpmath.nstr(lam1, 25)}


def film():
    g, drho, hfgc, nu, k, dt, L = R("9.806"), R("961.3"), R(2281000), R("3.091e-7"), R("0.6773"), R(10), R("0.3")
    d4 = 4 * nu * k * dt * L / (g * drho * hfgc)
    return {"delta4": str(d4), "delta": mpmath.nstr(mpmath.mpf(sympy.N(d4, 40)) ** mpmath.mpf(0.25), 20)}


def boiling():
    mu, hfg, g, drho, sigma, k, csf, dte, rhog = (mpmath.mpf(x) for x in ("0.000282", "2257e3", "9.8", "957.603", "0.0589", "0.6791", "0.013", "15", "0.597"))
    q = mu * hfg * mpmath.sqrt(g * drho / sigma) * (k * dte / (csf * mu * hfg)) ** 3
    qmax = mpmath.mpf("0.149") * mpmath.sqrt(rhog) * hfg * (g * drho * sigma) ** mpmath.mpf(0.25)
    return {"q": mpmath.nstr(q, 20), "qmax": mpmath.nstr(qmax, 20)}


def slab():
    e3 = lambda x: mpmath.expint(3, x)
    xs = ["0.001", "0.01", "0.1", "0.5", "1", "2", "5", "10", "30"]
    table = [{"x": float(x), "E3": mpmath.nstr(e3(mpmath.mpf(x)), 25)} for x in xs]
    em = lambda t: 1 - 2 * e3(t)
    measures = {
        "thin": lambda t: 2 * t / em(t) - 1,
        "thick": lambda t: 2 * e3(t) / em(t),
        "rosseland": lambda t: 2 * e3(t / 2),
    }
    starts = {"thin": {"1e-1": 0.02, "1e-2": 0.002, "1e-3": 0.0002}, "thick": {"1e-1": 2, "1e-2": 4, "1e-3": 6}, "rosseland": {"1e-1": 3, "1e-2": 7, "1e-3": 12}}
    bounds = {}
    for tol in ["1e-1", "1e-2", "1e-3"]:
        t = mpmath.mpf(tol)
        bounds[tol] = {name: float(mpmath.findroot(lambda x: abs(m(x)) - t, starts[name][tol])) for name, m in measures.items()}
    return {"E3": table, "boundaries": bounds}


def main():
    out = {
        "about": "Independent reference values for the piece 8 models, from tools/transfer_references.py. CI never runs the script; the tests compare the page's engine with these values.",
        "versions": {"python": platform.python_version(), "sympy": sympy.__version__, "mpmath": mpmath.__version__},
        "exchanger": exchanger(), "stefan": stefan(), "film": film(), "boiling": boiling(), "slab": slab(),
    }
    (HERE / "data" / "transferrefs.json").write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(out, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
