"""scripts/changed.py: which visuals a change selects."""
import unittest

from helpers import Layout, metadata

import changed
from changed import browser, browser_jobs, select


class SelectTest(unittest.TestCase):
    def setUp(self):
        self.layout = Layout().__enter__()
        self.layout.visual("alpha")
        self.layout.visual("beta", metadata(uses=["scripts/family.py", "scripts/templates/"]))
        self.layout.visual("gamma", metadata(uses=["scripts/family.py"]))
        self.addCleanup(self.layout.__exit__)

    def select(self, *paths):
        return select(list(paths), root=self.layout.root)[0]

    def browser(self, *paths):
        return [(job["only"], job["site"]) for job in browser(list(paths), root=self.layout.root)[0]]

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

    def test_documentation_under_e2e_selects_none(self):
        self.assertEqual(self.select("e2e/README.md", "e2e/site/beamdswitch/NOTES.md", "e2e/LICENSE"), [])
        self.assertEqual(self.browser("e2e/README.md", "e2e/site/beamdswitch/NOTES.md", "e2e/LICENSE"), [])

    def test_a_visual_runs_its_own_browser_checks_only(self):
        self.assertEqual(self.browser("viz/alpha/index.html"), [("alpha", False)])
        self.assertEqual(self.browser("scripts/family.py"), [("beta", False), ("gamma", False)])

    def test_a_site_visuals_checks_run_only_its_browser_checks_with_the_site(self):
        paths = ("e2e/site/beamdswitch/full.test.js", "e2e/site/beamdswitch/manifest.json")
        self.assertEqual(self.select(*paths), [])
        self.assertEqual(self.browser(*paths), [("beamdswitch", True)])
        self.assertEqual(self.browser("viz/alpha/index.html", "e2e/site/connes-qft/manifest.json"), [("connes-qft", True), ("alpha", False)])

    def test_the_browser_harness_runs_every_visuals_browser_checks_and_no_other_checks(self):
        for path in ("e2e/lib/targets.js", "e2e/tests/baseline.test.js", "e2e/package.json", "e2e/package-lock.json", "e2e/scripts/findings.js"):
            self.assertEqual(self.select(path), [], path)
            self.assertEqual(self.browser(path), [("alpha", False), ("beta", False), ("gamma", False), ("", True)], path)

    def test_the_browser_harness_tests_every_site_visual_in_one_job_only(self):
        jobs = self.browser("e2e/lib/full.js", "e2e/site/beamdswitch/full.test.js")
        self.assertEqual(jobs, [("alpha", False), ("beta", False), ("gamma", False), ("", True)])

    def test_ci_runs_every_check(self):
        self.assertEqual(self.select(".github/workflows/ci.yml"), ["alpha", "beta", "gamma"])
        self.assertEqual(self.browser(".github/workflows/ci.yml"), [("alpha", False), ("beta", False), ("gamma", False), ("", True)])

    def test_shared_tooling_the_harness_does_not_use_runs_no_browser_checks(self):
        for path in ("scripts/check.py", "package.json", "package-lock.json", "schema/visual.schema.json", "tests/test_changed.py"):
            self.assertEqual(self.browser(path), [], path)

    def test_too_many_browser_targets_split_into_shards_that_cover_each_once(self):
        slugs = [f"v{i:02}" for i in range(changed.MAX_BROWSER_JOBS + 1)]
        jobs = browser_jobs(slugs, site=["beamdswitch"])
        self.assertEqual(jobs[0], {"name": "beamdswitch", "only": "beamdswitch", "site": True})
        shards = [job["only"].split(",") for job in jobs[1:]]
        self.assertEqual(len(shards), changed.SHARDS)
        self.assertEqual(sorted(slug for shard in shards for slug in shard), slugs)
        self.assertFalse(any(job["site"] for job in jobs[1:]))

    def test_every_site_visual_adds_one_job_naming_none(self):
        jobs = browser_jobs(["alpha"], every_site_visual=True)
        self.assertEqual([(job["only"], job["site"]) for job in jobs], [("alpha", False), ("", True)])

    def test_a_removed_visual_selects_nothing(self):
        self.assertEqual(self.select("viz/deleted/index.html"), [])

    def test_a_new_folder_without_metadata_is_still_selected(self):
        self.layout.visual("delta", data=False)
        self.assertEqual(self.select("viz/delta/index.html"), ["delta"])


if __name__ == "__main__":
    unittest.main()
