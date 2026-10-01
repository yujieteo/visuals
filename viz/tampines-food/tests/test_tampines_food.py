import csv
import json
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VIZ = ROOT
CUISINES = {"chinese", "malay", "indian", "japanese", "korean", "southeast-asian", "western", "cafe-bakery", "dessert"}
MALLS = {"tampines-mall", "tampines-1", "century-square", "our-tampines-hub"}
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def raw():
    return json.loads((VIZ / "raw.json").read_text(encoding="utf-8"))


def read_csv(name):
    with open(VIZ / name, newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


class TampinesFoodTest(unittest.TestCase):
    def test_build_is_reproducible(self):
        with tempfile.TemporaryDirectory() as directory:
            copy = Path(directory) / "tampines-food"
            shutil.copytree(VIZ, copy, ignore=shutil.ignore_patterns("__pycache__", ".git", ".github", "tests"))
            subprocess.run([sys.executable, str(copy / "build.py")], check=True, capture_output=True)
            for name in ("raw.json", "index.html"):
                self.assertEqual((copy / name).read_text(encoding="utf-8"), (VIZ / name).read_text(encoding="utf-8"), name)

    def test_builder_verifies_the_committed_page(self):
        result = subprocess.run([sys.executable, str(VIZ / "build.py"), "--verify"], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        shutil.rmtree(VIZ / "__pycache__", ignore_errors=True)

    def test_fifty_ranked_entries_from_fixed_sets(self):
        data = raw()
        outlets = data["outlets"]
        self.assertEqual(len(outlets), 50)
        self.assertEqual([o["rank"] for o in outlets], list(range(1, 51)))
        self.assertEqual(len({o["id"] for o in outlets}), 50)
        self.assertEqual({c["id"] for c in data["cuisines"]}, CUISINES)
        self.assertEqual({m["id"] for m in data["malls"]}, MALLS)
        for o in outlets:
            self.assertIn(o["cuisine"], CUISINES, o["id"])
            self.assertIn(o["mall"], MALLS, o["id"])
        keys = [(-o["publishers"], -o["guides"], -int(o["latest_mention"].replace("-", "")), o["name"].lower()) for o in outlets]
        self.assertEqual(keys, sorted(keys))
        # Everything just outside the list ranks no higher than the 50th entry.
        for o in data["next_in_line"]:
            self.assertLessEqual(o["publishers"], outlets[-1]["publishers"], o["name"])

    def test_every_entry_is_sourced(self):
        data = raw()
        guides = {g["id"]: g for g in data["sources"]["guides"]}
        for g in guides.values():
            self.assertTrue(g["url"].startswith("https://"), g["id"])
            self.assertRegex(g["published"], DATE)
            self.assertRegex(g["retrieved"], DATE)
        for source in data["sources"]["directories"] + data["sources"]["nutrition"]:
            self.assertTrue(source["url"].startswith("https://"), source["id"])
            self.assertRegex(source["retrieved"], DATE)
        for o in data["outlets"]:
            self.assertGreaterEqual(o["publishers"], 2, o["id"])
            self.assertEqual(len(o["mentions"]), o["guides"], o["id"])
            self.assertEqual(len({guides[g]["publisher"] for g in o["mentions"]}), o["publishers"], o["id"])
            self.assertIn(o["dish_named_by"], o["mentions"], o["id"])
            self.assertEqual(o["latest_mention"], max(guides[g]["published"] for g in o["mentions"]), o["id"])
            self.assertTrue(o["dish"], o["id"])

    def test_presence_matches_the_mall_directories(self):
        listings = {(r["mall"], r["name"]): r for r in read_csv("directories.csv") if r["status"] != "opening soon"}
        names = {m["id"]: m["name"] for m in raw()["malls"]}
        for o in raw()["outlets"]:
            presence = o["presence"]
            if o["mall"] == "our-tampines-hub":
                self.assertEqual(presence["checked_by"], "guides", o["id"])
                continue
            listing = listings.get((names[o["mall"]], presence["listed_as"]))
            self.assertIsNotNone(listing, o["id"])
            self.assertEqual(listing["unit"], o["unit"], o["id"])
        for o in raw()["excluded"]:
            self.assertNotIn((names[o["mall"]], o["name"]), listings, o["name"])

    def test_calorie_fields_are_consistent(self):
        yeo = {r["dish_as_published"]: r for r in read_csv("yeo2021.csv")}
        estimate = approximate = not_estimable = 0
        for o in raw()["outlets"]:
            n = o["nutrition"]
            if n["status"] == "not_estimable":
                not_estimable += 1
                self.assertTrue(n["reason"], o["id"])
                self.assertNotIn("energy_kcal", n, o["id"])
                continue
            self.assertIn(n["source"], {"yeo2021", "fndds2024"}, o["id"])
            if n["status"] == "approximate":
                approximate += 1
                self.assertEqual(n["match"], "generic equivalent", o["id"])
            else:
                estimate += 1
                self.assertEqual(n["status"], "estimate", o["id"])
                self.assertIn(n["match"], {"same dish", "similar dish"}, o["id"])
            for key in ("energy_kcal", "carbohydrate_g", "protein_g", "fat_g", "grams"):
                self.assertGreaterEqual(n[key], 0, (o["id"], key))
            self.assertEqual(n["kcal_from"], {"carbohydrate": round(n["carbohydrate_g"] * 4),
                                              "protein": round(n["protein_g"] * 4), "fat": round(n["fat_g"] * 9)})
            # Atwater energy from the macros must agree with the source's own energy value.
            atwater = sum(n["kcal_from"].values())
            self.assertLess(abs(atwater - n["energy_kcal"]) / n["energy_kcal"], 0.1, o["id"])
            if n["source"] == "yeo2021":
                row = yeo[n["reference_key"]]
                self.assertAlmostEqual(n["energy_kcal"], float(row["serving_kcal"]), delta=float(row["serving_kcal"]) * 0.02)
                self.assertAlmostEqual(n["protein_g"], float(row["serving_protein_g"]), delta=1)
                self.assertAlmostEqual(n["carbohydrate_g"], float(row["serving_carbohydrate_g"]), delta=1)
        self.assertEqual((estimate, approximate, not_estimable), (29, 16, 5))

    def test_map_output_preserves_sourced_coverage_and_attribution(self):
        data = raw()
        source = json.loads((VIZ / "map.json").read_text(encoding="utf-8"))
        self.assertEqual(data["map"], source)
        self.assertEqual(source["license"], "ODbL")
        self.assertEqual(source["license_url"], "https://www.openstreetmap.org/copyright")
        self.assertIn("f02884d371523b9eed2a401b7e5515ee9e99ebae", source["source_url"])
        geometry = source["geometry"]
        self.assertEqual(set(geometry["malls"]), {"Tampines Mall", "Tampines 1", "Century Square"})
        self.assertEqual(geometry["osm_base"], "2026-05-06T03:25:00Z")
        mall_names = {m["id"]: m["name"] for m in data["malls"]}
        plotted = [o for o in data["outlets"] if mall_names[o["mall"]] in geometry["malls"]]
        unplotted = [o for o in data["outlets"] if mall_names[o["mall"]] not in geometry["malls"]]
        self.assertEqual(len(plotted), 34)
        self.assertEqual(len(unplotted), 16)
        self.assertEqual({o["mall"] for o in unplotted}, {"our-tampines-hub"})
        for mall in geometry["malls"].values():
            self.assertEqual(len(mall["c"]), 2)
            self.assertTrue(all(isinstance(value, (int, float)) for value in mall["c"]))
            self.assertTrue(mall["d"].endswith("Z"))


if __name__ == "__main__":
    unittest.main()
