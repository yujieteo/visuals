/* Sectionlab model and elastic section properties.
 *
 * Units: mm, MPa (N/mm²), N, N·mm. A model is
 *   { sectionlab: 1, title, E_base, materials: [...], parts: [...], plastic: {...} }
 * (docs/model-format.md has every field). Parts are solid, or voids that cut a
 * hole in the one solid part that contains them.
 *
 * Composite properties are those of the transformed section: every solid part is
 * weighted by its modular ratio n = E / E_base and every void by −n of its host,
 * so A, S and I are in E_base-equivalent mm², mm³ and mm⁴. All second moments and
 * first moments Q are about axes through the (transformed) centroid.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./geometry.js"), require("./shapes.js"));
  else (root.SectionLab = root.SectionLab || {}).section = factory(root.SectionLab.geometry, root.SectionLab.shapes);
})(typeof self !== "undefined" ? self : this, function (G, S) {
  "use strict";

  const SCHEMA = 1;
  const AXES = ["x", "y", "major", "minor"];
  const SOLVES = ["zero-cross", "fixed-axis"];

  class ModelError extends Error {
    constructor(message, path) {
      super(message);
      this.name = "ModelError";
      this.path = path || null;
    }
  }
  const fail = (message, path) => { throw new ModelError(message, path); };

  const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
  function num(v, label, path, { positive = false, min = -Infinity, max = Infinity } = {}) {
    if (typeof v !== "number" || !Number.isFinite(v)) fail(`${label} must be a number.`, path);
    if (positive && !(v > 0)) fail(`${label} must be greater than 0.`, path);
    if (v < min || v > max) fail(`${label} must be between ${min} and ${max}.`, path);
    return v;
  }
  const str = (v, label, path) => { if (typeof v !== "string" || !v.trim()) fail(`${label} must be a non-empty text value.`, path); return v; };

  function checkLaw(m, label, path, full) {
    const out = {};
    out.E = num(m.E, `${label} E`, `${path}.E`, { positive: true });
    out.sigma02 = num(m.sigma02, `${label} σ0.2`, `${path}.sigma02`, { positive: true });
    out.n = num(m.n, `${label} Ramberg–Osgood n`, `${path}.n`, { min: 1, max: 200 });
    out.eps_lim = num(m.eps_lim, `${label} ε_lim`, `${path}.eps_lim`, { positive: true, max: 1 });
    if (full && m.compression !== undefined && m.compression !== null) {
      if (!isObj(m.compression)) fail(`${label} compression law must be a mapping.`, `${path}.compression`);
      out.compression = checkLaw(m.compression, `${label} compression`, `${path}.compression`, false);
    }
    return out;
  }

  /* Validate a model and return a normalised deep copy. Throws ModelError naming the field. */
  function normalize(input) {
    if (!isObj(input)) fail("A section model is required.");
    if (input.sectionlab !== SCHEMA) fail(`Unsupported schema version ${JSON.stringify(input.sectionlab)}; this page reads sectionlab: ${SCHEMA}.`, "sectionlab");
    const model = { sectionlab: SCHEMA, title: input.title === undefined ? "Section" : String(input.title) };
    if (!Array.isArray(input.materials)) fail("materials must be a list.", "materials");
    const matIds = new Set();
    model.materials = input.materials.map((m, i) => {
      const p = `materials[${i}]`;
      if (!isObj(m)) fail(`Material ${i + 1} must be a mapping.`, p);
      const id = str(m.id, `Material ${i + 1} id`, `${p}.id`);
      if (matIds.has(id)) fail(`Material id "${id}" is used twice.`, `${p}.id`);
      matIds.add(id);
      return { id, name: m.name === undefined ? id : String(m.name), ...checkLaw(m, `Material "${id}"`, p, true) };
    });
    model.E_base = input.E_base === undefined && model.materials.length ? model.materials[0].E : num(input.E_base, "E_base", "E_base", { positive: true });
    if (!Array.isArray(input.parts)) fail("parts must be a list.", "parts");
    const partIds = new Set();
    model.parts = input.parts.map((q, i) => {
      const p = `parts[${i}]`;
      if (!isObj(q)) fail(`Part ${i + 1} must be a mapping.`, p);
      const id = str(q.id, `Part ${i + 1} id`, `${p}.id`);
      if (partIds.has(id)) fail(`Part id "${id}" is used twice.`, `${p}.id`);
      partIds.add(id);
      const shape = str(q.shape, `Part "${id}" shape`, `${p}.shape`);
      if (!S.SHAPES[shape]) fail(`Part "${id}" has unknown shape "${shape}".`, `${p}.shape`);
      let dims;
      try { dims = S.checkDims(shape, q.dims); } catch (e) { fail(`Part "${id}": ${e.message}`, `${p}.dims${e.field ? "." + e.field : ""}`); }
      const names = S.SHAPES[shape].corners(dims);
      let radii = q.radii === undefined ? S.SHAPES[shape].defaultRadii(dims) : q.radii;
      if (!Array.isArray(radii) || radii.length !== names.length) fail(`Part "${id}" needs ${names.length} corner radii (${names.join(", ") || "none"}).`, `${p}.radii`);
      radii = radii.map((r, k) => num(r, `Part "${id}" radius at ${names[k]}`, `${p}.radii[${k}]`, { min: 0 }));
      const orientation = q.orientation === undefined ? 0 : q.orientation;
      if (orientation !== 0 && orientation !== 90) fail(`Part "${id}" orientation must be 0 or 90.`, `${p}.orientation`);
      const isVoid = q.void === undefined ? false : q.void;
      if (typeof isVoid !== "boolean") fail(`Part "${id}" void must be true or false.`, `${p}.void`);
      let material = q.material === undefined || q.material === null ? null : q.material;
      if (!isVoid) {
        if (material === null) fail(`Part "${id}" needs a material.`, `${p}.material`);
        if (!matIds.has(material)) fail(`Part "${id}" uses unknown material "${material}".`, `${p}.material`);
      } else if (material !== null && !matIds.has(material)) fail(`Part "${id}" uses unknown material "${material}".`, `${p}.material`);
      const part = {
        id, name: q.name === undefined ? id : String(q.name), shape, dims, radii,
        x: num(q.x === undefined ? 0 : q.x, `Part "${id}" x`, `${p}.x`), y: num(q.y === undefined ? 0 : q.y, `Part "${id}" y`, `${p}.y`),
        orientation, material, void: isVoid,
      };
      try { S.SHAPES[shape].build(dims, radii); } catch (e) { fail(`Part "${id}": ${e.message}`, `${p}.radii`); }
      return part;
    });
    const pl = input.plastic === undefined ? {} : input.plastic;
    if (!isObj(pl)) fail("plastic must be a mapping.", "plastic");
    model.plastic = {
      axis: pl.axis === undefined ? "x" : pl.axis,
      N: pl.N === undefined ? 0 : num(pl.N, "Axial force N", "plastic.N"),
      solve: pl.solve === undefined ? "zero-cross" : pl.solve,
    };
    if (!AXES.includes(model.plastic.axis)) fail(`plastic.axis must be one of ${AXES.join(", ")}.`, "plastic.axis");
    if (!SOLVES.includes(model.plastic.solve)) fail(`plastic.solve must be one of ${SOLVES.join(", ")}.`, "plastic.solve");
    return model;
  }

  /* Contours of a part in section coordinates. */
  function partContours(part) {
    const local = S.SHAPES[part.shape].build(part.dims, part.radii).contours;
    return G.transformContours(G.quarterTurn(local, part.orientation / 90), 0, part.x, part.y);
  }

  function partCorners(part) {
    const built = S.SHAPES[part.shape].build(part.dims, part.radii);
    const k = part.orientation / 90;
    const turn = (p) => (k === 1 ? [-p[1], p[0]] : p);
    return built.corners.map((c) => ({ name: c.name, vertex: turn(c.vertex).map((v, i) => v + (i ? part.y : part.x)), at: turn(c.at).map((v, i) => v + (i ? part.y : part.x)) }));
  }

  const size = (contours) => { const b = G.bbox(contours); return Math.hypot(b.x1 - b.x0, b.y1 - b.y0); };

  /* Assemble parts: contours, weights and the host of every void. Throws ModelError when solids
     overlap, when a void is not inside exactly one solid, or when voids overlap. */
  function assemble(model) {
    const mats = Object.fromEntries(model.materials.map((m) => [m.id, m]));
    const parts = model.parts.map((p, i) => ({ part: p, index: i, contours: partContours(p) }));
    const solids = parts.filter((q) => !q.part.void), voids = parts.filter((q) => q.part.void);
    if (!solids.length) fail("Add at least one solid part.", "parts");
    const tolOf = (q) => 1e-4 * size(q.contours);
    for (const q of parts) {
      q.poly = G.polyRegion(q.contours, tolOf(q));
      q.area = G.moments(q.contours, { ni: 1, nj: 1 })[0][0];
      q.box = G.bbox(q.contours);
    }
    const touches = (a, b) => !(a.box.x1 <= b.box.x0 || b.box.x1 <= a.box.x0 || a.box.y1 <= b.box.y0 || b.box.y1 <= a.box.y0);
    for (let i = 0; i < solids.length; i++) for (let j = i + 1; j < solids.length; j++) {
      const a = solids[i], b = solids[j];
      if (!touches(a, b)) continue;
      const shared = G.regionIntersectionArea(a.poly, b.poly);
      if (shared > 1e-6 * Math.min(a.area, b.area)) {
        fail(`Parts "${a.part.id}" and "${b.part.id}" overlap by about ${fmt(shared)} mm². Solid parts may touch but not overlap; use a void to cut a hole.`, `parts[${b.index}]`);
      }
    }
    for (const v of voids) {
      const hosts = solids.filter((s) => touches(s, v)).map((s) => ({ s, shared: G.regionIntersectionArea(s.poly, v.poly) })).filter((h) => h.shared > 1e-6 * v.area);
      if (hosts.length !== 1 || hosts[0].shared < v.area * (1 - 1e-3)) {
        fail(`Void "${v.part.id}" must lie entirely inside one solid part${hosts.length > 1 ? `; it overlaps ${hosts.map((h) => `"${h.s.part.id}"`).join(" and ")}` : ""}.`, `parts[${v.index}]`);
      }
      v.host = hosts[0].s;
    }
    for (let i = 0; i < voids.length; i++) for (let j = i + 1; j < voids.length; j++) {
      const a = voids[i], b = voids[j];
      if (touches(a, b) && G.regionIntersectionArea(a.poly, b.poly) > 1e-6 * Math.min(a.area, b.area)) fail(`Voids "${a.part.id}" and "${b.part.id}" overlap.`, `parts[${b.index}]`);
    }
    for (const q of parts) {
      const host = q.part.void ? q.host : q;
      q.material = mats[host.part.material];
      q.n = q.material.E / model.E_base;
      q.weight = q.part.void ? -q.n : q.n;
    }
    return { parts, solids, voids, mats };
  }

  function fmt(x) { return String(+x.toPrecision(4)); }

  /* Elastic properties of the transformed section. */
  function properties(model, assembled = assemble(model)) {
    const { parts, solids } = assembled;
    let A = 0, Sx = 0, Sy = 0;
    for (const q of parts) {
      const m = G.moments(q.contours, { ni: 2, nj: 2 });
      q.m = m;
      A += q.weight * m[0][0]; Sy += q.weight * m[1][0]; Sx += q.weight * m[0][1];
    }
    if (!(A > 0)) fail("The section has no area.", "parts");
    const cx = Sy / A, cy = Sx / A;
    let Ix = 0, Iy = 0, Ixy = 0, Qx = 0, Qy = 0;
    for (const q of parts) {
      q.centred = G.transformContours(q.contours, 0, -cx, -cy);
      const m = G.moments(q.centred, { ni: 3, nj: 3 });
      Ix += q.weight * m[0][2]; Iy += q.weight * m[2][0]; Ixy += q.weight * m[1][1];
      Qx += q.weight * G.moments(q.centred, { lo: 0, ni: 1, nj: 2 })[0][1];
      Qy += q.weight * G.moments(G.toFrame(q.centred, Math.PI / 2), { lo: 0, ni: 1, nj: 2 })[0][1];
    }
    const avg = (Ix + Iy) / 2, dif = (Ix - Iy) / 2, rad = Math.hypot(dif, Ixy);
    const I1 = avg + rad, I2 = avg - rad;
    // Angle from x to the major axis 1, counter-clockwise; exactly 0 when Ixy vanishes and Ix ≥ Iy.
    const scaleI = Math.max(Math.abs(Ix), Math.abs(Iy));
    let theta = Math.abs(Ixy) <= 1e-13 * scaleI ? (Ix >= Iy ? 0 : Math.PI / 2) : 0.5 * Math.atan2(-2 * Ixy, Ix - Iy);
    if (theta > Math.PI / 2) theta -= Math.PI;
    if (theta <= -Math.PI / 2) theta += Math.PI;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const q of solids) { x0 = Math.min(x0, q.box.x0); x1 = Math.max(x1, q.box.x1); y0 = Math.min(y0, q.box.y0); y1 = Math.max(y1, q.box.y1); }
    const Ip = Ix + Iy;
    // Values at rounding-error level of the section's own scale are reported as exactly 0.
    const L = Math.hypot(x1 - x0, y1 - y0);
    const snap = (v, scale) => (Math.abs(v) <= 1e-12 * scale ? 0 : v);
    const cxs = snap(cx, L), cys = snap(cy, L);
    Ixy = snap(Ixy, Ip);
    return {
      E_base: model.E_base,
      A, cx: cxs, cy: cys, Ix, Iy, Ixy, I1, I2, theta, thetaDeg: (theta * 180) / Math.PI,
      Sx_top: Ix / (y1 - cy), Sx_bottom: Ix / (cy - y0), Sy_right: Iy / (x1 - cx), Sy_left: Iy / (cx - x0),
      rx: Math.sqrt(Ix / A), ry: Math.sqrt(Iy / A), r1: Math.sqrt(I1 / A), r2: Math.sqrt(I2 / A),
      Ip, rp: Math.sqrt(Ip / A), Qx, Qy,
      extent: { x0, x1, y0, y1 },
      parts: parts.map((q) => ({ id: q.part.id, void: q.part.void, host: q.part.void ? q.host.part.id : null, material: q.material.id, n: q.n, area: q.area, cx: snap(q.m[1][0] / q.m[0][0], L), cy: snap(q.m[0][1] / q.m[0][0], L) })),
    };
  }

  return { SCHEMA, AXES, SOLVES, ModelError, normalize, partContours, partCorners, assemble, properties };
});
