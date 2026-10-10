"""scripts/build_catalogue.py: visual.json validation and the generated catalogue."""
import json
import unittest

from helpers import Layout, metadata

from build_catalogue import catalogue, gallery, load


class CatalogueTest(unittest.TestCase):
    def test_a_valid_folder_loads(self):
        with Layout() as layout:
            layout.visual("alpha")
            by_slug, errors = load(layout.root)
        self.assertEqual(errors, [])
        self.assertEqual(list(by_slug), ["alpha"])

    def test_schema_violations_are_named(self):
        cases = {
            "missing title": (metadata(title=None), "missing title"),
            "unknown field": (metadata(colour="red"), "unknown field colour"),
            "bad date": (metadata(fetched="1 Oct 2026"), "fetched"),
            "too few tools": (metadata(webmcp_tools=["get_data"]), "at least 3"),
            "duplicate tag": (metadata(tags=["a", "a"]), "duplicate"),
            "bad link": (metadata(links=[{"rel": "likes", "target": "note:x"}]), "must be one of"),
            "uses inside viz": (metadata(uses=["viz/other/index.html"]), "uses[0]"),
            "wrong type": (metadata(published="no"), "expected boolean"),
            "bad site page": (metadata(site_page="/play/alpha", webmcp_tools=None), "site_page"),
        }
        for name, (data, expected) in cases.items():
            with self.subTest(name), Layout() as layout:
                layout.visual("alpha", data)
                by_slug, errors = load(layout.root)
                self.assertEqual(by_slug, {})
                self.assertTrue(any(expected in error for error in errors), errors)

    def test_folder_rules(self):
        cases = {
            "no metadata": ("alpha", False, ("index.html", "raw.json"), "visual.json is missing"),
            "no page": ("alpha", metadata(), ("raw.json",), "index.html is missing"),
            "no data": ("alpha", metadata(), ("index.html",), "data names a missing file"),
            "missing asset": ("alpha", metadata(assets=["probly.csv"]), ("index.html", "raw.json"), "asset is missing"),
            "missing used file": ("alpha", metadata(uses=["scripts/nothing.py"]), ("index.html", "raw.json"), "uses names a missing path"),
            "not a slug": ("Alpha_1", metadata(), ("index.html", "raw.json"), "not a lowercase hyphenated slug"),
            "missing typecheck page": ("alpha", metadata(typecheck={"page": "src/template.html"}), ("index.html", "raw.json"), "typecheck page is missing"),
            "no tools": ("alpha", metadata(webmcp_tools=None), ("index.html", "raw.json"), "missing webmcp_tools"),
            "site with a page": ("alpha", metadata(site_page="play/alpha/", webmcp_tools=None), ("index.html", "raw.json"), "index.html is present"),
            "site with tools": ("alpha", metadata(site_page="play/alpha/"), ("raw.json",), "webmcp_tools names tools"),
            "missing skipped file": ("alpha", metadata(typecheck={"skip": ["engine.js"]}), ("index.html", "raw.json"), "typecheck skip names a missing file"),
            "sealed without a crate": ("alpha", metadata(sealed=True), ("index.html", "raw.json"), "there is no Cargo.toml"),
            "sealed without a page": ("alpha", metadata(site_page="play/alpha/", sealed=True), ("Cargo.toml", "raw.json"), "index.html is missing"),
        }
        for name, (slug, data, files, expected) in cases.items():
            with self.subTest(name), Layout() as layout:
                layout.visual(slug, data, files)
                _, errors = load(layout.root)
                self.assertTrue(any(expected in error for error in errors), errors)

    def test_a_site_visual_keeps_only_data_and_leaves_the_catalogue(self):
        with Layout() as layout:
            layout.visual("alpha", metadata(site_page="play/alpha/", webmcp_tools=None), ("raw.json",))
            by_slug, errors = load(layout.root)
        self.assertEqual(errors, [])
        self.assertEqual(catalogue(by_slug), [])

    def test_a_sealed_visual_the_site_embeds_keeps_its_page_and_leaves_the_catalogue(self):
        with Layout() as layout:
            layout.visual("alpha", metadata(site_page="play/alpha/", sealed=True), ("index.html", "Cargo.toml", "raw.json"))
            by_slug, errors = load(layout.root)
        self.assertEqual(errors, [])
        self.assertEqual(catalogue(by_slug), [])

    def test_catalogue_is_newest_first_without_unpublished_visuals_and_with_repository_paths(self):
        by_slug = {
            "beta": metadata(fetched="2026-09-01"), "alpha": metadata(fetched="2026-09-01", assets=["probly.csv"]),
            "newest": metadata(fetched="2026-10-02", data="data.csv"), "draft": metadata(published=False),
        }
        items = catalogue(by_slug)
        self.assertEqual([item["slug"] for item in items], ["newest", "alpha", "beta"])
        self.assertEqual(items[0]["html_path"], "viz/newest/index.html")
        self.assertEqual(items[0]["data_path"], "viz/newest/data.csv")
        self.assertEqual(items[1]["assets"], ["viz/alpha/probly.csv"])
        self.assertNotIn("published", json.dumps(items))
        page = gallery(items)
        self.assertEqual(page.count("<article>"), 3)
        self.assertIn('href="../viz/newest/index.html"', page)


if __name__ == "__main__":
    unittest.main()
