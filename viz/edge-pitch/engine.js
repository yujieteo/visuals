/* EDGEPITCH engine: edge distance, end distance and pitch in riveted and
 * bolted sheet and plate joints.
 *
 * Not for certification. Exploration and preliminary sizing only.
 *
 * Joint: one checked sheet (a single-lap sheet, or the middle plate of a
 * double-shear joint) with `rows` rows of `perRow` fasteners. Row 0 is the
 * end row, at the end distance e_end from the free end; the outer fasteners of
 * every row sit at the side edge distance e_side from the side edges. Every
 * fastener takes an equal share of P. The net section uses the fastener
 * spacing across the load and inter-rivet buckling the spacing along it: p and
 * g with the load across the rows, g and p with it along them.
 *
 * Strength checks report allowable, applied and MS = allowable/applied − 1.
 * Geometric checks report MS_geom = actual/minimum − 1 and are kept apart, so
 * "meets the geometry rule" is never read as "passes strength".
 *
 * Units are canonical N, mm and MPa (N/mm²) everywhere in this file. The SI/US
 * toggle converts only at the input and output boundary.
 *
 * Everything here is a pure function of its arguments: no DOM, no clock, no
 * randomness. The page and the Node tests call the same code.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.EdgePitch = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const SCHEMA_VERSION = 1;
  const KIND = { inputs: "edge-pitch-inputs", results: "edge-pitch-results", vector: "edge-pitch-test-vector" };
  const DISCLAIMER = "Not for certification. Exploration and preliminary sizing only. Loads and allowables are yours; every result must be checked independently before it is relied on for design, manufacture or airworthiness.";

  /* ---------- Units ---------- */

  // Size of one display unit in canonical units (mm, N, MPa).
  const UNITS = {
    SI: { length: { sym: "mm", f: 1 }, force: { sym: "N", f: 1 }, stress: { sym: "MPa", f: 1 } },
    US: { length: { sym: "in", f: 25.4 }, force: { sym: "lbf", f: 4.4482216152605 }, stress: { sym: "ksi", f: 6.89475729316836 } },
  };
  const unitSym = (kind, sys) => (UNITS[sys] && UNITS[sys][kind] ? UNITS[sys][kind].sym : "");
  const toDisplay = (v, kind, sys) => (v == null || !UNITS[sys][kind] ? v : v / UNITS[sys][kind].f);
  const fromDisplay = (v, kind, sys) => (v == null || !UNITS[sys][kind] ? v : v * UNITS[sys][kind].f);

  /* ---------- Sources ---------- */

  const TAGS = {
    niu: { label: "Niu", note: "confirm against your copy" },
    nasa: { label: "NASA: RP-1228", note: "Barrett, Fastener Design Manual (1990)" },
    classical: { label: "classical", note: "textbook mechanics" },
    unsourced: { label: "unsourced default", note: "placeholder, not a book value" },
    user: { label: "user allowable", note: "entered by you" },
  };

  const SOURCES = [
    { id: "rp1228", tag: "nasa", cite: "Barrett, R. T., Fastener Design Manual, NASA Reference Publication 1228, March 1990. NTRS 19900009424.", url: "https://ntrs.nasa.gov/citations/19900009424",
      states: ["p. 21, 'Fastener Edge Distance and Spacing': nominal edge distance 2D from the hole centreline, minimum not less than 1.5D, nominal spacing 4D; buckling between fasteners can be a problem in thin material.",
        "p. 34, 'General Guidelines for Selecting Rivets and Lockbolts': nominal rivet edge distance 2D and linear spacing 4D; the 4D spacing can be increased if sealing or inter-rivet buckling is not a problem."] },
    { id: "niu", tag: "niu", cite: "Niu, M. C. Y., Airframe Stress Analysis and Sizing. Methods only; no table or figure is reproduced. Enter tabulated values from your own copy.", url: null, states: [] },
    { id: "classical", tag: "classical", cite: "Classical strength of materials: net-section tension, shear-out planes, the Cochrane s²/4g stagger rule, and Euler and Johnson column strength.", url: null, states: [] },
  ];

  /* ---------- Inputs ---------- */

  // kind: length | force | stress | ratio | count | enum. pos: must be > 0;
  // nonneg: must be ≥ 0; nullable: null means "derive". tags name TAGS keys.
  const FIELDS = [
    { path: "fastener.type", group: "Fastener", label: "Type", kind: "enum", options: [["solid-rivet", "Solid rivet"], ["blind-rivet", "Blind rivet"], ["bolt", "Bolt"]] },
    { path: "fastener.D", group: "Fastener", label: "Nominal diameter D", sym: "D", kind: "length", pos: true },
    { path: "fastener.Dh", group: "Fastener", label: "Hole diameter D_h", sym: "D_h", kind: "length", pos: true },
    { path: "fastener.head", group: "Fastener", label: "Head", kind: "enum", options: [["protruding", "Protruding"], ["countersunk", "Countersunk"]] },
    { path: "fastener.csk", group: "Fastener", label: "Countersink depth", sym: "c_s", kind: "length", nonneg: true, when: (x) => x.fastener.head === "countersunk" },
    { path: "sheet.t", group: "Sheet or plate", label: "Thickness t", sym: "t", kind: "length", pos: true },
    { path: "sheet.W", group: "Sheet or plate", label: "Width W", sym: "W", kind: "length", pos: true },
    { path: "sheet.shear", group: "Sheet or plate", label: "Layers", kind: "enum", options: [["single", "Single lap (single shear)"], ["double", "Middle plate (double shear)"]] },
    { path: "material.E", group: "Allowables", label: "Young's modulus E", sym: "E", kind: "stress", pos: true, tags: ["user"] },
    { path: "material.nu", group: "Allowables", label: "Poisson's ratio ν", sym: "ν", kind: "ratio", pos: true, tags: ["user"] },
    { path: "material.Ftu", group: "Allowables", label: "F_tu", sym: "F_tu", kind: "stress", pos: true, tags: ["user"] },
    { path: "material.Fty", group: "Allowables", label: "F_ty", sym: "F_ty", kind: "stress", pos: true, tags: ["user"] },
    { path: "material.Fcy", group: "Allowables", label: "F_cy", sym: "F_cy", kind: "stress", pos: true, tags: ["user"] },
    { path: "material.Fsu", group: "Allowables", label: "F_su", sym: "F_su", kind: "stress", pos: true, tags: ["user"] },
    { path: "material.Fbru15", group: "Allowables", label: "F_bru at e/D = 1.5", sym: "F_bru(1.5)", kind: "stress", pos: true, tags: ["user", "niu"] },
    { path: "material.Fbru20", group: "Allowables", label: "F_bru at e/D = 2.0", sym: "F_bru(2.0)", kind: "stress", pos: true, tags: ["user", "niu"] },
    { path: "geometry.pattern", group: "Geometry", label: "Pattern", kind: "enum", options: [["single", "Single row"], ["aligned", "Aligned rows"], ["staggered", "Staggered rows"]] },
    { path: "geometry.rows", group: "Geometry", label: "Rows", sym: "n_r", kind: "count" },
    { path: "geometry.perRow", group: "Geometry", label: "Fasteners per row", sym: "n_f", kind: "count" },
    { path: "geometry.eEnd", group: "Geometry", label: "End distance e_end", sym: "e_end", kind: "length", pos: true },
    { path: "geometry.eSide", group: "Geometry", label: "Side edge distance e_side", sym: "e_side", kind: "length", pos: true },
    { path: "geometry.p", group: "Geometry", label: "Pitch p", sym: "p", kind: "length", pos: true },
    { path: "geometry.g", group: "Geometry", label: "Row spacing g", sym: "g", kind: "length", pos: true, when: (x) => x.geometry.rows > 1 },
    { path: "load.P", group: "Load", label: "Total load P", sym: "P", kind: "force", pos: true },
    { path: "load.share", group: "Load", label: "Share per fastener", kind: "enum", options: [["equal", "Equal share"]] },
    { path: "load.direction", group: "Load", label: "Direction", kind: "enum", options: [["normal", "Across the rows"], ["parallel", "Along the rows"]] },
    { path: "load.sigmaSheet", group: "Load", label: "Compressive sheet stress σ", sym: "σ_c", kind: "stress", nonneg: true, nullable: true },
    { path: "buckling.c", group: "Inter-rivet buckling", label: "End fixity c", sym: "c", kind: "ratio", pos: true, tags: ["niu", "unsourced"] },
    { path: "rules.eDmin", group: "Geometry rules", label: "Minimum e/D", sym: "(e/D)_min", kind: "ratio", pos: true, tags: ["niu", "nasa"] },
    { path: "rules.eDnom", group: "Geometry rules", label: "Nominal e/D", sym: "(e/D)_nom", kind: "ratio", pos: true, tags: ["niu", "nasa"] },
    { path: "rules.pDmin", group: "Geometry rules", label: "Minimum p/D", sym: "(p/D)_min", kind: "ratio", pos: true, tags: ["niu", "unsourced"] },
    { path: "rules.pDtyp", group: "Geometry rules", label: "Typical p/D", sym: "(p/D)_typ", kind: "ratio", pos: true, tags: ["niu", "nasa"] },
    { path: "rules.gDmin", group: "Geometry rules", label: "Minimum g/D", sym: "(g/D)_min", kind: "ratio", pos: true, tags: ["niu", "unsourced"] },
    { path: "rules.cskMax", group: "Geometry rules", label: "Max countersink / t", sym: "c_s/t", kind: "ratio", pos: true, tags: ["unsourced"] },
    { path: "rules.marginal", group: "Geometry rules", label: "Marginal MS band", sym: "MS_m", kind: "ratio", nonneg: true, tags: ["unsourced"] },
  ];
  const FIELD = Object.fromEntries(FIELDS.map((f) => [f.path, f]));

  // The page starts from these numbers. Allowables are round placeholders, not
  // material data: replace them with your own.
  function example() {
    return {
      fastener: { type: "solid-rivet", D: 4.8, Dh: 4.9, head: "protruding", csk: 0 },
      sheet: { t: 1.6, W: 115.2, shear: "single" },
      material: { E: 70000, nu: 0.33, Ftu: 400, Fty: 300, Fcy: 300, Fsu: 250, Fbru15: 600, Fbru20: 750 },
      geometry: { pattern: "aligned", rows: 2, perRow: 5, eEnd: 9.6, eSide: 9.6, p: 24, g: 19.2 },
      load: { P: 10000, share: "equal", direction: "normal", sigmaSheet: null },
      buckling: { c: 1.0 },
      rules: { eDmin: 1.5, eDnom: 2.0, pDmin: 3.0, pDtyp: 4.0, gDmin: 3.0, cskMax: 2 / 3, marginal: 0.1 },
    };
  }

  // Which defaults are placeholders and which a source states.
  const DEFAULT_SOURCES = {
    "rules.eDmin": { tag: "nasa", text: "RP-1228 p. 21: minimum edge distance not less than 1.5D" },
    "rules.eDnom": { tag: "nasa", text: "RP-1228 pp. 21 and 34: nominal edge distance 2D" },
    "rules.pDtyp": { tag: "nasa", text: "RP-1228 pp. 21 and 34: nominal spacing 4D" },
    "rules.pDmin": { tag: "unsourced", text: "placeholder; RP-1228 gives a nominal, not a minimum, spacing" },
    "rules.gDmin": { tag: "unsourced", text: "placeholder" },
    "rules.cskMax": { tag: "unsourced", text: "placeholder (about 2/3 of t)" },
    "rules.marginal": { tag: "unsourced", text: "placeholder colour band for the schematic" },
    "buckling.c": { tag: "unsourced", text: "placeholder (pinned ends, c = 1)" },
    "material.*": { tag: "unsourced", text: "round placeholders, not material allowables" },
  };

  const get = (o, path) => path.split(".").reduce((a, k) => (a == null ? undefined : a[k]), o);
  function set(o, path, v) {
    const keys = path.split(".");
    let a = o;
    for (const k of keys.slice(0, -1)) a = a[k] = a[k] && typeof a[k] === "object" ? a[k] : {};
    a[keys[keys.length - 1]] = v;
  }

  // Fill missing keys from the example so partial files and tool calls work.
  function normalise(x) {
    const base = example();
    const out = example();
    for (const f of FIELDS) {
      const v = get(x || {}, f.path);
      set(out, f.path, v === undefined ? get(base, f.path) : v);
    }
    return out;
  }

  // Convert every dimensional field between canonical SI and display units.
  function convertInputs(x, sys, dir) {
    const out = JSON.parse(JSON.stringify(x));
    for (const f of FIELDS) {
      if (!["length", "force", "stress"].includes(f.kind)) continue;
      const v = get(out, f.path);
      if (typeof v === "number") set(out, f.path, dir === "toDisplay" ? toDisplay(v, f.kind, sys) : fromDisplay(v, f.kind, sys));
    }
    return out;
  }

  /* ---------- Validation ---------- */

  function validate(x) {
    const errors = [];
    const warnings = [];
    const err = (path, message) => errors.push({ path, message });
    if (!x || typeof x !== "object") return { errors: [{ path: null, message: "No input." }], warnings };
    for (const f of FIELDS) {
      const v = get(x, f.path);
      if (f.kind === "enum") {
        if (!f.options.some((o) => o[0] === v)) err(f.path, `${f.label}: choose one of ${f.options.map((o) => o[0]).join(", ")}.`);
        continue;
      }
      if (f.when && !safeWhen(f, x)) continue;
      if (f.nullable && v === null) continue;
      if (typeof v !== "number" || !Number.isFinite(v)) { err(f.path, `${f.label} is missing or not a number.`); continue; }
      if (f.kind === "count" && (!Number.isInteger(v) || v < 1)) err(f.path, `${f.label} must be a whole number of at least 1.`);
      else if (f.pos && v <= 0) err(f.path, `${f.label} must be positive.`);
      else if (f.nonneg && v < 0) err(f.path, `${f.label} must not be negative.`);
    }
    if (errors.length) return { errors, warnings };
    const { fastener: F, sheet: S, material: M, geometry: G, rules: R } = x;
    if (M.nu >= 0.5) err("material.nu", "Poisson's ratio must be below 0.5.");
    if (F.Dh >= G.p) err("geometry.p", "Hole diameter D_h must be smaller than the pitch p.");
    if (G.rows > 1 && F.Dh >= G.g) err("geometry.g", "Hole diameter D_h must be smaller than the row spacing g.");
    if (G.eEnd <= F.Dh / 2) err("geometry.eEnd", "End distance e_end must exceed the hole radius D_h/2.");
    if (G.eSide <= F.Dh / 2) err("geometry.eSide", "Side edge distance e_side must exceed the hole radius D_h/2.");
    if (F.head === "countersunk" && F.csk >= S.t) err("fastener.csk", "Countersink depth must be less than the thickness t.");
    if (G.pattern === "single" && G.rows !== 1) err("geometry.rows", "A single-row pattern has exactly one row.");
    if (alongRows(x) && G.rows < 2) err("load.direction", "Load along the rows needs at least two rows: the row spacing g sets the net-section strip across the load.");
    const need = patternWidth(x);
    if (S.W < need * (1 - 1e-9)) err("sheet.W", `Width W is narrower than the pattern: 2·e_side + (n_f − 1)·p${stagger(x) ? " + p/2" : ""} = ${fmt(need)} mm.`);
    if (errors.length) return { errors, warnings };

    const w = (path, message) => warnings.push({ path, message });
    const eD = G.eEnd / F.D;
    if (eD < 1.5) w("geometry.eEnd", `e_end/D = ${fmt(eD)} is below 1.5, outside the tabulated range for bearing; F_bru is not extrapolated, so bearing is not evaluated.`);
    if (G.eSide / F.D < 1.5) w("geometry.eSide", `e_side/D = ${fmt(G.eSide / F.D)} is below 1.5.`);
    if (G.p / F.D < R.pDmin) w("geometry.p", `p/D = ${fmt(G.p / F.D)} is below the entered minimum ${fmt(R.pDmin)}.`);
    if (G.rows > 1 && G.g / F.D < R.gDmin) w("geometry.g", `g/D = ${fmt(G.g / F.D)} is below the entered minimum ${fmt(R.gDmin)}.`);
    if (G.eEnd / F.D < R.eDmin) w("geometry.eEnd", `e_end/D = ${fmt(eD)} is below the entered minimum ${fmt(R.eDmin)}.`);
    if (G.eSide / F.D < R.eDmin) w("geometry.eSide", `e_side/D = ${fmt(G.eSide / F.D)} is below the entered minimum ${fmt(R.eDmin)}.`);
    if (F.head === "countersunk" && F.csk > R.cskMax * S.t) w("fastener.csk", `Countersink depth is ${fmt(F.csk / S.t)}·t, deeper than the entered limit ${fmt(R.cskMax)}·t.`);
    if (F.Dh < F.D) w("fastener.Dh", "Hole diameter D_h is smaller than the nominal diameter D.");
    const sig = sheetStress(x);
    if (sig > M.Fcy) w("load.sigmaSheet", `Compressive sheet stress ${fmt(sig)} MPa is above F_cy = ${fmt(M.Fcy)} MPa; no fastener spacing prevents inter-rivet buckling.`);
    const bearingStress = x.load.P / (G.rows * G.perRow) / (F.D * S.t);
    if (bearingStress > M.Fcy) w("load.P", `Applied bearing stress ${fmt(bearingStress)} MPa is above F_cy = ${fmt(M.Fcy)} MPa.`);
    if (G.pattern !== "single" && G.rows < 2) w("geometry.rows", `The ${G.pattern} pattern assumes at least two rows; with one row it is checked as a single row.`);
    if (!alongRows(x) && G.perRow < 2) w("geometry.perRow", "Fewer than two fasteners per row: net section uses the plate width W − D_h, not the pitch.");
    if (alongSpacing(x).L == null) w("geometry." + (alongRows(x) ? "perRow" : "rows"), `Only one fastener along the load: inter-rivet buckling needs the spacing ${alongSpacing(x).sym} between fasteners along the load, so it and the maximum spacing are not evaluated.`);
    if (G.rows * G.perRow < 2) w("geometry.perRow", "A single fastener: the pattern checks assume more than one.");
    if (G.rows > 1 && G.g / F.D < 1.5) w("geometry.g", `g/D = ${fmt(G.g / F.D)} is below 1.5, outside the tabulated range for interior-row bearing; F_bru is not extrapolated, so interior-row bearing is not evaluated.`);
    else if (G.rows > 1 && G.g / F.D < 2) w("geometry.g", `g/D = ${fmt(G.g / F.D)}: interior-row bearing uses F_bru at e/D = g/D.`);
    if (alongRows(x)) w("load.direction", "Load along the rows: net section uses the row spacing g across the load; inter-rivet buckling and maximum pitch use the pitch p along it; bearing, shear-out and side edge still take the rows across the load. Treat those as nominal.");
    if (x.material.Fbru20 < x.material.Fbru15) w("material.Fbru20", "F_bru at e/D = 2.0 is below the value at 1.5.");
    if (S.W > need * (1 + 1e-6)) w("sheet.W", `Width W exceeds 2·e_side + (n_f − 1)·p${stagger(x) ? " + p/2" : ""} = ${fmt(need)} mm; the side ligament is checked at e_side.`);
    return { errors, warnings };
  }

  function safeWhen(f, x) {
    try { return f.when(x); } catch (e) { return true; }
  }

  const stagger = (x) => x.geometry.pattern === "staggered" && x.geometry.rows > 1;
  const alongRows = (x) => x.load.direction === "parallel";
  // Spacing across the load: the net-section strip, shared by n strips.
  const acrossSpacing = (x) => (alongRows(x) ? { sym: "g", L: x.geometry.g, n: x.geometry.rows } : { sym: "p", L: x.geometry.p, n: x.geometry.perRow });
  // Spacing along the load: the inter-rivet buckling length (null with one fastener along the load).
  const alongSpacing = (x) => (alongRows(x) ? { sym: "p", L: x.geometry.perRow > 1 ? x.geometry.p : null } : { sym: "g", L: x.geometry.rows > 1 ? x.geometry.g : null });
  const patternWidth = (x) => 2 * x.geometry.eSide + (x.geometry.perRow - 1) * x.geometry.p + (stagger(x) ? x.geometry.p / 2 : 0);
  // Sheet width across the load: W, or 2·e_end + (n_r − 1)·g with the load along the rows.
  const loadedWidth = (x) => (alongRows(x) ? 2 * x.geometry.eEnd + (x.geometry.rows - 1) * x.geometry.g : x.sheet.W);
  const sheetStress = (x) => (x.load.sigmaSheet == null ? x.load.P / (loadedWidth(x) * x.sheet.t) : x.load.sigmaSheet);

  /* ---------- Formulas ---------- */

  // Linear between the user's two values; no extrapolation below 1.5, and the
  // e/D = 2.0 value is held above 2.0.
  function fbru(eD, F15, F20) {
    if (!(eD >= 1.5)) return null;
    if (eD >= 2) return F20;
    if (eD === 1.5) return F15;
    return F15 + ((eD - 1.5) / 0.5) * (F20 - F15);
  }

  // Shared column-strength function: Euler with a Johnson parabola below
  // σ_E = F_cy/2. slenderness = L/ρ; fixity c divides the effective length by √c.
  function columnStrength(E, Fcy, slenderness, c) {
    const le = slenderness / Math.sqrt(c);
    const sigmaE = le > 0 ? (Math.PI * Math.PI * E) / (le * le) : Infinity;
    if (sigmaE <= Fcy / 2) return { sigma: sigmaE, branch: "euler", sigmaE, le };
    return { sigma: Fcy - (Fcy * Fcy * le * le) / (4 * Math.PI * Math.PI * E), branch: "johnson", sigmaE, le };
  }

  // Slenderness L/ρ at which the column strength equals sigma (0 when sigma ≥ F_cy).
  function slendernessFor(E, Fcy, sigma, c) {
    if (!(sigma > 0)) return Infinity;
    if (sigma >= Fcy) return 0;
    const le = sigma <= Fcy / 2 ? Math.PI * Math.sqrt(E / sigma) : ((2 * Math.PI) / Fcy) * Math.sqrt(E * (Fcy - sigma));
    return le * Math.sqrt(c);
  }

  const rho = (t) => t / Math.sqrt(12);
  const ms = (allowable, applied) => (allowable == null || !(applied > 0) ? null : allowable / applied - 1);

  function bearing(eDist, x) {
    const { fastener: F, sheet: S, material: M } = x;
    const eD = eDist / F.D;
    const f = fbru(eD, M.Fbru15, M.Fbru20);
    return { eD, Fbru: f, allowable: f == null ? null : f * F.D * S.t };
  }

  // Net width per strip across the load; staggered rows also try the zig-zag
  // path through one hole in each row (Cochrane s²/4g). Across the rows: strip
  // p, stagger g along the load, gauge p/2. Along the rows: strip g per row,
  // stagger p/2 along the load, gauge g; across the n_r rows a zig-zag has
  // n_r − 1 diagonals and a straight section meets ⌈n_r/2⌉ holes.
  function netWidth(x) {
    const { fastener: F, geometry: G, sheet: S } = x;
    if (alongRows(x)) {
      if (!stagger(x)) return { width: G.g - F.Dh, path: "straight, g − D_h", straight: G.g - F.Dh, zigzag: null };
      const straight = G.g - (Math.ceil(G.rows / 2) / G.rows) * F.Dh;
      const zigzag = G.g - F.Dh + ((G.rows - 1) / G.rows) * (G.p * G.p) / (16 * G.g);
      return zigzag < straight ? { width: zigzag, path: "zig-zag, g − D_h + ((n_r − 1)/n_r)·p²/(16g)", straight, zigzag } : { width: straight, path: "straight, g − (⌈n_r/2⌉/n_r)·D_h", straight, zigzag };
    }
    if (G.perRow < 2) return { width: S.W - F.Dh, path: "plate width W − D_h", straight: S.W - F.Dh, zigzag: null };
    const straight = G.p - F.Dh;
    if (!stagger(x)) return { width: straight, path: "straight, p − D_h", straight, zigzag: null };
    const zigzag = G.p - 2 * F.Dh + ((2 * G.perRow - 1) / (2 * G.perRow)) * (G.g * G.g) / G.p;
    return zigzag < straight ? { width: zigzag, path: "zig-zag, p − 2D_h + ((2n_f − 1)/(2n_f))·g²/p", straight, zigzag } : { width: straight, path: "straight, p − D_h", straight, zigzag };
  }

  function netSection(x) {
    const { geometry: G, sheet: S, material: M, load: L } = x;
    const n = netWidth(x);
    const applied = alongRows(x) || G.perRow > 1 ? L.P / acrossSpacing(x).n : L.P;
    return { ...n, applied, allowable: n.width > 0 ? M.Ftu * n.width * S.t : 0, stress: n.width > 0 ? applied / (n.width * S.t) : Infinity };
  }

  function buckling(len, x) {
    const { sheet: S, material: M, buckling: B } = x;
    const slender = len / rho(S.t);
    return { slenderness: slender, pt: len / S.t, ...columnStrength(M.E, M.Fcy, slender, B.c) };
  }

  function maxPitch(x) {
    const sigma = sheetStress(x);
    return slendernessFor(x.material.E, x.material.Fcy, sigma, x.buckling.c) * rho(x.sheet.t);
  }

  /* ---------- Solve ---------- */

  function check(id, title, kind, allowable, applied, source, formula, extra) {
    return { id, title, kind, allowable, applied, ms: ms(allowable, applied), source, formula, ...extra };
  }

  function solve(input) {
    const x = input;
    const { errors, warnings } = validate(x);
    if (errors.length) return { ok: false, errors, warnings: [] };
    const { fastener: F, sheet: S, material: M, geometry: G, load: L, rules: R } = x;
    const n = G.rows * G.perRow;
    const Pf = L.P / n;
    const strip = G.perRow < 2 ? L.P : L.P / G.perRow;

    const br = bearing(G.eEnd, x);
    const bi = G.rows > 1 ? bearing(G.g, x) : null;
    const sp = alongSpacing(x);
    const soPlane = G.eEnd - F.Dh / 2;
    const net = netSection(x);
    const sideA = (G.eSide - F.Dh / 2) * S.t;
    const sigma = sheetStress(x);
    const bk = sp.L == null ? {} : buckling(sp.L, x);
    const irStatus = sp.L == null ? "one fastener along the load" : sigma > 0 ? null : "no compressive sheet stress";
    const pMax = maxPitch(x);

    const strength = [
      check("bearing", "Bearing (end row)", "force", br.allowable, Pf, ["niu", "user"], "P_br = F_bru(e/D)·D·t, F_bru linear between e/D = 1.5 and 2.0",
        { eD: br.eD, Fbru: br.Fbru, status: br.Fbru == null ? "outside tabulated range" : null }),
      bi && check("bearingInterior", "Bearing (interior rows)", "force", bi.allowable, Pf, ["niu", "user"], "P_br = F_bru(g/D)·D·t, interior rows take e/D = g/D",
        { eD: bi.eD, Fbru: bi.Fbru, status: bi.Fbru == null ? "outside tabulated range" : null }),
      check("shearOut", "Shear-out (end distance)", "force", 2 * soPlane * S.t * M.Fsu, Pf, ["classical", "niu"], "P_so = 2·(e_end − D_h/2)·t·F_su",
        { plane: soPlane, note: "Plane length e_end − D_h/2: confirm the convention against your copy." }),
      check("netSection", "Net section between holes", "force", net.allowable, net.applied, ["classical"], alongRows(x) ? (stagger(x) ? "σ_net = (P/n_r) / (w_net·t), w_net = min(g − (⌈n_r/2⌉/n_r)·D_h, g − D_h + ((n_r − 1)/n_r)·p²/(16g)), load along the rows" : "σ_net = (P/n_r) / ((g − D_h)·t), load along the rows") : stagger(x) ? "σ_net = (P/n_f) / (w_net·t), w_net = min(p − D_h, p − 2D_h + ((2n_f − 1)/(2n_f))·g²/p)" : "σ_net = (P/n_f) / ((p − D_h)·t)",
        { width: net.width, path: net.path, stress: net.stress, straight: net.straight, zigzag: net.zigzag }),
      check("sideEdge", "Side-edge net section", "force", M.Ftu * sideA, strip / 2, ["classical"], "(P/n_f)/2 across (e_side − D_h/2)·t against F_tu",
        { area: sideA, note: "Each ligament beside the edge hole takes half its strip load (tool convention)." }),
      check("interRivet", "Inter-rivet buckling", "stress", irStatus ? null : bk.sigma, sigma, ["classical"], `σ_ir from Euler/Johnson with L = ${sp.sym} (spacing along the load), ρ = t/√12, fixity c`,
        { branch: bk.branch, slenderness: bk.slenderness, sigmaE: bk.sigmaE, derived: L.sigmaSheet == null, status: irStatus }),
      check("maxPitch", alongRows(x) ? "Maximum pitch" : "Maximum row spacing", "length", irStatus ? null : pMax, sp.L, ["classical"], `${sp.sym}_max where σ_ir(${sp.sym}_max) = applied sheet stress`,
        { status: irStatus, governs: false, note: "A length ratio that restates the inter-rivet buckling condition, so it does not set the governing mode." }),
    ].filter(Boolean);
    const mp = strength.find((c) => c.id === "maxPitch");
    if (mp.ms != null && mp.ms < 0) warnings.push({ path: "geometry." + sp.sym, message: `σ_ir = ${fmt(bk.sigma)} MPa is below the applied sheet stress ${fmt(sigma)} MPa at ${sp.sym} = ${fmt(sp.L)} mm; the maximum ${sp.sym === "p" ? "pitch" : "row spacing"} is ${fmt(pMax)} mm.` });

    const geometric = [
      geomCheck("eEndD", "End distance e_end/D", G.eEnd / F.D, R.eDmin, R.eDnom, ["niu", "nasa"]),
      geomCheck("eSideD", "Side edge distance e_side/D", G.eSide / F.D, R.eDmin, R.eDnom, ["niu", "nasa"]),
      geomCheck("pD", "Pitch p/D", G.p / F.D, R.pDmin, R.pDtyp, ["niu", "nasa"]),
    ];
    if (G.rows > 1) geometric.push(geomCheck("gD", "Row spacing g/D", G.g / F.D, R.gDmin, null, ["niu"]));
    if (stagger(x)) geometric.push(geomCheck("diagD", "Diagonal spacing √(g² + (p/2)²)/D", Math.hypot(G.g, G.p / 2) / F.D, R.pDmin, null, ["niu"]));

    const holes = holeMargins(x, strength);
    return {
      ok: true, errors: [], warnings, inputs: x,
      derived: { n, Pf, strip, direction: L.direction, across: acrossSpacing(x), along: sp, loadedWidth: loadedWidth(x), sigmaSheet: sigma, sigmaDerived: L.sigmaSheet == null, rho: rho(S.t), patternWidth: patternWidth(x) },
      strength, geometric,
      governing: governing(strength), governingGeom: governing(geometric),
      holes,
    };
  }

  function geomCheck(id, title, actual, min, typical, source) {
    return { id, title, kind: "ratio", actual, minimum: min, typical, ms: actual / min - 1, ratioToTypical: typical ? actual / typical : null, source };
  }

  function governing(list) {
    let best = null;
    for (const c of list) if (c.ms != null && c.governs !== false && (best == null || c.ms < best.ms)) best = c;
    return best ? { id: best.id, title: best.title, ms: best.ms } : null;
  }

  // Every hole with its own governing margin. End-row holes carry bearing and
  // shear-out at e_end; interior rows carry bearing at e/D = g/D; edge-column
  // holes carry the side-edge check; all carry net section and buckling.
  function holeMargins(x, strength) {
    const G = x.geometry;
    const by = Object.fromEntries(strength.map((c) => [c.id, c]));
    const holes = [];
    for (let r = 0; r < G.rows; r++) {
      for (let i = 0; i < G.perRow; i++) {
        const shift = stagger(x) && r % 2 === 1 ? G.p / 2 : 0;
        const list = [["netSection", by.netSection.ms], ["interRivet", by.interRivet.ms]];
        if (r === 0) list.push(["bearing", by.bearing.ms], ["shearOut", by.shearOut.ms]);
        else list.push(["bearingInterior", by.bearingInterior.ms]);
        const y = G.eSide + i * G.p + shift;
        if (Math.min(y, x.sheet.W - y) <= G.eSide * (1 + 1e-9)) list.push(["sideEdge", by.sideEdge.ms]);
        let gov = null;
        for (const [id, m] of list) if (m != null && (gov == null || m < gov.ms)) gov = { id, ms: m };
        const status = gov == null ? "unknown" : gov.ms < 0 ? "fail" : gov.ms < x.rules.marginal ? "marginal" : "pass";
        holes.push({ row: r, index: i, x: G.eEnd + r * G.g, y, governing: gov, status });
      }
    }
    return holes;
  }

  /* ---------- Sweeps for the plots ---------- */

  function sweepED(x, steps = 60, lo = 1.0, hi = 3.0) {
    const pts = [];
    const Pf = x.load.P / (x.geometry.rows * x.geometry.perRow);
    for (let k = 0; k <= steps; k++) {
      const eD = lo + ((hi - lo) * k) / steps;
      const e = eD * x.fastener.D;
      const br = bearing(e, x);
      const plane = e - x.fastener.Dh / 2;
      pts.push({ eD, bearing: ms(br.allowable, Pf), shearOut: plane > 0 ? ms(2 * plane * x.sheet.t * x.material.Fsu, Pf) : null });
    }
    return pts;
  }

  // Sweeps the pitch p. Across the rows p sets the net-section strip; along
  // the rows it is the buckling length. The other check follows g.
  function sweepPitch(x, steps = 60) {
    const lo = x.fastener.Dh * 1.05;
    const hi = Math.max(x.geometry.p * 2, x.fastener.D * 10);
    const pts = [];
    for (let k = 0; k <= steps; k++) {
      const p = lo + ((hi - lo) * k) / steps;
      const y = { ...x, geometry: { ...x.geometry, p } };
      const net = netSection(y);
      const len = alongSpacing(y).L, sigma = sheetStress(y);
      pts.push({ p, netSection: ms(net.allowable, net.applied), interRivet: len != null && sigma > 0 ? ms(buckling(len, y).sigma, sigma) : null });
    }
    return pts;
  }

  function sweepSlenderness(x, steps = 80) {
    const hi = Math.max(((alongSpacing(x).L ?? x.geometry.p) / x.sheet.t) * 2, 40);
    const pts = [];
    for (let k = 0; k <= steps; k++) {
      const pt = (hi * k) / steps;
      pts.push({ pt, ...buckling(pt * x.sheet.t, x) });
    }
    return pts;
  }

  /* ---------- Assumptions ---------- */

  const ASSUMPTIONS = [
    "Equal load share: every fastener carries P / (n_r · n_f). Load transfer, fastener flexibility and end-fastener peaking are not modelled.",
    "The checked sheet carries the full fastener load: a single-lap sheet, or the middle plate of a double-shear joint. For an outer plate of a double-shear joint, enter half the load.",
    "Row 0, at e_end from the free end, takes bearing and shear-out at e_end; interior rows take bearing at e/D = g/D. Bearing, shear-out and side edge always take the rows across the load.",
    "Load direction: net section uses the fastener spacing across the load and inter-rivet buckling the spacing along it. Across the rows (default): strip p − D_h carrying P/n_f, buckling length g, maximum row spacing. Along the rows: strip g − D_h carrying P/n_r, buckling length p, maximum pitch; spec check 7's 'strip length p' is this case. With one fastener along the load, inter-rivet buckling is not evaluated.",
    "F_bru is linear between your values at e/D = 1.5 and 2.0, is held at the 2.0 value above 2.0, and is not extrapolated below 1.5.",
    "Net section between holes carries the whole strip load at the end row: P/n_f across the rows, P/n_r along them. Staggered rows also try the zig-zag path through one hole of each row (Cochrane s²/4g): across the rows a zig-zag through the 2n_f holes of two rows has 2n_f − 1 diagonals, so p − 2D_h + ((2n_f − 1)/(2n_f))·g²/p per pitch strip; along the rows, where the p/2 offset leaves a straight section ⌈n_r/2⌉ holes and a zig-zag n_r − 1 diagonals across the n_r rows, min(g − (⌈n_r/2⌉/n_r)·D_h, g − D_h + ((n_r − 1)/n_r)·p²/(16g)) per row strip.",
    "Side-edge net section: each ligament beside the edge hole takes half of its pitch strip's load, (P/n_f)/2.",
    "Inter-rivet buckling treats the sheet between fasteners along the load as a column of length g (load across the rows) or p (load along the rows), radius of gyration t/√12 and end fixity c, under the compressive sheet stress: entered, or P over the width across the load times t when left blank (W across the rows; 2·e_end + (n_r − 1)·g along them).",
    "Single-lap and double-shear joints only: no lugs, eccentric loading or prying; no fatigue, fastener strength, preload or torque.",
  ];

  const FORMULAS = [
    { id: "eD", check: "Edge distance ratio", text: "MS_geom = (e/D) / (e/D)_min − 1", source: ["niu", "nasa"], note: "RP-1228 p. 21 states a 1.5D minimum and a 2D nominal edge distance." },
    { id: "pD", check: "Pitch ratio", text: "MS_geom = (p/D) / (p/D)_min − 1; also p/D ÷ typical", source: ["niu", "nasa"], note: "RP-1228 pp. 21 and 34 state a 4D nominal spacing; the minimum is an unsourced default." },
    { id: "bearing", check: "Bearing", text: "P_br = F_bru(e/D) · D · t", source: ["niu", "user"], note: "Confirm against your copy. F_bru values are yours. End row at e/D = e_end/D; interior rows at e/D = g/D." },
    { id: "shearOut", check: "Shear-out", text: "P_so = 2 · (e_end − D_h/2) · t · F_su", source: ["classical"], note: "Two shear planes. The plane-length convention: confirm against your copy (Niu)." },
    { id: "netSection", check: "Net section", text: "σ_net = (P/n_f) / ((p − D_h) · t) ≤ F_tu", source: ["classical"], note: "Load across the rows. Staggered rows: w_net = min(p − D_h, p − 2D_h + ((2n_f − 1)/(2n_f))·g²/p). Load along the rows: σ_net = (P/n_r) / (w_net · t), w_net = g − D_h, or min(g − (⌈n_r/2⌉/n_r)·D_h, g − D_h + ((n_r − 1)/n_r)·p²/(16g)) when staggered." },
    { id: "sideEdge", check: "Side-edge net section", text: "(P/n_f)/2 / ((e_side − D_h/2) · t) ≤ F_tu", source: ["classical"], note: "" },
    { id: "interRivet", check: "Inter-rivet buckling", text: "σ_E = π²E/(L/(ρ√c))²; Johnson σ = F_cy − F_cy²(L/(ρ√c))²/(4π²E) when σ_E > F_cy/2; ρ = t/√12", source: ["classical", "niu"], note: "L is the fastener spacing along the load: g with the load across the rows, p with it along them (spec check 7's 'strip length p'). Fixity c: confirm against your copy." },
    { id: "maxPitch", check: "Maximum pitch", text: "L_max solves σ_ir(L_max) = σ_applied", source: ["classical"], note: "Checked against the spacing along the load: p with the load along the rows, g across them. RP-1228 p. 34: spacing above 4D is acceptable only if sealing or inter-rivet buckling is not a problem." },
  ];

  /* ---------- Export and import ---------- */

  function inputsJSON(x, displayUnits = "SI") {
    return { schemaVersion: SCHEMA_VERSION, kind: KIND.inputs, disclaimer: DISCLAIMER, units: { length: "mm", force: "N", stress: "MPa" }, displayUnits, inputs: x };
  }

  function resultsJSON(x, displayUnits = "SI") {
    const r = solve(x);
    return {
      ...inputsJSON(x, displayUnits), kind: KIND.results,
      ok: r.ok, errors: r.errors, warnings: r.warnings,
      results: r.ok ? { derived: r.derived, strength: r.strength, geometric: r.geometric, governing: r.governing, governingGeom: r.governingGeom, holes: r.holes } : null,
      assumptions: ASSUMPTIONS, formulas: FORMULAS, sources: SOURCES,
    };
  }

  // Accepts inputs JSON, results JSON or a test vector; always canonical SI.
  function parseImport(text) {
    let o;
    try { o = typeof text === "string" ? JSON.parse(text) : text; } catch (e) { throw new Error("Not valid JSON: " + e.message); }
    if (!o || typeof o !== "object" || Array.isArray(o)) throw new Error("Expected a JSON object.");
    if (o.kind != null && !Object.values(KIND).includes(o.kind)) throw new Error(`Unknown file kind "${o.kind}".`);
    if (o.schemaVersion != null && o.schemaVersion > SCHEMA_VERSION) throw new Error(`schemaVersion ${o.schemaVersion} is newer than this tool (${SCHEMA_VERSION}).`);
    if (!o.inputs || typeof o.inputs !== "object") throw new Error("The file has no inputs object.");
    const displayUnits = o.displayUnits === "US" ? "US" : "SI";
    const out = { kind: o.kind || KIND.inputs, inputs: normalise(o.inputs), displayUnits };
    if (out.kind === KIND.vector) {
      if (!Array.isArray(o.expected) || !o.expected.length) throw new Error("A test vector needs a non-empty expected array.");
      out.vector = { name: String(o.name || "User test vector"), inputs: out.inputs, expected: o.expected };
    }
    return out;
  }

  // Expected paths name a result field, e.g. "strength.bearing.allowable" or
  // "geometric.pD.ms"; array entries are looked up by id. tol is relative
  // (absolute when the expected value is 0).
  function lookup(result, path) {
    let a = result;
    for (const k of path.split(".")) {
      if (a == null) return undefined;
      a = Array.isArray(a) ? a.find((c) => c.id === k) : a[k];
    }
    return a;
  }

  function runVector(v) {
    const r = solve(normalise(v.inputs));
    return v.expected.map((e, i) => {
      const name = `${v.name}: ${e.path || "#" + i}`;
      if (!r.ok) return { name, pass: false, detail: "inputs rejected: " + r.errors.map((q) => q.message).join(" ") };
      const got = lookup(r, String(e.path));
      const tol = e.tol == null ? 1e-3 : e.tol;
      const pass = typeof got === "number" && typeof e.value === "number" && Math.abs(got - e.value) <= tol * (e.value === 0 ? 1 : Math.abs(e.value));
      return { name, pass, detail: `got ${fmt(got)}, expected ${fmt(e.value)} (±${tol})` };
    });
  }

  function toMarkdown(x, displayUnits = "SI") {
    const r = solve(x);
    const sys = displayUnits;
    const u = (v, kind) => (v == null ? "—" : `${fmt(toDisplay(v, kind, sys))} ${unitSym(kind, sys)}`.trim());
    const m = (v) => (v == null ? "—" : fmt(v));
    const tags = (list) => list.map((t) => (t === "niu" ? "Niu (confirm against your copy)" : TAGS[t].label)).join(", ");
    const L = [];
    L.push("# Fastener edge margin and pitch report", "", `> **${DISCLAIMER}**`, "");
    L.push(`Units shown: ${sys === "US" ? "in, lbf, ksi" : "mm, N, MPa"}. Stored values are canonical SI (mm, N, MPa).`, "");
    L.push("## Inputs", "", "| Input | Value | Source |", "| --- | --- | --- |");
    for (const f of FIELDS) {
      if (f.when && !safeWhen(f, x)) continue;
      const v = get(x, f.path);
      const shown = f.kind === "enum" ? (f.options.find((o) => o[0] === v) || [v, v])[1] : v === null && f.nullable ? "derived from P/(width across the load · t)" : ["length", "force", "stress"].includes(f.kind) ? u(v, f.kind) : m(v);
      const ds = DEFAULT_SOURCES[f.path] || (f.path.startsWith("material.") ? DEFAULT_SOURCES["material.*"] : null);
      L.push(`| ${f.label} | ${shown} | ${[f.tags ? tags(f.tags) : "", ds ? `default: ${TAGS[ds.tag].label}` : ""].filter(Boolean).join("; ") || "—"} |`);
    }
    L.push("");
    if (!r.ok) {
      L.push("## Errors", "", ...r.errors.map((e) => `- ${e.message}`), "");
    } else {
      L.push("## Strength margins", "", "| Check | Allowable | Applied | MS | Source |", "| --- | --- | --- | --- | --- |");
      for (const c of r.strength) L.push(`| ${c.title} | ${c.allowable == null ? c.status || "—" : u(c.allowable, c.kind)} | ${u(c.applied, c.kind)} | ${m(c.ms)} | ${tags(c.source)} |`);
      const d = r.derived;
      L.push("", `Load ${d.direction === "parallel" ? "along" : "across"} the rows: net section uses ${d.across.sym} = ${u(d.across.L, "length")} across the load; inter-rivet buckling and maximum spacing use ${d.along.sym}${d.along.L == null ? " (not evaluated: one fastener along the load)" : ` = ${u(d.along.L, "length")}`} along it; sheet width across the load ${u(d.loadedWidth, "length")}.`);
      L.push("", `Governing strength mode: **${r.governing ? `${r.governing.title}, MS = ${fmt(r.governing.ms)}` : "none evaluated"}**.`, "");
      L.push("## Geometric margins", "", "Meeting a geometry rule is not the same as passing strength.", "", "| Check | Actual | Minimum | MS_geom | Actual ÷ typical | Source |", "| --- | --- | --- | --- | --- | --- |");
      for (const c of r.geometric) L.push(`| ${c.title} | ${m(c.actual)} | ${m(c.minimum)} | ${m(c.ms)} | ${m(c.ratioToTypical)} | ${tags(c.source)} |`);
      L.push("", `Governing geometric rule: **${r.governingGeom.title}, MS_geom = ${fmt(r.governingGeom.ms)}**.`, "");
    }
    L.push("## Warnings", "", ...(r.warnings.length ? r.warnings.map((w) => `- ${w.message}`) : ["- None."]), "");
    L.push("## Formulas and sources", "", ...FORMULAS.map((f) => `- **${f.check}** — \`${f.text}\` — ${tags(f.source)}${f.note ? `. ${f.note}` : ""}`), "");
    L.push(...SOURCES.map((s) => `- ${s.cite}${s.states.length ? " States: " + s.states.join(" ") : ""}`), "");
    L.push("Defaults tagged *unsourced default* are placeholders, not book values.", "");
    L.push("## Assumptions", "", ...ASSUMPTIONS.map((a) => `- ${a}`), "");
    L.push("---", "", `*${DISCLAIMER}*`, "");
    return L.join("\n");
  }

  /* ---------- beamdswitch report ---------- */

  // Words for narration: a deck's ::: narration is read aloud, so it carries no symbols.
  const SPOKEN_UNITS = { mm: "millimetres", N: "newtons", MPa: "megapascals", in: "inches", lbf: "pounds-force", ksi: "kips per square inch" };
  const SPOKEN_CHECKS = {
    bearing: "bearing at the end row", bearingInterior: "bearing at the interior rows", shearOut: "shear-out", netSection: "net section between holes",
    sideEdge: "side-edge net section", interRivet: "inter-rivet buckling", maxPitch: "the maximum spacing check",
    eEndD: "end distance over diameter", eSideD: "side edge distance over diameter", pD: "pitch over diameter", gD: "row spacing over diameter", diagD: "diagonal spacing over diameter",
  };
  // Plot coefficients: twelve significant figures, far finer than any number the page shows.
  const coef = (v) => String(+v.toPrecision(12));
  // "1.234e+6" is said "1.234 times ten to the 6"; "-0.5" is said "minus 0.5".
  function sayNumber(text) {
    const m = /^(-?)(\d+(?:\.\d+)?)(?:e([+-]?\d+))?$/.exec(String(text));
    if (!m) return String(text);
    const exp = m[3] == null ? "" : ` times ten to the ${Number(m[3]) < 0 ? "minus " : ""}${Math.abs(Number(m[3]))}`;
    return `${m[1] ? "minus " : ""}${m[2]}${exp}`;
  }

  /*
   * jointReport(x, displayUnits, { vectors }) describes a solved joint as a report for the standard
   * beamdswitch template (beamdswitch.js; templates/beamdswitch-report.md). Every number is read from
   * solve() and written with the page's own formatter and units, so the deck says what the page shows.
   * The ::: plot is the solver's bearing and shear-out margins against e_end/D, as sweepED() draws them.
   * Returns null when the inputs are blocked by errors.
   */
  function jointReport(x, displayUnits = "SI", { vectors = [] } = {}) {
    const r = solve(x);
    if (!r.ok) return null;
    const sys = displayUnits === "US" ? "US" : "SI";
    const u = (v, kind) => (v == null ? "—" : `${fmt(toDisplay(v, kind, sys))} ${unitSym(kind, sys)}`);
    const say = (v, kind) => `${sayNumber(fmt(toDisplay(v, kind, sys)))} ${SPOKEN_UNITS[unitSym(kind, sys)]}`;
    const tex = (v, kind) => `${fmt(toDisplay(v, kind, sys))}\\ \\text{${unitSym(kind, sys)}}`;
    const m = (v) => (v == null ? "—" : fmt(v));
    const tags = (list) => list.map((t) => (t === "niu" ? "Niu (confirm against your copy)" : TAGS[t].label)).join(", ");
    const option = (path) => { const f = FIELD[path], v = get(x, path); return (f.options.find((o) => o[0] === v) || [v, v])[1]; };
    const { fastener: F, sheet: S, material: M, geometry: G, load: L, buckling: B, rules: R } = x;
    const d = r.derived, g = r.governing, gg = r.governingGeom;
    const kind = { "solid-rivet": "solid rivets", "blind-rivet": "blind rivets", bolt: "bolts" }[F.type];
    const rowsWord = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    const across = d.direction === "parallel" ? "along" : "across";

    const setup = [
      {
        title: `The joint: ${rowsWord(G.rows, "row", "rows")} of ${G.perRow} ${kind}, D = ${u(F.D, "length")}, t = ${u(S.t, "length")}`,
        body: [
          `- Fastener: ${option("fastener.type").toLowerCase()}, D = ${u(F.D, "length")}, hole D_h = ${u(F.Dh, "length")}, ${option("fastener.head").toLowerCase()} head${F.head === "countersunk" ? ` (countersink ${u(F.csk, "length")})` : ""}`,
          `- Sheet: t = ${u(S.t, "length")}, W = ${u(S.W, "length")}, ${option("sheet.shear").toLowerCase()}`,
          `- Pattern: ${option("geometry.pattern").toLowerCase()}, ${rowsWord(G.rows, "row", "rows")} of ${G.perRow}, e_end = ${u(G.eEnd, "length")}, e_side = ${u(G.eSide, "length")}, p = ${u(G.p, "length")}${G.rows > 1 ? `, g = ${u(G.g, "length")}` : ""}`,
          `- Load: P = ${u(L.P, "force")} ${across} the rows, equal share; compressive sheet stress ${u(d.sigmaSheet, "stress")}${d.sigmaDerived ? " (derived from P over the width across the load times t)" : " (entered)"}`,
          `- Units: ${sys === "US" ? "in, lbf, ksi" : "mm, N, MPa"}`,
        ].join("\n"),
        notes: `Row 0 is the end row, at e_end from the free end; the outer fasteners of every row sit at e_side from the side edges.`,
        narration: `The joint has ${rowsWord(G.rows, "row", "rows")} of ${G.perRow} ${kind}, ${d.n} in all, of diameter ${say(F.D, "length")} in holes of ${say(F.Dh, "length")}. ` +
          `The sheet is ${say(S.t, "length")} thick and ${say(S.W, "length")} wide. ` +
          `The end distance is ${say(G.eEnd, "length")}, the side edge distance ${say(G.eSide, "length")} and the pitch ${say(G.p, "length")}${G.rows > 1 ? `, with rows ${say(G.g, "length")} apart` : ""}. ` +
          `A load of ${say(L.P, "force")} acts ${across} the rows.`,
      },
      {
        title: "Allowables and rules: the values entered on the page",
        body: [
          "| Allowable | Value |", "| --- | --- |",
          ...["material.E", "material.nu", "material.Ftu", "material.Fty", "material.Fcy", "material.Fsu", "material.Fbru15", "material.Fbru20", "buckling.c"].map((p) => {
            const f = FIELD[p], v = get(x, p);
            return `| ${f.label} | ${f.kind === "ratio" ? m(v) : u(v, f.kind)} |`;
          }),
          "",
          `Geometry rules: (e/D)_min = ${m(R.eDmin)}, (e/D)_nom = ${m(R.eDnom)}, (p/D)_min = ${m(R.pDmin)}, (p/D)_typ = ${m(R.pDtyp)}${G.rows > 1 ? `, (g/D)_min = ${m(R.gDmin)}` : ""}.`,
        ].join("\n"),
        notes: "The tool ships with no allowables: its starting numbers are round placeholders, not material data. NASA RP-1228 states a 1.5D minimum and a 2D nominal edge distance and a 4D nominal spacing; the other rules are unsourced defaults.",
        narration: `The allowables are the values entered on the page, not book values. ` +
          `The ultimate tensile strength is ${say(M.Ftu, "stress")}, the ultimate shear strength ${say(M.Fsu, "stress")}, ` +
          `and the bearing strength ${say(M.Fbru15, "stress")} at an edge distance of 1.5 diameters, rising to ${say(M.Fbru20, "stress")} at 2 diameters. ` +
          `The minimum edge distance rule is ${sayNumber(m(R.eDmin))} diameters.`,
      },
    ];

    const method = [
      {
        title: `Equal load share: ${u(d.Pf, "force")} per fastener`,
        body: [
          `$$ P_f = \\frac{P}{n_r n_f} = \\frac{${tex(L.P, "force")}}{${G.rows} \\cdot ${G.perRow}} = ${tex(d.Pf, "force")} $$`,
          "",
          "$$ MS = \\frac{\\text{allowable}}{\\text{applied}} - 1 \\qquad MS_{geom} = \\frac{\\text{actual}}{\\text{minimum}} - 1 $$",
        ].join("\n"),
        notes: ASSUMPTIONS.slice(0, 3).join(" "),
        narration: `Every fastener takes an equal share of the load, ${say(d.Pf, "force")}. ` +
          "Each strength check divides an allowable by the applied load and subtracts one, giving the margin of safety. " +
          "Geometric rules divide a ratio such as end distance over diameter by its minimum, and are kept apart from strength.",
      },
      {
        title: "Strength checks: bearing, shear-out, net section, side edge and inter-rivet buckling",
        body: FORMULAS.filter((f) => !["eD", "pD"].includes(f.id)).map((f) => `- ${f.check}: \`${f.text}\` (${tags(f.source)})`).join("\n"),
        notes: "Bearing interpolates F_bru linearly between your values at e/D = 1.5 and 2.0, holds the 2.0 value above 2.0 and never extrapolates below 1.5. Inter-rivet buckling uses Euler with a Johnson parabola below F_cy/2.",
        narration: "Bearing uses the bearing strength interpolated at the edge distance ratio. Shear-out takes two shear planes from the hole to the free end. " +
          "Net section and the side edge compare the tensile strength with the stress across the ligaments. " +
          "Inter-rivet buckling treats the sheet between fasteners along the load as a short column.",
      },
    ];

    const strengthRows = r.strength.map((c) => `| ${c.title} | ${c.allowable == null ? c.status || "—" : u(c.allowable, c.kind)} | ${u(c.applied, c.kind)} | ${m(c.ms)} |`);
    const evaluated = r.strength.filter((c) => c.ms != null);
    const gov = g && r.strength.find((c) => c.id === g.id);
    const Pf = d.Pf, eD = G.eEnd / F.D, bearingAt = r.strength.find((c) => c.id === "bearing"), shearAt = r.strength.find((c) => c.id === "shearOut");
    const results = [
      {
        title: "Strength margins",
        body: ["| Check | Allowable | Applied | MS |", "| --- | --- | --- | --- |", ...strengthRows].join("\n"),
        notes: `Load ${across} the rows: net section uses ${d.across.sym} = ${u(d.across.L, "length")} across the load; inter-rivet buckling uses ${d.along.sym}${d.along.L == null ? " (not evaluated: one fastener along the load)" : ` = ${u(d.along.L, "length")}`} along it.`,
        narration: evaluated.length
          ? evaluated.map((c) => `${SPOKEN_CHECKS[c.id][0].toUpperCase()}${SPOKEN_CHECKS[c.id].slice(1)} has a margin of ${sayNumber(m(c.ms))}.`).join(" ")
          : "No strength check could be evaluated for this joint.",
      },
      gov
        ? {
          title: `Governing strength mode: ${gov.title}, MS = ${m(gov.ms)}`,
          body: `$$ MS = \\frac{${tex(gov.allowable, gov.kind)}}{${tex(gov.applied, gov.kind)}} - 1 = ${m(gov.ms)} $$\n\n- ${gov.formula}`,
          narration: `The governing strength mode is ${SPOKEN_CHECKS[gov.id]}: an allowable of ${say(gov.allowable, gov.kind)} against ${say(gov.applied, gov.kind)} applied, a margin of ${sayNumber(m(gov.ms))}.`,
        }
        : {
          title: "Governing strength mode: none evaluated",
          body: "No strength check has both an allowable and an applied load for this joint.",
          narration: "No strength check could be evaluated, so no strength mode governs.",
        },
      {
        title: `Margin against end distance: bearing and shear-out at e_end/D = ${m(eD)}`,
        body: `Bearing (first curve) and shear-out (second curve) at the entered load of ${u(Pf, "force")} per fastener. F_bru is not extrapolated below e/D = 1.5.`,
        plot: {
          x: [1.5, 3], xlabel: "e_end / D", ylabel: "MS",
          curves: [
            `(${M.Fbru15} + min(max((x - 1.5) / 0.5, 0), 1) * (${M.Fbru20 - M.Fbru15})) * ${coef((F.D * S.t) / Pf)} - 1`,
            `2 * (x * ${F.D} - ${coef(F.Dh / 2)}) * ${coef((S.t * M.Fsu) / Pf)} - 1`,
          ],
        },
        narration: `The first curve is the bearing margin and the second the shear-out margin, against end distance over diameter. ` +
          `At the entered ratio of ${sayNumber(m(eD))}, bearing ${bearingAt.ms == null ? "is not evaluated" : `has a margin of ${sayNumber(m(bearingAt.ms))}`} and shear-out ${sayNumber(m(shearAt.ms))}.`,
      },
      {
        title: `Geometric margins: ${gg.title}, MS_geom = ${m(gg.ms)}`,
        body: ["Meeting a geometry rule is not the same as passing strength.", "", "| Rule | Actual | Minimum | MS_geom | ÷ typical |", "| --- | --- | --- | --- | --- |",
          ...r.geometric.map((c) => `| ${c.title} | ${m(c.actual)} | ${m(c.minimum)} | ${m(c.ms)} | ${m(c.ratioToTypical)} |`)].join("\n"),
        narration: r.geometric.map((c) => `${SPOKEN_CHECKS[c.id][0].toUpperCase()}${SPOKEN_CHECKS[c.id].slice(1)} is ${sayNumber(m(c.actual))} against a minimum of ${sayNumber(m(c.minimum))}.`).join(" ") +
          ` The governing geometric rule is ${SPOKEN_CHECKS[gg.id]}, with a margin of ${sayNumber(m(gg.ms))}.`,
      },
    ];

    const tests = selfTests(vectors), passed = tests.filter((t) => t.pass).length, failed = tests.filter((t) => !t.pass);
    const checks = [
      {
        title: `Self-test: ${passed} of ${tests.length} checks pass`,
        body: [
          "- Hand calculations for the placeholder joint, the bearing interpolation end points, SI/US round trips and the column function on both branches",
          ...(vectors.length ? [`- ${vectors.length} imported test ${vectors.length === 1 ? "vector" : "vectors"}`] : []),
          ...failed.map((t) => `- Fails: ${t.name}`),
        ].join("\n"),
        narration: `The page's self-test runs ${tests.length} checks, and ${passed === tests.length ? "all of them pass" : `${passed} pass while ${tests.length - passed} fail`}.`,
      },
      {
        title: r.warnings.length ? `${r.warnings.length} ${r.warnings.length === 1 ? "warning" : "warnings"} from the page` : "No warnings from the page",
        body: r.warnings.length ? r.warnings.map((w) => `- ${w.message}`).join("\n") : "- None.",
        narration: r.warnings.length ? `The page raises ${r.warnings.length} ${r.warnings.length === 1 ? "warning" : "warnings"}, listed on this slide.` : "The page raises no warnings for this joint.",
      },
      {
        title: "Takeaway",
        key: `${gov ? `Governing strength mode: **${gov.title}**, MS = ${m(gov.ms)}.` : "No strength mode evaluated."} Governing geometric rule: ${gg.title}, MS_geom = ${m(gg.ms)}. Not for certification.`,
        narration: `${gov ? `The joint's smallest strength margin is ${sayNumber(m(gov.ms))}, in ${SPOKEN_CHECKS[gov.id]}` : "No strength margin could be evaluated"}, ` +
          `and its smallest geometric margin is ${sayNumber(m(gg.ms))}, in ${SPOKEN_CHECKS[gg.id]}. These are exploration results, not for certification.`,
      },
    ];

    return {
      meta: { title: `Edge margin and pitch: ${rowsWord(G.rows, "row", "rows")} of ${G.perRow} ${kind}`, subtitle: gov ? `Governing strength mode: ${gov.title}, MS = ${m(gov.ms)}` : "No strength mode evaluated" },
      notes: DISCLAIMER,
      narration: `This report checks the edge distance, pitch and margins of a fastened sheet joint. Lengths are in ${SPOKEN_UNITS[unitSym("length", sys)]}, forces in ${SPOKEN_UNITS[unitSym("force", sys)]} and stresses in ${SPOKEN_UNITS[unitSym("stress", sys)]}.`,
      setup, method, results, checks,
    };
  }

  /* ---------- Self-tests ---------- */

  // Hand calculation for the example joint, worked by hand:
  //   P_f = 10000/10 = 1000 N; bearing e/D = 9.6/4.8 = 2.0 → 750·4.8·1.6 = 5760 N
  //   interior bearing g/D = 19.2/4.8 = 4.0 → held at 750 → 5760 N
  //   shear-out 2·(9.6 − 2.45)·1.6·250 = 5720 N
  //   net section (24 − 4.9)·1.6·400 = 12224 N against 10000/5 = 2000 N
  //   side edge (9.6 − 2.45)·1.6·400 = 4576 N against 2000/2 = 1000 N
  //   σ = 10000/(115.2·1.6) = 54.253472… MPa; buckling length g: L/ρ = 19.2·√12/1.6 = 41.569…
  //   σ_E = π²·70000/1728 = 399.81 > 150 → Johnson 300 − 300²·1728/(4π²·70000) = 243.7234… MPa
  const HAND = [
    ["strength.bearing.allowable", 5760], ["strength.bearingInterior.allowable", 5760], ["strength.shearOut.allowable", 5720],
    ["strength.netSection.allowable", 12224], ["strength.netSection.applied", 2000],
    ["strength.sideEdge.allowable", 4576], ["strength.sideEdge.applied", 1000],
    ["derived.sigmaSheet", 10000 / (115.2 * 1.6)],
    ["strength.interRivet.allowable", 300 - (300 * 300 * 1728) / (4 * Math.PI * Math.PI * 70000)],
    ["geometric.eEndD.ms", 2 / 1.5 - 1], ["geometric.pD.ms", 5 / 3 - 1],
  ];

  function selfTests(vectors = []) {
    const results = [];
    const test = (name, pass, detail = "") => results.push({ name, pass: !!pass, detail });
    const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

    const x = example();
    const r = solve(x);
    test("example joint solves without errors", r.ok, r.ok ? "" : r.errors.map((e) => e.message).join(" "));
    for (const [path, want] of HAND) {
      const got = r.ok ? lookup(r, path) : NaN;
      test(`hand calculation: ${path}`, close(got, want), `got ${fmt(got)}, expected ${fmt(want)}`);
    }
    const z = { ...x, geometry: { ...x.geometry, pattern: "staggered", g: 8 }, sheet: { ...x.sheet, W: 127.2 } };
    const rz = solve(z);
    test("staggered net section takes the zig-zag path with 2n_f − 1 diagonals", rz.ok && close(lookup(rz, "strength.netSection.width"), 24 - 9.8 + 0.9 * 64 / 24), rz.ok ? `w_net = ${fmt(lookup(rz, "strength.netSection.width"))}` : "");

    for (const [eD, want] of [[1.5, x.material.Fbru15], [2.0, x.material.Fbru20]]) {
      const got = fbru(eD, x.material.Fbru15, x.material.Fbru20);
      test(`bearing interpolation reproduces F_bru at e/D = ${eD} exactly`, got === want, `got ${got}, expected ${want}`);
    }
    test("bearing interpolation is linear at e/D = 1.75", close(fbru(1.75, 600, 750), 675), `got ${fbru(1.75, 600, 750)}`);
    test("bearing is not extrapolated below e/D = 1.5", fbru(1.49, 600, 750) === null);
    test("bearing holds the e/D = 2.0 value above 2.0", fbru(2.6, 600, 750) === 750);

    for (const kind of ["length", "force", "stress"]) {
      const v = 123.456;
      const back = fromDisplay(toDisplay(v, kind, "US"), kind, "US");
      test(`SI → US → SI round trip (${kind})`, close(back, v, 1e-12), `${v} → ${fmt(toDisplay(v, kind, "US"))} ${unitSym(kind, "US")} → ${back}`);
    }
    test("1 in = 25.4 mm, 1 ksi = 6.894757 MPa, 1 lbf = 4.448222 N", toDisplay(25.4, "length", "US") === 1 && close(fromDisplay(1, "stress", "US"), 6.89475729316836) && close(fromDisplay(1, "force", "US"), 4.4482216152605));
    const trip = convertInputs(convertInputs(x, "US", "toDisplay"), "US", "fromDisplay");
    test("whole input set round-trips through US display units", FIELDS.every((f) => { const a = get(trip, f.path), b = get(x, f.path); return typeof b === "number" ? close(a, b, 1e-12) : a === b; }));
    const back = parseImport(JSON.stringify(inputsJSON(x, "US")));
    test("inputs JSON export and import round-trip in canonical SI", JSON.stringify(back.inputs) === JSON.stringify(x) && back.displayUnits === "US");

    const E = 70000, Fcy = 300;
    const euler = columnStrength(E, Fcy, 150, 1);
    test("column function, Euler branch: σ = π²E/(L/ρ)²", euler.branch === "euler" && close(euler.sigma, (Math.PI * Math.PI * E) / (150 * 150)), `σ = ${fmt(euler.sigma)} MPa`);
    const johnson = columnStrength(E, Fcy, 40, 1);
    test("column function, Johnson branch: σ = F_cy − F_cy²(L/ρ)²/(4π²E)", johnson.branch === "johnson" && close(johnson.sigma, Fcy - (Fcy * Fcy * 1600) / (4 * Math.PI * Math.PI * E)), `σ = ${fmt(johnson.sigma)} MPa`);
    const lt = Math.PI * Math.sqrt((2 * E) / Fcy);
    test("column function is continuous at σ_E = F_cy/2", close(columnStrength(E, Fcy, lt * (1 - 1e-12), 1).sigma, Fcy / 2, 1e-9) && close(columnStrength(E, Fcy, lt * (1 + 1e-12), 1).sigma, Fcy / 2, 1e-9));
    test("fixity c scales the effective length by 1/√c", close(columnStrength(E, Fcy, 300, 4).sigma, columnStrength(E, Fcy, 150, 1).sigma));
    const ib = buckling(x.geometry.g, x);
    const direct = columnStrength(E, Fcy, x.geometry.g / (x.sheet.t / Math.sqrt(12)), x.buckling.c);
    test("inter-rivet buckling uses the column function with L = g (along the load) and ρ = t/√12", close(ib.sigma, direct.sigma), `σ_ir = ${fmt(ib.sigma)} MPa`);
    for (const s of [60, 200]) {
      const L = slendernessFor(E, Fcy, s, 1);
      test(`maximum pitch inverts the column function (${s < Fcy / 2 ? "Euler" : "Johnson"})`, close(columnStrength(E, Fcy, L, 1).sigma, s, 1e-9), `L/ρ = ${fmt(L)}`);
    }

    for (const v of vectors) results.push(...runVector(v));
    return results;
  }

  function fmt(x) {
    if (x == null || !Number.isFinite(x)) return String(x);
    const a = Math.abs(x);
    if (a !== 0 && (a >= 1e6 || a < 1e-3)) return x.toExponential(3);
    return String(+x.toPrecision(4));
  }

  return {
    SCHEMA_VERSION, KIND, DISCLAIMER, UNITS, TAGS, SOURCES, FIELDS, FIELD, DEFAULT_SOURCES, ASSUMPTIONS, FORMULAS, HAND,
    unitSym, toDisplay, fromDisplay, convertInputs, example, normalise, validate, solve, fbru, columnStrength, slendernessFor,
    netWidth, maxPitch, sheetStress, acrossSpacing, alongSpacing, loadedWidth, sweepED, sweepPitch, sweepSlenderness, inputsJSON, resultsJSON, parseImport, lookup, runVector,
    toMarkdown, jointReport, selfTests, get, set, fmt,
  };
});
