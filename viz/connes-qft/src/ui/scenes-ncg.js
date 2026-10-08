/* Noncommutative / spectral geometry track (spec §60–§73, §121, §132). Finite and lattice spectral
   triples only, each labelled; continuum statements are cited. */

const RING_N = 8;
/* Draw a ring of N sites with link arrows whose angle is the link phase. */
function ringDiagram(N, phases, { cx = 100, cy = 100, R = 70, cls = "ncg", label = "", sites = null } = {}) {
  let s = circ(cx, cy, R, "", 'fill="none" stroke="var(--rule)"');
  for (let x = 0; x < N; x++) {
    const a0 = (2 * PI * x) / N - PI / 2, a1 = (2 * PI * (x + 1)) / N - PI / 2, am = (a0 + a1) / 2;
    const px = cx + R * Math.cos(am), py = cy + R * Math.sin(am);
    const ph = phases ? phases[x] : 0;
    s += circ(px, py, 9, "", `fill="var(--panel)" stroke="var(--${cls})" data-tip="link ${x}→${(x + 1) % N}: phase ${fmt(ph, 3)}"`) + ln(px, py, px + 8 * Math.cos(ph - PI / 2), py + 8 * Math.sin(ph - PI / 2), cls, 'stroke-width="2"');
    const sx = cx + R * Math.cos(a0), sy = cy + R * Math.sin(a0);
    s += circ(sx, sy, 4, sites ? "" : "vtx", sites ? `fill="var(--ncg)" fill-opacity="${(0.15 + 0.85 * sites[x]).toFixed(2)}" stroke="var(--ncg)"` : "");
  }
  if (label) s += txt(cx, cy + 4, label, "xs ink2", 'text-anchor="middle"');
  return s;
}
const NCG_FUNCS = { cos: ["cos θ", (z) => Math.cos(z)], sin2: ["sin 2θ", (z) => Math.sin(2 * z)], bump: ["smooth bump", (z) => Math.exp(-3 * (1 - Math.cos(z - 1)))], lin: ["sawtooth (kink)", (z) => Math.abs(((z / PI + 1) % 2) - 1)] };

/* ---------- §60, §73 algebra as geometry ---------- */
scene({
  id: "ncg-enter", track: "ncg", title: "Algebra as geometry", sections: [60, 73],
  summary: "Replace a compact space M by its algebra C^∞(M): points become characters, functions algebra elements, vector bundles modules, metric data the Dirac operator. Then drop commutativity, ab ≠ ba: the 'space' no longer has ordinary points.",
  refs: ["connes1994", "vS2015"],
  init: () => ({ x: 1.0, nc: false }),
  controls: (c) => `${slider("x", "point x on the circle", 0, 6.28, 0.01, c.s.x, (v) => v.toFixed(2))} ${toggle("nc", "remove commutativity", c.s.nc)}`,
  panels: {
    space: (c) => {
      let s = circ(110, 110, 80, "", 'fill="none" stroke="var(--axis)" stroke-width="2"');
      const px = 110 + 80 * Math.cos(c.s.x), py = 110 - 80 * Math.sin(c.s.x);
      if (!c.s.nc) s += circ(px, py, 7, "fck", 'data-link="point"') + txt(px + 9, py - 6, "x", "lbl serif");
      else for (let i = 0; i < 40; i++) s += circ(110 + 80 * Math.cos(i), 110 - 80 * Math.sin(i * 1.7), 2 + (i % 3), "faqft", 'opacity="0.25"');
      s += txt(210, 60, c.s.nc ? "no points to draw:" : "M = S¹", "sm") + txt(210, 78, c.s.nc ? "pure states replace them" : "A = C^∞(S¹)", "sm ink2");
      return { title: c.s.nc ? "A NONCOMMUTATIVE 'SPACE'" : "SPACE M", sub: "", body: svg(400, 220, s, "space") };
    },
    field: (c) => {
      const fs = [["cos θ", Math.cos], ["sin θ", Math.sin], ["cos 2θ", (z) => Math.cos(2 * z)], ["e^{iθ}", null]];
      if (c.s.nc) {
        const a = LA.from([[0, 1], [0, 0]]), b = LA.from([[0, 0], [1, 0]]);
        const ab = LA.mul(a, b), ba = LA.mul(b, a);
        return { title: "ab ≠ ba", sub: "M₂(ℂ), computed", body: svg(400, 120, heatmap(LA.toArray(ab), { x: 20, y: 30, size: 30, cls: "aqft", name: "ab", title: "ab" }) + heatmap(LA.toArray(ba), { x: 140, y: 30, size: 30, cls: "aqft", name: "ba", title: "ba" }) + heatmap(LA.toArray(LA.comm(a, b)), { x: 260, y: 30, size: 30, cls: "ck", name: "[a,b]", title: "[a, b] ≠ 0" }), "noncommuting matrices"), foot: "A character χ would need χ(ab) = χ(a)χ(b) = χ(ba), so χ([a, b]) = 0; the commutators of M₂(ℂ) span all traceless matrices, so χ vanishes on them and χ(1) = 1 is impossible: M₂(ℂ) has no characters, no points." };
      }
      return { title: "THE POINT AS A CHARACTER", sub: "χ_x(f) = f(x)", body: table(["f ∈ C^∞(S¹)", "χ_x(f)"], fs.map(([n, f]) => [n, f ? fmt(f(c.s.x), 5) : `${fmt(Math.cos(c.s.x), 4)} + ${fmt(Math.sin(c.s.x), 4)}i`]), [1]) + `<p class="small">χ_x(fg) = χ_x(f)χ_x(g): multiplicative. Gelfand: the characters of C(M) are exactly the points of M.</p>` };
    },
    algebra: () => ({ title: "DICTIONARY", sub: "space ↔ algebra", body: table(["SPACE", "ALGEBRA"], [["point", "character"], ["function", "algebra element"], ["vector bundle", "(projective) module"], ["metric data", "Dirac spectrum / D"], ["symmetry", "automorphism"]]) }),
    diagram: () => ({ title: "WHAT NCG DOES NOT MEAN", body: `<p class="small">Noncommutative geometry does not simply mean ${tex("[x^\\mu, x^\\nu] \\neq 0")} for physical coordinates. The framework is broader: geometry is encoded by an algebra (commutative or not) together with spectral and operator data. Moyal-type noncommutative spacetimes are one separate example, not the definition.</p>` }),
  },
  notes: () => `<p>${tex("M \\rightsquigarrow \\mathcal{A} = C^\\infty(M)")}: every geometric notion is rewritten as algebra, which then makes sense when ${tex("ab \\neq ba")}. With commutativity gone, points (characters) disappear and states take their place.</p>`,
});

/* ---------- §61–62 spectral triple and reconstruction ---------- */
scene({
  id: "triple", track: "ncg", title: "Spectral triples and reconstruction", sections: [61, 62],
  summary: "(𝒜, ℋ, D): an algebra of coordinates acting on a Hilbert space of states, with a Dirac-type operator for geometry. For a spin manifold, 𝒜 = C^∞(M), ℋ = L²(M, S), D the Dirac operator. Fade out the manifold and ask what the data still know.",
  refs: ["connes1994", "connes2013", "milnor1964"],
  init: () => ({ hide: 0, Lambda: 40 }),
  controls: (c) => `${slider("hide", "hide the manifold", 0, 1, 0.01, c.s.hide, (v) => `${Math.round(v * 100)}%`)} ${slider("Lambda", "spectral cutoff Λ", 5, 400, 1, c.s.Lambda, (v) => String(v))}`,
  panels: {
    space: (c) => ({ title: "THE MANIFOLD", sub: "S¹ of length 2π", body: svg(400, 200, `<g opacity="${(1 - c.s.hide).toFixed(2)}">${circ(200, 100, 75, "", 'fill="none" stroke="var(--ncg)" stroke-width="3"')}${Q.range(12).map((k) => circ(200 + 75 * Math.cos(k * PI / 6), 100 + 75 * Math.sin(k * PI / 6), 2.5, "vtx")).join("")}</g>${c.s.hide > 0.95 ? txt(200, 104, "hidden: only (𝒜, ℋ, D) remain", "sm ink2", 'text-anchor="middle"') : ""}`, "manifold") }),
    field: () => {
      const s = poly([[200, 20], [60, 180], [340, 180]], "bgncg", 'stroke="var(--ncg)" stroke-width="1.5"') + txt(200, 16, "𝒜", "lbl", 'text-anchor="middle" style="font-size:16px"') + txt(200, 40, "coordinates / observables", "xs ink2", 'text-anchor="middle"') + txt(52, 196, "ℋ", "lbl", 'style="font-size:16px"') + txt(40, 214, "states", "xs ink2") + txt(342, 196, "D", "lbl", 'style="font-size:16px"') + txt(330, 214, "geometry", "xs ink2") + txt(118, 104, "acts on", "xs ink2", 'transform="rotate(-49 118 104)"') + txt(200, 175, "Dirac-type operator on ℋ", "xs ink2", 'text-anchor="middle"');
      return { title: "THE SPECTRAL TRIPLE", sub: "(𝒜, ℋ, D)", body: svg(400, 220, s, "spectral triple") };
    },
    diagram: (c) => {
      const w = SP.weylLength(c.s.Lambda);
      const eig = Q.range(41).map((i) => i - 20);
      return { title: "WHAT THE SPECTRUM KNOWS", sub: "D = −i d/dθ: spectrum ℤ", body: svg(400, 110, spectrumStrip(eig, { x: 10, y: 6, w: 380, h: 70, lim: 21 }), "spectrum") + kv([["eigenvalues with |λ| ≤ Λ", String(w.count)], ["Weyl's law ℓ ≈ π N(Λ)/Λ", `${fmt(w.length, 7)} (true 2π = ${fmt(2 * PI, 7)})`]]) };
    },
    algebra: () => ({ title: "CAN THE GEOMETRY BE RECONSTRUCTED?", body: `<p class="small"><b>Spectral geometry says: much of it can.</b> The spectrum alone gives dimension and volume (Weyl), but not everything: Milnor found isospectral flat tori that are not isometric. Adding the algebra and its action closes the gap: Connes' reconstruction theorem recovers a compact spin manifold from a commutative spectral triple satisfying his axioms.</p>${table(["data", "recovers"], [["spectrum of D", "dimension, volume, heat invariants"], ["𝒜 = C^∞(M)", "the points (characters)"], ["‖[D, f]‖", "the metric (Connes distance)"]])}` }),
  },
  notes: () => `<p>${formula("(\\mathcal{A}, \\mathcal{H}, D) = (C^\\infty(M),\\ L^2(M, S),\\ \\not{D})")} Keep the manifold visible, then fade it: the triple remains, and the next views recover distances from the commutator norm and fields from fluctuations of D. For a general operator the spectrum need not consist of eigenvalues only; Dirac operators of compact spaces have compact resolvent, so here it does.</p>`,
});

/* ---------- §63 Connes distance ---------- */
scene({
  id: "distance", track: "ncg", title: "Connes distance formula", sections: [63],
  summary: "d(x, y) = sup{|f(x) − f(y)| : ‖[D, f]‖ ≤ 1}. Instead of a ruler, search over functions whose commutator with D has norm at most one; the supremum rises until it reaches the geodesic distance.",
  refs: ["connes1994", "ikm2001"],
  init: () => ({ x: 0.3, y: 2.6, k: 10 }),
  anim: [],
  controls: (c) => `${slider("k", "search step", 0, 10, 1, c.s.k, (v) => `${v}/10`)} <span class="small muted">drag x and y on the circle</span>`,
  panels: {
    space: (c) => {
      let s = circ(200, 115, 85, "", 'fill="none" stroke="var(--ncg)" stroke-width="2.4"');
      const P = (a) => [200 + 85 * Math.cos(a), 115 - 85 * Math.sin(a)];
      const d = SP.circleDistance(c.s.x, c.s.y);
      // geodesic arc
      const a0 = c.s.x, a1 = c.s.y; let da = ((a1 - a0) % (2 * PI) + 2 * PI) % (2 * PI); if (da > PI) da -= 2 * PI;
      s += path(pathD(Q.linspace(0, 1, 40).map((t) => P(a0 + da * t))), "ck", 'fill="none" stroke-width="4" opacity="0.5" data-link="geodesic"');
      s += circ(...P(c.s.x), 8, "fck", 'data-drag="x" data-tip="point x"') + circ(...P(c.s.y), 8, "faqft", 'data-drag="y" data-tip="point y"');
      return { title: "TWO POINTS ON S¹", sub: `geodesic distance ${fmt(d, 4)}`, body: svg(400, 230, s, "two points") };
    },
    field: (c) => {
      const cand = SP.circleCandidates(c.s.x, c.s.y, 10)[c.s.k];
      const f = (z) => Math.min(SP.circleDistance(c.s.x, z), cand.lambda);
      const zs = Q.linspace(0, 2 * PI, 241);
      return { title: "THE CANDIDATE f", sub: `‖[D, f]‖ = sup|f′| = ${fmt(cand.lipschitz, 3)}`, body: lineChart({ W: 400, H: 200, xr: [0, 2 * PI], yr: [0, PI], series: [{ pts: zs.map((z) => [z, f(z)]), cls: "ncg", label: "f(θ)" }], vlines: [{ x: c.s.x, label: "x" }, { x: c.s.y, label: "y" }], xlabel: "θ" }), foot: `|f(x) − f(y)| = ${fmt(cand.value, 5)}` };
    },
    diagram: (c) => {
      const cands = SP.circleCandidates(c.s.x, c.s.y, 10);
      return { title: "THE SUPREMUM RISES", sub: "toward the geodesic distance", body: lineChart({ W: 400, H: 200, xr: [0, 10], yr: [0, PI], series: [{ pts: cands.map((cd, i) => [i, cd.value]), cls: "ncg", label: "|f(x) − f(y)| over the search" }], hlines: [{ y: SP.circleDistance(c.s.x, c.s.y), label: "geodesic distance", cls: "ck" }], points: [{ x: c.s.k, y: cands[c.s.k].value, cls: "fck" }], xlabel: "search step" }) };
    },
    algebra: () => {
      const D3 = LA.from([[0, 1, 0], [1, 0, 2], [0, 2, 0]]);
      const d = (i, j) => SP.connesDistance(D3, [0, 1, 2], i, j).distance;
      const d01 = d(0, 1), d12 = d(1, 2), d02 = d(0, 2);
      return { title: "A THREE-POINT SPACE", sub: "computed by optimization", body: svg(400, 90, heatmap(LA.toArray(D3), { x: 10, y: 14, size: 22, cls: "ncg", name: "D", title: "D (3 × 3)" }) + txt(110, 30, `d(1, 2) = ${fmt(d01, 6)}`, "sm mono") + txt(110, 50, `d(2, 3) = ${fmt(d12, 6)}`, "sm mono") + txt(110, 70, `d(1, 3) = ${fmt(d02, 6)} ≤ ${fmt(d01 + d12, 4)}`, "sm mono"), "three points"), foot: "On ℂ³ with this D the spectral distance obeys the triangle inequality but is not additive along the chain: the commutator norm, not a path length, decides." };
    },
  },
  drag: { x: (c, p) => { c.s.x = (Math.atan2(-(p.y - 115), p.x - 200) + 2 * PI) % (2 * PI); }, y: (c, p) => { c.s.y = (Math.atan2(-(p.y - 115), p.x - 200) + 2 * PI) % (2 * PI); } },
  notes: () => `<p>${formula("d(x,y) = \\sup\\{|f(x) - f(y)| : \\|[D, f]\\| \\leq 1\\}")} For ${tex("D = -i\\,d/d\\theta")} on the circle, ${tex("[D, f] = -if'")}, so the constraint is ${tex("\\sup|f'| \\le 1")} and the candidates ${tex("f_\\lambda(z) = \\min(d(x,z), \\lambda)")} attain the geodesic distance: the metric comes from an operator.</p>`,
});

/* ---------- §64 commutator microscope ---------- */
scene({
  id: "commutator", track: "ncg", title: "Commutator microscope", sections: [64],
  summary: "Select a ∈ 𝒜 and compute [D, a]. On a manifold this detects differentiation: the entries of the commutator are the differences of a between neighbours, so D encodes infinitesimal geometry. Lattice ring of N sites standing in for the circle.",
  refs: ["connes1994"],
  init: () => ({ f: "cos", N: 24 }),
  controls: (c) => `${seg("f", Object.entries(NCG_FUNCS).map(([k, v]) => [k, v[0]]), c.s.f, "a(θ) =")} ${slider("N", "lattice sites N", 8, 48, 4, c.s.N, (v) => String(v))}`,
  panels: {
    field: (c) => {
      const f = NCG_FUNCS[c.s.f][1], r = SP.ringCommutator(c.s.N, f);
      const zs = Q.linspace(0, 2 * PI, 200), h = 1e-4;
      return { title: "a(x) AND ITS VARIATION", sub: "", body: lineChart({ W: 400, H: 200, xr: [0, 2 * PI], yr: [-2.2, 2.2], series: [{ pts: zs.map((z) => [z, f(z)]), cls: "ncg", label: "a(θ)" }, { pts: zs.map((z) => [z, (f(z + h) - f(z - h)) / (2 * h)]), cls: "ck", label: "a′(θ)", dash: "4 3" }], xlabel: "θ" }), foot: `‖[D, a]‖ = ${fmt(r.norm, 4)} on the lattice; sup|a′| = ${fmt(r.supDerivative, 4)}.` };
    },
    algebra: (c) => {
      const r = SP.ringCommutator(c.s.N, NCG_FUNCS[c.s.f][1]);
      return { title: "[D, a] AS A MATRIX", sub: `${c.s.N} × ${c.s.N}`, body: svg(320, 320, heatmap(LA.toArray(r.commutator), { x: 6, y: 6, size: 300 / c.s.N, cls: "ncg", name: "[D,a]" }), "commutator matrix"), foot: "Only the two off-diagonals survive: [D, a]_{x,x±1} ∝ (a(x±1) − a(x))/h — derivative information." };
    },
    space: (c) => ({ title: "THE ALGEBRA ELEMENT ON THE RING", sub: "", body: svg(220, 210, ringDiagram(c.s.N, null, { cx: 110, cy: 105, R: 80, sites: Q.range(c.s.N).map((x) => (NCG_FUNCS[c.s.f][1]((2 * PI * x) / c.s.N) + 1) / 2) }), "ring") }),
    diagram: () => ({ title: "WHY IT WORKS", body: formula("[D, a] = -i\\,a'(\\theta)\\quad(D = -i\\,\\tfrac{d}{d\\theta})") + `<pre class="small" style="font-family:var(--mono)">a(x)\n ↓ commutator with D\nvariation / derivative information</pre>` }),
  },
  notes: () => `<p>The commutator removes everything about a except how it changes: ${tex("[D, a]\\psi = D(a\\psi) - aD\\psi = -i a'\\psi")}. On the lattice, D is the symmetric difference and the commutator's entries are differences of a between neighbouring sites. A kink (sawtooth) shows up as a jump in the off-diagonal entries.</p>`,
});

/* ---------- §65 two-point spectral geometry ---------- */
scene({
  id: "twopoint", track: "ncg", title: "Two-point spectral geometry", sections: [65],
  summary: "The finite space ● L ● R: 𝒜_F = ℂ ⊕ ℂ acting on ℂ², D_F = [[0, m], [m̄, 0]]. Changing m changes the spectral distance between the two points: d(L, R) = 1/|m|. The cleanest entrance to almost-commutative geometry.",
  refs: ["connes1994", "ikm2001", "vS2015"],
  init: () => ({ absm: 1.5, arg: 0.6 }),
  controls: (c) => `${slider("absm", "|m|", 0.2, 4, 0.01, c.s.absm, (v) => v.toFixed(2))} ${slider("arg", "arg m", 0, 6.28, 0.01, c.s.arg, (v) => v.toFixed(2))}`,
  panels: {
    space: (c) => {
      const d = 1 / c.s.absm, sep = clamp(d * 120, 20, 330);
      const s = circ(200 - sep / 2, 90, 10, "fqft") + circ(200 + sep / 2, 90, 10, "fck") + txt(200 - sep / 2, 120, "L", "lbl", 'text-anchor="middle"') + txt(200 + sep / 2, 120, "R", "lbl", 'text-anchor="middle"') + ln(200 - sep / 2, 140, 200 + sep / 2, 140, "ncg", 'stroke-width="2"') + txt(200, 158, `d(L, R) = 1/|m| = ${fmt(d, 4)}`, "sm", 'text-anchor="middle"');
      return { title: "TWO POINTS", sub: "drawn at their spectral distance", body: svg(400, 170, s, "two points") };
    },
    algebra: (c) => {
      const m = LA.C.polar(c.s.absm, c.s.arg), tp = SP.twoPoint(m);
      return { title: "THE FINITE TRIPLE", sub: "computed", body: svg(400, 90, heatmap(LA.toArray(tp.D), { x: 10, y: 14, size: 30, cls: "ncg", name: "D_F", title: "D_F" }) + txt(90, 30, `distance (numerical sup): ${fmt(tp.distance, 8)}`, "sm mono") + txt(90, 50, `1/|m|: ${fmt(tp.exact, 8)}`, "sm mono") + txt(90, 70, `spectrum of D_F: ±|m| = ${tp.spectrum.map((x) => fmt(x, 4)).join(", ")}`, "sm mono"), "two-point triple") };
    },
    field: (c) => {
      const cands = SP.twoPointCandidates(c.s.absm, 12);
      return { title: "THE SUP OVER f = (0, s)", sub: "‖[D_F, f]‖ = |m| s ≤ 1", body: lineChart({ W: 400, H: 190, xr: [0, cands.at(-1).s], yr: [0, 1.3], series: [{ pts: cands.map((cd) => [cd.s, cd.norm]), cls: "ncg", label: "‖[D_F, f]‖" }], hlines: [{ y: 1, label: "constraint ‖[D, f]‖ ≤ 1", cls: "ck" }], vlines: [{ x: 1 / c.s.absm, label: "sup s = 1/|m|" }], xlabel: "s = |f(L) − f(R)|" }) };
    },
    diagram: () => ({ title: "WHY 1/|m|", body: `<p class="formula">[D<sub>F</sub>, diag(a, b)] = [[0, m(b − a)], [m̄(a − b), 0]], &nbsp; ‖·‖ = |m| |a − b|</p>` + `<p class="small">So ‖[D, f]‖ ≤ 1 allows |a − b| ≤ 1/|m|. Large m: points close; m → 0: infinitely far apart (disconnected).</p>` }),
  },
  notes: () => `<p>The two-point space is the simplest finite spectral triple. Taken as the internal space at every point of spacetime (next view), it is the model of the Connes–Lott and Chamseddine–Connes constructions; its Dirac entry m becomes a Higgs-type field after fluctuation.</p>`,
});

/* ---------- §66 product geometry ---------- */
scene({
  id: "product", track: "ncg", title: "Product geometry M × F", sections: [66],
  summary: "An ordinary spacetime sheet times a finite internal geometry: at each point the same two-point space. D = D_M ⊗ 1 + γ_M ⊗ D_F; the two terms anticommute, so the spectrum is ±√(μ_k² + |m|²) — computed on a lattice and compared.",
  refs: ["connes1996", "mw2002", "vS2015"],
  init: () => ({ m: 0.8, N: 8, dM: 1.2 }),
  controls: (c) => `${slider("m", "|m|", 0.1, 2, 0.01, c.s.m, (v) => v.toFixed(2))} ${slider("N", "lattice sites", 4, 12, 1, c.s.N, (v) => String(v))} ${slider("dM", "d_M(x, y)", 0, 3, 0.01, c.s.dM, (v) => v.toFixed(2))}`,
  panels: {
    space: (c) => {
      let s = "";
      const sheets = [[60, "L"], [140, "R"]];
      for (const [y, lab] of sheets) { s += path(`M40 ${y}C140 ${y - 30} 260 ${y + 30} 360 ${y}`, "ncg", 'fill="none" stroke-width="2"') + txt(366, y + 4, `M × {${lab}}`, "xs ink2"); }
      for (let i = 0; i < 6; i++) { const x = 70 + i * 55; s += ln(x, 52, x, 148, "axis", 'stroke-dasharray="2 3"'); }
      const d = SP.productDistance(c.s.dM, c.s.m), sc = 50;
      s += arrow(80, 60, 80 + c.s.dM * sc, 60, "qft") + arrow(80 + c.s.dM * sc, 60, 80 + c.s.dM * sc, 140, "ck") + ln(80, 60, 80 + c.s.dM * sc, 140, "aqft", 'stroke-dasharray="5 3" stroke-width="2"');
      s += txt(200, 186, `d((x,L),(y,R)) = √(d_M² + 1/|m|²) = ${fmt(d, 4)} (Martinetti–Wulkenhaar)`, "xs", 'text-anchor="middle"');
      return { title: "TWO SHEETS", sub: "spacetime × {L, R}", body: svg(400, 195, s, "product geometry") };
    },
    algebra: (c) => {
      const pg = SP.productGeometry(c.s.N, c.s.m);
      const err = LA.maxAbsDiff(LA.diag(pg.spectrum), LA.diag(pg.predicted));
      return { title: "SPECTRUM OF D", sub: "lattice M, computed vs ±√(μ² + |m|²)", body: svg(400, 120, spectrumStrip(pg.spectrum, { x: 10, y: 10, w: 380, h: 80, cls: "ncg" }), "spectrum") + `<p class="small">max |computed − predicted| = ${err.toExponential(1)}; the gap ±|m| at μ = 0 is the finite geometry's contribution.</p>` };
    },
    field: () => ({ title: "THE OPERATOR", body: formula("D = D_M\\otimes 1 + \\gamma_M\\otimes D_F,\\qquad D^2 = D_M^2\\otimes 1 + 1\\otimes D_F^2") + `<p class="small">γ_M anticommutes with D_M, so the cross terms cancel. This is the model form used in the Connes–Chamseddine approach to particle physics.</p>` }),
    diagram: () => ({ title: "WHERE THIS GOES", body: `<p class="small">Fluctuate the product Dirac operator: the M-part fluctuations give gauge fields, the F-part fluctuations give the Higgs-type field m ↦ m(1 + φ).</p>${sceneLink("fluctuation", "inner fluctuations")}` }),
  },
  notes: () => `<p>The lattice version uses an even spectral triple for M (D_M = [[0, T], [T*, 0]] with T the forward difference, γ_M = diag(1, −1)) so that the product construction is exact; the spectrum is checked against ${tex("\\pm\\sqrt{\\mu_k^2 + |m|^2}")} with ${tex("\\mu_k")} the singular values of T. The distance formula between sheets is quoted from the literature.</p>`,
});

/* ---------- §67–68 inner fluctuations and the U(1) field ---------- */
scene({
  id: "fluctuation", track: "ncg", title: "Inner fluctuations make a U(1) field", sections: [67, 68],
  summary: "D ↦ D_A = D + A + JAJ⁻¹ with A = ∑ a_i[D, b_i]. On a doubled ring (particle ⊕ antiparticle, J swapping them) the fluctuation puts a phase on every link: a U(1) gauge potential, opposite for the antiparticle copy. Without the doubling, J cancels the phase. A pedagogical bridge, following van den Dungen–van Suijlekom's almost-commutative electrodynamics.",
  refs: ["vdDvS2013", "mvs2014", "connes1996", "vS2015"],
  init: () => ({ amp: 0.6, grow: 1, two: false, a1: 1, b2: 1 }),
  anim: [],
  controls: (c) => `${slider("amp", "fluctuation amplitude", 0, 2, 0.01, c.s.amp, (v) => v.toFixed(2))} ${slider("grow", "switch on (animate D → D_A)", 0, 1, 0.01, c.s.grow, (v) => v.toFixed(2))} ${toggle("two", "2 × 2 model", c.s.two)}`,
  panels: {
    space: (c) => {
      if (c.s.two) {
        const f = SP.twoPointFluctuation(1, [c.s.a1 * c.s.amp, 0], [0, c.s.b2]);
        return { title: "2 × 2 MODEL", sub: "two-point space", body: svg(400, 120, heatmap(LA.toArray(SP.twoPoint(1).D), { x: 10, y: 20, size: 34, cls: "ncg", name: "D", title: "D" }) + heatmap(LA.toArray(f.A), { x: 120, y: 20, size: 34, cls: "ck", name: "A", title: "A = a[D,b] + h.c." }) + heatmap(LA.toArray(f.DA), { x: 260, y: 20, size: 34, cls: "aqft", name: "D_A", title: "D_A" }), "two by two"), foot: `m = 1 ↦ ${fmt(f.newM[0], 4)}${f.newM[1] ? ` + ${fmt(f.newM[1], 4)}i` : ""}: a scalar (Higgs-type) field φ = ${fmt(f.scalarField[0], 4)}; distance 1 ↦ ${fmt(f.distance, 4)}.` };
      }
      const r = ENG.spectralToGauge({ amplitude: c.s.amp * c.s.grow, N: RING_N });
      return { title: "LINK PHASES", sub: "particle (left) and antiparticle (right) copies", body: svg(400, 210, ringDiagram(RING_N, r.particlePhases, { cx: 100, cy: 105, R: 75, cls: "ncg", label: `Φ = ${fmt(r.flux, 3)}` }) + ringDiagram(RING_N, r.antiparticlePhases, { cx: 300, cy: 105, R: 75, cls: "ck", label: `Φ = ${fmt(r.antiFlux, 3)}` }), "link phases") };
    },
    field: (c) => {
      const r = SP.doubledRingFluctuation(RING_N, 1, ENG.spectralToGauge({ amplitude: c.s.amp * c.s.grow, N: RING_N }).theta);
      return { title: "THE RIGID D ACQUIRES A FIELD", sub: "D (left), D_A (right): colour = phase, shade = |entry|", body: svg(400, 210, heatmap(LA.toArray(r.D), { x: 6, y: 16, size: 11.5, cls: "ncg", name: "D", title: "D: colour = phase", phase: true }) + heatmap(LA.toArray(r.DA), { x: 206, y: 16, size: 11.5, cls: "ck", name: "D_A", title: "D_A: colour = phase", phase: true }), "D before and after") };
    },
    algebra: (c) => {
      const r = ENG.spectralToGauge({ amplitude: c.s.amp * c.s.grow, N: RING_N });
      return { title: "WHAT WAS COMPUTED", sub: "", body: kv([["one-form terms a_i[D, b_i]", String(r.oneFormTerms)], ["particle flux Φ", fmt(r.flux, 6)], ["antiparticle flux", fmt(r.antiFlux, 6)], ["single copy with J (phases)", r.singleCopyPhases.every((p) => Math.abs(p) < 1e-12) ? "all 0: the phase cancels" : "nonzero"], ["gauge transformation changes spectrum by", r.gaugeInvariance.toExponential(1)]]) + `<pre class="small" style="font-family:var(--mono)">metric fluctuation ↓ gauge potential\nspectral data ↓ inner fluctuation ↓ U(1) connection ↓ electromagnetic field</pre>` };
    },
    diagram: (c) => {
      const lg = SP.landauGauge(5, 1 + Math.round(c.s.amp * 2)), tor = SP.torusFluctuation(5, lg.thx, lg.thy);
      return { title: "CURVATURE ON A LATTICE TORUS", sub: "plaquette holonomy = F", body: svg(400, 170, heatmap(tor.F, { x: 10, y: 20, size: 28, cls: "ck", name: "F", title: `F per plaquette (${1 + Math.round(c.s.amp * 2)} flux quanta)` }) + txt(170, 60, "every plaquette carries the same", "xs ink2") + txt(170, 76, "holonomy: a uniform field B", "xs ink2"), "curvature"), foot: `uniform F = 2πn/N² = ${fmt(lg.B, 5)}: the electromagnetic field of the fluctuation.` };
    },
  },
  notes: () => `<p>${formula("D \\mapsto D_A = D + A + JAJ^{-1},\\qquad A = \\sum_i a_i[D, b_i]")} Here 𝒜 = ℂᴺ ⊕ ℂᴺ acts on two copies of the ring, D = H₀ ⊕ H₀ (a hopping operator standing in for the Dirac operator), and J(ξ, η) = (η̄, ξ̄). One-forms built from site projections reach every link, so any link phase θ_x is an inner fluctuation; JAJ⁻¹ copies it, conjugated, onto the antiparticle sheet. With a single commutative copy and J = complex conjugation, A + JAJ⁻¹ is real and the phase disappears — the reason the simplest commutative spectral triple does not by itself generate U(1) electrodynamics, and the reason van den Dungen and van Suijlekom double the finite space.</p>`,
});

/* ---------- §69–71 spectral action ---------- */
scene({
  id: "specaction", track: "ncg", title: "Spectral action", sections: [69, 70, 71],
  summary: "S_bos = Tr f(D_A/Λ): the action counts eigenvalues of D_A, weighted by a cutoff function f. Low-lying eigenvalues contribute fully, far ones are suppressed; the accumulated trace is plotted. At high Λ the trace has a heat-kernel expansion (advanced mode).",
  refs: ["cc1997", "connes1996", "vS2015"],
  init: () => ({ Lambda: 1.5, cutoff: "gauss", amp: 0.6 }),
  controls: (c) => `${slider("Lambda", "spectral cutoff Λ", 0.2, 4, 0.01, c.s.Lambda, (v) => v.toFixed(2))} ${seg("cutoff", Object.entries(SP.CUTOFFS).map(([k, v]) => [k, v.name.split(" ")[0]]), c.s.cutoff, "f")} ${slider("amp", "fluctuation", 0, 2, 0.01, c.s.amp, (v) => v.toFixed(2))}`,
  panels: {
    field: (c) => {
      const r = ENG.spectralToGauge({ amplitude: c.s.amp, Lambda: c.s.Lambda, cutoff: c.s.cutoff });
      const sa = SP.spectralAction(r.spectrum, c.s.Lambda, c.s.cutoff);
      const sorted = r.spectrum.slice().sort((a, b) => a - b);
      return { title: "EIGENVALUES OF D_A AND THEIR WEIGHTS", sub: `f(λ/Λ), ${SP.CUTOFFS[c.s.cutoff].name}`, body: svg(400, 130, spectrumStrip(sorted, { x: 10, y: 20, w: 380, h: 90, lim: 4, Lambda: c.s.Lambda, weights: sorted.map((l) => SP.CUTOFFS[c.s.cutoff].f(l / c.s.Lambda)) }), "weighted spectrum"), foot: `Tr f(D_A/Λ) = <b>${fmt(sa.total, 6)}</b>` };
    },
    diagram: (c) => {
      const r = ENG.spectralToGauge({ amplitude: c.s.amp, Lambda: c.s.Lambda, cutoff: c.s.cutoff });
      const sa = SP.spectralAction(r.spectrum, c.s.Lambda, c.s.cutoff);
      return { title: "ACCUMULATED TRACE", sub: "eigenvalues in order of |λ|", body: lineChart({ W: 400, H: 190, xr: [0, sa.rows.length], yr: [0, sa.rows.length], series: [{ pts: sa.rows.map((row, i) => [i + 1, row.cumulative]), cls: "ncg", label: "∑ f(λ/Λ) so far" }, { pts: sa.rows.map((row, i) => [i + 1, i + 1]), cls: "axis", label: "plain count", dash: "4 3" }], xlabel: "number of eigenvalues included" }) };
    },
    algebra: (c) => {
      const Ls = Q.linspace(0.3, 4, 40);
      const specOf = (a) => SP.doubledRingFluctuation(RING_N, 1, ENG.spectralToGauge({ amplitude: 0 }).theta.map((_, x) => a * Math.sin((2 * PI * (x + 0.5)) / RING_N) + a * 0.5)).spectrum;
      return { title: "S(Λ) AND THE GAUGE FIELD", sub: "doubled ring", body: lineChart({ W: 400, H: 190, xr: [0.3, 4], yr: [0, 17], series: [0, 0.6, 1.2].map((a, i) => { const sp = specOf(a); return { pts: Ls.map((L) => [L, SP.spectralAction(sp, L, c.s.cutoff).total]), cls: ["axis", "ncg", "ck"][i], label: `fluctuation ${a}` }; }), vlines: [{ x: c.s.Lambda, label: "Λ" }], xlabel: "Λ" }), foot: "The action changes with the fluctuation only through its gauge-invariant flux." };
    },
    space: (c) => {
      const mo = SP.cutoffMoments(c.s.cutoff), cs = SP.circleSpectralAction(c.s.Lambda * 3, 0.3);
      return { title: G.advanced ? "HEAT-KERNEL EXPANSION (ADVANCED)" : "HEAT-KERNEL EXPANSION", sub: "high Λ", body: `<pre class="small" style="font-family:var(--mono)">full spectral action\n      ↓ asymptotic expansion\ncosmological term + Einstein-like term\n+ Yang–Mills terms + higher-order terms</pre>` + (G.advanced ? formula("\\mathrm{Tr}\\,f(D/\\Lambda) \\sim 2\\Lambda^4f_4a_0 + 2\\Lambda^2f_2a_2 + f_0a_4") + kv([["f₀ = f(0)", fmt(mo.f0, 5)], ["f₂ = ∫ f(v)v dv", fmt(mo.f2, 5)], ["f₄ = ∫ f(v)v³ dv", fmt(mo.f4, 5)], ["circle check, Λ' = 3Λ", `∑ e^{−((n+a)/Λ')²} = ${fmt(cs.direct, 8)}; √π Λ' = ${fmt(cs.leading, 8)}`]]) : '<p class="small">Switch on <b>advanced</b> to see the coefficients.</p>') };
    },
  },
  notes: () => `<p>${formula("S_{\\rm bos} = \\mathrm{Tr}\\,f(D_A/\\Lambda),\\qquad S_{\\rm ferm} = \\langle\\psi, D_A\\psi\\rangle")} The Chamseddine–Connes spectral action extracts a physical action from spectral data. On a four-manifold its large-Λ expansion contains a cosmological term, the Einstein–Hilbert term and Yang–Mills terms for the gauge fields produced by fluctuations. On the circle the Gaussian action can be summed exactly by Poisson summation, which the advanced panel checks.</p>`,
});

/* ---------- §72 spectral Standard Model preview ---------- */
scene({
  id: "sm", track: "ncg", title: "Spectral Standard Model (preview)", sections: [72],
  summary: "M × F_SM with internal algebra ℂ ⊕ ℍ ⊕ M₃(ℂ). Its inner fluctuations give U(1) × SU(2) × SU(3) gauge fields and the Higgs; the spectral action recovers the Standard Model coupled to gravity, under the framework's assumptions and with scale-dependent parameter relations. QED stays the main example.",
  refs: ["ccm2007", "cc1997", "vS2015"],
  panels: {
    space: () => ({ title: "THE INTERNAL ALGEBRA", body: table(["summand", "real dimension", "gauge group (after unimodularity)"], [["ℂ", "2", "U(1)"], ["ℍ (quaternions)", "4", "SU(2)"], ["M₃(ℂ)", "18", "SU(3) (with U(3) → SU(3))"]]) + `<pre class="small" style="font-family:var(--mono)">internal geometry\n      ↓ inner fluctuations\nU(1) × SU(2) × SU(3)\n      ↓\ngauge bosons + Higgs</pre>` }),
    algebra: () => ({ title: "WHAT IS AND IS NOT CLAIMED", body: `<ul class="small"><li>Claimed (Chamseddine–Connes–Marcolli 2007): the spectral action of M × F_SM gives the Standard Model Lagrangian coupled to gravity, with relations among couplings at a unification scale.</li><li>Not claimed: that the spectral Standard Model is itself a complete nonperturbative quantization of the Standard Model.</li><li>The relations hold at one scale and must be run with the RG; their phenomenology is a separate question.</li></ul>` }),
  },
  notes: () => `<p>An advanced branch. The same mechanism as the U(1) view — fluctuations of a finite Dirac operator — with a richer finite algebra produces the full gauge group and the Higgs field.</p>`,
});

/* ---------- §121, §132 flagship: from spectral triple to field ---------- */
const NCG_STEPS = ["choose a ∈ 𝒜", "compute [D, a]", "build A = ∑ a[D, b]", "fluctuate D", "identify the gauge field", "compute curvature", "spectral action", "compare with electrodynamics"];
scene({
  id: "flagship-ncg", track: "ncg", title: "From spectral triple to gauge field", sections: [121, 132],
  summary: "The second flagship: ordinary geometry M encoded as C^∞(M), L²(S), D; forget the visual manifold; perturb D → D + A + JAJ⁻¹; read off the gauge field and its curvature; evaluate the spectral action. Gauge fields appear as fluctuations of spectral geometry.",
  refs: ["vdDvS2013", "cc1997", "mvs2014"],
  init: () => ({ step: 0, amp: 0.6, Lambda: 1.5, cutoff: "gauss" }),
  controls: (c) => `${stepper("step", NCG_STEPS, c.s.step)} ${slider("amp", "fluctuation amplitude", 0, 2, 0.01, c.s.amp, (v) => v.toFixed(2))}`,
  present: ["space", "algebra"],
  panels: {
    space: (c) => {
      const st = c.s.step, r = ENG.spectralToGauge({ amplitude: c.s.amp, N: RING_N, Lambda: c.s.Lambda, cutoff: c.s.cutoff });
      if (st === 0) return { title: "ORDINARY GEOMETRY → ALGEBRA", sub: "a = cos θ ∈ C^∞(S¹)", body: svg(220, 210, ringDiagram(RING_N, null, { cx: 110, cy: 105, R: 80, sites: r.a.map((v) => (v + 1) / 2) }), "algebra element") };
      if (st === 1) { const cm = SP.ringCommutator(RING_N, (z) => Math.cos(z)); return { title: "[D, a]", sub: `‖[D, a]‖ = ${fmt(cm.norm, 4)}`, body: svg(220, 220, heatmap(LA.toArray(cm.commutator), { x: 10, y: 10, size: 200 / RING_N, cls: "ncg", name: "[D,a]" }), "commutator") }; }
      if (st <= 4) return { title: st === 2 ? "ONE-FORM A" : st === 3 ? "D → D_A" : "GAUGE FIELD = LINK PHASES", sub: "particle | antiparticle", body: svg(400, 210, ringDiagram(RING_N, r.particlePhases, { cx: 100, cy: 105, R: 75, cls: "ncg", label: "particle" }) + ringDiagram(RING_N, r.antiparticlePhases, { cx: 300, cy: 105, R: 75, cls: "ck", label: "antiparticle" }), "link phases") };
      if (st === 5) return { title: "CURVATURE", sub: `holonomy Φ = ${fmt(r.flux, 4)}`, body: svg(400, 170, heatmap(r.torus.F, { x: 10, y: 20, size: 28, cls: "ck", name: "F", title: "torus plaquettes F = dA" }), "curvature") };
      const sorted = r.spectrum.slice().sort((a, b) => a - b);
      return { title: st === 6 ? "SPECTRAL ACTION" : "COMPARE WITH ELECTRODYNAMICS", sub: `Tr f(D_A/Λ) = ${fmt(r.spectralAction.fluctuated, 5)}`, body: svg(400, 120, spectrumStrip(sorted, { x: 10, y: 12, w: 380, h: 90, lim: 3, Lambda: c.s.Lambda, weights: sorted.map((l) => SP.CUTOFFS[c.s.cutoff].f(l / c.s.Lambda)) }), "spectrum") };
    },
    field: (c) => ({ title: "THE PIPELINE", sub: "", body: `<ol class="small">${NCG_STEPS.map((t, i) => `<li${i === c.s.step ? ' style="font-weight:650"' : i > c.s.step ? ' class="muted"' : ""}>${supify(esc(t))}</li>`).join("")}</ol><p class="small">ORDINARY GEOMETRY → C^∞(M), L²(S), D → spectral triple → D + A + JAJ⁻¹ → gauge field → curvature → spectral action</p>` }),
    diagram: (c) => {
      const r = SP.doubledRingFluctuation(RING_N, 1, ENG.spectralToGauge({ amplitude: c.s.step >= 3 ? c.s.amp : 0, N: RING_N }).theta);
      return { title: c.s.step >= 3 ? "D_A" : "D", sub: "colour = phase, shade = |entry|", body: svg(220, 210, heatmap(LA.toArray(r.DA), { x: 10, y: 10, size: 12, cls: c.s.step >= 3 ? "ck" : "ncg", name: "D", phase: true }), "Dirac matrix"), foot: "colour = phase of each entry" };
    },
    algebra: (c) => {
      const r = ENG.spectralToGauge({ amplitude: c.s.amp, N: RING_N });
      const rows = [
        ["functions on M", `𝒜 = C^∞(S¹) → ℂᴺ ⊕ ℂᴺ (lattice, N = ${RING_N})`],
        ["derivative a′", `[D, a], ‖[D, a]‖ = ${fmt(r.commutatorNorm, 4)}`],
        ["connection one-form A_μ dx^μ", `A = ∑ a_i[D, b_i], ${r.oneFormTerms} terms`],
        ["covariant derivative ∂ + ieA", "D_A = D + A + JAJ⁻¹"],
        ["U(1) potential", `link phases, opposite for antiparticles (Φ = ${fmt(r.flux, 4)} / ${fmt(r.antiFlux, 4)})`],
        ["F = dA", `holonomy; torus F = ${fmt(r.torus.B, 4)} per plaquette`],
        ["action ∫ F²/4 + …", `Tr f(D_A/Λ) = ${fmt(r.spectralAction.fluctuated, 5)}`],
        ["electrodynamics", "opposite charges for e⁻ and e⁺; only gauge-invariant data (flux) enter the action"],
      ];
      return { title: "ORDINARY GEOMETRY | SPECTRAL DATA", sub: `step ${c.s.step + 1} of ${NCG_STEPS.length}`, body: table(["ordinary geometry", "spectral data"], rows.map((row, i) => (i === c.s.step ? row.map((x) => `<b>${esc(x)}</b>`) : i < c.s.step ? row.map(esc) : row.map((x) => `<span class="muted">${esc(x)}</span>`)))) };
    },
  },
  notes: () => `<p>ORDINARY GEOMETRY M ↓ encode C^∞(M), L²(S), D ↓ forget the visual manifold: a spectral triple ↓ perturb D → D + A + JAJ⁻¹ ↓ gauge field ↓ curvature ↓ spectral action. Every number here is computed on the lattice triple; the identification with Maxwell theory in four dimensions is the content of van den Dungen and van Suijlekom's paper, cited rather than recomputed.</p>`,
  md: (c) => ({ title: "From spectral triple to gauge field", sections: REP.spectralMarkdown(ENG.spectralToGauge({ amplitude: c.s.amp, N: RING_N, Lambda: c.s.Lambda, cutoff: c.s.cutoff })) }),
  deckKind: "spectral",
});
