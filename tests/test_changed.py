"""scripts/changed.py: which visuals a change selects."""
import unittest

from helpers import Layout, metadata

from changed import select


class SelectTest(unittest.TestCase):
    def setUp(self):
        self.layout = Layout().__enter__()
        self.layout.visual("alpha")
        self.layout.visual("beta", metadata(uses=["scripts/family.py", "scripts/templates/"]))
        self.layout.visual("gamma", metadata(uses=["scripts/family.py"]))
        self.addCleanup(self.layout.__exit__)

    def select(self, *paths):
        return select(list(paths), root=self.layout.root)[0]

    def test_a_path_in_a_folder_selects_that_visual_only(self):
        self.assertEqual(self.select("viz/alpha/index.html"), ["alpha"])
        self.assertEqual(self.select("viz/alpha/tests/alpha.test.mjs", "viz/gamma/raw.json"), ["alpha", "gamma"])

    def test_a_shared_file_a_visual_uses_selects_its_users_only(self):
        self.assertEqual(self.select("scripts/family.py"), ["beta", "gamma"])
        self.assertEqual(self.select("scripts/templates/report.js"), ["beta"])

    def test_any_other_shared_path_selects_every_visual(self):
        for path in ("scripts/check.py", "package.json", ".github/workflows/ci.yml", "schema/visual.schema.json", "tests/test_changed.py"):
            self.assertEqual(self.select(path), ["alpha", "beta", "gamma"], path)

    def test_documentation_selects_none(self):
        self.assertEqual(self.select("README.md", "SKILLS.md", "docs/monorepo.md", ".gitignore"), [])

    def test_a_removed_visual_selects_nothing(self):
        self.assertEqual(self.select("viz/deleted/index.html"), [])

    def test_a_new_folder_without_metadata_is_still_selected(self):
        self.layout.visual("delta", data=False)
        self.assertEqual(self.select("viz/delta/index.html"), ["delta"])


if __name__ == "__main__":
    unittest.main()
