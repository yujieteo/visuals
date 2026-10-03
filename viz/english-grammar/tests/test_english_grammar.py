import copy
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
SLUG = "english-grammar"
PAGE_FILES = ("index.html", "beamdswitch.js", "report.js")
DATA_FILES = ("concepts.json", "examples.json", "meta.json", "raw.json", "review.md")


def lay_out(root):
    """Lay this repository out as scripts/build_english_grammar.py expects (the yujieteo/visuals layout):
    scripts/, design-tokens.json, viz/<slug>/ holding the page files and data/<slug>/ holding the data files."""
    shutil.copytree(REPO / "scripts", root / "scripts", ignore=shutil.ignore_patterns("__pycache__"))
    shutil.copy(REPO / "design-tokens.json", root / "design-tokens.json")
    (root / "viz" / SLUG).mkdir(parents=True)
    (root / "data" / SLUG).mkdir(parents=True)
    for name in PAGE_FILES:
        shutil.copy(REPO / name, root / "viz" / SLUG / name)
    for name in DATA_FILES:
        shutil.copy(REPO / name, root / "data" / SLUG / name)


ROOT = Path(tempfile.mkdtemp(prefix="english-grammar-"))
lay_out(ROOT)
sys.path.insert(0, str(ROOT / "scripts"))

import build_english_grammar as eg  # noqa: E402


def tearDownModule():
    shutil.rmtree(ROOT, ignore_errors=True)


def corpus():
    raw, concepts, examples, meta = eg.load()
    return raw, concepts, examples, meta


def check(raw, concepts, examples, meta):
    model = eg.build_model(raw, concepts, examples, meta)
    return eg.validate(model, raw, meta)


class EnglishGrammarTest(unittest.TestCase):
    def test_corpus_passes_and_meets_release_counts(self):
        summary = check(*corpus())
        self.assertTrue(40 <= summary["concepts"] <= 90)
        self.assertTrue(100 <= summary["examples"] <= 220)
        self.assertEqual(summary["chapters"], 20, "every chapter of the outline has concepts")
        self.assertGreater(summary["words"], 0)
        self.assertGreater(summary["marks"], 0)
        self.assertGreater(summary["antecedents"], 0)

    def test_build_is_reproducible_and_verifies(self):
        with tempfile.TemporaryDirectory() as directory:
            work = Path(directory)
            lay_out(work)
            builder = work / "scripts" / "build_english_grammar.py"
            subprocess.run([sys.executable, str(builder)], check=True, capture_output=True)
            first = (work / "viz" / eg.SLUG / "index.html").read_bytes()
            subprocess.run([sys.executable, str(builder)], check=True, capture_output=True)
            self.assertEqual(first, (work / "viz" / eg.SLUG / "index.html").read_bytes())
            self.assertEqual(first, (REPO / "index.html").read_bytes())
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

    def test_each_validation_stage_names_what_is_wrong(self):
        cases = [
            (lambda r, c, e: r["chapters"][2].update(title=""), "needs a title and authors"),
            (lambda r, c, e: c["concepts"][0]["related"].append(c["concepts"][0]["id"]), "has a bad related link"),
            (lambda r, c, e: e["contrasts"][0]["b"].update(e["contrasts"][0]["a"]), "compares an example with itself"),
            (lambda r, c, e: e["examples"][0].update(focus="nope"), "focus is not a node or mark"),
            (lambda r, c, e: c["route"].__setitem__(1, c["route"][0]), "route stops must be unique concepts"),
            (lambda r, c, e: c["confusions"][0].update(concept="no-such-concept"), "points to unknown concept"),
        ]
        base = corpus()
        for mutate, message in cases:
            raw, concepts, examples, meta = (copy.deepcopy(x) for x in base)
            mutate(raw, concepts, examples)
            with self.assertRaisesRegex(AssertionError, message):
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
        static = html.split('<ol class="static-index">', 1)[1].split("</ol></section>", 1)[0]
        self.assertNotIn("not yet expanded", static, "only chapters without concepts are labelled not yet expanded")
        self.assertEqual(static.count("<li>Chapter "), 20)
        data = json.loads(html.split('id="eg-data">', 1)[1].split("</script>", 1)[0].replace("<\\/", "</"))
        self.assertEqual(len({e["id"] for e in data["examples"]}), len(data["examples"]))


    def test_chapters_without_concepts_are_still_labelled(self):
        raw, concepts, examples, meta = corpus()
        concepts = copy.deepcopy(concepts)
        concepts["concepts"] = [c for c in concepts["concepts"] if c["loc"][0] != 20]
        model = eg.build_model(raw, concepts, examples, meta)
        self.assertEqual(eg.unexpanded(model), [20])
        self.assertIn("— not yet expanded", eg.static_index(model))

    def test_spacing_around_punctuation(self):
        self.assertEqual(eg.detokenize(eg.tokenize("Kim called it “a disaster”.")), "Kim called it “a disaster”.")
        self.assertEqual(eg.detokenize(eg.tokenize("Pat (a nurse) resigned.")), "Pat (a nurse) resigned.")
        word = {"id": "t", "text": "well-known", "kind": "word", "segments": ["well", "-", "known"]}
        self.assertEqual(eg.detokenize(eg.example_tokens(word)), "well-known")


def word(tree, segments, **extra):
    ex = dict({"id": "t", "text": "".join(segments), "kind": "word", "segments": segments, "tree": tree}, **extra)
    ex["tokens"] = eg.example_tokens(ex)
    return ex


class WordStructureTest(unittest.TestCase):
    def test_a_valid_word_structure(self):
        ex = word("[N#w [Base:Adj#u [Affix:Prefix un] [Base:Adj{base=happy|alt=y-replacement} happi]] [Affix:Suffix ness]]", ["un", "happi", "ness"])
        nodes = eg.flatten(eg.parse_tree(ex))
        self.assertEqual(nodes["w"][0]["span"], [0, 3])
        self.assertEqual(nodes["u"][0]["span"], [0, 2])
        self.assertEqual(eg.detokenize(ex["tokens"]), "unhappiness")

    def test_word_structure_errors_are_rejected(self):
        bad = {
            "a suffix before the base": ("[N [Affix:Suffix ness] [Base:Adj kind]]", ["ness", "kind"]),
            "no base at all": ("[N [Affix:Prefix un] [Affix:Suffix ness]]", ["un", "ness"]),
            "an affix with a word category": ("[N [Base:Adj kind] [Affix:N ness]]", ["kind", "ness"]),
            "a phrase category inside a word": ("[N [Base:AdjP kind] [Affix:Suffix ness]]", ["kind", "ness"]),
            "a syntactic function inside a word": ("[N [Head:Adj kind] [Affix:Suffix ness]]", ["kind", "ness"]),
            "a single base without its operation": ("[V [Base:N bottle]]", ["bottle"]),
            "a wrong spelling alternation": ("[V [Base:V{base=hope|alt=doubling} hop] [Affix:Suffix ing]]", ["hop", "ing"]),
            "an unknown alternation": ("[V [Base:V{base=hope|alt=magic} hop] [Affix:Suffix ing]]", ["hop", "ing"]),
            "an antecedent inside a word": ("[N [Base:Adj#a kind] [Affix:Suffix{ante=a} ness]]", ["kind", "ness"]),
        }
        for why, (tree, segments) in bad.items():
            with self.assertRaises(AssertionError, msg=why):
                eg.parse_tree(word(tree, segments))

    def test_segments_must_spell_the_word(self):
        with self.assertRaisesRegex(AssertionError, "do not spell"):
            eg.example_tokens({"id": "t", "text": "kindness", "kind": "word", "segments": ["kind", "nes"]})
        with self.assertRaises(AssertionError):
            eg.example_tokens({"id": "t", "text": "Kim left.", "segments": ["Kim left."]})


def sentence(text, tree, marks):
    ex = {"id": "t", "text": text, "tree": tree, "marks": marks, "tokens": eg.tokenize(text)}
    ex["tree"] = eg.parse_tree(ex)
    return eg.build_marks(ex, eg.flatten(ex["tree"]))


class PunctuationAndAntecedentTest(unittest.TestCase):
    TEXT = "Pat (a nurse) resigned."
    TREE = "[Clause#c [Subject:NP#s [Head:N Pat]] [Supplement:NP#sup{anchor=s} [Det:D a] [Head:N nurse]] [Predicate:VP#p [Predicator:V resigned]]]"

    def marks(self, **change):
        marks = [{"id": "m1", "at": "(", "name": "opening parenthesis", "bounds": "sup", "side": "start", "use": "opens", "pair": "m2"},
                 {"id": "m2", "at": ")", "name": "closing parenthesis", "bounds": "sup", "side": "end", "use": "closes", "pair": "m1"},
                 {"id": "m3", "at": ".", "name": "full stop", "bounds": "c", "side": "end", "use": "ends"}]
        for key, value in change.items():
            i, field = key.split("_", 1)
            if value is None:
                del marks[int(i)][field]
            else:
                marks[int(i)][field] = value
        return marks

    def test_valid_marks_resolve_to_tokens(self):
        out = sentence(self.TEXT, self.TREE, self.marks())
        self.assertEqual([m["i"] for m in out], [1, 4, 6])
        self.assertEqual([m["class"] for m in out], ["parenthesis", "parenthesis", "primary terminal"])

    def test_mark_errors_are_rejected(self):
        bad = {
            "a character that is not the named indicator": dict(**{"0_name": "comma"}),
            "a mark away from its constituent": dict(**{"0_bounds": "s"}),
            "a closing mark on the wrong side": dict(**{"1_side": "start"}),
            "an unpaired parenthesis": dict(**{"0_pair": None, "1_pair": None}),
            "a terminal that does not close the whole example": dict(**{"2_bounds": "p"}),
            "a punctuation token that is not there": dict(**{"2_at": ".2"}),
            "a mark id that clashes with a node": dict(**{"2_id": "sup"}),
            "an unknown side": dict(**{"2_side": "middle"}),
        }
        for why, change in bad.items():
            with self.assertRaises(AssertionError, msg=why):
                sentence(self.TEXT, self.TREE, self.marks(**change))

    def test_every_punctuation_token_needs_a_mark_once_any_is_marked(self):
        with self.assertRaisesRegex(AssertionError, "not attached"):
            sentence(self.TEXT, self.TREE, self.marks()[:2])
        self.assertEqual(sentence(self.TEXT, self.TREE, []), [])

    def test_marks_in_the_corpus_sit_on_their_boundaries(self):
        model = eg.build_model(*corpus())
        for e in model["examples"]:
            for m in e["marks"]:
                self.assertEqual(e["tokens"][m["i"]]["k"], "p", e["id"])
                self.assertIn(e["tokens"][m["i"]]["t"], eg.INDICATORS[m["name"]][0], e["id"])

    def test_antecedent_errors_are_rejected(self):
        ok = "[Clause [Subject:NP#k [Head:N Kim]] [Predicate:VP [Predicator:V blamed] [Object:NP{ante=k} [Head:N herself]]]]"
        text = "Kim blamed herself."
        eg.parse_tree({"id": "t", "text": text, "tree": ok, "tokens": eg.tokenize(text)})
        for why, tree in {"an unknown antecedent": ok.replace("ante=k", "ante=zz"),
                          "an anaphor inside its antecedent": ok.replace("[Clause [", "[Clause#c [").replace("ante=k", "ante=c"),
                          "a spelling alternation in a sentence": ok.replace("ante=k", "base=her|alt=doubling")}.items():
            with self.assertRaises(AssertionError, msg=why):
                eg.parse_tree({"id": "t", "text": text, "tree": tree, "tokens": eg.tokenize(text)})


if __name__ == "__main__":
    unittest.main()
