"""Regenerate the TOON fixtures with yujieteo/site's encoder (a read-only copy in toon.py).

Run from the repository root: python3 tests/fixtures/make_fixtures.py
The tests check that the page's JavaScript codec writes these files byte for byte and reads them back.
"""

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from toon import encode  # noqa: E402

for name, target in (
    ("sample-session", HERE.parents[1] / "sample-session.toon"),
    ("edge", HERE / "edge.toon"),
    ("export", HERE / "export.toon"),
    ("sample-interview", HERE.parents[1] / "sample-interview.toon"),
    ("interview-export", HERE / "interview-export.toon"),
):
    document = json.loads((HERE / f"{name}.json").read_text(encoding="utf-8"))
    target.write_text(encode(document), encoding="utf-8")
