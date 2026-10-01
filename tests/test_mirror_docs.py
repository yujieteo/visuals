"""Each mirrored viz/<slug>/ folder carries its own LICENSE, AGENTS.md and SKILLS.md.

The standalone yujieteo/<repo> repositories are exact mirrors of these folders, so the files must live
here. SKILLS.md must document exactly the WebMCP tools the page registers.
"""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIRRORS = {
    "airbnb": "airbnb", "arm": "arm", "breeden-litzenberger-density": "breeden-litzenberger",
    "convex-payoffs": "convex-payoffs", "energy-email-productivity": "energy-email-productivity",
    "english-grammar": "english-grammar", "fpl-expected-goals": "fpl-expected-goals",
    "graduate-employment-survey": "graduate-employment-survey", "haze-singapore": "haze-singapore",
    "manchester-city-finances": "manchester-city-finances", "marvell": "marvell", "multi-armed-bandit": "multi-armed-bandit", "ooda-orientation": "ooda-orientation", "panw": "panw",
    "singapore-covid-governance-hindsight": "sg-covid-hindsight",
    "social-values-surveydata": "social-values-surveydata", "tourist-attractions": "tourist-attractions",
}
# Stale older copies; their current versions (and mirrors) live in yujieteo/site visuals/.
EXCLUDED = {"vgc-protect-fakeout-pivot-trainer", "tampines-food-map", "convexity-action-engine", "everyday-actions"}


class MirrorDocsTest(unittest.TestCase):
    def test_every_viz_folder_is_either_mirrored_or_excluded(self):
        slugs = {p.parent.name for p in (ROOT / "viz").glob("*/index.html")}
        self.assertEqual(slugs, set(MIRRORS) | EXCLUDED)
        self.assertFalse(set(MIRRORS) & EXCLUDED)
        for slug in EXCLUDED:
            for name in ("AGENTS.md", "SKILLS.md", "LICENSE"):
                self.assertFalse((ROOT / "viz" / slug / name).exists(), f"{slug}/{name}")

    def test_license_is_the_shared_mit_text(self):
        texts = {slug: (ROOT / "viz" / slug / "LICENSE").read_text() for slug in MIRRORS}
        self.assertEqual(len(set(texts.values())), 1)
        text = texts["airbnb"]
        self.assertTrue(text.startswith("MIT License\n\nCopyright (c) 2026 Yu Jie Teo\n"))

    def test_agents_names_the_upstream_mirror_and_live_page(self):
        for slug, repo in MIRRORS.items():
            text = (ROOT / "viz" / slug / "AGENTS.md").read_text()
            self.assertIn(f"`viz/{slug}/` in [yujieteo/visuals]", text, slug)
            self.assertIn(f"[yujieteo/{repo}](https://github.com/yujieteo/{repo})", text, slug)
            self.assertIn(f"https://teoyujie.org/visuals/{slug}/", text, slug)

    def test_skills_documents_exactly_the_registered_tools(self):
        for slug in MIRRORS:
            html = (ROOT / "viz" / slug / "index.html").read_text()
            skills = (ROOT / "viz" / slug / "SKILLS.md").read_text()
            registered = set(re.findall(r"registerTool\(\{\s*name:\s*['\"](\w+)['\"]", html))
            documented = set(re.findall(r"^\| `(\w+)` \|", skills.split("## WebMCP tools")[1].split("## Exports")[0], re.M))
            self.assertEqual(documented, registered, slug)
            self.assertIn(f"name: {slug}\n", skills, slug)


if __name__ == "__main__":
    unittest.main()
