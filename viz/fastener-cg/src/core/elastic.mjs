/* Elastic distribution (spec 5.3 and 5.4).
 *
 * In-plane: direct shear shared by ks, torsion by a rigid plate rotating
 * about Cs. Out-of-plane, method (a): rigid plate, neutral axis through Ca,
 * w = w0 + θx·q − θy·p. Positive T is tension; negative T is unloading
 * (clamp-up) and is reported as computed.
 */

/* `props` from sectionProperties, `red` from reduceLoad. */
export function elasticShear(fasteners, props, red) {
  const { Ks, J } = props;
  const Mz = red.shear.Mz;
  return fasteners.map((f, i) => {
    const { u, v } = props.per[i];
    const share = f.ks / Ks;
    const Rdx = red.Fx * share, Rdy = red.Fy * share;
    // J = 0 (one fastener, or all at one point): no torsional resistance; closure then reports it.
    const Rtx = J > 0 ? -Mz * f.ks * v / J : 0;
    const Rty = J > 0 ? Mz * f.ks * u / J : 0;
    const Rx = Rdx + Rtx, Ry = Rdy + Rty;
    return { id: f.id, share, u, v, Rdx, Rdy, Rtx, Rty, Rx, Ry, Rs: Math.hypot(Rx, Ry), angleDeg: Math.atan2(Ry, Rx) * 180 / Math.PI };
  });
}

/* Relative tolerance below which D, I₁ or I₂ count as zero. */
export const SINGULAR_TOL = 1e-10;

/*
 * Method (a). Returns { T: [...], mode, unresolved } where mode is
 * "general" (D > 0, the spec's closed form), "collinear" (one principal
 * value vanishes: bending is resisted about the other principal axis only)
 * or "point" (all fasteners coincide: only Fz is resisted).
 * `unresolved` is the bending component the pattern cannot resist; the
 * caller raises W-002 or E-011 from it.
 */
export function elasticAxialCentroid(fasteners, props, red) {
  const { Ka, Ixx, Iyy, Ixy, D, principal: pr } = props;
  const Fz = red.Fz, Mx = red.axial.Mx, My = red.axial.My;
  const scale = Math.max(Ixx + Iyy, 0);
  const T = new Array(fasteners.length);
  if (scale > 0 && D > SINGULAR_TOL * scale * scale) {
    const thetaX = (Iyy * Mx + Ixy * My) / D;
    const thetaY = (Ixy * Mx + Ixx * My) / D;
    fasteners.forEach((f, i) => {
      const { p, q } = props.per[i];
      const direct = f.ka * Fz / Ka, moment = f.ka * (thetaX * q - thetaY * p);
      T[i] = { id: f.id, p, q, direct, moment, T: direct + moment };
    });
    return { mode: "general", thetaX, thetaY, D, T, unresolved: null };
  }
  // Principal frame: axis 1 at θp, axis 2 perpendicular. In that frame
  // Ixy' = 0, so T = ka·(Fz/Ka + M1·q'/I1 − M2·p'/I2).
  const c = Math.cos(pr.thetaRad), s = Math.sin(pr.thetaRad);
  const M1 = Mx * c + My * s, M2 = -Mx * s + My * c;
  const resolved1 = scale > 0 && pr.I1 > SINGULAR_TOL * scale;
  const mode = resolved1 ? "collinear" : "point";
  fasteners.forEach((f, i) => {
    const { p, q } = props.per[i];
    const q1 = -p * s + q * c;
    const direct = f.ka * Fz / Ka, moment = resolved1 ? f.ka * M1 * q1 / pr.I1 : 0;
    T[i] = { id: f.id, p, q, direct, moment, T: direct + moment };
  });
  const unresolved = resolved1
    ? { axisDeg: (pr.thetaRad + Math.PI / 2) * 180 / Math.PI, moment: M2, components: { Mx: -M2 * s, My: M2 * c } }
    : { axisDeg: null, moment: Math.hypot(Mx, My), components: { Mx, My } };
  return { mode, M1, M2, I1: pr.I1, T, unresolved };
}
