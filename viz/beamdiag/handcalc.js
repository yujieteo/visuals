/* BEAMDIAG hand calculations: a readable, step-by-step derivation of the stiffness solver's answer.
 *
 * The direct stiffness method in engine.js is authoritative. This file writes the same answer the
 * way it is worked by hand, so it can be followed and checked on paper:
 *
 *   reactions   statically determinate: equilibrium, sum of forces and of moments about a support;
 *               indeterminate: compatibility (the force method) through Macaulay's double
 *               integration of EI v'' = M(x): two equilibrium equations, plus v = 0 at every
 *               support and v' = 0 at every fixed support, in the reactions and the two
 *               integration constants
 *   segments    between consecutive supports and load points, V(x) and M(x) by the method of
 *               sections, then EI θ and EI v by integrating M, continuous from segment to segment
 *   a point     V, M, θ, v and the bending stress at any chosen x
 *   checks      peak bending stress, and the sums of forces and moments of loads and reactions
 *
 * Every number shown is the solver's value at that step, written with the page's formatters, in
 * the page's unit convention and origin of x. `derive` also carries the hand chain itself (the
 * reactions solved from the written equations, then V, M, θ and v carried segment by segment from
 * them), which the tests compare with the solver and with reference.py. Where a written-out system
 * would be too large to follow (more than WRITE_UNKNOWNS unknowns), the set-up and equations are
 * stated generally and the solver's values are listed instead of fabricated steps.
 *
 *   derive(result, { units, origin })           the derivation as data
 *   frames(result, { units, origin, at })      [{ title, frames: [{ title, blocks, body, narration, parts }] }]
 *   pointFrame(result, x, { units, origin })   the frame for one chosen x (SI, from the left end)
 *   markdown(result, { units, origin, at, title }) a Markdown document that beamdswitch also opens
 *   beamReport(result, options)                engine's beamReport with the hand calculations as `hand`
 *   slidesOf(frame)                            one frame as deck slides that fit beamdswitch's slide
 *   deck(report)                               the template's deck with a "Hand calculations" section
 *   document({ meta, narration, sections })    any sections as Markdown in beamdswitch's deck syntax
 *   texNodes(tex)                              a small TeX subset as a tree, for the page to draw
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./engine.js"), require("./beamdswitch.js"));
  else root.HandCalc = factory(root.BeamDiag, root.Beamdswitch);
})(typeof self !== "undefined" ? self : this, function (B, T) {
  "use strict";

  const { sig, sci, shortNf } = B.format;
  const { sayNumber, texNumber, texUnit, spokenUnit, VOICE } = B.speech;
  /* Largest linear system written out in full, and longest sum written term by term. */
  const WRITE_UNKNOWNS = 8, WRITE_TERMS = 14;
  const NUMBER_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
  const KEY = { force: "V", moment: "M", length: "v", angle: "theta" };

  /* <d>^n for d = x − a: zero left of a. */
  const mac = (d, n) => (d > 0 ? d ** n : 0);

  /* Gaussian elimination with partial pivoting on an equilibrated copy; null when singular. */
  function solveDense(A, b) {
    const n = b.length, a = A.map((row, i) => {
      const s = Math.max(...row.map(Math.abs)) || 1;
      return [...row.map((v) => v / s), b[i] / s];
    });
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
      if (!(Math.abs(a[p][c]) > 1e-14)) return null;
      [a[c], a[p]] = [a[p], a[c]];
      for (let r = 0; r < n; r++) {
        if (r === c || a[r][c] === 0) continue;
        const f = a[r][c] / a[c][c];
        for (let k = c; k <= n; k++) a[r][k] -= f * a[c][k];
      }
    }
    return a.map((row, i) => row[n] / row[i]);
  }

  /* Everything about one beam in one unit convention and origin: numbers in display units, the
     formatters, and the actions (loads and reactions) as Macaulay terms in x. */
  function context(result, { units = B.DEFAULT_UNITS, origin = "left" } = {}) {
    const u = B.UNIT_SYSTEMS[typeof units === "string" ? units : units && units.id];
    if (!u) throw new Error(`Unknown unit convention ${JSON.stringify(units)}.`);
    const m = result.model, L = m.length, ex = result.extremes || B.extremes(result), mid = origin === "mid";
    const show = (si, q) => B.toUnits(si, q, u), sym = (q) => u.symbol[q];
    const scale = { V: Math.abs(ex.V.value), M: Math.abs(ex.M.value), v: Math.abs(ex.v.value), theta: Math.abs(ex.v.value) / L };
    const clean = (si, key) => (Math.abs(si) <= 1e-10 * scale[key] ? 0 : si);
    // Display coordinate of an SI position measured from the left end, as the page shows it.
    const X = (x) => show(B.fromOrigin(x, L, origin), "length");
    const d = B.scaleModel(m, u), o = mid ? d.length / 2 : 0, EI = d.material.E * d.section.I;
    const reactions = result.reactions.map((r, i) => ({
      i: i + 1, kind: r.kind, x: r.x, xi: X(r.x), Fy: show(r.Fy, "force"), Mz: show(r.Mz, "moment"), si: r,
    }));
    const loads = m.loads.map((l, j) => {
      const s = d.loads[j];
      return l.kind === "dist" ? { n: j + 1, kind: "dist", x1: l.x1, x2: l.x2, xi1: s.x1 - o, xi2: s.x2 - o, q1: s.q1, q2: s.q2 }
        : { n: j + 1, kind: l.kind, x: l.x, xi: s.x - o, F: l.kind === "point" ? s.F : 0, C: l.kind === "moment" ? s.C : 0 };
    });
    /* Text, TeX and speech for a number already formatted by the page's formatters. */
    const val = (si, q) => shortNf(show(clean(si, KEY[q] || "V"), q));
    const tex = (t) => texNumber(t);
    const texP = (t) => (t.startsWith("−") ? `(${tex(t)})` : tex(t));
    const tq = (t, q) => `${tex(t)}\\ ${texUnit(sym(q))}`;
    const say = (t, q) => `${sayNumber(t)} ${spokenUnit(u, q, !/^−?1$/.test(t))}`;
    const pos = (x) => sig(X(x));
    const sayPos = (x) => `x equals ${say(pos(x), "length")}`;
    const count = (n, one, many) => `${NUMBER_WORDS[n] ?? n} ${n === 1 ? one : many}`;
    return { result, m, L, ex, u, show, sym, clean, X, d, o, EI, reactions, loads, val, tex, texP, tq, say, pos, sayPos, count, mid, origin, scale };
  }

  /* ---------- writing equations ---------- */

  /* "c x" terms as TeX: [[coefficient, symbol]], zero coefficients left out, 1 written as the symbol. */
  function linear(terms, c) {
    const out = [];
    for (const [k, s] of terms) {
      if (k === 0) continue;
      const t = sig(Math.abs(k), 4), body = s ? (t === "1" ? s : `${c.tex(t)}\\,${s}`) : c.tex(t);
      out.push(out.length ? `${k < 0 ? " - " : " + "}${body}` : `${k < 0 ? "-" : ""}${body}`);
    }
    return out.join("") || "0";
  }
  /* A polynomial in s with coefficients [c0, c1, ...], dropping terms that are round-off at s = h. */
  function poly(coef, h, c, v = "s") {
    const size = Math.max(...coef.map((k, n) => Math.abs(k) * h ** n));
    return linear(coef.map((k, n) => [Math.abs(k) * h ** n <= 1e-10 * size ? 0 : k, n === 0 ? "" : n === 1 ? v : `${v}^{${n}}`]), c);
  }
  const evalPoly = (coef, s) => coef.reduce((acc, k, n) => acc + k * s ** n, 0);
  /* The bracket <x − a>^n in the display coordinate. */
  function bracket(a, n, c) {
    const t = sig(Math.abs(a), 4), inner = a === 0 || t === "0" ? "x" : `x ${a > 0 ? "-" : "+"} ${c.tex(t)}`;
    return `\\langle ${inner}\\rangle${n === 1 ? "" : `^{${n}}`}`;
  }
  /* A sum of already formatted terms, written out when short and then totalled. */
  function sumOf(texts, total, c) {
    if (!texts.length) return c.tex(total);
    if (texts.length > WRITE_TERMS || texts.length === 1) return c.tex(total);
    const body = texts.map((t, i) => (i === 0 ? t : t.startsWith("-") ? ` - ${t.slice(1)}` : ` + ${t}`)).join("");
    return `${body} = ${c.tex(total)}`;
  }

  /* ---------- load resultants ---------- */

  /* Each load's vertical force and its moment about the display coordinate ref, counter-clockwise
     positive, as display numbers with TeX for both. A trapezoid is a rectangle plus a triangle,
     here split into two triangles so a load whose ends have opposite signs needs no special case. */
  function actions(c, ref) {
    const out = [];
    for (const l of c.loads) {
      if (l.kind === "point") {
        const arm = l.xi - ref;
        out.push({ n: l.n, F: l.F, Mo: l.F * arm, fTex: c.tex(sig(l.F)), mTex: `${c.texP(sig(l.F))} \\times ${c.texP(sig(arm))}` });
      } else if (l.kind === "moment") {
        out.push({ n: l.n, F: 0, Mo: l.C, fTex: null, mTex: c.tex(sig(l.C)) });
      } else {
        const b = l.xi2 - l.xi1;
        const parts = l.q1 === l.q2 ? [[l.q1 * b, l.xi1 + b / 2]] : [[l.q1 * b / 2, l.xi1 + b / 3], [l.q2 * b / 2, l.xi1 + 2 * b / 3]];
        for (const [W, at] of parts) {
          if (W === 0) continue;
          out.push({ n: l.n, F: W, Mo: W * (at - ref), fTex: c.tex(sig(W)), mTex: `${c.texP(sig(W))} \\times ${c.texP(sig(at - ref))}` });
        }
      }
    }
    return out;
  }

  /* Macaulay terms of M(x) from the loads: [coefficient, position, power], display units. */
  function loadTerms(c) {
    const out = [];
    for (const l of c.loads) {
      if (l.kind === "point" && l.F !== 0) out.push([l.F, l.xi, 1]);
      if (l.kind === "moment" && l.C !== 0) out.push([-l.C, l.xi, 0]);
      if (l.kind === "dist") {
        const s = (l.q2 - l.q1) / (l.xi2 - l.xi1);
        out.push([l.q1 / 2, l.xi1, 2], [s / 6, l.xi1, 3], [-l.q2 / 2, l.xi2, 2], [-s / 6, l.xi2, 3]);
      }
    }
    return out.filter(([k]) => k !== 0);
  }
  /* k-fold integral of the terms at x. */
  const integrated = (terms, k, x) => terms.reduce((acc, [coef, a, p]) => {
    let den = 1;
    for (let n = p + 1; n <= p + k; n++) den *= n;
    return acc + coef * (p + k === 0 ? (x >= a ? 1 : 0) : mac(x - a, p + k)) / den;
  }, 0);

  /* ---------- the derivation ---------- */

  function derive(result, options = {}) {
    const c = context(result, options), { reactions: R, d, o, EI } = c;
    const deg = B.indeterminacy(c.m.supports), xi0 = -o, xiL = d.length - o;

    // Unknowns: each reaction force and fixed-support moment, then the integration constants.
    const unknowns = [];
    for (const r of R) {
      unknowns.push({ name: `R_{${r.i}}`, r, kind: "R" });
      if (r.kind === "fixed") unknowns.push({ name: `M_{${r.i}}`, r, kind: "M" });
    }
    unknowns.push({ name: "C_1", kind: "C1" }, { name: "C_2", kind: "C2" });
    const known = loadTerms(c), about0 = actions(c, xi0);
    const sumF = about0.reduce((s, a) => s + a.F, 0), sumM0 = about0.reduce((s, a) => s + a.Mo, 0);
    const rows = [
      { label: "\\sum F_y = 0", what: "vertical equilibrium", coef: unknowns.map((k) => (k.kind === "R" ? 1 : 0)), rhs: -sumF },
      { label: `\\sum M_{x = ${c.tex(sig(xi0))}} = 0`, what: "moments about the left end", coef: unknowns.map((k) => (k.kind === "R" ? k.r.xi - xi0 : k.kind === "M" ? 1 : 0)), rhs: -sumM0 },
    ];
    for (const s of R) {
      const at = s.xi;
      rows.push({
        label: `v(${c.tex(sig(at))}) = 0`, what: `no deflection at support ${s.i}`, support: s, slope: false,
        coef: unknowns.map((k) => (k.kind === "R" ? mac(at - k.r.xi, 3) / 6 : k.kind === "M" ? -mac(at - k.r.xi, 2) / 2 : k.kind === "C1" ? at : 1)),
        rhs: -integrated(known, 2, at),
      });
      if (s.kind === "fixed") rows.push({
        label: `\\theta(${c.tex(sig(at))}) = 0`, what: `no rotation at fixed support ${s.i}`, support: s, slope: true,
        coef: unknowns.map((k) => (k.kind === "R" ? mac(at - k.r.xi, 2) / 2 : k.kind === "M" ? -mac(at - k.r.xi, 1) : k.kind === "C1" ? 1 : 0)),
        rhs: -integrated(known, 1, at),
      });
    }
    // The solver's values of the unknowns, in display units: the integration constants are EI θ and
    // EI v at the left end, re-expressed for brackets measured in the display coordinate.
    const start = result.displacements[0], theta0 = start.theta, v0 = c.show(start.v, "length");
    const solverValue = (k) => (k.kind === "R" ? k.r.Fy : k.kind === "M" ? k.r.Mz : k.kind === "C1" ? EI * theta0 : EI * v0 - EI * theta0 * xi0);
    const solver = unknowns.map(solverValue);

    // The hand solution: equilibrium alone when determinate, the whole system when it is small enough.
    let hand = null, written = true;
    if (deg === 0) {
      hand = statics(c, unknowns, rows);
    } else if (unknowns.length <= WRITE_UNKNOWNS) {
      hand = solveDense(rows.map((r) => r.coef), rows.map((r) => r.rhs));
    } else written = false;
    const handReactions = hand ? hand : solver;

    // Segment by segment: V and M by sections from the solver's left-limit values; θ and v integrated.
    const xs = result.displacements.map((p) => p.x), segments = [];
    let chain = { V: 0, M: 0 };
    const handAt = (k) => handReactions[unknowns.indexOf(k)];
    let C1 = handAt(unknowns.at(-2)), C2 = handAt(unknowns.at(-1));
    chain.theta = C1 / EI;
    chain.v = (C1 * xi0 + C2) / EI;
    for (let e = 0; e < xs.length - 1; e++) {
      const a = xs[e], b = xs[e + 1], seg = segment(c, a, b, e);
      // Hand chain: jumps at a from the hand reactions and the loads, then the polynomials across.
      let dV = 0, dM = 0;
      for (const j of seg.jumps) {
        const k = j.reaction ? unknowns.find((q) => q.r === j.reaction && q.kind === (j.moment ? "M" : "R")) : null;
        const value = k ? handAt(k) : j.value;
        if (j.moment) dM -= value; else dV += value;
      }
      const h = seg.h, Va = chain.V + dV, Ma = chain.M + dM;
      const Vc = [Va, seg.qa, seg.k / 2], Mc = [Ma, Va, seg.qa / 2, seg.k / 6];
      const Tc = [EI * chain.theta, Ma, Va / 2, seg.qa / 6, seg.k / 24], Dc = [EI * chain.v, EI * chain.theta, Ma / 2, Va / 6, seg.qa / 24, seg.k / 120];
      seg.hand = {
        start: { V: Va, M: Ma, theta: chain.theta, v: chain.v },
        end: { V: evalPoly(Vc, h), M: evalPoly(Mc, h), theta: evalPoly(Tc, h) / EI, v: evalPoly(Dc, h) / EI },
      };
      chain = { ...seg.hand.end };
      segments.push(seg);
    }

    const resid = B.residual(result.equilibrium);
    const sumR = R.reduce((s, r) => s + r.Fy, 0), sumMR = R.reduce((s, r) => s + r.Fy * (r.xi - xi0) + r.Mz, 0);
    return {
      c, deg, unknowns, rows, solver, hand, written, segments, known,
      equilibrium: { sumF, sumM0, sumR, sumMR, resid, about: xi0 },
      ends: [xi0, xiL],
    };
  }

  /* Reactions of a determinate beam from equilibrium alone, in the order of `unknowns`. */
  function statics(c, unknowns, rows) {
    const R = c.reactions, out = Array(unknowns.length).fill(0);
    const ref = R[0].xi, acts = actions(c, ref);
    const sumF = acts.reduce((s, a) => s + a.F, 0), sumM = acts.reduce((s, a) => s + a.Mo, 0);
    if (R.length === 2) { // two pins
      const R2 = -sumM / (R[1].xi - ref);
      out[unknowns.findIndex((k) => k.r === R[1])] = R2;
      out[unknowns.findIndex((k) => k.r === R[0])] = -sumF - R2;
    } else { // one fixed support
      out[unknowns.findIndex((k) => k.kind === "R")] = -sumF;
      out[unknowns.findIndex((k) => k.kind === "M")] = -sumM;
    }
    // The integration constants from the boundary-condition rows, with the reactions now known.
    const bc = rows.slice(2), n = unknowns.length;
    const reduced = bc.map((r) => ({ coef: [r.coef[n - 2], r.coef[n - 1]], rhs: r.rhs - r.coef.slice(0, n - 2).reduce((s, k, i) => s + k * out[i], 0) }));
    const [C1, C2] = solveDense(reduced.map((r) => r.coef), reduced.map((r) => r.rhs));
    out[n - 2] = C1; out[n - 1] = C2;
    return out;
  }

  /* One segment between consecutive events: the solver's values and the jumps at its start. */
  function segment(c, a, b, e) {
    const { result, show, EI } = c, h = show(b - a, "length");
    const qa = show(B.intensity(c.m, a, "right"), "distributed"), qb = show(B.intensity(c.m, b, "left"), "distributed");
    const k = (qb - qa) / h;
    const start = B.internal(result, a, "right"), end = B.internal(result, b, "left");
    const before = e === 0 ? { V: 0, M: 0 } : B.internal(result, a, "left");
    const da = B.deflection(result, a), db = B.deflection(result, b);
    const S = { V: show(start.V, "force"), M: show(start.M, "moment"), theta: da.theta, v: show(da.v, "length") };
    const E = { V: show(end.V, "force"), M: show(end.M, "moment"), theta: db.theta, v: show(db.v, "length") };
    const jumps = [];
    for (const r of c.reactions) if (r.x === a) {
      jumps.push({ name: `R_{${r.i}}`, value: r.Fy, reaction: r });
      if (r.kind === "fixed") jumps.push({ name: `M_{${r.i}}`, value: r.Mz, reaction: r, moment: true });
    }
    for (const l of c.loads) if (l.kind !== "dist" && l.x === a) jumps.push(l.kind === "point" ? { name: `P_{${l.n}}`, value: l.F } : { name: `C_{${l.n}}`, value: l.C, moment: true });
    // Polynomials in s = x − a from the solver's values at a⁺.
    const V = [S.V, qa, k / 2], M = [S.M, S.V, qa / 2, k / 6];
    const theta = [EI * S.theta, S.M, S.V / 2, qa / 6, k / 24], v = [EI * S.v, EI * S.theta, S.M / 2, S.V / 6, qa / 24, k / 120];
    // Zero shear inside the segment: the bending moment is stationary there.
    const roots = [];
    const A2 = k / 2, A1 = qa, A0 = S.V, size = Math.abs(A0) + Math.abs(A1) * h + Math.abs(A2) * h * h;
    if (size > 0) {
      const lin = Math.abs(A2) * h * h <= 1e-12 * size;
      const cand = lin ? (A1 !== 0 ? [-A0 / A1] : []) : (() => {
        const disc = A1 * A1 - 4 * A2 * A0;
        return disc < 0 ? [] : [(-A1 + Math.sqrt(disc)) / (2 * A2), (-A1 - Math.sqrt(disc)) / (2 * A2)];
      })();
      for (const s of cand) if (s > 1e-9 * h && s < h * (1 - 1e-9)) roots.push(s);
    }
    roots.sort((p, q) => p - q);
    const stationary = roots.map((s) => {
      const x = a + (b - a) * s / h; // SI
      return { s, x, M: show(B.internal(result, x, "right").M, "moment") };
    });
    return {
      index: e + 1, a, b, xa: c.X(a), xb: c.X(b), h, qa, qb, k, start: S, end: E, before: { V: show(before.V, "force"), M: show(before.M, "moment") },
      jumps, poly: { V, M, theta, v }, stationary,
      supportAtEnd: c.reactions.find((r) => r.x === b) || null, supportAtStart: c.reactions.find((r) => r.x === a) || null,
    };
  }

  /* ---------- frames ---------- */

  const P = (text) => ({ p: text }), EQ = (tex) => ({ eq: tex }), LIST = (items) => ({ list: items }), TABLE = (head, rows) => ({ table: { head, rows } });

  /* Values as the page writes them: forces and moments as the reaction list and readout (shortNf),
     cleaned of round-off far below the largest value of the same kind on this beam. */
  function vtext(c, value, q) {
    const key = KEY[q], scale = key ? c.show(c.scale[key], q) : 0;
    return shortNf(Math.abs(value) <= 1e-10 * Math.abs(scale) ? 0 : value);
  }

  function authorityFrame(D) {
    const { c, deg } = D, r = c.m.supports.reduce((n, s) => n + (s.kind === "fixed" ? 2 : 1), 0);
    const method = deg === 0 ? "equilibrium alone (sum of vertical forces and sum of moments)"
      : "compatibility, the force method, worked with Macaulay's double integration of EI v″ = M(x)";
    const said = [
      "These hand calculations derive the solver's answer step by step.",
      "The stiffness solver is authoritative, and every number shown is its value, so the hand steps and the solver agree to the digits shown.",
      deg === 0 ? "The beam is statically determinate, so equilibrium alone gives the reactions."
        : `The beam is statically indeterminate to degree ${deg}, so the reactions come from compatibility, worked by Macaulay's method of double integration.`,
    ].join(" ");
    return {
      title: "Hand calculations: method, and how they relate to the solver",
      deckTitle: "Hand calculations: method and the solver",
      blocks: [
        P("The direct stiffness solver is authoritative. These steps are a readable derivation of the same answer: every number shown is the solver's value at that step, written as this page writes it, and carrying the hand steps through reproduces it to the digits shown."),
        EQ(`n = r - 2 = ${r} - 2 = ${deg}`),
        P(deg === 0 ? `The beam is statically determinate, so the reactions follow from ${method}.`
          : `The beam is statically indeterminate to degree ${deg}. The reactions are found by ${method}: two equilibrium equations, plus $v = 0$ at every support and $\\theta = 0$ at every fixed support, solved together with the two integration constants. The three-moment equation or slope-deflection would give the same reactions.`),
        LIST([
          `Units: ${c.u.label}. $x$ in ${c.sym("length")}, measured from ${c.mid ? "mid-span, negative to the left" : "the left end"}.`,
          "Forces and distributed loads positive up; couples, slopes and support moments positive counter-clockwise.",
          "$V(x)$ is the sum of the upward forces left of the section; $M(x)$ is positive when sagging; $dM/dx = V$, $dV/dx = q$ and $EI\\,v'' = M$.",
          `$EI = ${c.tq(sci(c.EI), "rigidity")}$.`,
        ]),
      ],
      narration: said,
      parts: [{ narration: said }, { at: 3, title: "Hand calculations: units and sign conventions", narration: "The units and sign conventions used throughout are listed here." }],
    };
  }

  function reactionFrames(D) {
    const { c, deg, unknowns, rows, solver, written } = D, R = c.reactions;
    const valueOf = (k) => solver[unknowns.indexOf(k)];
    const rq = (k) => (k.kind === "M" ? "moment" : "force");
    const rtext = (k) => vtext(c, valueOf(k), rq(k));
    const listSay = (items) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);
    const reactionSaid = R.map((r) => {
      const kR = unknowns.find((k) => k.r === r && k.kind === "R"), kM = unknowns.find((k) => k.r === r && k.kind === "M");
      return `R ${r.i} is ${c.say(rtext(kR), "force")}` + (kM ? ` with a support moment of ${c.say(rtext(kM), "moment")}` : "");
    });
    const resultTable = TABLE(["Unknown", "Value", "Where"], unknowns.filter((k) => k.kind === "R" || k.kind === "M")
      .map((k) => [`$${k.name}$`, `${rtext(k)} ${c.sym(rq(k))}`, `${k.r.kind} at x = ${sig(k.r.xi)} ${c.sym("length")}`]));

    if (deg === 0) {
      const ref = R[0], acts = actions(c, ref.xi);
      const sumF = acts.reduce((s, a) => s + a.F, 0), sumM = acts.reduce((s, a) => s + a.Mo, 0);
      const fT = acts.filter((a) => a.fTex).map((a) => a.fTex), mT = acts.map((a) => a.mTex);
      const sF = shortNf(sumF), sM = shortNf(sumM);
      const blocks = [P(`Each load's vertical force and its moment about support 1 at x = ${sig(ref.xi)} ${c.sym("length")} (counter-clockwise positive; a distributed load acts through its resultant):`),
        EQ(`\\sum_j F_j = ${sumOf(fT, sF, c)}\\ ${texUnit(c.sym("force"))}`),
        EQ(`\\sum_j m_j = ${sumOf(mT, sM, c)}\\ ${texUnit(c.sym("moment"))}`)];
      let said;
      if (R.length === 2) {
        const [k1, k2] = [unknowns.find((k) => k.r === R[0]), unknowns.find((k) => k.r === R[1])], span = sig(R[1].xi - ref.xi);
        blocks.push(
          P("Moments about support 1, where $R_1$ has no arm:"),
          EQ(`R_2 \\times ${c.texP(span)} + \\sum_j m_j = 0 \\quad\\Rightarrow\\quad R_2 = -\\frac{${c.tex(sM)}}{${c.tex(span)}} = ${c.tq(rtext(k2), "force")}`),
          P("Vertical equilibrium then gives $R_1$:"),
          EQ(`R_1 + R_2 + \\sum_j F_j = 0 \\quad\\Rightarrow\\quad R_1 = -${c.texP(sF)} - ${c.texP(rtext(k2))} = ${c.tq(rtext(k1), "force")}`));
        said = [`Taking moments about support 1 gives R 2 equals ${c.say(rtext(k2), "force")}`, `vertical equilibrium then gives R 1 equals ${c.say(rtext(k1), "force")}`];
      } else {
        const kR = unknowns.find((k) => k.kind === "R"), kM = unknowns.find((k) => k.kind === "M");
        blocks.push(
          P("Vertical equilibrium and moments about the fixed support:"),
          EQ(`R_1 + \\sum_j F_j = 0 \\quad\\Rightarrow\\quad R_1 = -${c.texP(sF)} = ${c.tq(rtext(kR), "force")}`),
          EQ(`M_1 + \\sum_j m_j = 0 \\quad\\Rightarrow\\quad M_1 = -${c.texP(sM)} = ${c.tq(rtext(kM), "moment")}`));
        said = [`Vertical equilibrium gives R 1 equals ${c.say(rtext(kR), "force")}`, `moments about the fixed support give a support moment of ${c.say(rtext(kM), "moment")}`];
      }
      if (acts.length > WRITE_TERMS) blocks.push(P(`The ${acts.length} load terms are summed without being listed one by one.`));
      return [{
        title: "Reactions by equilibrium",
        blocks,
        narration: `The loads add up to ${c.say(sF, "force")} vertically. ${said[0]}, and ${said[1]}.`,
        parts: [{ narration: `The loads add up to ${c.say(sF, "force")} vertically.` },
          { at: 2, title: "Reactions by equilibrium: moments of the loads", narration: `Their moments about support 1 add up to ${c.say(sM, "moment")}.` },
          { at: 3, title: "Reactions by equilibrium: solving for them", narration: `${said[0]}.` },
          { at: 5, title: "Reactions by equilibrium: solving for them (cont.)", narration: `${said[1][0].toUpperCase()}${said[1].slice(1)}.` }],
      }];
    }

    // Indeterminate: the written system, or its general form when too large to follow.
    const names = unknowns.map((k) => k.name);
    const setup = [
      P("Write the bending moment from every action left of $x$ with Macaulay brackets $\\langle x - a\\rangle^n$ (zero for $x < a$), integrate $EI\\,v'' = M$ twice, and impose equilibrium and the support conditions:"),
      EQ("M(x) = \\sum_i R_i \\langle x - a_i\\rangle - \\sum_i M_i \\langle x - a_i\\rangle^{0} + M_{\\text{loads}}(x)"),
      EQ("EI\\,v(x) = \\sum_i \\frac{R_i}{6} \\langle x - a_i\\rangle^{3} - \\sum_i \\frac{M_i}{2} \\langle x - a_i\\rangle^{2} + \\iint M_{\\text{loads}} + C_1 x + C_2"),
      P(`Unknowns: ${names.map((n) => `$${n}$`).join(", ")}: ${c.count(unknowns.length, "unknown", "unknowns")}, and as many equations.`),
    ];
    const frames = [];
    if (written) {
      const eqs = rows.map((r) => EQ(`${r.label}: \\quad ${linear(r.coef.map((k, i) => [k, names[i]]), c)} = ${c.tex(sig(r.rhs, 4))}`));
      const said = [
        `With ${c.count(R.length, "support", "supports")}, there are ${c.count(unknowns.length - 2, "unknown reaction", "unknown reactions")} and two constants of integration.`,
        "Two equations come from equilibrium, and the rest say the beam cannot deflect at a support or rotate at a fixed support.",
      ];
      const inNumbers = "Compatibility equations in numbers";
      frames.push({
        title: `Compatibility: ${c.count(unknowns.length, "equation", "equations")} in the reactions and two integration constants`,
        deckTitle: `Compatibility: ${c.count(unknowns.length, "equation", "equations")} in the unknowns`,
        blocks: [...setup, P("In numbers (coefficients to four significant figures):"), ...eqs],
        narration: said.join(" "),
        // On slides, each equation is read out by what it says.
        parts: [{ narration: said[0] }, { at: setup.length, title: inNumbers, narration: said[1] },
          ...rows.map((r, i) => ({ at: setup.length + 1 + i, title: `${inNumbers} (cont.)`, narration: `${r.what[0].toUpperCase()}${r.what.slice(1)}.` }))],
      });
    } else {
      frames.push({
        title: `Compatibility: ${c.count(unknowns.length, "equation", "equations")}, too many to write out`,
        deckTitle: `Compatibility: ${unknowns.length} equations, stated in general`,
        blocks: [...setup,
          P(`With ${unknowns.length} unknowns the system is not worth working by hand. Its rows are $\\sum F_y = 0$, $\\sum M = 0$, $EI\\,v(a_s) = 0$ at each of the ${R.length} supports and $EI\\,v'(a_s) = 0$ at each fixed support; the values below are the stiffness solver's solution of the same conditions.`)],
        narration: `This beam has ${unknowns.length} unknowns, too many to work by hand, so the equations are stated in general and the solver's values are used.`,
        parts: [{ narration: `This beam has ${unknowns.length} unknowns, too many to work by hand.` },
          { at: setup.length - 1, title: "Compatibility: the unknowns and the conditions", narration: "So the equations are stated in general, and the solver's values are used." }],
      });
    }
    frames.push({
      title: "Reactions from the compatibility equations",
      blocks: [resultTable,
        EQ(`C_1 = ${c.tq(sig(solver.at(-2), 4), "rigidity")}, \\qquad C_2 = ${c.tex(sig(solver.at(-1), 4))}\\ ${texUnit(`${c.sym("force")}·${c.sym("length")}³`)}`),
        P(written ? "Solving the equations above reproduces these values, which are the solver's." : "These are the solver's values; the hand method above gives the same conditions.")],
      narration: `Solving gives ${listSay(reactionSaid)}.`,
    });
    return frames;
  }

  function deflectionFrame(D) {
    const { c, deg, unknowns, rows, solver } = D, n = unknowns.length;
    // Terms at the right end vanish everywhere on the beam, so they are left out.
    const terms = [...D.known, ...c.reactions.flatMap((r) => [[r.Fy, r.xi, 1], [-r.Mz, r.xi, 0]])].filter(([k, a]) => k !== 0 && a < D.ends[1]);
    const blocks = [P("Integrate $EI\\,v'' = M(x)$ twice. Each Macaulay term $c\\langle x - a\\rangle^n$ integrates to $c\\langle x - a\\rangle^{n+1}/(n+1)$, which keeps $\\theta$ and $v$ continuous at every support and load:")];
    let atV = 1, atM;
    if (terms.length <= WRITE_TERMS && terms.length) {
      atM = blocks.length;
      blocks.push(EQ(`M(x) = ${linear(terms.map(([k, a, p]) => [k, bracket(a, p, c)]), c)}`));
      atV = blocks.length;
      blocks.push(EQ(`EI\\,v(x) = ${linear(terms.map(([k, a, p]) => [k / ((p + 1) * (p + 2)), bracket(a, p + 2, c)]), c)} + C_1 x + C_2`));
    } else blocks.push(EQ("EI\\,v(x) = \\iint M(x)\\,dx\\,dx + C_1 x + C_2"));
    const bc = rows.slice(2), atBC = blocks.length;
    // The items let a deck continue a long list of conditions over slides.
    const items = bc.map((r) => ({ text: `$${r.label}$ (${r.what})`, said: r.what }));
    blocks.push({ ...P(`Boundary conditions: ${items.map((t) => t.text).join("; ")}.`), lead: "Boundary conditions: ", items });
    if (deg === 0) {
      blocks.push(P("With the reactions known, these give the two constants:"));
      for (const r of bc) {
        const rest = r.coef.slice(0, n - 2).reduce((s, k, i) => s + k * solver[i], 0);
        blocks.push(EQ(`${r.label}: \\quad ${linear([[r.coef[n - 2], "C_1"], [r.coef[n - 1], "C_2"]], c)} = ${c.tex(sig(r.rhs - rest, 4))}`));
      }
    } else blocks.push(P("They are the compatibility rows above, solved with the reactions."));
    const atC = blocks.length;
    blocks.push(EQ(`C_1 = EI\\,\\theta(${c.tex(sig(D.ends[0]))}) = ${c.tq(sig(solver[n - 2], 4), "rigidity")}, \\qquad C_2 = ${c.tex(sig(solver[n - 1], 4))}\\ ${texUnit(`${c.sym("force")}·${c.sym("length")}³`)}`));
    const t0 = vtext(c, D.segments[0].start.theta, "angle"), v0 = vtext(c, D.segments[0].start.v, "length");
    blocks.push(P(`So at the left end $\\theta$ = ${t0} rad and $v$ = ${v0} ${c.sym("length")}; each segment below starts from the slope and deflection the previous one ends with.`));
    const said = [
      "Integrating the bending moment over E I twice gives the slope and the deflection, with two constants of integration.",
      `The support conditions fix them, so at the left end the slope is ${sayNumber(t0)} radians and the deflection is ${c.say(v0, "length")}.`,
    ];
    return {
      title: "Deflection and slope: double integration and boundary conditions",
      deckTitle: "Deflection and slope by double integration",
      blocks,
      narration: said.join(" "),
      parts: [{ narration: said[0] },
        ...(atM ? [{ at: atM, title: "Deflection and slope: the bending moment", narration: "The bending moment carries a bracket term for every load and reaction." }] : []),
        { at: atV, title: "Deflection and slope: integrating twice", narration: "Each bracket term integrates to the next power up, and the two constants of integration appear at the end." },
        { at: atBC, title: "Deflection and slope: boundary conditions", narration: "The boundary conditions say the beam cannot deflect at a support, or rotate at a fixed support." },
        { at: atC, title: "Deflection and slope: the two constants", narration: said[1] }],
    };
  }

  function segmentFrame(D, seg) {
    const { c } = D, L = c.sym("length"), ue = (q) => texUnit(c.sym(q));
    const xa = sig(seg.xa), xb = sig(seg.xb), hT = sig(seg.h);
    const blocks = [P(`Cut the beam at $x$ between ${xa} and ${xb} ${L} and keep the part to the left of the cut, with $s = x - ${c.texP(xa)}$ running from 0 to ${hT} ${L}.`)];
    // Start values: what the previous segment ends with, plus the jumps at x = a.
    const S = seg.start, before = seg.before, Vs = vtext(c, S.V, "force"), Ms = vtext(c, S.M, "moment");
    const at = `${c.tex(xa)}^{+}`;
    const vJ = seg.jumps.filter((j) => !j.moment), mJ = seg.jumps.filter((j) => j.moment);
    if (vJ.length) blocks.push(EQ(`V(${at}) = V(${c.tex(xa)}^{-}) + ${vJ.map((j) => j.name).join(" + ")} = ${c.texP(vtext(c, before.V, "force"))} + ${vJ.map((j) => c.texP(vtext(c, j.value, "force"))).join(" + ")} = ${c.tq(Vs, "force")}`));
    else blocks.push(EQ(`V(${at}) = V(${c.tex(xa)}^{-}) = ${c.tq(Vs, "force")}`));
    if (mJ.length) blocks.push(EQ(`M(${at}) = M(${c.tex(xa)}^{-}) - ${mJ.map((j) => j.name).join(" - ")} = ${c.texP(vtext(c, before.M, "moment"))} - ${mJ.map((j) => c.texP(vtext(c, j.value, "moment"))).join(" - ")} = ${c.tq(Ms, "moment")}`));
    else blocks.push(EQ(`M(${at}) = M(${c.tex(xa)}^{-}) = ${c.tq(Ms, "moment")}`));
    // The section equations.
    const loaded = seg.qa !== 0 || seg.k !== 0, atV = blocks.length;
    blocks.push(loaded ? EQ(`q(s) = ${poly([seg.qa, seg.k], seg.h, c)}\\ ${ue("distributed")}`)
      : P("No distributed load acts here, so $V$ is constant and $M$ is linear."));
    blocks.push(
      EQ(`V(s) = V(${at}) + \\int_0^s q\\,ds = ${poly(seg.poly.V, seg.h, c)}`),
      EQ(`M(s) = M(${at}) + \\int_0^s V\\,ds = ${poly(seg.poly.M, seg.h, c)}`),
    );
    const atTheta = blocks.length;
    blocks.push(
      EQ(`EI\\,\\theta(s) = EI\\,\\theta(${c.tex(xa)}) + \\int_0^s M\\,ds = ${poly(seg.poly.theta, seg.h, c)}`),
      EQ(`EI\\,v(s) = EI\\,v(${c.tex(xa)}) + \\int_0^s \\theta\\,EI\\,ds = ${poly(seg.poly.v, seg.h, c)}`),
    );
    // Values at both ends, as the solver gives them.
    const E = seg.end, row = (name, q, s, e) => [name, `${vtext(c, s, q)}`, `${vtext(c, e, q)}`], atEnds = blocks.length;
    blocks.push(TABLE([`At`, `x = ${xa}⁺`, `x = ${xb}⁻`], [
      row(`V (${c.sym("force")})`, "force", S.V, E.V), row(`M (${c.sym("moment")})`, "moment", S.M, E.M),
      row("θ (rad)", "angle", S.theta, E.theta), row(`v (${L})`, "length", S.v, E.v),
    ]));
    const notes = [];
    for (const st of seg.stationary) notes.push(`$V = 0$ at $s$ = ${sig(st.s)} ${L} (x = ${sig(c.X(st.x))} ${L}), where $M$ is stationary: $M$ = ${vtext(c, st.M, "moment")} ${c.sym("moment")}.`);
    if (seg.qa * seg.qb < 0) notes.push(`$q = 0$ at $s$ = ${sig(-seg.qa / seg.k)} ${L}, where $V$ is stationary.`);
    const sup = seg.supportAtEnd;
    if (sup) notes.push(`Support ${sup.i} at x = ${xb} ${L}: $v$ = ${vtext(c, E.v, "length")}${sup.kind === "fixed" ? ` and $\\theta$ = ${vtext(c, E.theta, "angle")}` : ""}, as the boundary condition requires.`);
    if (notes.length) blocks.push(LIST(notes));
    const said = [
      `Segment ${seg.index} runs from ${c.sayPos(seg.a)} to ${c.say(sig(seg.xb), "length")}.`,
      loaded ? "A distributed load acts here, so the shear force varies along it." : "No distributed load acts here, so the shear force is constant and the moment varies linearly.",
      `The shear force goes from ${c.say(Vs, "force")} to ${c.say(vtext(c, E.V, "force"), "force")}, and the bending moment from ${c.say(Ms, "moment")} to ${c.say(vtext(c, E.M, "moment"), "moment")}.`,
      ...seg.stationary.map((st) => `The shear force is zero at ${c.sayPos(st.x)}, where the moment reaches ${c.say(vtext(c, st.M, "moment"), "moment")}.`),
      `At the end of the segment the deflection is ${c.say(vtext(c, E.v, "length"), "length")}.`,
    ];
    const name = `Segment ${seg.index}`;
    return {
      title: `${name}: x = ${xa} to ${xb} ${L}`, blocks, narration: said.join(" "),
      parts: [{ narration: said[0] }, { at: atV, title: `${name}: shear force and bending moment`, narration: said.slice(1, 3).join(" ") },
        { at: atTheta, title: `${name}: slope and deflection`, narration: "Integrating the bending moment once gives the slope, and twice the deflection, both carried on from the start of the segment." },
        { at: atEnds, title: `${name}: values at both ends`, narration: said.slice(3).join(" ") }],
    };
  }

  function checksFrame(D) {
    const { c, equilibrium: q } = D, m = c.m, ex = c.ex, blocks = [], said = [];
    if (m.section.c) {
      const Mmax = sig(c.show(ex.M.value, "moment"), 4), cc = sig(c.show(m.section.c, "length")), I = sci(c.show(m.section.I, "inertia"));
      const stress = sig(c.show(Math.abs(ex.M.value) * m.section.c / m.section.I, "stress"), 4);
      blocks.push(P(`The largest moment is ${Mmax} ${c.sym("moment")} at x = ${c.pos(ex.M.x)} ${c.sym("length")}; the extreme fibre is $c$ = ${cc} ${c.sym("length")} from the neutral axis.`),
        EQ(`\\sigma_{\\max} = \\frac{|M|_{\\max}\\, c}{I} = \\frac{${c.tex(sig(Math.abs(c.show(ex.M.value, "moment")), 4))} \\times ${c.tex(cc)}}{${c.tex(I)}} = ${c.tq(stress, "stress")}`));
      said.push(`The peak bending stress is the largest moment times the extreme fibre distance over I, which is ${c.say(stress, "stress")}.`);
    } else {
      blocks.push(P("The section has no extreme-fibre distance $c$, so the bending stress $\\sigma = M c / I$ is not evaluated."));
      said.push("The section has no extreme fibre distance, so the bending stress is not evaluated.");
    }
    const sR = shortNf(q.sumR), sF = shortNf(q.sumF), sMR = shortNf(q.sumMR), sM = shortNf(q.sumM0), atSums = blocks.length;
    blocks.push(P("Equilibrium of the whole beam, loads and reactions together (moments about the left end):"),
      EQ(`\\sum F_y = \\sum_i R_i + \\sum_j F_j = ${c.texP(sR)} + ${c.texP(sF)} \\approx 0`),
      EQ(`\\sum M = \\sum_i (R_i\\,a_i + M_i) + \\sum_j m_j = ${c.texP(sMR)} + ${c.texP(sM)} \\approx 0`),
      P(`Relative error of the two sums: ${sci(q.resid)}.`));
    said.push(`The reactions add up to ${c.say(sR, "force")} and the loads to ${c.say(sF, "force")}, so the forces balance, and so do the moments, to a relative error of ${sayNumber(sci(q.resid))}.`);
    return {
      title: m.section.c ? "Bending stress and the equilibrium check" : "Equilibrium check", blocks, narration: said.join(" "),
      parts: [{ narration: said[0] }, { at: atSums, title: "Equilibrium check", narration: said[1] }],
    };
  }

  /* V, M, θ, v and σ at a chosen x (SI, measured from the left end), from the segment it lies in. */
  function pointFrame(result, x, options = {}) {
    const D = options.derivation || derive(result, options), { c } = D, L = c.sym("length");
    x = Math.min(c.L, Math.max(0, x));
    const segs = D.segments, i = Math.max(0, segs.findIndex((s) => x < s.b || s === segs.at(-1)));
    const seg = segs[i], onStart = x === seg.a && i > 0, s = c.show(x - seg.a, "length");
    const xT = sig(c.X(x)), sT = sig(s);
    const sub = (coef) => coef.map((k, n) => [k, n === 0 ? "" : n === 1 ? `(${c.tex(sT)})` : `(${c.tex(sT)})^{${n}}`]);
    const a = B.at(result, x);
    const V = x >= c.L ? a.Vleft : a.Vright, M = x >= c.L ? a.Mleft : a.Mright;
    const Vt = vtext(c, c.show(V, "force"), "force"), Mt = vtext(c, c.show(M, "moment"), "moment");
    const tt = vtext(c, a.theta, "angle"), vt = vtext(c, c.show(a.v, "length"), "length");
    const blocks = [P(`x = ${xT} ${L} lies in segment ${seg.index} (x = ${sig(seg.xa)} to ${sig(seg.xb)} ${L}), so $s = x - ${c.texP(sig(seg.xa))}$ = ${sT} ${L}.`)];
    if (onStart) blocks.push(P(`A support or load acts here, so $V$ and $M$ can jump: just to the left they are ${vtext(c, c.show(a.Vleft, "force"), "force")} ${c.sym("force")} and ${vtext(c, c.show(a.Mleft, "moment"), "moment")} ${c.sym("moment")} (the end of segment ${seg.index - 1}); the values below are just to the right.`));
    const at = (name) => ({ at: blocks.length, title: `At x = ${xT} ${L}: ${name}` });
    blocks.push(EQ(`V = ${linear(sub(seg.poly.V), c)} = ${c.tq(Vt, "force")}`));
    const atM = at("bending moment");
    blocks.push(EQ(`M = ${linear(sub(seg.poly.M), c)} = ${c.tq(Mt, "moment")}`));
    const atTheta = at("slope");
    blocks.push(EQ(`\\theta = \\frac{1}{EI}\\left(${linear(sub(seg.poly.theta), c)}\\right) = ${c.tex(tt)}\\ \\mathrm{rad}`));
    const atV = at("deflection");
    blocks.push(EQ(`v = \\frac{1}{EI}\\left(${linear(sub(seg.poly.v), c)}\\right) = ${c.tq(vt, "length")}`));
    const said = [`At ${c.sayPos(x)}, in segment ${seg.index}, the shear force is ${c.say(Vt, "force")} and the bending moment ${c.say(Mt, "moment")}.`,
      `The slope is ${sayNumber(tt)} radians and the deflection ${c.say(vt, "length")}.`];
    const parts = [{ narration: `At ${c.sayPos(x)}, in segment ${seg.index}, the shear force is ${c.say(Vt, "force")}.` },
      { ...atM, narration: `The bending moment is ${c.say(Mt, "moment")}.` },
      { ...atTheta, narration: `The slope is ${sayNumber(tt)} radians.` },
      { ...atV, narration: `The deflection is ${c.say(vt, "length")}.` }];
    if (c.m.section.c) {
      const st = sig(c.show(Math.abs(M) * c.m.section.c / c.m.section.I, "stress"), 4);
      parts.push({ ...at("bending stress"), narration: `The bending stress at the extreme fibre is ${c.say(st, "stress")}.` });
      blocks.push(EQ(`\\sigma = \\frac{|M|\\,c}{I} = ${c.tq(st, "stress")}`));
      said.push(parts.at(-1).narration);
    }
    return { title: `At the selected point x = ${xT} ${L}`, blocks, narration: said.join(" "), parts, x, segment: seg.index };
  }

  /* ---------- assembling ---------- */

  /* Blocks → Markdown with LaTeX maths, as beamdswitch reads it. */
  function markdownOf(blocks) {
    const cell = (t) => String(t).replace(/\|/g, "\\|");
    return blocks.map((b) => {
      if (b.p != null) return b.p;
      if (b.eq != null) return `$$ ${b.eq} $$`;
      if (b.list) return b.list.map((t) => `- ${t}`).join("\n");
      const { head, rows } = b.table;
      return [`| ${head.map(cell).join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`)].join("\n");
    }).join("\n\n");
  }
  const withBody = (f) => ({ ...f, body: markdownOf(f.blocks) });

  /* ---------- slides that fit ----------
     beamdswitch lays a slide out at 1280 × 720 px: a 1136 × 506 px body in 30 px text, which it
     shrinks to no less than 18 px before the body clips, and a title on one line. Measured there, the
     body holds about 12 rows of 30 px text; a paragraph wraps after about 80 characters of Markdown;
     a display equation takes about 2 rows, 1.2 more per extra line and 0.5 more with a fraction, and
     fits the width while it draws about 63 characters; a table row takes 1.1 rows; a title fits on
     one line up to about 53 characters. So a hand-calculation slide holds at most SLIDE_ROWS rows,
     its equations draw at most SLIDE_EQ_CHARS characters a line, its tables at most SLIDE_TABLE_ROWS
     rows, and its title at most 50 characters: it then fits at full size. The page and the
     Markdown keep each frame whole; only the deck splits it, at the narrated `parts` the frame
     marks, and breaks long equations over lines, so every number is the same. */
  const SLIDE_ROWS = 12, SLIDE_TEXT_CHARS = 80, SLIDE_EQ_CHARS = 56, SLIDE_TABLE_ROWS = 6;

  /* Characters a TeX expression draws, roughly: commands as one glyph, \frac{1}{EI} as two,
     braces, scripts and spacing as none. */
  function drawn(tex) {
    return String(tex).replace(/\\(?:mathrm|text)\{([^}]*)\}/g, "$1").replace(/\\times 10\^\{(-?\d+)\}/g, "×10$1")
      .replace(/\\(?:left|right|bigl|bigr|begin\{aligned\}|end\{aligned\})/g, "").replace(/\\[,;: ]/g, " ")
      .replace(/\\qquad/g, "    ").replace(/\\quad/g, "  ").replace(/\\frac\{1\}\{EI\}/g, "EI").replace(/\\frac/g, "")
      .replace(/\\\\/g, "").replace(/\\[a-zA-Z]+/g, "x").replace(/[{}^_&]/g, "").length;
  }
  /* Rows a block takes on a slide at 30 px. */
  function slideRows(b) {
    const text = (t) => Math.ceil(String(t).length / SLIDE_TEXT_CHARS);
    if (b.p != null) return text(b.p);
    if (b.eq != null) return 0.8 + 1.2 * (b.eq.split("\\\\").length) + (/\\frac/.test(b.eq) ? 0.5 : 0);
    if (b.list) return b.list.reduce((n, t) => n + text(t), 0);
    return 1.1 * (b.table.rows.length + 1);
  }
  /* A display equation as lines that each draw at most SLIDE_EQ_CHARS characters: each statement of
     "a = …, \qquad b = …" on lines of its own, aligned on its first "=" and broken before a "+", "−"
     or "=" outside any group or Macaulay bracket. */
  function wrapEquation(tex) {
    if (drawn(tex) <= SLIDE_EQ_CHARS) return tex;
    const lines = tex.replace(/\\left\(/g, "\\bigl(").replace(/\\right\)/g, "\\bigr)").split(/(?<=,) \\qquad /).map(statementLines);
    if (lines.includes(null)) return tex;
    return `\\begin{aligned} ${lines.flat().join(" \\\\ ")} \\end{aligned}`;
  }
  function statementLines(flat) {
    const pieces = [];
    let depth = 0, from = 0;
    for (let i = 0; i < flat.length; i++) {
      const ch = flat[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      else if (flat.startsWith("\\langle", i)) depth++;
      else if (flat.startsWith("\\rangle", i)) depth--;
      else if (depth === 0 && (flat.startsWith(" + ", i) || flat.startsWith(" - ", i) || flat.startsWith(" = ", i)) && i > from) {
        pieces.push(flat.slice(from, i));
        from = i + 1;
      }
    }
    pieces.push(flat.slice(from));
    const eq = pieces.findIndex((p) => p.startsWith("= "));
    if (eq < 1) return null;
    const lhs = pieces.slice(0, eq).join(" "), lead = drawn(lhs) + 3, lines = [[pieces[eq].slice(2)]];
    for (const p of pieces.slice(eq + 1)) {
      const line = lines.at(-1);
      if (lead + drawn([...line, p].join(" ")) <= SLIDE_EQ_CHARS) line.push(p);
      else lines.push([p]);
    }
    return lines.map((l, i) => (i === 0 ? `${lhs} ={}& ${l.join(" ")}` : l[0].startsWith("= ") ? `&${l.join(" ")}` : `&\\quad ${l.join(" ")}`));
  }
  const fitted = (b) => (b.eq != null ? EQ(wrapEquation(b.eq)) : b);
  const rowsOf = (blocks) => blocks.reduce((n, b) => n + slideRows(b), 0);

  /* A frame as deck slides: its parts ({ at, title, narration }, the first at block 0) packed in
     order, as many to a slide as fit in SLIDE_ROWS, a long table or equation continuing on slides of its own.
     The first slide carries the frame's title (its shorter deckTitle when it has one), each later one
     the title of the part it opens with. */
  function slidesOf(f) {
    const cuts = f.parts || [{ narration: f.narration }], slides = [], parts = [];
    cuts.forEach((part, i) => {
      let blocks = [];
      parts.push({ ...part, blocks });
      for (const b of f.blocks.slice(part.at || 0, i + 1 < cuts.length ? cuts[i + 1].at : f.blocks.length)) {
        const fit = fitted(b);
        if (fit.eq != null && slideRows(fit) > SLIDE_ROWS) {
          const lines = fit.eq.replace(/^\\begin\{aligned\} | \\end\{aligned\}$/g, "").split(" \\\\ "), per = Math.floor((SLIDE_ROWS - 1.3) / 1.2);
          for (let l = 0; l < lines.length; l += per) {
            if (l) parts.push({ title: `${part.title || f.deckTitle || f.title} (cont.)`, narration: "The equation continues.", blocks: blocks = [] });
            blocks.push(EQ(`\\begin{aligned} ${lines.slice(l, l + per).join(" \\\\ ")} \\end{aligned}`));
          }
          continue;
        }
        if (!b.table || b.table.rows.length <= SLIDE_TABLE_ROWS) { blocks.push(fit); continue; }
        const { head, rows } = b.table;
        for (let r = 0; r < rows.length; r += SLIDE_TABLE_ROWS) {
          if (r) parts.push({ title: `${f.deckTitle || f.title} (cont.)`, narration: `The table continues with rows ${r + 1} to ${Math.min(r + SLIDE_TABLE_ROWS, rows.length)}.`, blocks: blocks = [] });
          blocks.push(TABLE(head, rows.slice(r, r + SLIDE_TABLE_ROWS)));
        }
      }
    });
    // A paragraph that lists items ({ p, lead, items }) and would not fit continues on slides of its own.
    for (let i = 0; i < parts.length; i++) {
      const k = parts[i].blocks.findIndex((b) => b.items && slideRows(b) > SLIDE_ROWS / 2);
      if (k < 0) continue;
      const b = parts[i].blocks[k], rest = parts[i].blocks.slice(k + 1), chunks = [[]];
      for (const t of b.items) {
        if (chunks.at(-1).length && [...chunks.at(-1), t].reduce((n, x) => n + x.text.length + 2, b.lead.length) > SLIDE_TEXT_CHARS * SLIDE_ROWS / 2) chunks.push([]);
        chunks.at(-1).push(t);
      }
      if (chunks.length < 2) continue;
      const text = (c, j) => `${j ? "" : b.lead}${c.map((t) => t.text).join("; ")}${j + 1 < chunks.length ? ";" : "."}`;
      parts[i].blocks.splice(k, Infinity, P(text(chunks[0], 0)));
      parts.splice(i + 1, 0, ...chunks.slice(1).map((c, j) => ({
        title: `${parts[i].title || f.deckTitle || f.title} (cont.)`,
        narration: `The list continues, from ${c[0].said} to ${c.at(-1).said}.`,
        blocks: [P(text(c, j + 1)), ...(j + 2 === chunks.length ? rest : [])],
      })));
    }
    for (const { title, narration, blocks } of parts) {
      const last = slides.at(-1);
      if (last && rowsOf(last.blocks) + rowsOf(blocks) <= SLIDE_ROWS) {
        last.blocks.push(...blocks);
        last.narration.push(narration);
      } else slides.push({ title: slides.length ? title : f.deckTitle || f.title, blocks, narration: [narration] });
    }
    return slides.map((s) => ({ title: s.title, blocks: s.blocks, body: markdownOf(s.blocks), narration: s.narration.join(" ") }));
  }

  /* The hand calculations as sections of frames; `at` (SI, from the left end) adds the chosen point. */
  function frames(result, options = {}) {
    const D = options.derivation || derive(result, options);
    const sections = [
      { title: "Method and reactions", frames: [authorityFrame(D), ...reactionFrames(D)] },
      { title: "Shear, moment, slope and deflection by segment", frames: [deflectionFrame(D), ...D.segments.map((s) => segmentFrame(D, s))] },
    ];
    if (options.at != null && Number.isFinite(options.at)) sections.push({ title: "At the selected point", frames: [pointFrame(result, options.at, { ...options, derivation: D })] });
    sections.push({ title: "Stress and equilibrium", frames: [checksFrame(D)] });
    return sections.map((s) => ({ ...s, frames: s.frames.map(withBody) }));
  }

  /* ---------- Markdown in beamdswitch's deck syntax ---------- */
  /* The shared template (beamdswitch.js, the site's templates/beamdswitch.js unchanged) writes only its
     four standard sections. These write the hand calculations with the same frame rules: every slide
     narrated, "Part N." on each section slide, and no Markdown that would end a frame or div early. */
  const oneLine = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
  function block(text, what) {
    const s = String(text ?? "").replace(/\r\n?/g, "\n").trim();
    for (const line of s.split("\n"))
      if (/^#{1,2}\s/.test(line) || /^\s*:{3,}/.test(line)) throw new Error(`${what} must not contain a heading or a ::: line: ${line}`);
    return s;
  }
  function spoken(text, what) {
    const s = oneLine(text);
    if (!s) throw new Error(`${what} needs a narration.`);
    if (/[$\\`*_#|<>]/.test(s)) throw new Error(`${what} narration must be plain spoken prose: ${s}`);
    return s;
  }
  const div = (name, text) => [`::: ${name}`, text, ":::"];
  function frameLines(f, where) {
    const title = oneLine(f.title), what = `Frame "${title}" in ${where}`;
    if (!title) throw new Error(`A frame in ${where} needs a title.`);
    const out = [`## ${title}`, ""];
    if (f.body) out.push(block(f.body, what), "");
    if (f.notes) out.push(...div("notes", block(f.notes, what)), "");
    out.push(...div("narration", spoken(f.narration, what)), "");
    return out;
  }
  /* The slide that opens section `n` (from 1). */
  const sectionSlide = (title, n) => [`# ${oneLine(title)}`, "", ...div("narration", `Part ${n}. ${oneLine(title)}.`), ""];
  function sectionLines(title, n, frames) {
    if (!frames || !frames.length) throw new Error(`The ${title} section needs at least one frame.`);
    const out = sectionSlide(title, n);
    for (const f of frames) out.push(...frameLines(f, title));
    return out;
  }

  /* { meta, narration, notes, sections: [{ title, frames }] } as Markdown that beamdswitch opens as a deck. */
  function document(doc) {
    const meta = doc.meta || {};
    if (!oneLine(meta.title)) throw new Error("The report needs a title.");
    const out = ["---"];
    for (const k of ["title", "subtitle", "author", "date", "voice"]) if (oneLine(meta[k])) out.push(`${k}: ${oneLine(meta[k])}`);
    out.push("---", "");
    if (doc.notes) out.push(...div("notes", block(doc.notes, "The title slide")), "");
    out.push(...div("narration", spoken(doc.narration, "The title slide")), "");
    (doc.sections || []).forEach(({ title, frames }, i) => out.push(...sectionLines(title, i + 1, frames)));
    return out.join("\n");
  }

  /* The shared template's deck of a beamReport, with its `hand` frames as a "Hand calculations"
     section between Results and Checks and takeaway, which becomes Part 5. */
  const HAND = "Hand calculations";
  function deck(report) {
    const { hand, ...standard } = report, md = T.deck(standard);
    if (!hand || !hand.length) return md;
    const n = T.SECTIONS.findIndex(([id]) => id === "checks") + 1, title = T.SECTIONS[n - 1][1];
    const slide = `\n${sectionSlide(title, n).join("\n")}`, at = md.indexOf(slide);
    if (at < 0 || md.indexOf(slide, at + 1) >= 0) throw new Error(`The template's deck has no single ${title} section slide.`);
    return [md.slice(0, at), ...sectionLines(HAND, n, hand), ...sectionSlide(title, n + 1)].join("\n") + md.slice(at + slide.length);
  }

  /* A Markdown document of every hand-calculation step; it is also a beamdswitch deck. */
  function markdown(result, options = {}) {
    const name = String(options.title || "").trim(), c = context(result, options);
    return document({
      meta: { title: name ? `Hand calculations: ${name}` : "Hand calculations", subtitle: "Reactions, shear force, bending moment, slope and deflection, step by step", voice: VOICE },
      narration: `Hand calculations${name ? ` for ${name}` : ""}. Each step derives the stiffness solver's answer by hand, in ${spokenUnit(c.u, "force")}, ${spokenUnit(c.u, "length")} and ${spokenUnit(c.u, "stress")}.`,
      sections: frames(result, options),
    });
  }

  /* engine.js's beamReport with the hand calculations, every segment included, as `hand` for deck():
     each frame on as many slides as it needs to fit. */
  function beamReport(result, options = {}) {
    const report = B.beamReport(result, options), hand = frames(result, options).flatMap((s) => s.frames.flatMap(slidesOf));
    return { ...report, hand };
  }

  /* ---------- a small TeX subset, drawn by the page without a maths library ---------- */
  const SYMBOLS = {
    langle: "⟨", rangle: "⟩", theta: "θ", sigma: "σ", sum: "Σ", int: "∫", iint: "∬", cdot: "·", times: " × ", Rightarrow: " ⇒ ",
    le: " ≤ ", ge: " ≥ ", approx: " ≈ ", pm: " ± ", infty: "∞", nu: "ν", Delta: "Δ", max: "max", min: "min",
    quad: " ", qquad: "  ", ",": " ", " ": " ", ";": " ", "{": "{", "}": "}", "|": "‖", "\\": " ",
  };
  /* Nodes are strings or { t: "sup" | "sub" | "text" | "frac", c | n, d }. */
  function texNodes(src) {
    let i = 0;
    const atom = () => {
      if (src[i] === "{") { i++; return seq("}"); }
      if (src[i] === "\\") return command();
      return i < src.length ? [mathChar(src[i++])] : [];
    };
    const mathChar = (ch) => (ch === "-" ? "−" : ch === "'" ? "′" : ch === "=" ? " = " : ch);
    function command() {
      i++;
      const name = /[A-Za-z]/.test(src[i] || "") ? src.slice(i).match(/^[A-Za-z]+/)[0] : (src[i] || "");
      i += name.length;
      if (/^[A-Za-z]/.test(name)) while (src[i] === " ") i++; // as in TeX, a control word swallows the spaces after it
      if (name === "frac") { const n = atom(), d = atom(); return [{ t: "frac", n, d }]; }
      if (name === "mathrm") return [{ t: "text", c: atom() }];
      if (name === "text") {
        if (src[i] === "{") { i++; let depth = 1, s = ""; while (i < src.length) { const ch = src[i++]; if (ch === "{") depth++; else if (ch === "}" && !--depth) break; s += ch; } return [{ t: "text", c: [s] }]; }
        return atom();
      }
      if (name === "left" || name === "right") return src[i] === "." ? (i++, []) : [mathChar(src[i++])];
      return [SYMBOLS[name] ?? name];
    }
    function seq(end) {
      const out = [];
      while (i < src.length) {
        const ch = src[i];
        if (end && ch === end) { i++; break; }
        if (ch === "^" || ch === "_") { i++; out.push({ t: ch === "^" ? "sup" : "sub", c: atom() }); continue; }
        if (ch === "\\") { out.push(...command()); continue; }
        if (ch === "{") { i++; out.push(...seq("}")); continue; }
        out.push(mathChar(ch)); i++;
      }
      // Merge neighbouring strings.
      return out.reduce((acc, n) => { if (typeof n === "string" && typeof acc.at(-1) === "string") acc[acc.length - 1] += n; else acc.push(n); return acc; }, [])
        .map((n) => (typeof n === "string" ? n.replace(/ {2,}/g, " ") : n));
    }
    return seq(null);
  }
  /* Plain text of a TeX string, for accessible labels and tests. */
  const texText = (src) => {
    const flat = (nodes) => nodes.map((n) => (typeof n === "string" ? n : n.t === "frac" ? `(${flat(n.n)})/(${flat(n.d)})` : n.t === "sup" ? `^${flat(n.c)}` : n.t === "sub" ? `_${flat(n.c)}` : flat(n.c))).join("");
    return flat(texNodes(src)).replace(/\s+/g, " ").trim();
  };

  return { derive, frames, pointFrame, markdown, beamReport, deck, document, markdownOf, slidesOf, texNodes, texText, WRITE_UNKNOWNS, SLIDE_ROWS };
});
