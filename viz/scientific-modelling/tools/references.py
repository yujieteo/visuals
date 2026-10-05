"""Independent reference values for the Dimensionless Number Finder and the Model Nondimensionalizer, computed with SymPy.

The page's engine is its own exact JavaScript (src/rational.js, src/linalg.js, src/sym.js). This script recomputes,
for every example of data/examples.json, the dimension matrix of the Pi set, its rank, a kernel basis and the
determinant of D_R for the example's preferred repeating variables, with SymPy's exact rational matrices. For the
examples with equations it also substitutes the textbook scales below into every equation and condition, lets
SymPy apply the chain rule, and divides by the coefficient of the highest derivative of the field. It writes
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
}
HATS = {"x": "X", "t": "tau"}


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
    coords = [c for c in ("x", "t") if c in spec]
    X = {c: sympy.Symbol(HATS[c]) for c in coords}
    theta = sympy.Function("theta")(*[X[c] for c in coords])
    local = {n: sympy.Symbol(n) for n in names}
    T = sympy.Function("T")(*[local[c] for c in coords])
    local["T"] = T
    local["d"] = lambda f, *vs: sympy.diff(f, *vs)
    local["exp"] = sympy.exp
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
    }
    (HERE / "data" / "references.json").write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote data/references.json: {len(out)} cases and {len(nondim)} nondimensionalizations, sympy {sympy.__version__}")


if __name__ == "__main__":
    main()
