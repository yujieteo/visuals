"""Write the shared test fixtures and the Python reference results.

    python build_reference.py            write fixtures.json and reference.json
    python build_reference.py --check    fail if either file is out of date

fixtures.json    every case in cases.py: model and closed-form expectations
reference.json   per case: section properties from sectionref.py (exact primitive
                 decomposition) and, for plastic cases, the M–κ curve at nine
                 evenly spaced curvatures up to ε_lim and the σ0.2-block moment at
                 N = 0 (and at the applied N when it is not 0) from plasticref.py
                 (needs numpy and scipy)
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import cases as C  # noqa: E402
import sectionref as R  # noqa: E402

FIXTURES = HERE / "fixtures.json"
REFERENCE = HERE / "reference.json"


def sig(x, digits=15):
    return float(f"{x:.{digits}g}")


def reference():
    import plasticref as P
    out = {}
    for case in C.CASES:
        m = case["model"]
        props = {k: sig(v) for k, v in R.properties(m).items()}
        entry = {"properties": props}
        if case["plastic"]:
            angle = P.axis_angle(m, m["plastic"]["axis"])
            S = P.Section(m, angle)
            N = m["plastic"]["N"]
            curve = S.curve(N)
            entry["plastic"] = {
                "angle": sig(angle), "kappa_lim": sig(curve["kappa_lim"]), "M_lim": sig(curve["M_lim"]),
                "points": [{"kappa": sig(p["kappa"]), "M": sig(p["M"])} for p in curve["points"]],
                "Mp": sig(S.plastic_moment(0.0)["M"]),
                **({"MpN": sig(S.plastic_moment(N)["M"])} if N else {}),
            }
        out[case["id"]] = entry
    return {"generated_by": "reference/build_reference.py", "cases": out}


def fixtures():
    return {"generated_by": "reference/build_reference.py from reference/cases.py", "cases": C.CASES}


def dump(data):
    return json.dumps(data, indent=1, ensure_ascii=False) + "\n"


# Length dimension of each property. A value that is 0 up to rounding (cx of a symmetric
# section, M at κ = 0 under an axial force) differs between numpy/libm builds, so it is
# compared on the section's own scale, as the JS tests do (tests/helpers.mjs).
DIM = {"A": 2, "cx": 1, "cy": 1, "Ix": 4, "Iy": 4, "Ixy": 4, "I1": 4, "I2": 4, "Ip": 4,
       "Sx_top": 3, "Sx_bottom": 3, "Sy_right": 3, "Sy_left": 3, "rx": 1, "ry": 1, "rp": 1, "Qx": 3, "Qy": 3}


def near(a, b, floor=0.0):
    return abs(a - b) <= 1e-9 * max(abs(a), abs(b), floor)


def close(a, b):
    if a.keys() != b.keys() or a["generated_by"] != b["generated_by"] or a["cases"].keys() != b["cases"].keys():
        return False
    for cid, x in a["cases"].items():
        y = b["cases"][cid]
        px, py = x["properties"], y["properties"]
        if x.keys() != y.keys() or px.keys() != py.keys():
            return False
        size = abs(px["A"]) ** 0.5
        if not all(near(px[k], py[k], size ** DIM[k]) for k in px):
            return False
        if "plastic" in x:
            gx, gy = x["plastic"], y["plastic"]
            scalars = [k for k in gx if k != "points"]
            if gx.keys() != gy.keys() or len(gx["points"]) != len(gy["points"]):
                return False
            if not all(near(gx[k], gy[k], 1.0 if k == "angle" else 0.0) for k in scalars):
                return False
            if not all(near(p["kappa"], q["kappa"], abs(gx["kappa_lim"])) and near(p["M"], q["M"], abs(gx["M_lim"]))
                       for p, q in zip(gx["points"], gy["points"])):
                return False
    return True


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    fx, ref = fixtures(), reference()
    if "--check" in argv:
        ok = True
        if not FIXTURES.exists() or json.loads(FIXTURES.read_text(encoding="utf-8")) != json.loads(dump(fx)):
            print("fixtures.json is out of date; run python build_reference.py", file=sys.stderr)
            ok = False
        if not REFERENCE.exists() or not close(json.loads(REFERENCE.read_text(encoding="utf-8")), json.loads(dump(ref))):
            print("reference.json is out of date; run python build_reference.py", file=sys.stderr)
            ok = False
        return 0 if ok else 1
    FIXTURES.write_text(dump(fx), encoding="utf-8")
    REFERENCE.write_text(dump(ref), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
