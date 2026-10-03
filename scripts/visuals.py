"""Where the visuals live and what each one's visual.json says, for the shared tooling in scripts/.

Every visual is one folder viz/<slug>/ holding its page, data, builder, tests and visual.json; the folder
name is the slug. Nothing else lists the visuals, so these helpers find them by scanning the folders.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VIZ = "viz"
SLUG = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")


def folders(root=ROOT):
    """Every visual's folder, sorted by slug: each directory under viz/."""
    base = root / VIZ
    return sorted(path for path in base.iterdir() if path.is_dir()) if base.is_dir() else []


def metadata(folder):
    """The folder's visual.json as a dict, or None when it has none."""
    path = folder / "visual.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else None


def visuals(root=ROOT):
    """Map each slug that has a visual.json to its parsed metadata."""
    return {folder.name: data for folder in folders(root) if (data := metadata(folder)) is not None}
