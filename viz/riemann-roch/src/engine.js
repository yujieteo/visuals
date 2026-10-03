/* Divisors, Linear Systems & Riemann–Roch — the pure computational core.
 *
 * No DOM, storage, clock, randomness or network: every function maps plain data to plain data, so
 * Node's test runner loads this block straight out of index.html (self.RiemannRoch).
 *
 * Supported exactly (symbolic bases, not pictures):
 *   P¹            any divisor: L(D) = { r·xⁱ / q : 0 ≤ i ≤ deg D }
 *   Weierstrass E D = nO: monomials xⁱyʲ, j ≤ 1, pole order 2i + 3j ≤ n; ℓ(D) of every divisor
 *                 from its degree and its sum in the group law (E ≅ Pic⁰E)
 *   y² = f(x)     D = n∞ (deg f odd) or n(∞₊ + ∞₋) (deg f even): xⁱ and y·xʲ
 *   plane curves  D = nH: forms of degree n modulo F
 * Everything else is bounded by Riemann–Roch and Clifford and said to be bounded, never invented.
 */
(function (root) {
  "use strict";

  /* ---------- numbers, strings ---------- */
  /** @typedef {{ re: number, im: number }} Complex */
  /** @typedef {number[]} Poly ascending real coefficients */
  /**
   * One term n·[p] of a divisor on a curve whose points are P.
   * @template P
   * @typedef {{ p: P, n: number, label?: string }} Term
   */
  /** @template P @typedef {Term<P>[]} Divisor */
  const EPS = 1e-9;
  /** @type {Record<string, string>} */
  const SUP = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻" };
  /** @type {Record<string, string>} */
  const SUB = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉" };
  const sup = (/** @type {number | string} */ n) => String(n).split("").map((c) => SUP[c] ?? c).join("");
  const sub = (/** @type {number | string} */ n) => String(n).split("").map((c) => SUB[c] ?? c).join("");
  /** @param {number} x */
  function fmt(x, digits = 4) {
    if (!Number.isFinite(x)) return String(x);
    if (Math.abs(x) < 1e-10) return "0";
    if (Math.abs(x - Math.round(x)) < 1e-9) return String(Math.round(x)).replace("-", "−");
    const s = Number(x.toPrecision(digits)).toString();
    return s.replace("-", "−");
  }
  const choose = (/** @type {number} */ n, /** @type {number} */ k) => { if (k < 0 || k > n) return 0; let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return Math.round(r); };
  const pow = (/** @type {string} */ v, /** @type {number} */ e) => (e === 0 ? "" : e === 1 ? v : v + sup(e));
  /* The monomial xⁱyʲ as text, "1" when both exponents are 0. */
  const mono = (/** @type {number} */ i, j = 0) => pow("x", i) + pow("y", j) || "1";
  /* "²³" → "23": superscript digits read back as ordinary digits. */
  const SUP_DIGITS = "⁰¹²³⁴⁵⁶⁷⁸⁹";
  const fromSup = (/** @type {string} */ m) => m.split("").map((c) => SUP_DIGITS.indexOf(c)).join("");
  /* A point's coordinates rounded to 10⁻⁶, so nearby computations of one point share a key. */
  const coordKey = (/** @type {number} */ a, /** @type {number} */ b) => `${Math.round(a * 1e6) / 1e6},${Math.round(b * 1e6) / 1e6}`;
  /* The sign that leads the n-th term of a written sum: "−" or nothing first, then " − " or " + ". */
  const signed = (/** @type {number} */ n, /** @type {number} */ c) => (n === 0 ? (c < 0 ? "−" : "") : c < 0 ? " − " : " + ");

  /* ---------- complex numbers ---------- */
  /** @returns {Complex} */
  const cx = (/** @type {number} */ re, im = 0) => ({ re, im });
  const cadd = (/** @type {Complex} */ a, /** @type {Complex} */ b) => cx(a.re + b.re, a.im + b.im);
  const csub = (/** @type {Complex} */ a, /** @type {Complex} */ b) => cx(a.re - b.re, a.im - b.im);
  const cmul = (/** @type {Complex} */ a, /** @type {Complex} */ b) => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
  const cdiv = (/** @type {Complex} */ a, /** @type {Complex} */ b) => { const d = b.re * b.re + b.im * b.im; return cx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d); };
  const cabs = (/** @type {Complex} */ a) => Math.hypot(a.re, a.im);
  const cfmt = (/** @type {Complex} */ a) => {
    if (Math.abs(a.im) < 1e-9) return fmt(a.re);
    const im = Math.abs(a.im), s = `${fmt(im) === "1" ? "" : fmt(im)}i`;
    if (Math.abs(a.re) < 1e-9) return (a.im < 0 ? "−" : "") + s;
    return `${fmt(a.re)} ${a.im < 0 ? "−" : "+"} ${s}`;
  };

  /* ---------- univariate polynomials: ascending real coefficient arrays ---------- */
  const ptrim = (/** @type {Poly} */ p) => { const q = p.slice(); while (q.length > 1 && Math.abs(q[q.length - 1]) < 1e-14) q.pop(); return q; };
  const peval = (/** @type {Poly} */ p, /** @type {number} */ x) => p.reduceRight((acc, c) => acc * x + c, 0);
  const pevalC = (/** @type {Poly} */ p, /** @type {Complex} */ z) => p.reduceRight((acc, c) => cadd(cmul(acc, z), cx(c)), cx(0));
  const pmul = (/** @type {Poly} */ p, /** @type {Poly} */ q) => { const r = new Array(p.length + q.length - 1).fill(0); p.forEach((a, i) => q.forEach((b, j) => { r[i + j] += a * b; })); return r; };
  const padd = (/** @type {Poly} */ p, /** @type {Poly} */ q) => { const r = new Array(Math.max(p.length, q.length)).fill(0); p.forEach((a, i) => { r[i] += a; }); q.forEach((b, i) => { r[i] += b; }); return r; };
  const pscale = (/** @type {Poly} */ p, /** @type {number} */ s) => p.map((c) => c * s);
  const pderiv = (/** @type {Poly} */ p) => (p.length <= 1 ? [0] : p.slice(1).map((c, i) => c * (i + 1)));
  /** @param {Poly} p */
  function pstr(p, v = "x") {
    const q = ptrim(p);
    /** @type {[string, string][]} */
    const parts = [];
    for (let i = q.length - 1; i >= 0; i--) {
      const c = q[i];
      if (Math.abs(c) < 1e-12) continue;
      const mag = Math.abs(c), sign = c < 0 ? "−" : "+", coef = i > 0 && Math.abs(mag - 1) < 1e-12 ? "" : fmt(mag);
      parts.push([sign, coef + pow(v, i)]);
    }
    if (!parts.length) return "0";
    return parts.map(([s, t], k) => (k === 0 ? (s === "−" ? "−" : "") + t : ` ${s} ${t}`)).join("");
  }

  /* All complex roots (Aberth–Ehrlich), then clustered into roots with multiplicity. */
  /** @param {Poly} p @returns {Complex[]} */
  function proots(p) {
    const q = ptrim(p), n = q.length - 1;
    if (n < 1) return [];
    const lead = q[n], a = q.map((c) => c / lead), dp = pderiv(a);
    const R = 1 + Math.max(...a.slice(0, n).map(Math.abs));
    let z = Array.from({ length: n }, (_, k) => cmul(cx(R * 0.7), cx(Math.cos((2 * Math.PI * k) / n + 0.4), Math.sin((2 * Math.PI * k) / n + 0.4))));
    for (let it = 0; it < 500; it++) {
      let moved = 0;
      z = z.map((zk, k) => {
        const f = pevalC(a, zk), d = pevalC(dp, zk);
        if (cabs(f) === 0) return zk;
        const ratio = cdiv(f, d);
        let s = cx(0);
        z.forEach((zj, j) => { if (j !== k) s = cadd(s, cdiv(cx(1), csub(zk, zj))); });
        const w = cdiv(ratio, csub(cx(1), cmul(ratio, s)));
        moved = Math.max(moved, cabs(w));
        return csub(zk, w);
      });
      if (moved < 1e-15 * R) break;
    }
    return z;
  }
  /** @param {Complex[]} roots */
  function clusterRoots(roots, tol = 1e-5) {
    /** @type {{ z: Complex, sum: Complex, m: number }[]} */
    const out = [];
    for (const r of roots) {
      const hit = out.find((c) => cabs(csub(c.z, r)) < tol * Math.max(1, cabs(r)));
      if (hit) { hit.sum = cadd(hit.sum, r); hit.m += 1; hit.z = cx(hit.sum.re / hit.m, hit.sum.im / hit.m); }
      else out.push({ z: r, sum: r, m: 1 });
    }
    return out.map(({ z, m }) => ({ z: cx(Math.abs(z.re) < 1e-12 ? 0 : z.re, Math.abs(z.im) < 1e-9 ? 0 : z.im), m }));
  }
  /** @param {Poly} p @param {number} [tol] */
  const rootsWithMultiplicity = (p, tol) => clusterRoots(proots(p), tol);
  /** @param {Poly} p */
  function realRoots(p) {
    return rootsWithMultiplicity(p).filter((r) => r.z.im === 0).map((r) => r.z.re).sort((x, y) => x - y);
  }

  /* ---------- divisors (curve-agnostic) ---------- */
  /* A divisor is a list of { p, n } with points p compared by a curve's key function. */
  /** @template P @param {Divisor<P>} D @param {(p: P) => string} key @returns {Divisor<P>} */
  function normalize(D, key) {
    /** @type {Map<string, Term<P>>} */
    const m = new Map();
    for (const t of D) {
      const k = key(t.p);
      if (!m.has(k)) m.set(k, { p: t.p, n: 0, label: t.label });
      const e = /** @type {Term<P>} */ (m.get(k)); e.n += t.n; if (!e.label && t.label) e.label = t.label;
    }
    return [...m.values()].filter((t) => t.n !== 0);
  }
  const degree = (/** @type {Divisor<unknown>} */ D) => D.reduce((s, t) => s + t.n, 0);
  /** @template P @param {Divisor<P>} D @returns {Divisor<P>} */
  const dneg = (D) => D.map((t) => ({ ...t, n: -t.n }));
  /** @template P @param {Divisor<P>} A @param {Divisor<P>} B @param {(p: P) => string} key */
  const dadd = (A, B, key) => normalize([...A, ...B], key);
  const isEffective = (/** @type {Divisor<unknown>} */ D) => D.every((t) => t.n >= 0);
  /** @template P @param {Divisor<P>} D @param {(p: P) => string} [name] */
  function divStr(D, name = (p) => String(p)) {
    if (!D.length) return "0";
    return D.map((t, i) => {
      const a = Math.abs(t.n), s = t.n < 0 ? "−" : "+", c = a === 1 ? "" : String(a);
      return (i === 0 ? (t.n < 0 ? "−" : "") : ` ${s} `) + c + name(t.p);
    }).join("");
  }
  /* The signed point count of §7: + ● ● ●  − ○ */
  /** @param {Divisor<unknown>} D */
  function pointCount(D) {
    const pos = D.filter((t) => t.n > 0).reduce((s, t) => s + t.n, 0), neg = D.filter((t) => t.n < 0).reduce((s, t) => s - t.n, 0);
    return { positive: pos, negative: neg, degree: pos - neg, text: `+ ${"● ".repeat(pos).trim() || "·"}\n− ${"○ ".repeat(neg).trim() || "·"}\ndegree = ${pos - neg}` };
  }

  /* ---------- Riemann–Roch on an abstract curve of genus g ---------- */
  const degK = (/** @type {number} */ g) => 2 * g - 2;
  /* What Riemann–Roch alone forces about ℓ(D) for deg D = d on a genus-g curve. */
  /** @param {number} d @param {number} g */
  function rrRange(d, g) {
    if (d < 0) return { min: 0, max: 0, exact: true, regime: "negative", why: "deg D < 0: a function in L(D) would have more zeros than poles, so L(D) = 0." };
    if (d > 2 * g - 2) return { min: d + 1 - g, max: d + 1 - g, exact: true, regime: "nonspecial", why: `deg D > 2g − 2 = ${fmt(2 * g - 2)}, so deg(K − D) < 0 and ℓ(K − D) = 0: D is nonspecial.` };
    return { min: Math.max(0, d + 1 - g), max: Math.floor(d / 2) + 1, exact: false, regime: "special range",
      why: `0 ≤ deg D ≤ 2g − 2: ℓ(K − D) can be positive. Riemann–Roch gives ℓ(D) ≥ ${Math.max(0, d + 1 - g)}; Clifford gives ℓ(D) ≤ ⌊deg D/2⌋ + 1 = ${Math.floor(d / 2) + 1}.` };
  }
  /** @param {number} ell @param {number} d @param {number} g */
  function riemannRoch(ell, d, g) {
    const chi = d + 1 - g, ellKD = ell - chi;
    return { ell, ellKD, deg: d, g, chi, degK: 2 * g - 2, degKD: 2 * g - 2 - d, special: ellKD > 0, nonspecial: ellKD === 0, holds: ellKD >= 0,
      text: `ℓ(D) − ℓ(K − D) = ${ell} − ${ellKD} = ${fmt(chi)} = deg D + 1 − g = ${fmt(d)} + 1 − ${g}` };
  }
  /* Named divisors on a genus-g curve whose ℓ is forced exactly: 0, K, a generic divisor. */
  /** @param {number} d @param {number} g */
  function abstractEll(d, g, kind = "generic") {

    if (kind === "zero") return d === 0 ? 1 : null;
    if (kind === "canonical") return d === 2 * g - 2 ? g : null;
    if (d < 0) return 0;
    if (d > 2 * g - 2) return d + 1 - g;
    if (kind === "effective") return null;
    /* A general divisor of degree d on any curve: ℓ = max(0, d + 1 − g), except D ~ 0 and D ~ K. */
    return Math.max(0, d + 1 - g);
  }

  /* ---------- P¹ ---------- */
  /* Points: { inf: true } or a complex number { re, im }. */
  /** @typedef {{ inf: true } | { inf?: undefined, re: number, im?: number }} P1Point ∞, or a complex number */
  /** @typedef {{ c: number, factors: { a: { re: number, im?: number }, m: number }[] }} P1Function c·∏(x − aᵢ)^mᵢ */
  /** @type {{ readonly inf: true }} */
  const INF = Object.freeze({ inf: /** @type {const} */ (true) });
  const p1key = (/** @type {P1Point} */ p) => (p.inf ? "∞" : coordKey(p.re, p.im || 0));
  const p1name = (/** @type {P1Point} */ p) => (p.inf ? "∞" : `[${cfmt(cx(p.re, p.im || 0))}]`);
  const p1str = (/** @type {Divisor<P1Point>} */ D) => divStr(D, p1name);
  /* A rational function c·∏(x − aᵢ)^mᵢ with complex aᵢ. */
  /** @param {P1Function} f */
  function p1div(f) {
    /** @type {Divisor<P1Point>} */
    const D = f.factors.map((t) => ({ p: cx(t.a.re, t.a.im || 0), n: t.m }));
    const total = f.factors.reduce((s, t) => s + t.m, 0);
    if (total !== 0) D.push({ p: INF, n: -total });
    return normalize(D, p1key);
  }
  /** @param {P1Function} f @param {P1Point} P */
  function p1ord(f, P) { const D = p1div(f), t = D.find((x) => p1key(x.p) === p1key(P)); return t ? t.n : 0; }
  /** @param {P1Function} f */
  function p1fstr(f) {
    const lin = (/** @type {{ re: number, im?: number }} */ a) => { const z = cx(a.re, a.im || 0); return cabs(z) < 1e-12 ? "x" : z.im === 0 ? `x ${z.re < 0 ? "+" : "−"} ${fmt(Math.abs(z.re))}` : `x − (${cfmt(z)})`; };
    const fac = (/** @type {P1Function["factors"][number]} */ t) => { const s = lin(t.a), e = Math.abs(t.m); return (f.factors.length > 1 || e > 1 ? (s === "x" ? "x" : `(${s})`) : s === "x" ? "x" : `(${s})`) + (e > 1 ? sup(e) : ""); };
    const num = f.factors.filter((t) => t.m > 0).map(fac).join(""), den = f.factors.filter((t) => t.m < 0).map(fac).join("");
    return (num || "1") + (den ? ` / ${den}` : "");
  }
  /* L(D) on P¹. Write D = Σ n_a[a] + n_∞[∞]; q = ∏_{n_a>0}(x − a)^{n_a}, r = ∏_{n_a<0}(x − a)^{−n_a}.
     f ∈ L(D) ⇔ f = r·s/q with s a polynomial of degree ≤ deg D. */
  /** @param {Divisor<P1Point>} Draw */
  function p1Basis(Draw) {
    const D = normalize(Draw, p1key), d = degree(D);
    const fin = /** @type {Term<Complex>[]} the finite points */ (D.filter((t) => !t.p.inf)), q = fin.filter((t) => t.n > 0), r = fin.filter((t) => t.n < 0);
    const fac = (/** @type {Term<Complex>[]} */ ts) => ts.map((t) => ({ a: t.p, m: Math.abs(t.n) }));
    const lin = (/** @type {Complex} */ a) => (cabs(a) < 1e-12 ? "x" : `(x ${a.im ? "− (" + cfmt(a) + ")" : (a.re < 0 ? "+ " : "− ") + fmt(Math.abs(a.re))})`);
    const prod = (/** @type {Term<Complex>[]} */ ts) => ts.map((t) => lin(t.p) + (Math.abs(t.n) > 1 ? sup(Math.abs(t.n)) : "")).join("");
    const rs = prod(r), qs = prod(q);
    /** @type {{ i: number, label: string, f: P1Function }[]} */
    const basis = [];
    for (let i = 0; i <= d; i++) {
      const mono = i === 0 ? "" : pow("x", i), num = (rs + (rs && mono ? "·" : "") + mono) || "1";
      basis.push({ i, label: qs ? `${num} / ${qs}` : num, f: { c: 1, factors: [...fac(r), ...(i ? [{ a: cx(0), m: i }] : []), ...fac(q).map((t) => ({ ...t, m: -t.m }))] } });
    }
    return { curve: "P1", D, deg: d, g: 0, ell: Math.max(0, d + 1), basis, numerator: rs || "1", denominator: qs || "1",
      condition: `f = ${rs ? rs + "·" : ""}s(x)${qs ? " / " + qs : ""}, deg s ≤ ${d}`, rr: riemannRoch(Math.max(0, d + 1), d, 0) };
  }
  /* §14: div(f) + D point by point. */
  /** @template P @param {Divisor<P>} divf @param {Divisor<P>} D @param {(p: P) => string} key @param {(p: P) => string} name */
  function eligibility(divf, D, key, name) {
    /** @type {Map<string, P>} */
    const keys = new Map();
    for (const t of [...divf, ...D]) if (!keys.has(key(t.p))) keys.set(key(t.p), t.p);
    const rows = [...keys.entries()].map(([k, p]) => {
      const o = divf.find((t) => key(t.p) === k)?.n ?? 0, n = D.find((t) => key(t.p) === k)?.n ?? 0;
      return { point: name(p), ord: o, D: n, total: o + n, ok: o + n >= 0 };
    });
    return { rows, member: rows.every((r) => r.ok) };
  }
  const p1Eligibility = (/** @type {P1Function} */ f, /** @type {Divisor<P1Point>} */ D) => eligibility(p1div(f), normalize(D, p1key), p1key, (p) => (p.inf ? "∞" : cfmt({ re: p.re, im: p.im ?? 0 })));
  /* §13: the search 1, x, x², … for D = d∞ accepts x^0..x^d and rejects x^{d+1}. */
  /** @param {number} d */
  function p1Search(d, upto = d + 2) {
    const out = [];
    for (let i = 0; i <= Math.max(upto, 0); i++) {
      /** @type {P1Function} */
      const f = { c: 1, factors: i ? [{ a: cx(0), m: i }] : [] };
      const el = p1Eligibility(f, [{ p: INF, n: d }]);
      out.push({ f: i === 0 ? "1" : pow("x", i), pole: i, accepted: el.member, rows: el.rows });
    }
    return out;
  }
  /* Riemann sphere ↔ plane (stereographic from the north pole, ∞ at the north pole). */
  /** @param {P1Point} p @returns {[number, number, number]} */
  function toSphere(p) {
    if (p.inf) return [0, 0, 1];
    const { re: u, im: v = 0 } = p, s = u * u + v * v;
    return [(2 * u) / (1 + s), (2 * v) / (1 + s), (s - 1) / (1 + s)];
  }
  /** @param {[number, number, number]} point @returns {P1Point} */
  function fromSphere([X, Y, Z]) { return Z > 1 - 1e-9 ? INF : cx(X / (1 - Z), Y / (1 - Z)); }

  /* ---------- Weierstrass elliptic curves y² = x³ + ax + b ---------- */
  /** @typedef {{ a: number, b: number }} Weierstrass y² = x³ + ax + b */
  /** @typedef {{ x: number, y: number }} Affine */
  /** @typedef {{ readonly inf: true, readonly O: true } | (Affine & { inf?: undefined })} ECPoint O, or an affine point */
  /** @type {{ readonly inf: true, readonly O: true }} */
  const O = Object.freeze({ inf: /** @type {const} */ (true), O: /** @type {const} */ (true) });
  const ecf = (/** @type {Weierstrass} */ E, /** @type {number} */ x) => x * x * x + E.a * x + E.b;
  const ecDisc = (/** @type {Weierstrass} */ E) => -16 * (4 * E.a ** 3 + 27 * E.b ** 2);
  const ecSmooth = (/** @type {Weierstrass} */ E) => Math.abs(4 * E.a ** 3 + 27 * E.b ** 2) > 1e-9;
  const eckey = (/** @type {ECPoint} */ P) => (P.inf ? "O" : coordKey(P.x, P.y));
  const ecname = (/** @type {ECPoint} */ P) => (P.inf ? "O" : `(${fmt(P.x, 3)}, ${fmt(P.y, 3)})`);
  const ecstr = (/** @type {Divisor<ECPoint>} */ D) => divStr(D, (p) => (p.inf ? "O" : `[${ecname(p)}]`));
  const ecOn = (/** @type {Weierstrass} */ E, /** @type {ECPoint} */ P, tol = 1e-6) => P.inf || Math.abs(P.y * P.y - ecf(E, P.x)) < tol * Math.max(1, Math.abs(P.y * P.y));
  const ecEq = (/** @type {ECPoint} */ P, /** @type {ECPoint} */ Q, tol = 1e-7) => (P.inf || Q.inf ? !!P.inf && !!Q.inf : Math.abs(P.x - Q.x) < tol * Math.max(1, Math.abs(P.x)) && Math.abs(P.y - Q.y) < tol * Math.max(1, Math.abs(P.y)));
  /** @returns {ECPoint} */
  const ecNeg = (/** @type {ECPoint} */ P) => (P.inf ? O : { x: P.x, y: -P.y });
  /* Slope of the chord through P and Q, or of the tangent at P. */
  const slope = (/** @type {Weierstrass} */ E, /** @type {Affine} */ P, /** @type {Affine} */ Q, /** @type {boolean} */ tangent) => (tangent ? (3 * P.x * P.x + E.a) / (2 * P.y) : (Q.y - P.y) / (Q.x - P.x));
  /** @param {Weierstrass} E @param {ECPoint} P @param {ECPoint} Q @returns {ECPoint} */
  function ecAdd(E, P, Q) {
    if (P.inf) return Q;
    if (Q.inf) return P;
    if (Math.abs(P.x - Q.x) < 1e-12 * Math.max(1, Math.abs(P.x)) && Math.abs(P.y + Q.y) < 1e-9 * Math.max(1, Math.abs(P.y))) return O;
    const same = Math.abs(P.x - Q.x) < 1e-12 * Math.max(1, Math.abs(P.x));
    const lam = slope(E, P, Q, same);
    const x = lam * lam - P.x - Q.x, y = lam * (P.x - x) - P.y;
    return { x, y };
  }
  /** @param {Weierstrass} E @param {number} n @param {ECPoint} P */
  function ecMul(E, n, P) {
    /** @type {ECPoint} */
    let R = O;
    let A = n < 0 ? ecNeg(P) : P, k = Math.abs(n);
    while (k) { if (k & 1) R = ecAdd(E, R, A); A = ecAdd(E, A, A); k >>= 1; }
    return R;
  }
  /* The line through P and Q (tangent when P = Q) meets E again at R: div(line/z) = P + Q + R − 3O. */
  /**
   * @param {Weierstrass} E @param {ECPoint} P @param {ECPoint} Q
   * @returns {{ vertical: true, R: ECPoint, divisor: Divisor<ECPoint>, equation: string, relation: string }
   *   | { vertical: false, R: ECPoint, lambda: number, nu: number, divisor: Divisor<ECPoint>, equation: string, relation: string, sum: ECPoint }}
   */
  function ecLine(E, P, Q) {
    if (P.inf || Q.inf) throw new Error("A chord needs two affine points.");
    const S = ecAdd(E, P, Q), R = ecNeg(S);
    if (R.inf) return { vertical: true, R: O, divisor: normalize([{ p: P, n: 1 }, { p: Q, n: 1 }, { p: O, n: -2 }], eckey),
      equation: `x = ${fmt(P.x)}`, relation: "P + Q ∼ 2O, so Q = −P" };
    const lam = slope(E, P, Q, ecEq(P, Q)), nu = P.y - lam * P.x;
    return { vertical: false, R, lambda: lam, nu, divisor: normalize([{ p: P, n: 1 }, { p: Q, n: 1 }, { p: R, n: 1 }, { p: O, n: -3 }], eckey),
      equation: `y = ${pstr([nu, lam])}`, relation: "P + Q + R ∼ 3O", sum: S };
  }
  /* div(x − x(P)) = P + (−P) − 2O */
  const ecVertical = (/** @type {Weierstrass} */ E, /** @type {ECPoint} */ P) => normalize([{ p: P, n: 1 }, { p: ecNeg(P), n: 1 }, { p: O, n: -2 }], eckey);
  /* Σ n_P·P in the group law: the image of D under Div(E) → E (Abel's theorem in genus one). */
  const ecSum = (/** @type {Weierstrass} */ E, /** @type {Divisor<ECPoint>} */ D) => D.reduce((/** @type {ECPoint} */ S, t) => ecAdd(E, S, ecMul(E, t.n, t.p)), O);
  /* ℓ(D) on E: deg D for deg > 0, and in degree 0 one exactly when D is principal. */
  /** @param {Weierstrass} E @param {Divisor<ECPoint>} D */
  function ecEll(E, D) {
    const d = degree(D);
    if (d > 0) return d;
    if (d < 0) return 0;
    return ecSum(E, D).inf ? 1 : 0;
  }
  /* L(nO): monomials xⁱyʲ with j ≤ 1 and pole order 2i + 3j ≤ n (y² is not new: y² = x³ + ax + b). */
  /** @param {number} n */
  function ecBasisAtO(n) {
    /** @type {{ i: number, j: number, pole: number, label: string }[]} */
    const out = [];
    if (n < 0) return out;
    for (let pole = 0; pole <= n; pole++) for (let j = 0; j <= 1; j++) {
      const r = pole - 3 * j;
      if (r >= 0 && r % 2 === 0) out.push({ i: r / 2, j, pole, label: mono(r / 2, j) });
    }
    return out;
  }
  /** @param {Weierstrass} E */
  function ecCubicRoots(E) { return realRoots([E.b, E.a, 0, 1]); }
  /* The real locus, sampled for drawing: [[x, y], …] upper and lower branches per component. */
  /** @param {Weierstrass} E */
  function ecRealLocus(E, xmin = -3, xmax = 4, N = 400) {
    const roots = ecCubicRoots(E), comps = [];
    /** @type {[number, number][]} */
    const segs = [];
    if (roots.length === 3) segs.push([roots[0], roots[1]], [roots[2], xmax]); else segs.push([roots[0], xmax]);
    for (const [a, b] of segs) {
      /** @type {[number, number][]} */
      const pts = [];
      for (let k = 0; k <= N; k++) {
        const t = k / N, x = a + (b - a) * (b === xmax ? t * t : 0.5 - 0.5 * Math.cos(Math.PI * t));
        pts.push([x, Math.sqrt(Math.max(0, ecf(E, x)))]);
      }
      comps.push({ from: a, to: b, closed: b !== xmax, upper: pts, lower: pts.map(([x, y]) => [x, -y]) });
    }
    return comps.filter((c) => c.from >= xmin - 10);
  }
  /* The nearest real point of E to (x, y), searching the real locus. */
  /** @param {Weierstrass} E @param {number} x @param {number} y */
  function ecNearest(E, x, y) {
    /** @type {Affine | null} */
    let best = null;
    let bd = Infinity;
    for (const c of ecRealLocus(E, -50, Math.max(4, x + 2), 600)) for (const br of [c.upper, c.lower]) for (const [px, py] of br) {
      const d = Math.hypot(px - x, py - y);
      if (d < bd) { bd = d; best = { x: px, y: py }; }
    }
    return best && { ...best, distance: bd };
  }
  /* Gauss–Legendre on [0, 1] (32 nodes), for the Abel–Jacobi integrals. */
  const GL = (() => {
    /** @type {number[]} */
    const xs = [], ws = [];
    const n = 32;
    for (let i = 1; i <= n; i++) {
      let x = Math.cos((Math.PI * (i - 0.25)) / (n + 0.5)), dp = 0;
      for (let it = 0; it < 100; it++) {
        let p0 = 1, p1 = x;
        for (let k = 2; k <= n; k++) { const p2 = ((2 * k - 1) * x * p1 - (k - 1) * p0) / k; p0 = p1; p1 = p2; }
        dp = (n * (x * p1 - p0)) / (x * x - 1);
        const dx = p1 / dp; x -= dx;
        if (Math.abs(dx) < 1e-15) break;
      }
      xs.push((1 - x) / 2); ws.push(1 / ((1 - x * x) * dp * dp));
    }
    return { xs, ws };
  })();
  const quad = (/** @type {(t: number) => number} */ fn, /** @type {number} */ a, /** @type {number} */ b, pieces = 8) => { let s = 0; const h = (b - a) / pieces; for (let p = 0; p < pieces; p++) for (let k = 0; k < GL.xs.length; k++) s += GL.ws[k] * h * fn(a + h * (p + GL.xs[k])); return s; };
  /* I(X) = ∫_X^∞ dt/√f(t) for X ≥ e₁ (the largest real root), with t = e₁ + 1/s² so the integrand is smooth. */
  /** @param {Weierstrass} E @param {number} X */
  function ecTail(E, X) {
    // A cubic has a real root.
    const e1 = /** @type {number} */ (ecCubicRoots(E).at(-1)), g = (/** @type {number} */ t) => t * t + e1 * t + e1 * e1 + E.a; // f(t) = (t − e₁)·g(t)
    const h = (/** @type {number} */ s) => (s === 0 ? 2 : 2 / (s * s * Math.sqrt(g(e1 + 1 / (s * s)))));
    const S = X - e1 < 1e-14 ? Infinity : 1 / Math.sqrt(X - e1);
    if (S <= 1) return quad(h, 0, S);
    /* ∫_1^S h(s) ds with s = 1/r: ∫_{1/S}^1 h(1/r)/r² dr, smooth since h(s) ~ 2/(s²√g(e₁)). */
    return quad(h, 0, 1) + quad((/** @type {number} */ r) => (r === 0 ? 2 / Math.sqrt(g(e1)) : h(1 / r) / (r * r)), S === Infinity ? 0 : 1 / S, 1);
  }
  /* J(X) = ∫_{e₃}^X dt/√f(t) along the egg (three real roots), with t = e₃ + w². */
  /** @param {Weierstrass} E @param {number} X */
  function ecEgg(E, X) {
    const [e3, e2, e1] = ecCubicRoots(E), W = Math.sqrt(Math.max(0, X - e3));
    return quad((/** @type {number} */ w) => 2 / Math.sqrt((e1 - e3 - w * w) * (e2 - e3 - w * w)), 0, W);
  }
  /* Abel–Jacobi for real points: u(P) = ∫_O^P dx/y as a point of the real circle of C/Λ.
     Returned as fractions of the real period ω, with the component (0: through O, 1: the egg). */
  /** @param {Weierstrass} E @param {ECPoint} P */
  function ecAbel(E, P) {
    const roots = ecCubicRoots(E), e1 = /** @type {number} a cubic has a real root */ (roots.at(-1)), omega = 2 * ecTail(E, e1);
    if (P.inf) return { u: 0, component: 0, omega };
    const s = P.y >= 0 ? -1 : 1;
    if (P.x >= e1 - 1e-12) return { u: (((s * ecTail(E, P.x)) / omega) % 1 + 1) % 1, component: 0, omega };
    return { u: (((-s * ecEgg(E, P.x)) / omega) % 1 + 1) % 1, component: 1, omega };
  }
  /* The point of the real locus at Abel coordinate u (fraction of ω) on a component, by bisection. */
  /** @param {Weierstrass} E @param {number} u @returns {ECPoint} */
  function ecFromAbel(E, u, component = 0) {
    const roots = ecCubicRoots(E), e1 = /** @type {number} a cubic has a real root */ (roots.at(-1)), w = ((u % 1) + 1) % 1;
    if (component === 0) {
      if (w < 1e-12) return O;
      const half = w < 0.5, target = (half ? w : 1 - w) * 2 * ecTail(E, e1) ; // ecTail decreasing in X
      let lo = e1, hi = e1 + 1;
      while (ecTail(E, hi) > target) hi = e1 + (hi - e1) * 4;
      for (let k = 0; k < 80; k++) { const m = (lo + hi) / 2; if (ecTail(E, m) > target) lo = m; else hi = m; }
      const x = (lo + hi) / 2, y = Math.sqrt(Math.max(0, ecf(E, x)));
      return { x, y: half ? -y : y };
    }
    const [e3, e2] = roots, half = w <= 0.5, target = (half ? w : 1 - w) * 2 * ecTail(E, e1);
    let lo = e3, hi = e2;
    for (let k = 0; k < 80; k++) { const m = (lo + hi) / 2; if (ecEgg(E, m) < target) lo = m; else hi = m; }
    const x = (lo + hi) / 2, y = Math.sqrt(Math.max(0, ecf(E, x)));
    return { x, y: half ? y : -y };
  }
  /* |2O| and |3O| and beyond, side by side (§47–48). */
  /** @param {Weierstrass} E @param {number} n */
  function ecMap(E, n) {
    const basis = ecBasisAtO(n), ell = Math.max(0, n);
    const target = ell - 1;
    /** @type {Record<number, string>} */
    const kinds = { 1: "constant map to a point: |O| = {O}, one section", 2: "E → P¹, (x, y) ↦ x, degree 2: forgets the sign of y",
      3: "E ↪ P², P ↦ [1 : x : y]: the plane cubic y²z = x³ + axz² + bz³", 4: "E ↪ P³: an elliptic normal quartic, the intersection of two quadrics" };
    return { n, basis, ell, target, embedding: n >= 3, degreeOfMap: n === 2 ? 2 : n >= 3 ? 1 : 0, imageDegree: n >= 3 ? n : n === 2 ? 1 : 0,
      description: kinds[n] || (n >= 5 ? `E ↪ P${sup(n - 1)}: an elliptic normal curve of degree ${n}` : "no sections"),
      branchPoints: n === 2 ? [...proots([E.b, E.a, 0, 1]).map((z) => cfmt(cx(z.re, Math.abs(z.im) < 1e-9 ? 0 : z.im))), "∞"] : [] };
  }

  /* ---------- hyperelliptic curves y² = f(x) ---------- */
  /** @param {number} degf */
  function hyperGenus(degf) {

    if (degf < 1) throw new Error("f must be non-constant.");
    return degf % 2 ? (degf - 1) / 2 : (degf - 2) / 2;
  }
  /* L(n∞) for deg f = 2g + 1 (one point ∞, ord_∞ x = −2, ord_∞ y = −(2g + 1)), or
     L(n(∞₊ + ∞₋)) for deg f = 2g + 2 (two points at infinity, poles of x of order 1 at each, of y of order g + 1). */
  /** @param {number} degf @param {number} n */
  function hyperBasis(degf, n) {
    const g = hyperGenus(degf), odd = degf % 2 === 1;
    /** @type {{ kind: "x" | "y", i?: number, j?: number, pole: number, label: string }[]} */
    const out = [];
    if (odd) {
      for (let pole = 0; pole <= n; pole++) {
        if (pole % 2 === 0) out.push({ kind: "x", i: pole / 2, pole, label: mono(pole / 2) });
        else if (pole >= 2 * g + 1) { const j = (pole - 2 * g - 1) / 2; out.push({ kind: "y", j, pole, label: mono(j, 1) }); }
      }
      return { g, odd, point: "∞", divisor: `${n}∞`, deg: n, basis: out, ell: out.length, poles: out.map((b) => b.pole) };
    }
    for (let i = 0; i <= n; i++) out.push({ kind: "x", i, pole: i, label: mono(i) });
    for (let j = 0; j <= n - g - 1; j++) out.push({ kind: "y", j, pole: j + g + 1, label: mono(j, 1) });
    return { g, odd, point: "∞₊ + ∞₋", divisor: `${n}(∞₊ + ∞₋)`, deg: 2 * n, basis: out, ell: n < 0 ? 0 : out.length, poles: out.map((b) => b.pole) };
  }
  /* The hyperelliptic canonical system: K ∼ (2g − 2)∞ = (g − 1)·(x)_∞, ω_i = xⁱ dx/y. */
  /** @param {number} g */
  function hyperCanonical(g) {
    const basis = Array.from({ length: g }, (_, i) => ({ i, label: mono(i), differential: `${i ? pow("x", i) + " " : ""}dx/y` }));
    return { g, K: g === 1 ? "0" : `${2 * g - 2}∞`, degK: 2 * g - 2, ell: g, basis, target: g - 1,
      map: g === 1 ? "constant" : g === 2 ? "C → P¹, 2 : 1 — the hyperelliptic double cover x" : `C → P${sup(g - 1)}, 2 : 1 onto a rational normal curve of degree ${g - 1}`,
      degreeOfMap: g >= 2 ? 2 : 0, imageDegree: g >= 2 ? g - 1 : 0 };
  }
  /* Branch points of x : C → P¹: the roots of f, plus ∞ when deg f is odd. */
  const hyperBranchCount = (/** @type {number} */ degf) => (degf % 2 ? degf + 1 : degf);

  /* ---------- Riemann–Hurwitz ---------- */
  /* 2g_C − 2 = deg f·(2g_D − 2) + Σ (e_P − 1). Returns g_C (or why it is not a genus). */
  /** @param {{ degree: number, gTarget?: number, ramification?: number[] }} cover */
  function riemannHurwitz({ degree: n, gTarget = 0, ramification = [] }) {
    const R = ramification.reduce((s, e) => s + (e - 1), 0), lhs = n * (2 * gTarget - 2) + R;
    const integral = lhs % 2 === 0, g = integral ? lhs / 2 + 1 : null;
    return { degree: n, gTarget, degR: R, euler: lhs, g, valid: integral && /** @type {number} integral, so a genus */ (g) >= 0 && ramification.every((e) => e >= 1 && e <= n),
      text: `2g − 2 = ${n}(2·${gTarget} − 2) + ${R} = ${fmt(lhs)}` + (integral ? `, so g = ${fmt(/** @type {number} */ (g))}` : ": odd, so no such cover exists") };
  }
  /* §28: a double cover of P¹ with b simple branch points. */
  /** @param {number} b */
  function doubleCover(b) {
    if (b % 2) return { b, ok: false, g: null, why: "A double cover of P¹ has an even number of branch points: going once round all of them must return to the starting sheet." };
    const rh = riemannHurwitz({ degree: 2, gTarget: 0, ramification: Array(b).fill(2) });
    return { b, ok: true, g: rh.g, terms: { sheets: -4, branching: b, euler: rh.euler }, text: `2g − 2 = 2(−2) + ${b} = ${rh.euler}, so g = ${rh.g}` };
  }

  /* ---------- semigroups and Weierstrass gaps ---------- */
  /** @param {number[]} generators */
  function semigroup(generators, upto = 20) {
    const ok = new Array(upto + 1).fill(false); ok[0] = true;
    for (let n = 1; n <= upto; n++) ok[n] = generators.some((g) => n - g >= 0 && ok[n - g]);
    return ok.map((v, n) => ({ n, allowed: v }));
  }
  const gaps = (/** @type {number[]} */ generators, upto = 40) => semigroup(generators, upto).filter((s) => !s.allowed).map((s) => s.n);
  /* Pole orders realised by a basis of L(n·P) with no other poles: the semigroup H(P) up to n. */
  const poleOrders = (/** @type {{ pole: number }[]} */ basis) => [...new Set(basis.map((b) => b.pole))].sort((a, b) => a - b);
  /* Gap sequences: a generic point has 1, …, g; a hyperelliptic Weierstrass point 1, 3, …, 2g − 1. */
  /** @param {number} g */
  function gapSequence(g, kind = "generic") {
    if (kind === "generic") return Array.from({ length: g }, (_, i) => i + 1);
    if (kind === "hyperelliptic") return gaps([2, 2 * g + 1]);
    throw new Error(`Unknown point kind ${kind}`);
  }
  const weierstrassWeight = (/** @type {number[]} */ gs) => gs.reduce((s, x, i) => s + x - (i + 1), 0);

  /* ---------- smooth plane curves ---------- */
  /* "+ 0" turns the −0 of d = 1 into 0. */
  const planeGenus = (/** @type {number} */ d) => ((d - 1) * (d - 2)) / 2 + 0;
  /** @param {number} d */
  function adjunction(d) {
    const g = planeGenus(d);
    return { d, KC: d === 3 ? "0" : `(${d} − 3)H|_C = ${d - 3 === 1 ? "" : d - 3}H|_C`.replace("= H", "= H"), degK: d * (d - 3), twoGminus2: 2 * g - 2, g,
      text: `deg K_C = (d − 3)·d = ${d * (d - 3)} = 2g − 2, so g = ${g}` };
  }
  /* ℓ(nH) on a smooth plane curve of degree d: forms of degree n modulo multiples of F. */
  const planeEll = (/** @type {number} */ d, /** @type {number} */ n) => (n < 0 ? 0 : choose(n + 2, 2) - (n - d >= 0 ? choose(n - d + 2, 2) : 0));
  /* Holomorphic differentials of a smooth plane curve: xⁱyʲ dx / F_y with i + j ≤ d − 3. */
  /** @param {number} d */
  function planeDifferentials(d) {
    const out = [];
    for (let s = 0; s <= d - 3; s++) for (let j = 0; j <= s; j++) out.push(mono(s - j, j) + " dx/F_y");
    return out;
  }

  /* ---------- polynomials in three variables (homogeneous forms) ---------- */
  /* A form is a Map "i,j,k" → coefficient for xⁱ yʲ zᵏ. */
  /** @typedef {Map<string, number>} Form */
  const fkey = (/** @type {number} */ i, /** @type {number} */ j, /** @type {number} */ k) => `${i},${j},${k}`;
  const exps = (/** @type {string} */ key) => key.split(",").map(Number);
  /** @param {[number, number, number, number][]} terms c·xⁱyʲzᵏ as [c, i, j, k] @returns {Form} */
  function form(terms) { const m = new Map(); for (const [c, i, j, k] of terms) m.set(fkey(i, j, k), (m.get(fkey(i, j, k)) || 0) + c); return m; }
  /** @param {Form} A @param {Form} B @returns {Form} */
  function fmul(A, B) { const m = new Map(); for (const [a, ca] of A) { const [i, j, k] = exps(a); for (const [b, cb] of B) { const [p, q, r] = exps(b), key = fkey(i + p, j + q, k + r); m.set(key, (m.get(key) || 0) + ca * cb); } } return m; }
  /** @param {Form} A @param {Form} B */
  function fadd(A, B, s = 1) { const m = new Map(A); for (const [b, c] of B) m.set(b, (m.get(b) || 0) + s * c); return m; }
  /** @param {Form} A @param {number} e */
  function fpow(A, e) { let r = form([[1, 0, 0, 0]]); for (let t = 0; t < e; t++) r = fmul(r, A); return r; }
  /** @param {Form} A */
  function fdeg(A) { let d = -Infinity; for (const [k, c] of A) if (c !== 0) d = Math.max(d, exps(k).reduce((a, b) => a + b, 0)); return d; }
  /* Substitute x, y, z by linear forms. */
  /** @param {Form} A @param {Form} X @param {Form} Y @param {Form} Z */
  function fsubst(A, X, Y, Z) { /** @type {Form} */ let r = new Map(); for (const [key, c] of A) { if (!c) continue; const [i, j, k] = exps(key); r = fadd(r, fmul(fmul(fpow(X, i), fpow(Y, j)), fpow(Z, k)), c); } return r; }
  /** @param {Form} A @param {Complex} x @param {Complex} y @param {Complex} z */
  function fevalC(A, x, y, z) { let s = cx(0); for (const [key, c] of A) { if (!c) continue; const [i, j, k] = exps(key); let t = cx(c); for (let a = 0; a < i; a++) t = cmul(t, x); for (let a = 0; a < j; a++) t = cmul(t, y); for (let a = 0; a < k; a++) t = cmul(t, z); s = cadd(s, t); } return s; }
  const feval = (/** @type {Form} */ A, /** @type {number} */ x, /** @type {number} */ y, z = 1) => fevalC(A, cx(x), cx(y), cx(z)).re;
  /* Coefficient of yᵐ as a binary form in (x, z), stored as an ascending array in t = x/z of fixed degree. */
  /** @param {Form} A @param {number} m @param {number} deg */
  function ycoeff(A, m, deg) { const p = new Array(deg - m + 1).fill(0); for (const [key, c] of A) { const [i, j] = exps(key); if (j === m) p[i] += c; } return p; }
  /* Determinant of a matrix of univariate polynomials, exactly as polynomial arithmetic (DP over row subsets). */
  /** @param {Poly[][]} M @returns {Poly} */
  function polyDet(M) {
    const n = M.length;
    if (!n) return [1];
    /** @type {Map<number, Poly>} */
    let layer = new Map([[0, [1]]]);
    for (let c = 0; c < n; c++) {
      /** @type {Map<number, Poly>} */
      const next = new Map();
      for (const [mask, val] of layer) for (let r = 0; r < n; r++) {
        if (mask & (1 << r)) continue;
        const e = M[r][c];
        if (e.every((x) => x === 0)) continue;
        let inv = 0; for (let s = r + 1; s < n; s++) if (mask & (1 << s)) inv++;
        const term = pscale(pmul(val, e), inv % 2 ? -1 : 1), key = mask | (1 << r);
        const prev = next.get(key);
        next.set(key, prev ? padd(prev, term) : term);
      }
      layer = next;
    }
    return layer.get((1 << n) - 1) || [0];
  }
  /* Res_y(F, G) for forms F, G of degrees d, e: a binary form R(x, z) of degree d·e (as an array in t = x/z,
     padded to length d·e + 1 so a missing top degree counts roots at z = 0). */
  /** @param {Form} F @param {Form} G */
  function resultantY(F, G) {
    const d = fdeg(F), e = fdeg(G), N = d + e;
    /** @type {Poly[][]} */
    const M = [];
    const fc = (/** @type {number} */ m) => ycoeff(F, m, d), gc = (/** @type {number} */ m) => ycoeff(G, m, e);
    for (let r = 0; r < e; r++) M.push(Array.from({ length: N }, (_, c) => { const m = d - (c - r); return c - r >= 0 && c - r <= d ? fc(m) : [0]; }));
    for (let r = 0; r < d; r++) M.push(Array.from({ length: N }, (_, c) => { const m = e - (c - r); return c - r >= 0 && c - r <= e ? gc(m) : [0]; }));
    /* Each entry of row type F at column c is the coefficient of y^{d−(c−r)}: a form in (x, z) of degree c − r. */
    const R = polyDet(M), out = new Array(d * e + 1).fill(0);
    R.forEach((c, i) => { if (i <= d * e) out[i] += c; });
    return out;
  }
  /* Intersection points of two plane curves with multiplicities, by eliminating y after a generic projective
     change of coordinates (so no two intersection points share a fibre and the eliminated point lies on neither curve).
     The multiplicity of a root of the resultant is then the intersection multiplicity I_P. Bézout: they sum to d·e. */
  /* Exact multiplicities: Yun's square-free decomposition over the integers (BigInt), then the simple roots of
     each square-free factor numerically. Falls back to clustering when the coefficients are not integers. */
  /** @typedef {bigint[]} BigPoly ascending integer coefficients */
  const bigTrim = (/** @type {BigPoly} */ p) => { const q = p.slice(); while (q.length > 1 && q[q.length - 1] === 0n) q.pop(); return q; };
  const bigAbs = (/** @type {bigint} */ a) => (a < 0n ? -a : a);
  const bigGcd = (/** @type {bigint} */ a, /** @type {bigint} */ b) => { a = bigAbs(a); b = bigAbs(b); while (b) [a, b] = [b, a % b]; return a; };
  /** @param {BigPoly} p */
  function bigPrimitive(p) { const q = bigTrim(p); let c = 0n; for (const x of q) c = bigGcd(c, x); if (c === 0n) return q; const r = q.map((x) => x / c); return r[r.length - 1] < 0n ? r.map((x) => -x) : r; }
  const bigDeriv = (/** @type {BigPoly} */ p) => (p.length <= 1 ? [0n] : p.slice(1).map((c, i) => c * BigInt(i + 1)));
  const bigDeg = (/** @type {BigPoly} */ p) => { const q = bigTrim(p); return q.length === 1 && q[0] === 0n ? -1 : q.length - 1; };
  /** @param {BigPoly} a @param {BigPoly} b */
  function bigPrem(a, b) {
    let r = bigTrim(a); const B = bigTrim(b), db = B.length - 1, lb = B[db];
    while (bigDeg(r) >= db && bigDeg(r) >= 0) {
      const dr = r.length - 1, lr = r[dr], sh = dr - db;
      r = r.map((c) => c * lb);
      for (let i = 0; i <= db; i++) r[i + sh] -= lr * B[i];
      r = bigTrim(r);
    }
    return r;
  }
  /** @param {BigPoly} a @param {BigPoly} b @returns {BigPoly} */
  function bigPolyGcd(a, b) { a = bigPrimitive(a); b = bigPrimitive(b); while (bigDeg(b) > 0 || (bigDeg(b) === 0 && b[0] !== 0n)) { if (bigDeg(b) === 0) return [1n]; const r = bigPrem(a, b); a = b; b = bigDeg(r) < 0 ? [0n] : bigPrimitive(r); } return bigPrimitive(a); }
  /** @param {BigPoly} a @param {BigPoly} b */
  function bigDiv(a, b) {
    let r = bigTrim(a); const B = bigTrim(b), db = B.length - 1, q = new Array(Math.max(1, r.length - db)).fill(0n);
    while (bigDeg(r) >= db && bigDeg(r) >= 0) { const dr = r.length - 1, sh = dr - db, c = r[dr] / B[db]; if (c * B[db] !== r[dr]) throw new Error("inexact"); q[sh] = c; for (let i = 0; i <= db; i++) r[i + sh] -= c * B[i]; r = bigTrim(r); }
    if (bigDeg(r) >= 0) throw new Error("inexact");
    return bigTrim(q);
  }
  /** @param {BigPoly} f */
  function yun(f) {
    /** @type {{ factor: BigPoly, m: number }[]} */
    const out = [];
    const a0 = bigPolyGcd(f, bigDeriv(f));
    let b = bigDiv(f, a0), c = bigDiv(bigDeriv(f), a0), dd = bigTrim(c.map((x, i) => x - (bigDeriv(b)[i] ?? 0n)).concat(bigDeriv(b).slice(c.length).map((x) => -x)));
    for (let i = 1; bigDeg(b) > 0 && i < 64; i++) {
      const ai = bigDeg(dd) < 0 ? bigPrimitive(b) : bigPolyGcd(b, dd);
      out.push({ factor: ai, m: i });
      b = bigDiv(b, ai); c = bigDeg(dd) < 0 ? [0n] : bigDiv(dd, ai);
      const db = bigDeriv(b), n = Math.max(c.length, db.length);
      dd = bigTrim(Array.from({ length: n }, (_, k) => (c[k] ?? 0n) - (db[k] ?? 0n)));
    }
    return out.filter((t) => bigDeg(t.factor) > 0);
  }
  /** @param {Poly} p @returns {{ z: Complex, m: number }[]} */
  function squarefreeRoots(p) {
    const integral = p.every((c) => Math.abs(c - Math.round(c)) < 1e-6 && Math.abs(c) < 2 ** 52);
    if (!integral) return rootsWithMultiplicity(p, 1e-4);
    try {
      /** @type {{ z: Complex, m: number }[]} */
      const out = [];
      for (const { factor, m } of yun(p.map((c) => BigInt(Math.round(c))))) for (const z of proots(factor.map(Number))) out.push({ z: cx(z.re, Math.abs(z.im) < 1e-10 ? 0 : z.im), m });
      return out;
    } catch { return rootsWithMultiplicity(p, 1e-4); }
  }
  /** @type {[number, number][]} */
  const TRANSFORMS = [[0, 0], [1, 0], [0, 1], [2, 1], [1, 3], [3, 2], [-2, 5], [5, -3]];
  /** @param {Form} F @param {Form} G */
  function intersect(F, G) {

    const d = fdeg(F), e = fdeg(G);
    for (const [k, m] of TRANSFORMS) {
      /* x = X + kY, y = Y, z = Z + mY: [0:1:0] in new coordinates is [k:1:m] in old. */
      const X = form([[1, 1, 0, 0], [k, 0, 1, 0]]), Y = form([[1, 0, 1, 0]]), Z = form([[1, 0, 0, 1], [m, 0, 1, 0]]);
      const F2 = fsubst(F, X, Y, Z), G2 = fsubst(G, X, Y, Z);
      if (Math.abs(F2.get(fkey(0, d, 0)) || 0) < 1e-12 && Math.abs(G2.get(fkey(0, e, 0)) || 0) < 1e-12) continue;
      const R = resultantY(F2, G2);
      if (R.every((c) => Math.abs(c) < 1e-9)) return { common: true, points: [], total: Infinity, bezout: d * e, d, e };
      const lead = ptrim(R).length - 1, atInf = d * e - lead;
      /** @type {({ t: Complex, m: number, zinf: false } | { t: null, m: number, zinf: true })[]} */
      const fibres = squarefreeRoots(R.slice(0, lead + 1)).map((r) => ({ t: r.z, m: r.m, zinf: /** @type {const} */ (false) }));
      if (atInf > 0) fibres.push({ t: null, m: atInf, zinf: true });
      /* Recover the point on each fibre: common roots in Y of F2(t, Y, 1) and G2(t, Y, 1) (or at Z = 0). */
      let clean = true;
      const points = fibres.map((fb) => {
        const xs = fb.zinf ? cx(1) : fb.t, zs = fb.zinf ? cx(0) : cx(1);
        /** @param {Form} A @param {number} deg @returns {CPoly} */
        const ypoly = (A, deg) => { const re = new Array(deg + 1).fill(0), im = new Array(deg + 1).fill(0); for (const [key, c] of A) { const [i, j, kk] = exps(key); let t = cx(c); for (let a = 0; a < i; a++) t = cmul(t, xs); for (let a = 0; a < kk; a++) t = cmul(t, zs); re[j] += t.re; im[j] += t.im; } return { re, im }; };
        const fy = ypoly(F2, d), gy = ypoly(G2, e);
        const scale = (/** @type {Complex} */ y) => Math.max(1, ...gy.re.map(Math.abs), ...gy.im.map(Math.abs)) * Math.max(1, cabs(y)) ** e;
        const cand = complexRoots(fy).filter((y) => cabs(evalCpoly(gy, y)) < 1e-6 * scale(y));
        const ys = clusterRoots(cand, 1e-5);
        if (ys.length !== 1) clean = false;
        const yv = ys[0]?.z ?? cx(NaN);
        /* back to the original coordinates */
        const ox = cadd(xs, cmul(cx(k), yv)), oy = yv, oz = cadd(zs, cmul(cx(m), yv));
        return { x: ox, y: oy, z: oz, m: fb.m };
      });
      if (!clean) continue;
      const pts = points.map((p) => {
        const affine = cabs(p.z) > 1e-9, x = affine ? cdiv(p.x, p.z) : null, y = affine ? cdiv(p.y, p.z) : null;
        const real = x && y ? Math.abs(x.im) < 1e-6 && Math.abs(y.im) < 1e-6 : Math.abs(p.x.im) < 1e-6 && Math.abs(p.y.im) < 1e-6;
        /**
         * @typedef {({ affine: true, x: Complex, y: Complex } | { affine: false, x: null, y: null })
         *   & { homogeneous: Complex[], m: number, real: boolean, transverse: boolean }} IntersectionPoint
         */
        // x and y are set exactly when the point is affine.
        return /** @type {IntersectionPoint} */ ({ affine, x, y, homogeneous: [p.x, p.y, p.z], m: p.m, real, transverse: p.m === 1 });
      });
      return { common: false, points: pts, total: pts.reduce((s, p) => s + p.m, 0), bezout: d * e, d, e, transform: [k, m] };
    }
    throw new Error("No generic projection found for these curves.");
  }
  /** @typedef {{ re: number[], im: number[] }} CPoly complex coefficients, ascending */
  /** @param {CPoly} p @param {Complex} z */
  function evalCpoly(p, z) { let s = cx(0); for (let i = p.re.length - 1; i >= 0; i--) s = cadd(cmul(s, z), cx(p.re[i], p.im[i])); return s; }
  /** @param {CPoly} p @returns {Complex[]} */
  function complexRoots(p) {
    /* roots of a polynomial with complex coefficients (Durand–Kerner) */
    let n = p.re.length - 1;
    while (n > 0 && Math.hypot(p.re[n], p.im[n]) < 1e-12) n--;
    if (n < 1) return [];
    const lead = cx(p.re[n], p.im[n]), a = Array.from({ length: n + 1 }, (_, i) => cdiv(cx(p.re[i], p.im[i]), lead));
    const ev = (/** @type {Complex} */ z) => { let s = cx(0); for (let i = n; i >= 0; i--) s = cadd(cmul(s, z), a[i]); return s; };
    const R = 1 + Math.max(...a.slice(0, n).map(cabs));
    let z = Array.from({ length: n }, (_, k) => cmul(cx(R * 0.8), cx(Math.cos((2 * Math.PI * k) / n + 0.3), Math.sin((2 * Math.PI * k) / n + 0.3))));
    for (let it = 0; it < 800; it++) {
      let moved = 0;
      z = z.map((zk, k) => { let den = cx(1); z.forEach((zj, j) => { if (j !== k) den = cmul(den, csub(zk, zj)); }); if (cabs(den) === 0) return zk; const w = cdiv(ev(zk), den); moved = Math.max(moved, cabs(w)); return csub(zk, w); });
      if (moved < 1e-14 * R) break;
    }
    return z;
  }
  /* Curves used by the intersection microscope (integer coefficients, all smooth). */
  const PLANE = {
    line: { name: "line y = 0", d: 1, F: form([[1, 0, 1, 0]]) },
    conic: { name: "conic x² + y² = z²", d: 2, F: form([[1, 2, 0, 0], [1, 0, 2, 0], [-1, 0, 0, 2]]) },
    cubic: { name: "cubic y²z = x³ − xz²", d: 3, F: form([[1, 0, 2, 1], [-1, 3, 0, 0], [1, 1, 0, 2]]) },
    quartic: { name: "quartic x⁴ + y⁴ = z⁴", d: 4, F: form([[1, 4, 0, 0], [1, 0, 4, 0], [-1, 0, 0, 4]]) },
  };
  /* A line ax + by + cz = 0 as a form. */
  const lineForm = (/** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ c) => form([[a, 1, 0, 0], [b, 0, 1, 0], [c, 0, 0, 1]]);
  /* The Weierstrass cubic y²z = x³ + axz² + bz³ as a form. */
  const cubicForm = (/** @type {Weierstrass} */ E) => form([[1, 0, 2, 1], [-1, 3, 0, 0], [-E.a, 1, 0, 2], [-E.b, 0, 0, 3]]);
  /** @param {Form} A */
  function formStr(A, vars = ["x", "y", "z"]) {
    const terms = [...A.entries()].filter(([, c]) => Math.abs(c) > 1e-12).map(([k, c]) => /** @type {[number[], number]} */ ([exps(k), c])).sort((p, q) => q[0][0] - p[0][0] || q[0][1] - p[0][1]);
    if (!terms.length) return "0";
    return terms.map(([[i, j, k], c], n) => { const mon = pow(vars[0], i) + pow(vars[1], j) + pow(vars[2], k), mag = Math.abs(c), co = Math.abs(mag - 1) < 1e-9 && mon ? "" : fmt(mag); return signed(n, c) + co + mon; }).join("");
  }

  /* ---------- projective relations among sections ---------- */
  /* Monomials of degree k in n + 1 variables, as exponent vectors. */
  /** @param {number} nvars @param {number} k @returns {number[][]} */
  function monomials(nvars, k) {
    if (nvars === 1) return [[k]];
    const out = [];
    for (let i = k; i >= 0; i--) for (const rest of monomials(nvars - 1, k - i)) out.push([i, ...rest]);
    return out;
  }
  /* Jacobi eigen-decomposition of a symmetric matrix. */
  /** @param {number[][]} A */
  function jacobiEigen(A) {
    const n = A.length, a = A.map((r) => r.slice());
    /** @type {number[][]} */
    const V = a.map((_, i) => a.map((__, j) => (i === j ? 1 : 0)));
    for (let sweep = 0; sweep < 100; sweep++) {
      let off = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] ** 2;
      if (off < 1e-30) break;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-300) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]), t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
        for (let k = 0; k < n; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
        for (let k = 0; k < n; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
      }
    }
    return { values: a.map((r, i) => r[i]), vectors: a.map((_, j) => V.map((r) => r[j])) };
  }
  /* The degree-k forms vanishing on sample points of an image curve in Pⁿ: the null space of the evaluation matrix. */
  /** @param {number[][]} points @param {number} k */
  function relations(points, k, tol = 1e-9) {
    const nv = points[0].length, mons = monomials(nv, k);
    const rows = points.map((p) => { const s = Math.hypot(...p); const q = p.map((c) => c / s); return mons.map((e) => e.reduce((acc, ex, i) => acc * q[i] ** ex, 1)); });
    const m = mons.length, MtM = Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, j) => rows.reduce((s, r) => s + r[i] * r[j], 0)));
    const { values, vectors } = jacobiEigen(MtM), top = Math.max(...values.map(Math.abs));
    const kernel = vectors.filter((_, i) => Math.abs(values[i]) < tol * top);
    return { monomials: mons, dimension: kernel.length, kernel };
  }
  const VARS = ["X", "Y", "Z", "W", "V", "U"];
  /** @param {number[]} vec @param {number[][]} mons */
  function relationStr(vec, mons, vars = VARS) {
    // A kernel vector is nonzero, so it has a leading coefficient.
    const big = Math.max(...vec.map(Math.abs)), lead = /** @type {number} */ (vec.find((c) => Math.abs(c) > 1e-6 * big)), s = 1 / lead;
    const parts = vec.map((c, i) => /** @type {[number, number[]]} */ ([c * s, mons[i]])).filter(([c]) => Math.abs(c) > 1e-6);
    return parts.map(([c, e], n) => { const mon = e.map((ex, i) => pow(vars[i], ex)).join(""), mag = Math.abs(c), co = Math.abs(mag - 1) < 1e-6 ? "" : fmt(mag); return signed(n, c) + co + mon; }).join("") + " = 0";
  }
  /* §22/48: sample E, map by [1 : x : y], and recover the cubic relation. Coefficients normalised so Y²Z has 1. */
  /** @param {Weierstrass} E */
  function ecImagePoints(E, n = 3, count = 24) {
    const pts = [], roots = ecCubicRoots(E), e1 = /** @type {number} a cubic has a real root */ (roots.at(-1)), basis = ecBasisAtO(n);
    for (let k = 0; k < count; k++) {
      const x = e1 + 0.15 + 0.37 * k + 0.011 * k * k, y = (k % 2 ? -1 : 1) * Math.sqrt(ecf(E, x));
      pts.push(basis.map((b) => x ** b.i * y ** b.j));
    }
    return { basis, points: pts };
  }
  /**
   * @param {Weierstrass} E
   * @returns {{ ok: false, dimension: number, equation?: undefined }
   *   | { ok: true, dimension: 1, a: number, b: number, x3: number, residual: number, equation: string }}
   */
  function recoverCubic(E) {
    const { points } = ecImagePoints(E, 3), rel = relations(points, 3);
    if (rel.dimension !== 1) return { ok: false, dimension: rel.dimension };
    /* variables X = 1 (z), Y = x, Z = y  ⇒ rename to (z, x, y) */
    const v = rel.kernel[0], idx = (/** @type {number} */ ez, /** @type {number} */ ex, /** @type {number} */ ey) => rel.monomials.findIndex((e) => e[0] === ez && e[1] === ex && e[2] === ey);
    const s = 1 / v[idx(1, 0, 2)], coef = (/** @type {number} */ ez, /** @type {number} */ ex, /** @type {number} */ ey) => v[idx(ez, ex, ey)] * s;
    const clean = (/** @type {number} */ c) => (Math.abs(c) < 1e-8 ? 0 : Math.round(c * 1e8) / 1e8);
    const recovered = { y2z: 1, x3: clean(-coef(0, 3, 0)), xz2: clean(-coef(2, 1, 0)), z3: clean(-coef(3, 0, 0)) };
    const others = rel.monomials.map((e, i) => /** @type {[number[], number]} */ ([e, v[i] * s])).filter(([e]) => !["1,0,2", "0,3,0", "2,1,0", "3,0,0"].includes(e.join(",")));
    return { ok: true, dimension: 1, a: recovered.xz2, b: recovered.z3, x3: recovered.x3, residual: Math.max(...others.map(([, c]) => Math.abs(c))),
      equation: `y²z = ${formStr(form([[1, 3, 0, 0], [recovered.xz2, 1, 0, 2], [recovered.z3, 0, 0, 3]]))}` };
  }
  /* Veronese P¹ → P^d by 1, x, …, x^d, and the quadrics through its image. */
  /** @param {number} d */
  function veronese(d, count = 3 * d + 6) {
    const pts = Array.from({ length: count }, (_, k) => { const x = -2 + (4 * k) / (count - 1) + 0.013 * k; return Array.from({ length: d + 1 }, (_, i) => x ** i); });
    const q = d >= 2 ? relations(pts, 2, 1e-10) : { dimension: 0, kernel: /** @type {number[][]} */ ([]), monomials: /** @type {number[][]} */ ([]) };
    return { d, target: d, basis: Array.from({ length: d + 1 }, (_, i) => mono(i)), points: pts, quadrics: q.dimension, expectedQuadrics: choose(d + 2, 2) - (2 * d + 1),
      name: ["a point", "the line P¹ itself", "the conic XZ = Y²", "the twisted cubic", "the rational normal quartic"][d] || `the rational normal curve of degree ${d}`,
      quadricEquations: d === 2 ? q.kernel.map((v) => relationStr(v, q.monomials)) : minors(d) };
  }

  /* The rational normal curve is cut out by the 2×2 minors of [X₀ … X_{d−1}; X₁ … X_d]. */
  /** @param {number} d */
  function minors(d) {
    const V = (/** @type {number} */ i) => (d <= 5 ? VARS[i] : `X${sub(i)}`), out = [];
    for (let i = 0; i < d; i++) for (let j = i + 1; j < d; j++) out.push(`${V(i)}${V(j + 1)} − ${V(i + 1)}${V(j)} = 0`.replace(/(\w)\1/g, "$1²"));
    return out;
  }

  /* ---------- linear-system stages (§30–32) ---------- */
  /* On E the whole tower is exact: ℓ is known for every divisor. */
  /** @param {Weierstrass} E @param {Divisor<ECPoint>} D @param {ECPoint | null} [P] @param {ECPoint | null} [Q] */
  function ecStages(E, D, P = null, Q = null) {

    const d = degree(D), ell = ecEll(E, D), S = ecSum(E, D);
    const basePoint = d === 1 ? S : null;
    /** @type {{ deg: number, ell: number, basePointFree: boolean, basePoint: ECPoint | null, separatesPoints: boolean, separatesTangents: boolean, veryAmple: boolean, why: string, pair?: { separated: boolean, why: string } }} */
    const res = { deg: d, ell, basePointFree: d >= 2 || (d === 0 && !!S.inf), basePoint, separatesPoints: d >= 3, separatesTangents: d >= 3, veryAmple: d >= 3,
      why: d <= 0 ? "ℓ(D) ≤ 1: the map is constant (or undefined)." : d === 1 ? `|D| = {one effective divisor}: every section vanishes at the point ${ecname(S)}, a base point.`
        : d === 2 ? "Base-point free, but P and Q collapse whenever P + Q ∼ D: a 2 : 1 map to P¹." : "Degree ≥ 3 = 2g + 1: very ample, an embedding." };
    if (P && Q) {
      const DPQ = normalize([...D, { p: P, n: -1 }, { p: Q, n: -1 }], eckey), sep = ecEll(E, DPQ) === ell - 2;
      res.pair = { separated: sep, why: sep ? "some section vanishes at P but not at Q" : "every section vanishing at P also vanishes at Q: P and Q collapse under φ_D" };
    }
    return res;
  }
  /* General criteria on a genus-g curve (Hartshorne IV.3.1–3.2). */
  /** @param {number} d @param {number} g */
  function genusStages(d, g) {
    return { deg: d, g, basePointFreeGuaranteed: d >= 2 * g, veryAmpleGuaranteed: d >= 2 * g + 1,
      text: `On every genus-${g} curve, deg D ≥ 2g = ${2 * g} gives base-point free and deg D ≥ 2g + 1 = ${2 * g + 1} gives very ample.` };
  }

  /* ---------- canonical maps (§49–51) ---------- */
  /** @param {number} g @param {boolean} hyperelliptic */
  function canonicalMap(g, hyperelliptic) {
    if (g < 2) return { g, target: g - 1, description: g === 1 ? "K ∼ 0: φ_K is constant" : "g = 0: L(K) = 0, no canonical map", embedding: false };
    if (g === 2 && !hyperelliptic) return { g, impossible: true, description: "Every genus-2 curve is hyperelliptic: φ_K : C → P¹ is the double cover." };
    if (hyperelliptic) return { g, target: g - 1, embedding: false, degreeOfMap: 2, imageDegree: g - 1, image: g === 2 ? "P¹" : g === 3 ? "a conic in P²" : `a rational normal curve of degree ${g - 1} in P${sup(g - 1)}`,
      description: `2 : 1 onto ${g === 2 ? "P¹" : g === 3 ? "a conic" : "a twisted cubic"}: φ_K factors through x : C → P¹`, check: `deg K = ${2 * g - 2} = 2 · ${g - 1}` };
    const image = g === 3 ? "a smooth plane quartic" : g === 4 ? "a sextic in P³, the intersection of a quadric and a cubic" : `a canonical curve of degree ${2 * g - 2}`;
    return { g, target: g - 1, embedding: true, degreeOfMap: 1, imageDegree: 2 * g - 2, image, description: `C ↪ P${sup(g - 1)} as ${image}`, check: `deg φ_K(C) = deg K = ${2 * g - 2}` };
  }
  /* §39: Clifford — ℓ(D) ≤ deg D/2 + 1 for effective special D; hyperelliptic g¹₂ multiples attain it. */
  /** @param {number} g */
  function cliffordData(g, hyperelliptic = true) {
    /* Effective divisors: a general one of degree d has ℓ = max(1, d + 1 − g); on a hyperelliptic curve
       k·g¹₂ (+ a point) has ℓ = ⌊d/2⌋ + 1, attaining Clifford at even d. Without the g¹₂ only 0 and K attain it. */
    const pts = [];
    for (let d = 0; d <= 2 * g + 2; d++) {
      if (d > 2 * g - 2) pts.push({ d, ell: d + 1 - g, kind: "nonspecial" });
      else if (d === 0) pts.push({ d, ell: 1, kind: "D = 0" });
      else if (d === 2 * g - 2) pts.push({ d, ell: g, kind: "D = K" });
      else if (hyperelliptic) pts.push({ d, ell: Math.floor(d / 2) + 1, kind: d % 2 ? `${(d - 1) / 2}·g¹₂ + P` : `${d / 2}·g¹₂` });
      else pts.push({ d, ell: Math.max(1, d + 1 - g), kind: "general effective" });
    }
    return { g, points: pts, cliffordBound: (/** @type {number} */ d) => d / 2 + 1, rrLine: (/** @type {number} */ d) => d + 1 - g };
  }

  /* ---------- symbolic computation mode (§53) ---------- */
  /* Parse a polynomial in x with integer or decimal coefficients: "x^5 - x + 1", "x³ − 2x". */
  /** @param {unknown} text @returns {Poly} */
  function parsePoly(text) {
    let s = String(text).replace(/[−–]/g, "-").replace(/\s+/g, "").replace(/\*\*/g, "^").replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (m) => "^" + fromSup(m));
    if (!s) throw new Error("Empty polynomial.");
    if (!/^[-+]/.test(s)) s = "+" + s;
    /** @type {number[]} */
    const coeffs = [];
    const re = /([-+])(\d*\.?\d*)\*?(x(?:\^(\d+))?)?/gy;
    let m, pos = 0;
    while (pos < s.length) {
      re.lastIndex = pos; m = re.exec(s);
      if (!m || m[0].length <= 1 && !m[2] && !m[3]) throw new Error(`Could not read “${text}” as a polynomial in x.`);
      const c = (m[1] === "-" ? -1 : 1) * (m[2] ? Number(m[2]) : 1), e = m[3] ? (m[4] ? Number(m[4]) : 1) : 0;
      if (!m[2] && !m[3]) throw new Error(`Could not read “${text}” as a polynomial in x.`);
      if (!Number.isFinite(c) || e > 12) throw new Error("Coefficients must be numbers and degrees at most 12.");
      while (coeffs.length <= e) coeffs.push(0);
      coeffs[e] += c; pos = re.lastIndex;
    }
    return ptrim(coeffs);
  }
  /**
   * @param {unknown} text
   * @returns {{ type: "P1", g: number, label: string }
   *   | { type: "elliptic" | "hyperelliptic", f: Poly, degf: number, g: number, weierstrass: boolean, a: number | null, b: number | null, label: string }}
   */
  function parseCurve(text) {
    const s = String(text).trim().replace(/\s+/g, " ");
    if (/^(P1|P\^1|P¹|projective line)$/i.test(s)) return { type: "P1", g: 0, label: "P¹" };
    const m = /^y\s*(?:\^\s*2|²)\s*=\s*(.+)$/i.exec(s.replace(/−/g, "-"));
    if (!m) throw new Error("Write the curve as P1 or y^2 = f(x).");
    const f = parsePoly(m[1]), n = f.length - 1;
    if (n < 3) throw new Error("deg f must be at least 3 (deg f ≤ 2 gives a rational curve).");
    const rs = proots(f);
    let sep = Infinity; for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) sep = Math.min(sep, cabs(csub(rs[i], rs[j])));
    if (sep < 1e-6) throw new Error("f has a repeated root, so y² = f(x) is singular; choose a square-free f.");
    const g = hyperGenus(n);
    const weierstrass = n === 3 && Math.abs(f[3] - 1) < 1e-12 && Math.abs(f[2]) < 1e-12;
    return { type: n === 3 ? "elliptic" : "hyperelliptic", f, degf: n, g, weierstrass, a: weierstrass ? f[1] : null, b: weierstrass ? f[0] : null, label: `y² = ${pstr(f)}` };
  }
  const MAX_MULTIPLICITY = 60;
  /** @param {number} n */
  function boundedMultiplicity(n) {
    if (Math.abs(n) > MAX_MULTIPLICITY) throw new Error(`Multiplicities are limited to |n| ≤ ${MAX_MULTIPLICITY} in computation mode.`);
    return n;
  }
  /* Divisors in computation mode: "3inf", "3∞", "3O", "2[0] + [1] - [inf]" (P¹), "K". */
  /**
   * @param {unknown} text @param {{ type: string }} curve
   * @returns {{ canonical?: true, atInfinity?: number, divisor?: Divisor<P1Point> }} exactly one of the three
   */
  function parseDivisor(text, curve) {
    const s = String(text).replace(/[−–]/g, "-").replace(/\s+/g, "").replace(/∞/g, "inf");
    if (/^K$/i.test(s)) return { canonical: true };
    const atInf = /^(-?\d*)\*?(inf|O|\[inf\])$/i.exec(s);
    if (atInf) { const n = atInf[1] === "" ? 1 : atInf[1] === "-" ? -1 : Number(atInf[1]); return { atInfinity: boundedMultiplicity(n) }; }
    if (curve.type !== "P1") throw new Error("On this curve the symbolic engine supports divisors n∞ (or nO), and K.");
    /** @type {Divisor<P1Point>} */
    const terms = [];
    const re = /([-+]?)(\d*)\*?\[([^\]]+)\]/gy;
    let pos = 0;
    while (pos < s.length) {
      re.lastIndex = pos; const m = re.exec(s);
      if (!m) throw new Error("Write a divisor on P¹ as e.g. 2[0] + [1] − [inf].");
      const n = (m[1] === "-" ? -1 : 1) * (m[2] ? Number(m[2]) : 1);
      /** @type {P1Point} */
      const p = /^inf$/i.test(m[3]) ? INF : cx(Number(m[3]));
      if (!p.inf && !Number.isFinite(p.re)) throw new Error(`“${m[3]}” is not a point of P¹ (use a number or inf).`);
      terms.push({ p, n }); pos = re.lastIndex;
    }
    const divisor = normalize(terms, p1key);
    divisor.forEach((t) => boundedMultiplicity(t.n));
    return { divisor };
  }
  /** @param {unknown} curveText @param {unknown} divisorText */
  function compute(curveText, divisorText) {
    const curve = parseCurve(curveText);
    const D = parseDivisor(divisorText, curve);
    if (curve.type === "P1") {
      /** @type {Divisor<P1Point>} */
      const Dv = D.canonical ? [{ p: INF, n: -2 }] : D.atInfinity !== undefined ? [{ p: INF, n: D.atInfinity }] : /** @type {Divisor<P1Point>} */ (D.divisor);
      const r = p1Basis(Dv);
      return { curve, divisor: p1str(r.D) || "0", deg: r.deg, g: 0, ell: r.ell, basis: r.basis.map((b) => b.label), poles: null, rr: r.rr, supported: true,
        note: D.canonical ? "K = div(dx) = −2[∞] on P¹ (dx has a double pole at ∞)." : r.condition };
    }
    const g = curve.g;
    if (D.canonical) {
      if (curve.degf % 2 === 0) return { curve, divisor: "K", deg: 2 * g - 2, g, ell: g, basis: hyperCanonical(g).basis.map((b) => b.differential), rr: riemannRoch(g, 2 * g - 2, g), supported: true, note: "Holomorphic differentials xⁱ dx/y, 0 ≤ i ≤ g − 1." };
      const hc = hyperCanonical(g), b = hyperBasis(curve.degf, 2 * g - 2);
      return { curve, divisor: g === 1 ? "K = 0" : `K = ${2 * g - 2}∞`, deg: 2 * g - 2, g, ell: b.ell, basis: b.basis.map((x) => x.label), poles: b.poles, differentials: hc.basis.map((x) => x.differential), rr: riemannRoch(b.ell, 2 * g - 2, g), supported: true,
        note: "div(dx/y) = (2g − 2)∞, so L(K) = L((2g − 2)∞) and fᵢ ↦ fᵢ dx/y gives the holomorphic differentials." };
    }
    // Off P¹ the divisor is K (handled above) or n∞.
    const n = /** @type {number} */ (D.atInfinity), b = hyperBasis(curve.degf, n);
    const ell = n < 0 ? 0 : b.ell;
    return { curve, divisor: b.divisor, deg: b.deg, g, ell, basis: n < 0 ? [] : b.basis.map((x) => x.label), poles: n < 0 ? [] : b.poles, rr: riemannRoch(ell, b.deg, g), supported: true,
      note: b.odd ? `ord∞ x = −2, ord∞ y = −${2 * g + 1}; ${g === 1 ? "on y² = cubic, ∞ is the origin O" : "y² = f(x) removes every yʲ with j ≥ 2"}.` : "Two points at infinity: x has a simple pole at each, y a pole of order g + 1 at each." };
  }

  /* ---------- function-field view (§56–57) ---------- */
  /** @param {P1Function} f @param {P1Point[]} points */
  function valuationVector(f, points) { const D = p1div(f); return points.map((P) => D.find((t) => p1key(t.p) === p1key(P))?.n ?? 0); }
  /* Toy example: functions x^a (x − 1)^b on P¹; v₀ = a, v₁ = b, v∞ = −a − b. L(D) is the lattice points in the half-planes. */
  /** @param {number} n0 @param {number} n1 @param {number} nInf */
  function valuationLattice(n0, n1, nInf, R = 4) {
    const pts = [];
    for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) pts.push({ a, b, vinf: -a - b, inside: a >= -n0 && b >= -n1 && -a - b >= -nInf });
    return { points: pts, inequalities: [`v₀ ≥ ${fmt(-n0)}`, `v₁ ≥ ${fmt(-n1)}`, `v∞ ≥ ${fmt(-nInf)}`], count: pts.filter((p) => p.inside).length };
  }

  /* ---------- the main laboratory: curve + divisor → everything ---------- */
  /** @type {Record<string, { label: string, g: number | null }>} */
  const CURVES = {
    P1: { label: "P¹", g: 0 },
    elliptic: { label: "Elliptic curve", g: 1 },
    hyperelliptic: { label: "Hyperelliptic curve", g: null },
    plane: { label: "Smooth plane curve", g: null },
    abstract: { label: "Abstract curve of genus g", g: null },
  };
  /* state.curve: { type, a, b (elliptic), f (hyperelliptic, ascending), d (plane), g (abstract) }
     state.divisor: list of { p, n } on that curve; for plane curves { hyper: n } (nH); for abstract { deg, kind }. */
  /**
   * The curve as the page sets it.
   * @typedef {{ type: "P1" } | { type: "elliptic", a: number, b: number } | { type: "hyperelliptic", f: Poly }
   *   | { type: "plane", d: number } | { type: "abstract", g: number }} CurveState
   */
  /**
   * A divisor as the page sets it: terms on P¹, E or a hyperelliptic curve; nH on a plane curve; on an abstract
   * curve its points or a named class; or n at infinity.
   * @typedef {Divisor<any> | { hyper?: number, kind?: string, deg?: number, points?: { label?: string, n: number }[], atInfinity?: number }} DivisorState
   */
  /**
   * What the laboratory shows for a curve and a divisor. Every curve type sets the shared fields; each adds its
   * own extras (the map, the stages, a range of ℓ, the sum in the group law…), which the page reads per type.
   * @typedef {{ curveType: string, [field: string]: any }} Analysis
   */
  /** @param {{ curve: CurveState, divisor?: DivisorState }} state @returns {Analysis} */
  function analyse(state) {
    const c = state.curve;
    /** @type {Analysis} */
    const out = { curveType: c.type };
    if (c.type === "P1") {
      const r = p1Basis(/** @type {Divisor<P1Point>} */ (state.divisor || []));
      const v = r.deg >= 0 ? veronese(Math.min(r.deg, 6)) : null;
      Object.assign(out, { g: 0, D: r.D, divisor: p1str(r.D), deg: r.deg, ell: r.ell, exact: true, basis: r.basis.map((b) => b.label), condition: r.condition, rr: r.rr, nonspecial: r.deg > -2,
        map: r.deg < 0 ? { target: -1, description: "L(D) = 0: no map" } : { target: r.deg, description: r.deg === 0 ? "constant map to a point" : `P¹ → P${sup(r.deg)}: ${/** @type {{ name: string }} deg ≥ 1, so the Veronese map exists */ (v).name}${r.D.some((t) => !t.p.inf) ? " (after clearing the common factor r/q)" : ""}`, embedding: r.deg >= 1, imageDegree: r.deg },
        basePoints: [], K: "−2[∞]", degK: -2 });
      return out;
    }
    if (c.type === "elliptic") {
      const E = { a: c.a, b: c.b }, D = normalize(/** @type {Divisor<ECPoint>} */ (state.divisor || []), eckey), d = degree(D), ell = ecEll(E, D), S = ecSum(E, D);
      const atO = D.every((t) => t.p.inf);
      const basis = atO ? ecBasisAtO(d) : null, mapD = d >= 1 ? ecMap(E, d) : null;
      Object.assign(out, { g: 1, D, divisor: ecstr(D), deg: d, ell, exact: true, basis: basis ? basis.map((b) => b.label) : null, poles: basis ? basis.map((b) => b.pole) : null, sum: S, sumText: ecname(S), rr: riemannRoch(ell, d, 1), K: "0", degK: 0, nonspecial: d > 0,
        stages: ecStages(E, D), map: mapD ? { ...mapD, description: atO ? mapD.description : `${mapD.description.split(":")[0]}; D ∼ ${d - 1}O + [${ecname(S)}], so φ_D is φ_${d}O up to a translation of E` } : { target: -1, description: ell ? "constant" : "L(D) = 0: no map" },
        basisNote: atO ? null : `D is not supported at O, so the page states ℓ(D) = ${ell} from Riemann–Roch and the group law (sum of D = ${ecname(S)}) instead of writing a basis.` });
      return out;
    }
    if (c.type === "hyperelliptic") {
      const f = c.f, degf = f.length - 1, g = hyperGenus(degf), odd = degf % 2 === 1;
      const D = normalize(hyperDivisor(/** @type {Divisor<HPoint> | { atInfinity?: number } | undefined} */ (state.divisor), odd), hkey), d = degree(D);
      const atInf = D.filter((t) => t.p.inf), nP = atInf.find((t) => t.p.inf === "+")?.n ?? 0, nM = atInf.find((t) => t.p.inf === "-")?.n ?? 0;
      const onInfinity = atInf.length === D.length && (odd || nP === nM);
      const n = !onInfinity ? null : odd ? (D[0]?.n ?? 0) : nP;
      const base = { g, D, divisor: hstr(D), deg: d, K: odd ? (g === 1 ? "0" : `${2 * g - 2}∞`) : g === 1 ? "∞₊ − ∞₋ + (∞₋ − ∞₊) ∼ 0" : `${g - 1}(∞₊ + ∞₋)`, degK: 2 * g - 2, nonspecial: d > 2 * g - 2,
        gaps: odd ? gaps([2, 2 * g + 1]) : null, branchPoints: hyperBranchCount(degf) };
      if (n !== null) {
        const b = hyperBasis(degf, n), ell = n < 0 ? 0 : b.ell, can = n === (odd ? 2 * g - 2 : g - 1);
        Object.assign(out, base, { ell, exact: true, basis: n < 0 ? [] : b.basis.map((x) => x.label), poles: n < 0 ? [] : b.poles, rr: riemannRoch(ell, d, g), canonical: can, n,
          map: canonicalOrNot(g, ell, can, b), basePoints: odd && n > 0 && !b.poles.includes(n) ? ["∞"] : [] });
        return out;
      }
      const rr = rrRange(d, g), eff = !rr.exact && isEffective(D), min = eff ? Math.max(1, rr.min) : rr.min;
      const range = eff ? { ...rr, min, exact: min === rr.max, why: `D is effective, so L(D) contains the constants and ℓ(D) ≥ ${min}; Clifford gives ℓ(D) ≤ ⌊deg D/2⌋ + 1 = ${rr.max}.` } : rr;
      const ell = range.exact ? range.min : null;
      Object.assign(out, base, { ell, exact: range.exact, range, basis: null, rr: ell !== null ? riemannRoch(ell, d, g) : null, basePoints: [],
        basisNote: range.exact ? `${eff ? range.why.replace(/\.$/, "") : `deg D ${d < 0 ? "< 0" : `> 2g − 2 = ${2 * g - 2}`}`}, so ℓ(D) = ${ell}${eff ? "" : " by Riemann–Roch"}. The symbolic basis is written for divisors supported at infinity only; move the points to ∞ to see one.`
          : `${range.why} The exact value depends on where the points sit (for example P + ιP ∼ (x)_∞ moves in a pencil), so the page shows the bounds rather than guessing.`,
        map: { target: ell !== null ? ell - 1 : null, description: ell !== null && ell >= 2 ? `φ_D : C → P${sup(ell - 1)} (sections not written for this divisor)` : "Riemann–Roch fixes ℓ(D) here, not the sections." } });
      return out;
    }
    if (c.type === "plane") {
      const d = c.d, g = planeGenus(d), n = /** @type {{ hyper?: number } | undefined} */ (state.divisor)?.hyper ?? 1, ell = planeEll(d, n), deg = n * d;
      Object.assign(out, { g, divisor: `${n}H`, deg, ell, exact: true, basis: planeBasis(d, n), rr: riemannRoch(ell, deg, g), K: `${d - 3}H`, degK: d * (d - 3), nonspecial: deg > 2 * g - 2,
        map: { target: ell - 1, description: n === 1 ? `the plane embedding C ⊂ P²${d === 4 ? ", which is the canonical map (K = H)" : ""}` : `the degree-${n} Veronese map restricted to C, into P${sup(ell - 1)}` }, adjunction: adjunction(d) });
      return out;
    }
    if (c.type === "abstract") {
      const g = c.g, dv = /** @type {{ kind?: string, deg?: number, points?: { label?: string, n: number }[] }} */ (state.divisor || {}), kind = dv.kind || "points";
      if (kind === "points") {
        const pts = (dv.points || []).filter((t) => t.n), d = pts.reduce((x, t) => x + t.n, 0), eff = pts.every((t) => t.n > 0);
        const range = rrRange(d, g), ell = d < 0 ? 0 : range.exact ? range.min : eff ? Math.max(1, d + 1 - g) : null;
        Object.assign(out, { g, divisor: pts.length ? divStr(pts.map((t) => ({ p: t.label || "P", n: t.n })), (p) => p) : "0", deg: d, ell, exact: ell !== null, range, rr: ell !== null ? riemannRoch(ell, d, g) : null, K: "K", degK: 2 * g - 2,
          nonspecial: d > 2 * g - 2, stages: genusStages(d, g), general: eff && !range.exact,
          basisNote: eff && !range.exact ? `For ${d} points in general position (a repeated point not a Weierstrass point) ℓ(K − D) = max(0, g − ${d}) = ${Math.max(0, g - d)}, so ℓ(D) = max(1, deg D + 1 − g) = ${ell}. Special positions can raise it (Clifford allows up to ${range.max}).` : ell === null ? range.why : null,
          map: { target: ell !== null ? ell - 1 : null, description: "Riemann–Roch fixes ℓ(D); an abstract curve has no coordinates to write the sections in." } });
        return out;
      }
      const d = kind === "canonical" ? 2 * g - 2 : kind === "zero" ? 0 : dv.deg ?? 0, range = rrRange(d, g), ell = abstractEll(d, g, kind);
      Object.assign(out, { g, divisor: kind === "canonical" ? "K" : kind === "zero" ? "0" : `a general class of degree ${d}`, deg: d, ell, exact: ell !== null, range, rr: ell !== null ? riemannRoch(ell, d, g) : null, K: "K", degK: 2 * g - 2,
        nonspecial: d > 2 * g - 2, stages: genusStages(d, g), canonical: kind === "canonical",
        map: kind === "canonical" && g >= 2 ? { target: g - 1, description: `φ_K : C → P${sup(g - 1)} — an embedding unless C is hyperelliptic (see the canonical-map laboratory)` } : { target: ell !== null ? ell - 1 : null, description: "Riemann–Roch fixes ℓ(D); an abstract curve has no coordinates to write the sections in." } });
      return out;
    }
    throw new Error(`Unknown curve type ${/** @type {{ type: string }} */ (c).type}`);
  }
  /** @typedef {{ inf: true } | { inf: "+" } | { inf: "-" } | (Affine & { inf?: undefined })} HPoint ∞ (deg f odd), ∞₊ or ∞₋ (deg f even), or an affine point */
  const hkey = (/** @type {HPoint} */ p) => (p.inf === true ? "∞" : p.inf === "+" ? "∞₊" : p.inf === "-" ? "∞₋" : coordKey(p.x, p.y));
  const hname = (/** @type {HPoint} */ p) => (p.inf ? hkey(p) : `(${fmt(p.x, 3)}, ${fmt(p.y, 3)})`);
  /** @param {Divisor<HPoint>} D */
  function hstr(D) {
    const nP = D.find((t) => t.p.inf === "+"), nM = D.find((t) => t.p.inf === "-");
    if (nP && nM && nP.n === nM.n && D.length === 2) return nP.n === 1 ? "∞₊ + ∞₋" : `${nP.n === -1 ? "−" : nP.n}(∞₊ + ∞₋)`;
    return divStr(D, (p) => (p.inf ? hkey(p) : `[${hname(p)}]`));
  }
  /** @param {Divisor<HPoint> | { atInfinity?: number } | undefined} dv @param {boolean} odd @returns {Divisor<HPoint>} */
  function hyperDivisor(dv, odd) {
    if (Array.isArray(dv)) return dv;
    const n = dv?.atInfinity ?? 0;
    return odd ? [{ p: { inf: true }, n }] : [{ p: { inf: "+" }, n }, { p: { inf: "-" }, n }];
  }
  /** @param {number} g @param {number} ell @param {boolean} can @param {ReturnType<typeof hyperBasis>} b */
  function canonicalOrNot(g, ell, can, b) {
    if (can && g >= 2) return { target: g - 1, ...canonicalMap(g, true) };
    if (ell <= 1) return { target: ell - 1, description: ell === 1 ? "constant map" : "no sections" };
    const usesY = b.basis.some((x) => x.kind === "y");
    return { target: ell - 1, description: usesY ? `C → P${sup(ell - 1)} by [${b.basis.map((x) => x.label).join(" : ")}]: y is a coordinate, so ±y are told apart` : `C → P${sup(ell - 1)} by powers of x only: factors through x, 2 : 1 onto a rational normal curve`, embedding: false };
  }
  /** @param {number} d @param {number} n */
  function planeBasis(d, n) {

    /* Monomials xⁱyʲ (i + j ≤ n) with the multiples of F removed: for n ≥ d drop those divisible by the leading monomial. */
    const out = [];
    for (let s = 0; s <= n; s++) for (let j = 0; j <= s; j++) { if (n >= d && j >= d) continue; out.push(mono(s - j, j)); }
    return out;
  }

  /* ---------- presets (§45) ---------- */
  const W = { a: -1, b: 1 };
  /** @type {{ id: string, title: string, state: { curve: CurveState, divisor?: DivisorState } }[]} */
  const PRESETS = [
    { id: "p1-3inf", title: "P¹, D = 3∞", state: { curve: { type: "P1" }, divisor: [{ p: INF, n: 3 }] } },
    { id: "p1-pq", title: "P¹, D = P + Q", state: { curve: { type: "P1" }, divisor: [{ p: cx(0), n: 1 }, { p: cx(1), n: 1 }] } },
    { id: "e-o", title: "Elliptic E, D = O", state: { curve: { type: "elliptic", ...W }, divisor: [{ p: O, n: 1 }] } },
    { id: "e-2o", title: "Elliptic E, D = 2O", state: { curve: { type: "elliptic", ...W }, divisor: [{ p: O, n: 2 }] } },
    { id: "e-3o", title: "Elliptic E, D = 3O", state: { curve: { type: "elliptic", ...W }, divisor: [{ p: O, n: 3 }] } },
    { id: "g2", title: "Genus-2 hyperelliptic curve", state: { curve: { type: "hyperelliptic", f: [0, 4, 0, -5, 0, 1] }, divisor: { atInfinity: 5 } } },
    { id: "k2", title: "Canonical divisor on genus 2", state: { curve: { type: "hyperelliptic", f: [0, 4, 0, -5, 0, 1] }, divisor: { atInfinity: 2 } } },
    { id: "k3", title: "Canonical divisor on genus 3", state: { curve: { type: "hyperelliptic", f: [0, -1, 0, 0, 0, 0, 0, 1] }, divisor: { atInfinity: 4 } } },
    { id: "cubic", title: "Smooth plane cubic", state: { curve: { type: "plane", d: 3 }, divisor: { hyper: 1 } } },
    { id: "quartic", title: "Smooth plane quartic", state: { curve: { type: "plane", d: 4 }, divisor: { hyper: 1 } } },
    { id: "six", title: "Degree-2 cover of P¹ with six branch points", state: { curve: { type: "hyperelliptic", f: [-1, 0, 14, 0, -49, 0, 36] }, divisor: { atInfinity: 1 } } },
  ];

  /* ---------- §65: every minimum computation, as data the page and the tests share ---------- */
  function minimumComputations() {
    const E = { a: -1, b: 1 };
    /** @type {{ id: string, claim: string, value: string | undefined, ok: boolean | undefined }[]} */
    const out = [];
    const L3 = p1Basis([{ p: INF, n: 3 }]);
    out.push({ id: "p1-L", claim: "L(d∞) = ⟨1, x, …, x^d⟩ on P¹", value: `L(3∞) = ⟨${L3.basis.map((b) => b.label).join(", ")}⟩`, ok: L3.basis.map((b) => b.label).join() === "1,x,x²,x³" });
    const degs = [1, 2, 3, 4].map((d) => ecEll(E, [{ p: O, n: d - 1 }, { p: { x: 1, y: 1 }, n: 1 }]));
    out.push({ id: "e-ell", claim: "ℓ(D) = deg D on an elliptic curve", value: `deg 1, 2, 3, 4 → ℓ = ${degs.join(", ")}`, ok: degs.join() === "1,2,3,4" });
    const m2 = ecMap(E, 2);
    out.push({ id: "e-2o", claim: "|2O| : E → P¹", value: `basis ${m2.basis.map((b) => b.label).join(", ")}; degree ${m2.degreeOfMap}; branch points ${m2.branchPoints.join(", ")}`, ok: m2.degreeOfMap === 2 && m2.branchPoints.length === 4 });
    const m3 = ecMap(E, 3);
    out.push({ id: "e-3o", claim: "|3O| : E ↪ P²", value: `basis ${m3.basis.map((b) => b.label).join(", ")} with pole orders ${m3.basis.map((b) => b.pole).join(", ")}`, ok: m3.basis.map((b) => b.pole).join() === "0,2,3" });
    const cub = recoverCubic(E);
    out.push({ id: "cubic", claim: "the cubic equation of E from its image", value: cub.equation, ok: cub.ok && Math.abs(/** @type {number} recovered */ (cub.a) - E.a) < 1e-6 && Math.abs(/** @type {number} */ (cub.b) - E.b) < 1e-6 });
    const dc = doubleCover(6);
    out.push({ id: "rh", claim: "the genus of a hyperelliptic double cover by Riemann–Hurwitz", value: dc.text, ok: dc.g === 2 });
    out.push({ id: "plane", claim: "g = (d − 1)(d − 2)/2", value: [1, 2, 3, 4, 5].map((d) => `d = ${d}: g = ${planeGenus(d)}`).join("; "), ok: [1, 2, 3, 4, 5].map(planeGenus).join() === "0,0,1,3,6" });
    const k2 = canonicalMap(2, true);
    out.push({ id: "k2", claim: "the canonical map of a genus-2 curve", value: `ℓ(K) = 2; ${k2.description}`, ok: k2.degreeOfMap === 2 && k2.target === 1 });
    const k3 = canonicalMap(3, false), aq = adjunction(4);
    out.push({ id: "quartic", claim: "the canonical embedding of a smooth plane quartic", value: `K = H by adjunction; deg K = ${aq.degK}; ${k3.description}`, ok: aq.degK === 4 && k3.embedding && planeEll(4, 1) === 3 });
    const P = { x: 1, y: 1 }, Q = { x: 0, y: -1 }, s = ecAdd(E, P, Q);
    const pic = ecEll(E, [{ p: P, n: 1 }, { p: Q, n: 1 }, { p: s, n: -1 }, { p: O, n: -1 }]) === 1;
    out.push({ id: "pic0", claim: "E ≅ Pic⁰(E), P ↦ [P − O]", value: `[P − O] + [Q − O] = [P ⊕ Q − O] with P ⊕ Q = ${ecname(s)}`, ok: pic });
    return out;
  }

  /* ---------- the narrated report (beamdswitch) ---------- */
  const spokenNum = (/** @type {unknown} */ x) => String(x).replace(/^[−-]/, "minus ");
  /** @param {{ curve: CurveState }} state @param {Analysis} r */
  function curveWords(state, r) {
    const c = state.curve;
    if (c.type === "P1") return { name: "the projective line", math: "\\mathbf P^1" };
    if (c.type === "elliptic") return { name: `the elliptic curve y squared equals x cubed ${c.a < 0 ? "minus" : "plus"} ${Math.abs(c.a)} x ${c.b < 0 ? "minus" : "plus"} ${Math.abs(c.b)}`, math: `y^2 = x^3 ${c.a < 0 ? "-" : "+"} ${Math.abs(c.a)}x ${c.b < 0 ? "-" : "+"} ${Math.abs(c.b)}` };
    if (c.type === "hyperelliptic") return { name: `a hyperelliptic curve of genus ${r.g}`, math: `y^2 = ${pstr(c.f).replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (m) => "^{" + fromSup(m) + "}").replace(/−/g, "-")}` };
    if (c.type === "plane") return { name: `a smooth plane curve of degree ${c.d}`, math: `\\deg C = ${c.d}` };
    return { name: `an abstract curve of genus ${c.g}`, math: `g = ${c.g}` };
  }
  const tex = (/** @type {unknown} */ s) => String(s).replace(/−/g, "-").replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (m) => "^{" + fromSup(m) + "}").replace(/∞/g, "\\infty ").replace(/ℓ/g, "\\ell");
  /** @param {{ curve: CurveState, divisor?: DivisorState, date?: string }} state @returns {BeamdswitchReport} */
  function report(state) {
    const r = analyse(state), cw = curveWords(state, r), date = state.date || "";
    const ellText = r.exact ? String(r.ell) : `between ${r.range.min} and ${r.range.max}`;
    const basis = r.basis && r.basis.length ? r.basis : null;
    const md = (/** @type {string} */ s) => s.replace(/\|/g, "∣");
    const setup = [{ title: `The curve: ${r.g === 0 ? "genus 0" : `genus ${r.g}`}`, body: `- Curve: $${cw.math}$\n- Genus $g = ${r.g}$, so $\\deg K = 2g - 2 = ${r.degK}$\n- Divisor $D = ${tex(r.divisor)}$ of degree ${r.deg}`,
      narration: `We work on ${cw.name}, which has genus ${r.g}. The canonical divisor has degree ${spokenNum(r.degK)}. The divisor D has degree ${spokenNum(r.deg)}.` }];
    const method = [{ title: "L(D): functions whose poles D allows", body: "$$L(D) = \\{ f : \\operatorname{div}(f) + D \\ge 0 \\} \\cup \\{0\\}$$\n\n$$\\ell(D) - \\ell(K - D) = \\deg D + 1 - g$$",
      narration: "A rational function belongs to L of D when its divisor plus D is effective: D says where poles are allowed and where zeros are forced. Riemann Roch counts these functions, corrected by the canonical obstruction." }];
    const results = [{ title: `ℓ(D) = ${ellText}`, body: basis ? `Basis: $${basis.map(tex).join(",\\; ")}$${r.poles ? `\n\nPole orders: ${r.poles.join(", ")}` : ""}` : md(r.basisNote || (r.range ? r.range.why : "No basis written for this divisor.")),
      narration: r.exact ? `The space L of D has dimension ${spokenNum(r.ell)}.${basis ? ` The page writes a basis of ${basis.length} functions.` : " The page states the dimension from Riemann Roch rather than inventing a basis."}` : `Riemann Roch alone bounds the dimension between ${r.range.min} and ${r.range.max} here.` },
      { title: "The map φ_D", body: (r.map && r.map.target >= 0 ? `$\\varphi_D : C \\to \\mathbf P^{${r.map.target}}$\n\n` : "") + md(r.map?.description || ""),
        narration: r.map && r.map.target >= 1 ? `The sections become projective coordinates, giving a map to projective space of dimension ${r.map.target}.` : "There are too few sections for a map to a positive-dimensional projective space." }];
    const rr = r.rr;
    const checks = [{ title: "Riemann–Roch balances", body: rr ? `$$${rr.ell} - ${rr.ellKD} = ${rr.deg} + 1 - ${rr.g} = ${rr.chi}$$\n\n${rr.nonspecial ? "Nonspecial: $\\ell(K - D) = 0$." : "Special: $\\ell(K - D) > 0$."}` : "The degree is in the special range, where the curve itself decides.",
      narration: rr ? `The dimension minus the obstruction ${spokenNum(rr.ellKD)} equals the degree plus one minus the genus, which is ${spokenNum(rr.chi)}.${rr.nonspecial ? " The obstruction vanishes, so the divisor is nonspecial." : " The obstruction is positive, so the divisor is special."}` : "In the special range the count depends on the curve and the divisor, not on the degree alone.",
      key: "Divisors control functions, and functions construct geometry." }];
    return { meta: { title: "Riemann–Roch Laboratory report", subtitle: `${r.divisor} on ${cw.name.replace(/^the /, "")}`.slice(0, 120), date, voice: "bf_emma" },
      narration: `This report follows one divisor on ${cw.name}, from allowed poles to functions to a map into projective space.`,
      setup, method, results, checks };
  }

  /* ---------- references (verified at chapter level only) ---------- */
  const REFERENCES = [
    { id: "hartshorne", text: "R. Hartshorne, Algebraic Geometry (Springer GTM 52, 1977)", where: "II.6 Divisors; II.7 Projective morphisms; IV.1 Riemann–Roch theorem; IV.2 Hurwitz's theorem; IV.3 Embeddings in projective space; IV.4 Elliptic curves; IV.5 The canonical embedding" },
    { id: "vakil", text: "R. Vakil, The Rising Sea: Foundations of Algebraic Geometry", where: "the chapters on line bundles and divisors (“Line bundles: invertible sheaves and divisors”) and on curves (“Application: curves”) — chapter numbers differ between drafts" },
    { id: "miranda", text: "R. Miranda, Algebraic Curves and Riemann Surfaces (AMS GSM 5, 1995)", where: "Ch. V Divisors and meromorphic functions; Ch. VI Algebraic curves and the Riemann–Roch theorem" },
    { id: "griffiths-harris", text: "P. Griffiths and J. Harris, Principles of Algebraic Geometry (Wiley, 1978)", where: "Ch. 2 Riemann surfaces and algebraic curves" },
  ];

  const api = {
    EPS, fmt, sup, sub, cx, cabs, pstr, peval, proots, rootsWithMultiplicity, realRoots,
    normalize, degree, dneg, dadd, isEffective, divStr, pointCount,
    degK, rrRange, riemannRoch, abstractEll,
    INF, p1key, p1name, p1str, p1div, p1ord, p1fstr, p1Basis, p1Eligibility, p1Search, toSphere, fromSphere, eligibility,
    hkey, hname, hstr, O, ecf, ecDisc, ecSmooth, eckey, ecname, ecstr, ecOn, ecEq, ecNeg, ecAdd, ecMul, ecLine, ecVertical, ecSum, ecEll, ecBasisAtO, ecCubicRoots, ecRealLocus, ecNearest, ecAbel, ecFromAbel, ecMap, ecTail,
    hyperGenus, hyperBasis, hyperCanonical, hyperBranchCount,
    riemannHurwitz, doubleCover, semigroup, gaps, poleOrders, gapSequence, weierstrassWeight,
    planeGenus, adjunction, planeEll, planeDifferentials, planeBasis,
    form, fmul, fadd, fdeg, fsubst, feval, formStr, resultantY, intersect, PLANE, lineForm, cubicForm,
    monomials, relations, relationStr, recoverCubic, ecImagePoints, veronese,
    ecStages, genusStages, canonicalMap, cliffordData,
    parsePoly, parseCurve, parseDivisor, compute,
    valuationVector, valuationLattice,
    CURVES, analyse, PRESETS, minimumComputations, report, REFERENCES,
  };
  root.RiemannRoch = api;
  // Node, and the type checker, can also load the engine as a CommonJS module; the page uses self.RiemannRoch.
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : this);
