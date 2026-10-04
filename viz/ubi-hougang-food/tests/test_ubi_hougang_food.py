"""The dataset's checks: dataset.py reproduces raw.json, refuses rows that break its rules, and ranks as it says."""
import json
import sys
import unittest
from pathlib import Path
from unittest import mock

VIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(VIZ))
import dataset  # noqa: E402

SOURCES = json.loads((VIZ / "sources.json").read_text(encoding="utf-8"))
GUIDES = {g["id"]: g for g in SOURCES["guides"]}
NOTICES = {n["id"]: n for n in SOURCES["notices"]}
DIRECTORY_OF = {d["mall"]: d["id"] for d in SOURCES["directories"]}
LISTINGS = dataset.read_csv("directories.csv")
ROWS = {r["id"]: r for r in dataset.read_csv("outlets.csv")}
RAW = json.loads((VIZ / "raw.json").read_text(encoding="utf-8"))


def check(row_id, **change):
    dataset.check_row(dict(ROWS[row_id], **change), GUIDES, NOTICES, LISTINGS, DIRECTORY_OF)


class DatasetTest(unittest.TestCase):
    def test_raw_json_is_what_dataset_py_writes(self):
        self.assertEqual(dataset.text(dataset.build()), (VIZ / "raw.json").read_text(encoding="utf-8"))

    def test_check_row_refuses_rows_that_break_a_rule(self):
        refusals = {
            "a station more than 1 km away": ("knots-cafe-and-living", {"station_m": "1001"}, "outside the 1,000 m"),
            "a station outside its area": ("knots-cafe-and-living", {"station": "Eunos"}, "not in area"),
            "an unknown guide": ("knots-cafe-and-living", {"mentions": "no-such-guide;getgo-pl-2024"}, "unknown guide"),
            "a guide listed twice": ("knots-cafe-and-living", {"mentions": "getgo-pl-2024;getgo-pl-2024"}, "listed twice"),
            "a dish named by a guide it does not cite": ("lolas-cafe", {"dish_named_by": "getgo-pl-2024"}, "one of its mentions"),
            "an open place its directory does not list": ("tipsy-bird-gastrobar", {"directory_name": "No Such Place"}, "not listed once"),
            "a unit that differs from the directory": ("tipsy-bird-gastrobar", {"unit": "#09-99"}, "differs from the directory"),
            "a closed place its directory still lists": ("tipsy-bird-gastrobar", {"status": "closed"}, "still lists it"),
            "an old guide that calls a place open": ("99-bistro", {"status": "open"}, "status is unverified"),
            "a recent guide that calls a place unverified": ("lolas-cafe", {"status": "unverified"}, "status is open"),
        }
        check("knots-cafe-and-living")
        for why, (row_id, change, reason) in refusals.items():
            with self.subTest(why), self.assertRaisesRegex(SystemExit, reason):
                check(row_id, **change)

    def test_build_refuses_a_dish_outside_the_top_100(self):
        first_out = RAW["next_in_line"][0]["id"]
        real = dataset.read_csv
        rows = [dict(r, dish="A dish", cuisine="chinese") if r["id"] == first_out else r for r in real("outlets.csv")]
        with mock.patch.object(dataset, "read_csv", lambda name: rows if name == "outlets.csv" else real(name)):
            with self.assertRaisesRegex(SystemExit, f"{first_out}: rank 101"):
                dataset.build()

    def test_the_top_100_are_open_and_ranked_by_publishers_then_guides_then_newest_guide(self):
        outlets = RAW["outlets"]
        self.assertEqual([o["rank"] for o in outlets], list(range(1, 101)))
        self.assertEqual([n["rank"] for n in RAW["next_in_line"]], list(range(101, 101 + len(RAW["next_in_line"]))))
        everyone = outlets + RAW["next_in_line"]
        for a, b in zip(everyone, everyone[1:]):
            self.assertGreaterEqual((a["publishers"], a["guides"], a["latest_mention"]), (b["publishers"], b["guides"], b["latest_mention"]), b["id"])
        self.assertTrue(all(o["publishers"] >= 2 for o in everyone))
        left_out = {o["id"] for o in RAW["excluded"]}
        self.assertFalse(left_out & {o["id"] for o in everyone})
        self.assertTrue(all(ROWS[i]["status"] != "open" for i in left_out))

    def test_publishers_count_the_distinct_publishers_of_the_guides(self):
        for o in RAW["outlets"]:
            self.assertEqual(o["publishers"], len({GUIDES[g]["publisher"] for g in o["mentions"]}), o["id"])
            self.assertEqual(o["guides"], len(o["mentions"]), o["id"])

    def test_an_open_place_checked_by_a_directory_is_listed_there_on_the_check_date(self):
        retrieved = {d["id"]: d["retrieved"] for d in SOURCES["directories"]}
        listed = {(l["mall"], l["name"]) for l in LISTINGS}
        checked = [o for o in RAW["outlets"] if o["presence"]["checked_by"] != "guides"]
        self.assertTrue(checked)
        for o in checked:
            p = o["presence"]
            self.assertIn((o["venue"], p["listed_as"]), listed, o["id"])
            self.assertEqual(p["as_of"], retrieved[p["checked_by"]], o["id"])

    def test_the_atwater_sum_of_the_macronutrients_is_near_the_energy(self):
        for o in RAW["outlets"]:
            n = o["nutrition"]
            if n["status"] == "not_estimable":
                self.assertTrue(n["reason"], o["id"])
                continue
            atwater = 4 * n["carbohydrate_g"] + 4 * n["protein_g"] + 9 * n["fat_g"]
            self.assertLessEqual(abs(atwater - n["energy_kcal"]), max(5, 0.12 * n["energy_kcal"]), o["id"])


if __name__ == "__main__":
    unittest.main()
