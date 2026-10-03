"""Measure every torsion formula the page uses against the numerical Prandtl reference.

For each formula this runs the browser engine's own formula (src/torsion.js, through
node) on a sweep of shapes inside the formula's domain, solves the same shapes with
prandtl.py, and records the largest relative error. A formula passes when that error
is within the accuracy stated here; the page shows "n/a" for any formula that fails.

    python torsion_accuracy.py            write torsion-accuracy.json
    python torsion_accuracy.py --check    recompute and fail if the file disagrees

Needs numpy, scipy and node.
"""

from __future__ import annotations

import json
import math
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import prandtl  # noqa: E402

OUT = HERE / "torsion-accuracy.json"

EXACT = "exact solution; the stated bound is the reference's own accuracy"
STATED = {
    "circle": (1e-4, "exact", EXACT),
    "chs": (1e-4, "exact", EXACT),
    "semicircle": (1e-4, "exact (Saint-Venant)", EXACT),
    "triangle-equilateral": (1e-4, "exact (Saint-Venant)", EXACT),
    "rect": (1e-4, "Saint-Venant series", "series summed to convergence; the stated bound is the reference's own accuracy"),
    "rhs-bredt-sharp": (0.06, "Bredt–Batho (thin wall)", "sharp or mixed corners, t ≤ 0.1 of the smaller outside dimension; the formula underestimates J"),
    "open-thin-wall": (0.06, "Vlasov thin-walled open section", "sharp-cornered I, channel, Z, tee, angle and cross sections with walls up to 0.15 of the smaller outside dimension and the thicker wall at most 1.4 times the thinner; the formula overestimates J for the I, channel, Z, tee and angle and underestimates it for the cross"),
    "cold-formed-thin-wall": (0.05, "Vlasov thin-walled open section (uniform wall)", "cold-formed angle, plain and lipped channel and Z, and top hat with t ≤ 0.1 of the smaller of b and h and any inside bend radius; the formula overestimates J"),
    "rhs-bredt-rounded": (0.035, "Bredt–Batho (thin wall)", "uniform rounded corners (inner radius = outer − t), t ≤ 0.1 of the smaller outside dimension; the formula underestimates J"),
}


def cases():
    out = [
        ("circle", {"d": 100.0}, []),
        ("circle", {"d": 7.5}, []),
        ("chs", {"d": 100.0, "t": 2.0}, []),
        ("chs", {"d": 100.0, "t": 10.0}, []),
        ("chs", {"d": 100.0, "t": 45.0}, []),
        ("semicircle", {"d": 100.0}, []),
        ("triangle", {"b": 100.0, "h": 100.0 * math.sqrt(3) / 2, "a": 50.0}, [0, 0, 0]),
        ("rect", {"b": 100.0, "h": 100.0}, [0, 0, 0, 0]),
        ("rect", {"b": 100.0, "h": 200.0}, [0, 0, 0, 0]),
        ("rect", {"b": 500.0, "h": 100.0}, [0, 0, 0, 0]),
        ("rect", {"b": 20.0, "h": 200.0}, [0, 0, 0, 0]),
    ]
    for b, h in ((100.0, 100.0), (100.0, 200.0), (100.0, 400.0)):
        for ratio in (0.02, 0.05, 0.1):
            t = ratio * min(b, h)
            for corners in ("sharp", "mixed", "r=t", "r=2t", "r=3t"):
                if corners == "sharp":
                    radii = [0.0] * 8
                elif corners == "mixed":
                    radii = [2 * t, 0.0, 2 * t, 0.0, t, 0.0, t, 0.0]
                else:
                    k = {"r=t": 1, "r=2t": 2, "r=3t": 3}[corners]
                    radii = [k * t] * 4 + [(k - 1) * t] * 4
                out.append(("rhs", {"b": b, "h": h, "t": t}, radii))
    # Thin-walled open sections: typical proportions, then the corners of the domain at b = h (where the
    # error is largest): stockiest walls at 0.15 min(b, h), each wall in turn the thicker at the 1.4 ratio limit.
    open_cases = [
        ("ishape", {"b": 150.0, "h": 300.0, "tf": 10.7, "tw": 8.0}), ("ishape", {"b": 200.0, "h": 600.0, "tf": 10.0, "tw": 7.5}),
        ("ishape", {"b": 100.0, "h": 100.0, "tf": 15.0, "tw": 15.0}),
        ("channel", {"b": 100.0, "h": 300.0, "tf": 15.0, "tw": 11.0}), ("channel", {"b": 60.0, "h": 100.0, "tf": 9.0, "tw": 9.0}),
        ("zed", {"b": 80.0, "h": 200.0, "tf": 10.0, "tw": 8.0}), ("zed", {"b": 60.0, "h": 100.0, "tf": 9.0, "tw": 9.0}),
        ("tee", {"b": 150.0, "h": 150.0, "tf": 12.0, "tw": 9.0}), ("tee", {"b": 100.0, "h": 100.0, "tf": 15.0, "tw": 15.0}),
        ("angle", {"b": 100.0, "h": 100.0, "t": 10.0}), ("angle", {"b": 150.0, "h": 90.0, "t": 6.0}), ("angle", {"b": 100.0, "h": 100.0, "t": 15.0}),
        ("angle", {"b": 100.0, "h": 60.0, "t": 9.0}),
        ("cross", {"b": 200.0, "h": 200.0, "tb": 10.0, "th": 10.0}), ("cross", {"b": 200.0, "h": 200.0, "tb": 30.0, "th": 30.0}),
        ("cross", {"b": 300.0, "h": 150.0, "tb": 16.0, "th": 20.0}),
    ]
    for shape in ("ishape", "channel", "zed", "tee", "cross"):
        thick, thin = ("tb", "th") if shape == "cross" else ("tf", "tw")
        open_cases += [(shape, {"b": 140.0, "h": 140.0, thick: 21.0, thin: 15.0}), (shape, {"b": 140.0, "h": 140.0, thick: 15.0, thin: 21.0})]
    corners = {"ishape": 12, "channel": 8, "zed": 8, "tee": 8, "angle": 6, "cross": 12}
    out += [(s, d, [0.0] * corners[s]) for s, d in open_cases]
    # Cold-formed strips: typical gauges, and walls at 0.1 of the smaller outer dimension with sharp to generous bends.
    cold_cases = [
        ("cfangle", {"b": 80.0, "h": 80.0, "t": 3.0, "ri": 3.0}), ("cfangle", {"b": 50.0, "h": 30.0, "t": 3.0, "ri": 0.0}),
        ("cfangle", {"b": 40.0, "h": 40.0, "t": 4.0, "ri": 16.0}), ("cfangle", {"b": 40.0, "h": 40.0, "t": 4.0, "ri": 0.0}),
        ("cfchannel", {"h": 200.0, "b": 75.0, "c": 20.0, "t": 2.0, "ri": 3.0}), ("cfchannel", {"h": 200.0, "b": 75.0, "c": 0.0, "t": 2.0, "ri": 3.0}),
        ("cfchannel", {"h": 40.0, "b": 40.0, "c": 0.0, "t": 4.0, "ri": 4.0}), ("cfchannel", {"h": 60.0, "b": 40.0, "c": 9.0, "t": 4.0, "ri": 1.0}),
        ("cfchannel", {"h": 40.0, "b": 40.0, "c": 12.0, "t": 4.0, "ri": 2.0}),
        ("cfzed", {"h": 200.0, "b": 70.0, "c": 20.0, "t": 2.0, "ri": 3.0}), ("cfzed", {"h": 40.0, "b": 40.0, "c": 9.0, "t": 4.0, "ri": 1.0}),
        ("cfzed", {"h": 40.0, "b": 40.0, "c": 0.0, "t": 4.0, "ri": 8.0}),
        ("cfhat", {"h": 60.0, "b": 60.0, "f": 25.0, "t": 1.5, "ri": 2.0}), ("cfhat", {"h": 40.0, "b": 40.0, "f": 6.0, "t": 4.0, "ri": 0.0}),
        ("cfhat", {"h": 40.0, "b": 40.0, "f": 12.0, "t": 4.0, "ri": 4.0}), ("cfhat", {"h": 40.0, "b": 80.0, "f": 8.0, "t": 4.0, "ri": 2.0}),
    ]
    out += [(s, d, []) for s, d in cold_cases]
    return out


NODE = r"""
const T = require(process.argv[1] + "/../src/torsion.js");
const cases = JSON.parse(require("fs").readFileSync(0, "utf8"));
process.stdout.write(JSON.stringify(cases.map(([s, d, r]) => T.formula(s, d, r))));
"""


def js_formulas(items):
    node = shutil.which("node")
    if node is None:
        raise SystemExit("node is required to evaluate the page's torsion formulas")
    run = subprocess.run([node, "-e", NODE, str(HERE)], input=json.dumps(items), check=True, capture_output=True, text=True)
    return json.loads(run.stdout)


def measure():
    items = cases()
    formulas = js_formulas(items)
    table = {}
    for (shape, dims, radii), f in zip(items, formulas):
        if "reason" in f:
            raise SystemExit(f"{shape} {dims} {radii}: expected a formula, got n/a ({f['reason']})")
        ref = prandtl.shape_torsion(shape, dims, radii)
        rel = f["J"] / ref["J"] - 1
        entry = table.setdefault(f["id"], {"checks": []})
        entry["checks"].append({
            "shape": shape, "dims": {k: round(v, 12) for k, v in dims.items()}, "radii": radii,
            "J_formula": float(f"{f['J']:.10g}"), "J_reference": float(f"{ref['J']:.10g}"),
            "reference_error": float(f"{ref['error'] / ref['J']:.3g}"), "rel_error": float(f"{rel:.4g}"),
        })
    out = {}
    for fid, (stated, method, note) in STATED.items():
        checks = table.get(fid, {"checks": []})["checks"]
        if not checks:
            raise SystemExit(f"formula {fid} has no accuracy cases")
        measured = max(abs(c["rel_error"]) for c in checks)
        out[fid] = {"method": method, "stated": stated, "measured": float(f"{measured:.3g}"), "cases": len(checks),
                    "pass": measured <= stated, "note": note, "checks": checks}
    unknown = set(table) - set(STATED)
    if unknown:
        raise SystemExit(f"formulas without a stated accuracy: {sorted(unknown)}")
    return {
        "generated_by": "reference/torsion_accuracy.py",
        "reference": "Prandtl stress function by linear finite elements: coarse Delaunay mesh (spacing ≤ min(wall)/2.5 for shapes with wall dimensions), three uniform refinements with boundary points on the true arcs, Richardson extrapolation at the observed order",
        "formulas": out,
    }


def agrees(a, b):
    if set(a["formulas"]) != set(b["formulas"]):
        return False
    for fid, x in a["formulas"].items():
        y = b["formulas"][fid]
        if x["pass"] != y["pass"] or x["cases"] != y["cases"] or x["stated"] != y["stated"]:
            return False
        if abs(x["measured"] - y["measured"]) > max(0.05 * abs(y["measured"]), 1e-7):
            return False
    return True


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    data = measure()
    if "--check" in argv:
        stored = json.loads(OUT.read_text(encoding="utf-8"))
        if not agrees(data, stored):
            print("torsion-accuracy.json is out of date; run python torsion_accuracy.py", file=sys.stderr)
            return 1
        return 0
    OUT.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    for fid, x in data["formulas"].items():
        print(f"{fid:22s} cases {x['cases']:3d}  measured {x['measured']:.3g}  stated {x['stated']}  {'pass' if x['pass'] else 'FAIL'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
