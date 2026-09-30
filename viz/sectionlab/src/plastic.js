/* Sectionlab plastic bending: Ramberg–Osgood fibre integration and the M–κ curve.
 *
 * Material law per part (strain ε, stress σ in MPa), tension and, optionally, a
 * separate compression law:   ε = σ/E + 0.002 (σ/σ0.2)^n.
 *
 * Plane sections: the strain is ε = ε0 − k·v, where v is measured across the
 * neutral-axis direction from the elastic (transformed) centroid, so ε0 is the
 * strain at the centroid. Positive curvature and moment compress the +v side
 * (sagging when bending about x with y up). Axial force N is + in tension.
 *
 * Fibres: in the neutral-axis frame each part is cut into strips parallel to the
 * axis, at a uniform grid across the section plus every vertex and arc turning
 * level of the part. Each strip's exact moments ∫u^i (v − v_m)^j dA come from the
 * boundary integration in geometry.js; σ is interpolated by a quadratic in v
 * through three Chebyshev points of the strip, so a linear-elastic curve is
 * integrated exactly and the error of a nonlinear one falls as the strip width³.
 *
 * Bending about an axis at angle α (x, y or a principal axis) runs in one of two modes:
 *   zero-cross (b, default)  the neutral axis rotates by φ so the moment about the
 *                            perpendicular axis is zero (pure uniaxial moment);
 *   fixed-axis (a)           the neutral axis stays parallel to the bending axis and
 *                            the cross moment that needs is reported.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./geometry.js"));
  else (root.SectionLab = root.SectionLab || {}).plastic = factory(root.SectionLab.geometry);
})(typeof self !== "undefined" ? self : this, function (G) {
  "use strict";

  const STRIPS = 160;          // uniform strips across the section depth
  const CURVE_POINTS = 64;     // points on the M–κ curve, 0 … κ at ε_lim
  const CHEB = Math.sqrt(3) / 2;

  /* σ from ε for one Ramberg–Osgood branch (ε ≥ 0). Newton from an upper bound on a convex
     increasing residual converges monotonically. */
  function roStress(E, s02, n, e) {
    if (e <= 0) return 0;
    let s = Math.min(E * e, s02 * Math.pow(e / 0.002, 1 / n));
    for (let it = 0; it < 200; it++) {
      const p = 0.002 * Math.pow(s / s02, n);
      const g = s / E + p - e;
      const dg = 1 / E + (n * p) / s;
      const ds = g / dg;
      s -= ds;
      if (!(s > 0)) { s = 0; break; }
      if (Math.abs(ds) <= 1e-15 * s) break;
    }
    return s;
  }
  const roStrain = (E, s02, n, s) => s / E + 0.002 * Math.pow(s / s02, n);

  function lawOf(m) {
    const c = m.compression || m;
    return {
      t: { E: m.E, s: m.sigma02, n: m.n, lim: m.eps_lim },
      c: { E: c.E, s: c.sigma02, n: c.n, lim: c.eps_lim },
    };
  }
  const stress = (law, e) => (e >= 0 ? roStress(law.t.E, law.t.s, law.t.n, e) : -roStress(law.c.E, law.c.s, law.c.n, -e));

  function angleOf(axis, props) {
    if (axis === "x") return 0;
    if (axis === "y") return Math.PI / 2;
    if (axis === "major") return props.theta;
    return props.theta + Math.PI / 2;
  }

  /* Elastic second moments of the transformed section in the frame at angle α. */
  function frameInertia(props, a) {
    const c = Math.cos(a), s = Math.sin(a);
    return {
      Ivv: props.Ix * c * c + props.Iy * s * s - 2 * props.Ixy * s * c,
      Iuu: props.Iy * c * c + props.Ix * s * s + 2 * props.Ixy * s * c,
      Iuv: (props.Ix - props.Iy) * s * c + props.Ixy * (c * c - s * s),
    };
  }

  /* Plastic analysis of an assembled model. `assembled` and `props` come from section.js. */
  function analyse(model, assembled, props, options = {}) {
    const strips = options.strips || STRIPS;
    const npts = options.points || CURVE_POINTS;
    const { axis, N, solve } = model.plastic;
    const alpha = angleOf(axis, props);
    const free = solve === "zero-cross";
    const parts = assembled.parts.map((q) => ({
      id: q.part.id,
      w: q.part.void ? -1 : 1,
      law: lawOf(q.material),
      contours: G.transformContours(q.contours, 0, -props.cx, -props.cy),
    }));
    const solids = parts.filter((p) => p.w > 0);
    const Nscale = solids.reduce((s, p) => s + Math.max(p.law.t.s, p.law.c.s) * Math.abs(G.area(p.contours)), 0);

    /* ---- fibres for a neutral-axis angle θ (cached) ---- */
    const cache = new Map();
    function fibres(theta) {
      const key = theta.toFixed(12);
      if (cache.has(key)) return cache.get(key);
      const frame = parts.map((p) => ({ ...p, fc: G.toFrame(p.contours, theta) }));
      let lo = Infinity, hi = -Infinity;
      for (const p of frame) { const e = G.extent(p.fc, 0, 1); p.lo = e.lo; p.hi = e.hi; lo = Math.min(lo, e.lo); hi = Math.max(hi, e.hi); }
      const depth = hi - lo;
      for (const p of frame) {
        const levels = [p.lo, p.hi, ...G.breakLevels(p.fc).filter((v) => v > p.lo && v < p.hi)];
        for (let k = 1; k < strips; k++) { const v = lo + (depth * k) / strips; if (v > p.lo && v < p.hi) levels.push(v); }
        levels.sort((a, b) => a - b);
        const cuts = levels.filter((v, i) => i === 0 || v - levels[i - 1] > 1e-9 * depth);
        p.strips = [];
        for (let i = 0; i + 1 < cuts.length; i++) {
          const a = cuts[i], b = cuts[i + 1], vm = (a + b) / 2;
          const m = G.moments(p.fc, { lo: a, hi: b, shift: vm, ni: 2, nj: 4 });
          if (Math.abs(m[0][0]) <= 1e-14 * depth * depth) continue;
          const d = (CHEB * (b - a)) / 2;
          p.strips.push({ vm, d, m });
        }
      }
      if (cache.size > 64) cache.clear();
      cache.set(key, frame);
      return frame;
    }

    /* Stress resultants in the θ frame for ε = e0 − k v. */
    function resultants(frame, e0, k) {
      let F = 0, Mu = 0, Mv = 0;
      for (const p of frame) {
        const law = p.law;
        let f = 0, mu = 0, mv = 0;
        for (const s of p.strips) {
          const sm = stress(law, e0 - k * (s.vm - s.d)), s0 = stress(law, e0 - k * s.vm), sp = stress(law, e0 - k * (s.vm + s.d));
          const a1 = (sp - sm) / (2 * s.d), a2 = (sp - 2 * s0 + sm) / (2 * s.d * s.d);
          const m = s.m;
          const i0 = s0 * m[0][0] + a1 * m[0][1] + a2 * m[0][2];
          const i1 = s0 * m[0][1] + a1 * m[0][2] + a2 * m[0][3];
          f += i0;
          mu -= s.vm * i0 + i1;               // −∫σ v dA
          mv += s0 * m[1][0] + a1 * m[1][1] + a2 * m[1][2]; // ∫σ u dA
        }
        F += p.w * f; Mu += p.w * mu; Mv += p.w * mv;
      }
      return { F, Mu, Mv };
    }

    /* ε0 giving N for curvature k in frame θ (N is increasing in ε0). */
    function solveE0(frame, k, guess) {
      const f = (e) => resultants(frame, e, k).F - N;
      const tol = 1e-11 * Nscale;
      let a = guess, fa = f(a);
      if (Math.abs(fa) <= tol) return a;
      let step = Math.max(1e-6, Math.abs(guess) * 0.5 + 1e-5);
      let b = fa < 0 ? a + step : a - step, fb = f(b);
      let guard = 0;
      while (Math.sign(fa) === Math.sign(fb) && guard++ < 80) {
        a = b; fa = fb; step *= 2;
        b = fa < 0 ? a + step : a - step; fb = f(b);
      }
      if (Math.sign(fa) === Math.sign(fb)) throw new RangeError("No strain state carries this axial force.");
      // Illinois regula falsi.
      let side = 0;
      for (let it = 0; it < 200; it++) {
        const c = (a * fb - b * fa) / (fb - fa), fc = f(c);
        if (Math.abs(fc) <= tol || Math.abs(b - a) <= 1e-15 * Math.max(Math.abs(a), Math.abs(b), 1e-12)) return c;
        if (Math.sign(fc) === Math.sign(fb)) { b = c; fb = fc; if (side === -1) fa /= 2; side = -1; }
        else { a = c; fa = fc; if (side === 1) fb /= 2; side = 1; }
      }
      return (a + b) / 2;
    }

    const I = frameInertia(props, alpha);
    const phiElastic = free ? Math.atan(I.Iuv / I.Iuu) : 0;
    const e0Elastic = N / (props.E_base * props.A);

    /* State at curvature magnitude k: returns ε0, φ, moments in the load frame, strains and utilisation. */
    function state(k, hint) {
      const at = (phi, e0guess) => {
        const frame = fibres(alpha + phi);
        const e0 = solveE0(frame, k, e0guess);
        const r = resultants(frame, e0, k);
        const c = Math.cos(phi), s = Math.sin(phi);
        return { phi, e0, frame, Ma: r.Mu * c - r.Mv * s, Mp: r.Mu * s + r.Mv * c };
      };
      let best;
      if (!free || k === 0) best = at(0, hint ? hint.e0 : e0Elastic);
      else {
        let p0 = hint ? hint.phi : phiElastic;
        let s0 = at(p0, hint ? hint.e0 : e0Elastic);
        const tol = (st) => Math.abs(st.Mp) <= 1e-9 * Math.max(Math.abs(st.Ma), 1e-300);
        if (tol(s0)) best = s0;
        else {
          let p1 = p0 + 1e-3, s1 = at(p1, s0.e0);
          for (let it = 0; it < 40 && !tol(s1); it++) {
            const denom = s1.Mp - s0.Mp;
            if (denom === 0) break;
            let p2 = p1 - (s1.Mp * (p1 - p0)) / denom;
            p2 = Math.max(-1.45, Math.min(1.45, p2));
            p0 = p1; s0 = s1; p1 = p2; s1 = at(p1, s1.e0);
          }
          if (!tol(s1)) throw new RangeError("The neutral-axis rotation for a zero cross moment did not converge; try the fixed-axis mode.");
          best = s1;
        }
      }
      // Strain extremes per part in the neutral-axis frame.
      let util = 0, gov = null, eMax = -Infinity, eMin = Infinity;
      for (const p of best.frame) {
        if (p.w < 0) continue;
        for (const v of [p.lo, p.hi]) {
          const e = best.e0 - k * v;
          eMax = Math.max(eMax, e); eMin = Math.min(eMin, e);
          const u = e >= 0 ? e / p.law.t.lim : -e / p.law.c.lim;
          if (u > util) { util = u; gov = { part: p.id, fibre: e >= 0 ? "tension" : "compression", strain: e }; }
        }
      }
      const c = Math.cos(best.phi);
      // A cross moment inside the solver tolerance is reported as 0.
      if (Math.abs(best.Mp) <= 1e-9 * Math.abs(best.Ma)) best.Mp = 0;
      return { k, kappa: k * c, kappaCross: k * Math.sin(best.phi), phi: best.phi, e0: best.e0, M: best.Ma, Mcross: best.Mp, epsMax: eMax, epsMin: eMin, util, governing: gov };
    }

    const out = { axis, alpha, alphaDeg: (alpha * 180) / Math.PI, solve, N, strips };

    // Uniform strain at the smallest ε_lim bounds the axial force the section can carry within its limits.
    {
      const f0 = fibres(alpha);
      const epsT = Math.min(...solids.map((p) => p.law.t.lim)), epsC = Math.min(...solids.map((p) => p.law.c.lim));
      const nMax = resultants(f0, epsT, 0).F, nMin = resultants(f0, -epsC, 0).F;
      if (N >= nMax || N <= nMin) throw new RangeError(`The axial force alone strains the section past ε_lim: within ε_lim it carries ${+nMin.toPrecision(4)} N to ${+nMax.toPrecision(4)} N.`);
    }
    const s0 = state(0);
    if (s0.util >= 1) throw new RangeError(`The axial force alone strains part "${s0.governing.part}" past its ε_lim.`);

    // Bracket and bisect the curvature at which the governing fibre reaches ε_lim.
    let depth = 0;
    { const f = fibres(alpha); let lo = Infinity, hi = -Infinity; for (const p of f) { lo = Math.min(lo, p.lo); hi = Math.max(hi, p.hi); } depth = hi - lo; }
    const limMin = Math.min(...solids.map((p) => Math.min(p.law.t.lim, p.law.c.lim)));
    let kLo = 0, sLo = s0, kHi = (2 * limMin) / depth, sHi = state(kHi, s0);
    for (let g = 0; sHi.util < 1 && g < 60; g++) { kLo = kHi; sLo = sHi; kHi *= 2; sHi = state(kHi, sLo); }
    if (sHi.util < 1) throw new RangeError("Could not reach ε_lim; check the material limits.");
    for (let it = 0; it < 60 && (kHi - kLo) > 1e-10 * kHi; it++) {
      const km = (kLo + kHi) / 2, sm = state(km, sLo);
      if (sm.util < 1) { kLo = km; sLo = sm; } else { kHi = km; sHi = sm; }
    }
    // Final point exactly at util = 1 by linear interpolation between the bracket ends.
    const kLim = kLo + ((1 - sLo.util) * (kHi - kLo)) / (sHi.util - sLo.util || 1);
    const limit = state(kLim, sLo);
    out.limit = limit;

    const curve = [s0];
    let prev = s0;
    for (let i = 1; i < npts; i++) { const st = state((kLim * i) / (npts - 1 || 1), prev); curve.push(st); prev = st; }
    curve[curve.length - 1] = limit;
    out.curve = curve;

    /* ---- linear-elastic first yield (σ0.2) with the same axis and mode ---- */
    const t = free ? I.Iuv / I.Iuu : 0; // κ_p / κ_a
    const Ieff = I.Ivv - t * I.Iuv;
    function firstYield(Nv) {
      const e0 = Nv / (props.E_base * props.A);
      let lam = Infinity; // largest M_a (≥ 0) before any fibre reaches σ0.2
      for (const q of assembled.parts) {
        if (q.part.void) continue;
        const law = lawOf(q.material);
        const fc = G.toFrame(G.transformContours(q.contours, 0, -props.cx, -props.cy), alpha);
        // g = −v + t·u; strain ε = e0 + (M_a / (E_base I_eff))·g
        const ext = G.extent(fc, t, -1);
        const len = Math.hypot(t, 1);
        for (const g of [ext.lo * len, ext.hi * len]) {
          const E = q.material.E;
          const sN = E * e0;
          if (sN > law.t.s || -sN > law.c.s) return null;
          const slope = (E * g) / (props.E_base * Ieff);
          if (slope > 0) lam = Math.min(lam, (law.t.s - sN) / slope);
          else if (slope < 0) lam = Math.min(lam, (-law.c.s - sN) / slope);
        }
      }
      return Number.isFinite(lam) ? lam : null;
    }

    /* ---- section properties at N = 0: M_el, the fully plastic moment M_p (σ = ±σ0.2 either side of the plastic neutral axis), Z_p and the shape factor ---- */
    out.Mel = firstYield(0);
    out.plasticNA = plasticMoment(parts, alpha, free, 0);
    out.Mp = out.plasticNA ? out.plasticNA.M : null;
    const mats = new Set(assembled.solids.map((q) => q.material.id));
    const m0 = assembled.solids[0].material;
    const symmetric = !m0.compression || m0.compression.sigma02 === m0.sigma02;
    if (out.Mp === null) out.Zp = null, out.ZpNote = "The σ0.2 stress block has no neutral axis with zero cross moment.";
    else if (mats.size === 1 && symmetric) out.Zp = out.Mp / m0.sigma02;
    else { out.Zp = null; out.ZpNote = mats.size > 1 ? "Mixed materials: M_p is given instead of Z_p." : "Different tension and compression σ0.2: M_p is given instead of Z_p."; }
    out.shapeFactor = out.Mp !== null && out.Mel ? out.Mp / out.Mel : null;

    /* ---- the same moments at the applied axial force N (null when N = 0) ---- */
    out.MelN = N === 0 ? null : firstYield(N);
    const atN = N === 0 ? null : plasticMoment(parts, alpha, free, N);
    out.MpN = atN ? atN.M : null;
    return out;
  }

  /* Rigid–plastic stress block. Returns { M, Mcross, phi, v } or null when N is out of range. */
  function plasticMoment(parts, alpha, free, N) {
    function block(phi) {
      const fr = parts.map((p) => ({ ...p, fc: G.toFrame(p.contours, alpha + phi) }));
      let lo = Infinity, hi = -Infinity;
      for (const p of fr) { const e = G.extent(p.fc, 0, 1); lo = Math.min(lo, e.lo); hi = Math.max(hi, e.hi); }
      const sums = (c) => {
        let F = 0, Mu = 0, Mv = 0;
        for (const p of fr) {
          const below = G.moments(p.fc, { hi: c, ni: 2, nj: 2 }), above = G.moments(p.fc, { lo: c, ni: 2, nj: 2 });
          const st = p.law.t.s, sc = p.law.c.s;
          F += p.w * (st * below[0][0] - sc * above[0][0]);
          Mu -= p.w * (st * below[0][1] - sc * above[0][1]);
          Mv += p.w * (st * below[1][0] - sc * above[1][0]);
        }
        return { F, Mu, Mv };
      };
      const fLo = sums(lo).F, fHi = sums(hi).F; // all compression … all tension
      if (N < fLo || N > fHi) return null;
      let a = lo, b = hi;
      for (let it = 0; it < 200 && b - a > 1e-13 * (hi - lo); it++) {
        const c = (a + b) / 2;
        if (sums(c).F < N) a = c; else b = c;
      }
      const v = (a + b) / 2, r = sums(v);
      const c = Math.cos(phi), s = Math.sin(phi);
      return { phi, v, M: r.Mu * c - r.Mv * s, Mcross: r.Mu * s + r.Mv * c };
    }
    let best = block(0);
    if (!best || !free) return best;
    const tol = (b) => Math.abs(b.Mcross) <= 1e-9 * Math.abs(b.M);
    if (tol(best)) return best;
    // Find a sign change of the cross moment in φ, then bisect.
    const step = Math.PI / 180;
    let pa = 0, ba = best, pb = null, bb = null;
    for (let k = 1; k <= 85 && !pb; k++) {
      for (const sgn of [1, -1]) {
        const p = sgn * k * step, b = block(p);
        if (b && Math.sign(b.Mcross) !== Math.sign(ba.Mcross)) { pb = p; bb = b; pa = sgn * (k - 1) * step; ba = block(pa); break; }
      }
    }
    if (!pb) return null;
    for (let it = 0; it < 80 && !tol(ba); it++) {
      const pm = (pa + pb) / 2, bm = block(pm);
      if (Math.sign(bm.Mcross) === Math.sign(ba.Mcross)) { pa = pm; ba = bm; } else { pb = pm; bb = bm; }
    }
    return ba;
  }

  return { STRIPS, CURVE_POINTS, roStress, roStrain, stress, lawOf, angleOf, frameInertia, analyse, plasticMoment };
});
