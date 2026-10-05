/* Scientific Modelling: dimensions and units. A dimension is a vector of rational exponents over the base
 * dimensions M L T Θ I N J. A unit has a dimension, an exact factor to SI where one exists, and an offset for the
 * affine temperature scales. A lone °C or °F is an absolute temperature; inside a compound unit (W/(m °C)) it is
 * a temperature difference, as in SI practice. K alone can be either: the variable's quantity decides.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./rational.js"));
  else (root.SM = root.SM || {}).U = factory(root.SM.Q);
})(typeof self !== "undefined" ? self : this, function (Q) {
  "use strict";

  const BASE = ["M", "L", "T", "Θ", "I", "N", "J"];
  const BASE_NAMES = ["mass", "length", "time", "temperature", "electric current", "amount of substance", "luminous intensity"];
  const ALIASES = { M: 0, L: 1, T: 2, "Θ": 3, Theta: 3, I: 4, N: 5, J: 6 };
  const NONE = Object.freeze(BASE.map(() => Q.ZERO));

  /** A dimension from { M: 1, L: -3 } (numbers or rational text). */
  function dim(map) {
    const v = BASE.map(() => Q.ZERO);
    for (const [k, e] of Object.entries(map)) v[ALIASES[k]] = Q.of(e);
    return v;
  }
  const dadd = (a, b) => a.map((x, i) => Q.add(x, b[i]));
  const dsub = (a, b) => a.map((x, i) => Q.sub(x, b[i]));
  const dscale = (a, k) => a.map((x) => Q.mul(x, k));
  const deq = (a, b) => a.every((x, i) => Q.eq(x, b[i]));
  const isNone = (a) => a.every(Q.isZero);

  const SUP = { "-": "⁻", "/": "ᐟ", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
  /** "M L⁻¹ T⁻¹", or "1" for a dimensionless quantity. */
  function text(a) {
    const parts = a.map((e, i) => (Q.isZero(e) ? "" : Q.eq(e, Q.ONE) ? BASE[i] : `${BASE[i]}${[...Q.str(e)].map((c) => SUP[c] ?? c).join("")}`)).filter(Boolean);
    return parts.length ? parts.join(" ") : "1";
  }
  /** "M L^-1 T^-1": the plain form that parseDimension reads back. */
  function plain(a) {
    const parts = a.map((e, i) => (Q.isZero(e) ? "" : Q.eq(e, Q.ONE) ? (i === 3 ? "Theta" : BASE[i]) : `${i === 3 ? "Theta" : BASE[i]}^${Q.str(e)}`)).filter(Boolean);
    return parts.length ? parts.join(" ") : "1";
  }
  /** TeX: \mathsf{M}\mathsf{L}^{-1}, or 1. */
  function tex(a) {
    const parts = a.map((e, i) => {
      if (Q.isZero(e)) return "";
      const b = i === 3 ? "\\mathsf{\\Theta}" : `\\mathsf{${BASE[i]}}`;
      return Q.eq(e, Q.ONE) ? b : `${b}^{${Q.str(e)}}`;
    }).filter(Boolean);
    return parts.length ? parts.join("") : "1";
  }

  /* ---------- a small grammar shared by units and dimension formulas ---------- */

  const SUPER_IN = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-" };

  /** Tokens: names, numbers, ( ) * / ^. Superscripts become ^n. Middle dot, dot between names and spaces multiply. */
  function tokens(s) {
    const src = String(s).replace(/\*\*/g, "^").replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, (m) => `^${[...m].map((c) => SUPER_IN[c]).join("")}`);
    const out = [];
    const re = /\s*(?:([A-Za-zΩµμ°Θ%Δ][A-Za-z_Ωµμ°Θ%Δ]*)|([+-]?\d+(?:\/\d+)?(?:\.\d+)?)|([()*/^·.]))/y;
    let i = 0;
    while (src.slice(i).trim() !== "") {
      re.lastIndex = i;
      const m = re.exec(src);
      if (!m) return { error: `cannot read "${src.slice(i).trim().slice(0, 8)}"` };
      i = re.lastIndex;
      if (m[1]) out.push({ t: "name", v: m[1] });
      else if (m[2]) out.push({ t: "num", v: m[2] });
      else out.push({ t: m[3] === "·" || m[3] === "." ? "*" : m[3] });
    }
    return { list: out };
  }

  /**
   * Parse a product: factors joined by *, space or a dot, and a / that puts everything after it, to the end of
   * the group or the next /, in the denominator. Each factor is a name or a ( group ), with an optional ^exponent.
   * `atom(name)` returns { value, ... } for a name or an error string.
   */
  function product(list, atom, mulv, powv, one) {
    let i = 0;
    function group() {
      let acc = one(), den = false, any = false;
      while (i < list.length && list[i].t !== ")") {
        const tk = list[i];
        if (tk.t === "*") { i++; continue; }
        if (tk.t === "/") { den = true; i++; continue; }
        let f;
        if (tk.t === "(") {
          i++;
          f = group();
          if (f.error) return f;
          if (list[i]?.t !== ")") return { error: "a ( has no matching )" };
          i++;
        } else if (tk.t === "name") {
          f = atom(tk.v);
          i++;
          if (f.error) return f;
        } else if (tk.t === "num" && /^1$/.test(tk.v)) {
          f = { value: one() };
          i++;
        } else return { error: `unexpected "${tk.v ?? tk.t}"` };
        if (list[i]?.t === "^") {
          i++;
          let k = list[i];
          if (k?.t === "(") { i++; k = list[i]; if (list[i + 1]?.t !== ")") return { error: "an exponent group must hold one number" }; i++; }
          if (k?.t !== "num") return { error: "^ needs a number" };
          i++;
          const e = Q.parse(k.v);
          if (!e) return { error: `bad exponent ${k.v}` };
          f = { ...f, value: powv(f.value, e) };
        }
        acc = mulv(acc, den ? powv(f.value, Q.q(-1)) : f.value);
        any = true;
      }
      return any ? { value: acc } : { value: one() };
    }
    const r = group();
    if (r.error) return r;
    if (i < list.length) return { error: "a ) has no matching (" };
    return r;
  }

  /** A dimension formula: "M L^-1 T^-1", "M/(L T)", "Theta", "1". */
  function parseDimension(s) {
    const src = String(s ?? "").trim();
    if (src === "") return { error: "no dimension" };
    if (src === "1" || src === "-") return { dim: NONE.slice() };
    const tk = tokens(src);
    if (tk.error) return { error: tk.error };
    const r = product(tk.list, (name) => (name in ALIASES ? { value: dim({ [name]: 1 }) } : { error: `"${name}" is not a base dimension (use M L T Θ I N J)` }),
      dadd, dscale, () => NONE.slice());
    return r.error ? { error: r.error } : { dim: r.value };
  }

  /* ---------- units ---------- */

  const P10 = (k) => (k >= 0 ? Q.q(10n ** BigInt(k)) : Q.q(1n, 10n ** BigInt(-k)));
  const PREFIX = { G: 9, M: 6, k: 3, c: -2, m: -3, u: -6, "µ": -6, "μ": -6, n: -9, p: -12 };
  /** name -> [dimension map, exact factor to SI (null when irrational), float factor, extra]. */
  const UNITS = {
    m: [{ L: 1 }, "1"], g: [{ M: 1 }, "1/1000"], s: [{ T: 1 }, "1"], K: [{ Θ: 1 }, "1"], A: [{ I: 1 }, "1"], mol: [{ N: 1 }, "1"], cd: [{ J: 1 }, "1"],
    Hz: [{ T: -1 }, "1"], N: [{ M: 1, L: 1, T: -2 }, "1"], Pa: [{ M: 1, L: -1, T: -2 }, "1"], J: [{ M: 1, L: 2, T: -2 }, "1"],
    W: [{ M: 1, L: 2, T: -3 }, "1"], C: [{ I: 1, T: 1 }, "1"], V: [{ M: 1, L: 2, T: -3, I: -1 }, "1"], ohm: [{ M: 1, L: 2, T: -3, I: -2 }, "1"],
    "Ω": [{ M: 1, L: 2, T: -3, I: -2 }, "1"], S: [{ M: -1, L: -2, T: 3, I: 2 }, "1"], F: [{ M: -1, L: -2, T: 4, I: 2 }, "1"],
    Wb: [{ M: 1, L: 2, T: -2, I: -1 }, "1"], H: [{ M: 1, L: 2, T: -2, I: -2 }, "1"],
    min: [{ T: 1 }, "60"], h: [{ T: 1 }, "3600"], day: [{ T: 1 }, "86400"], L: [{ L: 3 }, "1/1000"], l: [{ L: 3 }, "1/1000"],
    bar: [{ M: 1, L: -1, T: -2 }, "100000"], atm: [{ M: 1, L: -1, T: -2 }, "101325"], cal: [{ M: 1, L: 2, T: -2 }, "4.184"],
    ft: [{ L: 1 }, "0.3048"], in: [{ L: 1 }, "0.0254"], lb: [{ M: 1 }, "0.45359237"], lbf: [{ M: 1, L: 1, T: -2 }, "4.4482216152605"],
    rad: [{}, "1", "angle"], sr: [{}, "1", "solid angle"], deg: [{}, null, "angle", Math.PI / 180], "°": [{}, null, "angle", Math.PI / 180],
    "%": [{}, "1/100", "fraction"],
  };
  const PREFIXABLE = new Set(["m", "g", "s", "A", "mol", "N", "Pa", "J", "W", "Hz", "C", "V", "ohm", "Ω", "L", "l", "bar", "cal", "K"]);
  /** Affine temperature names: [factor to kelvin, offset in kelvin of the absolute scale]. */
  const AFFINE = { degC: ["1", "5463/20", "°C"], "°C": ["1", "5463/20", "°C"], degF: ["5/9", "45967/180", "°F"], "°F": ["5/9", "45967/180", "°F"] };
  const RANKINE = { degR: "5/9", "°R": "5/9" };
  const DELTA = /^(?:delta_|Δ)(degC|°C|degF|°F|K)$/;

  /** One unit name, with an optional prefix. */
  function unitAtom(name) {
    if (name in UNITS) return { value: unitValue(UNITS[name]) };
    const d = DELTA.exec(name);
    if (d) {
      const f = d[1] === "K" ? "1" : AFFINE[d[1]][0];
      return { value: { dim: dim({ Θ: 1 }), factor: Q.parse(f), float: Q.toNumber(Q.parse(f)), flags: ["difference"] } };
    }
    if (name in AFFINE) return { value: { dim: dim({ Θ: 1 }), factor: Q.parse(AFFINE[name][0]), float: Q.toNumber(Q.parse(AFFINE[name][0])), flags: ["affine"], affine: name } };
    if (name in RANKINE) return { value: { dim: dim({ Θ: 1 }), factor: Q.parse(RANKINE[name]), float: 5 / 9, flags: ["absolute"] } };
    for (const [p, k] of Object.entries(PREFIX)) {
      const rest = name.slice(p.length);
      if (name.startsWith(p) && PREFIXABLE.has(rest)) {
        const u = unitValue(UNITS[rest]);
        return { value: { ...u, factor: u.factor && Q.mul(u.factor, P10(k)), float: u.float * 10 ** k } };
      }
    }
    if (name === "kg") return { value: unitValue([{ M: 1 }, "1"]) };
    return { error: `"${name}" is not a known unit` };
  }
  function unitValue([map, factor, kind, float]) {
    const f = factor === null ? null : Q.parse(factor);
    return { dim: dim(map), factor: f, float: f ? Q.toNumber(f) : float, flags: kind ? [kind] : [] };
  }
  const one = () => ({ dim: NONE.slice(), factor: Q.ONE, float: 1, flags: [] });
  const umul = (a, b) => ({ dim: dadd(a.dim, b.dim), factor: a.factor && b.factor ? Q.mul(a.factor, b.factor) : null, float: a.float * b.float,
    flags: [...a.flags, ...b.flags], affine: a.affine ?? b.affine });
  function upow(a, e) {
    const intE = Q.isInteger(e);
    return { dim: dscale(a.dim, e), factor: a.factor && intE ? Q.pow(a.factor, e.n) : null, float: a.float ** Q.toNumber(e), flags: a.flags, affine: a.affine };
  }

  /**
   * A unit string: { dim, factor (exact rational to SI, or null), float, offset (kelvin, for a lone °C or °F),
   * temperature: "absolute" | "difference" | null, meaning (angle, fraction, ...), notes }, or { error }.
   */
  function parseUnit(s) {
    const src = String(s ?? "").trim();
    if (src === "") return { error: "no unit" };
    if (src === "1" || src === "-") return { dim: NONE.slice(), factor: Q.ONE, float: 1, offset: null, temperature: null, meaning: null, notes: [] };
    const tk = tokens(src);
    if (tk.error) return { error: tk.error };
    const r = product(tk.list, unitAtom, umul, upow, one);
    if (r.error) return { error: r.error };
    const u = r.value;
    const lone = tk.list.length === 1;
    const notes = [];
    let temperature = null, offset = null;
    if (u.affine) {
      if (lone) {
        temperature = "absolute";
        offset = Q.parse(AFFINE[u.affine][1]);
        notes.push(`${AFFINE[u.affine][2]} alone is an absolute temperature. The tool converts it to K before a product, a quotient or a power.`);
      } else {
        temperature = "difference";
        notes.push(`${AFFINE[u.affine][2]} in a compound unit means a temperature difference, so no offset applies.`);
      }
    } else if (u.flags.includes("difference")) temperature = "difference";
    else if (u.flags.includes("absolute")) temperature = "absolute";
    const meaning = u.flags.find((f) => f === "angle" || f === "solid angle" || f === "fraction") ?? null;
    return { dim: u.dim, factor: u.factor, float: u.float, offset, temperature, meaning, notes };
  }

  /**
   * A value in SI: v * factor + offset, exact when the factor is rational. An absolute temperature in °C or °F
   * becomes kelvin; a difference takes the factor only.
   * @param {any} v rational @param {any} unit parseUnit result @param {"absolute" | "difference" | null} kind
   */
  function toSI(v, unit, kind) {
    if (!unit.factor) return { exact: false, float: Q.toNumber(v) * unit.float };
    let x = Q.mul(v, unit.factor);
    if (unit.offset && kind !== "difference") x = Q.add(x, unit.offset);
    return { exact: true, value: x };
  }

  return { BASE, BASE_NAMES, NONE, dim, dadd, dsub, dscale, deq, isNone, text, plain, tex, parseDimension, parseUnit, toSI };
});
