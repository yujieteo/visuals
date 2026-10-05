"""Independent reference values for the Dimensionless Number Finder, computed with SymPy.

The page's engine is its own exact JavaScript (src/rational.js, src/linalg.js). This script recomputes, for every
example of data/examples.json, the dimension matrix of the Pi set, its rank, a kernel basis and the determinant of
D_R for the example's preferred repeating variables, with SymPy's exact rational matrices, and writes
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
    doc = {
        "about": "Reference values from SymPy's exact rational matrices, independent of the page's engine. Written by tools/references.py; CI compares the engine with this file and never runs the script.",
        "tool": "tools/references.py",
        "versions": {"python": platform.python_version(), "sympy": sympy.__version__, "mpmath": mpmath.__version__},
        "settings": {"arithmetic": "sympy.Rational (exact)", "kernel": "sympy.Matrix.nullspace", "rank": "sympy.Matrix.rank"},
        "cases": out,
    }
    (HERE / "data" / "references.json").write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote data/references.json: {len(out)} cases, sympy {sympy.__version__}")


if __name__ == "__main__":
    main()
