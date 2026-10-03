/* Centroids and section properties (spec 5.1).
 *
 * Three centroids are always kept separate: shear Cs (weight ks, the
 * headline CG, used for torsion and J), axial Ca (weight ka, used for
 * out-of-plane bending, Ixx, Iyy, Ixy) and area Cg (weight A, geometric
 * reference). Section properties are in length² × weight.
 */

const RAD = 180 / Math.PI;

export function extentOf(points) {
  if (!points.length) return 0;
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
}

export function weightedCentroid(fasteners, weightKey) {
  let w = 0, wx = 0, wy = 0;
  for (const f of fasteners) {
    const k = f[weightKey];
    w += k; wx += k * f.x; wy += k * f.y;
  }
  return { x: wx / w, y: wy / w, weight: weightKey, sum: w };
}

/* Coincidence tolerance: 1e-9 × pattern extent (1e-9 when the extent is zero). */
export function coincidenceTolerance(extent) {
  return 1e-9 * (extent > 0 ? extent : 1);
}

export function principal(Ixx, Iyy, Ixy) {
  const mean = (Ixx + Iyy) / 2;
  const radius = Math.hypot((Ixx - Iyy) / 2, Ixy);
  let thetaRad = 0.5 * Math.atan2(-2 * Ixy, Ixx - Iyy);
  if (thetaRad <= -Math.PI / 2 + 1e-15) thetaRad += Math.PI; // report (−90°, 90°]; the axis is the same line
  return { I1: mean + radius, I2: mean - radius, thetaRad, thetaDeg: thetaRad * RAD };
}

/* `fasteners` are resolved (x, y, area, ks, ka all numeric and positive). */
export function sectionProperties(fasteners) {
  const extent = extentOf(fasteners);
  const tol = coincidenceTolerance(extent);
  const Cs = weightedCentroid(fasteners, "ks");
  const Ca = weightedCentroid(fasteners, "ka");
  const Cg = weightedCentroid(fasteners, "area");
  let J = 0, Ixx = 0, Iyy = 0, Ixy = 0;
  const per = fasteners.map((f) => {
    const u = f.x - Cs.x, v = f.y - Cs.y, p = f.x - Ca.x, q = f.y - Ca.y;
    J += f.ks * (u * u + v * v);
    Ixx += f.ka * q * q;
    Iyy += f.ka * p * p;
    Ixy += f.ka * p * q;
    return { id: f.id, u, v, p, q };
  });
  const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < tol;
  const centroids = [
    { key: "Cs", name: "Shear centroid", weight: "ks", usedFor: "Torsion, J", x: Cs.x, y: Cs.y },
    { key: "Ca", name: "Axial centroid", weight: "ka", usedFor: "Out-of-plane bending, Ixx, Iyy, Ixy", x: Ca.x, y: Ca.y },
    { key: "Cg", name: "Area centroid", weight: "A", usedFor: "Geometric reference", x: Cg.x, y: Cg.y },
  ];
  for (const c of centroids) {
    c.coincidentWith = centroids.filter((o) => o !== c && near(o, c)).map((o) => o.key);
  }
  return {
    extent, tol, centroids, Cs, Ca, Cg,
    Ks: Cs.sum, Ka: Ca.sum, J, Ixx, Iyy, Ixy,
    D: Ixx * Iyy - Ixy * Ixy,
    principal: principal(Ixx, Iyy, Ixy),
    per,
  };
}
