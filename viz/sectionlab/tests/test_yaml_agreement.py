"""The browser's YAML subset reader and writer agree with PyYAML (used here only, never in the page)."""

import json
import math
import shutil
import subprocess
import sys
import unittest
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT / "reference"))

import cases as C  # noqa: E402

# Reads JSON lines of {op, value}: "dump" writes YAML, "load" parses YAML text; prints JSON results.
NODE = r"""
const Y = require(process.argv[1] + "/src/yaml.js");
const jobs = JSON.parse(require("fs").readFileSync(0, "utf8"), (k, x) => (x && typeof x === "object" && Object.keys(x).length === 1 && "$num" in x ? Number(x.$num) : x));
const enc = (v) => JSON.stringify(v, (k, x) => (typeof x === "number" && !Number.isFinite(x) ? { $num: String(x) } : x));
process.stdout.write("[" + jobs.map((j) => {
  try { return enc({ ok: j.op === "dump" ? Y.stringify(j.value) : Y.parse(j.value) }); }
  catch (e) { return enc({ error: e.message }); }
}).join(",") + "]");
"""


def run_js(jobs):
    node = shutil.which("node")
    if node is None:
        raise AssertionError("node is required")
    def enc(x):
        if isinstance(x, float) and not math.isfinite(x):
            return {"$num": "NaN" if math.isnan(x) else ("Infinity" if x > 0 else "-Infinity")}
        if isinstance(x, dict):
            return {k: enc(v) for k, v in x.items()}
        if isinstance(x, list):
            return [enc(v) for v in x]
        return x
    out = subprocess.run([node, "-e", NODE, str(ROOT)], input=json.dumps(enc(jobs)), capture_output=True, text=True, check=True).stdout

    def fix(x):
        if isinstance(x, dict) and set(x) == {"$num"}:
            return float(x["$num"].replace("Infinity", "inf"))
        if isinstance(x, dict):
            return {k: fix(v) for k, v in x.items()}
        if isinstance(x, list):
            return [fix(v) for v in x]
        return x
    return fix(json.loads(out))


def same(a, b):
    if isinstance(a, float) and math.isnan(a):
        return isinstance(b, float) and math.isnan(b)
    if isinstance(a, bool) or isinstance(b, bool):
        return a is b
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return a == b
    if isinstance(a, dict):
        # Mappings are unordered (and JavaScript lists integer-like keys first).
        return isinstance(b, dict) and set(a) == set(b) and all(same(a[k], b[k]) for k in a)
    if isinstance(a, list):
        return isinstance(b, list) and len(a) == len(b) and all(same(x, y) for x, y in zip(a, b))
    return a == b


STRINGS = ["yes", "No", "on", "OFF", "null", "~", "", " lead", "trail ", "a: b", "a #b", "#x", "- x", "? x", ":x", "x:", "12", "1.5", "1e5", "1.0e+5",
                 ".5", "-.inf", ".nan", "2026-09-30", "0x10", "010", "1_000", "1:30", "=", "<<", "σ0.2 — ε", "tab\there", "new\nline", 'quote"d', "back\\slash",
                 "it's", "[x]", "{x}", "*x", "&x", "!x", "%x", "@x", "`x", "|x", ">x", "x,y", "True", "FALSE", "Null", "NULL"]

VALUES = [
    *[c["model"] for c in C.CASES],
    {"strings": STRINGS},
    {"numbers": [0, 1, -1, 42, 1e-9, -3e-5, 2.5, 1e20, 2.5e21, 123456.789, 1.7976931348623157e308, 5e-324, float("inf"), float("-inf")]},
    {"nested": {"a": [[1, 2], [], {}, {"b": None}], "c": [{"d": [1, 2]}, {"e": {"f": True}}]}},
    {"quoted keys": 1, "yes": 2, "12": 3, "a: b": 4},
    [],
    {},
]

SUBSET_TEXTS = [
    "a: 1\nb: [1, 2, 'x']\nc:\n- 1\n- two\n",
    "# comment\n---\nkey: value  # trailing\nlist:\n  - a: 1\n    b: 2\n  - c: 3\n...\n",
    "flags: [yes, no, on, off, True, FALSE]\nnulls: [~, null, Null]\n",
    "f: [1.5, -0.25, 1.0e+3, 2.5E-4, .5, -.inf, +.inf]\ni: [0, -7, +3]\n",
    "s: 'single ''quoted'''\nd: \"double \\\"quoted\\\" \\u03c3 \\n\"\n",
    "empty:\nnext: 1\n",
    "same:\n- 1\n- 2\nother: x\n",
    "- - 1\n  - 2\n- - 3\n",
    "text: plain words, commas; and-dashes\n",
    "odd: [1e5, 0o17, y, n, inf]\n",
    "k: a#b\n",
]

REJECTED = ["a: &x 1\nb: *x\n", "a: !!str 1\n", "a: |\n  x\n", "a: {b: 1}\n", "a: 0x10\n", "a: 1_000\n", "a: 1:30\n", "a: 010\n",
            "a: 2026-09-30\n", "a: 1\n---\nb: 2\n", "a: [1, [2]]\n", "<<: {}\n", "a: 'folded\n  over lines'\n"]


class YamlAgreementTest(unittest.TestCase):
    def test_pyyaml_reads_what_the_page_writes(self):
        dumped = run_js([{"op": "dump", "value": v} for v in VALUES])
        for v, d in zip(VALUES, dumped):
            self.assertIn("ok", d, d)
            self.assertTrue(same(yaml.safe_load(d["ok"]), v), f"PyYAML read back something else from:\n{d['ok']}")

    def test_the_page_reads_what_pyyaml_writes(self):
        # Multi-line strings are outside the subset (PyYAML folds them over lines); every other value is in it.
        plain = [v for v in VALUES if "strings" not in v] + [{"strings": [x for x in STRINGS if "\n" not in x]}]
        texts = [yaml.safe_dump(v, sort_keys=False, allow_unicode=True, default_flow_style=False) for v in plain]
        texts += [yaml.safe_dump(v, sort_keys=False, allow_unicode=False, default_flow_style=False) for v in plain]
        # Flow style (default_flow_style=None) writes flow mappings, which the subset leaves out.
        loaded = run_js([{"op": "load", "value": t} for t in texts])
        for t, d in zip(texts, loaded):
            self.assertIn("ok", d, f"{d}\n{t}")
            self.assertTrue(same(d["ok"], yaml.safe_load(t)), f"page read back something else from:\n{t}")

    def test_both_read_the_subset_the_same_way(self):
        loaded = run_js([{"op": "load", "value": t} for t in SUBSET_TEXTS])
        for t, d in zip(SUBSET_TEXTS, loaded):
            self.assertIn("ok", d, f"{d}\n{t}")
            self.assertTrue(same(d["ok"], yaml.safe_load(t)), f"disagreement on:\n{t}\npage: {d['ok']}\nPyYAML: {yaml.safe_load(t)}")

    def test_outside_the_subset_the_page_refuses_rather_than_guess(self):
        for t, d in zip(REJECTED, run_js([{"op": "load", "value": t} for t in REJECTED])):
            self.assertIn("error", d, f"accepted:\n{t}")
            self.assertIn("YAML", d["error"])


if __name__ == "__main__":
    unittest.main()
