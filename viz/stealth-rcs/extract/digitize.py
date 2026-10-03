#!/usr/bin/env python3
"""Extract the solid (reconstructed) and dotted (original) traces from the figure crops.

Reads figures/figures.json and the crops fetch_figures.py wrote, and writes:
  traces.json        every trace's samples, gaps, excluded marks, calibration and error budget
  review/*.png       one review overlay per trace: the scan in grey, the extracted samples on top

    python3 digitize.py            # regenerate traces.json and review/
    python3 digitize.py --verify   # check both are fresh without writing

Method, in order:
  1. Frame. The four frame edges are found as the strongest straight lines (geometry.py) and
     refitted by least squares; their intersections are the calibration anchors, at the axis
     bounds printed beside them (175 and 185 degrees, -10.0 and -70.0 dB).
  2. Rectify. The frame is resampled (nearest neighbour, about one output pixel per scan pixel)
     into a raster whose columns are equal steps of angle and whose rows are equal steps of dB.
  3. Check. The dotted gridlines at every degree and every 10 dB are located in the raster and
     compared with the positions the anchors predict; the largest difference is the anchor error.
  4. Separate. Black pixels away from the frame are grouped into 8-connected marks. Long marks
     are the solid line. Small marks centred on a gridline are grid dots and are removed, with
     any dot of the dotted line that lies on the gridline (the two cannot be told apart). The
     remaining small marks are dots of the dotted line; they are chained left
     to right, and a mark with fewer than two neighbours in its chain is excluded as unconfirmed.
  5. Sample. The solid line is read at fixed angles (every 0.02 degrees) as the centre of the
     line's vertical extent; the dotted line is read at each dot's centre. Where the solid line
     is absent, or meets the frame, or other dots touch it (a run far longer than the runs a few
     columns away), or a dotted chain breaks, the trace has a gap: no value.
  6. Repeat. Step 5 is repeated with the gridlines nearest the frame (176 and 184 degrees,
     -20 and -60 dB) as anchors instead of the frame corners; the largest change of any sample
     is the repeat-extraction error.
"""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

from geometry import bilinear, find_frame
from pngio import read_bilevel_png, write_palette_png

HERE = Path(__file__).resolve().parent
TOOL = {"name": "digitize.py", "version": "1.0.0", "language": "Python 3 standard library",
        "operator": "Claude (AI agent), Firstmate crewmate run for the site owner", "date": "2026-10-03"}
X_BOUNDS = (175.0, 185.0)    # degrees at the left and right frame edges, as printed on the axis
Y_BOUNDS = (-10.0, -70.0)    # dB at the top and bottom frame edges, as printed on the axis
X_GRID = [176.0 + k for k in range(9)]
Y_GRID = [-20.0 - 10 * k for k in range(5)]
SOLID_STEP = 0.02            # degrees between solid-line samples
FRAME_BAND = 3               # raster pixels next to the frame that belong to the frame line
LINE_MIN_EXTENT = 60         # raster pixels: solid-line pieces are 97 or longer, frame ticks 33 or shorter
LINK_RADIUS = 26             # raster pixels: the furthest step between dots of one dotted chain
GRID_TOLERANCE = 2.5         # raster pixels: grid dots lie within 1.8 of their gridline's centre
PALETTE = [(255, 255, 255), (190, 190, 190), (200, 30, 30), (20, 80, 200), (0, 140, 60)]


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def round1(v):
    return float(f"{v:.1f}")


def round2(v):
    return float(f"{v:.2f}")


def ceil1(v):
    return math.ceil(round(v * 10, 6)) / 10


# ---------- raster ----------

def rectify(rows, corners):
    top = math.dist(corners[0], corners[1])
    bottom = math.dist(corners[2], corners[3])
    left = math.dist(corners[0], corners[2])
    right = math.dist(corners[1], corners[3])
    width, height = round((top + bottom) / 2), round((left + right) / 2)
    raster = []
    for j in range(height):
        line = []
        for i in range(width):
            x, y = bilinear(corners, (i + 0.5) / width, (j + 0.5) / height)
            line.append(rows[int(math.floor(y))][int(math.floor(x))])
        raster.append(line)
    return width, height, raster


def marks(raster, width, height):
    """8-connected groups of black pixels outside the frame band."""
    seen = [[False] * width for _ in range(height)]
    out = []
    for j in range(FRAME_BAND, height - FRAME_BAND):
        for i in range(FRAME_BAND, width - FRAME_BAND):
            if raster[j][i] and not seen[j][i]:
                stack, pixels = [(i, j)], []
                seen[j][i] = True
                while stack:
                    a, b = stack.pop()
                    pixels.append((a, b))
                    for da in (-1, 0, 1):
                        for db in (-1, 0, 1):
                            p, q = a + da, b + db
                            if FRAME_BAND <= p < width - FRAME_BAND and FRAME_BAND <= q < height - FRAME_BAND and raster[q][p] and not seen[q][p]:
                                seen[q][p] = True
                                stack.append((p, q))
                xs, ys = [p[0] for p in pixels], [p[1] for p in pixels]
                out.append({"pixels": pixels, "n": len(pixels), "x0": min(xs), "x1": max(xs), "y0": min(ys), "y1": max(ys),
                            "cx": sum(xs) / len(xs) + 0.5, "cy": sum(ys) / len(ys) + 0.5})
    return out


def grid_positions(raster, width, height):
    """Observed raster column of each degree gridline and row of each 10 dB gridline."""
    col = [sum(raster[j][i] for j in range(height)) for i in range(width)]
    row = [sum(raster[j]) for j in range(height)]

    def peak(counts, expected):
        window = range(max(0, int(expected) - 8), min(len(counts), int(expected) + 9))
        best = max(window, key=lambda k: (counts[k], -abs(k - expected)))
        # centre of the peak: weighted by counts over best-1..best+1
        ks = [k for k in (best - 1, best, best + 1) if 0 <= k < len(counts)]
        return sum(k * counts[k] for k in ks) / sum(counts[k] for k in ks) + 0.5

    xs = {x: peak(col, (x - X_BOUNDS[0]) / (X_BOUNDS[1] - X_BOUNDS[0]) * width) for x in X_GRID}
    ys = {y: peak(row, (y - Y_BOUNDS[0]) / (Y_BOUNDS[1] - Y_BOUNDS[0]) * height) for y in Y_GRID}
    return xs, ys


# ---------- traces ----------

class Calibration:
    """Maps raster pixels to data: the anchors' raster positions and their data values."""

    def __init__(self, name, i_a, x_a, i_b, x_b, j_a, y_a, j_b, y_b):
        self.name = name
        self.i_a, self.x_a, self.i_b, self.x_b = i_a, x_a, i_b, x_b
        self.j_a, self.y_a, self.j_b, self.y_b = j_a, y_a, j_b, y_b

    def x(self, i):
        return self.x_a + (i - self.i_a) * (self.x_b - self.x_a) / (self.i_b - self.i_a)

    def y(self, j):
        return self.y_a + (j - self.j_a) * (self.y_b - self.y_a) / (self.j_b - self.j_a)

    def i(self, x):
        return self.i_a + (x - self.x_a) * (self.i_b - self.i_a) / (self.x_b - self.x_a)

    def db_per_px(self):
        return abs((self.y_b - self.y_a) / (self.j_b - self.j_a))

    def deg_per_px(self):
        return abs((self.x_b - self.x_a) / (self.i_b - self.i_a))


def runs_in_column(column_pixels):
    """Vertical runs of solid-line pixels in one column; breaks of up to 2 pixels are scan dropouts."""
    rows = sorted(column_pixels)
    out = []
    for r in rows:
        if out and r <= out[-1][1] + 3:
            out[-1][1] = r
        else:
            out.append([r, r])
    return out


def nearest_run(runs, centre):
    return min(runs, key=lambda r: (abs((r[0] + r[1] + 1) / 2 - centre), r[0])) if runs else None


def sample_solid(line_columns, height, cal, width, line_width):
    """(x, y_px_centre, half_extent_px, status) at each solid-line sample angle."""
    out, previous = [], []
    count = int(round((X_BOUNDS[1] - X_BOUNDS[0]) / SOLID_STEP))
    for k in range(count):
        x = round(X_BOUNDS[0] + SOLID_STEP * (k + 0.5), 4)
        i = int(math.floor(cal.i(x)))
        if i < FRAME_BAND or i >= width - FRAME_BAND:
            out.append((x, None, None, "frame"))
            previous = []
            continue
        runs = runs_in_column(line_columns.get(i, []))
        if not runs:
            out.append((x, None, None, "absent"))
            previous = []
            continue
        if len(previous) >= 2:
            guess = 2 * previous[-1] - previous[-2]
        elif previous:
            guess = previous[-1]
        else:
            guess = None
        if guess is None:
            run = max(runs, key=lambda r: (r[1] - r[0], -r[0]))  # the longest run starts a stretch
        else:
            run = min(runs, key=lambda r: (abs((r[0] + r[1] + 1) / 2 - guess), r[0]))
        if run[0] <= FRAME_BAND or run[1] >= height - FRAME_BAND - 1:
            out.append((x, None, None, "at_frame"))
            previous = []
            continue
        length = run[1] - run[0] + 1
        if length > 3 * line_width:
            # A steep line gives long runs in the nearby columns too; dots that touch the line
            # give one long run between short ones.
            centre = (run[0] + run[1] + 1) / 2
            side = [nearest_run(runs_in_column(line_columns.get(i + d, [])), centre) for d in (-3, 3)]
            if all(r is not None and r[1] - r[0] + 1 <= 2 * line_width for r in side):
                out.append((x, None, None, "touched"))
                previous = []
                continue
        centre = (run[0] + run[1] + 1) / 2
        # Column placement: the scan column under a sample is known to about one pixel, so the
        # change of the line over one column at each side adds to the sample's half extent.
        sides = [nearest_run(runs_in_column(line_columns.get(i + d, [])), centre) for d in (-1, 1)]
        slope = max([abs((r[0] + r[1] + 1) / 2 - centre) for r in sides if r is not None], default=0.0)
        out.append((x, centre, (run[1] - run[0] + 1) / 2 + slope, "ok"))
        previous = (previous + [centre])[-2:]
    return out


def chain_dots(dots):
    """Greedy left-to-right chains of dotted-line marks; each chain is a list of dots.

    Each step goes to the cheapest unused dot within LINK_RADIUS, where the cost is the distance
    weighted by how far the step turns from the chain's heading, so a chain follows one side of
    a deep null instead of cutting across to the other side.
    """
    remaining = sorted(dots, key=lambda d: (d["cx"], d["cy"]))
    used = set()
    chains = []
    for start in range(len(remaining)):
        if start in used:
            continue
        chain, current = [remaining[start]], start
        used.add(start)
        while True:
            c = remaining[current]
            if len(chain) >= 2:
                hx, hy = c["cx"] - chain[-2]["cx"], c["cy"] - chain[-2]["cy"]
            else:
                hx, hy = 1.0, 0.0
            norm = math.hypot(hx, hy) or 1.0
            best = None
            for k in range(len(remaining)):
                if k in used:
                    continue
                d = remaining[k]
                if d["cx"] - c["cx"] > LINK_RADIUS:
                    break
                if d["cx"] < c["cx"] - 4:
                    continue
                dx, dy = d["cx"] - c["cx"], d["cy"] - c["cy"]
                dist = math.hypot(dx, dy)
                if dist > LINK_RADIUS or dist == 0:
                    continue
                turn = 1 - (dx * hx + dy * hy) / (dist * norm)   # 0 straight on, 2 straight back
                if turn > 1.0 and len(chain) >= 2:
                    continue                                    # never turn back by more than 90 degrees
                cost = dist * (1 + 2 * turn)
                if best is None or cost < best[0]:
                    best = (cost, k)
            if best is None:
                break
            current = best[1]
            used.add(current)
            chain.append(remaining[current])
        chains.append(chain)
    return chains


def near_solid(a, b, line_set, reach=5):
    """True when most of the straight path from dot a to dot b runs within reach of the solid line."""
    steps = max(2, int(math.hypot(b["cx"] - a["cx"], b["cy"] - a["cy"]) / 3))
    close = 0
    for s in range(1, steps):
        t = s / steps
        x = int(a["cx"] + (b["cx"] - a["cx"]) * t)
        y = int(a["cy"] + (b["cy"] - a["cy"]) * t)
        if any((x + dx, y + dy) in line_set for dx in range(-reach, reach + 1, 2) for dy in range(-reach, reach + 1)):
            close += 1
    return close >= 0.6 * (steps - 1)


# ---------- one figure ----------

def extract(fig):
    path = HERE / "figures" / fig["crop_file"]
    if sha256(path) != fig["crop_sha256"]:
        sys.exit(f"digitize.py: {path.name} does not match figures.json; rerun fetch_figures.py")
    width0, height0, rows = read_bilevel_png(path)
    corners = find_frame(rows)
    width, height, raster = rectify(rows, corners)

    frame_cal = Calibration("frame corners", 0, X_BOUNDS[0], width, X_BOUNDS[1], 0, Y_BOUNDS[0], height, Y_BOUNDS[1])
    gx, gy = grid_positions(raster, width, height)
    grid_cal = Calibration("gridlines at 176 and 184 degrees, -20 and -60 dB", gx[176.0], 176.0, gx[184.0], 184.0, gy[-20.0], -20.0, gy[-60.0], -60.0)
    anchor_px = max([abs(gx[x] - frame_cal.i(x)) for x in X_GRID]
                    + [abs(gy[y] - (y - Y_BOUNDS[0]) / (Y_BOUNDS[1] - Y_BOUNDS[0]) * height) for y in Y_GRID])

    all_marks = marks(raster, width, height)
    def is_line(m):
        if max(m["x1"] - m["x0"], m["y1"] - m["y0"]) + 1 >= LINE_MIN_EXTENT:
            return True
        # A short piece of the solid line where it meets the left or right frame. Frame ticks
        # there are horizontal and at most 5 pixels high.
        at_side = m["x0"] <= FRAME_BAND or m["x1"] >= width - FRAME_BAND - 1
        return at_side and m["y1"] - m["y0"] + 1 >= 8 and m["n"] >= 40

    lines = [m for m in all_marks if is_line(m)]
    dots = [m for m in all_marks if m not in lines]

    # Grid dots: small marks centred on a gridline. A dot of the dotted line that lies on a
    # gridline cannot be told apart from the grid's own dots, so it is removed with them.
    grid_dots, trace_dots = [], []
    for d in dots:
        is_grid = any(abs(d["cx"] - gx[x]) <= GRID_TOLERANCE for x in X_GRID) or any(abs(d["cy"] - gy[y]) <= GRID_TOLERANCE for y in Y_GRID)
        (grid_dots if is_grid else trace_dots).append(d)

    line_columns, line_set = {}, set()
    for m in lines:
        for (i, j) in m["pixels"]:
            line_columns.setdefault(i, []).append(j)
            line_set.add((i, j))

    chains = chain_dots(trace_dots)
    kept = [c for c in chains if len(c) >= 3]
    unconfirmed = [d for c in chains if len(c) < 3 for d in c]
    kept.sort(key=lambda c: c[0]["cx"])

    # Line widths: vertical extent of the solid line where it is nearly flat.
    flat = sorted(r[1] - r[0] + 1 for i in sorted(line_columns) for r in runs_in_column(line_columns[i]) if r[1] - r[0] + 1 <= 6)
    line_width_px = flat[len(flat) // 2] if flat else 3
    dot_heights = sorted(d["y1"] - d["y0"] + 1 for c in kept for d in c)
    dot_height_px = dot_heights[len(dot_heights) // 2] if dot_heights else 3

    def solid_trace(cal):
        return sample_solid(line_columns, height, cal, width, line_width_px)

    def dotted_samples(cal):
        return [[(cal.x(d["cx"]), cal.y(d["cy"]), (d["y1"] - d["y0"] + 1) / 2) for d in c] for c in kept]

    solid_a, solid_b = solid_trace(frame_cal), solid_trace(grid_cal)
    # Repeat extraction, per sample: the same angle read with the other anchors. Where either
    # reading is missing the sample has no repeat value and takes the largest change found.
    repeat_by_x = {a[0]: abs(frame_cal.y(a[1]) - grid_cal.y(b[1])) for a, b in zip(solid_a, solid_b) if a[1] is not None and b[1] is not None}
    changes = sorted(repeat_by_x.values())
    repeat_solid = changes[-1] if changes else 0.0
    repeat_solid_median = changes[len(changes) // 2] if changes else 0.0
    dots_a, dots_b = dotted_samples(frame_cal), dotted_samples(grid_cal)
    repeat_dot_y = max((abs(p[1] - q[1]) for ca, cb in zip(dots_a, dots_b) for p, q in zip(ca, cb)), default=0.0)
    repeat_dot_x = max((abs(p[0] - q[0]) for ca, cb in zip(dots_a, dots_b) for p, q in zip(ca, cb)), default=0.0)

    db_px, deg_px = frame_cal.db_per_px(), frame_cal.deg_per_px()
    resolution_db = 1.0 * db_px      # half a pixel from resampling plus half a pixel from the scan grid
    resolution_deg = 1.0 * deg_px
    anchor_db, anchor_deg = anchor_px * db_px, anchor_px * deg_px
    budget = {
        "method": "Conservative sum for each sample: image resolution + the larger of half the line width and half the mark's own vertical extent (for the solid line, plus the change of the line over one scan column at each side) + anchor placement + repeat extraction. Rounded up to 0.1 dB. It describes how well the printed line is read, not the uncertainty of the measurement.",
        "image_resolution": {"scan_dpi": 300, "db_per_pixel": round(db_px, 4), "degrees_per_pixel": round(deg_px, 5),
                             "allowance_db": round(resolution_db, 3), "allowance_degrees": round(resolution_deg, 4)},
        "line_width": {"solid_line_px": line_width_px, "dot_height_px": dot_height_px,
                       "allowance_db_solid": round(line_width_px / 2 * db_px, 3), "allowance_db_dot": round(dot_height_px / 2 * db_px, 3)},
        "anchor_placement": {"largest_gridline_offset_px": round(anchor_px, 2), "allowance_db": round(anchor_db, 3), "allowance_degrees": round(anchor_deg, 4)},
        "repeat_extraction": {"alternative_anchors": grid_cal.name, "applied": "per sample for the solid line; the largest change for the dots",
                              "median_change_db_solid": round(repeat_solid_median, 3), "largest_change_db_solid": round(repeat_solid, 3),
                              "largest_change_db_dots": round(repeat_dot_y, 3), "largest_change_degrees_dots": round(repeat_dot_x, 4)},
    }

    # Solid samples and gaps.
    solid_samples, solid_gaps, gap_start = [], [], None
    reasons = {"frame": "next to the frame edge", "absent": "no solid line found at this angle",
               "touched": "grid dots or dots of the dotted line touch the solid line here, so its centre cannot be read",
               "at_frame": "the line meets the frame: the figure does not show values beyond its axis bound"}
    for x, yc, half, status in solid_a:
        if status == "ok":
            if gap_start is not None:
                solid_gaps.append(gap_start)
                gap_start = None
            err = resolution_db + max(line_width_px / 2, half) * db_px + anchor_db + repeat_by_x.get(x, repeat_solid)
            solid_samples.append([round2(x), round1(frame_cal.y(yc)), ceil1(err)])
        else:
            if gap_start is None:
                gap_start = {"from": round2(x), "to": round2(x), "reason": reasons[status]}
            gap_start["to"] = round2(x)
            if gap_start["reason"] != reasons[status]:
                gap_start["reason"] = reasons[status] if status == "at_frame" else gap_start["reason"]
    if gap_start is not None:
        solid_gaps.append(gap_start)

    # Dotted samples: chains are segments; between segments is a gap with its reason.
    dotted_segments, dotted_gaps = [], []
    for k, chain in enumerate(kept):
        seg = []
        for d in chain:
            err = resolution_db + max(dot_height_px / 2, (d["y1"] - d["y0"] + 1) / 2) * db_px + anchor_db + repeat_dot_y
            seg.append([round2(frame_cal.x(d["cx"])), round1(frame_cal.y(d["cy"])), ceil1(err)])
        dotted_segments.append(seg)
        if k + 1 < len(kept):
            a, b = chain[-1], kept[k + 1][0]
            if near_solid(a, b, line_set):
                reason = "the dots touch or cross the solid line here and cannot be separated from it"
            elif min(a["cy"], b["cy"]) < FRAME_BAND + 12 or max(a["cy"], b["cy"]) > height - FRAME_BAND - 12 or max(a["cx"], b["cx"]) > width - FRAME_BAND - 12:
                reason = "the dots run into the frame line"
            else:
                reason = "no separable dots: they coincide with gridline dots or are missing from the scan"
            ends = sorted([round2(frame_cal.x(a["cx"])), round2(frame_cal.x(b["cx"]))])
            dotted_gaps.append({"from": ends[0], "to": ends[1], "reason": reason})

    calibration = {
        "anchors": [
            {"name": "top-left frame corner", "data": [X_BOUNDS[0], Y_BOUNDS[0]], "crop_px": [round2(corners[0][0]), round2(corners[0][1])]},
            {"name": "top-right frame corner", "data": [X_BOUNDS[1], Y_BOUNDS[0]], "crop_px": [round2(corners[1][0]), round2(corners[1][1])]},
            {"name": "bottom-left frame corner", "data": [X_BOUNDS[0], Y_BOUNDS[1]], "crop_px": [round2(corners[2][0]), round2(corners[2][1])]},
            {"name": "bottom-right frame corner", "data": [X_BOUNDS[1], Y_BOUNDS[1]], "crop_px": [round2(corners[3][0]), round2(corners[3][1])]},
        ],
        "mapping": "bilinear between the four frame corners; then linear in angle and in dB",
        "axis_scale": {"x": "linear", "y": "linear"},
        "axis_bounds": {"x_degrees": list(X_BOUNDS), "y_db": list(Y_BOUNDS)},
        "rotation_degrees": round2(math.degrees(math.atan2(corners[1][1] - corners[0][1], corners[1][0] - corners[0][0]))),
        "rectified_raster_px": [width, height],
        "gridline_check": {
            "x": [{"degrees": x, "offset_px": round2(gx[x] - frame_cal.i(x))} for x in X_GRID],
            "y": [{"db": y, "offset_px": round2(gy[y] - (y - Y_BOUNDS[0]) / (Y_BOUNDS[1] - Y_BOUNDS[0]) * height)} for y in Y_GRID],
        },
    }
    excluded = {
        "frame_band_px": FRAME_BAND,
        "grid_dots_removed": len(grid_dots),
        "unconfirmed_marks": [[round2(frame_cal.x(d["cx"])), round1(frame_cal.y(d["cy"]))] for d in sorted(unconfirmed, key=lambda d: d["cx"])],
        "rule": "Marks within the frame band are part of the frame. Small marks within 2.5 raster pixels of a gridline's centre are grid dots; a dot of the dotted line there cannot be told apart from them and is removed too. A small mark that is not chained to at least two other dots is unconfirmed and left out.",
    }
    overlay = {"corners": corners, "width": width, "height": height, "rows": rows, "size": (width0, height0)}
    return {"solid": (solid_samples, solid_gaps), "dotted": (dotted_segments, dotted_gaps), "calibration": calibration,
            "budget": budget, "excluded": excluded, "overlay": overlay}


def overlay_png(path, ov, points_px, colour):
    """The crop in light grey, with each extracted sample marked as a small cross."""
    rows = ov["rows"]
    canvas = [[1 if p else 0 for p in row] for row in rows]
    h, w = len(canvas), len(canvas[0])
    for (x, y) in points_px:
        cx, cy = int(round(x)), int(round(y))
        for d in range(-3, 4):
            for (px, py) in ((cx + d, cy), (cx, cy + d)):
                if 0 <= px < w and 0 <= py < h:
                    canvas[py][px] = colour
    for (x, y) in ov["corners"]:
        cx, cy = int(round(x)), int(round(y))
        for d in range(-8, 9):
            for (px, py) in ((cx + d, cy + d), (cx + d, cy - d)):
                if 0 <= px < w and 0 <= py < h:
                    canvas[py][px] = 4
    write_palette_png(path, canvas, PALETTE)


def to_crop(ov, x, y):
    u = (x - X_BOUNDS[0]) / (X_BOUNDS[1] - X_BOUNDS[0])
    v = (y - Y_BOUNDS[0]) / (Y_BOUNDS[1] - Y_BOUNDS[0])
    return bilinear(ov["corners"], u, v)


def build(write_overlays_to=None):
    manifest = json.loads((HERE / "figures" / "figures.json").read_text(encoding="utf-8"))
    figures = []
    for fig in manifest["figures"]:
        result = extract(fig)
        solid, solid_gaps = result["solid"]
        dotted, dotted_gaps = result["dotted"]
        base = {"figure": fig["figure"], "crop_file": fig["crop_file"], "crop_sha256": fig["crop_sha256"],
                "calibration": result["calibration"], "error_budget": result["budget"], "excluded": result["excluded"]}
        traces = [
            {"role": "reconstructed", "source_style": "solid line", "sampling": f"every {SOLID_STEP} degrees, at the centre of the line's vertical extent",
             "samples": solid, "gaps": solid_gaps, "review_overlay": f"review/{fig['id']}-reconstructed.png"},
            {"role": "original", "source_style": "dotted line", "sampling": "the centre of each printed dot",
             "segments": dotted, "gaps": dotted_gaps, "review_overlay": f"review/{fig['id']}-original.png"},
        ]
        figures.append({"id": fig["id"], **base, "traces": traces})
        if write_overlays_to is not None:
            ov = result["overlay"]
            overlay_png(write_overlays_to / f"{fig['id']}-reconstructed.png", ov, [to_crop(ov, s[0], s[1]) for s in solid], 2)
            overlay_png(write_overlays_to / f"{fig['id']}-original.png", ov, [to_crop(ov, s[0], s[1]) for seg in dotted for s in seg], 3)
    return {"tool": TOOL, "source": manifest["source"], "figures": figures}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--verify", action="store_true", help="check traces.json and the review overlays are fresh")
    args = parser.parse_args()
    if args.verify:
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            data = build(Path(tmp))
            text = json.dumps(data, indent=1, ensure_ascii=False) + "\n"
            stale = [] if (HERE / "traces.json").read_text(encoding="utf-8") == text else ["traces.json"]
            for p in sorted(Path(tmp).iterdir()):
                committed = HERE / "review" / p.name
                if not committed.exists() or committed.read_bytes() != p.read_bytes():
                    stale.append(f"review/{p.name}")
        if stale:
            sys.exit(f"digitize.py: stale: {', '.join(stale)}; run python3 digitize.py")
        print("traces.json and review/ are fresh")
        return
    data = build(HERE / "review")
    (HERE / "traces.json").write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print("wrote traces.json and review/")


if __name__ == "__main__":
    main()
