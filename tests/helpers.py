"""A throwaway repository layout for the tooling tests: viz/<slug>/ folders under a temporary root."""
import json
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
sys.dont_write_bytecode = True

PAGE = '<!doctype html><title>t</title><script>mc?.registerTool({name:"get_data"});mc?.registerTool({name:"get_metadata"});mc?.registerTool({name:"query"})</script>'


def metadata(**fields):
    """A valid visual.json, with ``fields`` replacing or adding to the defaults."""
    data = {"title": "A visual", "summary": "What it shows.", "source_url": "https://example.org/", "fetched": "2026-10-01",
            "data": "raw.json", "webmcp_tools": ["get_data", "get_metadata", "query"], "tags": ["example"],
            "category": "data visualization"}
    data.update(fields)
    return {key: value for key, value in data.items() if value is not None}


class Layout:
    """A temporary root holding schema/ and one folder per visual; use as a context manager."""

    def __enter__(self):
        self.root = Path(tempfile.mkdtemp())
        shutil.copytree(ROOT / "schema", self.root / "schema")
        (self.root / "viz").mkdir()
        return self

    def __exit__(self, *exc):
        shutil.rmtree(self.root)

    def visual(self, slug, data=None, files=("index.html", "raw.json")):
        folder = self.root / "viz" / slug
        folder.mkdir(parents=True)
        for name in files:
            (folder / name).parent.mkdir(parents=True, exist_ok=True)
            (folder / name).write_text(PAGE if name == "index.html" else "{}", encoding="utf-8")
        if data is not False:
            (folder / "visual.json").write_text(json.dumps(data or metadata()), encoding="utf-8")
        return folder
