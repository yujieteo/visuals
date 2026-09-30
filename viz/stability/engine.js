/* STABILITY engine: structural stability visualiser (exploration only).
 *
 * Four analyses share one material model and one column-strength function:
 *   column        Euler, Johnson and an optional tangent-modulus curve
 *   beamColumn    second-order (secant-type) first-yield load by a bracketed
 *                 Newton root finder, cross-checked by a small beam FE
 *                 eigenvalue solve for Pcr
 *   shear         flat-plate shear buckling, simply supported or clamped
 *                 edges, with the NACA TN 3781 plasticity-reduction factor
 *   diagonal      NACA TN 2661 incomplete diagonal tension on plane webs,
 *                 with pure Wagner diagonal tension (TN 469) as the k = 1 limit
 *
 * Every relation carries a source tag (SOURCES): "NASA" where a NASA/NACA
 * report states it, "classical" where none was found, and "fit" for a closed
 * form fitted to a report figure, whose digitised points and fit error are in
 * FIGURE_FITS. A relation whose chart data was not sourced returns
 * { unavailable: "..." } instead of a number. Nothing is guessed.
 *
 * Units are canonical SI in N, mm and MPa (N/mm²) everywhere in this file;
 * strains and coefficients are dimensionless. Conversion to US units happens
 * only at the input/output boundary (toDisplay / fromDisplay).
 *
 * Everything here is a pure function of its arguments: no DOM, no clock, no
 * randomness. The page and the Node tests call the same code.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Stability = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const PI = Math.PI;
  const SCHEMA_VERSION = 1;
  const DISCLAIMER = "Not for certification. Exploration and preliminary sizing only: no design allowables, no knockdown factors, illustrative material presets. Check every result independently.";

  /* ---------- Units ---------- */

  // Size of one display unit in canonical units (N, mm, MPa).
  const IN = 25.4, LBF = 4.4482216152605, KSI = 6.89475729316836;
  const QUANTITIES = {
    length: { SI: ["mm", 1], US: ["in", IN] },
    area: { SI: ["mm²", 1], US: ["in²", IN * IN] },
    inertia: { SI: ["mm⁴", 1], US: ["in⁴", IN ** 4] },
    force: { SI: ["N", 1], US: ["lbf", LBF] },
    stress: { SI: ["MPa", 1], US: ["ksi", KSI] },
    lineLoad: { SI: ["N/mm", 1], US: ["lbf/in", LBF / IN] },
    moment: { SI: ["N·mm", 1], US: ["lbf·in", LBF * IN] },
    rotSpring: { SI: ["N·mm/rad", 1], US: ["lbf·in/rad", LBF * IN] },
    transSpring: { SI: ["N/mm", 1], US: ["lbf/in", LBF / IN] },
    none: { SI: ["", 1], US: ["", 1] },
  };
  const unitLabel = (q, system) => QUANTITIES[q][system][0];
  const toDisplay = (value, q, system) => value / QUANTITIES[q][system][1];
  const fromDisplay = (value, q, system) => value * QUANTITIES[q][system][1];

  /* ---------- Sources ---------- */

  const TN2661 = "NACA TN 2661 (Kuhn, Peterson and Levin, 1952), NTRS 19930083335";
  const TN3781 = "NACA TN 3781 (Gerard and Becker, 1957), NTRS 19930084505";
  const TN469 = "NACA TN 469 (Kuhn, 1933), NTRS 19930081248";
  // kind: "NASA" | "classical" | "fit". Every formula panel and export lists these.
  const SOURCES = {
    ro: { kind: "classical", text: "Ramberg-Osgood curve with the 0.2 % offset yield: ε = σ/E + 0.002 (σ/Fcy)^n" },
    euler: { kind: "classical", text: "Euler: σcr = π²E / (KL/r)²" },
    johnson: { kind: "classical", text: "Johnson parabola: σcr = Fcy [1 − Fcy (KL/r)² / (4π²E)]; transition (KL/r)c = π √(2E/Fcy)" },
    tangent: { kind: "classical", text: "Tangent modulus (Engesser-Shanley): σcr = π²Et(σcr) / (KL/r)², Et from the Ramberg-Osgood curve" },
    secant: { kind: "classical", text: "Second-order pin-ended beam-column of length KL (secant form σmax = P/A [1 + (e c / r²) sec((KL/2r) √(P/EA))], extended by superposition to unequal end moments, uniform lateral load and a sinusoidal initial bow); first yield σmax = P/A + Mmax/S = Fcy" },
    fe: { kind: "classical", text: "Euler-Bernoulli beam finite elements with consistent geometric stiffness; (Ke − P Kg) φ = 0 solved by Cholesky reduction and a cyclic Jacobi eigen routine" },
    ks: { kind: "classical", text: "Shear-buckling coefficient, long side a, short side b: simply supported ks = 5.34 + 4.00 (b/a)², clamped ks = 8.98 + 5.60 (b/a)² (Timoshenko and Gere, Theory of Elastic Stability, 2nd ed., 1961, §9.7; exact values tabulated there). τcr,e = ks π²E / (12(1 − ν²)) (t/b)²" },
    shearPlast: { kind: "NASA", text: `Shear plasticity: τcr = η τcr,e with η = (Es/E)(1 − νe²)/(1 − ν²), eq. (A5) and fig. 10; ν = 0.5 − (0.5 − νe)(Es/E), eq. (A1); Es, Et at the axial stress σ = 2τ (maximum-shear law, fig. 10 axes). Option: table 2 "rectangular plate, all edges elastically restrained" η = (Es/E)(1 − νe²)/(1 − ν²) [0.83 + 0.17 Et/Es]. ${TN3781}, appendix A and table 2` },
    wagner: { kind: "NASA", text: `Pure diagonal tension (k = 1): web σ = 2τ / sin 2α, upright σU = −τ (d t / AUe) tan α, flange σF = −τ (h t / 2AF) cot α, angle tan⁴α = (1 + h t / 2AF) / (1 + d t / AUe). ${TN2661}, section 2.2, eqs. (11) to (15); ${TN469}, pp. 4-5 (α = 45°: web 2τ, strut force P d/h)` },
    aue: { kind: "NASA", text: `Effective upright area: double AUe = AU; single AUe = AU / (1 + (e/ρ)²). ${TN2661}, section 4.1 and eq. (22)` },
    tcr32: { kind: "NASA", text: `Web buckling: τcr,elastic = kss E (t/dc)² [Rh + ½ (Rd − Rh)(dc/hc)³] for dc < hc (roles swap for dc > hc). ${TN2661}, section 4.2, eq. (32); R = 1 simply supported, R = 1.62 clamped (section 3.6)` },
    tcrPlast: { kind: "NASA", text: `Web plasticity: the TN 3781 eq. (A5) factor on the shared Ramberg-Osgood curve replaces TN 2661 fig. 12(c), which is drawn only for 24S-T3 and 75S-T6. ${TN3781}` },
    k27: { kind: "NASA", text: `Diagonal-tension factor k = tanh(0.5 log₁₀(τ/τcr)) for τ > τcr, else 0. ${TN2661}, section 3.2, eq. (27)` },
    idt: { kind: "NASA", text: `Incomplete diagonal tension: σU = −kτ tan α / (AUe/(d t) + 0.5(1 − k)) (30a); σF = −kτ cot α / (2AF/(h t) + 0.5(1 − k)) (30b); tan²α = (ε − εF)/(ε − εU) (30c); ε = (τ/E)[2k/sin 2α + (1 − k)(1 + ν) sin 2α] (30d), solved by successive approximation (section 3.2). Web principal stresses σ1, σ2 (28a, 28b). ${TN2661}` },
    c1: { kind: "NASA", text: `Angle factor C1 = 1/sin 2α − 1. ${TN2661}, section 3.7 (fig. 17)` },
    tmax: { kind: "NASA", text: `Peak web stress τ'max = τ (1 + k²C1)(1 + kC2). ${TN2661}, section 4.7, eq. (33a); ωd = 0.7 d [t / ((IC + IT) he)]^¼, eq. (19a) and fig. 18` },
    le35: { kind: "NASA", text: `Upright effective length Le = hU / √(1 + k²(3 − 2d/hU)) for d < 1.5 hU, else hU. ${TN2661}, section 4.9, eq. (35)` },
    upright: { kind: "NASA", text: `Upright column check: double uprights σU ≤ column allowable at Le/ρ (section 4.10(b)); single uprights σU ≤ column yield stress and σUav = σU AUe/AU (eq. 38) ≤ column allowable at hU/(2ρ) (section 4.11(b)). Column allowable from the shared column-strength function. ${TN2661}` },
    kssFit: { kind: "fit", text: `kss = 5.03 + 3.26 (short/long)², fitted to ${TN2661} fig. 12(a) (theoretical coefficients for plates with simply supported edges, including π²/(12(1 − ν²)))` },
    rFit: { kind: "fit", text: `Restraint coefficients R = a [1 − exp(−(x/b)^c)] fitted to ${TN2661} fig. 12(b): upper curve (double uprights, and flanges; x = tU/t or tF/t) a = 1.6522, b = 1.0666, c = 1.374; lower curve (single uprights) a = 1.2936, b = 1.1173, c = 2.2094` },
    rHold: { kind: "NASA", text: "Hold of fig. 12(b) beyond t/t = 3 at the end value, as applied in NACA TN 2661 section 7, example 1, p. 57: tU/t = 3.20 and tF/t large give Rh = Rd = 1.62" },
    smaxFit: { kind: "fit", text: `σUmax/σU = 1 + (1 − k)(0.78 − 0.65 d/hU), fitted to ${TN2661} fig. 15 (0 ≤ d/hU ≤ 1)` },
    c2Fit: { kind: "fit", text: `C2 = u²(0.09234 − 0.06227u + 0.05784u² − 0.01187u³), u = ωd − 1, C2 = 0 for ωd ≤ 1, fitted to ${TN2661} fig. 18 (0 ≤ ωd ≤ 4)` },
  };
  const source = (id) => ({ id, ...SOURCES[id] });

  /* ---------- Figure fits (closed forms fitted to NACA TN 2661 figures) ---------- */

  const FIT = {
    kss: { A: 5.03, B: 3.26, range: [1, 5] },
    rUpper: { a: 1.6522, b: 1.0666, c: 1.374, range: [0, 3], solidFrom: 0.6 },
    rLower: { a: 1.2936, b: 1.1173, c: 2.2094, range: [0, 3], solidFrom: 0.5 },
    smax: { A: 0.78, B: 0.65, range: [0, 1] },
    c2: { c: [0.09234, -0.06227, 0.05784, -0.01187], range: [0, 4] },
  };
  // Digitised figure points (300 dpi scan of the NTRS report, gridline
  // calibrated, x and y in the figure's own axes). Used to report fit error.
  let FIGURE_FITS = null;
  function setFigureData(data) { FIGURE_FITS = data || null; }

  const kssFig12a = (ratio) => FIT.kss.A + FIT.kss.B / (ratio * ratio);
  const weibull = (p, x) => p.a * (1 - Math.exp(-Math.pow(Math.max(x, 0) / p.b, p.c)));
  function restraintFig12b(x, curve) {
    const p = curve === "lower" ? FIT.rLower : FIT.rUpper;
    const notes = [];
    const held = x > p.range[1];
    if (held) notes.push(`thickness ratio ${fmt(x)} is beyond fig. 12(b) (ends at 3); held at the value at 3 (${SOURCES.rHold.text})`);
    else if (x < p.solidFrom) notes.push(`thickness ratio ${fmt(x)} is on the dashed (extrapolated) part of fig. 12(b)`);
    return { value: weibull(p, held ? p.range[1] : x), notes, held };
  }
  function smaxRatioFig15(k, dOverHu) {
    if (!(dOverHu >= FIT.smax.range[0] && dOverHu <= FIT.smax.range[1])) return { unavailable: `unavailable: chart data not sourced for d/hU = ${fmt(dOverHu)} (fig. 15 covers 0 to 1)` };
    return { value: 1 + (1 - k) * (FIT.smax.A - FIT.smax.B * dOverHu) };
  }
  function c2Fig18(wd) {
    if (!(wd >= 0)) return { unavailable: "unavailable: ωd not defined" };
    if (wd > FIT.c2.range[1]) return { unavailable: `unavailable: chart data not sourced for ωd = ${fmt(wd)} (fig. 18 ends at 4)` };
    if (wd <= 1) return { value: 0 };
    const u = wd - 1, c = FIT.c2.c;
    return { value: Math.max(0, u * u * (c[0] + u * (c[1] + u * (c[2] + u * c[3])))) };
  }
  // Fit error of each fitted relation against its digitised points.
  function fitErrors(data) {
    const d = data || FIGURE_FITS;
    if (!d) return null;
    const stat = (pairs) => {
      let maxAbs = 0, maxRel = 0;
      for (const [model, digit] of pairs) {
        const e = Math.abs(model - digit);
        maxAbs = Math.max(maxAbs, e);
        if (Math.abs(digit) > 0.2) maxRel = Math.max(maxRel, e / Math.abs(digit));
      }
      return { maxAbs, maxRel, n: pairs.length };
    };
    return {
      kss: stat(d.fig12a.points.map(([x, y]) => [kssFig12a(x), y])),
      rUpper: stat(d.fig12b.upper.map(([x, y]) => [weibull(FIT.rUpper, x), y])),
      rLower: stat(d.fig12b.lower.map(([x, y]) => [weibull(FIT.rLower, x), y])),
      smax: stat(d.fig15.points.map(([k, x, y]) => [smaxRatioFig15(k, x).value, y])),
      c2: stat(d.fig18.points.map(([x, y]) => [c2Fig18(x).value, y])),
    };
  }

  /* ---------- Material (Ramberg-Osgood) ---------- */

  const MATERIAL_PRESETS = [
    { id: "al2024t3", label: "2024-T3 sheet (illustrative)", E: 72400, Fcy: 270, nu: 0.33, n: 15 },
    { id: "al7075t6", label: "7075-T6 sheet (illustrative)", E: 71000, Fcy: 470, nu: 0.33, n: 16 },
    { id: "steel", label: "Low-alloy steel (illustrative)", E: 200000, Fcy: 520, nu: 0.29, n: 20 },
  ];

  const roStrain = (m, s) => s / m.E + 0.002 * Math.pow(Math.abs(s) / m.Fcy, m.n) * Math.sign(s);
  // Secant and tangent moduli of the Ramberg-Osgood curve at stress s ≥ 0.
  function roModuli(m, s) {
    if (s <= 0) return { Es: m.E, Et: m.E };
    const Es = s / roStrain(m, s);
    const Et = 1 / (1 / m.E + 0.002 * m.n * Math.pow(s / m.Fcy, m.n - 1) / m.Fcy);
    return { Es, Et };
  }

  /* ---------- Root finding ---------- */

  // Bracketed Newton with bisection fallback on f over [lo, hi], f(lo) and
  // f(hi) of opposite sign. The derivative is a central difference.
  function rootBracketed(f, lo, hi, opts = {}) {
    const tol = opts.tol ?? 1e-10, maxIter = opts.maxIter ?? 200;
    let flo = f(lo), fhi = f(hi);
    if (!Number.isFinite(flo) || !Number.isFinite(fhi) || flo * fhi > 0) return { converged: false, reason: "root not bracketed" };
    if (flo === 0) return { converged: true, x: lo, iterations: 0 };
    if (fhi === 0) return { converged: true, x: hi, iterations: 0 };
    let x = 0.5 * (lo + hi), bisections = 0;
    for (let i = 1; i <= maxIter; i++) {
      const fx = f(x);
      if (!Number.isFinite(fx)) return { converged: false, reason: "non-finite function value" };
      if (fx === 0 || (hi - lo) <= tol * Math.max(1, Math.abs(x))) return { converged: true, x, iterations: i, bisections };
      if (fx * flo < 0) { hi = x; fhi = fx; } else { lo = x; flo = fx; }
      const h = 1e-6 * Math.max(Math.abs(x), (hi - lo));
      const df = (f(x + h) - f(x - h)) / (2 * h);
      let next = Number.isFinite(df) && df !== 0 ? x - fx / df : NaN;
      if (!(next > lo && next < hi)) { next = 0.5 * (lo + hi); bisections++; }
      if (Math.abs(next - x) <= tol * Math.max(1, Math.abs(x))) return { converged: true, x: next, iterations: i, bisections };
      x = next;
    }
    return { converged: false, reason: `no convergence in ${maxIter} iterations` };
  }

  /* ---------- Validation ---------- */

  class InputError extends Error {
    constructor(errors) { super(errors.map((e) => e.message).join("; ")); this.errors = errors; }
  }
  function checker() {
    const errors = [];
    const num = (obj, key, label, { min = 0, strict = true, allowZero = false } = {}) => {
      const v = obj[key];
      if (v === null || v === undefined || v === "" || typeof v !== "number" || !Number.isFinite(v)) {
        errors.push({ field: key, message: `${label} is missing or not a number` });
        return NaN;
      }
      if (allowZero ? v < min : (strict ? v <= min : v < min)) errors.push({ field: key, message: `${label} must be ${allowZero || !strict ? "≥" : ">"} ${min}` });
      return v;
    };
    return { errors, num, done() { if (errors.length) throw new InputError(errors); } };
  }
  function checkMaterial(c, m) {
    c.num(m, "E", "E");
    c.num(m, "Fcy", "Fcy");
    const nu = c.num(m, "nu", "Poisson's ratio ν", { allowZero: true });
    if (nu >= 0.5) c.errors.push({ field: "nu", message: "Poisson's ratio ν must be < 0.5" });
    const n = c.num(m, "n", "Ramberg-Osgood n");
    if (n <= 1) c.errors.push({ field: "n", message: "Ramberg-Osgood n must be > 1" });
  }

  /* ---------- Sections ---------- */

  // Section properties: A, I (about the bending/buckling axis), c (extreme fibre).
  function sectionProps(s) {
    const c = checker();
    let A, I, cf;
    if (s.shape === "tube") {
      const D = c.num(s, "D", "Outer diameter D"), t = c.num(s, "t", "Wall thickness t");
      if (t * 2 > D) c.errors.push({ field: "t", message: "Wall thickness t must be ≤ D/2" });
      c.done();
      const Di = D - 2 * t;
      A = PI / 4 * (D * D - Di * Di); I = PI / 64 * (D ** 4 - Di ** 4); cf = D / 2;
    } else if (s.shape === "rect") {
      const b = c.num(s, "b", "Width b"), h = c.num(s, "h", "Depth h");
      c.done();
      const weak = s.axis !== "strong";
      const bend = weak ? Math.min(b, h) : Math.max(b, h), other = weak ? Math.max(b, h) : Math.min(b, h);
      A = b * h; I = other * bend ** 3 / 12; cf = bend / 2;
    } else {
      A = c.num(s, "A", "Area A"); I = c.num(s, "I", "Second moment I"); cf = c.num(s, "c", "Extreme-fibre distance c");
      c.done();
    }
    const r = Math.sqrt(I / A);
    return { A, I, c: cf, r, S: I / cf };
  }

  /* ---------- Shared column strength ---------- */

  // One function serves the Column tab, the beam-column cross-check and the
  // diagonal-tension upright check. lambda = KL/r (effective slenderness).
  function columnStrength(m, lambda, opts = {}) {
    const lambdaC = PI * Math.sqrt(2 * m.E / m.Fcy);
    const euler = lambda > 0 ? PI * PI * m.E / (lambda * lambda) : Infinity;
    const johnson = m.Fcy * (1 - m.Fcy * lambda * lambda / (4 * PI * PI * m.E));
    const regime = lambda < lambdaC ? "Johnson" : "Euler";
    const sigmaCr = regime === "Johnson" ? johnson : euler;
    const out = { lambda, lambdaC, euler, johnson, regime, sigmaCr, tangent: null };
    if (opts.tangent) out.tangent = tangentModulusStress(m, lambda);
    return out;
  }
  function tangentModulusStress(m, lambda) {
    if (!(lambda > 0)) return { unavailable: "tangent modulus: KL/r must be > 0" };
    const cap = 3 * m.Fcy;
    const g = (s) => s - PI * PI * roModuli(m, s).Et / (lambda * lambda);
    if (g(cap) < 0) return { unavailable: "tangent-modulus stress above 3 Fcy, beyond the Ramberg-Osgood fit" };
    const r = rootBracketed(g, 1e-9 * m.Fcy, cap);
    return r.converged ? { value: r.x } : { unavailable: `tangent modulus: ${r.reason}` };
  }

  /* ---------- Column tab ---------- */

  const K_PRESETS = [
    { id: "pp", label: "Pinned-pinned", K: 1.0 },
    { id: "fp", label: "Fixed-pinned", K: 0.7 },
    { id: "ff", label: "Fixed-fixed", K: 0.5 },
    { id: "fr", label: "Fixed-free", K: 2.0 },
  ];

  function solveColumn(inp) {
    const c = checker();
    checkMaterial(c, inp.material);
    const L = c.num(inp, "L", "Length L"), K = c.num(inp, "K", "Effective-length factor K"), P = c.num(inp, "P", "Applied load P");
    c.done();
    const m = inp.material, sec = sectionProps(inp.section);
    const lambda = K * L / sec.r;
    const cs = columnStrength(m, lambda, { tangent: !!inp.tangent });
    const Pcr = cs.sigmaCr * sec.A;
    const warnings = [];
    if (lambda > 200) warnings.push(`Extreme slenderness: KL/r = ${fmt(lambda)} > 200`);
    if (lambda < 10) warnings.push(`Very stocky: KL/r = ${fmt(lambda)} < 10; local crippling (not modelled) may govern`);
    if (P / sec.A > m.Fcy) warnings.push(`Applied stress P/A = ${fmt(P / sec.A)} MPa is above Fcy`);
    if (cs.tangent && cs.tangent.unavailable) warnings.push(cs.tangent.unavailable);
    return {
      section: sec, lambda, lambdaC: cs.lambdaC, regime: cs.regime, sigmaEuler: cs.euler, sigmaJohnson: cs.johnson,
      sigmaCr: cs.sigmaCr, Pcr, sigmaApplied: P / sec.A, MS: Pcr / P - 1,
      sigmaTangent: cs.tangent ? (cs.tangent.value ?? null) : null,
      warnings, sources: ["euler", "johnson", "ro", ...(inp.tangent ? ["tangent"] : [])].map(source),
    };
  }
  function columnCurve(m, lambdaMax, n = 120, tangent = false) {
    const pts = [];
    for (let i = 1; i <= n; i++) {
      const l = lambdaMax * i / n, cs = columnStrength(m, l, { tangent });
      pts.push({ lambda: l, euler: cs.euler, johnson: cs.johnson, sigmaCr: cs.sigmaCr, tangent: cs.tangent ? cs.tangent.value ?? null : null });
    }
    return pts;
  }

  /* ---------- Beam-column (second order) ---------- */

  // Pin-ended member of length l under compression P with end moments MA, MB
  // (sagging positive), uniform lateral load w and a sinusoidal initial bow d0.
  // Exact elastic second-order moment and deflection by superposition, valid
  // for 0 ≤ P < Pe = π²EI/l².
  function beamColumnState(cfg, P, x) {
    const { l, EI, MA, MB, w, d0 } = cfg;
    const Pe = PI * PI * EI / (l * l);
    // First-order moment and deflection (no amplification); the bow is geometry.
    const M0 = MA + (MB - MA) * x / l + w * x * (l - x) / 2;
    const yLin = x * (l - x) / (6 * EI * l) * (MA * (2 * l - x) + MB * (l + x)) + w * x * (l ** 3 - 2 * l * x * x + x ** 3) / (24 * EI);
    const bow = d0 * Math.sin(PI * x / l);
    if (P <= 1e-12 * Pe) return { M: M0, Mlin: M0, y: yLin + bow, yLin: yLin + bow };
    const k = Math.sqrt(P / EI), kl = k * l;
    // Straight member: M from the beam-column equation, and P·y = M − M0.
    const Mlat = (MA * Math.sin(k * (l - x)) + MB * Math.sin(k * x)) / Math.sin(kl)
      + w / (k * k) * (Math.cos(k * (x - l / 2)) / Math.cos(kl / 2) - 1);
    // Bow: total deflection d0 sin(πx/l) / (1 − P/Pe), moment P times it.
    const yBow = bow / (1 - P / Pe);
    return { M: Mlat + P * yBow, Mlin: M0 + P * bow, y: (Mlat - M0) / P + yBow, yLin: yLin + bow };
  }
  function beamColumnMax(cfg, P, n = 200) {
    let Mmax = 0, Mlin = 0, ymax = 0, ylin = 0, xAt = 0;
    for (let i = 0; i <= n; i++) {
      const x = cfg.l * i / n, s = beamColumnState(cfg, P, x);
      if (Math.abs(s.M) > Math.abs(Mmax)) { Mmax = s.M; xAt = x; }
      if (Math.abs(s.Mlin) > Math.abs(Mlin)) Mlin = s.Mlin;
      if (Math.abs(s.y) > Math.abs(ymax)) ymax = s.y;
      if (Math.abs(s.yLin) > Math.abs(ylin)) ylin = s.yLin;
    }
    // Refine the moment peak with a golden-section search around the grid peak.
    const h = cfg.l / n;
    let a = Math.max(0, xAt - h), b = Math.min(cfg.l, xAt + h);
    const g = (x) => -Math.abs(beamColumnState(cfg, P, x).M);
    const gr = (Math.sqrt(5) - 1) / 2;
    for (let i = 0; i < 40; i++) {
      const x1 = b - gr * (b - a), x2 = a + gr * (b - a);
      if (g(x1) < g(x2)) b = x2; else a = x1;
    }
    const xr = 0.5 * (a + b), Mr = beamColumnState(cfg, P, xr).M;
    if (Math.abs(Mr) > Math.abs(Mmax)) { Mmax = Mr; xAt = xr; }
    return { Mmax, Mlin, ymax, ylin, xAt };
  }

  function solveBeamColumn(inp) {
    const c = checker();
    checkMaterial(c, inp.material);
    const L = c.num(inp, "L", "Length L"), K = c.num(inp, "K", "Effective-length factor K");
    const P = c.num(inp, "P", "Applied axial load P");
    const e = c.num(inp, "e", "Eccentricity e", { min: -Infinity, strict: false });
    const w = c.num(inp, "w", "Lateral load w", { min: -Infinity, strict: false });
    const MA = c.num(inp, "M1", "End moment M1", { min: -Infinity, strict: false });
    const MB = c.num(inp, "M2", "End moment M2", { min: -Infinity, strict: false });
    const d0 = c.num(inp, "bow", "Initial bow δ0", { min: 0, allowZero: true });
    if (inp.feMode === "springs") {
      c.num(inp, "krA", "Rotational spring at end A", { min: 0, allowZero: true });
      c.num(inp, "krB", "Rotational spring at end B", { min: 0, allowZero: true });
      if (inp.uB === "spring") c.num(inp, "ktB", "Translational spring at end B");
    }
    c.done();
    const m = inp.material, sec = sectionProps(inp.section);
    const EI = m.E * sec.I, l = K * L;
    const cfg = { l, EI, MA: MA + P * e, MB: MB + P * e, w, d0 };
    // P·e moves with P: rebuild the end moments for each trial load.
    const cfgAt = (p) => ({ ...cfg, MA: MA + p * e, MB: MB + p * e });
    const Pe = PI * PI * EI / (l * l);
    const sigmaMax = (p) => p / sec.A + Math.abs(beamColumnMax(cfgAt(p), p).Mmax) / sec.S;
    const warnings = [];
    if (Math.abs(K - 1) > 1e-12) warnings.push(`Second-order moments use the pin-ended reference case with length KL = ${fmt(l)} mm (classical approximation for K ≠ 1)`);
    if (d0 > 0) warnings.push(`Initial bow δ0 = ${fmt(d0)} mm (L/${fmt(L / d0)}) is an assumed imperfection`);
    if (d0 === 0 && e === 0 && w === 0 && MA === 0 && MB === 0) warnings.push("No imperfection or lateral action: first yield is squash (P = A Fcy) unless buckling comes first");
    // First-yield load by root finding on σmax(P) = Fcy for 0 ≤ P < Pe.
    let Pfy = null, fyMessage = null, root = null;
    const f = (p) => sigmaMax(p) - m.Fcy;
    const f0 = f(0);
    if (f0 >= 0) fyMessage = "Section already reaches Fcy with P = 0 (lateral actions alone)";
    else {
      const hi = Pe * (1 - 1e-9);
      if (f(hi) < 0) { Pfy = null; fyMessage = `No first-yield root below the elastic buckling load Pe = ${fmt(Pe)} N: elastic buckling governs`; }
      else {
        root = rootBracketed(f, 0, hi, { tol: 1e-12 });
        if (root.converged) Pfy = root.x; else fyMessage = `Root finder did not converge (${root.reason})`;
      }
    }
    const atP = P < Pe ? beamColumnMax(cfgAt(P), P) : null;
    const sigmaAtP = atP ? P / sec.A + Math.abs(atP.Mmax) / sec.S : null;
    if (!(P < Pe)) warnings.push(`Applied load P = ${fmt(P)} N is at or above the elastic buckling load Pe = ${fmt(Pe)} N of the reference member: second-order results are undefined`);
    if (sigmaAtP !== null && sigmaAtP > m.Fcy) warnings.push(`σmax at the applied load = ${fmt(sigmaAtP)} MPa is above Fcy`);
    const springs = inp.feMode === "springs";
    const ends = springs
      ? [{ u: "fixed", r: inp.krA || "free" }, { u: inp.uB === "spring" ? (inp.ktB || "free") : inp.uB, r: inp.krB || "free" }]
      : endsForK(K);
    const fe = feBuckling({ E: m.E, I: sec.I, L, ends });
    fe.PcrClosed = springs || !ends ? null : PI * PI * EI / (K * L) ** 2;
    const Kfe = fe.Pcr ? Math.sqrt(PI * PI * EI / fe.Pcr) / L : null;
    const colFE = Kfe ? columnStrength(m, Kfe * L / sec.r) : null;
    return {
      section: sec, Pe, l, Pfy, fyMessage, root: root && { iterations: root.iterations, bisections: root.bisections },
      MS: Pfy ? Pfy / P - 1 : null,
      atP: atP && { Mmax: atP.Mmax, Mlin: atP.Mlin, amplification: atP.Mlin !== 0 ? atP.Mmax / atP.Mlin : null, ymax: atP.ymax, ylin: atP.ylin, sigmaMax: sigmaAtP, xAt: atP.xAt },
      fe: { Pcr: fe.Pcr, error: fe.error || null, elements: fe.elements, Kfe, PcrClosed: fe.PcrClosed ?? null, columnSigmaCr: colFE ? colFE.sigmaCr : null, columnPcr: colFE ? colFE.sigmaCr * sec.A : null, columnRegime: colFE ? colFE.regime : null },
      warnings, sources: ["secant", "fe", "euler", "johnson", "ro"].map(source),
    };
  }
  function beamColumnCurves(inp, n = 60) {
    const r = solveBeamColumn(inp), sec = r.section, m = inp.material;
    const e = inp.e, cfgAt = (p) => ({ l: r.l, EI: m.E * sec.I, MA: inp.M1 + p * e, MB: inp.M2 + p * e, w: inp.w, d0: inp.bow });
    const Pmax = 0.98 * r.Pe;
    const pd = [];
    for (let i = 0; i <= n; i++) {
      const p = Pmax * i / n, s = beamColumnMax(cfgAt(p), p, 120);
      pd.push({ P: p, ymax: Math.abs(s.ymax), ylin: Math.abs(s.ylin), sigmaMax: p / sec.A + Math.abs(s.Mmax) / sec.S });
    }
    const shape = [];
    if (inp.P < r.Pe) for (let i = 0; i <= 80; i++) { const x = r.l * i / 80, s = beamColumnState(cfgAt(inp.P), inp.P, x); shape.push({ x, y: s.y, yLin: s.yLin, M: s.M, Mlin: s.Mlin }); }
    return { result: r, pd, shape };
  }

  /* ---------- 1-D beam FE eigenvalue solve ---------- */

  // End conditions: per end, translation and rotation each "fixed", "free" or
  // a spring stiffness (number, N/mm or N·mm/rad).
  function endsForK(K) {
    const map = { 1: ["pinned", "pinned"], 0.7: ["fixed", "pinned"], 0.5: ["fixed", "fixed"], 2: ["fixed", "free"] };
    const pair = map[K];
    if (!pair) return null;
    const one = (t) => t === "fixed" ? { u: "fixed", r: "fixed" } : t === "pinned" ? { u: "fixed", r: "free" } : { u: "free", r: "free" };
    return [one(pair[0]), one(pair[1])];
  }
  function feBuckling({ E, I, L, ends, elements = 24 }) {
    if (!ends) return { Pcr: null, error: "custom K: enter end conditions (fixity or springs) for the FE cross-check", elements };
    const ne = elements, nd = 2 * (ne + 1), le = L / ne;
    const Ke = zeros(nd), Kg = zeros(nd);
    const k = E * I / le ** 3, ke = [[12, 6 * le, -12, 6 * le], [6 * le, 4 * le * le, -6 * le, 2 * le * le], [-12, -6 * le, 12, -6 * le], [6 * le, 2 * le * le, -6 * le, 4 * le * le]];
    const g = 1 / (30 * le), kg = [[36, 3 * le, -36, 3 * le], [3 * le, 4 * le * le, -3 * le, -le * le], [-36, -3 * le, 36, -3 * le], [3 * le, -le * le, -3 * le, 4 * le * le]];
    for (let e = 0; e < ne; e++) {
      const idx = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3];
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { Ke[idx[i]][idx[j]] += k * ke[i][j]; Kg[idx[i]][idx[j]] += g * kg[i][j]; }
    }
    const fixed = new Set();
    const apply = (end, node) => {
      for (const [key, dof] of [["u", 2 * node], ["r", 2 * node + 1]]) {
        const v = end[key];
        if (v === "fixed") fixed.add(dof);
        else if (typeof v === "number" && v > 0) Ke[dof][dof] += v;
      }
    };
    apply(ends[0], 0); apply(ends[1], ne);
    const keep = [];
    for (let i = 0; i < nd; i++) if (!fixed.has(i)) keep.push(i);
    const A = keep.map((i) => keep.map((j) => Ke[i][j])), B = keep.map((i) => keep.map((j) => Kg[i][j]));
    const Lc = cholesky(A);
    if (!Lc) return { Pcr: null, error: "the supports allow a rigid-body mechanism (stiffness matrix not positive definite)", elements };
    // Largest eigenvalue μ of C = L⁻¹ Kg L⁻ᵀ gives the smallest P = 1/μ.
    const n = keep.length, Linv = lowerInverse(Lc);
    const C = mul(mul(Linv, B), transpose(Linv));
    for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) { const s = 0.5 * (C[i][j] + C[j][i]); C[i][j] = C[j][i] = s; }
    const eig = jacobiEigenvalues(C);
    if (!eig.converged) return { Pcr: null, error: "Jacobi eigen routine did not converge", elements };
    const mu = Math.max(...eig.values);
    if (!(mu > 0)) return { Pcr: null, error: "no compressive buckling mode", elements };
    return { Pcr: 1 / mu, elements, sweeps: eig.sweeps };
  }
  const zeros = (n) => Array.from({ length: n }, () => new Array(n).fill(0));
  const transpose = (A) => A[0].map((_, j) => A.map((r) => r[j]));
  const mul = (A, B) => A.map((r) => B[0].map((_, j) => r.reduce((s, v, k) => s + v * B[k][j], 0)));
  function cholesky(A) {
    const n = A.length, L = zeros(n);
    for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
      let s = A[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      if (i === j) { if (!(s > 1e-12 * Math.abs(A[i][i]))) return null; L[i][i] = Math.sqrt(s); }
      else L[i][j] = s / L[j][j];
    }
    return L;
  }
  function lowerInverse(L) {
    const n = L.length, X = zeros(n);
    for (let j = 0; j < n; j++) {
      X[j][j] = 1 / L[j][j];
      for (let i = j + 1; i < n; i++) { let s = 0; for (let k = j; k < i; k++) s -= L[i][k] * X[k][j]; X[i][j] = s / L[i][i]; }
    }
    return X;
  }
  // Cyclic Jacobi rotations for a dense symmetric matrix; returns eigenvalues.
  function jacobiEigenvalues(M0, maxSweeps = 100) {
    const A = M0.map((r) => r.slice()), n = A.length;
    for (let sweep = 1; sweep <= maxSweeps; sweep++) {
      let off = 0, diag = 0;
      for (let i = 0; i < n; i++) { diag += A[i][i] * A[i][i]; for (let j = i + 1; j < n; j++) off += A[i][j] * A[i][j]; }
      if (off <= 1e-30 * diag) return { values: A.map((r, i) => r[i]), converged: true, sweeps: sweep };
      for (let p = 0; p < n - 1; p++) for (let q = p + 1; q < n; q++) {
        if (Math.abs(A[p][q]) < 1e-300) continue;
        const theta = (A[q][q] - A[p][p]) / (2 * A[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const cs = 1 / Math.sqrt(t * t + 1), sn = t * cs;
        for (let k = 0; k < n; k++) {
          const akp = A[k][p], akq = A[k][q];
          A[k][p] = cs * akp - sn * akq; A[k][q] = sn * akp + cs * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = A[p][k], aqk = A[q][k];
          A[p][k] = cs * apk - sn * aqk; A[q][k] = sn * apk + cs * aqk;
        }
      }
    }
    return { values: A.map((r, i) => r[i]), converged: false };
  }

  /* ---------- Shear buckling of flat plates ---------- */

  function ksClosed(edges, ratio) {
    const r2 = 1 / (ratio * ratio);
    return edges === "clamped" ? 8.98 + 5.6 * r2 : 5.34 + 4.0 * r2;
  }
  // Solve τ = η(τ)·τe for the TN 3781 plasticity factor; σ = 2τ (maximum-shear law).
  function shearPlasticity(m, tauE, rule = "A5") {
    const eta = (tau) => {
      const { Es, Et } = roModuli(m, 2 * tau);
      const nu = 0.5 - (0.5 - m.nu) * Es / m.E;
      let e = (Es / m.E) * (1 - m.nu * m.nu) / (1 - nu * nu);
      if (rule === "table2") e *= 0.83 + 0.17 * Et / Es;
      return e;
    };
    const f = (tau) => tau - eta(tau) * tauE;
    if (f(tauE) <= 0) return { tau: tauE, eta: 1 };
    const r = rootBracketed(f, 0, tauE);
    if (!r.converged) return { error: r.reason };
    return { tau: r.x, eta: r.x / tauE };
  }
  function solveShear(inp) {
    const c = checker();
    checkMaterial(c, inp.material);
    const a = c.num(inp, "a", "Panel length a"), b = c.num(inp, "b", "Panel width b"), t = c.num(inp, "t", "Thickness t");
    const tau = c.num(inp, "tau", "Applied shear stress τ");
    if (inp.edges !== "ss" && inp.edges !== "clamped") c.errors.push({ field: "edges", message: "Edges must be simply supported or clamped" });
    c.done();
    const m = inp.material, short = Math.min(a, b), long = Math.max(a, b), ratio = long / short;
    const ks = ksClosed(inp.edges, ratio);
    const tauE = ks * PI * PI * m.E / (12 * (1 - m.nu * m.nu)) * (t / short) ** 2;
    const pl = shearPlasticity(m, tauE, inp.plasticity || "A5");
    const warnings = [];
    if (a < b) warnings.push("a < b: k_s uses the long/short side ratio, so the ratio is taken as b/a");
    if (ratio > 5) warnings.push(`Side ratio ${fmt(ratio)} is outside 1 to 5, the range of TN 3781 fig. 22 against which the closed-form k_s is checked`);
    if (pl.error) return { ks, ratio, tauE, error: `Plasticity iteration did not converge: ${pl.error}`, warnings, sources: ["ks", "shearPlast", "ro"].map(source) };
    if (pl.eta < 0.99) warnings.push(`Plasticity correction active: η = ${fmt(pl.eta)} (τcr,e = ${fmt(tauE)} MPa above the proportional region)`);
    if (tau > m.Fcy / 2) warnings.push(`Applied τ = ${fmt(tau)} MPa exceeds Fcy/2 (maximum-shear yield)`);
    if (short / t > 2000) warnings.push(`Extreme slenderness b/t = ${fmt(short / t)}`);
    return { ratio, short, ks, tauE, tauCr: pl.tau, eta: pl.eta, MS: pl.tau / tau - 1, warnings, sources: ["ks", "shearPlast", "ro"].map(source) };
  }

  /* ---------- Diagonal tension (NACA TN 2661, plane webs) ---------- */

  const kFactor = (ratio) => (ratio > 1 ? Math.tanh(0.5 * Math.log10(ratio)) : 0);

  // Angle of diagonal tension by successive approximation of eqs. (30a) to (30d).
  function idtAngle({ k, tau, E, nu, AUedt, twoAFht, heavyFlanges }) {
    if (k <= 0) return { alpha: PI / 4, converged: true, iterations: 0 };
    let alpha = PI / 4;
    for (let i = 1; i <= 500; i++) {
      const s2 = Math.sin(2 * alpha);
      const eps = tau / E * (2 * k / s2 + (1 - k) * (1 + nu) * s2);
      const sU = -k * tau * Math.tan(alpha) / (AUedt + 0.5 * (1 - k));
      const sF = heavyFlanges ? 0 : -k * tau / Math.tan(alpha) / (twoAFht + 0.5 * (1 - k));
      const t2 = (eps - sF / E) / (eps - sU / E);
      if (!(t2 > 0)) return { converged: false, reason: "tan²α not positive" };
      const next = Math.atan(Math.sqrt(t2));
      if (Math.abs(next - alpha) < 1e-13) return { alpha: next, converged: true, iterations: i };
      alpha = 0.5 * (alpha + next);
    }
    return { converged: false, reason: "angle iteration did not converge in 500 cycles" };
  }
  // Pure diagonal tension (k = 1), TN 2661 eqs. (11) to (15), Wagner / TN 469.
  function wagner({ tau, AUedt, twoAFht, heavyFlanges }) {
    const t4 = (1 + (heavyFlanges ? 0 : 1 / twoAFht)) / (1 + 1 / AUedt);
    const alpha = Math.atan(Math.pow(t4, 0.25));
    return {
      alpha,
      sigma: 2 * tau / Math.sin(2 * alpha),
      sigmaU: -tau * Math.tan(alpha) / AUedt,
      sigmaF: heavyFlanges ? 0 : -tau / Math.tan(alpha) / twoAFht,
    };
  }

  function solveDiagonal(inp) {
    const c = checker();
    checkMaterial(c, inp.material);
    const t = c.num(inp, "t", "Web thickness t");
    const d = c.num(inp, "d", "Upright spacing d"), dc = c.num(inp, "dc", "Clear upright spacing dc");
    const he = c.num(inp, "he", "Effective depth he"), hc = c.num(inp, "hc", "Clear web depth hc"), hU = c.num(inp, "hU", "Upright length hU");
    const AU = c.num(inp, "AU", "Upright area AU"), rho = c.num(inp, "rho", "Upright radius of gyration ρ"), tU = c.num(inp, "tU", "Upright leg thickness tU");
    const S = c.num(inp, "S", "Applied shear S");
    const single = inp.upright === "single";
    const e = single ? c.num(inp, "e", "Upright eccentricity e") : 0;
    const heavy = !!inp.heavyFlanges;
    const AF = heavy ? Infinity : c.num(inp, "AF", "Flange area AF");
    const tF = inp.restraint === "fig12b" ? c.num(inp, "tF", "Flange thickness tF") : null;
    const IT = c.num(inp, "IT", "Tension flange I", {}), IC = c.num(inp, "IC", "Compression flange I", {});
    let Rh, Rd;
    if (inp.restraint === "user") { Rh = c.num(inp, "Rh", "Restraint Rh"); Rd = c.num(inp, "Rd", "Restraint Rd"); }
    if (dc > d) c.errors.push({ field: "dc", message: "Clear spacing dc must be ≤ d" });
    c.done();
    const m = inp.material, warnings = [];
    // 4.1 effective upright area
    const AUe = single ? AU / (1 + (e / rho) ** 2) : AU;
    const AUedt = AUe / (d * t);
    // 4.2 buckling stress
    let held = false;
    if (inp.restraint !== "user") {
      const rh = restraintFig12b(tU / t, single ? "lower" : "upper"), rd = restraintFig12b(tF / t, "upper");
      Rh = rh.value; Rd = rd.value; held = rh.held || rd.held;
      for (const n of rh.notes) warnings.push(`Rh: ${n}`);
      for (const n of rd.notes) warnings.push(`Rd: ${n}`);
    }
    const src = ["aue", "kssFit", ...(inp.restraint === "user" ? [] : ["rFit"]), ...(held ? ["rHold"] : []), "tcr32", "tcrPlast", "k27", "idt", "c1", "tmax", "c2Fit", "smaxFit", "le35", "upright", "wagner", "euler", "johnson", "ro"].map(source);
    const ratio = Math.max(hc, dc) / Math.min(hc, dc);
    const tau = S / (he * t);
    if (ratio > FIT.kss.range[1]) {
      const why = `kss unavailable: chart data not sourced for hc/dc = ${fmt(ratio)} (fig. 12(a) covers 1 to 5)`;
      warnings.push(why);
      return { AUe, AUedt, Rh, Rd, ratio, kss: null, tau, error: why, warnings, sources: src };
    }
    const kss = kssFig12a(ratio);
    const tauCrElastic = dc < hc
      ? kss * m.E * (t / dc) ** 2 * (Rh + 0.5 * (Rd - Rh) * (dc / hc) ** 3)
      : kss * m.E * (t / hc) ** 2 * (Rd + 0.5 * (Rh - Rd) * (hc / dc) ** 3);
    const noUprightsUnavailable = "unavailable: chart data not sourced - TN 2661 gives no kss for the uprights-disregarded (infinitely long) panel";
    warnings.push(`TN 2661 section 4.2 note 2 (use the buckling stress with the uprights disregarded when it is higher) could not be checked: ${noUprightsUnavailable}; τcr uses eq. (32) with the uprights`);
    const pl = shearPlasticity(m, tauCrElastic, "A5");
    if (pl.error) return { AUe, AUedt, Rh, Rd, ratio, kss, tauCrElastic, tau, error: `Web plasticity iteration did not converge: ${pl.error}`, warnings, sources: src };
    const tauCr = pl.tau;
    if (pl.eta < 0.99) warnings.push(`Web buckling plasticity correction active: η = ${fmt(pl.eta)}`);
    // 4.3 nominal shear, 4.4 k
    const loading = tau / tauCr;
    const k = kFactor(loading);
    if (loading <= 1) warnings.push(`τ/τcr = ${fmt(loading)} ≤ 1: web not buckled, no diagonal tension yet (k = 0)`);
    // 4.5, 4.6 upright stress and angle
    const twoAFht = heavy ? Infinity : 2 * AF / (he * t);
    const ang = idtAngle({ k, tau, E: m.E, nu: m.nu, AUedt, twoAFht, heavyFlanges: heavy });
    const pdt = wagner({ tau, AUedt, twoAFht, heavyFlanges: heavy });
    const base = { AUe, AUedt, Rh, Rd, ratio, kss, tauCrElastic, tauCrElasticNoUprights: null, noUprightsUnavailable, tauCr, etaWeb: pl.eta, tau, loading, k, pdt };
    if (!ang.converged) return { ...base, error: `Angle of diagonal tension: ${ang.reason}`, warnings, sources: src };
    const alpha = ang.alpha, s2 = Math.sin(2 * alpha);
    const sigmaU = k > 0 ? -k * tau * Math.tan(alpha) / (AUedt + 0.5 * (1 - k)) : 0;
    const sigmaF = heavy || k === 0 ? 0 : -k * tau / Math.tan(alpha) / (twoAFht + 0.5 * (1 - k));
    const sigma1 = 2 * k * tau / s2 + tau * (1 - k) * s2;
    const sigma2 = -tau * (1 - k) * s2;
    const sm = smaxRatioFig15(k, d / hU);
    const sigmaUmax = sm.unavailable ? null : sigmaU * sm.value;
    // 4.7 web peak stress
    const C1 = 1 / s2 - 1;
    const wd = 0.7 * d * Math.pow(t / ((IC + IT) * he), 0.25);
    const c2 = c2Fig18(wd);
    const tauMaxPrime = c2.unavailable ? null : tau * (1 + k * k * C1) * (1 + k * c2.value);
    // 3.8 / 4.9 to 4.11 upright column action (shared column-strength function)
    const Le = d < 1.5 * hU ? hU / Math.sqrt(1 + k * k * (3 - 2 * d / hU)) : hU;
    const checks = [];
    const sU = Math.abs(sigmaU);
    if (!single) {
      const cs = columnStrength(m, Le / rho);
      checks.push({ id: "double-column", label: "Upright σU vs column allowable at Le/ρ (4.10(b))", stress: sU, allowable: cs.sigmaCr, slenderness: Le / rho, regime: cs.regime });
    } else {
      checks.push({ id: "single-yield", label: "Upright σU vs column yield stress Fcy (4.11(b))", stress: sU, allowable: m.Fcy, slenderness: null, regime: null });
      const cs = columnStrength(m, hU / (2 * rho));
      checks.push({ id: "single-column", label: "Upright σUav = σU AUe/AU vs column allowable at hU/(2ρ) (eq. 38)", stress: sU * AUe / AU, allowable: cs.sigmaCr, slenderness: hU / (2 * rho), regime: cs.regime });
    }
    for (const ch of checks) ch.MS = ch.stress > 0 ? ch.allowable / ch.stress - 1 : null;
    const governing = checks.filter((x) => x.MS !== null).sort((x, y) => x.MS - y.MS)[0] || null;
    if (sm.unavailable) warnings.push(`σUmax/σU ${sm.unavailable}`);
    if (c2.unavailable) warnings.push(`C2 ${c2.unavailable}`);
    if (sigma1 > m.Fcy) warnings.push(`Web principal stress σ1 = ${fmt(sigma1)} MPa is above Fcy`);
    if (sU > m.Fcy) warnings.push(`Upright stress |σU| = ${fmt(sU)} MPa is above Fcy`);
    return {
      ...base, alpha, alphaDeg: alpha * 180 / PI, tanAlpha: Math.tan(alpha), iterations: ang.iterations,
      sigmaU, sigmaUtau: sigmaU / tau, sigmaF, sigma1, sigma2, smaxRatio: sm.unavailable ? null : sm.value, smaxUnavailable: sm.unavailable || null, sigmaUmax,
      C1, wd, C2: c2.unavailable ? null : c2.value, C2unavailable: c2.unavailable || null, tauMaxPrime,
      Le, checks, governing, warnings, sources: src,
    };
  }
  function diagonalCurves(inp, n = 80) {
    const r = solveDiagonal(inp);
    const kCurve = [];
    for (let i = 0; i <= n; i++) { const x = Math.pow(10, 2.3 * i / n); kCurve.push({ ratio: x, k: kFactor(x) }); }
    const web = [];
    if (!r.error) {
      const Smax = Math.max(inp.S * 1.6, 3 * r.tauCr * inp.he * inp.t);
      for (let i = 1; i <= n; i++) {
        const S = Smax * i / n;
        try {
          const q = solveDiagonal({ ...inp, S });
          if (!q.error) web.push({ S, tau: q.tau, sigma1: q.sigma1, sigmaU: Math.abs(q.sigmaU), sigmaPDT: q.pdt.sigma, k: q.k });
        } catch (e) { /* skip */ }
      }
    }
    return { result: r, kCurve, web };
  }

  /* ---------- Tabs, defaults, serialisation ---------- */

  const TABS = ["column", "beamColumn", "shear", "diagonal"];
  const TAB_LABELS = { column: "Column buckling", beamColumn: "Beam-column", shear: "Shear buckling", diagonal: "Diagonal tension" };
  const baseMaterial = () => ({ preset: "al2024t3", ...pick(MATERIAL_PRESETS[0], ["E", "Fcy", "nu", "n"]) });
  const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));

  function defaults(tab) {
    const material = baseMaterial();
    switch (tab) {
      case "column": return { material, section: { shape: "tube", D: 25, t: 1.5, axis: "weak", A: 100, I: 1000, c: 10, b: 20, h: 40 }, L: 800, K: 1, kPreset: "pp", P: 5000, tangent: false };
      case "beamColumn": return { material, section: { shape: "tube", D: 40, t: 2, axis: "weak", A: 200, I: 20000, c: 20, b: 20, h: 40 }, L: 1500, K: 1, kPreset: "pp", P: 8000, e: 2, w: 0, M1: 0, M2: 0, bow: 1.5, feMode: "preset", krA: 0, krB: 0, uB: "fixed", ktB: 0 };
      case "shear": return { material, a: 300, b: 150, t: 1.0, edges: "ss", tau: 15, plasticity: "A5" };
      case "diagonal": return {
        material, upright: "double", t: 1.0, d: 200, dc: 190, he: 400, hc: 380, hU: 390,
        AU: 120, rho: 6, tU: 1.6, e: 8, heavyFlanges: false, AF: 400, tF: 2.5, IT: 40000, IC: 40000,
        restraint: "fig12b", Rh: 1, Rd: 1, S: 40000,
      };
      default: throw new Error(`unknown tab ${tab}`);
    }
  }
  function solve(tab, inputs) {
    switch (tab) {
      case "column": return solveColumn(inputs);
      case "beamColumn": return solveBeamColumn(inputs);
      case "shear": return solveShear(inputs);
      case "diagonal": return solveDiagonal(inputs);
      default: throw new InputError([{ field: "tab", message: `Unknown tab "${tab}"` }]);
    }
  }
  // Merge a partial input over the tab defaults (import and WebMCP).
  function normalise(tab, partial) {
    const base = defaults(tab), p = partial || {};
    const out = { ...base, ...p };
    out.material = { ...base.material, ...(p.material || {}) };
    if (base.section) out.section = { ...base.section, ...(p.section || {}) };
    return out;
  }

  // Unit description of every numeric input and result, for display and export.
  const INPUT_UNITS = {
    material: { E: "stress", Fcy: "stress", nu: "none", n: "none" },
    section: { D: "length", t: "length", b: "length", h: "length", A: "area", I: "inertia", c: "length" },
    column: { L: "length", K: "none", P: "force" },
    beamColumn: { L: "length", K: "none", P: "force", e: "length", w: "lineLoad", M1: "moment", M2: "moment", bow: "length", krA: "rotSpring", krB: "rotSpring", ktB: "transSpring" },
    shear: { a: "length", b: "length", t: "length", tau: "stress" },
    diagonal: { t: "length", d: "length", dc: "length", he: "length", hc: "length", hU: "length", AU: "area", rho: "length", tU: "length", e: "length", AF: "area", tF: "length", IT: "inertia", IC: "inertia", Rh: "none", Rd: "none", S: "force" },
  };

  // Results summarised for export: [label, value (canonical), quantity].
  function resultRows(tab, r) {
    const rows = [];
    const add = (label, v, q = "none") => rows.push({ label, value: v === undefined ? null : v, q });
    if (tab === "column") {
      add("Radius of gyration r", r.section.r, "length"); add("Area A", r.section.A, "area"); add("Second moment I", r.section.I, "inertia");
      add("Slenderness KL/r", r.lambda); add("Transition (KL/r)c", r.lambdaC); add("Regime", r.regime);
      add("Euler σcr", r.sigmaEuler, "stress"); add("Johnson σcr", r.sigmaJohnson, "stress"); add("Governing σcr", r.sigmaCr, "stress");
      if (r.sigmaTangent !== null) add("Tangent-modulus σcr", r.sigmaTangent, "stress");
      add("Pcr", r.Pcr, "force"); add("Applied P/A", r.sigmaApplied, "stress"); add("Margin of safety Pcr/P − 1", r.MS);
    } else if (tab === "beamColumn") {
      add("Reference length KL", r.l, "length"); add("Elastic buckling Pe = π²EI/(KL)²", r.Pe, "force");
      add("First-yield load Pfy", r.Pfy, "force"); if (r.fyMessage) add("First-yield note", r.fyMessage);
      add("Margin of safety Pfy/P − 1", r.MS);
      if (r.atP) { add("Linear moment at P", r.atP.Mlin, "moment"); add("Second-order moment at P", r.atP.Mmax, "moment"); add("Moment amplification", r.atP.amplification); add("Max deflection at P", r.atP.ymax, "length"); add("σmax at P", r.atP.sigmaMax, "stress"); }
      add("FE Pcr", r.fe.Pcr, "force"); add("π²EI/(KL)² for the K preset", r.fe.PcrClosed, "force"); if (r.fe.error) add("FE note", r.fe.error); add("FE effective K", r.fe.Kfe);
      add("Column strength at FE K (shared function)", r.fe.columnPcr, "force");
    } else if (tab === "shear") {
      add("Side ratio (long/short)", r.ratio); add("k_s", r.ks); add("τcr elastic", r.tauE, "stress");
      if (!r.error) { add("Plasticity factor η", r.eta); add("τcr", r.tauCr, "stress"); add("Margin of safety τcr/τ − 1", r.MS); } else add("Error", r.error);
    } else if (tab === "diagonal") {
      add("AUe", r.AUe, "area"); add("AUe/(d t)", r.AUedt); add("Rh", r.Rh); add("Rd", r.Rd); add("kss (fig. 12(a) fit)", r.kss);
      add("τcr elastic", r.tauCrElastic, "stress"); add("τcr", r.tauCr, "stress"); add("τ = S/(he t)", r.tau, "stress"); add("τ/τcr", r.loading); add("k", r.k);
      if (r.error) add("Error", r.error);
      else {
        add("α (deg)", r.alphaDeg); add("tan α", r.tanAlpha); add("σU", r.sigmaU, "stress"); add("σU/τ", r.sigmaUtau);
        add("σUmax/σU (fig. 15 fit)", r.smaxRatio); if (r.smaxUnavailable) add("σUmax/σU note", r.smaxUnavailable); add("σUmax", r.sigmaUmax, "stress");
        add("σF", r.sigmaF, "stress"); add("Web σ1", r.sigma1, "stress"); add("Web σ2", r.sigma2, "stress");
        add("C1", r.C1); add("ωd", r.wd); add("C2 (fig. 18 fit)", r.C2); if (r.C2unavailable) add("C2 note", r.C2unavailable); add("τ'max", r.tauMaxPrime, "stress");
        add("Upright Le", r.Le, "length");
        for (const ch of r.checks) { add(`${ch.label}: stress`, ch.stress, "stress"); add(`${ch.label}: allowable`, ch.allowable, "stress"); add(`${ch.label}: MS`, ch.MS); }
        add("Pure diagonal tension α (deg)", r.pdt.alpha * 180 / PI); add("Pure diagonal tension web σ", r.pdt.sigma, "stress"); add("Pure diagonal tension σU", r.pdt.sigmaU, "stress");
      }
    }
    return rows;
  }

  function exportJSON(tab, inputs, opts = {}) {
    const doc = { schemaVersion: SCHEMA_VERSION, tab, units: "SI", unitSystem: "N, mm, MPa", displayUnits: opts.displayUnits || "SI", notForCertification: true, disclaimer: DISCLAIMER, inputs };
    if (opts.withResults !== false) {
      let res;
      try { res = solve(tab, inputs); }
      catch (e) { doc.results = null; doc.errors = e.errors || [{ message: e.message }]; doc.warnings = []; doc.sources = []; return doc; }
      doc.results = Object.fromEntries(resultRows(tab, res).map((r) => [r.label, r.value]));
      doc.warnings = res.warnings;
      doc.sources = res.sources.map((s) => ({ id: s.id, kind: s.kind, text: s.text }));
    }
    return doc;
  }
  function importJSON(text) {
    let doc;
    try { doc = typeof text === "string" ? JSON.parse(text) : text; } catch (e) { throw new InputError([{ field: "file", message: `Not valid JSON: ${e.message}` }]); }
    if (!doc || typeof doc !== "object") throw new InputError([{ field: "file", message: "File is not a JSON object" }]);
    if (doc.schemaVersion !== SCHEMA_VERSION) throw new InputError([{ field: "schemaVersion", message: `Unsupported schemaVersion ${doc.schemaVersion} (expected ${SCHEMA_VERSION})` }]);
    if (!TABS.includes(doc.tab)) throw new InputError([{ field: "tab", message: `Unknown tab "${doc.tab}"` }]);
    if (doc.units !== "SI") throw new InputError([{ field: "units", message: "Files must be in canonical SI (units: \"SI\")" }]);
    if (!doc.inputs || typeof doc.inputs !== "object") throw new InputError([{ field: "inputs", message: "File has no inputs" }]);
    return { tab: doc.tab, inputs: normalise(doc.tab, doc.inputs), displayUnits: doc.displayUnits === "US" ? "US" : "SI" };
  }
  function exportMarkdown(tab, inputs, opts = {}) {
    const sys = opts.displayUnits || "SI";
    const v = (x, q) => (x === null || x === undefined ? "—" : typeof x === "string" ? x : `${fmt(toDisplay(x, q, sys))}${unitLabel(q, sys) ? " " + unitLabel(q, sys) : ""}`);
    const lines = [`# Structural stability visualiser: ${TAB_LABELS[tab]}`, "", `> **${DISCLAIMER}**`, "", `Display units: ${sys === "SI" ? "N, mm, MPa" : "lbf, in, ksi"} (canonical SI in the JSON export).`, "", "## Inputs", "", "| Input | Value |", "|---|---|"];
    const flat = (obj, units, prefix = "") => {
      for (const [k, x] of Object.entries(obj)) {
        if (k === "material" || k === "section") continue;
        if (typeof x === "number") lines.push(`| ${prefix}${k} | ${v(x, units[k] || "none")} |`);
        else if (typeof x === "string" || typeof x === "boolean") lines.push(`| ${prefix}${k} | ${x} |`);
      }
    };
    flat(inputs.material, INPUT_UNITS.material, "material.");
    if (inputs.section) flat(inputs.section, INPUT_UNITS.section, "section.");
    flat(inputs, INPUT_UNITS[tab]);
    let res = null, err = null;
    try { res = solve(tab, inputs); } catch (e) { err = e; }
    lines.push("", "## Results", "");
    if (err) lines.push(`Calculation blocked: ${(err.errors || [{ message: err.message }]).map((x) => x.message).join("; ")}`);
    else {
      lines.push("| Result | Value |", "|---|---|");
      for (const r of resultRows(tab, res)) lines.push(`| ${r.label} | ${v(r.value, r.q)} |`);
    }
    lines.push("", "## Warnings", "");
    const warns = res ? res.warnings : [];
    if (warns.length) for (const w of warns) lines.push(`- ${w}`); else lines.push("- None");
    lines.push("", "## Formula sources", "");
    for (const s of res ? res.sources : []) lines.push(`- **${s.kind}** (${s.id}): ${s.text}`);
    lines.push("", `_${DISCLAIMER}_`, "");
    return lines.join("\n");
  }

  /* ---------- Reference cases (NACA TN 2661 section 7) ---------- */

  // Example 1, thin-web beam I-40-4Da (double uprights, heavy flanges) and
  // example 2, thick-web beam V-12-10S (single uprights), in canonical SI.
  // E = 10.6 × 10³ ksi as used in the report's arithmetic.
  const US = { in: IN, in2: IN * IN, kips: 1000 * LBF, ksi: KSI };
  function tn2661Example(n) {
    const material = { preset: "custom", E: 10.6e3 * US.ksi, Fcy: 40 * US.ksi, nu: 0.32, n: 20 };
    if (n === 1) return {
      material, upright: "double", t: 0.039 * US.in, d: 20.0 * US.in, dc: 19.37 * US.in, he: 41.4 * US.in, hc: 37.1 * US.in, hU: 38.6 * US.in,
      AU: 0.353 * US.in2, rho: 0.351 * US.in, tU: 0.125 * US.in, e: 0, heavyFlanges: true, AF: 1,
      // "tF/t large": taken at the end of fig. 12(b), tF/t = 3. IT + IC are set
      // by tn2661Case to give the report's ωd = 1.20.
      tF: 3.0 * 0.039 * US.in, IT: 0, IC: 0, restraint: "fig12b", Rh: 1, Rd: 1, S: 30.3 * US.kips,
    };
    return {
      material, upright: "single", t: 0.1043 * US.in, d: 7.0 * US.in, dc: 7.0 * US.in, he: 11.58 * US.in, hc: 9.875 * US.in, hU: 9.875 * US.in,
      AU: 0.1443 * US.in2, rho: 0.182 * US.in, tU: 0.1283 * US.in, e: 0.251 * US.in, heavyFlanges: true, AF: 2.32 * US.in2, tF: 0.3125 * US.in,
      IT: 0, IC: 0, restraint: "fig12b", Rh: 1, Rd: 1, S: 34.5 * US.kips,
    };
  }
  // Flange inertia sum giving a target ωd = 0.7 d [t/((IC+IT) he)]^¼.
  const inertiaForWd = (wd, d, t, he) => t / (he * Math.pow(wd / (0.7 * d), 4));
  function tn2661Case(n) {
    const x = tn2661Example(n);
    const I = inertiaForWd(n === 1 ? 1.2 : 1.37, x.d, x.t, x.he) / 2;
    x.IT = I; x.IC = I;
    return x;
  }

  /* ---------- Self-tests ---------- */

  function selfTests() {
    const results = [];
    const check = (name, pass, detail, tol) => results.push({ name, pass: !!pass, detail, tolerance: tol || "" });
    const rel = (a, b) => Math.abs(a - b) / Math.abs(b);
    const mat = { E: 72400, Fcy: 270, nu: 0.33, n: 15 };

    // 1. FE eigenvalue Pcr vs π²EI/(KL)² for each K preset.
    for (const kp of K_PRESETS) {
      const E = 70000, I = 1000, L = 1000;
      const fe = feBuckling({ E, I, L, ends: endsForK(kp.K) });
      const exact = PI * PI * E * I / (kp.K * L) ** 2;
      check(`FE Pcr = π²EI/(KL)², ${kp.label} (K = ${kp.K})`, fe.Pcr && rel(fe.Pcr, exact) < 0.005, `FE ${fmt(fe.Pcr)} N vs ${fmt(exact)} N (${fmt(100 * rel(fe.Pcr, exact))} %)`, "0.5 %");
    }
    // Rotational springs: very stiff springs recover fixed-fixed, zero springs pinned.
    {
      const E = 70000, I = 1000, L = 1000;
      const stiff = feBuckling({ E, I, L, ends: [{ u: "fixed", r: 1e12 }, { u: "fixed", r: 1e12 }] });
      const exact = 4 * PI * PI * E * I / (L * L);
      check("FE end springs: rotational springs → ∞ recover fixed-fixed", rel(stiff.Pcr, exact) < 0.005, `FE ${fmt(stiff.Pcr)} N vs ${fmt(exact)} N`, "0.5 %");
    }
    // 2. Secant formula: pin-ended eccentric column matches the closed form.
    {
      const inp = { material: mat, section: { shape: "tube", D: 40, t: 2 }, L: 1500, K: 1, P: 8000, e: 2, w: 0, M1: 0, M2: 0, bow: 0 };
      const r = solveBeamColumn(inp), s = r.section;
      const secant = (P) => (P / s.A) * (1 + (inp.e * s.c / (s.r * s.r)) / Math.cos((inp.L / (2 * s.r)) * Math.sqrt(P / (mat.E * s.A))));
      check("Beam-column σmax at P equals the secant formula", rel(r.atP.sigmaMax, secant(inp.P)) < 1e-9, `${fmt(r.atP.sigmaMax)} vs ${fmt(secant(inp.P))} MPa`, "1e-9");
      check("Beam-column first-yield root satisfies the secant formula = Fcy", r.Pfy && rel(secant(r.Pfy), mat.Fcy) < 1e-8, `σ(Pfy) = ${fmt(secant(r.Pfy))} MPa`, "1e-8");
      const w = solveBeamColumn({ ...inp, e: 0, w: 1 });
      const u = (inp.L / 2) * Math.sqrt(inp.P / (mat.E * s.I));
      const Mw = 1 * inp.L * inp.L / 8 * (2 * (1 / Math.cos(u) - 1) / (u * u));
      check("Beam-column uniform load: Mmax = (wL²/8)·2(sec u − 1)/u²", rel(Math.abs(w.atP.Mmax), Mw) < 1e-6, `${fmt(w.atP.Mmax)} vs ${fmt(Mw)} N·mm`, "1e-6");
    }
    // 3. k_s asymptotes and exact square-plate values.
    check("k_s simply supported → 5.34 as a/b → ∞", Math.abs(ksClosed("ss", 1e6) - 5.34) < 1e-6, `${fmt(ksClosed("ss", 1e6))}`, "1e-6");
    check("k_s clamped → 8.98 as a/b → ∞", Math.abs(ksClosed("clamped", 1e6) - 8.98) < 1e-6, `${fmt(ksClosed("clamped", 1e6))}`, "1e-6");
    check("k_s simply supported square plate ≈ 9.34 (exact)", rel(ksClosed("ss", 1), 9.34) < 0.01, `${fmt(ksClosed("ss", 1))}`, "1 %");
    check("k_s clamped square plate ≈ 14.71 (exact)", rel(ksClosed("clamped", 1), 14.71) < 0.015, `${fmt(ksClosed("clamped", 1))}`, "1.5 %");
    {
      const low = shearPlasticity(mat, 1);
      check("Shear plasticity η → 1 at low stress", Math.abs(low.eta - 1) < 1e-3, `η = ${fmt(low.eta)}`, "1e-3");
      const epp = { E: 72400, Fcy: 270, nu: 0.33, n: 200 };
      const hi = shearPlasticity(epp, 10 * epp.Fcy);
      check("Shear plasticity caps τcr near Fcy/2 for a sharp-kneed curve (TN 3781 fig. 10, n → ∞)", Math.abs(hi.tau / (epp.Fcy / 2) - 1) < 0.02, `τcr = ${fmt(hi.tau)} MPa vs Fcy/2 = ${fmt(epp.Fcy / 2)}`, "2 %");
    }
    // 4. Diagonal tension k = 1 limit vs pure Wagner.
    {
      const args = { tau: 100, E: 72400, nu: 0.33, AUedt: 0.3, twoAFht: 2.5, heavyFlanges: false };
      const a = idtAngle({ ...args, k: 1 }), w = wagner(args);
      check("Diagonal tension k = 1: angle from eq. (30c) equals Wagner eq. (15)", a.converged && Math.abs(a.alpha - w.alpha) < 1e-9, `${fmt(a.alpha * 180 / PI)}° vs ${fmt(w.alpha * 180 / PI)}°`, "1e-9 rad");
      const sU = -1 * args.tau * Math.tan(a.alpha) / (args.AUedt + 0);
      check("Diagonal tension k = 1: σU (30a) equals Wagner eq. (12)", Math.abs(sU - w.sigmaU) < 1e-9 * Math.abs(w.sigmaU), `${fmt(sU)} vs ${fmt(w.sigmaU)} MPa`, "1e-9");
      const s1 = 2 * args.tau / Math.sin(2 * a.alpha);
      check("Diagonal tension k = 1: σ1 (28a) equals Wagner eq. (11)", Math.abs(s1 - w.sigma) < 1e-9 * w.sigma, `${fmt(s1)} vs ${fmt(w.sigma)} MPa`, "1e-9");
      const h = wagner({ tau: 100, AUedt: 1e9, twoAFht: Infinity, heavyFlanges: true });
      check("Wagner with rigid flanges and uprights: α = 45°, web σ = 2τ (TN 469)", Math.abs(h.alpha - PI / 4) < 1e-6 && Math.abs(h.sigma - 200) < 1e-6, `α = ${fmt(h.alpha * 180 / PI)}°, σ = ${fmt(h.sigma)} MPa`, "1e-6");
      check("k = tanh(0.5 log₁₀ τ/τcr) → 1 as τ/τcr → ∞", kFactor(1e12) > 0.999 && kFactor(1) === 0, `k(10¹²) = ${fmt(kFactor(1e12))}`, "0.1 %");
    }
    // 5. SI/US unit round-trips.
    {
      let worst = 0;
      for (const q of Object.keys(QUANTITIES)) { const x = 123.456; const back = fromDisplay(toDisplay(x, q, "US"), q, "US"); worst = Math.max(worst, rel(back, x)); }
      check("SI → US → SI round-trip for every quantity", worst < 1e-12, `worst relative error ${worst.toExponential(1)}`, "1e-12");
      check("1 ksi = 6.894757 MPa and 1 in = 25.4 mm", Math.abs(fromDisplay(1, "stress", "US") - 6.894757293) < 1e-8 && fromDisplay(1, "length", "US") === 25.4, "exact factors", "1e-8");
      for (const tab of TABS) {
        const doc = exportJSON(tab, defaults(tab), { displayUnits: "US" });
        const back = importJSON(JSON.stringify(doc));
        check(`JSON export → import round-trip (${TAB_LABELS[tab]})`, JSON.stringify(back.inputs) === JSON.stringify(normalise(tab, defaults(tab))) && back.displayUnits === "US", "inputs identical", "exact");
      }
    }
    // 6. TN 2661 worked examples (section 7), report values and tolerances.
    {
      const r = solveDiagonal(tn2661Case(1)), K = (x) => x / KSI;
      check("TN 2661 example 1: τ = P/(he t) = 18.8 ksi", rel(K(r.tau), 18.8) < 0.01, `${fmt(K(r.tau))} ksi`, "1 %");
      check("TN 2661 example 1: kss = 5.92 at hc/dc = 1.91 (fig. 12(a) fit)", rel(r.kss, 5.92) < 0.01, `${fmt(r.kss)}`, "1 %");
      check("TN 2661 example 1: τcr = 0.416 ksi", rel(K(r.tauCr), 0.416) < 0.02, `${fmt(K(r.tauCr))} ksi`, "2 %");
      check("TN 2661 example 1: k = 0.680", Math.abs(r.k - 0.68) < 0.005, `${fmt(r.k)}`, "±0.005");
      check("TN 2661 example 1: σU/τ = 0.90 (fig. 14)", rel(Math.abs(r.sigmaUtau), 0.9) < 0.03, `${fmt(Math.abs(r.sigmaUtau))}`, "3 %");
      check("TN 2661 example 1: tan α = 0.81 (fig. 16(a))", rel(r.tanAlpha, 0.81) < 0.03, `${fmt(r.tanAlpha)}`, "3 %");
      check("TN 2661 example 1: Le = 28.0 in (eq. 35)", rel(r.Le / IN, 28.0) < 0.01, `${fmt(r.Le / IN)} in`, "1 %");
      check("TN 2661 example 1: column allowable π²E/(Le/ρ)² = 16.5 ksi", rel(K(r.checks[0].allowable), 16.5) < 0.01, `${fmt(K(r.checks[0].allowable))} ksi`, "1 %");
      check("TN 2661 example 1: σUmax/σU = 1.14 (fig. 15 fit)", rel(r.smaxRatio, 1.14) < 0.02, `${fmt(r.smaxRatio)}`, "2 %");
      check("TN 2661 example 1: C1 = 0.022", Math.abs(r.C1 - 0.022) < 0.005, `${fmt(r.C1)}`, "±0.005");
      check("TN 2661 example 1: C2 = 0.01 at ωd = 1.20 (fig. 18 fit)", Math.abs(r.C2 - 0.01) < 0.01, `${fmt(r.C2)} at ωd ${fmt(r.wd)}`, "±0.01");
      check("TN 2661 example 1: τ'max = 19.2 ksi", rel(K(r.tauMaxPrime), 19.2) < 0.02, `${fmt(K(r.tauMaxPrime))} ksi`, "2 %");
      const r2 = solveDiagonal(tn2661Case(2));
      check("TN 2661 example 2: AUe = 0.0497 in² and AUe/(d t) = 0.0681", rel(r2.AUe / (IN * IN), 0.0497) < 0.01 && rel(r2.AUedt, 0.0681) < 0.01, `${fmt(r2.AUe / (IN * IN))} in², ${fmt(r2.AUedt)}`, "1 %");
      check("TN 2661 example 2: Rh = 0.93 at tU/t = 1.23 (fig. 12(b) fit, lower curve)", rel(r2.Rh, 0.93) < 0.02, `${fmt(r2.Rh)}`, "2 %");
      check("TN 2661 example 2: Rd = 1.62 at tF/t = 3.00 (fig. 12(b) fit, upper curve)", rel(r2.Rd, 1.62) < 0.01, `${fmt(r2.Rd)}`, "1 %");
      check("TN 2661 example 2: τ = 28.56 ksi", rel(K(r2.tau), 28.56) < 0.01, `${fmt(K(r2.tau))} ksi`, "1 %");
      const k2 = kFactor(1.77);
      check("TN 2661 example 2: k = 0.123 at τ/τcr = 1.77 (eq. 27)", Math.abs(k2 - 0.123) < 0.002, `${fmt(k2)}`, "±0.002");
      // The report takes τcr from fig. 12(c) (24S-T3 only); from k onwards the
      // remaining steps are checked at the report's k.
      const a2 = idtAngle({ k: 0.123, tau: r2.tau, E: tn2661Example(2).material.E, nu: 0.32, AUedt: r2.AUedt, twoAFht: Infinity, heavyFlanges: true });
      const su2 = 0.123 * Math.tan(a2.alpha) / (r2.AUedt + 0.5 * (1 - 0.123));
      check("TN 2661 example 2: σU/τ = 0.227 at k = 0.123", rel(su2, 0.227) < 0.03, `${fmt(su2)}`, "3 %");
      const sm2 = smaxRatioFig15(0.123, 7.0 / 9.875).value;
      check("TN 2661 example 2: σUmax/σU = 1.30 (fig. 15 fit)", rel(sm2, 1.3) < 0.02, `${fmt(sm2)}`, "2 %");
      // Eq. (32) with the printed inputs gives 16.27 ksi; the report prints 16.55.
      const tcr2 = 6.70 * 10.6e3 * (0.1043 / 7) ** 2 * (0.93 + 0.5 * (1.62 - 0.93) * (2 / 3) ** 3);
      check("TN 2661 example 2: eq. (32) with the printed inputs vs the printed 16.55 ksi", rel(tcr2, 16.55) < 0.02, `${fmt(tcr2)} ksi (report arithmetic differs by ${fmt(100 * rel(tcr2, 16.55))} %)`, "2 %");
    }
    // 7. Shared column function: Johnson meets Euler tangentially at (KL/r)c.
    {
      const cs = columnStrength(mat, PI * Math.sqrt(2 * mat.E / mat.Fcy));
      check("Johnson and Euler meet at (KL/r)c with σ = Fcy/2", rel(cs.johnson, cs.euler) < 1e-12 && rel(cs.euler, mat.Fcy / 2) < 1e-12, `${fmt(cs.johnson)} = ${fmt(cs.euler)} MPa`, "1e-12");
    }
    return results;
  }

  function fmt(x) {
    if (x == null || !Number.isFinite(x)) return String(x);
    const a = Math.abs(x);
    if (a !== 0 && (a >= 1e6 || a < 1e-3)) return x.toExponential(3);
    return String(+x.toPrecision(4));
  }

  return {
    SCHEMA_VERSION, DISCLAIMER, QUANTITIES, SOURCES, FIT, MATERIAL_PRESETS, K_PRESETS, TABS, TAB_LABELS, INPUT_UNITS,
    InputError, unitLabel, toDisplay, fromDisplay, source, setFigureData, fitErrors,
    kssFig12a, restraintFig12b, smaxRatioFig15, c2Fig18, roStrain, roModuli, rootBracketed, sectionProps,
    columnStrength, tangentModulusStress, solveColumn, columnCurve,
    beamColumnState, beamColumnMax, solveBeamColumn, beamColumnCurves, endsForK, feBuckling, jacobiEigenvalues, cholesky,
    ksClosed, shearPlasticity, solveShear, kFactor, idtAngle, wagner, solveDiagonal, diagonalCurves,
    defaults, normalise, solve, resultRows, exportJSON, importJSON, exportMarkdown, tn2661Example, tn2661Case, selfTests, fmt,
  };
});
