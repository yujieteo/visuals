#!/usr/bin/env python3
"""Second check of the extraction: representative points read by another method.

digitize.py reads every trace from a rectified raster calibrated by the frame corners. This
check does not use that raster or that calibration. For each point in review.json it:
  1. finds the extracted sample within 0.05 degrees of the point, then takes the scan column at
     that sample's angle (the frame only locates the column),
  2. finds the printed gridline rows above and below the trace in that part of the scan,
  3. reads the black runs of that column (for a dot, of the 2 columns at each side too), away
     from the gridline rows, and keeps the run nearest to the approximate value read by eye (for
     a dot, nearest to the sample, so that both values describe the same printed dot),
  4. converts the run centre to dB between the two printed gridlines.
It then compares this value with the nearest sample in traces.json. A point passes when the two
values differ by no more than the larger of TOLERANCE_DB and that sample's extraction error.

    python3 review.py    # print the comparison; exit 1 when a point fails
"""
import json
import sys
from pathlib import Path

from geometry import bilinear, find_frame
from pngio import read_bilevel_png

HERE = Path(__file__).resolve().parent
TOLERANCE_DB = 0.6
TOLERANCE_DEG = 0.05
GRID_DB = [-10, -20, -30, -40, -50, -60, -70]


def frame_uv(x, y):
    return (x - 175) / 10, (y + 10) / -60


def independent_value(rows, corners, point):
    height = len(rows)
    col, _ = bilinear(corners, *frame_uv(point["x"], -40))
    col = int(round(col))
    window = range(max(0, col - 100), min(len(rows[0]), col + 100))
    counts = {}
    grid_rows = {}
    for g in GRID_DB:
        _, guess = bilinear(corners, *frame_uv(point["x"], g))
        candidates = range(max(0, int(guess) - 8), min(height, int(guess) + 9))
        for y in candidates:
            if y not in counts:
                counts[y] = sum(rows[y][i] for i in window)
        grid_rows[g] = max(candidates, key=lambda y: (counts[y], -abs(y - guess)))

    def to_db(row):
        for upper, lower in zip(GRID_DB, GRID_DB[1:]):
            a, b = grid_rows[upper], grid_rows[lower]
            if a <= row <= b:
                return upper + (row - a) / (b - a) * (lower - upper)
        return None

    near_grid = lambda r: any(abs(r - gr) <= 3 for gr in grid_rows.values())
    runs = []
    reach = 0 if point["role"] == "reconstructed" else 2
    for c in range(col - reach, col + reach + 1):
        current = None
        for y in range(grid_rows[-10] + 3, grid_rows[-70] - 2):
            if rows[y][c]:
                if current and y == current[1] + 1:
                    current[1] = y
                else:
                    current = [y, y]
                    runs.append(current)
    runs = [r for r in runs if not (near_grid((r[0] + r[1]) / 2) and r[1] - r[0] < 4)]
    if not runs:
        return None, col, grid_rows
    best = min(runs, key=lambda r: abs(to_db((r[0] + r[1]) / 2) - point["pick"]))
    return to_db((best[0] + best[1]) / 2), col, grid_rows


def check():
    review = json.loads((HERE / "review.json").read_text(encoding="utf-8"))
    traces = {f["id"]: f for f in json.loads((HERE / "traces.json").read_text(encoding="utf-8"))["figures"]}
    crops = {}
    results = []
    for p in review["points"]:
        fig = traces[p["figure"]]
        if p["figure"] not in crops:
            _, _, rows = read_bilevel_png(HERE / "figures" / fig["crop_file"])
            crops[p["figure"]] = (rows, find_frame(rows))
        rows, corners = crops[p["figure"]]
        trace = next(t for t in fig["traces"] if t["role"] == p["role"])
        samples = trace["samples"] if p["role"] == "reconstructed" else [s for seg in trace["segments"] for s in seg]
        near = [s for s in samples if abs(s[0] - p["x"]) <= TOLERANCE_DEG]
        sample = min(near, key=lambda s: (abs(s[1] - p["approx"]), abs(s[0] - p["x"]))) if near else None
        # Read the scan at the sample's own angle, so that both values describe the same column.
        # The approximate value picks the sample; for a dot, the sample's value then picks the same
        # printed mark. The value itself comes only from the column and the printed gridlines.
        pick = p["approx"] if p["role"] == "reconstructed" else (sample[1] if sample else None)
        value = independent_value(rows, corners, {**p, "x": sample[0], "pick": pick})[0] if sample else None
        ok = sample is not None and value is not None and abs(sample[1] - value) <= max(TOLERANCE_DB, sample[2])
        results.append({**p, "independent_db": None if value is None else round(value, 1), "sample": sample, "pass": ok})
    for g in review.get("clipped", []):
        trace = next(t for t in traces[g["figure"]]["traces"] if t["role"] == g["role"])
        in_gap = any(gap["from"] <= g["x"] <= gap["to"] and "frame" in gap["reason"] for gap in trace["gaps"])
        has_sample = any(abs(s[0] - g["x"]) < 0.005 for s in trace["samples"])
        results.append({**g, "pass": in_gap and not has_sample})
    return results


def main():
    results = check()
    for r in results:
        print(f"{'PASS' if r['pass'] else 'FAIL'} {r['figure']} {r['role']:<13} {r['x']:7.2f}  by eye {r.get('approx', '-')}  independent {r.get('independent_db', '-')}  extracted {r.get('sample', '-')}")
    if not all(r["pass"] for r in results):
        sys.exit(1)


if __name__ == "__main__":
    main()
