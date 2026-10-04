"""The full-corpus page: the committed snapshot plus every theorem of the pinned mathlib build (spec sections 11 and 16).

  python3 viz/theorem-explorer/pipeline/fullbuild.py

The committed index.html holds the named catalog. This page adds the formal library (<work>/out/corpus.json, written
by assemble.py) as one more compressed pack, which the viewer decodes only when the reader opens it. The page goes to
<work>/full/theorem-explorer/index.html, outside Git, and the command prints its size. Measure the load time and memory
with page-axi or the browser on that file.
"""
import json
import shutil
import sys

from assemble import pack
from common import ROOT, VISUAL, WORK, read_json

sys.path.insert(0, str(ROOT / "scripts"))
import visual_build  # noqa: E402

OUT = WORK / "out"
FOLDER = WORK / "full" / VISUAL.name
COPY = ["visual.json", "generated.json", "beamdswitch.js", "report.js", "src"]


def build():
    raw = read_json(VISUAL / "raw.json")
    corpus = read_json(OUT / "corpus.json")
    if len(corpus["rows"]) != raw["coverage"]["formal"]["theorems"]:
        sys.exit(f"corpus.json has {len(corpus['rows'])} theorems, the snapshot counts {raw['coverage']['formal']['theorems']}: "
                 "run assemble.py for this snapshot first")
    raw["packs"]["formal"] = pack(corpus)
    if FOLDER.exists():
        shutil.rmtree(FOLDER)
    FOLDER.mkdir(parents=True)
    for name in COPY:
        src = VISUAL / name
        (shutil.copytree if src.is_dir() else shutil.copy)(src, FOLDER / name)
    (FOLDER / "raw.json").write_text(json.dumps(raw, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    text = visual_build.page(FOLDER)
    (FOLDER / "index.html").write_text(text, encoding="utf-8")
    return FOLDER / "index.html", len(text.encode("utf-8")), raw["packs"]["formal"]


if __name__ == "__main__":
    path, size, p = build()
    print(f"wrote {path.relative_to(ROOT)} ({size} bytes; formal pack {p['bytes']} bytes, {p['gz_bytes']} compressed)")
