/* LUGJOINT engine: preliminary static sizing of a double-shear lug and pin joint.
 *
 * Method: AFFDL Stress Analysis Manual (Air Force Flight Dynamics Laboratory,
 * October 1986), chapter 9, which follows Melcon & Hoblit and Bruhn. Equation
 * numbers in the trace are that chapter's.
 *
 * Joint: one male (inner) lug, member 2, between two identical female (outer)
 * clevis legs, member 1, joined by one solid pin. Every member has a
 * full-radius end, so e = w/2 and a = e − D/2. Bushings are optional per
 * member. The load is an ultimate tension load at α = 0° (axial) to 90°
 * (transverse) from the lug axis.
 *
 * Units are canonical N, mm and MPa (N/mm²) everywhere in this file; strains
 * and coefficients are dimensionless. Unit conversion is only for display and
 * input.
 *
 * Everything here is a pure function of its arguments: no DOM, no clock, no
 * randomness. The page and the Node tests call the same code.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.LugJoint = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ---------- Units ---------- */

  // Size of one display unit in canonical units (N, mm, MPa).
  const UNITS = {
    force: { N: 1, kN: 1000, lbf: 4.4482216152605, kip: 4448.2216152605 },
    length: { mm: 1, m: 1000, in: 25.4 },
    stress: { MPa: 1, Pa: 1e-6, GPa: 1000, psi: 0.00689475729316836, ksi: 6.89475729316836 },
  };
  const PRESETS = [
    { id: "N-mm-MPa", label: "N · mm · MPa", units: { force: "N", length: "mm", stress: "MPa" } },
    { id: "N-m-Pa", label: "N · m · Pa", units: { force: "N", length: "m", stress: "Pa" } },
    { id: "lbf-in-psi", label: "lbf · in · psi", units: { force: "lbf", length: "in", stress: "psi" } },
    { id: "kip-in-ksi", label: "kip · in · ksi", units: { force: "kip", length: "in", stress: "ksi" } },
  ];
  const DEFAULT_UNITS = { force: "N", length: "mm", stress: "MPa" };

  function unitFactor(kind, unit) {
    const f = UNITS[kind] && UNITS[kind][unit];
    if (!f) throw new Error(`unknown ${kind} unit: ${unit}`);
    return f;
  }
  // kind is "force", "length", "stress" or "none".
  function toCanonical(value, kind, unit) {
    if (value == null || kind === "none") return value;
    return value * unitFactor(kind, unit);
  }
  function fromCanonical(value, kind, unit) {
    if (value == null || kind === "none") return value;
    return value / unitFactor(kind, unit);
  }
  function presetOf(units) {
    const p = PRESETS.find((q) => q.units.force === units.force && q.units.length === units.length && q.units.stress === units.stress);
    return p ? p.id : null;
  }

  /* ---------- Input fields ---------- */

  // Every numeric input, with its quantity kind. Member fields appear once for
  // the female legs (member 1) and once for the male lug (member 2).
  const MEMBER_FIELDS = [
    { key: "t", kind: "length", label: "t", help: "Thickness" },
    { key: "w", kind: "length", label: "w", help: "Width at the hole (full-radius end, so e = w/2)" },
    { key: "wT", kind: "length", label: "w_T", help: "Tang width; blank means w" },
    { key: "Ftux", kind: "stress", label: "Ftux", help: "Cross-grain ultimate tensile stress" },
    { key: "Ftyx", kind: "stress", label: "Ftyx", help: "Cross-grain tensile yield stress" },
    { key: "Ftu", kind: "stress", label: "Ftu", help: "Ultimate tensile stress, load direction" },
    { key: "Fty", kind: "stress", label: "Fty", help: "Tensile yield stress, load direction" },
    { key: "E", kind: "stress", label: "E", help: "Young's modulus (for the Kn lookup)" },
    { key: "eu", kind: "none", label: "εu", help: "Ultimate strain, as a fraction (0.12 = 12%)" },
    { key: "Fbru", kind: "stress", label: "Fbru", help: "Ultimate bearing stress at e/D = 2.0" },
    { key: "Fbry", kind: "stress", label: "Fbry", help: "Yield bearing stress at e/D = 2.0" },
    { key: "FtuT", kind: "stress", label: "Ftu.T", help: "Tang ultimate tensile stress" },
    { key: "kbT", kind: "none", label: "kb.T", help: "Tang plastic bending coefficient" },
    { key: "K", kind: "none", label: "K", help: "Axial bearing coefficient, Fig. 9-2" },
    { key: "Kn", kind: "none", label: "Kn", help: "Net-tension coefficient, Fig. 9-4" },
    { key: "havD", kind: "none", label: "hav/D", help: "Effective edge distance ratio, Fig. 9-10" },
    { key: "Ktru", kind: "none", label: "Ktru", help: "Transverse ultimate coefficient, Fig. 9-8" },
    { key: "Ktry", kind: "none", label: "Ktry", help: "Transverse yield coefficient, Fig. 9-8" },
    { key: "B", kind: "none", label: "B", help: "Ductility factor at εu, Fig. 9-17 (only if εu < 5%)" },
    { key: "B005", kind: "none", label: "B0.05", help: "Ductility factor at εu = 0.05, Fig. 9-17 (only if εu < 5%)" },
    { key: "FcyB", kind: "stress", label: "Fcy.B", help: "Bushing compressive yield stress" },
  ];
  const GEOMETRY_FIELDS = [
    { key: "D", kind: "length", label: "D", help: "Hole diameter, or bushing outside diameter" },
    { key: "DP", kind: "length", label: "D_P", help: "Pin diameter" },
    { key: "g", kind: "length", label: "g", help: "Gap between each female leg and the male lug" },
  ];
  const LOAD_FIELDS = [
    { key: "P", kind: "force", label: "P_ult", help: "Ultimate applied load (resultant)" },
    { key: "alpha", kind: "none", label: "α (°)", help: "Load angle from the lug axis, 0 axial to 90 transverse" },
    { key: "uf", kind: "none", label: "Ultimate factor", help: "Ultimate ÷ limit load" },
    { key: "ff", kind: "none", label: "Fitting factor", help: "Fitting factor" },
    { key: "af", kind: "none", label: "Additional factor", help: "Any further factor" },
  ];
  const PIN_FIELDS = [
    { key: "FtuP", kind: "stress", label: "Ftu.P", help: "Pin ultimate tensile stress" },
    { key: "FsuP", kind: "stress", label: "Fsu.P", help: "Pin ultimate shear stress" },
    { key: "kbP", kind: "none", label: "kb.P", help: "Pin plastic bending coefficient" },
  ];
  const SECTIONS = { geometry: GEOMETRY_FIELDS, load: LOAD_FIELDS, pin: PIN_FIELDS, female: MEMBER_FIELDS, male: MEMBER_FIELDS };

  /* ---------- Formula references ---------- */

  // One row per formula in the trace. The Bruhn/Niu column starts empty and
  // flagged "not cross-checked" until a reference is entered.
  const FORMULAS = [
    { id: "cap", affdl: "Eqs. 9-3, 9-6, 9-9 (1.304)", text: "cap = ultimate factor ÷ fitting factor" },
    { id: "9-1", affdl: "Eq. 9-1a/b", text: "Fbru.L = K(a/D)Ftux (e/D < 1.5); K·Ftux (e/D ≥ 1.5)" },
    { id: "9-2", affdl: "Eq. 9-2a/b", text: "Fbry.L = K(a/D)Ftyx (e/D < 1.5); K·Ftyx (e/D ≥ 1.5)" },
    { id: "9-3", affdl: "Eq. 9-3a/b", text: "Pbru.L = Fbru.L·D·t, or cap·Fbry.L·D·t if Ftux > cap·Ftyx; Pbru.L/Dt ≤ Fbru and cap·Fbry" },
    { id: "9-4", affdl: "Eq. 9-4", text: "Fnu.L = Kn·Ftu" },
    { id: "9-5", affdl: "Eq. 9-5", text: "Fny.L = Kn·Fty (printed Ku, read as Kn)" },
    { id: "9-6", affdl: "Eq. 9-6a/b", text: "Pnu.L = Fnu.L(w − D)t, or cap·Fny.L(w − D)t if Ftu > cap·Fty" },
    { id: "9-7", affdl: "Eq. 9-7", text: "Pu.L = min(Pbru.L, Pnu.L)" },
    { id: "9-9", affdl: "Eqs. 9-8, 9-9", text: "Pu.B = cap·Fcy.B·D_P·t" },
    { id: "9-10", affdl: "Eq. 9-10", text: "Pu.L.B = min(Pu.L, Pu.B)" },
    { id: "9-11", affdl: "Eq. 9-11", text: "Pu.L.B(joint) = min(2·Pu.L.B.1, Pu.L.B.2)" },
    { id: "9-12", affdl: "Eq. 9-12", text: "Pus.P = 1.571·D_P²·Fsu.P" },
    { id: "9-13", affdl: "Eq. 9-13", text: "M_max = (P/2)(t1/2 + t2/4 + g)" },
    { id: "9-15", affdl: "Eqs. 9-14, 9-15", text: "Pub.P = 0.1963·kb.P·D_P³·Ftu.P ÷ (t1/2 + t2/4 + g)" },
    { id: "9-16", affdl: "Eq. 9-16", text: "Pub.P.max = 2C[√((Pub.P/C)(t1/2 + t2/4 + g) + g²) − g], C = Pu.L.B.1·Pu.L.B.2 ÷ (Pu.L.B.1·t2 + Pu.L.B.2·t1)" },
    { id: "9-18", affdl: "Eq. 9-18a/b", text: "b1.min = min(t1, Pub.P.max·t1 ÷ (2·Pu.L.B.1)); 2b2.min = min(t2, Pub.P.max·t2 ÷ Pu.L.B.2)" },
    { id: "9-19", affdl: "Eq. 9-19a/b", text: "Pall = min(Pu.L.B, Pus.P), or min(Pus.P, Pub.P.max, Pu.L.B) when the pin is weak in bending" },
    { id: "9-20", affdl: "Eq. 9-20a/b", text: "P_T = 2·Ftu.T·w_T1·t1; Ftu.T·w_T2·t2" },
    { id: "9-22", affdl: "Eq. 9-22a/b", text: "P_T = 2·Ftu.T·w_T1·t1 ÷ [1 + (3/kb.T)(1 − b1.min/t1)]; Ftu.T·w_T2·t2" },
    { id: "9-28", affdl: "Eqs. 9-28, 9-29", text: "Fbru.L = Ktru·Ftux; Fbry.L = Ktry·Ftyx" },
    { id: "9-30", affdl: "Eq. 9-30a/b", text: "Ptru.L = Fbru.L·D·t, or cap·Fbry.L·D·t if Ftux > cap·Ftyx" },
    { id: "9-31", affdl: "Eq. 9-31", text: "(P/Pu.L)^1.6 + (Ptr/Ptru.L)^1.6 = 1; FS = [(P/Pu.L)^1.6 + (Ptr/Ptru.L)^1.6]^(−1/1.6)" },
    { id: "9.11", affdl: "Sec. 9.11", text: "Oblique joint: each member's oblique lug strength replaces Pu.L in Eq. 9-10; the pin takes the resultant" },
    { id: "9.15", affdl: "Sec. 9.15", text: "εu < 5%: bearing allowables × B/B0.05" },
    { id: "fs", affdl: "(load factors)", text: "FSu = capped allowable ÷ (P·ff·af); FSy = uncapped yield allowable ÷ (P/uf·ff·af); MS = FS − 1" },
  ];

  /* ---------- Default input: the Sec. 9.6 worked example, converted to SI ---------- */

  const IN = 25.4, PSI = UNITS.stress.psi, LBF = UNITS.force.lbf;
  const r6 = (x) => +x.toPrecision(6);
  const ksi = (x) => r6(x * 1000 * PSI);
  const inch = (x) => r6(x * IN);

  // Table 9-1. Fbru/Fbry at e/D = 2.0 are not listed there; the MIL-HDBK-5
  // style values below are typical plate values entered only so the e/D = 2.0
  // bearing limit has something to check against, and they do not govern.
  function example96() {
    return {
      version: 1,
      units: { ...DEFAULT_UNITS },
      geometry: { D: inch(1.0), DP: inch(0.75), g: inch(0.10) },
      load: { P: r6(30000 * LBF), alpha: 0, uf: 1.5, ff: 1.15, af: 1.0 },
      pin: { FtuP: ksi(125), FsuP: ksi(82), kbP: 1.56 },
      female: {
        t: inch(0.50), w: inch(2.50), wT: inch(2.50), bushed: true,
        Ftux: ksi(64), Ftyx: ksi(40), Ftu: ksi(64), Fty: ksi(40), E: ksi(10500), eu: 0.12,
        Fbru: ksi(128), Fbry: ksi(83), FtuT: ksi(64), kbT: 1.4,
        K: 1.46, Kn: 0.74, havD: null, Ktru: null, Ktry: null, B: null, B005: null, FcyB: ksi(60),
      },
      male: {
        t: inch(0.75), w: inch(3.00), wT: inch(3.00), bushed: true,
        Ftux: ksi(77), Ftyx: ksi(66), Ftu: ksi(77), Fty: ksi(66), E: ksi(10300), eu: 0.06,
        Fbru: ksi(148), Fbry: ksi(106), FtuT: ksi(77), kbT: 1.4,
        K: 1.33, Kn: 0.87, havD: null, Ktru: null, Ktry: null, B: null, B005: null, FcyB: ksi(60),
      },
      refs: {},
    };
  }

  // The expected lines of the Sec. 9.6 example that are consistent with the
  // chapter's own equations, in lbf. Asserted at 1%.
  const EXAMPLE_96_EXPECT = [
    { id: "female-bearing", label: "Female lug bearing, Pbru.L.1 (Eqs. 9-2a, 9-3b)", lbf: 28600, get: (r) => r.members.female.Pbru },
    { id: "male-bushing", label: "Male bushing, Pu.B.2 (Eq. 9-9)", lbf: 44000, get: (r) => r.members.male.PuB },
    { id: "pin-shear", label: "Pin shear, Pus.P (Eq. 9-12)", lbf: 72400, get: (r) => r.joint.Pus },
    { id: "pin-bending", label: "Pin bending, Pub.P (Eq. 9-15)", lbf: 30100, get: (r) => r.joint.Pub },
    { id: "joint", label: "Joint allowable, Pall = Pub.P.max (Eqs. 9-16, 9-19b)", lbf: 37900, get: (r) => r.joint.Pall },
  ];

  // The captain's own reference cases, run by selfTests() in the page and in
  // the Node tests on top of the Sec. 9.6 example. Each case is
  //   { name, input: <partial input in N, mm, MPa; missing fields take the
  //     Sec. 9.6 values>, expect: [{ path: "joint.Pall", value: <N>, tol: 0.01 }] }
  // where path is read from the solve() result.
  const REFERENCE_CASES = [];

  /* ---------- Validation ---------- */

  const num = (x) => typeof x === "number" && Number.isFinite(x);
  const MEMBER_NAMES = { female: "Female leg", male: "Male lug" };

  // Returns { errors: [{field, message}], warnings: [{field, message}] }.
  // Errors block the calculation; warnings are printed with the results.
  function validate(input) {
    const errors = [], warnings = [];
    const err = (field, message) => errors.push({ field, message });
    const warn = (field, message) => warnings.push({ field, message });
    if (!input || typeof input !== "object") return { errors: [{ field: null, message: "No input." }], warnings };
    const G = input.geometry || {}, L = input.load || {}, pin = input.pin || {};
    const need = (sec, key, label, positive = true) => {
      const v = (input[sec] || {})[key];
      if (!num(v)) { err(`${sec}.${key}`, `${label} is missing.`); return false; }
      if (positive && !(v > 0)) { err(`${sec}.${key}`, `${label} must be greater than zero.`); return false; }
      return true;
    };

    // Load.
    if (!num(L.alpha)) err("load.alpha", "α is missing.");
    else if (L.alpha < 0 || L.alpha > 90) err("load.alpha", "α must be between 0° and 90°.");
    need("load", "P", "Ultimate load");
    need("load", "uf", "Ultimate factor");
    need("load", "ff", "Fitting factor");
    need("load", "af", "Additional factor");
    const alpha = num(L.alpha) ? L.alpha : 0;
    const axial = alpha < 90, transverse = alpha > 0;

    // Geometry.
    const okD = need("geometry", "D", "D"), okDP = need("geometry", "DP", "D_P");
    if (!num(G.g)) err("geometry.g", "Gap g is missing.");
    else if (G.g < 0) err("geometry.g", "Gap g cannot be negative.");
    if (okD && okDP && G.DP > G.D) err("geometry.DP", "Impossible geometry: the pin D_P is larger than the hole D.");

    // Pin.
    need("pin", "FtuP", "Pin Ftu.P");
    need("pin", "FsuP", "Pin Fsu.P");
    need("pin", "kbP", "Pin kb.P");

    for (const m of ["female", "male"]) {
      const M = input[m] || {}, name = MEMBER_NAMES[m];
      const f = (key, label, positive) => need(m, key, `${name}: ${label}`, positive);
      const okt = f("t", "t"), okw = f("w", "w");
      if (M.wT != null && M.wT !== "" && !(num(M.wT) && M.wT > 0)) err(`${m}.wT`, `${name}: tang width must be greater than zero.`);
      if (okD && okw && M.w <= G.D) err(`${m}.w`, `${name}: impossible geometry, w must exceed D (full-radius end needs a = w/2 − D/2 > 0).`);
      if (M.bushed && okD && okDP && G.DP >= G.D) err("geometry.DP", `${name}: impossible geometry, a bushing needs D_P smaller than its outside diameter D.`);
      f("FtuT", "Ftu.T");
      f("kbT", "kb.T");
      if (M.bushed) f("FcyB", "Fcy.B (bushed)");
      if (!num(M.eu)) err(`${m}.eu`, `${name}: εu is missing.`);
      else if (!(M.eu > 0)) err(`${m}.eu`, `${name}: εu must be greater than zero.`);
      f("Ftux", "Ftux"); f("Ftyx", "Ftyx"); f("Fbru", "Fbru (e/D = 2.0)"); f("Fbry", "Fbry (e/D = 2.0)");
      if (axial) {
        f("Ftu", "Ftu"); f("Fty", "Fty");
        f("K", "coefficient K (axial component active)"); f("Kn", "coefficient Kn (axial component active)");
      }
      if (transverse) {
        f("Ktru", "coefficient Ktru (transverse component active)"); f("Ktry", "coefficient Ktry (transverse component active)");
      }
      if (num(M.B) !== num(M.B005)) err(`${m}.B`, `${name}: enter both B and B0.05, or neither.`);
      if (num(M.B) && !(M.B > 0)) err(`${m}.B`, `${name}: B must be greater than zero.`);
      if (num(M.B005) && !(M.B005 > 0)) err(`${m}.B005`, `${name}: B0.05 must be greater than zero.`);

      // Warnings that still compute.
      if (okD && okt && G.D / M.t > 5) warn(`${m}.t`, `${name}: D/t = ${fmt(G.D / M.t)} > 5. Fig. 9-2 is for D/t ≤ 5 and the Fig. 9-3 reduction is not applied (out of scope), so bearing strength is unconservative.`);
      if (okD && okw && M.w > G.D && (M.w / 2) / G.D < 1.5) warn(`${m}.w`, `${name}: e/D = ${fmt(M.w / 2 / G.D)} < 1.5, so shear-out or hoop tension is likely and Eq. 9-1a uses a/D.`);
      if (num(M.eu) && M.eu < 0.05 && !(num(M.B) && num(M.B005))) warn(`${m}.eu`, `${name}: εu = ${fmt(M.eu)} < 5% but B and B0.05 are not entered, so the Sec. 9.15 bearing reduction is not applied (unconservative).`);
    }
    return { errors, warnings };
  }

  /* ---------- Solver ---------- */

  class InputError extends Error {
    constructor(errors) {
      super(errors.map((e) => e.message).join(" "));
      this.name = "InputError";
      this.errors = errors;
    }
  }

  const EXP = 1.6;
  // Allowable resultant under Eq. 9-31: the resultant at angle α whose
  // components sit on the 1.6 curve. Zero components drop out, so α = 0 gives
  // Pax exactly and α = 90° gives Ptr exactly.
  function obliqueAllowable(Pax, Ptr, alphaDeg) {
    const a = (alphaDeg * Math.PI) / 180;
    const c = alphaDeg >= 90 ? 0 : Math.cos(a), s = alphaDeg <= 0 ? 0 : Math.sin(a);
    const sum = (c > 0 ? Math.pow(c / Pax, EXP) : 0) + (s > 0 ? Math.pow(s / Ptr, EXP) : 0);
    return Math.pow(sum, -1 / EXP);
  }
  // Safety factor of a load with axial part P and transverse part Ptr against
  // allowables Pax and Ptr (Eq. 9-31 solved for a proportional scale factor).
  function obliqueFS(P, Ptr, Pax, PtrAll) {
    const sum = (P > 0 ? Math.pow(P / Pax, EXP) : 0) + (Ptr > 0 ? Math.pow(Ptr / PtrAll, EXP) : 0);
    return sum > 0 ? Math.pow(sum, -1 / EXP) : Infinity;
  }

  // The parameters each keyed-in coefficient is read against, shown next to its field.
  function lookupParams(M, G) {
    const D = G.D, e = M.w / 2, a = e - D / 2;
    return {
      K: { "e/D": e / D, "a/D": a / D, "D/t": D / M.t },
      Kn: { "D/w": D / M.w, "Fty/Ftu": M.Fty / M.Ftu, "Ftu/(E·εu)": M.Ftu / (M.E * M.eu) },
      havD: { "e/D": e / D },
      Ktru: { "hav/D": M.havD },
      Ktry: { "hav/D": M.havD },
      B: { "Fty/Ftu": M.Fty / M.Ftu, "εu": M.eu },
      B005: { "Fty/Ftu": M.Fty / M.Ftu, "εu": 0.05 },
    };
  }

  function member(M, G, cap, alpha, key, warnings) {
    const name = MEMBER_NAMES[key];
    const D = G.D, DP = G.DP, t = M.t, w = M.w, wT = num(M.wT) ? M.wT : w;
    const e = w / 2, a = e - D / 2, eD = e / D;
    const lowDuct = M.eu < 0.05, haveB = num(M.B) && num(M.B005);
    const duct = lowDuct && haveB ? M.B / M.B005 : 1;
    const capBr = M.Ftux > cap * M.Ftyx;
    const out = { key, name, D, DP, t, w, wT, e, a, eD, DoverT: D / t, DoverW: D / w, duct, capBr, bushed: !!M.bushed };
    out.lookup = lookupParams(M, G);

    // A component that the load angle does not need is still computed when its
    // coefficients are present, so the interaction diagram and sweep can use it.
    const hasAxial = alpha < 90 || [M.K, M.Kn, M.Ftu, M.Fty].every(num);
    const hasTransverse = alpha > 0 || [M.Ktru, M.Ktry].every(num);
    out.hasAxial = hasAxial; out.hasTransverse = hasTransverse;
    const warnAx = alpha < 90 ? (w) => warnings.push(w) : () => {};
    if (hasAxial) {
      // Axial bearing, Eqs. 9-1 to 9-3, with the Sec. 9.15 ductility factor.
      const kk = eD < 1.5 ? M.K * (a / D) : M.K;
      out.Fbru_L = kk * M.Ftux * duct;
      out.Fbry_L = kk * M.Ftyx * duct;
      let Pbru = capBr ? cap * out.Fbry_L * D * t : out.Fbru_L * D * t;
      let Pbry = out.Fbry_L * D * t;
      const limU = Math.min(M.Fbru, cap * M.Fbry) * D * t, limY = M.Fbry * D * t;
      out.bearingLimited = false;
      if (Pbru > limU) { Pbru = limU; out.bearingLimited = true; warnAx({ field: `${key}.Fbru`, message: `${name}: axial bearing stress capped at the e/D = 2.0 allowables, min(Fbru, cap·Fbry) (Eq. 9-3 note).` }); }
      if (Pbry > limY) { Pbry = limY; out.bearingLimited = true; warnAx({ field: `${key}.Fbry`, message: `${name}: axial yield bearing stress capped at Fbry for e/D = 2.0.` }); }
      out.Pbru = Pbru; out.Pbry = Pbry;
      if (capBr) warnAx({ field: `${key}.Ftux`, message: `${name}: Ftux > cap·Ftyx, so the yield cap governs bearing (Eq. 9-3b).` });

      // Net section, Eqs. 9-4 to 9-6.
      out.capNet = M.Ftu > cap * M.Fty;
      out.Fnu_L = M.Kn * M.Ftu;
      out.Fny_L = M.Kn * M.Fty;
      out.An = (w - D) * t;
      out.Pnu = out.capNet ? cap * out.Fny_L * out.An : out.Fnu_L * out.An;
      out.Pny = out.Fny_L * out.An;
      if (out.capNet) warnAx({ field: `${key}.Ftu`, message: `${name}: Ftu > cap·Fty, so the yield cap governs net tension (Eq. 9-6b).` });
      out.PuL = Math.min(out.Pbru, out.Pnu);
      out.PyL = Math.min(out.Pbry, out.Pny);
    }
    if (hasTransverse) {
      // Transverse bearing, Eqs. 9-28 to 9-30.
      out.Ftru_L = M.Ktru * M.Ftux * duct;
      out.Ftry_L = M.Ktry * M.Ftyx * duct;
      out.Ptru = capBr ? cap * out.Ftry_L * D * t : out.Ftru_L * D * t;
      out.Ptry = out.Ftry_L * D * t;
      if (capBr && alpha >= 90) warnings.push({ field: `${key}.Ftux`, message: `${name}: Ftux > cap·Ftyx, so the yield cap governs transverse bearing (Eq. 9-30b).` });
    }
    // Lug strength at α (Eq. 9-31), ultimate and yield.
    out.Palpha = obliqueAllowable(out.PuL, out.Ptru, alpha);
    out.PalphaY = obliqueAllowable(out.PyL, out.Ptry, alpha);
    if (M.bushed) {
      out.PuB = cap * M.FcyB * DP * t;
      out.PyB = M.FcyB * DP * t;
    }
    out.PuLB = M.bushed ? Math.min(out.Palpha, out.PuB) : out.Palpha;
    out.PyLB = M.bushed ? Math.min(out.PalphaY, out.PyB) : out.PalphaY;
    out.Ftu_T = M.FtuT; out.kbT = M.kbT;
    return out;
  }

  // Solve the joint. Throws InputError when validation reports errors.
  function solve(input) {
    const v = validate(input);
    if (v.errors.length) throw new InputError(v.errors);
    const warnings = v.warnings.slice();
    const G = input.geometry, L = input.load, pin = input.pin;
    const alpha = L.alpha, rad = (alpha * Math.PI) / 180;
    const cap = L.uf / L.ff;
    const cosA = alpha >= 90 ? 0 : Math.cos(rad), sinA = alpha <= 0 ? 0 : Math.sin(rad);

    const f = member(input.female, G, cap, alpha, "female", warnings);
    const m = member(input.male, G, cap, alpha, "male", warnings);
    const t1 = f.t, t2 = m.t, g = G.g, DP = G.DP;

    // Joint, Eqs. 9-11 to 9-19. Under oblique load each member's oblique lug
    // strength has replaced Pu.L in Eq. 9-10 (Sec. 9.11).
    const J = {};
    J.PuLB = Math.min(2 * f.PuLB, m.PuLB);
    J.PyLB = Math.min(2 * f.PyLB, m.PyLB);
    J.lugGoverns = 2 * f.PuLB <= m.PuLB ? "female" : "male";
    J.Pus = (Math.PI / 2) * DP * DP * pin.FsuP;
    J.arm = t1 / 2 + t2 / 4 + g;
    J.Mu = (Math.PI / 32) * pin.kbP * DP ** 3 * pin.FtuP;
    J.Pub = (Math.PI / 16) * pin.kbP * DP ** 3 * pin.FtuP / J.arm;
    J.weakPin = J.Pub < J.PuLB && J.Pub < J.Pus;
    if (J.weakPin) {
      J.C = (f.PuLB * m.PuLB) / (f.PuLB * t2 + m.PuLB * t1);
      J.Pubmax = 2 * J.C * (Math.sqrt((J.Pub / J.C) * J.arm + g * g) - g);
      J.shiftExceedsLug = J.Pubmax > J.PuLB;
      J.b1min = Math.min(t1, (J.Pubmax * t1) / (2 * f.PuLB));
      J.b2min2 = Math.min(t2, (J.Pubmax * t2) / m.PuLB);
      J.Pall = Math.min(J.Pus, J.Pubmax, J.PuLB);
      J.PallEq = "9-19b";
      J.PallMode = J.Pall === J.Pus ? "pin shear" : J.Pall === J.Pubmax ? "pin bending (stage 2)" : `lug-bushing (${MEMBER_NAMES[J.lugGoverns].toLowerCase()})`;
    } else {
      J.Pall = Math.min(J.PuLB, J.Pus);
      J.PallEq = "9-19a";
      J.PallMode = J.PuLB <= J.Pus ? `lug-bushing (${MEMBER_NAMES[J.lugGoverns].toLowerCase()})` : "pin shear";
    }
    // Tangs, Eqs. 9-20 and 9-22, against the axial component only.
    J.PT1_stage1 = 2 * f.Ftu_T * f.wT * t1;
    J.PT2 = m.Ftu_T * m.wT * t2;
    if (J.weakPin) {
      const shift = 1 + (3 / f.kbT) * (1 - J.b1min / t1);
      J.PT1 = J.PT1_stage1 / shift;
      J.tangEq = "9-22";
    } else {
      J.PT1 = J.PT1_stage1;
      J.tangEq = "9-20";
    }

    // Loads. ultimate: P·ff·af; yield: P/uf·ff·af.
    const Pu = L.P * L.ff * L.af, Py = (L.P / L.uf) * L.ff * L.af;
    const loads = { Pu, Py, Pu_ax: Pu * cosA, Pu_tr: Pu * sinA, Py_ax: Py * cosA, Py_tr: Py * sinA, cosA, sinA };

    const rows = [];
    const row = (o) => {
      const r = { yieldAllowable: null, yieldLoad: null, ...o };
      r.FSu = r.ultLoad > 0 ? r.allowable / r.ultLoad : Infinity;
      r.MSu = r.FSu - 1;
      r.FSy = r.yieldAllowable != null && r.yieldLoad > 0 ? r.yieldAllowable / r.yieldLoad : r.yieldAllowable != null ? Infinity : null;
      r.MSy = r.FSy == null ? null : r.FSy - 1;
      rows.push(r);
      return r;
    };
    for (const M of [f, m]) {
      const share = M.key === "female" ? 0.5 : 1; // each female leg carries half
      const who = M.name, eqB = M.eD < 1.5 ? "9-1a, 9-2a" : "9-1b, 9-2b";
      if (alpha < 90) {
        row({ id: `${M.key}-bearing`, group: M.key, mode: `${who}: axial bearing`, eq: `${eqB}, ${M.capBr ? "9-3b" : "9-3a"}`, allowable: M.Pbru, ultLoad: loads.Pu_ax * share, yieldAllowable: M.Pbry, yieldLoad: loads.Py_ax * share, component: "axial" });
        row({ id: `${M.key}-net`, group: M.key, mode: `${who}: net-section tension`, eq: `9-4, 9-5, ${M.capNet ? "9-6b" : "9-6a"}`, allowable: M.Pnu, ultLoad: loads.Pu_ax * share, yieldAllowable: M.Pny, yieldLoad: loads.Py_ax * share, component: "axial" });
      }
      if (alpha > 0) {
        row({ id: `${M.key}-transverse`, group: M.key, mode: `${who}: transverse bearing`, eq: `9-28, 9-29, ${M.capBr ? "9-30b" : "9-30a"}`, allowable: M.Ptru, ultLoad: loads.Pu_tr * share, yieldAllowable: M.Ptry, yieldLoad: loads.Py_tr * share, component: "transverse" });
      }
      if (alpha > 0 && alpha < 90) {
        row({ id: `${M.key}-oblique`, group: M.key, mode: `${who}: oblique interaction`, eq: "9-31", allowable: M.Palpha, ultLoad: loads.Pu * share, yieldAllowable: M.PalphaY, yieldLoad: loads.Py * share, component: "resultant" });
      }
      if (M.bushed) {
        row({ id: `${M.key}-bushing`, group: M.key, mode: `${who}: bushing bearing`, eq: "9-8, 9-9", allowable: M.PuB, ultLoad: loads.Pu * share, yieldAllowable: M.PyB, yieldLoad: loads.Py * share, component: "resultant" });
      }
    }
    row({ id: "joint-lug-bushing", group: "joint", mode: `Joint lug-bushing (${MEMBER_NAMES[J.lugGoverns].toLowerCase()} governs)`, eq: "9-10, 9-11", allowable: J.PuLB, ultLoad: loads.Pu, yieldAllowable: J.PyLB, yieldLoad: loads.Py, component: "resultant" });
    row({ id: "pin-shear", group: "pin", mode: "Pin: double shear", eq: "9-12", allowable: J.Pus, ultLoad: loads.Pu, component: "resultant" });
    row({ id: "pin-bending-1", group: "pin", mode: `Pin bending, stage 1 (uniform bearing)${J.weakPin ? " — superseded by stage 2" : ""}`, eq: "9-13 to 9-15", allowable: J.Pub, ultLoad: loads.Pu, component: "resultant", informative: J.weakPin });
    if (J.weakPin) {
      row({ id: "pin-bending-2", group: "pin", mode: "Pin bending, stage 2 (load shift)", eq: "9-16 to 9-18", allowable: J.Pubmax, ultLoad: loads.Pu, component: "resultant" });
    }
    row({ id: "joint", group: "joint", mode: `Joint allowable, Pall (${J.PallMode})`, eq: J.PallEq, allowable: J.Pall, ultLoad: loads.Pu, component: "resultant", summary: true });
    if (alpha < 90) {
      row({ id: "tang-female", group: "tang", mode: "Female tangs (both legs)", eq: J.weakPin ? "9-22a" : "9-20a", allowable: J.PT1, ultLoad: loads.Pu_ax, component: "axial (assumption)" });
      row({ id: "tang-male", group: "tang", mode: "Male tang", eq: J.weakPin ? "9-22b" : "9-20b", allowable: J.PT2, ultLoad: loads.Pu_ax, component: "axial (assumption)" });
    }

    const modes = rows.filter((r) => !r.summary && !r.informative);
    const minBy = (arr, k) => arr.filter((r) => r[k] != null).reduce((b, r) => (b == null || r[k] < b[k] ? r : b), null);
    const controlling = { ultimate: minBy(modes, "FSu"), yield: minBy(modes, "FSy") };
    if (J.weakPin) warnings.push({ field: "pin.kbP", message: `Pin is weak in bending (Pub.P < Pu.L.B and Pus.P), so the load-shift refinement applies (Eqs. 9-16 to 9-19b) and the female tangs use Eq. 9-22a.` });
    if (J.shiftExceedsLug) warnings.push({ field: "pin.kbP", message: `Pub.P.max exceeds the full-thickness lug-bushing strength Pu.L.B (b1.min > t1 or 2b2.min > t2), so the load-shift refinement is not valid: Pall is capped at Pu.L.B and b1.min, 2b2.min are clamped to t1, t2 for Eq. 9-22a.` });
    if (alpha > 0 && alpha < 90) warnings.push({ field: "load.alpha", message: "Assumption: under oblique load the tangs are checked for the axial component P·cos α only." });

    return {
      input, cap, alpha, loads, members: { female: f, male: m }, joint: J, rows, controlling,
      warnings: dedupe(warnings), trace: trace(input, { f, m, J, cap, loads, alpha }),
    };
  }

  function dedupe(list) {
    const seen = new Set();
    return list.filter((w) => (seen.has(w.message) ? false : (seen.add(w.message), true)));
  }

  /* ---------- Calculation trace ---------- */

  function trace(input, { f, m, J, cap, loads, alpha }) {
    const refs = input.refs || {};
    const out = [];
    const add = (id, quantity, value, kind, detail) => {
      const F = FORMULAS.find((x) => x.id === id);
      const ref = (refs[id] || "").trim();
      out.push({ formula: id, affdl: F ? F.affdl : id, quantity, value, kind, detail: detail || "", ref, crossChecked: ref.length > 0 });
    };
    add("cap", "cap", cap, "none", `${fmt(input.load.uf)} ÷ ${fmt(input.load.ff)}`);
    for (const M of [f, m]) {
      const n = M.key === "female" ? "1" : "2";
      if (M.duct !== 1) add("9.15", `B/B0.05 (${n})`, M.duct, "none", "applied to bearing allowables");
      if (alpha < 90) {
        add("9-1", `Fbru.L.${n}`, M.Fbru_L, "stress", M.eD < 1.5 ? "e/D < 1.5: K(a/D)Ftux" : "e/D ≥ 1.5: K·Ftux");
        add("9-2", `Fbry.L.${n}`, M.Fbry_L, "stress", M.eD < 1.5 ? "K(a/D)Ftyx" : "K·Ftyx");
        add("9-3", `Pbru.L.${n}`, M.Pbru, "force", (M.capBr ? "cap·Fbry.L·D·t (9-3b)" : "Fbru.L·D·t (9-3a)") + (M.bearingLimited ? "; capped at e/D = 2.0 allowables" : ""));
        add("9-4", `Fnu.L.${n}`, M.Fnu_L, "stress", "Kn·Ftu");
        add("9-5", `Fny.L.${n}`, M.Fny_L, "stress", "Kn·Fty");
        add("9-6", `Pnu.L.${n}`, M.Pnu, "force", M.capNet ? "cap·Fny.L(w − D)t (9-6b)" : "Fnu.L(w − D)t (9-6a)");
        add("9-7", `Pu.L.${n}`, M.PuL, "force", "min(Pbru.L, Pnu.L)");
      }
      if (alpha > 0) {
        add("9-28", `Fbru.L.${n} (transverse)`, M.Ftru_L, "stress", "Ktru·Ftux");
        add("9-28", `Fbry.L.${n} (transverse)`, M.Ftry_L, "stress", "Ktry·Ftyx");
        add("9-30", `Ptru.L.${n}`, M.Ptru, "force", M.capBr ? "cap·Fbry.L·D·t (9-30b)" : "Fbru.L·D·t (9-30a)");
      }
      if (alpha > 0 && alpha < 90) add("9-31", `Pα.L.${n}`, M.Palpha, "force", `α = ${fmt(alpha)}°`);
      if (M.bushed) add("9-9", `Pu.B.${n}`, M.PuB, "force", "cap·Fcy.B·D_P·t");
      add(alpha > 0 ? "9.11" : "9-10", `Pu.L.B.${n}`, M.PuLB, "force", M.bushed ? `min(${alpha > 0 ? "Pα.L" : "Pu.L"}, Pu.B)` : `${alpha > 0 ? "Pα.L" : "Pu.L"} (no bushing)`);
    }
    add("9-11", "Pu.L.B", J.PuLB, "force", "min(2·Pu.L.B.1, Pu.L.B.2)");
    add("9-12", "Pus.P", J.Pus, "force", "(π/2)·D_P²·Fsu.P");
    add("9-13", "arm", J.arm, "length", "t1/2 + t2/4 + g");
    add("9-15", "Pub.P", J.Pub, "force", "(π/16)·kb.P·D_P³·Ftu.P ÷ arm");
    if (J.weakPin) {
      add("9-16", "C", J.C, "forcePerLength", "Pu.L.B.1·Pu.L.B.2 ÷ (Pu.L.B.1·t2 + Pu.L.B.2·t1)");
      add("9-16", "Pub.P.max", J.Pubmax, "force", "2C[√((Pub.P/C)·arm + g²) − g]");
      add("9-18", "b1.min", J.b1min, "length", "min(t1, Pub.P.max·t1 ÷ (2·Pu.L.B.1))");
      add("9-18", "2b2.min", J.b2min2, "length", "min(t2, Pub.P.max·t2 ÷ Pu.L.B.2)");
    }
    add("9-19", "Pall", J.Pall, "force", J.weakPin ? `min(Pus.P, Pub.P.max, Pu.L.B) (9-19b${J.shiftExceedsLug ? "; Pub.P.max > Pu.L.B, refinement not valid" : ""})` : "min(Pu.L.B, Pus.P) (9-19a)");
    if (alpha < 90) {
      add(J.weakPin ? "9-22" : "9-20", "P_T.1", J.PT1, "force", J.weakPin ? "2·Ftu.T·w_T1·t1 ÷ [1 + (3/kb.T)(1 − b1.min/t1)]" : "2·Ftu.T·w_T1·t1");
      add(J.weakPin ? "9-22" : "9-20", "P_T.2", J.PT2, "force", "Ftu.T·w_T2·t2");
    }
    add("fs", "P·ff·af", loads.Pu, "force", "factored ultimate load");
    add("fs", "P/uf·ff·af", loads.Py, "force", "factored yield load");
    return out;
  }

  /* ---------- Sweeps and diagrams ---------- */

  // Allowables versus α at the given step, for the angle-sweep chart.
  function sweep(input, step = 1) {
    const points = [];
    for (let a = 0; a <= 90 + 1e-9; a += step) {
      const x = JSON.parse(JSON.stringify(input));
      x.load.alpha = +a.toFixed(6);
      try {
        const r = solve(x);
        const fs = r.controlling.ultimate;
        points.push({ alpha: x.load.alpha, female: 2 * r.members.female.PuLB, male: r.members.male.PuLB, Pall: r.joint.Pall, FSu: fs ? fs.FSu : null, controlling: fs ? fs.mode : null });
      } catch (e) {
        return { points: [], error: e.errors ? e.errors.map((q) => q.message) : [e.message] };
      }
    }
    return { points, error: null };
  }

  // The Eq. 9-31 curve in normalised coordinates (P/Pu.L, Ptr/Ptru.L).
  function interactionCurve(n = 90) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const x = i / n;
      pts.push([x, Math.pow(Math.max(0, 1 - Math.pow(x, EXP)), 1 / EXP)]);
    }
    return pts;
  }

  /* ---------- Serialisation ---------- */

  // JSON files and the URL hash hold the canonical (N, mm, MPa) input.
  function serialize(input) {
    return JSON.stringify(input, null, 2);
  }
  function parse(text) {
    const x = JSON.parse(text);
    return normalise(x);
  }
  function normalise(x) {
    const base = example96();
    if (!x || typeof x !== "object") throw new Error("Input must be a JSON object.");
    const out = { version: 1, units: { ...DEFAULT_UNITS, ...(x.units || {}) }, refs: { ...(x.refs || {}) } };
    for (const k of ["force", "length", "stress"]) if (!UNITS[k][out.units[k]]) out.units[k] = DEFAULT_UNITS[k];
    for (const sec of Object.keys(SECTIONS)) {
      out[sec] = {};
      for (const fd of SECTIONS[sec]) {
        const v = x[sec] ? x[sec][fd.key] : undefined;
        out[sec][fd.key] = v === undefined ? base[sec][fd.key] : v === null || v === "" ? null : Number(v);
      }
    }
    for (const m of ["female", "male"]) out[m].bushed = x[m] && "bushed" in x[m] ? !!x[m].bushed : base[m].bushed;
    for (const k of Object.keys(out.refs)) if (typeof out.refs[k] !== "string") delete out.refs[k];
    return out;
  }
  function toHash(input) {
    return "#s=" + encodeURIComponent(JSON.stringify(input));
  }
  function fromHash(hash) {
    const m = /^#?s=(.*)$/.exec(hash || "");
    if (!m) return null;
    return normalise(JSON.parse(decodeURIComponent(m[1])));
  }

  /* ---------- beamdswitch report ---------- */

  // Words for narration: a deck's ::: narration is read aloud, so it carries no symbols.
  const SPOKEN_UNITS = {
    N: "newtons", kN: "kilonewtons", lbf: "pounds-force", kip: "kips", mm: "millimetres", m: "metres", in: "inches",
    MPa: "megapascals", Pa: "pascals", GPa: "gigapascals", psi: "pounds per square inch", ksi: "kips per square inch",
  };
  // "1.234e+6" is said "1.234 times ten to the 6"; "-0.5" is said "minus 0.5".
  function sayNumber(text) {
    if (text === "∞") return "infinite";
    const m = /^([-+]?)(\d+(?:\.\d+)?)(?:e([+-]?\d+))?$/.exec(String(text));
    if (!m) return String(text);
    const exp = m[3] == null ? "" : ` times ten to the ${Number(m[3]) < 0 ? "minus " : ""}${Math.abs(Number(m[3]))}`;
    return `${m[1] === "-" ? "minus " : ""}${m[2]}${exp}`;
  }
  // The page's FS and MS digits.
  const fsText = (x) => (x == null ? "—" : x === Infinity ? "∞" : x.toFixed(3));
  const msText = (x) => (x == null ? "—" : x === Infinity ? "∞" : (x >= 0 ? "+" : "") + x.toFixed(3));

  /*
   * jointReport(input) describes a solved joint as a report for the standard beamdswitch template
   * (beamdswitch.js; templates/beamdswitch-report.md). Every number is read from solve() and written
   * in input.units with the page's own formatters, so the deck says what the page shows. Under an
   * oblique or transverse load the ::: plot is the Eq. 9-31 interaction curve the page draws.
   * Returns null when the inputs are blocked by errors.
   */
  function jointReport(input) {
    if (validate(input).errors.length) return null;
    const r = solve(input), J = r.joint, f = r.members.female, mm = r.members.male;
    const units = input.units, G = input.geometry, Ld = input.load, pin = input.pin;
    const sym = (kind) => (kind === "forcePerLength" ? `${units.force}/${units.length}` : kind === "none" ? "" : units[kind]);
    const digits = (v, kind) => (v == null || !Number.isFinite(v) ? (v === Infinity ? "∞" : "—") : fmt(fromCanonical(v, kind, units[kind])));
    const show = (v, kind) => (v == null || !Number.isFinite(v) ? digits(v, kind) : `${digits(v, kind)} ${sym(kind)}`);
    const say = (v, kind) => `${sayNumber(digits(v, kind))} ${SPOKEN_UNITS[units[kind]]}`;
    const tex = (v, kind) => `${digits(v, kind)}\\ \\text{${sym(kind)}}`;
    const cu = r.controlling.ultimate, cy = r.controlling.yield, alpha = r.alpha;
    const lower = (s) => s[0].toLowerCase() + s.slice(1);
    const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    const plain = (v) => (v == null ? "—" : fmt(v));

    const memberRows = [["t", "length"], ["w", "length"], ["wT", "length"], ["Ftux", "stress"], ["Ftyx", "stress"], ["Ftu", "stress"], ["Fty", "stress"],
      ["E", "stress"], ["eu", "none"], ["Fbru", "stress"], ["Fbry", "stress"], ["FtuT", "stress"], ["kbT", "none"]]
      .map(([key, kind]) => {
        const label = MEMBER_FIELDS.find((x) => x.key === key).label;
        const cellOf = (M) => (key === "wT" && M.wT == null ? `${show(M.w, kind)} (= w)` : kind === "none" ? plain(M[key]) : show(M[key], kind));
        return `| ${label} | ${cellOf(input.female)} | ${cellOf(input.male)} |`;
      });
    const bushRow = `| Bushing | ${input.female.bushed ? `Fcy.B = ${show(input.female.FcyB, "stress")}` : "none"} | ${input.male.bushed ? `Fcy.B = ${show(input.male.FcyB, "stress")}` : "none"} |`;
    const coefRows = ["K", "Kn", "havD", "Ktru", "Ktry", "B", "B005"].map((key) => `| ${MEMBER_FIELDS.find((x) => x.key === key).label} | ${plain(input.female[key])} | ${plain(input.male[key])} |`);
    const direction = alpha === 0 ? "axial" : alpha === 90 ? "transverse" : "oblique";

    const setup = [
      {
        title: `The joint: D = ${show(G.D, "length")}, pin D_P = ${show(G.DP, "length")}, P_ult = ${show(Ld.P, "force")} at α = ${fmt(alpha)}°`,
        body: [
          "One male lug (member 2) between two identical female clevis legs (member 1) on one solid pin; full-radius ends, so e = w/2.",
          "",
          `- Hole D = ${show(G.D, "length")}, pin D_P = ${show(G.DP, "length")}, gap g = ${show(G.g, "length")}`,
          `- Ultimate load P_ult = ${show(Ld.P, "force")} at α = ${fmt(alpha)}° (${direction}); ultimate factor ${fmt(Ld.uf)}, fitting factor ${fmt(Ld.ff)}, additional factor ${fmt(Ld.af)}`,
          `- Pin: Ftu.P = ${show(pin.FtuP, "stress")}, Fsu.P = ${show(pin.FsuP, "stress")}, kb.P = ${fmt(pin.kbP)}`,
          `- Units: ${units.force}, ${units.length}, ${units.stress}`,
        ].join("\n"),
        notes: "α runs from 0° (axial) to 90° (transverse) from the lug axis. Each female leg carries half the load.",
        narration: `One male lug sits between two female clevis legs on a single pin. The hole is ${say(G.D, "length")} across and the pin ${say(G.DP, "length")}, with a gap of ${say(G.g, "length")}. ` +
          `The ultimate load is ${say(Ld.P, "force")}, ${direction === "axial" ? "along the lug axis" : direction === "transverse" ? "across the lug axis" : `at ${sayNumber(fmt(alpha))} degrees to the lug axis`}, ` +
          `with an ultimate factor of ${sayNumber(fmt(Ld.uf))} and a fitting factor of ${sayNumber(fmt(Ld.ff))}.`,
      },
      {
        title: `The members: female legs t = ${show(input.female.t, "length")} each, male lug t = ${show(input.male.t, "length")}`,
        body: ["| | Female leg (each) | Male lug |", "| --- | --- | --- |", ...memberRows, bushRow].join("\n"),
        notes: "Allowables are the values entered on the page.",
        narration: `Each female leg is ${say(input.female.t, "length")} thick and ${say(input.female.w, "length")} wide at the hole; the male lug is ${say(input.male.t, "length")} thick and ${say(input.male.w, "length")} wide. ` +
          `Their ultimate tensile strengths are ${say(input.female.Ftu, "stress")} and ${say(input.male.Ftu, "stress")}.`,
      },
      {
        title: "Keyed-in coefficients, read from the manual's figures",
        body: ["| Coefficient | Female leg | Male lug |", "| --- | --- | --- |", ...coefRows].join("\n"),
        notes: "K, Kn, hav/D, Ktru, Ktry, B and B0.05 are keyed in by you from AFFDL Figs. 9-2 to 9-17; the results are only as good as those readings.",
        narration: `The bearing coefficient K is ${sayNumber(plain(input.female.K))} for the female legs and ${sayNumber(plain(input.male.K))} for the male lug, ` +
          `and the net-tension coefficient is ${sayNumber(plain(input.female.Kn))} and ${sayNumber(plain(input.male.Kn))}. These are read from the manual's figures, not computed.`,
      },
    ];

    const used = new Set(r.trace.map((t) => t.formula));
    const method = [
      {
        title: `Yield cap ${fmt(r.cap)}; factored loads ${show(r.loads.Pu, "force")} ultimate and ${show(r.loads.Py, "force")} yield`,
        body: [
          `$$ \\text{cap} = \\frac{u_f}{f_f} = \\frac{${fmt(Ld.uf)}}{${fmt(Ld.ff)}} = ${fmt(r.cap)} $$`,
          "",
          `$$ P_u = P \\, f_f \\, a_f = ${tex(r.loads.Pu, "force")} \\qquad P_y = \\frac{P}{u_f} f_f \\, a_f = ${tex(r.loads.Py, "force")} $$`,
          "",
          "$$ FS = \\frac{\\text{allowable}}{\\text{factored load}} \\qquad MS = FS - 1 $$",
        ].join("\n"),
        notes: "Ultimate FS uses the capped allowable against P·ff·af; yield FS uses the uncapped yield allowable against P/uf·ff·af. The pin and the tangs have ultimate checks only.",
        narration: `The yield cap is the ultimate factor over the fitting factor, ${sayNumber(fmt(r.cap))}. ` +
          `The factored ultimate load is ${say(r.loads.Pu, "force")} and the factored yield load ${say(r.loads.Py, "force")}. ` +
          "Each failure mode's safety factor is its allowable over the factored load, and the margin is that factor minus one.",
      },
      {
        title: "AFFDL chapter 9: bearing, net tension, bushing, pin shear, pin bending and tangs",
        // The slide keeps the chain from member to joint by equation number; every formula the trace used goes in the notes.
        body: [
          `- Each member: bearing (Eqs. 9-1 to 9-3) and net tension (9-4 to 9-6), Pu.L = min of the two (9-7)${alpha > 0 ? "; transverse bearing (9-28 to 9-30) and the oblique interaction (9-31)" : ""}`,
          "- Bushing bearing (9-8, 9-9); lug-bushing strength Pu.L.B (9-10)",
          "- Joint: Pu.L.B = min(2·Pu.L.B.1, Pu.L.B.2) (9-11)",
          `- Pin: double shear (9-12) and bending (9-13 to 9-15)${J.weakPin ? ", then the load shift (9-16 to 9-18)" : ""}`,
          `- Joint allowable Pall (${J.PallEq}); tangs (${alpha < 90 ? J.tangEq : "not checked at 90°"})`,
        ].join("\n"),
        notes: "Method: AFFDL Stress Analysis Manual (1986), chapter 9, following Melcon and Hoblit and Bruhn. Not cross-checked against Bruhn or Niu. " +
          `Formulas used: ${FORMULAS.filter((x) => used.has(x.id) && x.id !== "cap" && x.id !== "fs").map((x) => `${x.affdl}, ${x.text}`).join("; ")}.`,
        narration: "Each member is checked in bearing and net-section tension, and in its bushing. " +
          "The joint takes the weaker of twice one female leg and the male lug, then the pin is checked in double shear and in bending" +
          `${J.weakPin ? ", where a pin weak in bending lets the load shift towards the shear planes" : ""}. The tangs are checked last.`,
      },
    ];

    // One table per part of the joint, so each fits on a slide: the female legs, the male lug, then the joint, pin and tangs.
    const modeRow = (row) => `| ${row.mode}${row === cu ? " ◂" : ""} | ${row.eq} | ${digits(row.allowable, "force")} | ${digits(row.ultLoad, "force")} | ${fsText(row.FSu)} | ${msText(row.MSu)} | ${fsText(row.FSy)} | ${msText(row.MSy)} |`;
    const short = (mode) => mode.replace(/^(Female leg|Male lug): /, "");
    const PARTS = [[["female"], "Female legs (each)", "each female leg"], [["male"], "Male lug", "the male lug"], [["joint", "pin", "tang"], "Joint, pin and tangs", "the joint, pin and tangs"]];
    const results = PARTS.map(([groups, name, spoken]) => {
      const rows = r.rows.filter((row) => groups.includes(row.group)), modes = rows.filter((row) => !row.summary && !row.informative);
      const least = modes.reduce((best, row) => (best == null || row.FSu < best.FSu ? row : best), null);
      return {
        title: `${name}: smallest ultimate MS ${msText(least.MSu)}, ${short(least.mode)}`,
        body: [`| Mode | AFFDL | Allowable (${units.force}) | Factored load (${units.force}) | FS ult | MS ult | FS yield | MS yield |`, "| --- | --- | --- | --- | --- | --- | --- | --- |", ...rows.map(modeRow)].join("\n"),
        notes: "◂ marks the controlling ultimate mode. A superseded stage-1 pin bending row is shown for information and does not control. The yield allowables and loads are on the page.",
        narration: `For ${spoken}, ${count(modes.length, "failure mode is", "failure modes are")} checked. ` +
          `The smallest ultimate safety factor is ${sayNumber(fsText(least.FSu))}, in ${lower(short(least.mode))}, a margin of ${sayNumber(msText(least.MSu))}.`,
      };
    });
    results.push(
      {
        title: `Joint allowable Pall = ${show(J.Pall, "force")} (Eq. ${J.PallEq}), ${J.PallMode}`,
        body: [
          J.weakPin
            ? `$$ P_{all} = \\min(P_{us.P},\\ P_{ub.P.max},\\ P_{u.L.B}) = \\min(${digits(J.Pus, "force")},\\ ${digits(J.Pubmax, "force")},\\ ${digits(J.PuLB, "force")}) = ${tex(J.Pall, "force")} $$`
            : `$$ P_{all} = \\min(P_{u.L.B},\\ P_{us.P}) = \\min(${digits(J.PuLB, "force")},\\ ${digits(J.Pus, "force")}) = ${tex(J.Pall, "force")} $$`,
          "",
          `- Lug-bushing Pu.L.B = ${show(J.PuLB, "force")}, ${MEMBER_NAMES[J.lugGoverns].toLowerCase()} governs (Eq. 9-11)`,
          `- Pin shear Pus.P = ${show(J.Pus, "force")} (Eq. 9-12); pin bending Pub.P = ${show(J.Pub, "force")} (Eq. 9-15)${J.weakPin ? `, after load shift Pub.P.max = ${show(J.Pubmax, "force")} (Eq. 9-16)` : ""}`,
        ].join("\n"),
        narration: `The joint allowable is ${say(J.Pall, "force")}, set by ${J.PallMode}. ` +
          `The lug and bushing together allow ${say(J.PuLB, "force")}, and the pin allows ${say(J.Pus, "force")} in shear and ${say(J.weakPin ? J.Pubmax : J.Pub, "force")} in bending.`,
      },
      {
        title: `Controlling mode: ${cu.mode}, ultimate MS ${msText(cu.MSu)}`,
        body: [
          `$$ FS_u = \\frac{${tex(cu.allowable, "force")}}{${tex(cu.ultLoad, "force")}} = ${fsText(cu.FSu)} \\qquad MS_u = ${msText(cu.MSu)} $$`,
          "",
          `- AFFDL Eq. ${cu.eq}`,
          cy ? `- Yield controlled by ${cy.mode} (FS ${fsText(cy.FSy)}, MS ${msText(cy.MSy)})` : "- No yield check applies.",
        ].join("\n"),
        narration: `The controlling ultimate mode is ${lower(cu.mode)}: an allowable of ${say(cu.allowable, "force")} against a factored load of ${say(cu.ultLoad, "force")}, a safety factor of ${sayNumber(fsText(cu.FSu))} and a margin of ${sayNumber(msText(cu.MSu))}.` +
          (cy ? ` In yield, ${lower(cy.mode)} controls, with a margin of ${sayNumber(msText(cy.MSy))}.` : ""),
      },
    );
    if (alpha > 0) {
      const ratio = (M) => (alpha < 90 ? `${digits(M.PuL, "force")} and ${digits(M.Ptru, "force")}` : digits(M.Ptru, "force"));
      results.push({
        title: `Oblique interaction, Eq. 9-31, at α = ${fmt(alpha)}°`,
        body: `$$ \\left(\\frac{P}{P_{u.L}}\\right)^{${EXP}} + \\left(\\frac{P_{tr}}{P_{tru.L}}\\right)^{${EXP}} = 1 $$\n\nAxial and transverse lug strengths Pu.L and Ptru.L, in ${units.force}: female leg ${ratio(f)}; male lug ${ratio(mm)}.`,
        plot: { x: [0, 1], xlabel: "P / Pu.L", ylabel: "Ptr / Ptru.L", curves: [`(1 - x^${EXP})^(1/${EXP})`] },
        narration: `Under a load at ${sayNumber(fmt(alpha))} degrees, each member's axial and transverse strengths combine on this curve, with exponent ${sayNumber(String(EXP))}. ` +
          `The male lug's combined strength is ${say(mm.Palpha, "force")} and one female leg's ${say(f.Palpha, "force")}.`,
      });
    }

    const tests = selfTests(), passed = tests.filter((t) => t.pass).length;
    const checks = [
      {
        title: `Self-tests: ${passed} of ${tests.length} pass`,
        body: ["- The Sec. 9.6 worked example in SI against the chapter's governing lines at 1%", "- The Eq. 9-31 interaction checks", ...tests.filter((t) => !t.pass).map((t) => `- Fails: ${t.name}`)].join("\n"),
        narration: `The page's self-tests run ${tests.length} checks, including the manual's worked example to within one percent, and ${passed === tests.length ? "all of them pass" : `${passed} pass while ${tests.length - passed} fail`}.`,
      },
      {
        title: r.warnings.length ? `${r.warnings.length} ${r.warnings.length === 1 ? "warning" : "warnings"} from the page` : "No warnings from the page",
        body: r.warnings.length ? r.warnings.map((w) => `- ${w.message}`).join("\n") : "- None.",
        narration: r.warnings.length ? `The page raises ${r.warnings.length} ${r.warnings.length === 1 ? "warning" : "warnings"}, listed on this slide.` : "The page raises no warnings for this joint.",
      },
      {
        title: "Takeaway",
        key: `Joint allowable **Pall = ${show(J.Pall, "force")}** (Eq. ${J.PallEq}, ${J.PallMode}). Controlling mode: ${cu.mode}, FS ${fsText(cu.FSu)}, MS ${msText(cu.MSu)}. Preliminary sizing only.`,
        narration: `The joint allows ${say(J.Pall, "force")}. Its smallest ultimate margin is ${sayNumber(msText(cu.MSu))}, in ${lower(cu.mode)}. This is preliminary sizing only, so check every result independently.`,
      },
    ];

    return {
      meta: { title: `Lug and pin joint: ${direction} load at α = ${fmt(alpha)}°`, subtitle: `Pall = ${show(J.Pall, "force")}; controlling mode ${cu.mode}, MS ${msText(cu.MSu)}` },
      notes: "Preliminary-sizing tool only. It is not a certified stress analysis and has not been checked against Bruhn or Niu.",
      narration: `This report sizes a double-shear lug and pin joint by the Air Force stress analysis manual, chapter 9. Forces are in ${SPOKEN_UNITS[units.force]}, lengths in ${SPOKEN_UNITS[units.length]} and stresses in ${SPOKEN_UNITS[units.stress]}.`,
      setup, method, results, checks,
    };
  }

  /* ---------- Self-tests ---------- */

  function selfTests() {
    const results = [];
    const check = (name, pass, detail) => results.push({ name, pass: !!pass, detail });
    const within = (a, b, tol) => Math.abs(a - b) <= tol * Math.abs(b);

    // Sec. 9.6 worked example, run in SI and compared in lbf at 1%.
    let r = null;
    try { r = solve(example96()); } catch (e) { check("Sec. 9.6 example solves", false, e.message); }
    if (r) {
      for (const x of EXAMPLE_96_EXPECT) {
        const got = x.get(r) / LBF;
        check(`Sec. 9.6: ${x.label}`, within(got, x.lbf, 0.01), `${fmt(got)} lbf vs ${x.lbf} lbf (1%)`);
      }
      check("Sec. 9.6: pin is weak in bending, stage 2 governs", r.joint.weakPin && r.joint.PallEq === "9-19b", `Pub.P ${fmt(r.joint.Pub / LBF)} < Pu.L.B ${fmt(r.joint.PuLB / LBF)} and Pus.P ${fmt(r.joint.Pus / LBF)} lbf`);
    }

    for (const rc of REFERENCE_CASES) {
      let rr = null;
      try { rr = solve(normalise(rc.input)); } catch (e) { check(`${rc.name}: solves`, false, e.message); continue; }
      for (const x of rc.expect) {
        const got = x.path.split(".").reduce((o, k) => (o == null ? o : o[k]), rr);
        check(`${rc.name}: ${x.path}`, num(got) && within(got, x.value, x.tol ?? 0.01), `${fmt(got)} vs ${fmt(x.value)} (${((x.tol ?? 0.01) * 100)}%)`);
      }
    }

    // Interaction checks with arbitrary distinct allowables.
    const Pax = 1000, Ptr = 700;
    check("Eq. 9-31: α = 0 gives the axial allowable", within(obliqueAllowable(Pax, Ptr, 0), Pax, 1e-12), `${fmt(obliqueAllowable(Pax, Ptr, 0))} vs ${Pax}`);
    check("Eq. 9-31: α = 90° gives the transverse allowable", within(obliqueAllowable(Pax, Ptr, 90), Ptr, 1e-12), `${fmt(obliqueAllowable(Pax, Ptr, 90))} vs ${Ptr}`);
    // Equal allowables at 45°: 2(P cos45°)^1.6 = 1, so P = 2^(−1/1.6)·√2 = 2^(−0.125).
    const p45 = obliqueAllowable(1, 1, 45);
    check("Eq. 9-31: interior point, equal allowables at 45° gives 2^(−1/8)", within(p45, Math.pow(2, -0.125), 1e-12), `${fmt(p45)} vs ${fmt(Math.pow(2, -0.125))}`);
    const a30 = obliqueAllowable(Pax, Ptr, 30), c = a30 * Math.cos(Math.PI / 6), s = a30 * Math.sin(Math.PI / 6);
    const lhs = Math.pow(c / Pax, EXP) + Math.pow(s / Ptr, EXP);
    check("Eq. 9-31: the α = 30° allowable lies on the 1.6 curve", within(lhs, 1, 1e-12), `sum = ${fmt(lhs)}`);
    check("Eq. 9-31: FS form equals allowable ÷ load", within(obliqueFS(0.5 * c, 0.5 * s, Pax, Ptr), 2, 1e-12), `FS = ${fmt(obliqueFS(0.5 * c, 0.5 * s, Pax, Ptr))}`);
    return results;
  }

  function fmt(x) {
    if (x == null || !Number.isFinite(x)) return String(x);
    const a = Math.abs(x);
    if (a !== 0 && (a >= 1e6 || a < 1e-3)) return x.toExponential(3);
    return String(+x.toPrecision(4));
  }

  return {
    UNITS, PRESETS, DEFAULT_UNITS, SECTIONS, MEMBER_FIELDS, GEOMETRY_FIELDS, LOAD_FIELDS, PIN_FIELDS, FORMULAS,
    EXAMPLE_96_EXPECT, REFERENCE_CASES, InputError, lookupParams, unitFactor, toCanonical, fromCanonical, presetOf, example96, validate, solve,
    obliqueAllowable, obliqueFS, sweep, interactionCurve, serialize, parse, normalise, toHash, fromHash, jointReport, selfTests, fmt,
  };
});
