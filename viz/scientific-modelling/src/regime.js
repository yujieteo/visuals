/* Scientific Modelling: the Regime Map Builder (spec section 9), version 1. It reads the record's declared model
 * (src/declare.js), checks the Nondimensionalizer's dimensionless equations against it, and then draws a 1D diagram
 * or a 2D slice of the declared parameter space: the researcher chooses the axes, linear or logarithmic scales and the
 * fixed parameters. A family module (src/conduction.js; piece 4 adds its own to IMPLS) evaluates one point at a time.
 * This engine samples the grid, finds each boundary between two resolved points only (never across an unresolved
 * point), builds the regions of each layer, the points where no approximation meets the tolerance, the unresolved
 * points with their reasons, the intersections of boundaries, the limit paths, and the inspection of a point or a
 * boundary with its dimensional reconstruction.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./rational.js"), require("./expr.js"), require("./sym.js"), require("./special.js"), require("./declare.js"), [require("./conduction.js")]);
  else (root.SM = root.SM || {}).RM = factory(root.SM.Q, root.SM.E, root.SM.S, root.SM.SF, root.SM.D, [root.SM.CD]);
})(typeof self !== "undefined" ? self : this, function (Q, E, S, SF, D, IMPLS) {
  "use strict";

  const GRID = { nx: 41, ny: 31, n1: 161 };
  const TOLERANCES = { "1e-1": 0.1, "1e-2": 0.01, "1e-3": 0.001 };
  /** The five boundary types of spec section 9, with the criterion each needs. */
  const BOUNDARIES = [
    { id: "balance-crossover", name: "Balance crossover", criterion: "Stated comparison of terms or mechanisms", piece: 3 },
    { id: "approximation", name: "Approximation boundary", criterion: "Stated error measure and tolerance", piece: 3 },
    { id: "stability", name: "Stability boundary", criterion: "Stated stability test and neutral condition", piece: 4 },
    { id: "bifurcation", name: "Bifurcation boundary", criterion: "Stated branch condition and classification evidence", piece: 4 },
    { id: "empirical", name: "Empirical boundary", criterion: "Cited correlation, measured data and validity range", piece: 7 },
  ];
  const LAYER_KINDS = [
    { id: "balance", name: "Balances", piece: 3 },
    { id: "approximation", name: "Approximation error", piece: 3 },
    { id: "stability", name: "Stability", piece: 4 },
    { id: "bifurcation", name: "Bifurcations", piece: 4 },
  ];
  const num = (x) => (Number.isFinite(x) ? Number(x.toPrecision(10)) : null);
  /** Is v in a region [lo, hi)? A region marked closed also holds its upper end: an error equal to the tolerance meets it. */
  const inRegion = (r, v) => v >= (r.lo ?? 0) && (r.hi === null || r.hi === undefined || v < r.hi || (r.closed && v === r.hi));
  const WORD = /[A-Za-z][A-Za-z0-9_]*/g;

  /** The implementation of a declaration in the first family module that has it. */
  function implement(decl, options = {}) {
    for (const M of IMPLS) { const impl = M.implement(decl, options); if (impl) return impl; }
    return null;
  }

  /* ---------- the view state of the map ---------- */

  /** "Bi=0.5, Fo=0.25" -> { Bi: 0.5, Fo: 0.25 }; unreadable entries are reported. */
  function parseFixed(text) {
    const out = {}, bad = [];
    for (const part of String(text ?? "").split(/[,;]/).map((s) => s.trim()).filter(Boolean)) {
      const m = /^([A-Za-z][A-Za-z0-9_]*)\s*=\s*(.+)$/.exec(part);
      const v = m ? Q.parse(m[2]) : null;
      if (!m || !v) bad.push(part);
      else out[m[1]] = Q.toNumber(v);
    }
    return { values: out, bad };
  }
  const isLog = (param, choice) => (choice === "log" ? param.min > 0 : choice === "linear" ? false : Boolean(param.log && param.min > 0));
  const toU = (x, log) => (log ? Math.log10(x) : x);
  const fromU = (u, log) => (log ? 10 ** u : u);
  function axisValues(param, log, n) {
    const a = toU(param.min, log), b = toU(param.max, log);
    return Array.from({ length: n }, (_, i) => fromU(a + ((b - a) * i) / (n - 1), log));
  }

  /* ---------- the grid, cached by its inputs ---------- */

  const cache = new Map();
  function sample(impl, key, points) {
    if (cache.has(key)) return cache.get(key);
    const out = points.map((p) => { const r = impl.evaluate(p); return r.ok ? { ok: true, values: r.values } : { ok: false, reason: r.reason }; });
    if (cache.size > 40) cache.clear();
    cache.set(key, out);
    return out;
  }

  /** f = g(measure) − g(threshold), with g = log10 for a logarithmic measure. */
  const signed = (layer, value, threshold) => (layer.scale === "log" ? Math.log10(Math.max(value, 1e-300)) - Math.log10(threshold) : value - threshold);

  /**
   * Marching squares on a grid of signed values (null = unresolved). Cells with an unresolved corner draw nothing.
   * Returns polylines in plot coordinates (u, v), with each crossing on its edge by linear interpolation between the
   * two resolved corners.
   */
  function contour(f, us, vs) {
    const nx = us.length, ny = vs.length;
    const at = (ix, iy) => f[iy * nx + ix];
    const point = new Map(); // edge id -> [u, v]
    const edgeX = (ix, iy) => { // the edge from (ix, iy) to (ix + 1, iy)
      const id = `h${ix},${iy}`;
      if (!point.has(id)) { const a = at(ix, iy), b = at(ix + 1, iy); const t = a / (a - b); point.set(id, [us[ix] + t * (us[ix + 1] - us[ix]), vs[iy]]); }
      return id;
    };
    const edgeY = (ix, iy) => { // the edge from (ix, iy) to (ix, iy + 1)
      const id = `v${ix},${iy}`;
      if (!point.has(id)) { const a = at(ix, iy), b = at(ix, iy + 1); const t = a / (a - b); point.set(id, [us[ix], vs[iy] + t * (vs[iy + 1] - vs[iy])]); }
      return id;
    };
    const segs = [];
    for (let iy = 0; iy < ny - 1; iy++) for (let ix = 0; ix < nx - 1; ix++) {
      const a = at(ix, iy), b = at(ix + 1, iy), c = at(ix + 1, iy + 1), d = at(ix, iy + 1);
      if (a === null || b === null || c === null || d === null) continue;
      const s = (x) => (x >= 0 ? 1 : 0);
      const code = s(a) | (s(b) << 1) | (s(c) << 2) | (s(d) << 3);
      if (code === 0 || code === 15) continue;
      const B = () => edgeX(ix, iy), R = () => edgeY(ix + 1, iy), T = () => edgeX(ix, iy + 1), L = () => edgeY(ix, iy);
      const centre = (a + b + c + d) / 4 >= 0;
      switch (code) {
        case 1: case 14: segs.push([L(), B()]); break;
        case 2: case 13: segs.push([B(), R()]); break;
        case 3: case 12: segs.push([L(), R()]); break;
        case 4: case 11: segs.push([R(), T()]); break;
        case 6: case 9: segs.push([B(), T()]); break;
        case 7: case 8: segs.push([L(), T()]); break;
        case 5: if (centre) segs.push([L(), T()], [B(), R()]); else segs.push([L(), B()], [R(), T()]); break;
        case 10: if (centre) segs.push([L(), B()], [R(), T()]); else segs.push([L(), T()], [B(), R()]); break;
        default: break;
      }
    }
    // Join the segments into polylines through their shared edges.
    const ends = new Map();
    for (const [i, [a, b]] of segs.entries()) for (const e of [a, b]) { if (!ends.has(e)) ends.set(e, []); ends.get(e).push(i); }
    const used = new Set(), lines = [];
    for (let i = 0; i < segs.length; i++) {
      if (used.has(i)) continue;
      used.add(i);
      const line = [segs[i][0], segs[i][1]];
      for (const dir of [1, -1]) {
        for (;;) {
          const tip = dir === 1 ? line[line.length - 1] : line[0];
          const next = (ends.get(tip) ?? []).find((k) => !used.has(k));
          if (next === undefined) break;
          used.add(next);
          const other = segs[next][0] === tip ? segs[next][1] : segs[next][0];
          if (dir === 1) line.push(other); else line.unshift(other);
        }
      }
      lines.push(line.map((e) => /** @type {number[]} */ (point.get(e))));
    }
    return lines;
  }

  /** The intersections of two polylines in plot coordinates. */
  function crossings(a, b) {
    const out = [];
    for (let i = 0; i + 1 < a.length; i++) for (let k = 0; k + 1 < b.length; k++) {
      const [x1, y1] = a[i], [x2, y2] = a[i + 1], [x3, y3] = b[k], [x4, y4] = b[k + 1];
      const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
      if (Math.abs(den) < 1e-15) continue;
      const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
      const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) out.push([x1 + t * (x2 - x1), y1 + t * (y2 - y1)]);
    }
    return out;
  }

  /* ---------- derive ---------- */

  /**
   * The regime map of the confirmed record. ctx: { interp, nd, base (the confirmed inputs), data }. Returns plain data:
   * { ready: false, reason, message, next, problems } or the map with its layers, regions, boundaries, unresolved
   * points, limit paths, intersections and the inspection of the selected point or boundary.
   */
  function derive(state, data, ctx) {
    const { interp, nd, base } = ctx;
    const calc = interp.calcs.find((c) => c.id === "regime-map");
    const declId = base.purpose?.declaration ?? "";
    const declList = D.declarations(data).map((d) => ({ id: d.id, title: d.title }));
    if (!declId) return { ready: false, reason: "no-declaration", declarations: declList, message: "The record names no declared model, so the map has no declared equations, solutions or criteria.", next: "Choose a declared model in the purpose of the record (Edit the model), or load a standard example such as the transient slab." };
    const decl = D.find(data, declId);
    if (!decl) return { ready: false, reason: "unknown-declaration", declarations: declList, message: `The declared model "${String(declId).slice(0, 60)}" is not in the catalogue.`, next: "Choose a declared model of the catalogue." };
    if (calc && !calc.ready) return { ready: false, reason: "blocked", declaration: summaryOf(decl), blockedBy: calc.blockedBy, message: "A failed check blocks the regime map.", next: interp.issues.find((i) => calc.blockedBy.includes(i.id))?.next ?? "" };
    const m = D.match(decl, interp, nd);
    if (!m.ok) return { ready: false, reason: "mismatch", declaration: summaryOf(decl), problems: m.problems, message: "The record's dimensionless model does not equal the declared model.", next: m.next };
    const tipCond = m.conditions.find((c) => c.of === "tip");
    const options = { shape: base.geometry?.shape ?? "sphere", tip: tipCond && tipCond.alternative > 0 ? "convective" : "insulated" };
    const impl = implement(decl, options);
    if (!impl) return { ready: false, reason: "no-solver", declaration: summaryOf(decl), message: `Piece ${decl.piece} of the build plan adds the solver of ${decl.title}.`, next: "Use the Finder and the Nondimensionalizer now." };

    const notices = [];
    const params = impl.params;
    const byId = Object.fromEntries(params.map((p) => [p.id, p]));
    const point0 = D.point(decl, m, interp, nd);
    const recordPoint = {};
    for (const p of params) {
      const v = point0[p.id]?.value;
      recordPoint[p.id] = Number.isFinite(v) ? v : p.log ? Math.sqrt(p.min * p.max) : (p.min + p.max) / 2;
    }
    for (const [k, v] of Object.entries(m.sets ?? {})) recordPoint[k] = v;
    const outside = params.filter((p) => point0[p.id] && (point0[p.id].value < p.min || point0[p.id].value > p.max));
    if (outside.length) notices.push(`The record's ${outside.map((p) => `${p.id} = ${num(point0[p.id].value)}`).join(", ")} ${outside.length > 1 ? "are" : "is"} outside the declared domain, so the map does not show the record's point.`);

    /* ---------- axes, scales and fixed values ---------- */
    const axisParams = params.filter((p) => p.kind !== "choice");
    let x = byId[state.map_x] && byId[state.map_x].kind !== "choice" ? state.map_x : impl.axes.x;
    if (state.map_x && x !== state.map_x) notices.push(`"${String(state.map_x).slice(0, 30)}" is not a parameter of this model; the x-axis shows ${x}.`);
    let y;
    if (state.map_y === "none") y = null;
    else if (!state.map_y) y = impl.axes.y;
    else if (byId[state.map_y] && byId[state.map_y].kind !== "choice" && state.map_y !== x) y = state.map_y;
    else { y = impl.axes.y; notices.push(`"${String(state.map_y).slice(0, 30)}" cannot be the y-axis here; the map shows ${y ?? "a 1D diagram"}.`); }
    if (y === x) y = axisParams.find((p) => p.id !== x)?.id ?? null;
    const xLog = isLog(byId[x], state.x_scale), yLog = y ? isLog(byId[y], state.y_scale) : false;
    if (state.x_scale === "log" && !xLog) notices.push(`${x} can be 0 or negative in its domain, so its axis stays linear.`);
    const fixedIn = parseFixed(state.fixed);
    if (fixedIn.bad.length) notices.push(`The fixed values ${fixedIn.bad.join(", ")} cannot be read: write them as Bi=0.5, Fo=0.25.`);
    const fixed = {};
    const fixedList = [];
    for (const p of params) {
      if (p.id === x || p.id === y) continue;
      let v = recordPoint[p.id], source = point0[p.id] ? "record" : "default";
      const want = fixedIn.values[p.id];
      if (want !== undefined) {
        if (want >= p.min && want <= p.max) { v = want; source = "you"; }
        else notices.push(`${p.id} = ${want} is outside the declared domain ${p.min} to ${p.max}; it stays ${num(v)}.`);
      }
      fixed[p.id] = v;
      fixedList.push({ id: p.id, tex: p.tex, label: p.label, value: num(v), source });
    }
    for (const k of Object.keys(fixedIn.values)) if (!byId[k]) notices.push(`${k} is not a parameter of this model.`);
    for (const [k, v] of Object.entries(m.sets ?? {})) {
      fixed[k] = v;
      if (fixedList.some((f) => f.id === k)) continue;
      // The declared parameter that a condition fixes, such as the tip Biot number 0 of an insulated tip.
      const dp = decl.model.dimensionless.parameters.find((x) => x.id === k);
      const by = m.conditions.find((c) => decl.model.conditions.find((x) => x.id === c.of)?.sets?.[k] !== undefined && c.alternative === 0);
      fixedList.push({ id: k, tex: dp?.tex ?? k, label: `${dp?.meaning ?? k}, set by the condition ${by ? `${by.record} (${decl.model.conditions.find((x) => x.id === by.of)?.meaning ?? by.of})` : "of the record"}`, value: num(v), source: "condition" });
    }

    /* ---------- the grid ---------- */
    const tol = TOLERANCES[state.tolerance] ?? 0.01;
    const twoD = Boolean(y);
    const xs = axisValues(byId[x], xLog, twoD ? GRID.nx : GRID.n1);
    const ys = twoD ? axisValues(byId[y], yLog, GRID.ny) : [];
    const pts = twoD ? ys.flatMap((yv) => xs.map((xv) => ({ ...fixed, [x]: xv, [y]: yv }))) : xs.map((xv) => ({ ...fixed, [x]: xv }));
    const key = JSON.stringify([decl.id, options, x, y, xLog, yLog, fixed]);
    const nodes = sample(impl, key, pts);
    const us = xs.map((v) => toU(v, xLog)), vs = ys.map((v) => toU(v, yLog));

    /* ---------- layers: regions and boundaries ---------- */
    const layers = impl.layers.map((L) => {
      const th = L.thresholds(tol);
      const measure = nodes.map((n) => (n.ok ? n.values[L.measure] : null));
      const regionOf = (v) => (v === null || v === undefined ? -1 : th.regions.findIndex((r) => inRegion(r, v)));
      const idx = measure.map(regionOf);
      const regions = th.regions.map((r, k) => {
        const out = { id: r.id, label: r.label, lo: num(r.lo), hi: r.hi === null ? null : num(r.hi), closed: Boolean(r.closed), count: idx.filter((i) => i === k).length };
        if (twoD) out.mask = idx.map((i) => (i === k ? "1" : "0")).join("");
        else out.intervals = intervals(idx.map((i) => i === k), xs, (a, b) => refine1D(impl, fixed, x, xLog, L, a, b, nodes, xs, r));
        return out;
      });
      const curves = [];
      for (const [ci, c] of th.curves.entries()) {
        const f = measure.map((v) => (v === null || v === undefined ? null : signed(L, v, c.value)));
        if (twoD) {
          for (const line of contour(f, us, vs)) curves.push({ id: `${L.id}:${curves.length}`, value: num(c.value), label: c.label, points: line.map(([u, v]) => [num(fromU(u, xLog)), num(fromU(v, yLog))]), plot: line, status: L.status, index: ci });
        } else {
          for (let i = 0; i + 1 < f.length; i++) {
            if (f[i] === null || f[i + 1] === null || (f[i] >= 0) === (f[i + 1] >= 0)) continue;
            const at = crossing1D(impl, fixed, x, xLog, L, c.value, xs[i], xs[i + 1]);
            curves.push({ id: `${L.id}:${curves.length}`, value: num(c.value), label: c.label, points: [[num(at), null]], plot: [[toU(at, xLog), 0]], status: L.status, index: ci });
          }
        }
      }
      return { id: L.id, kind: L.kind, boundary: L.boundary, title: L.title, criterion: L.criterion, status: L.status, evidence: L.evidence ?? [], steps: L.steps ?? [], measure: L.measure, scale: L.scale,
        hue: L.hue ?? L.id, regions, curves, series: twoD ? null : measure.map((v) => (v === null || v === undefined ? null : num(v))),
        field: twoD ? measure.map((v) => (v === null || v === undefined ? null : L.scale === "log" ? Number(Math.log10(Math.max(v, 1e-300)).toFixed(3)) : num(v))) : null };
    });

    /* ---------- unresolved points, points without a supported approximation ---------- */
    const unresolvedFlags = nodes.map((n) => !n.ok);
    const reasons = new Map();
    for (const n of nodes) if (!n.ok) reasons.set(n.reason, (reasons.get(n.reason) ?? 0) + 1);
    const approxLayers = layers.filter((l) => l.kind === "approximation");
    const gapFlags = nodes.map((n, i) => n.ok && approxLayers.every((l) => { const r = l.regions.find((x) => x.id === "meets"); return twoD ? r.mask[i] !== "1" : l.series[i] === null || l.series[i] > tol; }));
    const pack = (flags) => (twoD ? { mask: flags.map((b) => (b ? "1" : "0")).join(""), count: flags.filter(Boolean).length } : { intervals: intervals(flags, xs), count: flags.filter(Boolean).length });
    const unresolved = { ...pack(unresolvedFlags), reasons: [...reasons.entries()].map(([reason, count]) => ({ reason, count })) };
    const gap = pack(gapFlags);
    // In 1D the gap is the resolved range less the union of the refined intervals where an approximation holds.
    if (!twoD) {
      const covered = approxLayers.flatMap((l) => l.regions.find((r) => r.id === "meets").intervals).concat(unresolved.intervals).sort((a, b) => a[0] - b[0]);
      const out = [];
      let at = xs[0];
      for (const [a, b] of covered) { if (a > at && !(Math.abs(a - at) <= 1e-12 * Math.abs(at))) out.push([num(at), num(a)]); at = Math.max(at, b); }
      if (at < xs[xs.length - 1]) out.push([num(at), num(xs[xs.length - 1])]);
      gap.intervals = out;
    }

    /* ---------- intersections of boundaries ---------- */
    const intersections = [];
    if (twoD) {
      const all = layers.flatMap((l) => l.curves.map((c) => ({ layer: l, c })));
      for (let i = 0; i < all.length && intersections.length < 24; i++) for (let k = i + 1; k < all.length && intersections.length < 24; k++) {
        if (all[i].layer.id === all[k].layer.id && all[i].c.index === all[k].c.index) continue;
        for (const [u, v] of crossings(all[i].c.plot, all[k].c.plot)) {
          intersections.push({ a: all[i].c.id, b: all[k].c.id, aLabel: all[i].c.label, bLabel: all[k].c.label, x: num(fromU(u, xLog)), y: num(fromU(v, yLog)) });
          if (intersections.length >= 24) break;
        }
      }
    }
    for (const l of layers) for (const c of l.curves) delete c.plot;
    const shadeId = layers.some((l) => l.id === state.shade) ? state.shade : (layers.find((l) => l.kind === "approximation") ?? layers[0])?.id ?? null;
    if (state.shade && shadeId !== state.shade) notices.push(`"${String(state.shade).slice(0, 30)}" is not a layer of this map; the shading shows ${shadeId}.`);
    for (const l of layers) if (l.id !== shadeId) l.field = null;

    /* ---------- the selected point, limit paths and inspection ---------- */
    const sel = selected(state.point, x, y, byId, recordPoint, fixed, notices);
    const recordOnMap = !outside.length;
    const limits = impl.limits(sel).map((L) => {
      const onSlice = L.points.every((q) => Object.keys(q).every((k) => k === x || k === y || Math.abs((q[k] ?? fixed[k]) - (fixed[k] ?? q[k])) <= 1e-12 * Math.abs(fixed[k] ?? 1)));
      const inside = L.points.filter((q) => q[x] >= byId[x].min && q[x] <= byId[x].max && (!y || (q[y] >= byId[y].min && q[y] <= byId[y].max)));
      return { id: L.id, label: L.label, coupled: L.coupled, note: L.note, approx: L.approx ?? null, onSlice, points: onSlice ? inside.map((q) => [num(q[x]), y ? num(q[y]) : null]) : [] };
    });
    const ictx = inspectContext(decl, m, interp, nd, data, point0);
    const atRecord = recordOnMap && params.every((p) => Math.abs(sel[p.id] - recordPoint[p.id]) <= 1e-12 * Math.max(1, Math.abs(recordPoint[p.id])));
    const inspection = inspectAt(impl, layers, tol, sel, { ...ictx, atRecord, exactPoint: atRecord ? Object.fromEntries(Object.entries(point0).map(([k, v]) => [k, v.exact])) : null });
    let boundary = null;
    if (state.pick) {
      const [lid, k] = String(state.pick).split(":");
      const layer = layers.find((l) => l.id === lid);
      const curve = layer?.curves.find((c) => c.id === `${lid}:${k}`);
      if (!curve) notices.push(`The boundary "${String(state.pick).slice(0, 40)}" is not on this map.`);
      else boundary = inspectBoundary(impl, layer, curve, sel, x, y, xLog, yLog, fixed, tol, { ...ictx, atRecord: false, exactPoint: null });
    }

    return {
      ready: true, declaration: summaryOf(decl),
      match: { roles: m.roles, hats: m.hats, params: m.params, equations: m.equations.map((e) => ({ ...e, tex: texOf(e.text) })), conditions: m.conditions.map((c) => ({ ...c, tex: texOf(c.text), atTex: texOf(c.at) })) },
      options, tolerance: tol, toleranceText: state.tolerance, shade: shadeId,
      params: params.map((p) => ({ id: p.id, tex: p.tex, label: p.label, min: p.min, max: p.max, log: Boolean(p.log), kind: p.kind ?? "parameter",
        record: point0[p.id] ? num(point0[p.id].value) : null, exact: point0[p.id]?.exact ?? null })),
      axes: { x: { id: x, tex: byId[x].tex, label: byId[x].label, log: xLog, min: byId[x].min, max: byId[x].max }, y: y ? { id: y, tex: byId[y].tex, label: byId[y].label, log: yLog, min: byId[y].min, max: byId[y].max } : null },
      grid: { xs: xs.map(num), ys: ys.map(num) }, fixed: fixedList, derived: impl.derived(sel).map((d) => ({ ...d, value: num(d.value) })), constraints: impl.constraints(sel),
      layers, unresolved, gap, intersections, limits, approximations: impl.approximations,
      record: recordOnMap ? [num(recordPoint[x]), y ? num(recordPoint[y]) : null] : null,
      point: inspection, boundary, notices,
      analysis: impl.analysis(), acceptance: impl.acceptance(ictx), boundaryTypes: BOUNDARIES, layerKinds: LAYER_KINDS,
      exactBoundaries: impl.exactBoundaries ? impl.exactBoundaries(tol) : null,
      inputs: [...new Set([...Object.values(m.roles).map((r) => r.id), ...m.equations.map((e) => e.record), ...m.conditions.map((c) => c.record), "purpose", "geometry", ...(base.scales ?? []).map((s) => s.id)])],
    };
  }

  /** The TeX of a declared dimensionless text, with the declared names of the dimensionless model. @param {string} text */
  function texOf(text) {
    const r = E.read(text);
    const names = { theta: "\\theta", tau: "\\tau", theta_1: "\\theta_{1}", theta_2: "\\theta_{2}", Bi: "Bi", Bi_1: "Bi_{1}", Bi_2: "Bi_{2}", Bi_t: "Bi_{t}", Gamma: "\\Gamma", kappa: "\\kappa", ell: "\\ell", r_c: "r_{c}", lambda: "\\lambda" };
    return r.error ? String(text) : E.tex(r.ast, (n) => names[n] ?? E.nameTex(n));
  }

  /** Intervals of x where flags hold, from the grid; `edge(a, b)` refines a boundary between two grid points. */
  function intervals(flags, xs, edge) {
    const out = [];
    let start = null;
    for (let i = 0; i < flags.length; i++) {
      if (flags[i] && start === null) start = i === 0 ? xs[0] : edge ? edge(i - 1, i) : xs[i];
      if (!flags[i] && start !== null) { out.push([num(start), num(edge ? edge(i - 1, i) : xs[i - 1])]); start = null; }
    }
    if (start !== null) out.push([num(start), num(xs[xs.length - 1])]);
    return out;
  }
  /** The boundary of a region between grid points a and b of a 1D diagram: the crossing of its nearest threshold. */
  function refine1D(impl, fixed, x, xLog, layer, a, b, nodes, xs, region) {
    const na = nodes[a], nb = nodes[b];
    if (!na.ok || !nb.ok) return na.ok ? xs[a] : xs[b];
    const va = na.values[layer.measure], vb = nb.values[layer.measure];
    const cuts = [region.lo, region.hi].filter((c) => c !== null && c > 0 && ((va - c) * (vb - c) <= 0));
    return cuts.length ? crossing1D(impl, fixed, x, xLog, layer, cuts[0], xs[a], xs[b]) : (xs[a] + xs[b]) / 2;
  }
  /** The x where the layer's measure equals `value`, between xa and xb, by Brent's method in plot coordinates. */
  function crossing1D(impl, fixed, x, xLog, layer, value, xa, xb) {
    const f = (u) => { const r = impl.evaluate({ ...fixed, [x]: fromU(u, xLog) }); return r.ok ? signed(layer, r.values[layer.measure], value) : NaN; };
    const u = SF.brent(f, toU(xa, xLog), toU(xb, xLog), 1e-12);
    return u === null || !Number.isFinite(u) ? (xa + xb) / 2 : fromU(u, xLog);
  }

  /** The selected point: the state's "x,y", else the record's point, else the centre of the axes. */
  function selected(text, x, y, byId, recordPoint, fixed, notices) {
    const p = { ...recordPoint, ...fixed };
    const parts = String(text ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return p;
    const vals = parts.map((s) => Q.parse(s)).map((v) => (v ? Q.toNumber(v) : NaN));
    const ok = (id, v) => Number.isFinite(v) && v >= byId[id].min && v <= byId[id].max;
    if (ok(x, vals[0]) && (!y || ok(y, vals[1]))) { p[x] = vals[0]; if (y) p[y] = vals[1]; }
    else notices.push(`The point ${parts.join(", ")} is outside the map, so the inspection shows the record's point.`);
    return p;
  }

  /** What the family modules need to reconstruct dimensional values and to check exact values. */
  function inspectContext(decl, m, interp, nd, data, point0) {
    const values = D.valuesOf(interp);
    const rename = (text) => String(text).replace(WORD, (w) => (m.roles[w] ? m.roles[w].symbol : w));
    const fields = new Set(interp.variables.filter((v) => v.kind === "field").map((v) => v.symbol));
    const ctx = { isField: (n) => fields.has(n), isCoordinate: () => false, depends: () => true, isVar: (n) => fields.has(n) };
    const defs = new Map();
    for (const e of interp.equations) if (e.kind === "definition" && e.ast?.k === "rel" && e.ast.l.k === "sym" && !fields.has(e.ast.l.name) && !e.symbols.some((s) => fields.has(s)) && !E.derivatives(e.ast.r).length) { try { defs.set(e.ast.l.name, S.fromAst(e.ast.r, ctx)); } catch { /* unused */ } }
    for (const d of decl.model.dimensionless.definitions ?? []) if (!m.roles[d.symbol] && !defs.has(d.symbol)) { try { defs.set(d.symbol, S.read(rename(d.def), ctx)); } catch { /* unused */ } }
    for (const [s, p] of defs) if (!values.has(s)) { const v = D.evaluate(p, values); if (v) values.set(s, v); }
    const exact = (text) => { try { return D.evaluate(S.read(rename(text), ctx), values); } catch { return null; } };
    const temp = decl.model.dimensionless.variables.find((v) => decl.model.roles.find((r) => r.id === v.of)?.quantity === "absolute-temperature");
    const offset = temp ? exact(temp.offset) : null, scale = temp ? exact(temp.scale) : null;
    return {
      references: data.references, point0,
      role: (id) => (m.roles[id] ? values.get(m.roles[id].symbol) ?? null : null),
      exact: (text) => { const v = exact(text); return v ? { exact: v.exact ? Q.str(v.exact) : null, float: v.float } : null; },
      reconstruct: (paramId, value) => { const r = D.reconstruct(decl, m, interp, nd, paramId, value); return r ? { id: `recon-${paramId}`, tex: r.tex, label: `${r.meaning || r.symbol} that gives ${paramId} = ${num(value)}`, value: num(r.value), unit: r.unit } : null; },
      temperature: offset && scale ? (theta) => num(offset.float + scale.float * theta) : null,
    };
  }

  /** The inspection of one point: the value and region of each layer, and the family module's details. */
  function inspectAt(impl, layers, tol, p, ctx) {
    const ev = impl.evaluate(p);
    const at = layers.map((l) => {
      if (!ev.ok) return { layer: l.id, title: l.title, kind: l.kind, value: null, region: null };
      const v = ev.values[l.measure];
      const r = l.regions.find((x) => inRegion(x, v));
      return { layer: l.id, title: l.title, kind: l.kind, value: num(v), region: r ? r.label : null, meets: l.kind === "approximation" ? v <= tol : null };
    });
    const detail = ev.ok ? impl.inspect(p, ctx) : { ok: false, reason: ev.reason };
    const reduced = impl.approximations.filter((a) => at.find((x) => x.layer === a.id)?.meets).map((a) => ({ id: a.id, label: a.label, tex: a.tex, limit: a.limit }));
    return { p: Object.fromEntries(Object.entries(p).map(([k, v]) => [k, num(v)])), ok: ev.ok, reason: ev.ok ? null : ev.reason, layers: at, reduced, detail: JSON.parse(JSON.stringify(detail)) };
  }

  /** A selected boundary: its nearest point to the selected point, refined by Brent's method across the curve. */
  function inspectBoundary(impl, layer, curve, sel, x, y, xLog, yLog, fixed, tol, ctx) {
    let best = null, bestD = Infinity;
    const su = toU(sel[x], xLog), sv = y ? toU(sel[y], yLog) : 0;
    for (const [px, py] of curve.points) {
      const d = Math.hypot(toU(px, xLog) - su, y ? toU(/** @type {number} */ (py), yLog) - sv : 0);
      if (d < bestD) { bestD = d; best = [px, py]; }
    }
    const p = { ...fixed, [x]: best[0], ...(y ? { [y]: best[1] } : {}) };
    const f = (q) => { const r = impl.evaluate(q); return r.ok ? signed(layer, r.values[layer.measure], curve.value) : NaN; };
    // Refine across the curve: along y at fixed x, else along x at fixed y, within a small bracket inside the axis.
    const across = (id, log, from) => {
      const q = implParam(impl, id);
      const lo = toU(q.min, log), hi = toU(q.max, log), span = 0.06 * (hi - lo), c = toU(from, log);
      const r = SF.brent((u) => f({ ...p, [id]: fromU(u, log) }), Math.max(lo, c - span), Math.min(hi, c + span), 1e-12);
      if (r === null || !Number.isFinite(r)) return false;
      p[id] = fromU(r, log);
      return true;
    };
    const refined = (y ? across(y, yLog, /** @type {number} */ (best[1])) : false) || across(x, xLog, best[0]);
    const res = f(p);
    return { layer: layer.id, curve: curve.id, title: layer.title, label: curve.label, boundary: layer.boundary, criterion: layer.criterion, status: layer.status, evidence: layer.evidence, steps: layer.steps,
      value: curve.value, refined, residual: num(Math.abs(res)), point: inspectAt(impl, [layer], tol, p, ctx) };
  }
  const implParam = (impl, id) => impl.params.find((p) => p.id === id);

  /** The declaration's six parts and its method table, as plain data for the catalogue and the map. */
  function summaryOf(decl) {
    return { id: decl.id, family: decl.family, title: decl.title, piece: decl.piece, summary: decl.model.summary };
  }

  /**
   * The catalogue browser: every family of the roadmap, its declared models with their six parts, the method table
   * and the acceptance result of the selected declaration on its standard example (when `run` is given).
   */
  const acceptanceCache = new Map();
  /** The acceptance checks of a declaration on its standard example; `run(example)` gives { interp, nd, base }. */
  function acceptanceOf(data, decl, run) {
    if (acceptanceCache.has(decl.id)) return acceptanceCache.get(decl.id);
    let out;
    try {
      const { interp, nd, base } = run(decl.acceptance.example);
      const m = D.match(decl, interp, nd);
      const tipCond = m.conditions.find((c) => c.of === "tip");
      const impl = m.ok ? implement(decl, { shape: base.geometry?.shape ?? "sphere", tip: tipCond && tipCond.alternative > 0 ? "convective" : "insulated" }) : null;
      out = !m.ok ? { ok: false, checks: [], problems: m.problems } : !impl ? { ok: false, checks: [], problems: ["No solver."] }
        : (() => { const checks = impl.acceptance(inspectContext(decl, m, interp, nd, data, D.point(decl, m, interp, nd))); return { ok: checks.every((c) => c.passed), checks, problems: [] }; })();
    } catch (e) {
      out = { ok: false, checks: [], problems: [e instanceof Error ? e.message : String(e)] };
    }
    acceptanceCache.set(decl.id, out);
    return out;
  }

  function catalogue(data, selectedId, run) {
    const fams = data.roadmap.families.map((f) => ({ ...f, built: f.piece <= data.roadmap.current, declarations: D.declarations(data).filter((d) => d.family === f.id).map((d) => d.id) }));
    const list = D.declarations(data).map((d) => ({ id: d.id, family: d.family, title: d.title, example: d.acceptance.example, problems: D.problemsOf(d),
      methods: D.METHODS.map((x) => ({ id: x.id, name: x.name, applies: d.methods[x.id].applies, reason: d.methods[x.id].reason })) }));
    const sel = D.find(data, selectedId) ?? D.declarations(data)[0] ?? null;
    return { families: fams, declarations: list, parts: D.PARTS, methods: D.METHODS, selected: sel ? sel.id : null, declaration: sel ? JSON.parse(JSON.stringify(sel)) : null,
      acceptance: sel && run ? acceptanceOf(data, sel, run) : null };
  }

  /** The results that the trace, the report and the deck list, each with its status, inputs, steps and evidence. */
  function results(rg) {
    if (!rg || !rg.ready) return [];
    const out = [];
    const inputs = rg.inputs;
    out.push({ id: "r-rm-match", kind: "declaration", title: `The record's dimensionless model equals the declared model "${rg.declaration.title}": ${rg.match.equations.length} equation${rg.match.equations.length > 1 ? "s" : ""} and ${rg.match.conditions.length} condition${rg.match.conditions.length > 1 ? "s" : ""}.`,
      status: "exact", inputs, steps: ["s-rm-declaration"], evidence: ["spec-10"] });
    for (const c of rg.acceptance) out.push({ id: `r-rm-accept-${c.id}`, kind: "acceptance", title: `${c.title}: ${c.passed ? "passed" : "failed"}. ${c.detail}`, status: c.passed ? c.status : "unresolved", tolerance: c.tolerance ?? null, inputs, steps: ["s-rm-acceptance"], evidence: ["spec-10", "spec-11"], next: c.passed ? "" : "Check the declaration's solver and its reference values." });
    for (const l of rg.layers) {
      const n = l.curves.length;
      out.push({ id: `r-rm-layer-${l.id}`, kind: l.kind, title: `${l.title}: ${n} ${l.boundary === "approximation" ? "approximation" : "balance-crossover"} boundar${n === 1 ? "y" : "ies"} on the map. Criterion: ${l.criterion}.`,
        status: l.status, tolerance: l.kind === "approximation" ? String(rg.tolerance) : null, inputs, steps: l.steps, evidence: l.evidence });
    }
    if (rg.unresolved.count) out.push({ id: "r-rm-unresolved", kind: "unresolved", title: `${rg.unresolved.count} points of the map are unresolved: ${rg.unresolved.reasons.map((r) => r.reason).join(" ")}`, status: "unresolved", inputs, steps: ["s-rm-map"], evidence: ["spec-9"], next: "Read the map only where it is resolved. A later solver or a wider declaration can resolve these points." });
    if (rg.gap.count) out.push({ id: "r-rm-gap", kind: "gap", title: `At ${rg.gap.count} resolved points of the map no supported approximation meets the tolerance ${rg.tolerance}: only the full solution is accurate there.`, status: "numerical", tolerance: String(rg.tolerance), inputs, steps: ["s-rm-asymptotic", "s-rm-map"], evidence: ["spec-8"] });
    const coupled = rg.limits.filter((l) => l.coupled);
    if (coupled.length) out.push({ id: "r-rm-coupled", kind: "limits", title: `${coupled.length} limit${coupled.length > 1 ? "s need" : " needs"} a coupled change of the parameters: ${coupled.map((l) => l.label).join("; ")}.`, status: "exact", inputs, steps: ["s-rm-asymptotic"], evidence: ["spec-9"] });
    const pt = rg.point;
    if (pt && pt.ok) {
      const meets = pt.layers.filter((l) => l.meets);
      out.push({ id: "r-rm-point", kind: "point", title: `At ${Object.entries(pt.p).filter(([k]) => rg.params.some((q) => q.id === k)).map(([k, v]) => `${k} = ${v}`).join(", ")}: ${meets.length ? `${meets.map((l) => l.title).join(", ")} ${meets.length > 1 ? "meet" : "meets"} the tolerance ${rg.tolerance}` : `no approximation meets the tolerance ${rg.tolerance}`}.`,
        status: "numerical", tolerance: String(rg.tolerance), inputs, steps: ["s-rm-map"], evidence: ["spec-9"] });
      for (const c of pt.detail.checks ?? []) out.push({ id: `r-rm-check-${c.id}`, kind: "check", title: `${c.title}: ${c.passed ? "passed" : "failed"}. ${c.detail}`, status: c.passed ? c.status : "unresolved", tolerance: c.tolerance ?? null, inputs, steps: ["s-rm-map"], evidence: ["spec-10"] });
    }
    return out;
  }

  return { GRID, TOLERANCES, BOUNDARIES, LAYER_KINDS, implement, derive, catalogue, results, parseFixed, contour, crossings, texOf, IMPLS };
});
