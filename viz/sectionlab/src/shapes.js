/* Sectionlab shape catalogue.
 *
 * Every entry turns numeric dimensions (mm) and per-corner radii (mm, 0 = sharp)
 * into exact contours in local coordinates whose bounding box is centred on the
 * origin. A part places its shape there, turns it by 0° or 90° and moves it to
 * its (x, y) position. Later catalogue phases add entries here and nothing else
 * in the engine changes; see playbooks/add-shape.md.
 *
 * Entry fields:
 *   label, family ("solid" | "hollow" | …), phase
 *   dims: [{ key, label, default, integer?, min? }]
 *   corners(d): corner names in the order of the radii array
 *   defaultRadii(d): radii for a fresh part
 *   build(d, radii) → { contours, corners: [{ name, vertex, at }] } (throws RangeError on bad input)
 *   locked: true when resizing must keep the aspect ratio
 *   resize(d, sx, sy) → dims scaled to a new bounding box
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./geometry.js"));
  else (root.SectionLab = root.SectionLab || {}).shapes = factory(root.SectionLab.geometry);
})(typeof self !== "undefined" ? self : this, function (G) {
  "use strict";

  const TAU = 2 * Math.PI;
  const RECT_CORNERS = ["bottom left", "bottom right", "top right", "top left"];

  const need = (cond, message) => { if (!cond) throw new RangeError(message); };
  /* Resize a shape given by width b and depth h to a new bounding box. */
  const scaleBH = (d, sx, sy) => ({ ...d, b: d.b * sx, h: d.h * sy });

  /* Centre the bounding box of vertex lists on the origin. */
  function centreVerts(lists) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const l of lists) for (const [x, y] of l) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    return lists.map((l) => l.map(([x, y]) => [x - cx, y - cy]));
  }

  function polygonShape(verts, radii, names, label = "Corner") {
    const { contour, corners } = G.filletedPolygon(verts, radii, label);
    return { contours: [contour], corners: corners.map((c, i) => ({ name: names[i], ...c })) };
  }

  const scaleAll = (d, s, keys) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, keys.includes(k) ? v * s : v]));

  const SHAPES = {
    rect: {
      label: "Rectangle", family: "solid", phase: 1,
      dims: [{ key: "b", label: "Width b", default: 100 }, { key: "h", label: "Height h", default: 200 }],
      corners: () => RECT_CORNERS,
      defaultRadii: () => [0, 0, 0, 0],
      build(d, r) {
        const b = d.b / 2, h = d.h / 2;
        return polygonShape([[-b, -h], [b, -h], [b, h], [-b, h]], r, RECT_CORNERS);
      },
      resize: scaleBH,
    },
    circle: {
      label: "Circle", family: "solid", phase: 1, locked: true,
      dims: [{ key: "d", label: "Diameter d", default: 100 }],
      corners: () => [],
      defaultRadii: () => [],
      build: (d) => ({ contours: [G.circle([0, 0], d.d / 2)], corners: [] }),
      resize: (d, sx) => ({ ...d, d: d.d * sx }),
    },
    semicircle: {
      label: "Semicircle", family: "solid", phase: 1, locked: true,
      dims: [{ key: "d", label: "Diameter d", default: 100 }],
      corners: () => [],
      defaultRadii: () => [],
      build(d) {
        const r = d.d / 2, c = [0, -r / 2];
        return { contours: [[G.line([-r, c[1]], [r, c[1]]), G.arc(c, r, 0, Math.PI)]], corners: [] };
      },
      resize: (d, sx) => ({ ...d, d: d.d * sx }),
    },
    triangle: {
      label: "Triangle", family: "solid", phase: 1,
      dims: [{ key: "b", label: "Base b", default: 120 }, { key: "h", label: "Height h", default: 100 },
        { key: "a", label: "Apex from left a", default: 60, min: -Infinity }],
      corners: () => ["bottom left", "bottom right", "apex"],
      defaultRadii: () => [0, 0, 0],
      build(d, r) {
        const [v] = centreVerts([[[0, 0], [d.b, 0], [d.a, d.h]]]);
        return polygonShape(v, r, this.corners());
      },
      resize: (d, sx, sy) => ({ ...d, b: d.b * sx, a: d.a * sx, h: d.h * sy }),
    },
    trapezoid: {
      label: "Trapezoid", family: "solid", phase: 1,
      dims: [{ key: "b", label: "Bottom width b", default: 160 }, { key: "bt", label: "Top width bt", default: 80 },
        { key: "h", label: "Height h", default: 100 }, { key: "s", label: "Top shift s", default: 0, min: -Infinity }],
      corners: () => RECT_CORNERS,
      defaultRadii: () => [0, 0, 0, 0],
      build(d, r) {
        const [v] = centreVerts([[[-d.b / 2, 0], [d.b / 2, 0], [d.s + d.bt / 2, d.h], [d.s - d.bt / 2, d.h]]]);
        return polygonShape(v, r, RECT_CORNERS);
      },
      resize: (d, sx, sy) => ({ ...d, b: d.b * sx, bt: d.bt * sx, s: d.s * sx, h: d.h * sy }),
    },
    polygon: {
      label: "Regular polygon", family: "solid", phase: 1, locked: true,
      dims: [{ key: "n", label: "Sides n", default: 6, integer: true, min: 3, max: 12 }, { key: "d", label: "Across corners d", default: 100 }],
      corners: (d) => Array.from({ length: d.n }, (_, i) => `corner ${i + 1}`),
      defaultRadii: (d) => new Array(d.n).fill(0),
      build(d, r) {
        const R = d.d / 2;
        const raw = Array.from({ length: d.n }, (_, k) => {
          const t = -Math.PI / 2 - Math.PI / d.n + (TAU * k) / d.n;
          return [R * Math.cos(t), R * Math.sin(t)];
        });
        const [v] = centreVerts([raw]);
        return polygonShape(v, r, this.corners(d));
      },
      resize: (d, sx) => ({ ...d, d: d.d * sx }),
    },
    rhs: {
      label: "Rectangular hollow", family: "hollow", phase: 1,
      dims: [{ key: "b", label: "Width b", default: 100 }, { key: "h", label: "Height h", default: 200 },
        { key: "t", label: "Wall t", default: 8 }],
      corners: () => [...RECT_CORNERS.map((n) => `outer ${n}`), ...RECT_CORNERS.map((n) => `inner ${n}`)],
      defaultRadii: (d) => [...new Array(4).fill(2 * d.t), ...new Array(4).fill(d.t)],
      build(d, r) {
        need(2 * d.t < Math.min(d.b, d.h), "Wall t must be less than half of both b and h.");
        const b = d.b / 2, h = d.h / 2, bi = b - d.t, hi = h - d.t;
        const names = this.corners();
        const outer = polygonShape([[-b, -h], [b, -h], [b, h], [-b, h]], r.slice(0, 4), names.slice(0, 4), "Outer corner");
        const inner = polygonShape([[-bi, -hi], [bi, -hi], [bi, hi], [-bi, hi]], r.slice(4, 8), names.slice(4, 8), "Inner corner");
        return { contours: [outer.contours[0], G.reverseContour(inner.contours[0])], corners: [...outer.corners, ...inner.corners] };
      },
      resize: scaleBH,
    },
    chs: {
      label: "Circular hollow", family: "hollow", phase: 1, locked: true,
      dims: [{ key: "d", label: "Outside diameter d", default: 150 }, { key: "t", label: "Wall t", default: 8 }],
      corners: () => [],
      defaultRadii: () => [],
      build(d) {
        need(2 * d.t < d.d, "Wall t must be less than half the diameter.");
        return { contours: [G.circle([0, 0], d.d / 2), G.circle([0, 0], d.d / 2 - d.t, false)], corners: [] };
      },
      resize: (d, sx) => ({ ...d, d: d.d * sx }),
    },

    /* ---------- phase 2: rolled and built-up shapes (parallel flanges; root fillets are concave corners) ---------- */
    ishape: {
      label: "I / H section", family: "rolled", phase: 2,
      dims: [{ key: "b", label: "Flange width b", default: 150 }, { key: "h", label: "Depth h", default: 300 },
        { key: "tf", label: "Flange tf", default: 10.7 }, { key: "tw", label: "Web tw", default: 7.1 }],
      corners: () => ["bottom-left outer", "bottom-right outer", "bottom-right flange tip", "bottom-right root", "top-right root", "top-right flange tip",
        "top-right outer", "top-left outer", "top-left flange tip", "top-left root", "bottom-left root", "bottom-left flange tip"],
      defaultRadii: () => [0, 0, 0, 15, 15, 0, 0, 0, 0, 15, 15, 0],
      build(d, r) {
        need(d.tw < d.b, "Web tw must be less than the flange width b.");
        need(2 * d.tf < d.h, "Flanges 2 tf must be less than the depth h.");
        const b = d.b / 2, h = d.h / 2, w = d.tw / 2, f = h - d.tf;
        return polygonShape([[-b, -h], [b, -h], [b, -f], [w, -f], [w, f], [b, f], [b, h], [-b, h], [-b, f], [-w, f], [-w, -f], [-b, -f]], r, this.corners());
      },
      resize: scaleBH,
    },
    channel: {
      label: "Channel", family: "rolled", phase: 2,
      dims: [{ key: "b", label: "Flange width b", default: 100 }, { key: "h", label: "Depth h", default: 300 },
        { key: "tf", label: "Flange tf", default: 15 }, { key: "tw", label: "Web tw", default: 9 }],
      corners: () => ["bottom back", "bottom toe", "bottom flange tip", "bottom root", "top root", "top flange tip", "top toe", "top back"],
      defaultRadii: () => [0, 0, 0, 15, 15, 0, 0, 0],
      build(d, r) {
        need(d.tw < d.b, "Web tw must be less than the flange width b.");
        need(2 * d.tf < d.h, "Flanges 2 tf must be less than the depth h.");
        const [v] = centreVerts([[[0, 0], [d.b, 0], [d.b, d.tf], [d.tw, d.tf], [d.tw, d.h - d.tf], [d.b, d.h - d.tf], [d.b, d.h], [0, d.h]]]);
        return polygonShape(v, r, this.corners());
      },
      resize: scaleBH,
    },
    angle: {
      label: "Angle", family: "rolled", phase: 2,
      dims: [{ key: "b", label: "Horizontal leg b", default: 100 }, { key: "h", label: "Vertical leg h", default: 100 }, { key: "t", label: "Thickness t", default: 10 }],
      corners: () => ["heel", "horizontal toe", "horizontal toe tip", "root", "vertical toe tip", "vertical toe"],
      defaultRadii: () => [0, 0, 6, 12, 6, 0],
      build(d, r) {
        need(d.t < d.b && d.t < d.h, "Thickness t must be less than both legs.");
        const [v] = centreVerts([[[0, 0], [d.b, 0], [d.b, d.t], [d.t, d.t], [d.t, d.h], [0, d.h]]]);
        return polygonShape(v, r, this.corners());
      },
      resize: scaleBH,
    },
    tee: {
      label: "Tee", family: "rolled", phase: 2,
      dims: [{ key: "b", label: "Flange width b", default: 150 }, { key: "h", label: "Depth h", default: 150 },
        { key: "tf", label: "Flange tf", default: 12 }, { key: "tw", label: "Stem tw", default: 8 }],
      corners: () => ["stem bottom left", "stem bottom right", "right root", "right flange tip", "right outer", "left outer", "left flange tip", "left root"],
      defaultRadii: () => [0, 0, 12, 0, 0, 0, 0, 12],
      build(d, r) {
        need(d.tw < d.b, "Stem tw must be less than the flange width b.");
        need(d.tf < d.h, "Flange tf must be less than the depth h.");
        const [v] = centreVerts([[[-d.tw / 2, 0], [d.tw / 2, 0], [d.tw / 2, d.h - d.tf], [d.b / 2, d.h - d.tf], [d.b / 2, d.h], [-d.b / 2, d.h], [-d.b / 2, d.h - d.tf], [-d.tw / 2, d.h - d.tf]]]);
        return polygonShape(v, r, this.corners());
      },
      resize: scaleBH,
    },
    zed: {
      label: "Z section", family: "rolled", phase: 2,
      dims: [{ key: "b", label: "Flange width b", default: 80 }, { key: "h", label: "Depth h", default: 200 },
        { key: "tf", label: "Flange tf", default: 10 }, { key: "tw", label: "Web tw", default: 8 }],
      corners: () => ["bottom back", "bottom toe", "bottom flange tip", "bottom root", "top back", "top toe", "top flange tip", "top root"],
      defaultRadii: () => [0, 0, 0, 10, 0, 0, 0, 10],
      build(d, r) {
        need(d.tw < d.b, "Web tw must be less than the flange width b.");
        need(2 * d.tf < d.h, "Flanges 2 tf must be less than the depth h.");
        // Bottom flange runs right from the web, top flange left.
        const x = d.tw - d.b;
        const [v] = centreVerts([[[0, 0], [d.b, 0], [d.b, d.tf], [d.tw, d.tf], [d.tw, d.h], [x, d.h], [x, d.h - d.tf], [0, d.h - d.tf]]]);
        return polygonShape(v, r, this.corners());
      },
      resize: (d, sx, sy) => ({ ...d, b: (sx * (2 * d.b - d.tw) + d.tw) / 2, h: d.h * sy }),
    },
    cross: {
      label: "Cross", family: "built-up", phase: 2,
      dims: [{ key: "b", label: "Width b", default: 200 }, { key: "h", label: "Height h", default: 200 },
        { key: "tb", label: "Horizontal bar tb", default: 20 }, { key: "th", label: "Vertical bar th", default: 20 }],
      corners: () => ["right end bottom", "right end top", "top-right root", "top end right", "top end left", "top-left root",
        "left end top", "left end bottom", "bottom-left root", "bottom end left", "bottom end right", "bottom-right root"],
      defaultRadii: () => new Array(12).fill(0),
      build(d, r) {
        need(d.th < d.b, "Vertical bar th must be less than the width b.");
        need(d.tb < d.h, "Horizontal bar tb must be less than the height h.");
        const b = d.b / 2, h = d.h / 2, p = d.tb / 2, q = d.th / 2;
        return polygonShape([[b, -p], [b, p], [q, p], [q, h], [-q, h], [-q, p], [-b, p], [-b, -p], [-q, -p], [-q, -h], [q, -h], [q, -p]], r, this.corners());
      },
      resize: scaleBH,
    },

    /* ---------- phase 3: cold-formed thin-walled shapes (outer dimensions, wall t, inside bend radius ri) ---------- */
    cfangle: {
      label: "Cold-formed angle", family: "cold-formed", phase: 3,
      dims: [{ key: "b", label: "Horizontal leg b", default: 80 }, { key: "h", label: "Vertical leg h", default: 80 },
        { key: "t", label: "Wall t", default: 3 }, { key: "ri", label: "Inside bend radius ri", default: 3, min: 0 }],
      corners: () => [],
      defaultRadii: () => [],
      build(d) {
        const { b, h, t, ri } = d;
        const R = ri + t;
        need(b > t && h > t, "Wall t must be less than both legs.");
        return coldFormed([[0, 0, R], [b, 0, 0], [b, t, 0], [t, t, ri], [t, h, 0], [0, h, 0]]);
      },
      resize: scaleBH,
    },
    cfchannel: {
      label: "Cold-formed channel", family: "cold-formed", phase: 3,
      dims: [{ key: "h", label: "Depth h", default: 200 }, { key: "b", label: "Flange width b", default: 75 },
        { key: "c", label: "Lip c (0 = plain)", default: 20, min: 0 }, { key: "t", label: "Wall t", default: 2 },
        { key: "ri", label: "Inside bend radius ri", default: 3, min: 0 }],
      corners: () => [],
      defaultRadii: () => [],
      build(d) {
        const { h, b, c, t, ri } = d;
        const R = ri + t;
        need(2 * t < h && t < b, "Wall t must be less than the flange width and half the depth.");
        need(c === 0 || (c > t && 2 * c < h), "Lip c must be 0 (plain) or more than t and less than half the depth.");
        // Web on the left, flanges to the right, lips turned inwards.
        const pts = c > 0
          ? [[b, c, 0], [b, 0, R], [0, 0, R], [0, h, R], [b, h, R], [b, h - c, 0], [b - t, h - c, 0], [b - t, h - t, ri], [t, h - t, ri], [t, t, ri], [b - t, t, ri], [b - t, c, 0]]
          : [[b, 0, 0], [0, 0, R], [0, h, R], [b, h, 0], [b, h - t, 0], [t, h - t, ri], [t, t, ri], [b, t, 0]];
        return coldFormed(pts);
      },
      resize: scaleBH,
    },
    cfzed: {
      label: "Cold-formed Z", family: "cold-formed", phase: 3,
      dims: [{ key: "h", label: "Depth h", default: 200 }, { key: "b", label: "Flange width b", default: 70 },
        { key: "c", label: "Lip c (0 = plain)", default: 20, min: 0 }, { key: "t", label: "Wall t", default: 2 },
        { key: "ri", label: "Inside bend radius ri", default: 3, min: 0 }],
      corners: () => [],
      defaultRadii: () => [],
      build(d) {
        const { h, b, c, t, ri } = d;
        const R = ri + t;
        need(2 * t < h && t < b, "Wall t must be less than the flange width and half the depth.");
        need(c === 0 || (c > t && 2 * c < h), "Lip c must be 0 (plain) or more than t and less than half the depth.");
        // Web from x = 0 to t; the bottom flange runs right, the top flange left; lips turn towards the web's mid-height.
        const L = t - b; // outer face of the top flange's free end
        const pts = c > 0
          ? [[b, c, 0], [b, 0, R], [0, 0, R], [0, h - t, ri], [L + t, h - t, ri], [L + t, h - c, 0], [L, h - c, 0], [L, h, R], [t, h, R], [t, t, ri], [b - t, t, ri], [b - t, c, 0]]
          : [[b, 0, 0], [0, 0, R], [0, h - t, ri], [L, h - t, 0], [L, h, 0], [t, h, R], [t, t, ri], [b, t, 0]];
        return coldFormed(pts);
      },
      resize: (d, sx, sy) => ({ ...d, b: (sx * (2 * d.b - d.t) + d.t) / 2, h: d.h * sy }),
    },
    cfhat: {
      label: "Cold-formed top hat", family: "cold-formed", phase: 3,
      dims: [{ key: "h", label: "Height h", default: 60 }, { key: "b", label: "Crown width b", default: 60 },
        { key: "f", label: "Flange overhang f", default: 25 }, { key: "t", label: "Wall t", default: 1.5 },
        { key: "ri", label: "Inside bend radius ri", default: 2, min: 0 }],
      corners: () => [],
      defaultRadii: () => [],
      build(d) {
        const { h, b, f, t, ri } = d;
        const R = ri + t;
        need(2 * t < b && t < h, "Wall t must be less than the height and half the crown width.");
        need(f > t, "Flange overhang f must be more than t.");
        // Crown on top from x = 0 to b; webs down to flanges that run outwards by f beyond the crown.
        return coldFormed([[-f, 0, 0], [t, 0, R], [t, h - t, ri], [b - t, h - t, ri], [b - t, 0, R], [b + f, 0, 0], [b + f, t, 0],
          [b, t, ri], [b, h, R], [0, h, R], [0, t, ri], [-f, t, 0]]);
      },
      resize: (d, sx, sy) => ({ ...d, b: d.b * sx, f: d.f * sx, h: d.h * sy }),
    },
  };

  /* A uniform-thickness cold-formed strip from its outline [x, y, radius] (either orientation):
     each bend has an outside radius ri + t and an inside radius ri about the same centre. */
  function coldFormed(pts) {
    let v = pts.map(([x, y]) => [x, y]), r = pts.map((p) => p[2]);
    if (G.signedArea(v) < 0) { v = v.reverse(); r = r.reverse(); }
    [v] = centreVerts([v]);
    const { contour } = G.filletedPolygon(v, r, "Bend");
    return { contours: [contour], corners: [] };
  }

  /* Default dims for a shape. */
  const defaults = (id) => Object.fromEntries(SHAPES[id].dims.map((f) => [f.key, f.default]));

  /* Check dims against the entry's field rules; returns a clean copy or throws RangeError naming the field. */
  function checkDims(id, dims) {
    const shape = SHAPES[id];
    if (!shape) throw new RangeError(`Unknown shape "${id}".`);
    const out = {};
    for (const f of shape.dims) {
      const v = dims ? dims[f.key] : undefined;
      if (typeof v !== "number" || !Number.isFinite(v)) throw Object.assign(new RangeError(`${f.label} must be a number.`), { field: f.key });
      const min = f.min === undefined ? 0 : f.min;
      if (f.min === undefined ? !(v > 0) : v < min) throw Object.assign(new RangeError(`${f.label} must be ${f.min === undefined ? "greater than 0" : `at least ${min}`}.`), { field: f.key });
      if (f.max !== undefined && v > f.max) throw Object.assign(new RangeError(`${f.label} must be at most ${f.max}.`), { field: f.key });
      if (f.integer && !Number.isInteger(v)) throw Object.assign(new RangeError(`${f.label} must be a whole number.`), { field: f.key });
      out[f.key] = v;
    }
    return out;
  }

  return { SHAPES, RECT_CORNERS, defaults, checkDims, scaleAll };
});
