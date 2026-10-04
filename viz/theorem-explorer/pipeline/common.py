"""Shared parts of the Theorem Explorer pipeline: paths, versions, digests, and a small TOON reader and writer.

The pipeline runs outside the viewer (spec section 13). Its large inputs and stages live in the work directory
(default build/te-work at the repository root, never committed); its small authored and source-derived
records live in viz/theorem-explorer/data/ and are committed.
"""
import gzip
import hashlib
import json
import os
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
VISUAL = HERE.parent
DATA = VISUAL / "data"
ROOT = VISUAL.parents[1]
WORK = Path(os.environ.get("TE_WORK", ROOT / "build" / "te-work"))
STAGE = WORK / "stage"


def shown(path):
    """A path for a message: relative to the repository root when it is in it, else absolute (TE_WORK can be elsewhere)."""
    return str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path)

SCHEMA_VERSION = "te-schema/1"
RUBRIC_VERSION = "te-rubric/1"
PROMPT_VERSION = "te-judge-prompt/1"
EXTRACT_VERSION = "lean-extract/1"
MEASURE_VERSION = "te-measure/1"
USE_RULE_VERSION = "te-use-rule/1"
NAME_RULE_VERSION = "te-names/1"


def pins():
    """The source versions of the current snapshot (data/sources/pins.json; run.py resolve rewrites it)."""
    return json.loads((DATA / "sources" / "pins.json").read_text(encoding="utf-8"))


def sha256_bytes(data):
    return hashlib.sha256(data).hexdigest()


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write_json(path, value, indent=1):
    """Write JSON with sorted-free, stable output and a final newline; return True when the bytes changed."""
    path = Path(path)
    text = json.dumps(value, ensure_ascii=False, indent=indent) + "\n"
    if path.is_file() and path.read_text(encoding="utf-8") == text:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return True


def read_jsonl(path):
    opener = gzip.open if str(path).endswith(".gz") else open
    with opener(path, "rt", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                yield json.loads(line)


def write_jsonl(path, rows):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    opener = gzip.open if str(path).endswith(".gz") else open
    with opener(path, "wt", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")


# ---------- TOON (https://github.com/toon-format/spec), the subset this pipeline writes ----------
#
# key: scalar                 a scalar field
# key:                        a nested object, its fields indented two spaces
# key[N]: a,b,c               a list of scalars
# key[N]{f1,f2}:              a table: N rows, each indented two spaces, cells separated by commas
#
# A scalar is quoted with JSON string syntax when it is empty, has a comma, colon, quote, leading or trailing
# space, or looks like a number, boolean or null but is a string. Numbers, true, false and null are bare.

_BARE_NUMBER = re.compile(r"^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$")


def _cell(value):
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, (int, float)):
        return json.dumps(value)
    text = str(value)
    if (text == "" or text != text.strip() or any(c in text for c in ',:"\\[]{}\n\t#')
            or text in ("true", "false", "null") or _BARE_NUMBER.match(text) or text.startswith("-")):
        return json.dumps(text, ensure_ascii=False)
    return text


def to_toon(obj, indent=0):
    """TOON text of a dict whose values are scalars, dicts, lists of scalars or lists of uniform flat dicts."""
    pad = "  " * indent
    lines = []
    for key, value in obj.items():
        if isinstance(value, dict):
            lines.append(f"{pad}{key}:")
            lines.append(to_toon(value, indent + 1))
        elif isinstance(value, list) and value and all(isinstance(v, dict) for v in value):
            fields = list(value[0].keys())
            for row in value:
                if list(row.keys()) != fields:
                    raise ValueError(f"{key}: table rows need the same fields in the same order")
            lines.append(f"{pad}{key}[{len(value)}]{{{','.join(fields)}}}:")
            for row in value:
                lines.append(f"{pad}  " + ",".join(_cell(row[f]) for f in fields))
        elif isinstance(value, list):
            lines.append(f"{pad}{key}[{len(value)}]: " + ",".join(_cell(v) for v in value))
        else:
            lines.append(f"{pad}{key}: {_cell(value)}")
    return "\n".join(line for line in lines if line != "")


def _split_cells(text):
    """Split one TOON row on commas outside JSON-quoted strings."""
    cells, i, n = [], 0, len(text)
    while i <= n:
        if i < n and text[i] == '"':
            j = i + 1
            while j < n and text[j] != '"':
                j += 2 if text[j] == "\\" else 1
            if j >= n:
                raise ValueError(f"an unclosed quote in: {text[:80]}")
            cells.append(json.loads(text[i:j + 1]))
            i = j + 1
            if i < n and text[i] != ",":
                raise ValueError(f"text after a quoted cell in: {text[:80]}")
            i += 1
        else:
            j = text.find(",", i)
            j = n if j < 0 else j
            cells.append(_scalar(text[i:j].strip()))
            i = j + 1
    return cells


def _scalar(text):
    if text == "null":
        return None
    if text == "true":
        return True
    if text == "false":
        return False
    if _BARE_NUMBER.match(text):
        return json.loads(text)
    if text.startswith('"'):
        return json.loads(text)
    return text


_HEAD = re.compile(r"^(?P<key>[^\[\]{}:]+?)(?:\[(?P<n>\d+)\](?:\{(?P<fields>[^}]*)\})?)?:(?:\s(?P<rest>.*))?$")


def from_toon(text):
    """Parse the TOON subset that to_toon() writes. Lines that start with # are comments."""
    lines = [l for l in text.split("\n") if l.strip() and not l.lstrip().startswith("#")]
    pos = 0

    def block(depth):
        nonlocal pos
        out = {}
        while pos < len(lines):
            line = lines[pos]
            ind = (len(line) - len(line.lstrip(" "))) // 2
            if ind < depth:
                break
            if ind > depth:
                raise ValueError(f"line {pos + 1}: unexpected indentation: {line[:80]}")
            m = _HEAD.match(line.strip())
            if not m:
                raise ValueError(f"line {pos + 1}: not a TOON field: {line[:80]}")
            key, n, fields, rest = m["key"], m["n"], m["fields"], m["rest"]
            pos += 1
            if n is not None and fields is not None:
                names = [f.strip() for f in fields.split(",")]
                rows = []
                for _ in range(int(n)):
                    if pos >= len(lines):
                        raise ValueError(f"{key}: expected {n} rows, found {len(rows)}")
                    cells = _split_cells(lines[pos].strip())
                    if len(cells) != len(names):
                        raise ValueError(f"line {pos + 1}: {key} row has {len(cells)} cells, expected {len(names)}")
                    rows.append(dict(zip(names, cells)))
                    pos += 1
                out[key] = rows
            elif n is not None:
                out[key] = _split_cells(rest) if rest else []
                if len(out[key]) != int(n):
                    raise ValueError(f"{key}: expected {n} items, found {len(out[key])}")
            elif rest is None or rest == "":
                out[key] = block(depth + 1)
            else:
                out[key] = _scalar(rest.strip())
        return out

    return block(0)
