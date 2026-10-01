import copy
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import build_english_grammar as eg  # noqa: E402


def corpus():
    raw, concepts, examples, meta = eg.load()
    return raw, concepts, examples, meta


def check(raw, concepts, examples, meta):
    model = eg.build_model(raw, concepts, examples, meta)
    return eg.validate(model, raw, meta)


class EnglishGrammarTest(unittest.TestCase):
    def test_corpus_passes_and_meets_release_counts(self):
        summary = check(*corpus())
        self.assertTrue(40 <= summary["concepts"] <= 60)
        self.assertTrue(100 <= summary["examples"] <= 150)

    def test_build_is_reproducible_and_verifies(self):
        with tempfile.TemporaryDirectory() as directory:
            work = Path(directory)
            shutil.copytree(ROOT / "scripts", work / "scripts", ignore=shutil.ignore_patterns("__pycache__"))
            shutil.copytree(ROOT / "data", work / "data")
            shutil.copytree(ROOT / "viz", work / "viz")
            shutil.copy(ROOT / "design-tokens.json", work / "design-tokens.json")
            builder = work / "scripts" / "build_english_grammar.py"
            subprocess.run([sys.executable, str(builder)], check=True, capture_output=True)
            first = (work / "viz" / eg.SLUG / "index.html").read_bytes()
            subprocess.run([sys.executable, str(builder)], check=True, capture_output=True)
            self.assertEqual(first, (work / "viz" / eg.SLUG / "index.html").read_bytes())
            self.assertEqual(first, (ROOT / "viz" / eg.SLUG / "index.html").read_bytes())
            subprocess.run([sys.executable, str(builder), "--verify"], check=True, capture_output=True)

    def test_tokens_and_punctuation(self):
        tokens = eg.tokenize("Kim's bike, my neighbour – fixed.")
        self.assertEqual([t["t"] for t in tokens], ["Kim's", "bike", ",", "my", "neighbour", "–", "fixed", "."])
        self.assertEqual([t["k"] for t in tokens], ["w", "w", "p", "w", "w", "p", "w", "p"])

    def test_tree_words_must_match_the_sentence(self):
        ex = {"id": "t", "text": "Kim laughed.", "tree": "[Clause [Subject:NP [Head:N Kim]] [Predicate:VP [Predicator:V smiled]]]"}
        ex["tokens"] = eg.tokenize(ex["text"])
        with self.assertRaisesRegex(AssertionError, "does not match"):
            eg.parse_tree(ex)
        ex["tree"] = "[Clause [Subject:NP [Head:N Kim]]]"
        with self.assertRaisesRegex(AssertionError, "words not in the tree"):
            eg.parse_tree(ex)

    def test_single_word_phrases_keep_a_separate_word_node(self):
        ex = {"id": "t", "text": "Kim laughed.", "tree": "[Clause [Subject:NP#s [Head:N#k Kim]] [Predicate:VP [Predicator:V laughed]]]"}
        ex["tokens"] = eg.tokenize(ex["text"])
        nodes = eg.flatten(eg.parse_tree(ex))
        self.assertEqual(nodes["s"][0]["span"], nodes["k"][0]["span"])
        self.assertNotIn("word", nodes["s"][0])
        self.assertEqual(nodes["k"][0]["word"], 0)

    def test_gaps_sit_after_the_preceding_word_and_before_final_punctuation(self):
        raw, concepts, examples, meta = corpus()
        by_id = {e["id"]: e for e in eg.build_model(raw, concepts, examples, meta)["examples"]}
        positions = {}
        for e in by_id.values():
            for n, _ in eg.flatten(e["tree"]).values():
                if "gap" in n:
                    positions[e["id"]] = n["at"]
                    self.assertTrue(n["at"] == 0 or e["tokens"][n["at"] - 1]["k"] == "w", e["id"])
        self.assertEqual(by_id["asked-who-invited"]["tokens"][positions["asked-who-invited"]]["t"], ".")
        self.assertEqual(by_id["how-tall-grown"]["tokens"][positions["how-tall-grown"]]["t"], "!")
        self.assertEqual(by_id["cake-kim-baked"]["tokens"][positions["cake-kim-baked"]]["t"], "was")

    def test_structural_errors_are_rejected(self):
        bad = {
            "a phrase category on a word": "[Clause [Subject:NP [Head:NP Kim]] [Predicate:VP [Predicator:V laughed]]]",
            "a determiner outside an NP": "[Clause [Subject:NP [Head:N Kim]] [Predicate:VP [Det:D laughed]]]",
            "a gap to nowhere": "[Clause [Subject:NP [Head:N Kim]] [Predicate:VP [Predicator:V laughed] [Object:NP ~zz]]]",
            "a supplement without an anchor": "[Clause [Subject:NP [Head:N Kim]] [Supplement:NP [Head:N Pat]] [Predicate:VP [Predicator:V laughed]]]",
            "a prenucleus without a gap": "[Clause [Prenucleus:NP#p [Head:N Kim]] [Nucleus:Clause [Predicate:VP [Predicator:V laughed]]]]",
            "two heads": "[Clause [Subject:NP [Head:N Kim] [Head:N Pat]] [Predicate:VP [Predicator:V laughed]]]",
        }
        for why, tree in bad.items():
            text = "Kim Pat laughed." if "Pat" in tree else "Kim laughed."
            ex = {"id": "t", "text": text, "tree": tree, "tokens": eg.tokenize(text)}
            with self.assertRaises(AssertionError, msg=why):
                eg.parse_tree(ex)

    def test_non_contiguous_constituents_are_rejected(self):
        ex = {"id": "t", "text": "Kim saw Pat.", "tokens": eg.tokenize("Kim saw Pat."),
              "tree": "[Clause [Subject:NP [Head:N Kim]] [Predicate:VP [Predicator:V saw]] [Subject:NP [Head:N Pat]]]"}
        eg.parse_tree(ex)  # well-formed: separate constituents in order
        ex["tree"] = "[Clause [Predicate:VP [Predicator:V saw] [Object:NP [Head:N Kim]]] [Subject:NP [Head:N Pat]]]"
        with self.assertRaises(AssertionError):
            eg.parse_tree(ex)

    def test_link_and_reference_errors_are_rejected(self):
        mutations = [
            lambda r, c, e: c["concepts"][0]["related"].append("no-such-concept"),
            lambda r, c, e: c["concepts"][0]["examples"].append("no-such-example@x"),
            lambda r, c, e: c["concepts"][0].update(loc=[4, "9.9"]),
            lambda r, c, e: c["concepts"][1].setdefault("aliases", []).append(c["concepts"][0]["name"]),
            lambda r, c, e: c.update(route=c["route"][:9]),
            lambda r, c, e: c["confusions"][0].update(example="cake-which-baked"),
            lambda r, c, e: e["contrasts"][0]["a"].update(node="nope"),
            lambda r, c, e: e["examples"][0].update(explanation=" "),
            lambda r, c, e: r["chapters"][3]["sections"].reverse(),
            lambda r, c, e: r["chapters"][4]["pages"].__setitem__(0, 300),
        ]
        base = corpus()
        for i, mutate in enumerate(mutations):
            raw, concepts, examples, meta = (copy.deepcopy(x) for x in base)
            mutate(raw, concepts, examples)
            with self.assertRaises((AssertionError, KeyError, StopIteration), msg=f"mutation {i}"):
                check(raw, concepts, examples, meta)

    def test_aliases_never_replace_canonical_names(self):
        _, concepts, _, _ = corpus()
        names = {c["name"].lower() for c in concepts["concepts"]}
        for c in concepts["concepts"]:
            for alias in c.get("aliases", []):
                self.assertNotIn(alias.lower(), names)

    def test_palette_contrast_in_both_modes(self):
        rows = eg.check_contrast()
        self.assertEqual({mode for mode, _, _ in rows}, {"light", "dark"})
        for mode, what, ratio in rows:
            self.assertGreaterEqual(ratio, 4.5 if "text" in what else 3.0, f"{mode} {what}")

    def test_page_is_offline_small_and_has_metadata(self):
        html = (ROOT / "viz" / eg.SLUG / "index.html").read_text(encoding="utf-8")
        model = eg.build_model(*corpus())
        eg.verify_page(html, model)
        self.assertLess(len(html.encode("utf-8")), 1_000_000)
        self.assertIn('<div id="static"', html)  # no-JavaScript fallback is in the initial HTML
        self.assertIn("not yet expanded", html)
        data = json.loads(html.split('id="eg-data">', 1)[1].split("</script>", 1)[0].replace("<\\/", "</"))
        self.assertEqual(len({e["id"] for e in data["examples"]}), len(data["examples"]))


if __name__ == "__main__":
    unittest.main()
