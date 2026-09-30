# Model format

A model is a mapping. The Markdown export carries it in a fenced ```` ```yaml ````
block and the share link carries the same YAML, base64url-encoded, after `#model=`.

```yaml
sectionlab: 1                # schema version (required)
title: Tee with a bolt hole
E_base: 210000               # MPa; composite properties are transformed to it (default: first material's E)
materials:
- id: s355                   # referenced by parts
  name: Carbon steel S355
  E: 210000                  # MPa
  sigma02: 355               # 0.2% proof stress, MPa
  n: 25                      # Ramberg–Osgood exponent, 1 … 200
  eps_lim: 0.015             # strain limit for the allowable moment
  compression:               # optional; same four fields for ε < 0
    E: 210000
    sigma02: 355
    n: 25
    eps_lim: 0.015
parts:
- id: web                    # unique
  name: web
  shape: rect                # a catalogue id (below)
  dims:
    b: 12
    h: 200
  radii: [0, 0, 0, 0]        # one per corner, mm, 0 = sharp
  x: 0                       # centre of the part's bounding box, mm
  y: 0
  orientation: 0             # 0 or 90 (counter-clockwise about the part's centre)
  material: s355             # null for voids (a void takes its host's material)
  void: false
plastic:
  axis: x                    # x | y | major | minor
  N: 0                       # axial force, N, + tension
  solve: zero-cross          # zero-cross (b, default) | fixed-axis (a)
```

## Catalogue

| id | Dimensions | Corners (radii order) |
| --- | --- | --- |
| `rect` | b, h | bottom left, bottom right, top right, top left |
| `circle` | d | none |
| `semicircle` | d (flat side down) | none |
| `triangle` | b, h, a (apex from the left end of the base; any value) | bottom left, bottom right, apex |
| `trapezoid` | b (bottom), bt (top), h, s (top shift; any value) | bottom left, bottom right, top right, top left |
| `polygon` | n (3–12 sides, flat bottom), d (across corners) | corner 1 … n, counter-clockwise from bottom left |
| `rhs` | b, h, t | outer ×4, then inner ×4, each bottom left → top left |
| `chs` | d, t | none |
| `ishape` | b, h, tf, tw (parallel flanges) | bottom-left outer, bottom-right outer, bottom-right flange tip, bottom-right root, top-right root, top-right flange tip, top-right outer, top-left outer, top-left flange tip, top-left root, bottom-left root, bottom-left flange tip |
| `channel` | b, h, tf, tw (web on the left) | bottom back, bottom toe, bottom flange tip, bottom root, top root, top flange tip, top toe, top back |
| `angle` | b (horizontal leg), h (vertical leg), t | heel, horizontal toe, horizontal toe tip, root, vertical toe tip, vertical toe |
| `tee` | b, h, tf, tw (flange on top) | stem bottom left, stem bottom right, right root, right flange tip, right outer, left outer, left flange tip, left root |
| `zed` | b, h, tf, tw (bottom flange right, top flange left) | bottom back, bottom toe, bottom flange tip, bottom root, top back, top toe, top flange tip, top root |
| `cross` | b, h, tb (horizontal bar), th (vertical bar) | right end bottom, right end top, top-right root, top end right, top end left, top-left root, left end top, left end bottom, bottom-left root, bottom end left, bottom end right, bottom-right root |

## Rules

- Solid parts may touch but not overlap.
- A void must lie wholly inside exactly one solid part; voids must not overlap.
- Radii must fit: on every edge the two fillets' tangent lengths must not exceed the edge.

## YAML subset

Block mappings and sequences, flow sequences of scalars (`[1, 2]`), empty `[]` and
`{}`, comments, and scalars (null, booleans, decimal integers and floats, plain,
single- and double-quoted strings). Anchors, aliases, tags, block scalars, flow
mappings with content, multiple documents, merge keys and number forms YAML 1.1
readers disagree on (octal, hex, sexagesimal, underscores, dates) are refused with
the line number. Plain scalars resolve as PyYAML resolves them.
