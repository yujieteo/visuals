"""Independent reference values for the Finder, the Nondimensionalizer and the conduction families, from SymPy and mpmath.

The page's engine is its own exact JavaScript (src/rational.js, src/linalg.js, src/sym.js). This script recomputes,
for every example of data/examples.json, the dimension matrix of the Pi set, its rank, a kernel basis and the
determinant of D_R for the example's preferred repeating variables, with SymPy's exact rational matrices. For the
examples with equations it also substitutes the textbook scales below into every equation and condition, lets
SymPy apply the chain rule, and divides by the coefficient of the highest derivative of the field. For the
conduction families of piece 3 it computes, with mpmath at 30 digits, the eigenvalues of the slab, the long cylinder
and the sphere (each in its own bracket) and their coefficients by quadrature, the series temperatures, the fin's heat
flow and profile, and with SymPy the small-Bi series of the first eigenvalue and coefficient, the Taylor series of
λ tanh λ, the solution of the slab with a source and the linear system of the two-layer wall. It writes
data/references.json with the versions it used. CI never runs this script: tests compare the page's engine with
the committed file. Run it again after a change to the examples:

    uv run --with sympy==1.14.0 --with mpmath==1.3.0 python tools/references.py
"""
import json
import platform
import re
from pathlib import Path

import mpmath
import sympy

HERE = Path(__file__).resolve().parent.parent
BASE = ["M", "L", "T", "Theta", "I", "N", "J"]
ALIAS = {"Θ": "Theta"}


def dimension(text):
    """Exponents over BASE from a formula such as 'M L^-1 T^-1' or '1'."""
    out = dict.fromkeys(BASE, sympy.Integer(0))
    if text.strip() in ("1", "-", ""):
        return out
    for name, exp in re.findall(r"(Theta|Θ|[MLTINJ])(?:\^(-?\d+(?:/\d+)?))?", text):
        out[ALIAS.get(name, name)] += sympy.Rational(exp) if exp else 1
    return out


def resolved(examples, ex):
    """The variables of an example, with the parts it borrows from another example."""
    def part(key):
        value = ex.get(key)
        if isinstance(value, str):
            return next(e for e in examples if e["id"] == value)[key]
        return value or []
    variables = [dict(v) for v in part("variables")]
    for vid, patch in (ex.get("overrides") or {}).items():
        for v in variables:
            if v["id"] == vid:
                v.update(patch)
    variables += ex.get("extra") or []
    return variables


# The scales of each example with equations, as a textbook chooses them (spec sections 7 and 10), and the
# definitions that the result is reduced with. Each field T becomes offset + scale * theta(X, tau).
SCALES = {
    "transient-slab": {"x": "L", "t": "L**2/alpha", "T": ("T_inf", "DT_i"), "defs": {"alpha": "k/(rho*c_p)", "T_i": "DT_i + T_inf"}},
    "straight-fin": {"x": "L", "T": ("T_inf", "Delta_T"), "defs": {"T_b": "Delta_T + T_inf"}},
    "lumped-body": {"t": "rho*c_p*V/(h*A_s)", "T": ("T_inf", "DT_i"), "defs": {"T_i": "DT_i + T_inf"}},
    "fail-zero-temperature-scale": {"x": "L", "t": "L**2/alpha", "T": ("T_inf", "q_v*L**2/k"), "defs": {"alpha": "k/(rho*c_p)", "T_i": "DT_i + T_inf"}},
    "fail-unsupported": {"x": "L", "t": "rho*c_p*L**2/k", "T": ("T_w", "q_0*L**2/k"), "defs": {}},
    "transient-cylinder": {"r": "R", "t": "R**2/alpha", "T": ("T_inf", "DT_i"), "defs": {"alpha": "k/(rho*c_p)", "T_i": "DT_i + T_inf"}},
    "transient-sphere": {"r": "R", "t": "R**2/alpha", "T": ("T_inf", "DT_i"), "defs": {"alpha": "k/(rho*c_p)", "T_i": "DT_i + T_inf"}},
    "volumetric-source": {"x": "L", "T": ("T_inf", "DT_ref"), "defs": {}},
}
HATS = {"x": "X", "r": "X", "t": "tau"}


class Plain(sympy.printing.str.StrPrinter):
    """The page's plain equation syntax: ^ for powers, d(theta,X,X) for derivatives, theta for theta(X, tau)."""

    def _print_Pow(self, e):
        return f"({self._print(e.base)})^({self._print(e.exp)})"

    def _print_Derivative(self, e):
        vs = [str(v) for v, n in e.variable_count for _ in range(int(n))]
        return f"d({e.expr.func.__name__},{','.join(vs)})"

    def _print_Function(self, e):
        if e.func.__name__ == "theta":
            return "theta"
        return super()._print_Function(e)


def nondimensional(ex):
    """The dimensionless form of every equation and condition of one example, as plain text for the page's parser."""
    spec = SCALES[ex["id"]]
    names = {v["symbol"] for v in ex["variables"]} | {"Delta_T", "DT_i"}
    coords = [c for c in ("x", "r", "t") if c in spec]
    X = {c: sympy.Symbol(HATS[c]) for c in coords}
    theta = sympy.Function("theta")(*[X[c] for c in coords])
    local = {n: sympy.Symbol(n) for n in names}
    T = sympy.Function("T")(*[local[c] for c in coords])
    local["T"] = T
    local["d"] = lambda f, *vs: sympy.diff(f, *vs)
    local["exp"] = sympy.exp
    local["R"] = sympy.Symbol("R")
    off, sc = (sympy.sympify(z, locals=local) for z in spec["T"])
    scales = {c: sympy.sympify(spec[c], locals=local) for c in coords}
    defs = {sympy.Symbol(k): sympy.sympify(v, locals=local) for k, v in spec["defs"].items()}
    out = []
    for item in [*ex["equations"], *ex["conditions"]]:
        if item.get("kind") in ("definition", "constraint"):
            continue
        lhs, rhs = (sympy.sympify(side.replace("^", "**"), locals=local) for side in item["text"].split("="))
        expr = lhs - rhs
        # T(x, t) -> offset + scale * theta(x/x_c, t/t_c); SymPy applies the chain rule; then x = x_c X, t = t_c tau.
        expr = expr.subs(T, off + sc * sympy.Function("theta")(*[local[c] / scales[c] for c in coords])).doit()
        expr = expr.subs({local[c]: scales[c] * X[c] for c in coords}).doit()
        expr = sympy.expand(expr.subs(defs))
        # Divide by the coefficient of the highest derivative of theta (space before time), else of theta.
        ders = sorted(expr.atoms(sympy.Derivative), key=lambda d: (-sum(int(n) for v, n in d.variable_count if str(v) != "tau"), -sum(int(n) for _, n in d.variable_count)))
        lead = ders[0] if ders else theta
        coef = sympy.Poly(expr, lead).coeff_monomial(lead) if expr.has(lead) else 1
        coef = sympy.factor(coef)
        num, _ = coef.as_coeff_Mul()
        factor = coef / num * abs(num)
        dimless = sympy.expand(sympy.simplify(expr / factor))
        out.append({"id": item["id"], "factor": Plain().doprint(factor), "dimensionless": Plain().doprint(dimless)})
    return {"example": ex["id"], "scales": {c: str(scales[c]) for c in coords} | {"T": f"{spec['T'][0]} + ({spec['T'][1]})*theta"}, "definitions": spec["defs"], "forms": out}


mpmath.mp.dps = 30
GEOMS = {"slab": 0, "cylinder": 1, "sphere": 2}


def mode(geom, lam, X):
    if geom == "slab":
        return mpmath.cos(lam * X)
    if geom == "cylinder":
        return mpmath.besselj(0, lam * X)
    return mpmath.sinc(lam * X)


def eigen(geom, Bi, n):
    """The first n eigenvalues, each by mpmath's bisection-type solver in its own bracket, and the coefficients
    C_k = int X^j f_k dX / int X^j f_k^2 dX by quadrature (independent of the closed forms on the page)."""
    j = GEOMS[geom]
    out = []
    for k in range(1, n + 1):
        if Bi == "inf":
            lam = {"slab": (k - mpmath.mpf(1) / 2) * mpmath.pi, "cylinder": mpmath.besseljzero(0, k), "sphere": k * mpmath.pi}[geom]
        else:
            B = mpmath.mpf(Bi)
            if geom == "slab":
                f, a, b = (lambda l: l * mpmath.sin(l) - B * mpmath.cos(l)), (k - 1) * mpmath.pi, (k - mpmath.mpf(1) / 2) * mpmath.pi
            elif geom == "cylinder":
                f, a, b = (lambda l: l * mpmath.besselj(1, l) - B * mpmath.besselj(0, l)), (mpmath.besseljzero(1, k - 1) if k > 1 else mpmath.mpf(0)), mpmath.besseljzero(0, k)
            else:
                f, a, b = (lambda l: l * mpmath.cos(l) - (1 - B) * mpmath.sin(l)), (k - 1) * mpmath.pi + (mpmath.mpf("1e-20") if k == 1 else 0), k * mpmath.pi
            lam = mpmath.findroot(f, (a, b), solver="anderson")
        w = lambda X: X ** j
        C = mpmath.quad(lambda X: w(X) * mode(geom, lam, X), [0, 1]) / mpmath.quad(lambda X: w(X) * mode(geom, lam, X) ** 2, [0, 1])
        out.append((lam, C))
    return out


def theta(geom, Bi, Fo, X, modes):
    return mpmath.fsum(C * mode(geom, lam, X) * mpmath.exp(-lam ** 2 * Fo) for lam, C in modes)


def small_bi(geom):
    """C_1 and lambda_1^2/((j+1)Bi) = 1 - sum mu_k Bi^k as series in Bi, from SymPy's series of the eigenvalue equation."""
    j = GEOMS[geom]
    s, B = sympy.symbols("s B", positive=True)
    lam = sympy.sqrt(s)
    order = 5
    bi_of_s = {"slab": lam * sympy.tan(lam), "cylinder": lam * sympy.besselj(1, lam) / sympy.besselj(0, lam), "sphere": 1 - lam * sympy.cot(lam)}[geom]
    ser = sympy.series(bi_of_s, s, 0, order).removeO()
    # Revert the series: s = a1 B + a2 B^2 + ... with ser(s) = B, coefficient by coefficient.
    a = sympy.symbols(f"a1:{order}")
    s_of_b = sum(a[i] * B ** (i + 1) for i in range(order - 1))
    eq = sympy.expand(sympy.series(ser.subs(s, s_of_b), B, 0, order).removeO() - B)
    sol = {}
    for i in range(order - 1):
        c = sympy.expand(eq.coeff(B, i + 1).subs(sol))
        sol[a[i]] = sympy.solve(c, a[i])[0]
    s_b = sympy.expand(s_of_b.subs(sol))
    ratio = sympy.expand(s_b / ((j + 1) * B))
    mu = [str(-ratio.coeff(B, k)) for k in range(1, 4)]
    c_of_s = {"slab": 4 * sympy.sin(lam) / (2 * lam + sympy.sin(2 * lam)), "cylinder": (2 / lam) * sympy.besselj(1, lam) / (sympy.besselj(0, lam) ** 2 + sympy.besselj(1, lam) ** 2),
              "sphere": 4 * (sympy.sin(lam) - lam * sympy.cos(lam)) / (2 * lam - sympy.sin(2 * lam))}[geom]
    c_ser = sympy.series(c_of_s, s, 0, order).removeO()
    c_b = sympy.expand(sympy.series(c_ser.subs(s, s_b), B, 0, 4).removeO())
    return {"geometry": geom, "C1": [str(c_b.coeff(B, k)) for k in range(4)], "mu": mu}


def conduction(examples):
    modes = []
    for geom in GEOMS:
        for Bi in [0.1, 1, 10, "inf"]:
            m = eigen(geom, Bi, 6)
            modes.append({"geometry": geom, "Bi": Bi, "lambda": [float(l) for l, _ in m], "C": [float(c) for _, c in m]})
    temps = []
    for geom in GEOMS:
        for Bi in [0.1, 1, 10]:
            m = eigen(geom, Bi, 40)
            for Fo in [0.01, 0.1, 0.5, 2]:
                xs = [0, 0.5, 1]
                temps.append({"geometry": geom, "Bi": Bi, "Fo": Fo, "X": xs, "theta": [float(theta(geom, Bi, Fo, mpmath.mpf(x), m)) for x in xs]})
    series = [small_bi(g) for g in GEOMS]
    # The slab with a source: theta'' + Gamma = 0, theta'(0) = 0, -theta'(1) = Bi theta(1), at Gamma = 1/5, Bi = 1/2.
    X = sympy.Symbol("X")
    th = sympy.Function("theta")
    G, Bi = sympy.Rational(1, 5), sympy.Rational(1, 2)
    sol = sympy.dsolve(th(X).diff(X, 2) + G, th(X), ics={th(X).diff(X).subs(X, 0): 0}).rhs
    c = [s_ for s_ in sol.free_symbols if s_ != X]
    sol = sol.subs(c[0], sympy.solve(-sol.diff(X).subs(X, 1) - Bi * sol.subs(X, 1), c[0])[0]) if c else sol
    source = {"Gamma": "1/5", "Bi": "1/2", "values": [[str(x), str(sympy.nsimplify(sol.subs(X, x)))] for x in [sympy.Integer(0), sympy.Rational(1, 2), sympy.Integer(1)]]}
    # The two-layer wall of the example: unknown face and interface temperatures and the heat flux, in exact rationals.
    ex = next(e for e in examples if e["id"] == "multilayer-wall")
    val = {v["symbol"]: sympy.Rational(v["value"]) for v in ex["variables"] if v.get("value")}
    T = {k: val[k] + sympy.Rational(27315, 100) for k in ("T_inf1", "T_inf2")}
    t0, t1, t2, t3, q = sympy.symbols("t0 t1 t2 t3 q")
    eqs = [q - val["h_1"] * (T["T_inf1"] - t0), q - val["k_1"] * (t0 - t1) / val["L_1"], q - (t1 - t2) / val["R_c"], q - val["k_2"] * (t2 - t3) / val["L_2"], q - val["h_2"] * (t3 - T["T_inf2"])]
    r = sympy.solve(eqs, [t0, t1, t2, t3, q])
    wall = {"q": str(r[q]), "nodes": [str(r[t0]), str(r[t1]), str(r[t2]), str(r[t3]), str(T["T_inf2"])]}
    # The fin at lambda^2 = 11/32 (the example), insulated tip.
    lam = mpmath.sqrt(mpmath.mpf(11) / 32)
    fin = {"lambda": float(lam), "Q": float(lam * mpmath.tanh(lam)), "efficiency": float(mpmath.tanh(lam) / lam),
           "profile": [[x, float(mpmath.cosh(lam * (1 - x)) / mpmath.cosh(lam))] for x in [0, 0.25, 0.5, 0.75, 1]]}
    lsym = sympy.Symbol("lambda")
    ts = sympy.series(lsym * sympy.tanh(lsym), lsym, 0, 10).removeO()
    fin["series"] = [str(ts.coeff(lsym, 2 * k)) for k in range(5)]
    xs = [0.001, 0.3, 1, 2.5, 5, 9.9, 12, 19.7, 24.9, 25.1, 30, 47.3, 100, 333.3]
    special = {"J0": [[x, float(mpmath.besselj(0, x))] for x in xs], "J1": [[x, float(mpmath.besselj(1, x))] for x in xs],
               "erf": [[x, float(mpmath.erf(x))] for x in [0.01, 0.5, 0.79, 0.81, 1.5, 3]],
               "erfc": [[x, float(mpmath.erfc(x))] for x in [0.01, 0.5, 0.79, 0.81, 1.5, 3, 5, 10, 25]],
               "erfcx": [[x, float(mpmath.exp(x * x) * mpmath.erfc(x))] for x in [0, 0.5, 0.79, 0.81, 3, 10, 100, 10000]],
               "j0zeros": [float(mpmath.besseljzero(0, k)) for k in range(1, 6)], "j1zeros": [float(mpmath.besseljzero(1, k)) for k in range(1, 6)]}
    return {"settings": {"digits": 30, "roots": "mpmath.findroot(anderson) in the bracket of each mode", "coefficients": "mpmath.quad of the weighted mode integrals", "series": "40 modes"},
            "modes": modes, "temperatures": temps, "smallBi": series, "source": source, "multilayer": wall, "fin": fin, "special": special}


def main():
    examples = json.loads((HERE / "data" / "examples.json").read_text(encoding="utf-8"))["examples"]
    quantities = {q["id"]: q for q in json.loads((HERE / "data" / "quantities.json").read_text(encoding="utf-8"))["quantities"]}
    out = []
    for ex in examples:
        pi = [v for v in resolved(examples, ex) if v.get("pi", True)]
        dims = []
        for v in pi:
            text = v.get("dimension") or quantities.get(v.get("quantity"), {}).get("dim")
            dims.append(dimension(text))
        # A variable whose unit, dimension and quantity disagree has no reference: the page blocks the Finder there.
        conflict = any(v.get("dimension") and v.get("quantity") and dimension(v["dimension"]) != dimension(quantities[v["quantity"]]["dim"]) for v in pi)
        if conflict:
            continue
        rows = [b for b in BASE if any(d[b] != 0 for d in dims)]
        D = sympy.Matrix([[d[b] for d in dims] for b in rows])
        kernel = D.nullspace()
        preferred = [next(i for i, v in enumerate(pi) if v["id"] == p) for p in ex.get("preferred", []) if any(v["id"] == p for v in pi)]
        rank = D.rank()
        det = None
        if len(preferred) == rank and rank:
            DR = D[:, preferred]
            # The rows of D_R: the first `rank` independent rows, in base order.
            picked = []
            for i in range(DR.rows):
                if sympy.Matrix([DR.row(j) for j in picked + [i]]).rank() == len(picked) + 1:
                    picked.append(i)
                if len(picked) == rank:
                    break
            det = str(sympy.Matrix([DR.row(i) for i in picked]).det())
        out.append({
            "example": ex["id"],
            "symbols": [v["symbol"] for v in pi],
            "rows": rows,
            "D": [[str(x) for x in D.row(i)] for i in range(D.rows)],
            "rank": int(rank),
            "groups": len(pi) - int(rank),
            "kernel": [[str(x) for x in vec] for vec in kernel],
            "preferred": [pi[i]["symbol"] for i in preferred],
            "det_DR": det,
        })
    nondim = [nondimensional(ex) for ex in examples if ex["id"] in SCALES]
    doc = {
        "about": "Reference values from SymPy's exact rational matrices, independent of the page's engine. Written by tools/references.py; CI compares the engine with this file and never runs the script.",
        "tool": "tools/references.py",
        "versions": {"python": platform.python_version(), "sympy": sympy.__version__, "mpmath": mpmath.__version__},
        "settings": {"arithmetic": "sympy.Rational (exact)", "kernel": "sympy.Matrix.nullspace", "rank": "sympy.Matrix.rank"},
        "cases": out,
        "nondimensional": nondim,
        "conduction": conduction(examples),
    }
    (HERE / "data" / "references.json").write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote data/references.json: {len(out)} cases, {len(nondim)} nondimensionalizations and the conduction references, sympy {sympy.__version__}, mpmath {mpmath.__version__}")


if __name__ == "__main__":
    main()
