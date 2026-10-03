
/* ================= the other sections ================= */

/* ---- opening: three worlds, one swap ---- */
const OPEN = { s: 0, model: "plane" };
function renderOpening() {
  const s = OPEN.s, r2 = Math.SQRT2, w = 300, h = 200, X = (x) => 150 + x * 70;
  let f = line([20, 120], [280, 120], "sv-line");
  for (let k = -2; k <= 2; k++) f += line([X(k), 115], [X(k), 125], "sv-line") + txt(X(k) - 4, 142, String(k), "sv-small ui-t");
  [r2, -r2].forEach((x0, k) => {
    const a = Math.PI * s, x = X(x0 * Math.cos(a)), y = 120 + (k ? 1 : -1) * 46 * Math.sin(a);
    f += circ(x, y, 8, `${sheetCls(k)} sv-pt`, `data-pt="${k}"`) + txt(x - 12, y - 14, k ? "−√2" : "√2", "sv-label");
  });
  f += txt(150, 30, "ℚ ⊂ ℚ(√2): σ(√2) = −√2", "sv-label", 'text-anchor="middle"');
  const field = svg(w, h, f, "The two roots of x squared minus 2, swapped by the Galois group");
  const circle = coverSheets({ perm: [1, 0], s, w: 300, h: 260, labels: ["p₁", "p₂"], baseLabel: "S¹", coverLabel: "S¹" });
  let gm;
  if (OPEN.model === "cylinder") gm = coverSheets({ perm: [1, 0], s, w: 300, h: 260, labels: ["z", "−z"], baseLabel: "ℂ×", coverLabel: "ℂ×" });
  else {
    const t = E.cexpi(TAU * s), roots = E.kummer(2).fibre(t);
    gm = planeFig({ w: 300, h: 240, points: [{ z: [0, 0], kind: "puncture", label: "0" }], loops: [{ z: [0, 0], r: 1.6, cls: "loop-a", name: "g" }], probe: [1.6 * t.re, 1.6 * t.im], label: "The squaring map on the punctured plane",
      extra: (c) => roots.map((z, k) => { const q = c.p([z.re * 1.1, z.im * 1.1, 0]); return circ(q[0], q[1], 7, `${sheetCls(k)} sv-pt`, `data-pt="${k}"`) + txt(q[0] + 8, q[1] - 8, k ? "−√t" : "√t", "sv-label"); }).join("") + txt(10, 20, "t (glowing) goes once round 0; its square roots swap", "sv-small ui-t") });
  }
  $("opening-scenes").innerHTML = [["Field", field, "ℚ(√2)/ℚ"], ["Circle", circle, "S¹ → S¹, z ↦ z²"], ["Multiplicative group", gm, "𝔾ₘ(ℂ) = ℂ×, z ↦ z²"]]
    .map(([t, fig, cap]) => `<div class="card"><h3>${t}</h3>${fig}<p class="small muted">${esc(cap)}</p></div>`).join("");
  $("opening-align").innerHTML = s >= 0.999 ? "All three fibres: <strong>√2 ↔ −√2</strong>, <strong>p₁ ↔ p₂</strong>, <strong>√t ↔ −√t</strong>. One permutation, (1 2), in field theory, topology and algebraic geometry." : "Press Play or drag the phase: the moving point goes once round, and its two preimages trade places.";
  $("opening-s").value = String(Math.round(s * 1000));
}

/* ---- gallery ---- */
const GALLERY = [
  { id: "spec-fq", name: "Spec(k)", notation: "Spec k, one point", pic: () => towerFig(2, 4, 3, 0, [], { h: 220 }), compact: "already proper", punct: "none", covers: "Spec L for finite separable L/k", et: "G_k = Gal(k^s/k)" },
  { id: "a1", name: "𝔸¹", notation: "𝔸¹ = Spec k[t] = ℙ¹ − {∞}", pic: () => stereoFig(1, { removeInf: 1, ray: false, w: 300, h: 260 }), compact: "ℙ¹, adding ∞", punct: "∞", covers: "none in char 0; Artin–Schreier in char p", et: "1 (alg. closed, char 0)" },
  { id: "p1", name: "ℙ¹", notation: "ℙ¹ = 𝔸¹ ∪ {∞}", pic: () => sphereFig({ points: [{ P: [0, 0, 1], kind: "point", label: "∞" }], w: 300, h: 260 }), compact: "itself", punct: "none", covers: "only trivial unramified ones", et: "1 (alg. closed, char 0)" },
  { id: "gm", name: "𝔾ₘ", notation: "𝔾ₘ = Spec k[t, t⁻¹] = ℙ¹ − {0, ∞}", pic: () => cylinderFig({ w: 300, h: 240 }), compact: "ℙ¹, adding 0 and ∞", punct: "0, ∞", covers: "z ↦ zⁿ (Kummer)", et: "ℤ̂ (alg. closed, char 0)" },
  { id: "p1-3", name: "ℙ¹ − {0,1,∞}", notation: "ℙ¹ − {0, 1, ∞}", pic: () => pantsFig({}), compact: "ℙ¹, adding three points", punct: "0, 1, ∞", covers: "every finite quotient of F₂; Belyi covers", et: "F̂₂ (alg. closed, char 0)" },
  { id: "curve", name: "genus-g curve", notation: "X of genus g minus r points", pic: () => surfaceFig(2, 2, {}), compact: "the projective curve of genus g", punct: "r points", covers: "finite quotients of the surface group", et: "profinite surface group; free of rank 2g + r − 1 if r > 0 (char 0)" },
  { id: "elliptic", name: "elliptic curve", notation: "y² = x³ + ax + b, E(ℂ) = ℂ/Λ", pic: () => torusFig({ stage: 2, n: 2, w: 300, h: 220 }), compact: "itself", punct: "none", covers: "[n] : E → E and isogenies", et: "ℤ̂² (alg. closed, char 0)" },
  { id: "abelian", name: "abelian variety", notation: "A(ℂ) = ℂᵍ/Λ", pic: () => abelianFig(2, 2), compact: "itself", punct: "none", covers: "[n] : A → A", et: "ℤ̂²ᵍ (char 0)" },
  { id: "machine", name: "finite étale cover", notation: "Y → X, finite and étale", pic: () => coverSheets({ perm: [1, 2, 0], s: 0.35, w: 300, h: 260 }), compact: "extends to a branched cover of the compactification", punct: "the branch points are removed", covers: "—", et: "π₁ᵉᵗ(X) acts on its fibre" },
];
function renderGallery() {
  $("gallery-list").innerHTML = GALLERY.map((g) => `<details class="gal" data-gal="${g.id}"><summary>${esc(g.name)} <span class="small muted">π₁ᵉᵗ = ${esc(g.et)}</span></summary><div class="gal-body"><div data-galfig="${g.id}"></div><div><ol><li><strong>Notation:</strong> ${esc(g.notation)}</li><li><strong>Picture:</strong> left</li><li><strong>Compactification:</strong> ${esc(g.compact)}</li><li><strong>Punctures:</strong> ${esc(g.punct)}</li><li><strong>Typical finite covers:</strong> ${esc(g.covers)}</li><li><strong>Known π₁ᵉᵗ:</strong> ${esc(g.et)}</li></ol><button type="button" class="btn" data-open="${g.id}">${g.id === "machine" ? "Open the fibre-functor machine" : "Open in the laboratory"}</button></div></div></details>`).join("");
}

/* ---- fibre-functor machine ---- */
const MACH = { perm: "(1 2 3)", s: 0 };
const MACH_OPTIONS = ["(1 2 3)", "(1 2)", "(1 2 3 4)", "(1 3 2)", "(1 2)(3 4)", "id on 3 points"];
function machinePerm() { const d = MACH.perm.includes("4") ? 4 : 3; return MACH.perm.startsWith("id") ? E.identity(3) : E.parseCycles(MACH.perm, d); }
function renderMachine() {
  const p = machinePerm(), d = p.length, deck = E.isTransitive([p], d) ? E.centralizer([p], d).length : null;
  $("machine-fig").innerHTML = coverSheets({ perm: p, s: MACH.s, w: 340, h: 340, label: "The fibre-functor machine: sheets over a base loop with the probe x-bar" });
  $("machine-read").innerHTML = `${fibreFig({ n: d, perm: MACH.s >= 0.999 ? p : null, title: "F_x̄(Y)", w: 240, h: 220 })}<dl class="readout"><dt>F<sub>x̄</sub>(Y)</dt><dd>{${E.identity(d).map((i) => i + 1).join(", ")}}</dd><dt>loop acts</dt><dd>${MACH.s >= 0.999 ? cyc(p) : "…moving…"}</dd><dt>connected?</dt><dd>${E.isTransitive([p], d) ? "yes: one orbit" : `no: ${E.orbits([p], d).length} orbits = components`}</dd><dt>Aut(Y/X)</dt><dd>${deck != null ? `order ${deck}` : "—"}</dd></dl>`;
  $("machine-s").value = String(Math.round(MACH.s * 1000));
}

/* ---- surfaces ---- */
const SURF = { g: 2, r: 3, hl: null, elim: false, pg: 2, ps: 0 };
function renderSurfaces() {
  const Sx = E.surface(SURF.g, SURF.r);
  $("surf-fig").innerHTML = surfaceFig(SURF.g, SURF.r, { hl: SURF.hl, elim: SURF.elim });
  const parts = [];
  for (let i = 1; i <= SURF.g; i++) parts.push(`[<button type="button" data-loopname="a${i}" class="${SURF.hl === `a${i}` ? "hl" : ""}" style="color:var(--ga)">a${E.sub(i)}</button>,<button type="button" data-loopname="b${i}" class="${SURF.hl === `b${i}` ? "hl" : ""}" style="color:var(--gb)">b${E.sub(i)}</button>]`);
  for (let j = 1; j <= SURF.r; j++) parts.push(`<button type="button" data-loopname="c${j}" class="${SURF.hl === `c${j}` ? "hl" : ""}" style="color:var(--gc)">c${E.sub(j)}</button>`);
  $("surf-relation").innerHTML = parts.length ? `<span>∏[aᵢ,bᵢ] ∏cⱼ =&nbsp;</span>${parts.join(" ")}<span>&nbsp;= 1</span>` : "<span>no generators: π₁ = 1</span>";
  const el = E.eliminateLast(Sx);
  $("surf-read").innerHTML = `<p>Generators ${Sx.gens.length ? Sx.gens.join(", ") : "none"}; χ = 2 − 2g − r = ${Sx.chi}. ${Sx.free ? `With r &gt; 0 the relation solves for ${el.gen}: <span class="math">${el.gen} = (${el.word.map(([x, e]) => `${x}${e < 0 ? "⁻¹" : ""}`).join(" ")})</span>${SURF.elim ? "" : " (press Eliminate)"}, so π₁ is free on ${el.freeGens.length} = 2g + r − 1 generators: <strong>${Sx.top}</strong>, and π₁ᵉᵗ = <strong>${Sx.et}</strong> (char 0).` : SURF.g === 0 ? "The sphere: π₁ = 1." : `No punctures: one relator, π₁ = ${Sx.top}, π₁ᵉᵗ = ${Sx.et} (char 0).`}</p>`;
  $("surf-g-out").textContent = SURF.g; $("surf-r-out").textContent = SURF.r;
  $("surf-elim").disabled = !Sx.free;
  $("surf-elim").setAttribute("aria-pressed", String(SURF.elim));
  const P = E.polygon(SURF.pg);
  $("poly-fig").innerHTML = polygonFig(SURF.pg, SURF.ps);
  $("poly-read").innerHTML = `<p>The ${4 * SURF.pg}-gon with boundary word <span class="math">${P.word.map(([x, e]) => `${x[0]}${E.sub(x.slice(1))}${e < 0 ? "⁻¹" : ""}`).join(" ")}</span>.</p><p>Gluing paired edges, the page tracks where the ${4 * SURF.pg} corners go: they all become <strong>${P.V}</strong> point${P.V === 1 ? "" : "s"}. So V − E + F = ${P.V} − ${P.E} + ${P.F} = <strong>${P.chi}</strong> = 2 − 2g, and the boundary word is the single relation ∏[aᵢ,bᵢ] = 1.</p>`;
  $("poly-g-out").textContent = SURF.pg;
  $("poly-s").value = String(Math.round(SURF.ps * 1000));
}

/* ---- elliptic ---- */
const ELL = { s: 0, n: 2, a: -1, b: 0, g: 2, an: 2 };
function renderElliptic() {
  $("ell-cubic").innerHTML = `<div class="pane-h"><h3 class="small">cubic</h3>${badge("schematic")}</div>${cubicFig(ELL.a, ELL.b)}`;
  $("ell-torus").innerHTML = `<div class="pane-h"><h3 class="small">lattice → torus</h3>${badge("literal")}</div>${torusFig({ stage: 2 * ELL.s, n: ELL.n })}`;
  $("ell-grid").innerHTML = `<div class="pane-h"><h3 class="small">[${ELL.n}] : fibre over 0</h3>${badge("literal")}</div>${latticeFig(ELL.n)}`;
  $("ell-n-out").textContent = ELL.n; $("ell-a-out").textContent = String(ELL.a).replace("-", "−"); $("ell-b-out").textContent = String(ELL.b).replace("-", "−");
  $("ell-s").value = String(Math.round(ELL.s * 1000));
  $("ab-fig").innerHTML = abelianFig(ELL.g, ELL.an);
  $("ab-g-out").textContent = ELL.g; $("ab-n-out").textContent = ELL.an;
}

/* ---- characteristic p ---- */
const CP = { p: 3, t: 0.33, shift: 0, curve: "-1,0", ep: 7 };
function renderCharp() {
  const A = E.artinSchreier(CP.p, 1);
  $("as-char0").innerHTML = `<div class="pane-h"><h3 class="small">CHAR 0 · complex plane</h3>${badge("literal")}</div><div class="geom-dim">${asChar0Fig(CP.p)}</div><p class="small">contractible; the equation branches, so it is no étale cover; π₁ᵉᵗ = 1</p>`;
  $("as-charp").innerHTML = `<div class="pane-h"><h3 class="small">CHAR ${CP.p} · affine line</h3>${badge("schematic")}</div>${asFig(CP.p, CP.t, CP.shift)}<p class="small">nontrivial étale cover; π₁ᵉᵗ ≠ 1</p>`;
  $("as-read").innerHTML = `<p>Over the closed point t = 1, the fibre is Spec 𝔽${E.sub(CP.p)}[y]/(${esc(A.fString)}), ${A.irreducible ? "a field of degree " + CP.p : "not a field"}; Frobenius sends y to <strong>${esc(A.frobeniusString)}</strong> = y + t, a deck transformation. Deck group ℤ/${CP.p}: ${esc(A.deckCycle)}. Result: π₁ᵉᵗ(𝔸¹) ↠ ℤ/${CP.p}. In characteristic p the group is not finitely generated; only these quotients are shown, not a full computation.</p>`;
  const [a, b] = CP.curve.split(",").map(Number), Ec = E.ellipticModP(a, b, CP.ep);
  $("ss-fig").innerHTML = Ec.singular ? "<p>Singular modulo this p.</p>" : towersFig(Ec);
  $("ss-read").innerHTML = Ec.singular ? "" : `<dl class="readout"><dt>#E(𝔽${E.sub(CP.ep)})</dt><dd>${Ec.count}</dd><dt>aₚ</dt><dd>${Ec.ap}</dd><dt>Hasse invariant</dt><dd>${Ec.hasse} (≡ aₚ mod p: ${Ec.hasse === E.mod(Ec.ap, CP.ep) ? "yes" : "no"})</dd><dt>type</dt><dd><strong>${Ec.supersingular ? "supersingular" : "ordinary"}</strong></dd><dt>T_ℓ, ℓ ≠ p</dt><dd>ℤ_ℓ², rank 2</dd><dt>étale T_p</dt><dd>${Ec.supersingular ? "0: rank 0, the p-tower is missing" : "ℤ_p: rank 1"}</dd></dl>`;
}

/* ---- arithmetic ---- */
const AR = { n: 8, a: 3, mode: "gal", s: 0 };
function renderArith() {
  $("ar-n-out").textContent = AR.n;
  $("ar-a").innerHTML = E.units(AR.n).map((u) => `<option ${u === AR.a ? "selected" : ""}>${u}</option>`).join("");
  $("ar-layers").innerHTML = layersFig(AR.n, AR.s, AR.mode);
  $("ar-roots").innerHTML = rootsFig(AR.n, { mode: AR.mode, s: AR.s, a: AR.a, caption: AR.mode === "gal" ? `σ${E.sub(AR.a)} : ζ ↦ ζ${E.sup(AR.a)}` : "γ : ζᵏ ↦ ζᵏ⁺¹" });
  const divs = E.divisors(AR.n).filter((d) => d > 1 && d < AR.n);
  $("ar-read").innerHTML = `<p>σ${E.sub(AR.a)} permutes μ${E.sub(AR.n)} as ${cyc(E.galoisPerm(AR.n, AR.a), E.labelsMu(AR.n))}; the geometric loop as ${cyc(E.rotation(AR.n), E.labelsMu(AR.n))}. Conjugating, σ⁻¹γσ = γ${E.sup(AR.a)}: ${E.conjugationCheck(AR.n, AR.a) ? '<span class="check-ok">checked</span>' : '<span class="check-bad">fails</span>'}. The cyclotomic character χ : G_ℚ → ℤ̂^× reads χ(σ) = ${AR.a} mod ${AR.n}${divs.length ? `, compatibly ${divs.map((d) => `${E.reduceUnit(AR.a, AR.n, d)} mod ${d}`).join(", ")}` : ""}.</p>`;
}

/* ---- profinite ---- */
const PROF = { sel: 6 };
function renderProfinite() {
  const n = PROF.sel, perm = E.rotation(n);
  const cover = coverSheets({ perm, s: 0, w: 300, h: 300, labels: E.labelsMu(n) }) || monoGraph({ n, gens: [{ perm, name: "γ", color: "var(--ga)" }] });
  $("prof-fig").innerHTML = `<div class="grid2"><div>${profiniteFig(n)}</div><div><h3 class="small">ℤ/${n}: z ↦ z${E.sup(n)}</h3>${cover}<p class="small">⋯ → ℤ/12 → ℤ/6 → ℤ/3 and ⋯ → ℤ/4 → ℤ/2: reduction maps, one for each factorisation of covers. ℤ̂ = lim ℤ/n remembers all of them at once.</p></div></div>`;
  const x = Math.trunc(Number($("prof-x").value) || 0);
  $("prof-images").textContent = `images: ${[2, 3, 4, 6, 12].map((m) => `${x} mod ${m} = ${E.mod(x, m)}`).join(", ")} (compatible under every reduction)`;
}

/* ---- dessin ---- */
function renderDessin() {
  const m = cheb(), D = E.dessin(m.g0, m.g1);
  $("dessin-fig").innerHTML = dessinFig();
  $("dessin-read").innerHTML = `<dl class="readout"><dt>σ₀ (over 0)</dt><dd>${cyc(m.g0)}: black vertices of valency ${D.black.map((c) => c.length).join(", ")}</dd><dt>σ₁ (over 1)</dt><dd>${cyc(m.g1)}: white vertices of valency ${D.white.map((c) => c.length).join(", ")}</dd><dt>σ∞ = (σ₀σ₁)⁻¹</dt><dd>${cyc(D.sinf)}: ${D.faces.length} face of degree ${D.faces.map((c) => 2 * c.length).join(", ")}</dd><dt>genus</dt><dd>${D.genus} (Riemann–Hurwitz)</dd></dl><p class="small">The permutations were lifted numerically along loops round 0 and 1. A full theory of dessins is beyond this page.</p>`;
}

/* ---- puzzles ---- */
const PZ = { choice: null, n: 4, s: 0, stacked: false, tors: "", tors3: null, gamma: null, rank: "" };
function renderPuzzles() {
  const mini = (k) => k === "pow" ? coverSheets({ perm: E.rotation(3), s: 0, w: 200, h: 170, showFibre: false }) : svg(200, 120, circ(100, 60, 40, "sv-faint") + circ(k === "quad" ? 80 : 120, 60, 7, "sv-red") + txt(10, 112, k === "quad" ? "branches over −1/4" : "sends ±i to 0", "sv-small ui-t", 'style="fill:var(--bad)"'), "A ramified map");
  const choices = [["pow", "z ↦ zⁿ"], ["quad", "z ↦ z² + z"], ["inv", "z ↦ z + 1/z"]];
  const verdict = { pow: ["✓ finite étale over 𝔾ₘ", "check-ok"], quad: ["✗ critical point −1/2 lies over −1/4 ∈ 𝔾ₘ, and −1 ↦ 0", "check-bad"], inv: ["✗ ±i ↦ 0 leaves 𝔾ₘ; ramified at ±1", "check-bad"] };
  const L = E.rotation(PZ.n), loopDone = PZ.s >= 0.999;
  let html = `<div class="puzzle"><h3>1 · X = ℙ¹ − {0, ∞}</h3><div class="grid2"><div>${sphereFig({ w: 260, h: 220, R: 85, e: 0.12, points: [{ P: [0, 0, 1], kind: "puncture", label: "∞" }, { P: sph(0, -78), kind: "puncture", label: "0" }] })}</div><div><p>Which map gives a finite étale cover of X?</p><div class="choices">${choices.map(([k, l]) => `<button type="button" class="choice" data-pz1="${k}" aria-pressed="${PZ.choice === k}">${mini(k)}${esc(l)}${PZ.choice === k ? `<span class="verdict ${verdict[k][1]}">${esc(verdict[k][0])}</span>` : ""}</button>`).join("")}</div></div></div>`;
  if (PZ.choice === "pow") {
    html += `<div class="bar"><label class="ctl">n <input type="range" id="pz-n" min="2" max="8" value="${PZ.n}" aria-label="n"><output>${PZ.n}</output></label><label class="ctl">Drag the loop <input type="range" id="pz-s" min="0" max="1000" value="${Math.round(PZ.s * 1000)}" aria-label="Loop position"></label></div><p>What happens to the fibre after one loop? Drag x̄ all the way round.</p><div class="grid2"><div>${coverSheets({ perm: L, s: PZ.s, w: 300, h: 300 })}</div><div>${loopDone ? `<div class="reveal"><p>The ${PZ.n} sheets are cycled: ${cyc(L)}. The loop generates <strong>ℤ/${PZ.n}</strong>.</p>${PZ.stacked ? `<p>Every n at once, compatibly: <strong>ℤ̂ = lim ℤ/n</strong>, the étale fundamental group of 𝔾ₘ.</p>${profiniteFig(PZ.n % 12 === 0 || 12 % PZ.n === 0 ? PZ.n : 12)}` : '<button type="button" class="btn" id="pz-stack">Stack all n</button>'}</div>` : '<p class="muted">Keep going: the answer appears once the loop closes.</p>'}</div></div>`;
  }
  html += "</div>";
  const a = E.parseCycles("(1 2)", 3), b = E.parseCycles("(2 3)", 3), ginf = E.inverse(E.compose(a, b));
  const opts = ["(1 2 3)", "(1 3 2)", "(1 3)"];
  html += `<div class="puzzle"><h3>2 · Pair of pants</h3><div class="grid2"><div>${pantsFig({})}</div><div><p>A 3-sheeted cover has a ↦ (1 2), b ↦ (2 3). Where must γ∞ go, given γ₀γ₁γ∞ = 1?</p><div class="choices">${opts.map((o) => `<button type="button" class="choice" data-pz2="${o}" aria-pressed="${PZ.gamma === o}">${o}${PZ.gamma === o ? `<span class="verdict ${E.equal(E.parseCycles(o, 3), ginf) ? "check-ok" : "check-bad"}">${E.equal(E.parseCycles(o, 3), ginf) ? "✓ (ab)⁻¹" : "✗ try (ab)⁻¹"}</span>` : ""}</button>`).join("")}</div>${PZ.gamma ? monoGraph({ n: 3, gens: [{ perm: a, name: "a", color: "var(--ga)" }, { perm: b, name: "b", color: "var(--gb)" }], w: 240, h: 220 }) : ""}</div></div></div>`;
  html += `<div class="puzzle"><h3>3 · Torsion</h3><p>How many points does E[3] have? <input type="number" id="pz-tors" value="${esc(PZ.tors)}" style="width:5rem" aria-label="Number of points"> <button type="button" class="btn" id="pz-tors-go">Check</button></p>${PZ.tors3 != null ? `<div class="reveal">${PZ.tors3 ? "✓" : "✗"} E[3] ≅ (ℤ/3)²: ${E.torsionCount(3)} points.${latticeFig(3)}</div>` : ""}</div>`;
  html += `<div class="puzzle"><h3>4 · Punctures add generators</h3><p>A torus with two punctures (g = 1, r = 2): what is the rank of its free fundamental group? <input type="number" id="pz-rank" value="${esc(PZ.rank)}" style="width:5rem" aria-label="Rank"> <button type="button" class="btn" id="pz-rank-go">Check</button></p>${PZ.rankOk != null ? `<div class="reveal">${PZ.rankOk ? "✓" : "✗"} 2g + r − 1 = ${E.surface(1, 2).rank}.${surfaceFig(1, 2, { probe: false })}</div>` : ""}</div>`;
  $("puzzle-list").innerHTML = html;
}

/* ---- summary ---- */
const SUMS = [
  { name: "ℙ¹", what: "sphere, no holes", top: "1", et: "1", fig: () => sphereFig({ w: 300, h: 260 }) },
  { name: "𝔸¹", what: "remove one point: the plane", top: "1", et: "1 in char 0", fig: () => stereoFig(1, { removeInf: 1, ray: false }) },
  { name: "𝔾ₘ", what: "remove two points: a cylinder", top: "ℤ", et: "ℤ̂", fig: () => cylinderFig({}) },
  { name: "ℙ¹ − {0,1,∞}", what: "remove three points: a pair of pants", top: "F₂", et: "F̂₂", fig: () => pantsFig({}) },
  { name: "E", what: "add a handle: a torus", top: "ℤ²", et: "ℤ̂²", fig: () => torusFig({ stage: 2 }) },
  { name: "genus 2", what: "add more handles", top: "surface group", et: "its profinite completion", fig: () => surfaceFig(2, 0, { probe: false }) },
  { name: "the family", what: "sphere ↓ add punctures: free groups ↓ add handles: surface groups ↓ finite covers: profinite groups", top: "", et: "", fig: () => surfaceFig(2, 3, { probe: false }) },
];
const SUM = { i: 0 };
function renderSummary() {
  const st = SUMS[SUM.i];
  $("sum-fig").innerHTML = st.fig();
  $("sum-read").innerHTML = `<h3>${esc(st.name)}</h3><p>${esc(st.what)}</p>${st.top ? `<p class="boxed">π₁ = ${esc(st.top)}</p> <p class="boxed">π₁ᵉᵗ = ${esc(st.et)}</p>` : '<ol class="chain"><li>sphere</li><li>add punctures → free groups</li><li>add handles → surface groups</li><li>finite covers → profinite groups</li></ol>'}`;
  $("sum-s").value = String(SUM.i);
  $("synth-fig").innerHTML = [
    ["GEOMETRY", planeFig({ w: 260, h: 200, points: [{ z: [0, 0], kind: "puncture" }], loops: [{ z: [0, 0], r: 1.2, cls: "loop-a", name: "g", label: "loop" }], probe: [1.2, 0], label: "X with a loop" })],
    ["COVER", coverSheets({ perm: [1, 2, 0], s: 0.6, w: 260, h: 240, label: "Y over X" })],
    ["FIBRE", fibreFig({ n: 3, perm: [1, 2, 0], w: 240, h: 200, title: "● ● ●  permuted" })],
  ].map(([t, f]) => `<div class="card"><h3 class="small">${t}</h3>${f}</div>`).join("");
}

/* ---- results: what the page recomputes on load ---- */
function runChecks() {
  const ok = {};
  ok["spec-c"] = [1, 2, 3, 4, 5].every((n) => E.croots([E.C(-1), ...Array(n - 1).fill(E.C(0)), E.C(1)]).length === n);
  ok["spec-r"] = E.equal(E.specR().conj, [1, 0]);
  ok["spec-fq"] = [1, 2, 3, 4, 5, 6].every((n) => { const N = E.frobeniusNecklace(2, n); return N.closes && N.distinct === n; });
  ok.p1 = [2, 3, 4, 5].every((d) => E.hurwitzGenus(0, d) < 0);
  ok.a1 = E.kummer(3).fibre(E.C(1e-12)).every((z) => E.cabs(z) < 1e-3);
  ok.gm = [2, 3, 4, 5, 6].every((n) => { const p = kummerPerm(n); return E.cycles(p).length === 1 && E.cycles(p)[0].length === n; });
  const m = cheb(), ra = E.regularAction(S3GENS(), 3);
  ok["p1-3"] = E.equal(m.relation, E.identity(3)) && ra.size === 6 && E.isTransitive(ra.gens, 6);
  ok["genus-g"] = [1, 2, 3, 4].every((g) => { const P = E.polygon(g); return P.V === 1 && P.chi === 2 - 2 * g; });
  ok["punctured-g"] = [[0, 3], [1, 1], [2, 3], [4, 6]].every(([g, r]) => { const Sx = E.surface(g, r); return Sx.rank === 2 * g + r - 1 && Sx.rank === 1 - Sx.chi; });
  ok.elliptic = [1, 2, 3, 4, 5].every((n) => E.torsion(n).length === n * n && E.torsion(n).every((p) => { const z = E.cscale(p.z, n), c = E.lattCoords(z, TAU_LAT); return Math.min(c[0], 1 - c[0]) < 1e-9 && Math.min(c[1], 1 - c[1]) < 1e-9; }));
  ok.abelian = E.torsionCount(2, 2) === 16 && E.torsionCount(3, 3) === 729;
  ok["a1-p"] = [2, 3, 5, 7].every((p) => { const A = E.artinSchreier(p, 1); return A.frobIsTranslation && A.derivative[0] === p - 1; });
  const ord = E.ellipticModP(-1, 0, 13), ss = E.ellipticModP(-1, 0, 7);
  ok.ordinary = !ord.supersingular && ord.tateP === 1 && ord.hasse === E.mod(ord.ap, 13);
  ok.supersingular = ss.supersingular && ss.tateP === 0 && ss.hasse === E.mod(ss.ap, 7);
  for (const [k, v] of Object.entries(ok)) { const el = $(`chk-${k}`); if (el) { el.textContent = v ? "✓" : "✗"; el.className = `chk ${v ? "check-ok" : "check-bad"}`; } }
  return ok;
}
