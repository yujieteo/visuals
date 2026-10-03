/* Radar network visualiser: the projected 3D scene.
 *
 * An orbit camera (yaw, pitch, distance, target) with perspective or orthographic projection, painter's-order
 * drawing on a Canvas 2D context with depth preserved, picking, and ray-plane intersection for moving objects
 * in the XY, XZ or YZ edit plane. The camera never touches the model: it reads positions and draws them.
 */
(function (root, factory) {
  const node = typeof module === "object" && module.exports;
  const api = factory(node ? require("./numerics.js") : root.RadarNet.numerics);
  if (node) module.exports = api;
  else (root.RadarNet = root.RadarNet || {}).scene3d = api;
})(typeof self !== "undefined" ? self : this, function (N) {
  "use strict";
  const { vsub, vadd, vscale, vdot, vcross, vunit, vnorm, rad } = N;

  /* ===== CAMERA ===== */
  /** Camera frame from the view state: eye position and orthonormal right, up, forward vectors. */
  function cameraFrame(cam) {
    const yaw = rad(cam.yaw_deg), pitch = rad(cam.pitch_deg);
    const dir = [Math.cos(pitch) * Math.cos(yaw), Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch)]; // from target to eye
    const eye = vadd(cam.target_m, vscale(dir, cam.distance_m));
    const fwd = vscale(dir, -1);
    let right = vunit(vcross(fwd, [0, 0, 1]));
    if (!Number.isFinite(right[0])) right = [1, 0, 0];
    const up = vcross(right, fwd);
    return { eye, fwd, right, up };
  }
  /** Projector for a canvas of w x h CSS pixels. project(p) -> { x, y, depth, ok }. */
  function projector(cam, w, h) {
    const f = cameraFrame(cam);
    const persp = cam.projection !== "orthographic";
    const focal = (0.5 * h) / Math.tan(rad(cam.fov_deg) / 2);
    const orthoScale = (0.5 * h) / (cam.distance_m * Math.tan(rad(cam.fov_deg) / 2));
    const near = cam.distance_m * 1e-3;
    function project(p) {
      const d = vsub(p, f.eye);
      const z = vdot(d, f.fwd), x = vdot(d, f.right), y = vdot(d, f.up);
      if (persp) {
        if (z <= near) return { x: NaN, y: NaN, depth: z, ok: false };
        return { x: w / 2 + (focal * x) / z, y: h / 2 - (focal * y) / z, depth: z, ok: true, scale: focal / z };
      }
      return { x: w / 2 + orthoScale * x, y: h / 2 - orthoScale * y, depth: z, ok: true, scale: orthoScale };
    }
    /** World ray through canvas pixel (px, py): { origin, dir }. */
    function ray(px, py) {
      if (persp) {
        const dx = (px - w / 2) / focal, dy = -(py - h / 2) / focal;
        return { origin: f.eye, dir: vunit(vadd(f.fwd, vadd(vscale(f.right, dx), vscale(f.up, dy)))) };
      }
      const ox = (px - w / 2) / orthoScale, oy = -(py - h / 2) / orthoScale;
      return { origin: vadd(f.eye, vadd(vscale(f.right, ox), vscale(f.up, oy))), dir: f.fwd };
    }
    return { project, ray, frame: f, persp };
  }
  /** Intersection of a ray with the edit plane through point p0: "XY" (z fixed), "XZ" (y fixed), "YZ" (x fixed). */
  function rayPlane(r, plane, p0) {
    const n = plane === "XY" ? [0, 0, 1] : plane === "XZ" ? [0, 1, 0] : [1, 0, 0];
    const den = vdot(r.dir, n);
    if (Math.abs(den) < 1e-9) return null;
    const t = vdot(vsub(p0, r.origin), n) / den;
    if (t <= 0) return null;
    return vadd(r.origin, vscale(r.dir, t));
  }
  /** Fit the camera to a set of points: target at their centre, distance so they fill the view. */
  function fit(cam, points) {
    if (!points.length) return cam;
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const p of points) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]); }
    const c = vscale(vadd(lo, hi), 0.5), r = Math.max(5e3, 0.5 * vnorm(vsub(hi, lo)));
    return { ...cam, target_m: c, distance_m: (0.95 * r) / Math.sin(rad(cam.fov_deg) / 2) };
  }
  const PRESETS = {
    home: { yaw_deg: -60, pitch_deg: 28 },
    top: { yaw_deg: -90, pitch_deg: 89.5 },
    front: { yaw_deg: -90, pitch_deg: 0.5 },
    side: { yaw_deg: 0, pitch_deg: 0.5 },
  };

  /* ===== DRAWING ===== */
  /**
   * Draw a list of primitives sorted far to near. Primitive kinds: line {a, b, style}, poly {pts, style},
   * marker {p, shape, size, style, label}, text {p, text, style}. Styles carry stroke, fill, width, dash, alpha.
   * Returns the projected markers for picking.
   */
  function draw(ctx, proj, prims, opts = {}) {
    const items = [];
    for (const pr of prims) {
      if (pr.kind === "line") {
        const a = proj.project(pr.a), b = proj.project(pr.b);
        if (!a.ok || !b.ok) continue;
        items.push({ pr, d: (a.depth + b.depth) / 2, a, b });
      } else if (pr.kind === "poly") {
        const pts = pr.pts.map(proj.project);
        if (pts.some((q) => !q.ok)) continue;
        items.push({ pr, d: pts.reduce((s, q) => s + q.depth, 0) / pts.length, pts });
      } else {
        const q = proj.project(pr.p);
        if (!q.ok) continue;
        items.push({ pr, d: q.depth - (pr.kind === "marker" ? 1e-3 : 0), q });
      }
    }
    items.sort((x, y) => y.d - x.d);
    const picks = [];
    for (const it of items) {
      const s = it.pr.style || {};
      ctx.globalAlpha = s.alpha ?? 1;
      ctx.lineWidth = s.width ?? 1;
      ctx.setLineDash(s.dash ?? []);
      ctx.strokeStyle = s.stroke ?? "#888";
      ctx.fillStyle = s.fill ?? s.stroke ?? "#888";
      if (it.pr.kind === "line") {
        ctx.beginPath(); ctx.moveTo(it.a.x, it.a.y); ctx.lineTo(it.b.x, it.b.y); ctx.stroke();
      } else if (it.pr.kind === "poly") {
        ctx.beginPath(); it.pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
        if (it.pr.closed !== false) ctx.closePath();
        if (s.fill) ctx.fill();
        if (s.stroke) ctx.stroke();
      } else if (it.pr.kind === "marker") {
        const r = it.pr.size ?? 6, { x, y } = it.q;
        ctx.setLineDash([]);
        ctx.beginPath();
        if (it.pr.shape === "square") ctx.rect(x - r, y - r, 2 * r, 2 * r);
        else if (it.pr.shape === "triangle") { ctx.moveTo(x, y - r * 1.2); ctx.lineTo(x + r, y + r * 0.8); ctx.lineTo(x - r, y + r * 0.8); ctx.closePath(); }
        else if (it.pr.shape === "diamond") { ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); }
        else ctx.arc(x, y, r, 0, 2 * Math.PI);
        if (s.fill) ctx.fill();
        if (s.stroke) { ctx.lineWidth = s.width ?? 1.5; ctx.stroke(); }
        if (it.pr.ring) { ctx.beginPath(); ctx.arc(x, y, r + 5, 0, 2 * Math.PI); ctx.lineWidth = 2; ctx.strokeStyle = it.pr.ring; ctx.stroke(); }
        if (it.pr.pick) picks.push({ id: it.pr.pick, x, y, r: Math.max(r, 12) });
      } else if (it.pr.kind === "text") {
        ctx.globalAlpha = s.alpha ?? 1;
        ctx.font = s.font ?? opts.font ?? "12px sans-serif";
        ctx.fillStyle = s.fill ?? "#888";
        ctx.fillText(it.pr.text, it.q.x + (it.pr.dx ?? 8), it.q.y + (it.pr.dy ?? -8));
      }
    }
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
    return picks;
  }
  /** Nearest pick within its radius of (x, y), or null. */
  function pick(picks, x, y) {
    let best = null, bd = Infinity;
    for (const p of picks) { const d = Math.hypot(p.x - x, p.y - y); if (d <= p.r && d < bd) { best = p; bd = d; } }
    return best;
  }
  /** Wireframe cone: apex, unit axis, half-angle (deg), length. Returns line primitives. */
  function cone(apex, axis, halfDeg, length, style, n = 12) {
    let e1 = vunit(vcross(axis, [0, 0, 1]));
    if (!Number.isFinite(e1[0])) e1 = [1, 0, 0];
    const e2 = vcross(axis, e1), r = length * Math.tan(rad(halfDeg)), c = vadd(apex, vscale(axis, length));
    const ring = [];
    for (let i = 0; i <= n; i++) { const a = (2 * Math.PI * i) / n; ring.push(vadd(c, vadd(vscale(e1, r * Math.cos(a)), vscale(e2, r * Math.sin(a))))); }
    const out = [];
    for (let i = 0; i < n; i++) out.push({ kind: "line", a: ring[i], b: ring[i + 1], style });
    for (let i = 0; i < n; i += 3) out.push({ kind: "line", a: apex, b: ring[i], style });
    out.push({ kind: "line", a: apex, b: c, style: { ...style, dash: [2, 3] } });
    return out;
  }

  return { cameraFrame, projector, rayPlane, fit, PRESETS, draw, pick, cone };
});
