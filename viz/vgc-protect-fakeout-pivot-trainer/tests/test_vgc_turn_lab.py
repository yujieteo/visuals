import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VIZ = ROOT


class VgcTurnLabTest(unittest.TestCase):
    def test_build_is_reproducible(self):
        with tempfile.TemporaryDirectory() as directory:
            copy = Path(directory) / "lab"
            shutil.copytree(VIZ, copy, ignore=shutil.ignore_patterns("__pycache__", ".git", ".github", "tests"))
            subprocess.run([sys.executable, str(copy / "build.py")], check=True, capture_output=True)
            self.assertEqual((copy / "index.html").read_text(encoding="utf-8"), (VIZ / "index.html").read_text(encoding="utf-8"))

    def test_every_species_move_and_item_is_defined(self):
        data = json.loads((VIZ / "raw.json").read_text(encoding="utf-8"))
        sprites = json.loads((VIZ / "sprites.json").read_text(encoding="utf-8"))
        sources = {source["id"] for source in data["sources"]}
        for team in data["teams"].values():
            self.assertEqual(len(team["members"]), 6)
            self.assertLessEqual(len({member["item"] for member in team["members"]}), 6)
            for source in team["sources"]:
                self.assertIn(source, sources)
            for member in team["members"]:
                self.assertIn(member["species"], data["species"])
                self.assertIn(member["species"], sprites)
                self.assertIn(member["item"], data["items"])
                self.assertEqual(len(member["moves"]), 4)
                for move in member["moves"]:
                    self.assertIn(move, data["moves"])
                points = member["stat_points"].values()
                self.assertLessEqual(sum(points), 66)
                self.assertLessEqual(max(points), 32)
                mega = data["items"][member["item"]].get("mega")
                if mega:
                    self.assertIn(mega, data["species"])
        for match in data["player"]["matches"]:
            self.assertIn(match["source"], sources)

    def test_sprites_are_16_by_16_with_defined_colours(self):
        sprites = json.loads((VIZ / "sprites.json").read_text(encoding="utf-8"))
        for name, sprite in sprites.items():
            self.assertEqual(len(sprite["rows"]), 16, name)
            for row in sprite["rows"]:
                self.assertEqual(len(row), 16, name)
                for pixel in row:
                    self.assertTrue(pixel == "." or pixel in sprite["palette"], (name, pixel))


if __name__ == "__main__":
    unittest.main()
