import csv
import json
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VIZ = ROOT
EA = ROOT / "everyday-actions"

_VOID_TAGS = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}


class _Element:
    def __init__(self, tag, attrs):
        self.tag = tag
        self.attrs = dict(attrs)
        self._text = []

    @property
    def text(self):
        return "".join(self._text)


class _PageParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.elements = []
        self._open = []

    def handle_starttag(self, tag, attrs):
        if tag in _VOID_TAGS:
            return
        element = _Element(tag, attrs)
        self.elements.append(element)
        self._open.append(element)

    def handle_endtag(self, tag):
        for depth in range(len(self._open) - 1, -1, -1):
            if self._open[depth].tag == tag:
                del self._open[depth:]
                return

    def handle_data(self, data):
        for element in self._open:
            element._text.append(data)


def _parse_page(html):
    parser = _PageParser()
    parser.feed(html)
    parser.close()
    return parser.elements


class ConvexityActionEngineTest(unittest.TestCase):
    def test_build_is_reproducible(self):
        with tempfile.TemporaryDirectory() as directory:
            copy = Path(directory) / "convexity-action-engine"
            shutil.copytree(VIZ, copy, ignore=shutil.ignore_patterns("__pycache__", ".git", ".github", "tests"))
            subprocess.run([sys.executable, str(copy / "author.py")], check=True, capture_output=True)
            subprocess.run([sys.executable, str(copy / "build.py")], check=True, capture_output=True)
            for name in ("raw.json", "index.html", "actions.csv", "aliases.csv", "sources.csv"):
                self.assertEqual((copy / name).read_text(encoding="utf-8"), (VIZ / name).read_text(encoding="utf-8"), name)

    def test_builder_verifies_the_committed_page(self):
        with tempfile.TemporaryDirectory() as directory:
            copy = Path(directory) / "convexity-action-engine"
            shutil.copytree(VIZ, copy, ignore=shutil.ignore_patterns("__pycache__", ".git", ".github", "tests"))
            result = subprocess.run([sys.executable, str(copy / "build.py"), "--verify"], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)

    def test_probabilities_are_words_and_unretrieved_sources_have_no_links(self):
        raw = json.loads((VIZ / "raw.json").read_text(encoding="utf-8"))
        for action in raw["actions"]:
            if "ruin" in action:
                self.assertIsNone(re.search(r"\d", action["ruin"]["p"]), action["id"])
        for source in raw["sources"]:
            if source["status"].startswith("planned"):
                self.assertEqual(source["url"], "", source["id"])

    def test_observed_figures_match_everyday_actions(self):
        # Both pages recompute ATUS 2014-2016 from the same microdata; shared groups must agree.
        raw = json.loads((VIZ / "raw.json").read_text(encoding="utf-8"))
        with open(EA / "atus_estimates.csv", newline="", encoding="utf-8") as handle:
            rows = {r["activity_id"]: r for r in csv.DictReader(handle) if r["population_id"] == "all"}
        for activity, code in (("sleeping", "0101"), ("working", "0501"), ("exercising", "1301"), ("reading", "120312"), ("gaming", "120307")):
            self.assertAlmostEqual(raw["observed"][code]["rate"], float(rows[activity]["participation_rate"]), places=4, msg=code)
            self.assertAlmostEqual(raw["observed"][code]["min"], float(rows[activity]["minutes_when_performed"]), places=1, msg=code)

    def test_page_leads_with_search_and_keeps_the_method_one_step_away(self):
        elements = _parse_page((VIZ / "index.html").read_text(encoding="utf-8"))

        def index_of(predicate, label):
            for index, element in enumerate(elements):
                if predicate(element):
                    return index, element
            self.fail(f"missing element: {label}")

        h1_index, _ = index_of(lambda element: element.tag == "h1", "h1")
        hero_index, _ = index_of(lambda element: element.attrs.get("id") == "hero-search", "#hero-search")
        ctx_index, _ = index_of(lambda element: element.attrs.get("id") == "ctx", "#ctx")
        app_index, app = index_of(lambda element: element.attrs.get("id") == "app", "#app")
        method_index, method = index_of(
            lambda element: element.tag == "details" and element.attrs.get("id") == "method", "details#method"
        )
        _, announce = index_of(lambda element: element.attrs.get("id") == "announce", "#announce")
        index_of(lambda element: element.tag == "details" and element.attrs.get("id") == "keys", "details#keys")

        self.assertLess(h1_index, hero_index)
        self.assertLess(hero_index, ctx_index)
        self.assertLess(app_index, method_index)
        self.assertIn("short of a 10,000-action canonical ontology", method.text)
        self.assertNotIn("aria-live", app.attrs)
        self.assertEqual(announce.attrs.get("role"), "status")
        self.assertEqual(announce.attrs.get("aria-live"), "polite")


if __name__ == "__main__":
    unittest.main()
