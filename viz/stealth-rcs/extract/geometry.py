"""Straight-line detection for scanned plot frames, standard library only.

The scans are slightly rotated (about 0.3 to 0.8 degrees), so a frame edge is found as the
strongest near-horizontal or near-vertical line in a small Hough accumulator, then refined
by a least-squares fit to the black pixels within a few pixels of it.
"""
import math

ANGLES = [round(i * 0.05, 2) for i in range(-30, 31)]  # -1.5 to 1.5 degrees


def black_points(rows, x0=0, y0=0, x1=None, y1=None):
    y1 = len(rows) if y1 is None else y1
    x1 = len(rows[0]) if x1 is None else x1
    return [(x, y) for y in range(y0, y1) for x in range(x0, x1) if rows[y][x]]


def line_votes(points, axis):
    """Votes per (angle, offset): axis 'h' counts y - x*tan(a), axis 'v' counts x - y*tan(a)."""
    votes = {}
    for a in ANGLES:
        t = math.tan(math.radians(a))
        for x, y in points:
            off = round(y - x * t) if axis == "h" else round(x - y * t)
            votes[(a, off)] = votes.get((a, off), 0) + 1
    return votes


def strong_lines(votes, threshold, merge=6):
    """The strongest (offset, angle, votes) of each group of nearby offsets above threshold."""
    best = {}
    for (a, off), v in votes.items():
        if v >= threshold and (off not in best or v > best[off][0]):
            best[off] = (v, a)
    groups = []
    for off in sorted(best):
        if groups and off - groups[-1][-1] <= merge:
            groups[-1].append(off)
        else:
            groups.append([off])
    lines = []
    for group in groups:
        off = max(group, key=lambda k: (best[k][0], -k))
        lines.append((off, best[off][1], best[off][0]))
    return lines


def fit_line(rows, axis, off, angle, span, half=4):
    """Least-squares centre line of the black pixels within +-half of a detected line.

    axis 'h' returns (c, b) for y = c + b*x over x in span; axis 'v' returns (c, b) for
    x = c + b*y over y in span.
    """
    t = math.tan(math.radians(angle))
    us, ws = [], []
    for u in range(*span):
        centre = off + u * t
        for w in range(int(centre) - half, int(centre) + half + 1):
            if axis == "h" and 0 <= w < len(rows) and rows[w][u]:
                us.append(u)
                ws.append(w)
            if axis == "v" and 0 <= w < len(rows[0]) and rows[u][w]:
                us.append(u)
                ws.append(w)
    n = len(us)
    mu, mw = sum(us) / n, sum(ws) / n
    slope = sum((u - mu) * (w - mw) for u, w in zip(us, ws)) / sum((u - mu) ** 2 for u in us)
    return mw - slope * mu, slope


def intersect(h_line, v_line):
    """The point where y = c1 + b1*x meets x = c2 + b2*y."""
    c1, b1 = h_line
    c2, b2 = v_line
    y = (c1 + b1 * c2) / (1 - b1 * b2)
    return c2 + b2 * y, y


def bilinear(corners, u, v):
    """Image point at fractional frame position (u, v): u runs left to right, v top to bottom."""
    (tlx, tly), (trx, try_), (blx, bly), (brx, bry) = corners
    x = (1 - u) * (1 - v) * tlx + u * (1 - v) * trx + (1 - u) * v * blx + u * v * brx
    y = (1 - u) * (1 - v) * tly + u * (1 - v) * try_ + (1 - u) * v * bly + u * v * bry
    return x, y


def find_frame(rows, y_range=None):
    """Corners (tl, tr, bl, br) of the lower plot frame on a page, or of the only frame in a crop.

    A frame edge is a solid line: its votes come close to its length. The lower panel's
    top and bottom are the last two strong horizontal lines; the left and right edges are the
    strongest vertical lines in the left and right thirds, refitted over the panel's rows only.
    """
    height, width = len(rows), len(rows[0])
    points = black_points(rows)
    horizontal = strong_lines(line_votes(points, "h"), threshold=int(0.45 * width))
    if len(horizontal) < 2:
        raise ValueError("fewer than two frame edges found")
    (top_off, top_a, _), (bot_off, bot_a, _) = horizontal[-2], horizontal[-1]
    top = fit_line(rows, "h", top_off, top_a, (0, width))
    bottom = fit_line(rows, "h", bot_off, bot_a, (0, width))
    y0 = int(min(top_off, top[0] + top[1] * width)) + 8
    y1 = int(max(bot_off, bottom[0] + bottom[1] * width)) - 8
    panel_points = black_points(rows, 0, y0, width, y1)
    vertical = strong_lines(line_votes(panel_points, "v"), threshold=int(0.5 * (y1 - y0)))
    lefts = [l for l in vertical if l[0] < width / 3]
    rights = [l for l in vertical if l[0] > 2 * width / 3]
    if not lefts or not rights:
        raise ValueError("no left or right frame edge found")
    l_off, l_a, _ = max(lefts, key=lambda l: (l[2], -l[0]))
    r_off, r_a, _ = max(rights, key=lambda l: (l[2], l[0]))
    left = fit_line(rows, "v", l_off, l_a, (y0, y1))
    right = fit_line(rows, "v", r_off, r_a, (y0, y1))
    return (intersect(top, left), intersect(top, right), intersect(bottom, left), intersect(bottom, right))
