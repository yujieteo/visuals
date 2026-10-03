/* Static reduction of the applied load to a point on the faying surface (spec 5.2).
 *
 * The load (Fx, Fy, Fz, Mx, My, Mz) acts at P = (xp, yp, zp). Moving it to
 * Q = (xq, yq, 0) adds r × F with r = P − Q:
 *   Mx,Q = Mx + ry·Fz − zp·Fy
 *   My,Q = My + zp·Fx − rx·Fz
 *   Mz,Q = Mz + rx·Fy − ry·Fx
 */

export function transferMoments(load, q) {
  const { point: P, Fx, Fy, Fz, Mx, My, Mz } = load;
  const rx = P.x - q.x, ry = P.y - q.y, zp = P.z;
  return {
    Q: { x: q.x, y: q.y },
    rx, ry, zp,
    Mx: Mx + ry * Fz - zp * Fy,
    My: My + zp * Fx - rx * Fz,
    Mz: Mz + rx * Fy - ry * Fx,
  };
}

/* In-plane shear and torsion reduce to Cs; axial load and bending to Ca. */
export function reduceLoad(load, Cs, Ca) {
  const s = transferMoments(load, Cs);
  const a = transferMoments(load, Ca);
  return {
    Fx: load.Fx, Fy: load.Fy, Fz: load.Fz,
    shear: { Q: s.Q, rx: s.rx, ry: s.ry, zp: s.zp, Mz: s.Mz },
    axial: { Q: a.Q, rx: a.rx, ry: a.ry, zp: a.zp, Mx: a.Mx, My: a.My },
  };
}
