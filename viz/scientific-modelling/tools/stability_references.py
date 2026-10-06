"""Independent reference values for the stability and bifurcation analyses of piece 4, with mpmath and SymPy.

The page's engine is its own JavaScript (src/numerics.js, src/convection.js, src/radiation.js, src/ode.js), with
Chebyshev collocation, Newton's method and continuation. This script uses other methods and writes their results to
the "computed" part of data/stability.json, keeping the transcribed table there:

  rb          the neutral curve of the layer between no-slip isothermal plates from the exact characteristic
              determinant of (D² − a²)³W = −Ra a²W for even modes (Chandrasekhar's method), its minimum (Ra_c, a_c),
              and the onset of the box modes a = nπ/Γ for the enclosure example
  lorenz      the Hopf point of the Lorenz equations from the Routh–Hurwitz condition, exactly
  ignition    the folds of θ' = Da·exp(θ/(1 + εθ)) − θ at ε = 1/5 and the cusp, exactly where possible
  radiation   the equilibrium and the transient of the lumped body, the network of the duct, and the root of the
              convection–radiation balance, for the standard examples

CI never runs this script. Run it again after a change to the examples or the declarations:

    uv run --with mpmath==1.3.0 --with sympy==1.14.0 python tools/stability_references.py
"""
import json
import platform
from pathlib import Path

import mpmath as mp
import sympy as sp

HERE = Path(__file__).resolve().parent.parent
mp.mp.dps = 30


def rb_det(a, Ra):
    """The characteristic determinant of even modes W = Σ A_j cosh(q_j z) on |z| < 1/2 with W = W' = (D² − a²)²W = 0."""
    tau = mp.cbrt(Ra * a * a)
    roots = [mp.mpf(1), mp.exp(2j * mp.pi / 3), mp.exp(-2j * mp.pi / 3)]
    qs = [mp.sqrt(a * a - tau * w) for w in roots]
    M = mp.matrix(3, 3)
    for j, q in enumerate(qs):
        c, s = mp.cosh(q / 2), mp.sinh(q / 2)
        M[0, j] = c
        M[1, j] = q * s
        M[2, j] = (q * q - a * a) ** 2 * c
    return mp.det(M)


def rb_neutral(a):
    """The smallest neutral Ra at wavenumber a: the first sign change of the determinant on a scan, refined.

    The determinant has a constant phase along real Ra, so its real part after division by that phase is real.
    """
    a = mp.mpf(a)
    phase = rb_det(a, mp.mpf(1000)) / abs(rb_det(a, mp.mpf(1000)))
    f = lambda R: mp.re(rb_det(a, R) / phase)
    grid = [mp.mpf(600) * mp.mpf(10) ** (mp.mpf(k) / 100) for k in range(0, 301)]
    prev = f(grid[0])
    for lo, hi in zip(grid, grid[1:]):
        cur = f(hi)
        if prev * cur <= 0:
            return mp.findroot(f, (lo, hi), solver="anderson")
        prev = cur
    raise ValueError(f"no neutral Ra below 6e5 at a = {a}")


def rb():
    # Golden-section search of the minimum of the neutral curve.
    g = (mp.sqrt(5) - 1) / 2
    lo, hi = mp.mpf("2.9"), mp.mpf("3.3")
    c, d = hi - g * (hi - lo), lo + g * (hi - lo)
    fc, fd = rb_neutral(c), rb_neutral(d)
    for _ in range(80):
        if fc < fd:
            hi, d, fd = d, c, fc
            c = hi - g * (hi - lo)
            fc = rb_neutral(c)
        else:
            lo, c, fc = c, d, fd
            d = lo + g * (hi - lo)
            fd = rb_neutral(d)
    ac = (lo + hi) / 2
    rac = rb_neutral(ac)
    gamma = mp.mpf("2.5")
    box = []
    for n in range(1, 6):
        a = n * mp.pi / gamma
        box.append({"n": n, "a": float(a), "Ra": float(rb_neutral(a))})
    return {"Ra_c": float(mp.nstr(rac, 15)), "a_c": float(mp.nstr(ac, 12)), "Ra_pi": float(rb_neutral(mp.pi)),
            "method": "characteristic determinant of even modes (Chandrasekhar), mpmath at 30 digits", "enclosure": {"Gamma": 2.5, "modes": box}}


def lorenz():
    s, b, r, lam = sp.symbols("s b r lam", positive=True)
    x = sp.sqrt(b * (r - 1))
    # The Jacobian at C± = (±x, ±x, r − 1); the characteristic polynomial does not depend on the sign.
    J = sp.Matrix([[-s, s, 0], [1, -1, -x], [x, x, -b]])
    p = sp.Poly(sp.expand((lam * sp.eye(3) - J).det()), lam)
    a2, a1, a0 = p.all_coeffs()[1:]
    rh = sp.solve(sp.Eq(sp.expand(a2 * a1), sp.expand(a0)), r)
    rh = [sp.simplify(v.subs({s: 10, b: sp.Rational(8, 3)})) for v in rh]
    omega = sp.sqrt(a1.subs({s: 10, b: sp.Rational(8, 3), r: rh[0]}))
    return {"r_hopf": str(rh[0]), "r_hopf_float": float(rh[0]), "r_pitchfork": "1", "omega": float(omega),
            "method": "Routh–Hurwitz condition a₂a₁ = a₀ of the characteristic polynomial at C±, SymPy"}


def ignition():
    eps, th = sp.Rational(1, 5), sp.symbols("theta", positive=True)
    roots = sp.solve(sp.Eq(th, (1 + eps * th) ** 2), th)
    folds = []
    for t in sorted(roots, key=lambda v: float(v)):
        da = t * sp.exp(-t / (1 + eps * t))
        folds.append({"theta": str(sp.nsimplify(t)), "theta_float": float(t), "Da": float(sp.N(da, 20))})
    e = sp.symbols("e", positive=True)
    cusp_eps = sp.solve(sp.Eq((2 * e - 1) ** 2 - 4 * e * e, 0), e)[0]
    tc = (1 - 2 * cusp_eps) / (2 * cusp_eps ** 2)
    return {"eps": "1/5", "folds": folds, "cusp": {"eps": str(cusp_eps), "theta": str(tc), "Da": float(sp.N(tc * sp.exp(-tc / (1 + cusp_eps * tc)), 20)), "Da_exact": str(sp.simplify(tc * sp.exp(-tc / (1 + cusp_eps * tc))))},
            "method": "fold conditions f = 0 and f_θ = 0 give θ = (1 + εθ)²; the cusp is where the two roots meet, SymPy"}


def radiation():
    sigma = mp.mpf("5.670374419e-8")
    # Lumped body: the standard example's q, θ*, and θ(τ = 1) from θ_i = 3 by mpmath's Taylor integrator.
    q = mp.mpf(2) / (mp.mpf(4) / 5 * sigma * mp.mpf("6e-4") * mp.mpf(300) ** 4)
    theq = (1 + q) ** mp.mpf(0.25)
    sol = mp.odefun(lambda t, y: q + 1 - y ** 4, 0, mp.mpf(3))
    # Duct: exact network with W = 4, H = 3, ε₁ = 4/5, ε₂ = 1/2, T₂/T₁ = 1/2.
    W, H = sp.Integer(4), sp.Integer(3)
    d = sp.sqrt(W ** 2 + H ** 2)
    F12 = (d - H) / W
    F1R = 1 - F12
    FR1 = W * F1R / (2 * H)
    e1, e2, t2 = sp.Rational(4, 5), sp.Rational(1, 2), sp.Rational(1, 2)
    j1, j2, jr = sp.symbols("j1 j2 jr")
    g1, g2 = e1 / (1 - e1), e2 / (1 - e2)
    solved = sp.solve([g1 * (1 - j1) - F12 * (j1 - j2) - F1R * (j1 - jr), g2 * (t2 ** 4 - j2) - F12 * (j2 - j1) - F1R * (j2 - jr), 2 * jr - j1 - j2], [j1, j2, jr])
    q1 = g1 * (1 - solved[j1])
    # Convection and radiation: the plate of the standard example.
    Nr = mp.mpf(9) / 10 * sigma * mp.mpf(300) ** 3 / 10
    Qs = mp.mpf(500) / (10 * 300)
    root = mp.findroot(lambda t: t - 1 + Nr * (t ** 4 - 1) - Qs, 1.1)
    return {"lumped": {"q": float(q), "theta_eq": float(theq), "theta_i": 3, "theta_tau1": float(sol(1))},
            "duct": {"F12": str(F12), "F1R": str(F1R), "FR1": str(FR1), "j": [str(solved[j1]), str(solved[j2]), str(solved[jr])], "q1": str(sp.nsimplify(q1))},
            "plate": {"N_r": float(Nr), "Q": float(Qs), "theta": float(root)}}


def main():
    path = HERE / "data" / "stability.json"
    doc = json.loads(path.read_text(encoding="utf-8"))
    doc["computed"] = {"versions": {"python": platform.python_version(), "mpmath": mp.__version__, "sympy": sp.__version__},
                       "rb": rb(), "lorenz": lorenz(), "ignition": ignition(), "radiation": radiation()}
    path.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(doc["computed"], indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
