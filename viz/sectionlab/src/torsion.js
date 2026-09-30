/* Sectionlab torsion constants.
 *
 * A torsion constant J is given only when the section is a single solid library
 * shape (no voids, no other parts) and that shape has a formula whose accuracy was
 * measured against the numerical Prandtl reference (reference/prandtl.py). The
 * measured accuracy of each formula is recorded in reference/torsion-accuracy.json;
 * a formula whose measured error exceeds its stated accuracy is withdrawn there and
 * reported as "n/a". Every other section also gets "n/a".
 *
 * Formula sources are exact elasticity solutions and theory, not handbook tables:
 *   circle, circular hollow   exact: J = π(d⁴ − dᵢ⁴)/32
 *   equilateral triangle      exact (Saint-Venant): J = √3 a⁴/80
 *   semicircle                exact (Saint-Venant): J = (π/2 − 4/π) r⁴
 *   sharp rectangle           Saint-Venant series:
 *                             J = (b h³/3) [1 − (192/π⁵)(h/b) Σ_{n odd} tanh(nπb/2h)/n⁵], h ≤ b
 *   rectangular hollow        Bredt–Batho closed thin wall: J = 4 A_m² t / p_m on the wall's
 *                             mid-line (area A_m, length p_m), for uniform walls within the
 *                             stated thickness range (sharp and rounded corners are
 *                             checked, and their accuracy stated, separately)
 *   I, channel, Z, tee, angle,  Vlasov thin-walled open section: J = (1/3) Σ L t³ over the
 *   cross (sharp corners)       wall mid-lines, for walls up to 0.15 of the smaller outside
 *                               dimension with the thicker wall at most 1.4 times the thinner;
 *                               root fillets make it n/a
 *   cold-formed angle, channel, Vlasov thin-walled open section with a uniform wall:
 *   Z, top hat                  J = L t³/3 over the developed mid-line (bends included),
 *                               for t up to 0.1 of the smaller of b and h
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else (root.SectionLab = root.SectionLab || {}).torsion = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* Largest wall thickness, as a fraction of the smaller outside dimension, for Bredt–Batho. */
  const BREDT_MAX_T_RATIO = 0.1;

  function rectangleSeries(b, h) {
    if (h > b) [b, h] = [h, b];
    let sum = 0;
    for (let n = 1; n < 100001; n += 2) {
      const term = Math.tanh((n * Math.PI * b) / (2 * h)) / n ** 5;
      sum += term;
      if (term < 1e-18 * sum) break;
    }
    return ((b * h ** 3) / 3) * (1 - (192 / Math.PI ** 5) * (h / b) * sum);
  }

  /* Largest wall, as a fraction of the smaller outside dimension, for the thin-walled open-section formula. */
  const OPEN_MAX_T_RATIO = 0.15;
  /* Largest ratio of the thicker wall to the thinner one for the thin-walled open-section formula. */
  const OPEN_MAX_WALL_RATIO = 1.4;

  /* Saint-Venant constant of a thin-walled open section from its wall mid-lines, J = (1/3) Σ L t³:
     flanges and legs run to the mid-line of the wall they meet, so no length is counted twice. */
  function openMidline(shape, d) {
    const c = (L, t) => (L * t ** 3) / 3;
    switch (shape) {
      case "ishape": return 2 * c(d.b, d.tf) + c(d.h - d.tf, d.tw);
      case "channel": case "zed": return 2 * c(d.b - d.tw / 2, d.tf) + c(d.h - d.tf, d.tw);
      case "tee": return c(d.b, d.tf) + c(d.h - d.tf / 2, d.tw);
      case "angle": return c(d.b + d.h - d.t, d.t);
      case "cross": return c(d.b, d.tb) + c(d.h - d.tb, d.th);
      default: throw new RangeError(`No mid-line model for ${shape}.`);
    }
  }

  /* Largest wall, as a fraction of the smaller of b and h, for cold-formed shapes. */
  const COLD_MAX_T_RATIO = 0.1;

  /* Developed mid-line length of a cold-formed strip: the sharp mid-line path, less (2 − π/2) r_m for
     every 90° bend of mid-line radius r_m = ri + t/2 (an arc replaces the two tangent lengths). */
  function developedLength(shape, d) {
    const { t, ri } = d, m = t / 2, cut = (2 - Math.PI / 2) * (ri + m);
    const lipped = d.c > 0;
    switch (shape) {
      case "cfangle": return d.b - m + d.h - m - cut;
      case "cfchannel": case "cfzed":
        return lipped ? d.h - t + 2 * (d.b - t) + 2 * (d.c - m) - 4 * cut : d.h - t + 2 * (d.b - m) - 2 * cut;
      case "cfhat": return 2 * (d.f + m) + 2 * (d.h - t) + (d.b - t) - 4 * cut;
      default: throw new RangeError(`No developed length for ${shape}.`);
    }
  }

  const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(Math.abs(a), Math.abs(b), 1e-300);
  const allZero = (r) => r.every((x) => x === 0);

  /* Formula for one shape, or { reason } when none applies. */
  function formula(shape, d, radii) {
    switch (shape) {
      case "circle":
        return { id: "circle", method: "exact", J: (Math.PI * d.d ** 4) / 32, text: "J = π d⁴ / 32" };
      case "chs": {
        const di = d.d - 2 * d.t;
        return { id: "chs", method: "exact", J: (Math.PI * (d.d ** 4 - di ** 4)) / 32, text: "J = π (d⁴ − dᵢ⁴) / 32" };
      }
      case "semicircle":
        return { id: "semicircle", method: "exact", J: (Math.PI / 2 - 4 / Math.PI) * (d.d / 2) ** 4, text: "J = (π/2 − 4/π) r⁴" };
      case "rect":
        if (!allZero(radii)) return { reason: "No verified formula for a rectangle with rounded corners." };
        return { id: "rect", method: "Saint-Venant series", J: rectangleSeries(d.b, d.h), text: "J = (b h³/3)[1 − (192/π⁵)(h/b) Σ tanh(nπb/2h)/n⁵], n odd, h ≤ b" };
      case "triangle": {
        const equilateral = close(d.a, d.b / 2) && close(d.h, (d.b * Math.sqrt(3)) / 2);
        if (!equilateral || !allZero(radii)) return { reason: "Only a sharp equilateral triangle (a = b/2, h = b√3/2) has an exact formula." };
        return { id: "triangle-equilateral", method: "exact", J: (Math.sqrt(3) * d.b ** 4) / 80, text: "J = √3 a⁴ / 80" };
      }
      case "rhs": {
        const { b, h, t } = d;
        if (t > BREDT_MAX_T_RATIO * Math.min(b, h)) return { reason: `Bredt–Batho is used only for walls up to ${BREDT_MAX_T_RATIO} of the smaller outside dimension.` };
        const rm = [];
        for (let k = 0; k < 4; k++) {
          const ro = radii[k], ri = radii[k + 4];
          if (ro === 0 && ri === 0) { rm.push(0); continue; }
          if (ro < t || !(Math.abs(ri - (ro - t)) <= 1e-9 * t)) {
            return { reason: "Bredt–Batho needs a uniform wall: each inner corner radius must equal the outer radius minus t (or both 0)." };
          }
          rm.push(ro - t / 2);
        }
        const bm = b - t, hm = h - t;
        const Am = bm * hm - rm.reduce((s, r) => s + (1 - Math.PI / 4) * r * r, 0);
        const pm = 2 * (bm + hm) - rm.reduce((s, r) => s + (2 - Math.PI / 2) * r, 0);
        // Sharp corners carry a larger error than rounded ones, so they are checked and stated separately.
        const id = rm.every((r) => r > 0) ? "rhs-bredt-rounded" : "rhs-bredt-sharp";
        return { id, method: "Bredt–Batho (thin wall)", J: (4 * Am * Am * t) / pm, text: "J = 4 A_m² t / p_m" };
      }
      case "ishape": case "channel": case "zed": case "tee": case "angle": case "cross": {
        if (!allZero(radii)) return { reason: "Root fillets and rounded toes add torsional stiffness the thin-walled formula leaves out (6–20% measured), so it is given only for sharp corners." };
        const walls = shape === "angle" ? [d.t] : shape === "cross" ? [d.tb, d.th] : [d.tf, d.tw];
        if (Math.max(...walls) > OPEN_MAX_T_RATIO * Math.min(d.b, d.h)) return { reason: `The thin-walled formula is used only for walls up to ${OPEN_MAX_T_RATIO} of the smaller outside dimension.` };
        if (Math.max(...walls) / Math.min(...walls) > OPEN_MAX_WALL_RATIO) return { reason: `The thin-walled formula is used only when the thicker wall is at most ${OPEN_MAX_WALL_RATIO} times the thinner.` };
        return { id: "open-thin-wall", method: "Vlasov thin-walled open section", J: openMidline(shape, d), text: "J = (1/3) Σ L t³ over the wall mid-lines" };
      }
      case "cfangle": case "cfchannel": case "cfzed": case "cfhat": {
        if (d.t > COLD_MAX_T_RATIO * Math.min(d.b, d.h)) return { reason: `The thin-walled formula is used only for walls up to ${COLD_MAX_T_RATIO} of the smaller of b and h.` };
        return { id: "cold-formed-thin-wall", method: "Vlasov thin-walled open section (uniform wall)", J: (developedLength(shape, d) * d.t ** 3) / 3, text: "J = L t³ / 3, L the developed mid-line length including the bends" };
      }
      default:
        return { reason: "No verified torsion formula for this shape." };
    }
  }

  /* Torsion constant of a model, using the measured-accuracy table. */
  function torsion(model, accuracy) {
    const solids = model.parts.filter((p) => !p.void);
    if (model.parts.length !== 1 || solids.length !== 1) return { available: false, reason: "Given only for a single library shape with no voids." };
    const p = solids[0];
    const f = formula(p.shape, p.dims, p.radii);
    if (f.reason) return { available: false, reason: f.reason };
    const acc = accuracy && accuracy.formulas ? accuracy.formulas[f.id] : null;
    if (!acc) return { available: false, reason: "This formula has no recorded accuracy check." };
    if (!acc.pass) return { available: false, reason: `Withdrawn: measured error ${pct(acc.measured)} exceeds the stated ${pct(acc.stated)}.` };
    return { available: true, J: f.J, formula: f.id, method: f.method, text: f.text, stated: acc.stated, measured: acc.measured, cases: acc.cases, note: acc.note };
  }

  const pct = (x) => `${+(x * 100).toPrecision(2)}%`;

  return { BREDT_MAX_T_RATIO, OPEN_MAX_T_RATIO, OPEN_MAX_WALL_RATIO, COLD_MAX_T_RATIO, rectangleSeries, openMidline, developedLength, formula, torsion };
});
