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

# Solve every fixture with the browser engine, export its NASTRAN deck, and work it by hand
# (handcalc.js) in every unit convention from both origins, with the hand values back in SI.
NODE_SCRIPT = r"""
const B = require(process.argv[1] + "/engine.js");
const H = require(process.argv[1] + "/handcalc.js");
const fixtures = require(process.argv[1] + "/fixtures.json");
const out = {};
const QUANTITY = { V: "force", M: "moment", theta: "angle", v: "length" };
function hand(r, units, origin) {
  const D = H.derive(r, { units, origin }), si = (x, q) => B.fromUnits(x, q, units);
  const reactions = D.hand && D.unknowns.flatMap((k, i) => (k.kind === "R" ? [{ x: k.r.x, Fy: si(D.hand[i], "force") }]
    : k.kind === "M" ? [{ x: k.r.x, Mz: si(D.hand[i], "moment") }] : []));
  const ends = (e) => Object.fromEntries(Object.entries(QUANTITY).map(([k, q]) => [k, si(e[k], q)]));
  return { reactions, segments: D.segments.map((s) => ({ a: s.a, b: s.b, start: ends(s.hand.start), end: ends(s.hand.end) })) };
}
for (const c of fixtures.cases) {
  const r = B.solve(c.model);
  r.extremes = B.extremes(r);
  const xs = [...new Set([0, r.model.length, ...r.model.supports.map((s) => s.x),
    ...r.model.loads.flatMap((l) => (l.kind === "dist" ? [l.x1, l.x2] : [l.x]))])];
  const units = Object.fromEntries(Object.keys(B.UNIT_SYSTEMS).map((u) => [u, B.exportBdf(c.model, { units: u })]));
  const handCalc = Object.fromEntries(Object.keys(B.UNIT_SYSTEMS).flatMap((u) => ["left", "mid"].map((o) => [`${u} ${o}`, hand(r, u, o)])));
  out[c.id] = { reactions: r.reactions, points: xs.map((x) => B.at(r, x)), bdf: B.exportBdf(c.model), units, hand: handCalc };
}
out["@units"] = B.UNIT_SYSTEMS;
process.stdout.write(JSON.stringify(out));
"""

# The WebMCP tools the page registers, in registration order.
WEBMCP_TOOLS = ["get_metadata", "get_current_beam", "solve_beam", "export_nastran_bdf"]

# Run the built page's scripts against an inert DOM with a stub navigator.modelContext,
# then call the registered tools the way an agent would.
PAGE_SCRIPT = r"""
const fs = require("fs"), vm = require("vm");
const dir = process.argv[1];
const html = fs.readFileSync(dir + "/index.html", "utf8");
const fixtures = require(dir + "/fixtures.json");
const inert = () => new Proxy(function () {}, {
  get: (t, k) => (k === "modelContext" ? undefined : k === Symbol.iterator ? [][Symbol.iterator] : k === Symbol.toPrimitive ? () => 0 : inert()),
  set: () => true, apply: () => inert(), construct: () => inert(),
});
const tools = [];
const ctx = vm.createContext({
  document: inert(), requestAnimationFrame: () => 0, cancelAnimationFrame() {}, setTimeout: () => 0, clearTimeout() {},
  ResizeObserver: function () { return inert(); }, Option: function () { return inert(); },
  navigator: { modelContext: { registerTool: (t) => tools.push(t) } },
});
for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(m[1], ctx);
const call = async (name, input) => JSON.parse((await tools.find((t) => t.name === name).execute(input)).content[0].text);
(async () => {
  const model = fixtures.cases[0].model;
  process.stdout.write(JSON.stringify({
    names: tools.map((t) => t.name),
    solve: await call("solve_beam", model),
    bdf: await call("export_nastran_bdf", { model }),
    current: await call("get_current_beam", {}),
    bad: await call("solve_beam", { ...model, supports: [] }),
  }));
})();
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

    def test_hand_calculations_agree_with_python_reference(self):
        """handcalc.js's own chain (reactions from its written equations, then V, M, θ and v carried
        segment by segment) matches the exact reference in every unit convention and origin."""
        for case in FIXTURES["cases"]:
            beam = reference.Beam(case["model"])
            xs = reference.sample_points(case["model"])
            scale = {
                "V": max(abs(float(beam.V(x))) for x in xs) or 1.0,
                "M": max(abs(float(beam.M(x))) for x in xs) or 1.0,
                "v": max(abs(float(beam.v(x))) for x in xs) or 1.0,
            }
            scale["theta"] = scale["v"] / float(beam.L)
            exact = {"V": beam.V, "M": beam.M, "theta": lambda x, side=None: beam.theta(x), "v": lambda x, side=None: beam.v(x)}
            for key, hand in self.js[case["id"]]["hand"].items():
                with self.subTest(case=case["id"], convention=key):
                    if hand["reactions"] is not None:
                        size_f = max(abs(float(r["Fy"])) for r in beam.reactions)
                        for r in hand["reactions"]:
                            ref = next(p for p in beam.reactions if p["x"] == Fraction(r["x"]))
                            if "Fy" in r:
                                self.assertAlmostEqual(r["Fy"], float(ref["Fy"]), delta=1e-7 * size_f)
                            else:
                                self.assertAlmostEqual(r["Mz"], float(ref["Mz"]), delta=1e-7 * (scale["M"] + size_f * float(beam.L)))
                    else:
                        self.assertGreater(len(beam.reactions), 3, "only large systems are left unwritten")
                    for seg in hand["segments"]:
                        for q in ("V", "M", "theta", "v"):
                            self.assertAlmostEqual(seg["start"][q], float(exact[q](seg["a"], "right")), delta=1e-6 * scale[q])
                            self.assertAlmostEqual(seg["end"][q], float(exact[q](seg["b"], "left")), delta=1e-6 * scale[q])

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
            # The default deck is the SI one, so it is checked below with the other conventions.
            self.assertEqual(self.js[case["id"]]["bdf"], self.js[case["id"]]["units"]["N-m"])
            for uid, u in systems.items():
                with self.subTest(case=case["id"], units=uid):
                    text = self.js[case["id"]]["units"][uid]
                    self.assertIn(f"$ Units {u['ascii']}.", text)
                    deck = reference.model_from_bdf(text)
                    got = deck["model"]
                    self.assertEqual(deck["params"], {"POST": "0"})
                    self.assertEqual(deck["case"]["SPC"], "1")
                    self.assertEqual(deck["case"]["LOAD"], "2")
                    f = u["factor"]
                    # The deck's numbers are the model in this convention.
                    self.assertAlmostEqual(got["length"] * f["length"] / model["length"], 1, places=12)
                    self.assertAlmostEqual(got["material"]["E"] * f["stress"] / model["material"]["E"], 1, places=12)
                    self.assertAlmostEqual(got["material"]["nu"], model["material"]["nu"], places=9)
                    self.assertAlmostEqual(got["section"]["A"] * f["area"] / model["section"]["A"], 1, places=9)
                    self.assertAlmostEqual(got["section"]["I"] * f["inertia"] / model["section"]["I"], 1, places=12)
                    self.assertEqual(sorted((s["kind"], round(s["x"] * f["length"], 9)) for s in got["supports"]),
                                     sorted((s["kind"], round(s["x"], 9)) for s in model["supports"]))
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
            for name in ("build.py", "raw.json", "engine.js", "beamdswitch.js", "handcalc.js", "template.html"):
                shutil.copy(VIZ / name, copy / name)
            subprocess.run([sys.executable, str(copy / "build.py")], check=True, capture_output=True)
            self.assertEqual((copy / "index.html").read_text(encoding="utf-8"), (VIZ / "index.html").read_text(encoding="utf-8"))

    def test_page_is_self_contained(self):
        html = (VIZ / "index.html").read_text(encoding="utf-8")
        parser = _Ids()
        parser.feed(html)
        for required in ("plots", "readout", "error", "supports", "loads", "table", "download", "deck", "method", "hand-body", "hand-point", "save-hand", "copy-hand"):
            self.assertIn(required, parser.ids)
        self.assertFalse([s for s in parser.scripts if s.get("src") or s.get("href")], "no external scripts or styles")

    def test_page_registers_its_webmcp_tools(self):
        run = subprocess.run([shutil.which("node") or "node", "-e", PAGE_SCRIPT, str(VIZ)], check=True, capture_output=True, text=True)
        page = json.loads(run.stdout)
        self.assertEqual(page["names"], WEBMCP_TOOLS)
        case = FIXTURES["cases"][0]
        expected = self.js[case["id"]]
        self.assertEqual(page["solve"]["reactions"], expected["reactions"])
        # The deck tool writes in the page's unit convention, which opens as N, mm, MPa.
        self.assertEqual(page["bdf"]["bdf"], expected["units"]["N-mm"])
        self.assertIn("reactions", page["current"])
        self.assertIn("error", page["bad"])


if __name__ == "__main__":
    unittest.main()
