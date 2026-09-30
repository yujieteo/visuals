import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from fractions import Fraction
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VIZ = ROOT
sys.path.insert(0, str(VIZ))

import reference  # noqa: E402

FIXTURES = json.loads((VIZ / "fixtures.json").read_text(encoding="utf-8"))

# Solve every fixture with the browser engine and export its NASTRAN deck.
NODE_SCRIPT = r"""
const B = require(process.argv[1] + "/engine.js");
const fixtures = require(process.argv[1] + "/fixtures.json");
const out = {};
for (const c of fixtures.cases) {
  const r = B.solve(c.model);
  const xs = [...new Set([0, r.model.length, ...r.model.supports.map((s) => s.x),
    ...r.model.loads.flatMap((l) => (l.kind === "dist" ? [l.x1, l.x2] : [l.x]))])];
  const units = Object.fromEntries(Object.keys(B.UNIT_SYSTEMS).map((u) => [u, B.exportBdf(c.model, { units: u })]));
  out[c.id] = { reactions: r.reactions, points: xs.map((x) => B.at(r, x)), bdf: B.exportBdf(c.model), units };
}
out["@units"] = B.UNIT_SYSTEMS;
process.stdout.write(JSON.stringify(out));
"""


def node_results():
    node = shutil.which("node")
    if node is None:
        raise AssertionError("node is required to cross-check the browser engine")
    run = subprocess.run([node, "-e", NODE_SCRIPT, str(VIZ)], check=True, capture_output=True, text=True)
    return json.loads(run.stdout)


def value(beam, quantity, x):
    L = beam.L
    reaction = next((r for r in beam.reactions if r["x"] == Fraction(x)), None)
    return {
        "R": lambda: reaction["Fy"], "Mr": lambda: reaction["Mz"],
        "M": lambda: beam.M(x, "left" if Fraction(x) == L else "right"),
        "Mleft": lambda: beam.M(x, "left"), "Mright": lambda: beam.M(x, "right"),
        "Vleft": lambda: beam.V(x, "left"), "Vright": lambda: beam.V(x, "right"),
        "v": lambda: beam.v(x), "theta": lambda: beam.theta(x),
    }[quantity]()


class _Ids(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids, self.scripts = set(), []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if "id" in attrs:
            self.ids.add(attrs["id"])
        if tag == "script":
            self.scripts.append(attrs)
        if tag == "link" and attrs.get("rel") == "stylesheet":
            self.scripts.append(attrs)


class BeamDiagTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.js = node_results()

    def test_reference_json_is_current(self):
        self.assertEqual(reference.main(["--check"]), 0)

    def test_python_reference_matches_closed_forms(self):
        checked = 0
        for case in FIXTURES["cases"]:
            beam = reference.Beam(case["model"])
            for e in case["expect"]:
                got = float(value(beam, e["quantity"], e["x"]))
                self.assertAlmostEqual(got, e["value"], delta=1e-9 * max(1.0, abs(e["value"])), msg=f"{case['id']} {e['formula']}")
                checked += 1
        self.assertGreaterEqual(checked, 40)

    def test_python_reference_is_exactly_in_equilibrium_and_compatible(self):
        for case in FIXTURES["cases"]:
            beam = reference.Beam(case["model"])
            force, moment = beam.load_resultants()
            self.assertEqual(force + sum(r["Fy"] for r in beam.reactions), 0, case["id"])
            self.assertEqual(moment + sum(r["Fy"] * r["x"] + r["Mz"] for r in beam.reactions), 0, case["id"])
            for r in beam.reactions:
                self.assertEqual(beam.v(r["x"]), 0)
                if r["kind"] == "fixed":
                    self.assertEqual(beam.theta(r["x"]), 0)
            # Beyond both ends nothing is left: V and M close to zero exactly.
            self.assertEqual(beam.V(beam.L, "right"), 0)
            self.assertEqual(beam.M(beam.L, "right"), 0)

    def test_reference_rejects_mechanisms(self):
        model = dict(FIXTURES["cases"][0]["model"], supports=[{"kind": "pin", "x": 3.0}])
        with self.assertRaises(reference.Singular):
            reference.Beam(model)

    def test_browser_engine_agrees_with_python_reference(self):
        for case in FIXTURES["cases"]:
            beam = reference.Beam(case["model"])
            js = self.js[case["id"]]
            scale_f = max(abs(float(r["Fy"])) for r in beam.reactions)
            xs = reference.sample_points(case["model"])
            scale_m = max(abs(float(beam.M(x))) for x in xs)
            scale_v = max(abs(float(beam.v(x))) for x in xs)
            for r_js, r_py in zip(js["reactions"], beam.reactions):
                self.assertEqual(r_js["x"], float(r_py["x"]))
                self.assertAlmostEqual(r_js["Fy"], float(r_py["Fy"]), delta=1e-9 * scale_f)
                self.assertAlmostEqual(r_js["Mz"], float(r_py["Mz"]), delta=1e-9 * scale_m)
            for p in js["points"]:
                x = p["x"]
                if x > 0:
                    self.assertAlmostEqual(p["Vleft"], float(beam.V(x, "left")), delta=1e-9 * scale_f)
                    self.assertAlmostEqual(p["Mleft"], float(beam.M(x, "left")), delta=1e-9 * scale_m)
                if x < float(beam.L):
                    self.assertAlmostEqual(p["Vright"], float(beam.V(x, "right")), delta=1e-9 * scale_f)
                    self.assertAlmostEqual(p["Mright"], float(beam.M(x, "right")), delta=1e-9 * scale_m)
                self.assertAlmostEqual(p["v"], float(beam.v(x)), delta=1e-9 * scale_v)

    def test_nastran_deck_encodes_the_same_beam(self):
        for case in FIXTURES["cases"]:
            model = case["model"]
            deck = reference.model_from_bdf(self.js[case["id"]]["bdf"])
            got = deck["model"]
            self.assertEqual(deck["params"], {"POST": "0"})
            self.assertEqual(deck["case"]["SPC"], "1")
            self.assertEqual(deck["case"]["LOAD"], "2")
            self.assertAlmostEqual(got["length"], model["length"], places=9)
            self.assertAlmostEqual(got["material"]["E"] / model["material"]["E"], 1, places=9)
            self.assertAlmostEqual(got["material"]["nu"], model["material"]["nu"], places=9)
            self.assertAlmostEqual(got["section"]["A"] / model["section"]["A"], 1, places=9)
            self.assertAlmostEqual(got["section"]["I"] / model["section"]["I"], 1, places=9)
            self.assertEqual(sorted((s["kind"], round(s["x"], 9)) for s in got["supports"]),
                             sorted((s["kind"], round(s["x"], 9)) for s in model["supports"]))
            # Re-solving the deck's own model reproduces the original reactions and deflections.
            original, from_deck = reference.Beam(model), reference.Beam(got)
            scale = max(abs(float(r["Fy"])) for r in original.reactions)
            for a, b in zip(original.reactions, from_deck.reactions):
                self.assertAlmostEqual(float(a["Fy"]), float(b["Fy"]), delta=1e-8 * scale)
                self.assertAlmostEqual(float(a["Mz"]), float(b["Mz"]), delta=1e-8 * scale * float(original.L))
            xs = reference.sample_points(model)
            scale_v = max(abs(float(original.v(x))) for x in xs)
            for x in xs:
                self.assertAlmostEqual(float(original.v(x)), float(from_deck.v(x)), delta=1e-8 * scale_v + 1e-15)

    def test_nastran_deck_in_every_unit_convention_encodes_the_same_beam(self):
        systems = self.js["@units"]
        self.assertEqual(sorted(systems), ["N-m", "N-mm", "kN-m", "kip-in", "lbf-in"])
        for case in FIXTURES["cases"]:
            model = case["model"]
            original = reference.Beam(model)
            for uid, u in systems.items():
                with self.subTest(case=case["id"], units=uid):
                    text = self.js[case["id"]]["units"][uid]
                    self.assertIn(f"$ Units {u['ascii']}.", text)
                    got = reference.model_from_bdf(text)["model"]
                    f = u["factor"]
                    # The deck's numbers are the model in this convention.
                    self.assertAlmostEqual(got["length"] * f["length"] / model["length"], 1, places=12)
                    self.assertAlmostEqual(got["material"]["E"] * f["stress"] / model["material"]["E"], 1, places=12)
                    self.assertAlmostEqual(got["section"]["I"] * f["inertia"] / model["section"]["I"], 1, places=12)
                    # Solved in its own units, then converted to SI, it gives the original reactions and deflections.
                    beam = reference.Beam(got)
                    scale = max(abs(float(r["Fy"])) for r in original.reactions)
                    for a, b in zip(original.reactions, beam.reactions):
                        self.assertAlmostEqual(float(a["Fy"]), float(b["Fy"]) * f["force"], delta=1e-8 * scale)
                        self.assertAlmostEqual(float(a["Mz"]), float(b["Mz"]) * f["moment"], delta=1e-8 * scale * float(original.L))
                    xs = reference.sample_points(model)
                    scale_v = max(abs(float(original.v(x))) for x in xs)
                    for x in xs:
                        self.assertAlmostEqual(float(original.v(x)), float(beam.v(x / f["length"])) * f["length"], delta=1e-8 * scale_v + 1e-15)

    def test_bdf_reader_rejects_what_it_cannot_represent(self):
        deck = self.js["simply-supported-udl"]["bdf"]
        with self.assertRaises(ValueError):
            reference.model_from_bdf(deck.replace("FY      FR", "FZ      FR", 1))
        with self.assertRaises(ValueError):
            reference.model_from_bdf("\n".join(l for l in deck.split("\n") if not l.startswith("GRDSET")))
        with self.assertRaises(ValueError):
            reference.model_from_bdf(deck.replace("BEGIN BULK", "BEGIN BULK\nCBEAM,9,1,1,2,0.,1.,0."))

    def test_build_is_reproducible(self):
        with tempfile.TemporaryDirectory() as directory:
            copy = Path(directory) / "beamdiag"
            copy.mkdir()
            for name in ("build.py", "raw.json", "engine.js", "beamdswitch.js", "template.html"):
                shutil.copy(VIZ / name, copy / name)
            subprocess.run([sys.executable, str(copy / "build.py")], check=True, capture_output=True)
            self.assertEqual((copy / "index.html").read_text(encoding="utf-8"), (VIZ / "index.html").read_text(encoding="utf-8"))

    def test_page_is_self_contained(self):
        html = (VIZ / "index.html").read_text(encoding="utf-8")
        parser = _Ids()
        parser.feed(html)
        for required in ("plots", "readout", "error", "supports", "loads", "table", "download", "deck", "method"):
            self.assertIn(required, parser.ids)
        self.assertFalse([s for s in parser.scripts if s.get("src") or s.get("href")], "no external scripts or styles")


if __name__ == "__main__":
    unittest.main()
