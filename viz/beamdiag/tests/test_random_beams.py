"""Seeded random beams: any length, supports anywhere, mixed loads.

The fixtures cover textbook layouts with closed forms. These beams cover the
rest: lengths from half a metre to over a hundred metres, one to many pinned
or fixed supports at arbitrary positions (not only at the ends), and mixed
point forces, couples and linearly varying distributed loads. Each is solved
by the browser engine (engine.js, through node) and by the independent exact
reference (reference.py), and its exported NASTRAN deck is read back and
re-solved.
"""

import json
import random
import shutil
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import reference  # noqa: E402

SEEDS = range(60)

NODE_SCRIPT = r"""
const B = require(process.argv[1] + "/engine.js");
const models = JSON.parse(require("fs").readFileSync(0, "utf8"));
const out = models.map((m) => {
  try {
    const r = B.solve(m);
    return { reactions: r.reactions, points: reference_points(r.model).map((x) => B.at(r, x)), bdf: B.exportBdf(m) };
  } catch (e) {
    return { error: e.message };
  }
});
function reference_points(m) {
  return [...new Set([0, m.length, ...m.supports.map((s) => s.x),
    ...m.loads.flatMap((l) => (l.kind === "dist" ? [l.x1, l.x2] : [l.x]))])];
}
process.stdout.write(JSON.stringify(out));
"""


def node(models):
    exe = shutil.which("node")
    if exe is None:
        raise AssertionError("node is required to run the browser engine")
    run = subprocess.run([exe, "-e", NODE_SCRIPT, str(ROOT)], input=json.dumps(models), check=True, capture_output=True, text=True)
    return json.loads(run.stdout)


def random_model(seed, max_supports=40, max_loads=40):
    rng = random.Random(seed)
    length = rng.choice([rng.uniform(0.5, 3.0), rng.uniform(3.0, 20.0), rng.uniform(20.0, 120.0)])
    # Positions sit on a millimetre grid, so nearby supports and loads can be as
    # close as 1 mm, however long the beam.
    grid = lambda x: min(round(x, 3), length)  # noqa: E731
    xs = set()
    if rng.random() < 0.5:
        xs.update([0.0, grid(length)])
    n_supports = rng.randint(1, max_supports)
    while len(xs) < n_supports:
        xs.add(grid(rng.uniform(0, length)))
    xs = sorted(x for x in xs if 0 <= x <= length)[:n_supports]
    supports = [{"kind": rng.choice(["pin", "fixed"]), "x": x} for x in xs]
    if len(supports) == 1:
        supports[0]["kind"] = "fixed"  # a single pin is a mechanism

    loads = []
    for _ in range(rng.randint(1, max_loads)):
        kind = rng.choice(["point", "point", "moment", "dist"])
        if kind == "point":
            loads.append({"kind": "point", "x": grid(rng.uniform(0, length)), "F": rng.uniform(-50e3, 20e3)})
        elif kind == "moment":
            loads.append({"kind": "moment", "x": grid(rng.uniform(0, length)), "C": rng.uniform(-30e3, 30e3)})
        else:
            a, b = sorted(grid(rng.uniform(0, length)) for _ in range(2))
            if b - a >= 1e-2 * length:
                loads.append({"kind": "dist", "x1": a, "x2": b, "q1": rng.uniform(-20e3, 5e3), "q2": rng.uniform(-20e3, 5e3)})
    return {
        "length": length,
        "material": {"E": rng.choice([70e9, 200e9, 210e9, 11e9]), "nu": rng.choice([0.3, 0.33, 0.25])},
        "section": {"A": 10 ** rng.uniform(-4, -1), "I": 10 ** rng.uniform(-7, -3)},
        "supports": supports,
        "loads": loads,
    }


class RandomBeams(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.models = [random_model(seed) for seed in SEEDS]
        cls.js = node(cls.models)
        cls.beams = [reference.Beam(m) for m in cls.models]

    def test_generator_covers_arbitrary_layouts(self):
        counts = [len(m["supports"]) for m in self.models]
        self.assertGreaterEqual(max(counts), 30)
        self.assertTrue(any(m["supports"][0]["x"] > 0 for m in self.models), "a support away from the left end")
        self.assertTrue(any(m["supports"][-1]["x"] < m["length"] for m in self.models), "an overhang on the right")
        self.assertLess(min(m["length"] for m in self.models), 3.0)
        self.assertGreater(max(m["length"] for m in self.models), 20.0)

    def test_engine_solves_every_stable_beam(self):
        # reference.Beam raises Singular for a mechanism; none of these beams is one.
        failed = {seed: js["error"] for seed, js in zip(SEEDS, self.js) if "error" in js}
        self.assertEqual(failed, {})

    def test_engine_agrees_with_exact_reference(self):
        for seed, model, js, beam in zip(SEEDS, self.models, self.js, self.beams):
            if "error" in js:
                continue
            with self.subTest(seed=seed, supports=len(model["supports"]), length=model["length"]):
                xs = [p["x"] for p in js["points"]]
                scale_f = max(abs(float(r["Fy"])) for r in beam.reactions)
                scale_m = max(max(abs(float(beam.M(x, s))) for x in xs for s in ("left", "right")), scale_f * float(beam.L))
                scale_v = max(abs(float(beam.v(x))) for x in xs) or 1e-300
                tol = 1e-7
                for r_js, r_py in zip(js["reactions"], beam.reactions):
                    self.assertEqual(r_js["x"], float(r_py["x"]))
                    self.assertAlmostEqual(r_js["Fy"], float(r_py["Fy"]), delta=tol * scale_f)
                    self.assertAlmostEqual(r_js["Mz"], float(r_py["Mz"]), delta=tol * scale_m)
                for p in js["points"]:
                    x = p["x"]
                    if x > 0:
                        self.assertAlmostEqual(p["Vleft"], float(beam.V(x, "left")), delta=tol * scale_f)
                        self.assertAlmostEqual(p["Mleft"], float(beam.M(x, "left")), delta=tol * scale_m)
                    if x < float(beam.L):
                        self.assertAlmostEqual(p["Vright"], float(beam.V(x, "right")), delta=tol * scale_f)
                        self.assertAlmostEqual(p["Mright"], float(beam.M(x, "right")), delta=tol * scale_m)
                    self.assertAlmostEqual(p["v"], float(beam.v(x)), delta=tol * scale_v)

    def test_exported_deck_rebuilds_the_same_beam(self):
        # Large-field reals carry about ten significant digits, and supports a few
        # millimetres apart amplify that rounding in the reactions, hence 1e-6.
        for seed, model, js, original in zip(SEEDS, self.models, self.js, self.beams):
            if "error" in js:
                continue
            with self.subTest(seed=seed):
                got = reference.model_from_bdf(js["bdf"])["model"]
                self.assertAlmostEqual(got["length"], model["length"], delta=1e-9 * model["length"])
                pairs = zip(sorted((s["x"], s["kind"]) for s in got["supports"]), sorted((s["x"], s["kind"]) for s in model["supports"]))
                self.assertEqual(len(got["supports"]), len(model["supports"]))
                for (x_got, kind_got), (x, kind) in pairs:
                    self.assertEqual(kind_got, kind)
                    self.assertAlmostEqual(x_got, x, delta=1e-9 * model["length"])
                from_deck = reference.Beam(got)
                scale = max(abs(float(r["Fy"])) for r in original.reactions)
                for a, b in zip(original.reactions, from_deck.reactions):
                    self.assertAlmostEqual(float(a["Fy"]), float(b["Fy"]), delta=1e-6 * scale)
                    self.assertAlmostEqual(float(a["Mz"]), float(b["Mz"]), delta=1e-6 * scale * float(original.L))

    def test_closely_spaced_events_solve(self):
        # A 5 m propped cantilever with two loads 2 mm apart: short elements next to
        # long ones must not make a stable beam look like a mechanism.
        model = {"length": 5.0, "material": {"E": 210e9, "nu": 0.3}, "section": {"A": 1e-3, "I": 1e-5},
                 "supports": [{"kind": "fixed", "x": 0.0}, {"kind": "pin", "x": 5.0}],
                 "loads": [{"kind": "point", "x": 2.0, "F": -1e4}, {"kind": "point", "x": 2.002, "F": -1e4}]}
        (js,) = node([model])
        self.assertNotIn("error", js)
        beam = reference.Beam(model)
        for r_js, r_py in zip(js["reactions"], beam.reactions):
            self.assertAlmostEqual(r_js["Fy"], float(r_py["Fy"]), delta=1e-7 * 2e4)

    def test_many_supports(self):
        # A 90 m beam on 46 supports: pins every 2 m with fixed ends and a fixed
        # support mid-span, under a uniform load and point loads between supports.
        length = 90.0
        supports = [{"kind": "pin", "x": float(x)} for x in range(0, 91, 2)]
        supports[0]["kind"] = supports[-1]["kind"] = supports[22]["kind"] = "fixed"
        loads = [{"kind": "dist", "x1": 0.0, "x2": length, "q1": -12e3, "q2": -4e3}]
        loads += [{"kind": "point", "x": x + 0.7, "F": -25e3} for x in range(0, 90, 6)]
        model = {"length": length, "material": {"E": 210e9, "nu": 0.3}, "section": {"A": 5e-3, "I": 8e-5},
                 "supports": supports, "loads": loads}
        (js,) = node([model])
        self.assertNotIn("error", js)
        beam = reference.Beam(model)
        self.assertEqual(len(js["reactions"]), 46)
        scale_f = max(abs(float(r["Fy"])) for r in beam.reactions)
        for r_js, r_py in zip(js["reactions"], beam.reactions):
            self.assertAlmostEqual(r_js["Fy"], float(r_py["Fy"]), delta=1e-7 * scale_f)
            self.assertAlmostEqual(r_js["Mz"], float(r_py["Mz"]), delta=1e-7 * scale_f * length)
        deck = reference.model_from_bdf(js["bdf"])["model"]
        self.assertEqual(sorted((s["kind"], s["x"]) for s in deck["supports"]),
                         sorted((s["kind"], s["x"]) for s in supports))
        for a, b in zip(beam.reactions, reference.Beam(deck).reactions):
            self.assertAlmostEqual(float(a["Fy"]), float(b["Fy"]), delta=1e-8 * scale_f)


if __name__ == "__main__":
    unittest.main()
