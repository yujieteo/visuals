"""Independent reference solver for BEAMDIAG, in exact rational arithmetic.

The browser engine (engine.js) uses the direct stiffness method. This script
solves the same beams a different way, so agreement is evidence rather than a
repeated calculation: the unknown support reactions and the two integration
constants of EI v'' = M(x) are found from global equilibrium plus the support
conditions (v = 0 at every support, v' = 0 at every fixed support), with M(x)
written in Macaulay (singularity-function) form. Every input float converts
exactly to a Fraction and the linear system is solved exactly, so the only
rounding is the final conversion back to float.

It also reads the NASTRAN bulk data the browser exports (read_bdf), so a deck
can be turned back into a beam model and checked against the model it came
from.

Units and signs match engine.js: SI; x along the beam, +y up; couples and
rotations counter-clockwise positive; V = sum of upward forces left of the
section; M sagging positive.

    python reference.py              # rewrite reference.json from fixtures.json
    python reference.py --check      # exit 1 if reference.json is out of date
"""

import json
import sys
from fractions import Fraction
from pathlib import Path

HERE = Path(__file__).resolve().parent


class Singular(Exception):
    pass


def F(x):
    return Fraction(x)


def mac(x, a, n):
    """Macaulay bracket <x - a>^n, with <x - a>^0 = 1 for x >= a (right limit)."""
    if x < a:
        return Fraction(0)
    return Fraction(1) if n == 0 else (x - a) ** n


def solve_exact(matrix, rhs):
    n = len(rhs)
    a = [row[:] + [r] for row, r in zip(matrix, rhs)]
    for c in range(n):
        p = next((r for r in range(c, n) if a[r][c] != 0), None)
        if p is None:
            raise Singular("singular system: the supports do not hold the beam")
        a[c], a[p] = a[p], a[c]
        for r in range(n):
            if r != c and a[r][c] != 0:
                m = a[r][c] / a[c][c]
                a[r] = [x - m * y for x, y in zip(a[r], a[c])]
    return [a[i][n] / a[i][i] for i in range(n)]


class Beam:
    """A solved beam. Terms are (coefficient, position, power) of EI v''."""

    def __init__(self, model):
        self.L = F(model["length"])
        self.EI = F(model["material"]["E"]) * F(model["section"]["I"])
        self.supports = sorted(({"kind": s["kind"], "x": F(s["x"])} for s in model["supports"]), key=lambda s: s["x"])
        self.loads = model["loads"]
        # Unknowns: R_i for each support, M_i for each fixed support, then C1, C2.
        unknowns = []
        for i, s in enumerate(self.supports):
            unknowns.append(("R", i))
            if s["kind"] == "fixed":
                unknowns.append(("M", i))
        unknowns += [("C1", None), ("C2", None)]
        index = {u: k for k, u in enumerate(unknowns)}
        n = len(unknowns)

        # Known load terms of M(x): list of (coef, a, power) meaning coef*<x-a>^power.
        known = []
        for load in self.loads:
            if load["kind"] == "point":
                known.append((F(load["F"]), F(load["x"]), 1))
            elif load["kind"] == "moment":
                known.append((-F(load["C"]), F(load["x"]), 0))
            elif load["kind"] == "dist":
                x1, x2, q1, q2 = F(load["x1"]), F(load["x2"]), F(load["q1"]), F(load["q2"])
                s = (q2 - q1) / (x2 - x1)
                known += [(q1 / 2, x1, 2), (s / 6, x1, 3), (-q2 / 2, x2, 2), (-s / 6, x2, 3)]
        self.known = known

        rows, rhs = [], []
        # Equilibrium: sum of vertical forces, and sum of moments about x = 0.
        force_row, moment_row = [Fraction(0)] * n, [Fraction(0)] * n
        load_force, load_moment = self.load_resultants()
        for i, s in enumerate(self.supports):
            force_row[index[("R", i)]] = Fraction(1)
            moment_row[index[("R", i)]] = s["x"]
            if s["kind"] == "fixed":
                moment_row[index[("M", i)]] = Fraction(1)
        rows += [force_row, moment_row]
        rhs += [-load_force, -load_moment]

        # Support conditions from EI v = sum coef <x-a>^(p+2) / ((p+1)(p+2)) + C1 x + C2.
        def ev(x, derivative):
            row = [Fraction(0)] * n
            k = 1 if derivative else 2
            for i, s in enumerate(self.supports):
                row[index[("R", i)]] += integrate(1, s["x"], 1, k, x)
                if s["kind"] == "fixed":
                    row[index[("M", i)]] += integrate(-1, s["x"], 0, k, x)
            if derivative:
                row[index[("C1", None)]] = Fraction(1)
            else:
                row[index[("C1", None)]] = x
                row[index[("C2", None)]] = Fraction(1)
            known_value = sum((integrate(c, a, p, k, x) for c, a, p in known), Fraction(0))
            return row, -known_value

        for s in self.supports:
            r, b = ev(s["x"], False)
            rows.append(r)
            rhs.append(b)
            if s["kind"] == "fixed":
                r, b = ev(s["x"], True)
                rows.append(r)
                rhs.append(b)
        if len(rows) != n:
            raise Singular("unknowns and conditions do not match")
        solution = solve_exact(rows, rhs)
        self.reactions = []
        for i, s in enumerate(self.supports):
            R = solution[index[("R", i)]]
            M = solution[index[("M", i)]] if s["kind"] == "fixed" else Fraction(0)
            self.reactions.append({"kind": s["kind"], "x": s["x"], "Fy": R, "Mz": M})
        self.C1 = solution[index[("C1", None)]]
        self.C2 = solution[index[("C2", None)]]
        self.terms = list(known)
        for r in self.reactions:
            self.terms.append((r["Fy"], r["x"], 1))
            self.terms.append((-r["Mz"], r["x"], 0))

    def load_resultants(self):
        force = moment = Fraction(0)
        for load in self.loads:
            if load["kind"] == "point":
                force += F(load["F"])
                moment += F(load["F"]) * F(load["x"])
            elif load["kind"] == "moment":
                moment += F(load["C"])
            elif load["kind"] == "dist":
                x1, x2, q1, q2 = F(load["x1"]), F(load["x2"]), F(load["q1"]), F(load["q2"])
                b = x2 - x1
                force += (q1 + q2) * b / 2
                moment += q1 * b / 2 * (x1 + b / 3) + q2 * b / 2 * (x1 + 2 * b / 3)
        return force, moment

    def M(self, x, side="right"):
        """Bending moment; side="left" gives the limit from the left."""
        x = F(x)
        return sum((c * self._bracket(x, a, p, side) for c, a, p in self.terms), Fraction(0))

    def V(self, x, side="right"):
        x = F(x)
        total = Fraction(0)
        for c, a, p in self.terms:
            if p >= 1:
                total += c * p * self._bracket(x, a, p - 1, side)
        return total

    @staticmethod
    def _bracket(x, a, n, side):
        if side == "left" and n == 0:
            return Fraction(1) if x > a else Fraction(0)
        return mac(x, a, n)

    def v(self, x):
        x = F(x)
        return (sum((integrate(c, a, p, 2, x) for c, a, p in self.terms), Fraction(0)) + self.C1 * x + self.C2) / self.EI

    def theta(self, x):
        x = F(x)
        return (sum((integrate(c, a, p, 1, x) for c, a, p in self.terms), Fraction(0)) + self.C1) / self.EI


def integrate(c, a, p, k, x):
    """k-fold integral of c<x-a>^p evaluated at x."""
    power = p + k
    denominator = 1
    for m in range(p + 1, p + k + 1):
        denominator *= m
    return c * mac(F(x), a, power) / denominator


def sample_points(model):
    """Every event position, quarter points of the beam and the midpoint between each neighbouring pair."""
    L = F(model["length"])
    xs = {F(0), L, L / 4, L / 2, 3 * L / 4}
    for s in model["supports"]:
        xs.add(F(s["x"]))
    for load in model["loads"]:
        for key in ("x", "x1", "x2"):
            if key in load:
                xs.add(F(load[key]))
    xs = sorted(xs)
    return sorted(xs + [(a + b) / 2 for a, b in zip(xs, xs[1:])])


def solve_fixture(model):
    beam = Beam(model)
    L = beam.L
    points = []
    for x in sample_points(model):
        points.append({
            "x": float(x),
            "Vleft": float(beam.V(x, "left")) if x > 0 else 0.0,
            "Vright": float(beam.V(x, "right")) if x < L else 0.0,
            "Mleft": float(beam.M(x, "left")) if x > 0 else 0.0,
            "Mright": float(beam.M(x, "right")) if x < L else 0.0,
            "v": float(beam.v(x)),
            "theta": float(beam.theta(x)),
        })
    reactions = [{"kind": r["kind"], "x": float(r["x"]), "Fy": float(r["Fy"]), "Mz": float(r["Mz"])} for r in beam.reactions]
    return {"reactions": reactions, "points": points}


# ---------- NASTRAN bulk data reader (the subset BEAMDIAG writes) ----------

def _fields(entry_lines):
    """Split one entry (a head line plus continuations) into its data fields."""
    head = entry_lines[0]
    if "," in head:
        return [f.strip() for f in ",".join(entry_lines).split(",")]
    large = head[:8].rstrip().endswith("*")
    width = 16 if large else 8
    fields = [head[:8].strip().rstrip("*")]
    for i, line in enumerate(entry_lines):
        body = line[8:8 + 4 * width] if large else line[8:72]
        count = 4 if large else 8
        body = body.ljust(count * width)
        fields += [body[j * width:(j + 1) * width].strip() for j in range(count)]
    return fields


def _real(text):
    text = text.strip().upper().replace("D", "E")
    if not text:
        return 0.0
    if "E" not in text:
        # NASTRAN allows an exponent without E, e.g. 1.0+5.
        for i in range(len(text) - 1, 0, -1):
            if text[i] in "+-" and text[i - 1] != "E":
                text = text[:i] + "E" + text[i:]
                break
    if "." not in text.split("E")[0]:
        raise ValueError(f"real field without a decimal point: {text!r}")
    return float(text)


def read_bdf(text):
    """Parse a BEAMDIAG deck into its case control and bulk entries."""
    lines = [line.rstrip("\n") for line in text.splitlines()]
    begin = next(i for i, line in enumerate(lines) if line.strip().upper() == "BEGIN BULK")
    executive_case = [line for line in lines[:begin] if line.strip() and not line.startswith("$")]
    entries, current = [], None
    for line in lines[begin + 1:]:
        if not line.strip() or line.startswith("$"):
            continue
        if line.strip().upper() == "ENDDATA":
            break
        if line[:1] in ("*", "+", " ") and current is not None and not line[:8].strip().rstrip("*").isalpha():
            current.append(line)
            continue
        current = [line]
        entries.append(current)
    return executive_case, [_fields(e) for e in entries]


def model_from_bdf(text):
    """Rebuild the planar beam model a BEAMDIAG deck encodes, checking its assumptions."""
    executive_case, entries = read_bdf(text)
    case = {}
    for line in executive_case:
        if "=" in line:
            key, value = (part.strip().upper() for part in line.split("=", 1))
            case[key] = value
    grids, bars, spc1, forces, moments, ploads = {}, [], [], [], [], []
    mat = prop = None
    params, grdset = {}, {"cp": "", "cd": "", "ps": ""}
    for f in entries:
        name = f[0].upper()
        if name == "GRID":
            grids[int(f[1])] = {"cp": f[2], "xyz": tuple(_real(v) for v in f[3:6]), "cd": f[6], "ps": f[7]}
        elif name == "GRDSET":
            grdset = {"cp": f[2], "cd": f[6], "ps": f[7]}
        elif name == "CBAR":
            bars.append({"eid": int(f[1]), "pid": int(f[2]), "ga": int(f[3]), "gb": int(f[4]), "v": tuple(_real(v) for v in f[5:8])})
        elif name == "MAT1":
            mat = {"mid": int(f[1]), "E": _real(f[2]), "G": f[3], "nu": _real(f[4])}
        elif name == "PBAR":
            prop = {"pid": int(f[1]), "mid": int(f[2]), "A": _real(f[3]), "I1": _real(f[4]), "I2": _real(f[5]), "J": _real(f[6])}
        elif name == "SPC1":
            spc1.append({"sid": int(f[1]), "c": f[2], "grids": [int(g) for g in f[3:] if g]})
        elif name == "FORCE":
            forces.append({"sid": int(f[1]), "g": int(f[2]), "cid": int(f[3] or 0), "F": _real(f[4]), "n": tuple(_real(v) for v in f[5:8])})
        elif name == "MOMENT":
            moments.append({"sid": int(f[1]), "g": int(f[2]), "cid": int(f[3] or 0), "M": _real(f[4]), "n": tuple(_real(v) for v in f[5:8])})
        elif name == "PLOAD1":
            ploads.append({"sid": int(f[1]), "eid": int(f[2]), "type": f[3].upper(), "scale": f[4].upper(),
                           "x1": _real(f[5]), "p1": _real(f[6]), "x2": _real(f[7]), "p2": _real(f[8])})
        elif name == "PARAM":
            params[f[1].upper()] = f[2]
        else:
            raise ValueError(f"unexpected bulk entry {name}")

    # Blank CP, CD and PS fields on a GRID take their values from GRDSET.
    for g in grids.values():
        for key in ("cp", "cd", "ps"):
            g[key] = g[key] or grdset[key]

    spc_set, load_set = int(case["SPC"]), int(case["LOAD"])
    if mat is None or prop is None or prop["mid"] != mat["mid"]:
        raise ValueError("PBAR must reference the MAT1")
    for g in grids.values():
        if g["xyz"][1] != 0 or g["xyz"][2] != 0 or g["cp"] or g["cd"] or g["ps"] != "345":
            raise ValueError("every GRID must lie on basic X with PS=345")
    xs = {gid: g["xyz"][0] for gid, g in grids.items()}
    L = max(xs.values()) - min(xs.values())
    x0 = min(xs.values())
    bars_by_eid = {}
    for b in bars:
        if b["pid"] != prop["pid"] or b["v"] != (0.0, 1.0, 0.0):
            raise ValueError("every CBAR must use the PBAR and orientation vector +Y")
        if not xs[b["gb"]] > xs[b["ga"]]:
            raise ValueError("CBAR must run in +X")
        bars_by_eid[b["eid"]] = b
    # The bars must form one chain from x0 to x0 + L.
    chain = sorted((xs[b["ga"]], xs[b["gb"]]) for b in bars)
    for (a0, a1), (b0, _b1) in zip(chain, chain[1:]):
        if a1 != b0:
            raise ValueError("CBAR elements must form one continuous chain")

    supports = []
    for s in spc1:
        if s["sid"] != spc_set:
            continue
        kind = {"12": "pin", "126": "fixed"}.get(s["c"])
        if kind is None:
            raise ValueError(f"unexpected SPC1 components {s['c']}")
        supports += [{"kind": kind, "x": xs[g] - x0} for g in s["grids"]]
    loads = []
    for f in forces:
        if f["sid"] != load_set or f["cid"] != 0 or f["n"] != (0.0, 1.0, 0.0):
            raise ValueError("FORCE must act along basic +Y in the selected load set")
        loads.append({"kind": "point", "x": xs[f["g"]] - x0, "F": f["F"]})
    for m in moments:
        if m["sid"] != load_set or m["cid"] != 0 or m["n"] != (0.0, 0.0, 1.0):
            raise ValueError("MOMENT must act about basic +Z in the selected load set")
        loads.append({"kind": "moment", "x": xs[m["g"]] - x0, "C": m["M"]})
    for p in ploads:
        if p["sid"] != load_set or p["type"] != "FY" or p["scale"] != "FR" or (p["x1"], p["x2"]) != (0.0, 1.0):
            raise ValueError("PLOAD1 must be FY over the whole element with SCALE=FR")
        b = bars_by_eid[p["eid"]]
        loads.append({"kind": "dist", "x1": xs[b["ga"]] - x0, "x2": xs[b["gb"]] - x0, "q1": p["p1"], "q2": p["p2"]})
    return {
        "case": case,
        "params": params,
        "model": {
            "length": L,
            "material": {"E": mat["E"], "nu": mat["nu"]},
            "section": {"A": prop["A"], "I": prop["I1"], "Iy": prop["I2"], "J": prop["J"]},
            "supports": supports,
            "loads": loads,
        },
        "grids": len(grids),
        "elements": len(bars),
    }


def build_reference():
    fixtures = json.loads((HERE / "fixtures.json").read_text(encoding="utf-8"))
    cases = []
    for fixture in fixtures["cases"]:
        cases.append({"id": fixture["id"], **solve_fixture(fixture["model"])})
    return {"generator": "reference.py (exact Macaulay integration)", "cases": cases}


def main(argv):
    text = json.dumps(build_reference(), indent=1) + "\n"
    target = HERE / "reference.json"
    if "--check" in argv:
        if target.read_text(encoding="utf-8") != text:
            print("reference.json is out of date; run python reference.py", file=sys.stderr)
            return 1
        return 0
    target.write_text(text, encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
