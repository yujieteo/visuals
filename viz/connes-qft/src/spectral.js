/* Connes QFT laboratory: finite and lattice spectral triples.
 *
 * Everything here is a finite-dimensional (A, H, D): the two-point space, a lattice ring standing in
 * for the circle, its product with the two-point space, a particle/antiparticle doubled ring whose
 * inner fluctuations carry a U(1) link field (after van den Dungen & van Suijlekom's almost-commutative
 * electrodynamics, here on a lattice in the spirit of Marcolli & van Suijlekom's gauge networks), and a
 * small lattice torus for curvature. Lattice operators are labelled as stand-ins for the continuum
 * Dirac operator wherever the page shows them.
 */
(function (factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./core.js"), require("./linalg.js"));
  else factory(self.ConnesQFT, self.ConnesQFT.linalg);
})(function (Q, LA) {
  "use strict";
  const PI = Math.PI;

  /* ---------- Connes distance on a finite commutative algebra ---------- */
  /* A = ℂⁿ acting diagonally on H = ℂ^{dim}, rep[k] = the point (algebra summand) basis vector k belongs to.
     π(f) = diag(f[rep[k]]). d(i, j) = sup{|f_i − f_j| : ‖[D, π(f)]‖ ≤ 1} = 1 / inf{‖[D, π(f)]‖ : f_j − f_i = 1}. */
  const piF = (f, rep) => LA.diag(rep.map((p) => f[p]));
  const commNorm = (D, f, rep) => LA.opnorm(LA.comm(D, piF(f, rep)));
  function connesDistance(D, rep, i, j, { iterations = 400 } = {}) {
    const n = Math.max(...rep) + 1;
    const free = Q.range(n).filter((k) => k !== i && k !== j);
    const fOf = (x) => { const f = new Array(n).fill(0); f[j] = 1; free.forEach((k, t) => { f[k] = x[t]; }); return f; };
    const obj = (x) => commNorm(D, fOf(x), rep);
    let best = { x: free.map(() => 0.5), v: obj(free.map(() => 0.5)) };
    const trace = [{ step: 0, norm: best.v, distanceLowerBound: best.v > 0 ? 1 / best.v : Infinity }];
    if (free.length) {
      // Nelder–Mead from a few starts; the objective is convex, so restarts only guard against stalls.
      for (const start of [0.5, 0, 1].map((s) => free.map(() => s))) {
        const r = nelderMead(obj, start, { iterations, scale: 0.4 });
        if (r.v < best.v) best = r;
        trace.push({ step: trace.length, norm: best.v, distanceLowerBound: 1 / best.v });
      }
    }
    if (best.v <= 1e-14) return { distance: Infinity, f: fOf(best.x), trace };
    // The optimal f, rescaled so ‖[D, f]‖ = 1, attains the supremum.
    const f = fOf(best.x).map((v) => v / best.v);
    return { distance: 1 / best.v, f, trace };
  }
  function nelderMead(f, x0, { iterations = 300, scale = 0.5 } = {}) {
    const n = x0.length;
    let pts = [x0.slice(), ...x0.map((_, i) => x0.map((v, k) => (k === i ? v + scale : v)))].map((x) => ({ x, v: f(x) }));
    for (let it = 0; it < iterations; it++) {
      pts.sort((a, b) => a.v - b.v);
      const c = Q.range(n).map((k) => Q.sum(pts.slice(0, n).map((p) => p.x[k])) / n);
      const w = pts[n];
      const at = (t) => { const x = c.map((ck, k) => ck + t * (w.x[k] - ck)); return { x, v: f(x) }; };
      const r = at(-1);
      if (r.v < pts[0].v) { const e = at(-2); pts[n] = e.v < r.v ? e : r; }
      else if (r.v < pts[n - 1].v) pts[n] = r;
      else { const k = at(r.v < w.v ? -0.5 : 0.5); if (k.v < Math.min(r.v, w.v)) pts[n] = k; else pts = pts.map((p, i) => (i === 0 ? p : { x: p.x.map((v, q) => pts[0].x[q] + 0.5 * (v - pts[0].x[q])), v: f(p.x.map((v, q) => pts[0].x[q] + 0.5 * (v - pts[0].x[q]))) })); }
      if (Math.abs(pts[n].v - pts[0].v) < 1e-13) break;
    }
    pts.sort((a, b) => a.v - b.v);
    return pts[0];
  }

  /* ---------- the two-point space ---------- */
  /* A_F = ℂ ⊕ ℂ on H_F = ℂ², D_F = [[0, m], [m̄, 0]]: d(L, R) = 1/|m|. */
  function twoPoint(m) {
    const mm = Array.isArray(m) ? m : [m, 0];
    const D = LA.from([[0, mm], [[mm[0], -mm[1]], 0]]);
    const rep = [0, 1];
    const numeric = connesDistance(D, rep, 0, 1);
    const absm = Math.hypot(mm[0], mm[1]);
    return { D, rep, distance: numeric.distance, exact: absm > 0 ? 1 / absm : Infinity, f: numeric.f, spectrum: LA.eigvalsh(D) };
  }
  /* The rising supremum: f = (0, s) has ‖[D, f]‖ = |m| s; the constraint allows s ≤ 1/|m|. */
  const twoPointCandidates = (absm, n = 12) => Q.range(n + 1).map((k) => { const s = (k / n) * (1.25 / absm); return { s, norm: absm * s, allowed: absm * s <= 1 + 1e-12 }; });

  /* ---------- the circle and its lattice stand-in ---------- */
  /* Geodesic distance on the circle of circumference 2π. */
  const circleDistance = (a, b) => { const d = Math.abs(((a - b) % (2 * PI) + 2 * PI) % (2 * PI)); return Math.min(d, 2 * PI - d); };
  /* Candidates for the sup: f_λ(z) = min(d(x, z), λ) are 1-Lipschitz, so ‖[D, f_λ]‖ = sup|f′| ≤ 1
     (for D = −i d/dθ, [D, f] = −i f′); |f_λ(x) − f_λ(y)| = min(d(x, y), λ) rises to the geodesic distance. */
  function circleCandidates(x, y, steps = 10) {
    const d = circleDistance(x, y);
    return Q.range(steps + 1).map((k) => {
      const lam = (d * k) / steps;
      const f = (z) => Math.min(circleDistance(x, z), lam);
      const grid = Q.linspace(0, 2 * PI, 721);
      let lip = 0;
      for (let i = 1; i < grid.length; i++) lip = Math.max(lip, Math.abs(f(grid[i]) - f(grid[i - 1])) / (grid[i] - grid[i - 1]));
      return { lambda: lam, value: Math.abs(f(x) - f(y)), lipschitz: lip };
    });
  }
  /* Ring of N sites (spacing h = 2π/N), symmetric difference D = −i(T − T⁻¹)/(2h): a lattice stand-in for −i d/dθ. */
  function ringDirac(N) {
    const h = (2 * PI) / N, D = LA.zeros(N);
    for (let x = 0; x < N; x++) { LA.set(D, x, (x + 1) % N, [0, -1 / (2 * h)]); LA.set(D, (x + 1) % N, x, [0, 1 / (2 * h)]); }
    return D;
  }
  /* [D, f] on the ring, its operator norm and sup|f′| for comparison: the commutator sees the derivative. */
  function ringCommutator(N, f) {
    const D = ringDirac(N), fs = Q.range(N).map((x) => f((2 * PI * x) / N));
    const Cm = LA.comm(D, LA.diag(fs));
    const h = (2 * PI) / N;
    let supDer = 0;
    for (let x = 0; x < N; x++) supDer = Math.max(supDer, Math.abs(fs[(x + 1) % N] - fs[x]) / h);
    return { commutator: Cm, norm: LA.opnorm(Cm), supDerivative: supDer, values: fs };
  }
  /* Weyl's law in one dimension: #{n : |n| ≤ Λ} ≈ (ℓ/π) Λ recovers the length ℓ = 2π of the circle from the spectrum ℤ of −i d/dθ. */
  function weylLength(Lambda) { const count = 2 * Math.floor(Lambda) + 1; return { count, length: (PI * count) / Lambda }; }

  /* ---------- product geometry M × F ---------- */
  /* Even lattice triple for M: H_M = ℂ^{2N}, D_M = [[0, T], [T*, 0]], γ_M = diag(1, −1), T the forward difference on the ring.
     Product: D = D_M ⊗ 1 + γ_M ⊗ D_F. Because the two terms anticommute, D² = D_M² ⊗ 1 + 1 ⊗ D_F², so the spectrum is ±√(μ_k² + |m|²). */
  function productGeometry(N, m) {
    const h = (2 * PI) / N, T = LA.zeros(N);
    for (let x = 0; x < N; x++) { LA.set(T, x, (x + 1) % N, 1 / h); LA.set(T, x, x, -1 / h); }
    const Z = LA.zeros(N);
    const DM = blocks([[Z, T], [LA.adj(T), Z]]);
    const gM = LA.diag([...new Array(N).fill(1), ...new Array(N).fill(-1)]);
    const DF = twoPoint(m).D;
    const D = LA.add(LA.kron(DM, LA.eye(2)), LA.kron(gM, DF));
    const spec = LA.eigvalsh(D);
    const mus = Q.range(N).map((k) => (2 / h) * Math.abs(Math.sin((PI * k) / N)));
    const predicted = mus.flatMap((u) => { const v = Math.sqrt(u * u + m * m); return [v, v, -v, -v]; }).sort((a, b) => a - b);
    return { D, spectrum: spec, predicted, mus };
  }
  function blocks(rows) {
    const n = Q.sum(rows.map((r) => r[0].n)), m = Q.sum(rows[0].map((b) => b.m)), R = LA.zeros(n, m);
    let r0 = 0;
    for (const row of rows) { let c0 = 0; for (const B of row) { for (let i = 0; i < B.n; i++) for (let j = 0; j < B.m; j++) LA.set(R, r0 + i, c0 + j, LA.get(B, i, j)); c0 += B.m; } r0 += row[0].n; }
    return R;
  }
  /* Distance between (x, L) and (y, R) on M × F for constant m: √(d_M(x, y)² + |m|⁻²)
     (Martinetti & Wulkenhaar, J. Math. Phys. 43, 182 (2002); a literature formula, not computed here). */
  const productDistance = (dM, absm) => Math.sqrt(dM * dM + 1 / (absm * absm));

  /* ---------- inner fluctuations ---------- */
  /* Two-point space: the self-adjoint one-form A = a[D, b] + (a[D, b])* for a = (a₁, a₂), b = (b₁, b₂) ∈ ℂ ⊕ ℂ. */
  function twoPointFluctuation(m, a, b) {
    const D = twoPoint(m).D;
    const A0 = LA.mul(LA.diag(a), LA.comm(D, LA.diag(b)));
    const A = LA.add(A0, LA.adj(A0));
    const DA = LA.add(D, A);
    const mm = LA.get(DA, 0, 1);
    return { D, A, DA, newM: mm, distance: Math.hypot(mm[0], mm[1]) > 0 ? 1 / Math.hypot(mm[0], mm[1]) : Infinity, spectrum: LA.eigvalsh(DA), scalarField: LA.C.sub(LA.C.div(mm, Array.isArray(m) ? m : [m, 0]), [1, 0]) };
  }
  /* Ring hopping operator H₀ (t on each link, periodic): a lattice stand-in for the Dirac operator's kinetic term. */
  function ringHopping(N, t = 1, phases = null) {
    const H = LA.zeros(N);
    for (let x = 0; x < N; x++) { const th = phases ? phases[x] : 0; LA.set(H, x, (x + 1) % N, [t * Math.cos(th), t * Math.sin(th)]); LA.set(H, (x + 1) % N, x, [t * Math.cos(th), -t * Math.sin(th)]); }
    return H;
  }
  /* A one-form on the ring realizing link values c_x: A = ∑ c_x e_x[H₀, e_{x+1}] + c̄_x e_{x+1}[H₀, e_x]
     (e_k the projection onto site k), so (H₀ + A)_{x,x+1} = t(1 + c_x). Returns the terms a_i[D, b_i] too. */
  function ringOneForm(N, t, c) {
    const H0 = ringHopping(N, t), e = (k) => LA.diag(Q.range(N).map((x) => (x === k ? 1 : 0)));
    let A = LA.zeros(N);
    const terms = [];
    for (let x = 0; x < N; x++) {
      const y = (x + 1) % N;
      const T1 = LA.mul(LA.scale(e(x), c[x]), LA.comm(H0, e(y)));
      const T2 = LA.mul(LA.scale(e(y), LA.C.conj(c[x])), LA.comm(H0, e(x)));
      A = LA.add(A, LA.add(T1, T2));
      terms.push({ link: x, a: [x, c[x]], b: y });
    }
    return { A, terms };
  }
  /* The doubled ring: H = ℂᴺ ⊗ (particle ⊕ antiparticle), π(a, b) = diag(a, b), D = H₀ ⊕ H₀, J(ξ, η) = (η̄, ξ̄).
     A link phase field θ_x enters as the one-form with c_x = e^{iθ_x} − 1 on the particle copy;
     D_A = D + A + JAJ⁻¹ = (H₀ + A₁ + Ā₂) ⊕ (H₀ + A₂ + Ā₁): the antiparticle copy sees the opposite phase. */
  function doubledRingFluctuation(N, t, theta) {
    const c = theta.map((th) => [Math.cos(th) - 1, Math.sin(th)]);
    const { A: A1, terms } = ringOneForm(N, t, c);
    const A2 = LA.zeros(N);
    const H0 = ringHopping(N, t);
    const Z = LA.zeros(N);
    const D = blocks([[H0, Z], [Z, H0]]);
    const A = blocks([[A1, Z], [Z, A2]]);
    const JAJ = blocks([[LA.conj(A2), Z], [Z, LA.conj(A1)]]); // J A J⁻¹ = diag(Ā₂, Ā₁)
    const DA = LA.add(D, LA.add(A, JAJ));
    const linkPhase = (blk) => Q.range(N).map((x) => { const v = LA.get(DA, blk * N + x, blk * N + ((x + 1) % N)); return Math.atan2(v[1], v[0]); });
    const flux = (ph) => { const s = Q.sum(ph); return Math.atan2(Math.sin(s), Math.cos(s)); };
    const pPh = linkPhase(0), aPh = linkPhase(1);
    // Single copy with J = complex conjugation: A + JAJ⁻¹ = A₁ + Ā₁ is real, so the phase cancels.
    const single = LA.add(H0, LA.add(A1, LA.conj(A1)));
    const singlePhase = Q.range(N).map((x) => { const v = LA.get(single, x, (x + 1) % N); return Math.atan2(v[1], v[0]); });
    return { D, A, JAJ, DA, terms, particlePhases: pPh, antiparticlePhases: aPh, particleFlux: flux(pPh), antiparticleFlux: flux(aPh), spectrum: LA.eigvalsh(DA), singleCopyPhases: singlePhase };
  }
  /* Spectrum of the ring with link phases: 2t cos((2πk + Φ)/N), Φ = ∑θ_x (gauge invariant). */
  const ringSpectrumExact = (N, t, flux) => Q.range(N).map((k) => 2 * t * Math.cos((2 * PI * k + flux) / N)).sort((a, b) => a - b);
  /* A gauge transformation u = e^{iχ(x)} acts by D_A ↦ U D_A U*, U = u J u J⁻¹ = diag(u, ū): links pick up χ(x) − χ(x+1), the flux does not change. */
  function gaugeTransformRing(DA, N, chi) {
    const u = chi.map((c) => [Math.cos(c), Math.sin(c)]);
    const U = LA.diag([...u, ...u.map(LA.C.conj)]);
    return LA.mul(LA.mul(U, DA), LA.adj(U));
  }
  /* Small lattice torus (N×N) with link phases from a vector potential: θ_x(i, j) and θ_y(i, j).
     Curvature = plaquette sum F(i, j) = θ_x(i,j) + θ_y(i+1,j) − θ_x(i,j+1) − θ_y(i,j) (mod 2π). */
  function torusFluctuation(N, thx, thy, t = 1) {
    const idx = (i, j) => ((i + N) % N) * N + ((j + N) % N);
    const H = LA.zeros(N * N);
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const a = idx(i, j), bx = idx(i + 1, j), by = idx(i, j + 1);
      LA.set(H, a, bx, LA.C.polar(t, thx[i][j])); LA.set(H, bx, a, LA.C.polar(t, -thx[i][j]));
      LA.set(H, a, by, LA.C.polar(t, thy[i][j])); LA.set(H, by, a, LA.C.polar(t, -thy[i][j]));
    }
    const F = Q.range(N).map((i) => Q.range(N).map((j) => { const s = thx[i][j] + thy[(i + 1) % N][j] - thx[i][(j + 1) % N] - thy[i][j]; return Math.atan2(Math.sin(s), Math.cos(s)); }));
    return { H, F, spectrum: LA.eigvalsh(H) };
  }
  /* Uniform field with n flux quanta through the N×N torus in Landau gauge (consistent on the torus). */
  function landauGauge(N, n) {
    const B = (2 * PI * n) / (N * N);
    const thx = Q.range(N).map(() => new Array(N).fill(0));
    const thy = Q.range(N).map((i) => new Array(N).fill(B * i));
    // close the x-links at the seam so every plaquette, including the seam, carries B
    for (let j = 0; j < N; j++) thx[N - 1][j] = -B * N * j;
    return { thx, thy, B };
  }

  /* ---------- spectral action ---------- */
  const CUTOFFS = {
    sharp: { name: "sharp cutoff χ(|x| ≤ 1)", f: (x) => (Math.abs(x) <= 1 ? 1 : 0) },
    gauss: { name: "Gaussian e^{−x²}", f: (x) => Math.exp(-x * x) },
    smooth: { name: "smooth bump (1 − x²)² on |x| < 1", f: (x) => (Math.abs(x) < 1 ? (1 - x * x) ** 2 : 0) },
  };
  /* Tr f(D/Λ) = ∑ f(λ_i/Λ) with each eigenvalue's weight and the running sum. */
  function spectralAction(eigs, Lambda, kind = "gauss") {
    const f = CUTOFFS[kind].f;
    let acc = 0;
    const rows = eigs.slice().sort((a, b) => Math.abs(a) - Math.abs(b)).map((l) => { const w = f(l / Lambda); acc += w; return { lambda: l, weight: w, cumulative: acc }; });
    return { total: acc, rows };
  }
  /* Circle with flux a (D = −i d/dθ + a, eigenvalues n + a): Gaussian spectral action ∑ e^{−((n+a)/Λ)²} and its
     Poisson-summed form √π Λ ∑_k e^{−π²k²Λ²} cos(2πka); the leading √π Λ is the heat-kernel a₀ term. */
  function circleSpectralAction(Lambda, a = 0, nmax = 400) {
    let direct = 0;
    for (let n = -nmax; n <= nmax; n++) direct += Math.exp(-(((n + a) / Lambda) ** 2));
    let poisson = 0;
    for (let k = -30; k <= 30; k++) poisson += Math.exp(-PI * PI * k * k * Lambda * Lambda) * Math.cos(2 * PI * k * a);
    poisson *= Math.sqrt(PI) * Lambda;
    return { direct, poisson, leading: Math.sqrt(PI) * Lambda };
  }
  /* Moments f_k = ∫₀^∞ f(v) v^{k−1} dv used in Tr f(D/Λ) ~ 2Λ⁴f₄a₀ + 2Λ²f₂a₂ + f₀a₄ (Chamseddine & Connes 1997, d = 4). */
  function cutoffMoments(kind) {
    const f = CUTOFFS[kind].f;
    const upper = kind === "gauss" ? 8 : 1;
    return { f0: f(0), f2: Q.integrate((v) => f(v) * v, 0, upper, { order: 24, panels: 8 }), f4: Q.integrate((v) => f(v) * v ** 3, 0, upper, { order: 24, panels: 8 }) };
  }

  /* ---------- spectral flow ---------- */
  /* Track the eigenvalues of a Hermitian family D(s) on a grid and count net zero crossings (upward minus downward). */
  function spectralFlow(family, s0, s1, steps = 200) {
    const grid = Q.linspace(s0, s1, steps + 1);
    const spectra = grid.map((s) => family(s));
    let up = 0, down = 0;
    const crossings = [];
    for (let k = 1; k < spectra.length; k++) {
      const a = spectra[k - 1], b = spectra[k];
      const negA = a.filter((x) => x < 0).length, negB = b.filter((x) => x < 0).length;
      if (negB < negA) { up += negA - negB; crossings.push({ s: grid[k], dir: +1, count: negA - negB }); }
      if (negB > negA) { down += negB - negA; crossings.push({ s: grid[k], dir: -1, count: negB - negA }); }
    }
    return { grid, spectra, up, down, flow: up - down, crossings };
  }
  /* D(s) = −i d/dθ + s on the circle, truncated to modes |n| ≤ nmax: eigenvalues n + s. */
  const circleFamily = (nmax = 4) => (s) => Q.range(2 * nmax + 1).map((i) => i - nmax + s).sort((a, b) => a - b);

  const api = {
    piF, commNorm, connesDistance, nelderMead, twoPoint, twoPointCandidates, circleDistance, circleCandidates, ringDirac, ringCommutator, weylLength,
    productGeometry, blocks, productDistance, twoPointFluctuation, ringHopping, ringOneForm, doubledRingFluctuation, ringSpectrumExact, gaugeTransformRing,
    torusFluctuation, landauGauge, CUTOFFS, spectralAction, circleSpectralAction, cutoffMoments, spectralFlow, circleFamily,
  };
  Q.spectral = api;
  return api;
});
