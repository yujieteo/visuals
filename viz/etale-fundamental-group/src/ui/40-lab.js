
/* ================= the laboratory ================= */
const S = {
  obj: "gm", view: "all", s: 0, hl: null,
  n: 3, arN: 8, arMode: "loop", q: 2, nq: 3, g: 2, r: 3, p: 3, tpos: 0.33, shift: 0, a: 3, dim: 2, ab: 2, ellCurve: "-1,0", ellP: 7,
  gmModel: "cylinder", p1Model: "sphere", pantsModel: "pants", ellModel: "torus",
  stage: 0, morph: null, merge: 0, relStage: 0, compact: 0, ram: false, rho: 1, removed: false,
  cover3: "s3", gen: "a", gview: "auto", y0: 200, y1: 200, specN: 3, attempt: 3, done: new Set(),
};
const LAB_ORDER = ["spec-c", "spec-r", "spec-fq", "a1", "p1", "gm", "p1-3", "curve", "elliptic", "abelian", "a1-p", "ell-p", "arith"];
const LAB_LABEL = { "spec-c": "Spec(ℂ)", "spec-r": "Spec(ℝ)", "spec-fq": "Spec(𝔽_q)", a1: "𝔸¹", p1: "ℙ¹", gm: "𝔾ₘ", "p1-3": "ℙ¹ − {0,1,∞}", curve: "genus-g curve", elliptic: "elliptic curve", abelian: "abelian variety", "a1-p": "𝔸¹ in char p", "ell-p": "elliptic curve mod p", arith: "𝔾ₘ/ℚ arithmetic" };
const STEPS = ["Draw X", "Draw finite covers", "Select fibre", "Animate monodromy", "Read finite quotients", "Assemble profinite group"];
const S3GENS = () => [E.parseCycles("(1 2)", 3), E.parseCycles("(1 2 3)", 3)];
let chebCache = null;
const cheb = () => (chebCache ??= E.chebyshevMonodromy());
const kummerCache = new Map();
const kummerPerm = (n) => { if (!kummerCache.has(n)) kummerCache.set(n, E.kummerMonodromy(n).perm); return kummerCache.get(n); };

/* The finite cover of the pair of pants currently selected, with generator images a, b. */
function pantsCover() {
  if (S.cover3 === "cheb") { const m = cheb(); return { a: m.g0, b: m.g1, n: 3, name: "Chebyshev cover x ↦ (1 − T₃(x))/2, degree 3 (lifted numerically)", labels: ["x₁", "x₂", "x₃"], names: ["x₁", "x₂", "x₃"] }; }
  const ra = E.regularAction(S3GENS(), 3);
  return { a: ra.gens[0], b: ra.gens[1], n: 6, name: "Galois S₃ cover: a ↦ (12), b ↦ (123), fibre = S₃", labels: null, names: ra.elements.map((g, i) => `${i + 1} = ${E.cycleString(g).replace("id", "e")}`) };
}
/* A finite quotient of the genus-g, r-punctured surface group, with the relation checked by evaluation. */
function curveCover(g, r) {
  const imgs = {}, n = 3, id = E.identity(3), A = E.parseCycles("(1 2 3)", 3), B = E.parseCycles("(1 2)", 3);
  const Sx = E.surface(g, r);
  for (const x of Sx.gens) imgs[x] = id;
  if (g >= 1) { imgs.a1 = A; imgs.b1 = r > 0 || g >= 2 ? B : E.inverse(A); }
  if (g >= 2) { imgs.a2 = imgs.b1; imgs.b2 = imgs.a1; }
  if (g === 0 && r >= 2) { imgs.c1 = B; if (r >= 3) imgs.c2 = A; }
  if (r > 0) { const head = Sx.relation.slice(0, -1); imgs[`c${r}`] = E.inverse(E.evalWord(head, imgs, n)); }
  const rel = E.evalWord(Sx.relation, imgs, n), gens = Sx.gens.map((x) => imgs[x]);
  return { imgs, n, rel, relOk: E.equal(rel, id), transitive: gens.length ? E.isTransitive(gens, n) : false, order: E.generate(gens.length ? gens : [id], n).length };
}

/* The permutation the "animate monodromy" loop applies in the current view. */
function currentLoop() {
  switch (S.obj) {
    case "gm": return { perm: kummerPerm(S.n), labels: E.labelsMu(S.n), name: "γ (once round 0)" };
    case "p1-3": { const C3 = pantsCover(), p = S.gen === "a" ? C3.a : S.gen === "b" ? C3.b : E.inverse(E.compose(C3.a, C3.b)); return { perm: p, labels: C3.labels, name: S.gen === "a" ? "a = γ₀" : S.gen === "b" ? "b = γ₁" : "γ∞ = (ab)⁻¹" }; }
    case "spec-r": return { perm: [1, 0], labels: ["i", "−i"], name: "complex conjugation" };
    case "spec-fq": { const N = E.frobeniusNecklace(S.q, S.nq); return { perm: N.perm, labels: N.labels, name: "Frobenius x ↦ x^q" }; }
    case "elliptic": { const n = S.n, perm = E.identity(n * n).map((k) => ((Math.floor(k / n) + 1) % n) * n + (k % n)); return { perm, labels: null, name: "the loop a (translation by 1/n)" }; }
    case "a1-p": return { perm: E.rotation(S.p), labels: E.identity(S.p).map((a) => (a ? `y+${a}` : "y")), name: "deck y ↦ y + 1" };
    case "arith": return { perm: S.arMode === "gal" ? E.galoisPerm(S.arN, S.a) : E.rotation(S.arN), labels: E.labelsMu(S.arN), name: S.arMode === "gal" ? `Galois σ${E.sub(S.a)}` : "geometric loop γ" };
    case "curve": { const cc = curveCover(S.g, S.r), x = S.g >= 1 ? "a1" : S.r >= 1 ? "c1" : null; return { perm: x ? cc.imgs[x] : [0], labels: null, name: x ? `${x[0]}${E.sub(x.slice(1))}` : "no loops" }; }
    default: return { perm: [0], labels: null, name: "every loop" };
  }
}

/* ---------- per-object views ---------- */
function groupHTML(rows, extra = "") {
  return `<dl class="readout">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join("")}</dl>${extra}`;
}
const cyc = (p, labels) => `<span class="math">${esc(E.cycleString(p, labels && labels.some((l) => /\s/.test(l)) ? null : labels))}</span>`;
function liveCycle(L) {
  if (S.s >= 0.999) return `${cyc(L.perm, L.labels)} <span class="check-ok">loop closed</span>`;
  if (S.s <= 0) return "start the loop to see the fibre permute";
  return `<span class="muted">x̄ is ${Math.round(S.s * 100)}% of the way round; the lifts have not closed up yet</span>`;
}
function profChain(n) {
  const levels = [2, 3, 4, 5, 6, 8, 12].filter((k) => k !== n);
  return `<p class="small">Quotients: ${[...new Set([...levels, n])].sort((a, b) => a - b).map((k) => (k === n ? `<strong>ℤ/${k}</strong>` : `ℤ/${k}`)).join(" · ")} · … → <strong>ℤ̂ = lim ℤ/n</strong></p>`;
}

const VIEWS = {
  "spec-c"() {
    const n = S.specN;
    return {
      geometry: { kind: "schematic", svg: specCFig(1), cap: "Spec ℂ is one point. It has no topology to wrap anything round." },
      cover: { kind: "schematic", svg: specCFig(n), cap: `Try a degree-${n} cover: ℂ[x]/(f) splits into ${n} copies of ℂ, because every polynomial over ℂ has all its roots. ${n > 1 ? "The cover falls apart into points." : ""}` },
      fibre: { svg: fibreFig({ n, labels: E.identity(n).map((i) => `root ${i + 1}`), hl: S.hl }), cap: `The fibre has ${n} points, and nothing can move them.` },
      group: { html: groupHTML([["connected covers", "Spec ℂ only"], ["G_ℂ = Gal(ℂ/ℂ)", "1"], ["π₁ᵉᵗ(Spec ℂ)", "<strong>1</strong>"]]) },
      controls: `<label class="ctl">try degree <input type="range" data-ctl="specN" min="1" max="6" value="${n}" aria-label="Degree"><output>${n}</output></label>`,
      steps: ["Spec ℂ: a single algebraic point.", `Finite étale ℂ-algebras are ℂⁿ: ${n} disjoint points.`, "Fibre: the n points themselves.", "There are no loops to move them.", "Only the trivial group appears.", "π₁ᵉᵗ(Spec ℂ) = 1."],
    };
  },
  "spec-r"() {
    const L = currentLoop();
    return {
      geometry: { kind: "schematic", svg: svg(300, 200, circ(150, 120, 9, "", 'style="fill:var(--alg)"') + txt(166, 126, "Spec ℝ", "sv-label") + txt(150, 40, "one point, but not geometric", "sv-small ui-t", 'text-anchor="middle"'), "Spec R: a single point"), cap: "Spec ℝ is a single point, but ℝ is not algebraically closed." },
      cover: { kind: "schematic", svg: specRFig(S.s, { hl: S.hl }), cap: "Spec ℂ → Spec ℝ: above the real point sit the two complex embeddings, z and z̄." },
      fibre: { svg: fibreFig({ n: 2, labels: ["i", "−i"], perm: S.s >= 0.999 ? [1, 0] : null, hl: S.hl }), cap: "The fibre is the two roots of x² + 1." },
      group: { html: groupHTML([["Galois element", "complex conjugation"], ["action on fibre", liveCycle(L)], ["G_ℝ = Gal(ℂ/ℝ)", "C₂"], ["π₁ᵉᵗ(Spec ℝ)", "<strong>C₂</strong>"]]) },
      steps: ["Spec ℝ: one point.", "The only nontrivial connected finite étale cover is Spec ℂ.", "Its geometric fibre: the embeddings i and −i.", "Conjugation swaps them.", "Read off C₂.", "π₁ᵉᵗ(Spec ℝ) = Gal(ℂ/ℝ) ≅ C₂."],
    };
  },
  "spec-fq"() {
    const N = E.frobeniusNecklace(S.q, S.nq), L = currentLoop();
    return {
      geometry: { kind: "schematic", svg: svg(300, 200, circ(150, 120, 9, "", 'style="fill:var(--alg)"') + txt(166, 126, `Spec 𝔽${E.sub(S.q)}`, "sv-label"), "Spec F_q: a single point"), cap: `Spec 𝔽${E.sub(S.q)}: one point, with a cover of every degree.` },
      cover: { kind: "schematic", svg: towerFig(S.q, 6, S.nq, S.s, N.labels, { hl: S.hl }), cap: `The tower 𝔽${E.sub(S.q)} ⊂ 𝔽${E.sub(S.q)}² ⊂ ⋯. At level n, a necklace of n embeddings; Frobenius rotates it one bead.` },
      fibre: { svg: fibreFig({ n: S.nq, labels: N.labels, layout: "circle", perm: S.s >= 0.999 ? N.perm : null, hl: S.hl, title: `𝔽${E.sub(S.q)}${E.sup(S.nq)} = 𝔽${E.sub(S.q)}[α]/(${N.fString.replace(/x/g, "α")})` }), cap: `The beads are the conjugates α, α^q, …: the Frobenius orbit of α, which closes after exactly ${S.nq} steps (${N.closes && N.distinct === S.nq ? "checked" : "check failed"}).` },
      group: { html: groupHTML([["Frobenius on the fibre", liveCycle(L)], [`Gal(𝔽${E.sub(S.q)}${E.sup(S.nq)}/𝔽${E.sub(S.q)})`, `ℤ/${S.nq}`], ["π₁ᵉᵗ(Spec 𝔽_q)", "<strong>ℤ̂</strong>, topologically generated by Frobenius"]], profChain(S.nq)) },
      controls: `<label class="ctl">q <select data-ctl="q" aria-label="q">${[2, 3, 5].map((v) => `<option ${v === S.q ? "selected" : ""}>${v}</option>`).join("")}</select></label><label class="ctl">degree n <input type="range" data-ctl="nq" min="1" max="6" value="${S.nq}" aria-label="Degree"><output>${S.nq}</output></label>`,
      steps: [`Spec 𝔽${E.sub(S.q)}: one point.`, `For each n, Spec 𝔽${E.sub(S.q)}${E.sup(S.nq)} is a connected cover of degree n.`, `Its geometric fibre: the ${S.nq} embeddings into 𝔽̄${E.sub(S.q)}, i.e. the conjugates of α.`, "Frobenius x ↦ x^q rotates the necklace.", `Read off ℤ/${S.nq}.`, "All levels together: ℤ̂, with Frobenius as topological generator."],
    };
  },
  p1() {
    const n = S.attempt;
    return {
      geometry: { kind: "literal", svg: S.morph != null ? stereoFig(S.morph) : S.p1Model === "plane" ? stereoFig(0) : sphereFig({ points: [{ P: [0, 0, 1], kind: "point", label: "∞" }, { P: sph(0, -70), kind: "point", label: "0" }, { P: sph(35, 5), kind: "point", label: "1" }], label: "The Riemann sphere" }), cap: "ℙ¹(ℂ) ≅ S²: the complex plane plus one point ∞ at the north pole, via stereographic projection." },
      cover: { kind: "literal", svg: forcedBranchFig(n), cap: `Try to put a connected unramified degree-${n} cover over the sphere: every loop on the sphere shrinks to a point, so the sheets cannot be connected unless they meet. They are forced to branch (red).` },
      fibre: { svg: fibreFig({ n, labels: E.identity(n).map((i) => `sheet ${i + 1}`), hl: S.hl }), cap: "Over an unramified cover every loop would act trivially: no permutation, so no connection between sheets." },
      group: { html: groupHTML([["Riemann–Hurwitz", `2g(Y) − 2 = ${n}·(−2) ⇒ g(Y) = ${E.hurwitzGenus(0, n)} < 0`], ["conclusion", "no connected unramified cover of degree > 1"], ["π₁ᵉᵗ(ℙ¹)", "<strong>1</strong> (alg. closed, char 0)"]]) },
      controls: `<span class="seg" role="group" aria-label="Model"><button type="button" data-ctl="p1Model" data-v="sphere" aria-pressed="${S.p1Model === "sphere"}">sphere</button><button type="button" data-ctl="p1Model" data-v="plane" aria-pressed="${S.p1Model === "plane"}">complex plane + ∞</button></span><button type="button" class="btn" data-act="stereo">Stereographic projection</button><label class="ctl">try degree <input type="range" data-ctl="attempt" min="2" max="5" value="${n}" aria-label="Degree"><output>${n}</output></label>`,
      steps: ["ℙ¹(ℂ) is the sphere S².", `Attempt a connected degree-${n} cover with no branching.`, "Over any point, n sheets.", "Every loop contracts, so monodromy is trivial: the sheets stay separate.", "Only the trivial quotient.", "π₁ᵉᵗ(ℙ¹) = 1."],
    };
  },
  a1() {
    const st = S.stage;
    const geo = st < 0.34 ? stereoFig(1, { removeInf: clamp(st / 0.3, 0, 1), ray: false, label: "The sphere with infinity removed" })
      : st < 0.67 ? stereoFig(1 - (st - 0.34) / 0.33, { removeInf: 1, ray: false, label: "The punctured sphere unwrapping into the plane" })
        : planeFig({ k: 1 - 0.85 * (st - 0.67) / 0.33, points: [{ z: [0, 0], kind: "point", label: "0" }], caption: "the plane contracts to a point", label: "The affine line contracting to a point" });
    return {
      geometry: { kind: "literal", svg: geo, cap: "Remove ∞ from the sphere and it unwraps into the plane 𝔸¹(ℂ) = ℂ, which contracts to a point." },
      cover: { kind: "literal", svg: ramFig(S.n, 0.06, false), cap: `The obvious candidate z ↦ z${E.sup(S.n)} is not étale over 𝔸¹: its ${S.n} sheets collide over 0.` },
      fibre: { svg: fibreFig({ n: 1, labels: ["the only point"], hl: S.hl }), cap: "A connected finite étale cover of 𝔸¹ in characteristic 0 has one sheet." },
      group: { html: groupHTML([["π₁(ℂ)", "1 (contractible)"], ["π₁ᵉᵗ(𝔸¹)", "<strong>1</strong> (alg. closed, char 0)"]], `<button type="button" class="btn" data-act="to-charp">Switch to characteristic p</button>`) },
      controls: `<label class="ctl">remove ∞ → unwrap → contract <input type="range" data-ctl="stage" min="0" max="1000" value="${Math.round(st * 1000)}" aria-label="Stage"></label><button type="button" class="btn" data-act="a1-play">Play</button>`,
      steps: ["Start from the sphere and delete ∞.", "Any cover would extend over ∞; z ↦ zⁿ is the candidate.", "It collides over 0: not étale.", "The plane contracts, so every loop is trivial.", "Only 1.", "π₁ᵉᵗ(𝔸¹) = 1 in characteristic 0."],
    };
  },
  gm() {
    const n = S.n, L = currentLoop(), perm = L.perm, f = S.compact;
    let geo;
    if (S.ram) geo = sphereFig({ points: [{ P: [0, 0, 1], kind: S.removed ? "puncture" : "branch", label: "∞" }, { P: sph(0, -62), kind: S.removed ? "puncture" : "branch", label: "0" }], loops: [], label: "z to the n on P1, with branch points 0 and infinity" });
    else if (S.gmModel === "cylinder") geo = cylinderFig({ s: S.s });
    else if (S.gmModel === "plane") geo = planeFig({ points: [{ z: [0, 0], kind: "puncture", label: "0", fill: f }], loops: [{ z: [0, 0], r: 1, cls: "loop-a", name: "g", label: "γ" }], probe: [Math.cos(TAU * S.s), Math.sin(TAU * S.s)], caption: "∞ is the missing point at the rim", label: "The punctured plane" });
    else geo = sphereFig({ e: 0.12, points: [{ P: [0, 0, 1], kind: "puncture", label: "∞", fill: f }, { P: sph(0, -78), kind: "puncture", label: "0", fill: f }], loops: [{ P: [0, 0, 1], beta: Math.PI / 2, cls: "loop-a", name: "g", label: "γ" }], label: "The twice-punctured sphere" });
    const sheets = coverSheets({ perm, s: S.s, labels: L.labels, hl: S.hl, baseLabel: "𝔾ₘ", coverLabel: "𝔾ₘ" });
    return {
      geometry: { kind: "literal", svg: geo, cap: S.ram ? (S.removed ? "0 and ∞ removed: what remains is 𝔾ₘ." : "On ℙ¹ the map z ↦ zⁿ branches over 0 and ∞ (red).") : "𝔾ₘ = ℙ¹ − {0, ∞}: a twice-punctured sphere, the punctured plane ℂ×, or a cylinder. One loop γ goes round." },
      cover: { kind: sheets ? "literal" : "schematic", svg: S.ram ? ramFig(n, S.rho, S.removed) : sheets || monoGraph({ n, gens: [{ perm, name: "γ", color: "var(--ga)" }], labels: L.labels, hl: S.hl }), cap: S.ram ? (S.removed ? "FINITE ÉTALE: away from 0 and ∞ the n sheets never meet." : `RAMIFIED: as t → 0 the ${n} preimages collide.`) : sheets ? `z ↦ z${E.sup(n)}: the source cylinder winds ${n} times round the target. Lifts cross from sheet to sheet at the seam.` : `${n} sheets are too many to draw honestly: the monodromy graph shows the same cover exactly.` },
      fibre: { svg: rootsFig(n, { s: S.s, hl: S.hl, caption: `fibre of x${E.sup(n)} = t at t = exp(2πi·${n1(S.s)})` }), cap: `Kummer view: the fibre over t = 1 is μ${E.sub(n)}, the roots of x${E.sup(n)} = 1. As t goes once round, each root turns by 1/${n} of a circle: the deck rotation by ζ.` },
      group: { html: groupHTML([["ρ : π₁(𝔾ₘ, 1) = ℤ → S" + E.sub(n), `γ ↦ ${liveCycle(L)}`], ["image", `ℤ/${n} ≅ μ${E.sub(n)} (deck group)`], ["ℤ → ℤ/" + n, "1 ↦ the rotation ζ"], ["π₁ᵉᵗ(𝔾ₘ)", "<strong>ℤ̂</strong> (alg. closed, char 0)"]], profChain(n)) },
      controls: `<label class="ctl">n <input type="range" data-ctl="n" min="2" max="12" value="${n}" aria-label="Degree n"><output>${n}</output></label><span class="seg" role="group" aria-label="Model">${["cylinder", "plane", "sphere"].map((m) => `<button type="button" data-ctl="gmModel" data-v="${m}" aria-pressed="${S.gmModel === m && !S.ram}">${m === "plane" ? "punctured plane" : m === "sphere" ? "punctured sphere" : "cylinder"}</button>`).join("")}</span><button type="button" class="btn" data-act="ram" aria-pressed="${S.ram}">Ramification on ℙ¹</button>${S.ram ? `<label class="ctl">|t| <input type="range" data-ctl="rho" min="0" max="1000" value="${Math.round(S.rho * 1000)}" aria-label="Distance of t from 0"></label><button type="button" class="btn" data-act="remove" aria-pressed="${S.removed}">Remove 0, ∞</button>` : ""}${S.gmModel !== "cylinder" && !S.ram ? `<button type="button" class="btn" data-act="compactify" aria-pressed="${f > 0}">Compactify</button>` : ""}`,
      steps: ["𝔾ₘ: sphere minus 0 and ∞, or a cylinder.", `z ↦ z${E.sup(n)}: ${n} sheets, the source cylinder winding ${n} times.`, `Fibre over 1: μ${E.sub(n)}, ${n} points.`, `One loop: ${E.cycleString(perm)}.`, `ℤ → ℤ/${n}.`, "Every connected finite cover is one of these: lim ℤ/n = ℤ̂."],
    };
  },
  "p1-3"() {
    const C3 = pantsCover(), L = currentLoop(), gens = [{ perm: C3.a, name: "a = γ₀", color: "var(--ga)" }, { perm: C3.b, name: "b = γ₁", color: "var(--gb)" }];
    let geo;
    if (S.pantsModel === "pants") geo = pantsFig({ stage: S.relStage, merge: S.merge, y0: S.y0, y1: S.y1, hl: S.gen === "a" ? "g0" : S.gen === "b" ? "g1" : "ginf" });
    else if (S.pantsModel === "sphere") geo = sphereFig({ az: 0.2, e: 0.22, points: [{ P: sph(-40, -10), kind: "puncture", label: "0", fill: S.compact }, { P: sph(40, -10), kind: "puncture", label: "1", fill: S.compact }, { P: sph(0, 62), kind: "puncture", label: "∞", fill: S.compact }], loops: [{ P: sph(-40, -10), beta: 0.36, cls: "loop-a", name: "g0", hl: S.gen === "a" }, { P: sph(40, -10), beta: 0.36, cls: "loop-b", name: "g1", hl: S.gen === "b" }, { P: sph(0, 62), beta: 0.36, cls: "loop-c", name: "ginf", hl: S.gen === "ab" }], label: "The sphere with three punctures" });
    else geo = planeFig({ points: [{ z: [-0.9, 0], kind: "puncture", label: "0", fill: S.compact }, { z: [0.9, 0], kind: "puncture", label: "1", fill: S.compact }], loops: [{ z: [-0.9, 0], r: 0.6, cls: "loop-a", name: "g0", label: "γ₀", hl: S.gen === "a" }, { z: [0.9, 0], r: 0.6, cls: "loop-b", name: "g1", label: "γ₁", hl: S.gen === "b" }], caption: "ℂ − {0, 1}; ∞ is at the rim", label: "The plane minus 0 and 1" });
    const graph = S.gview === "graph" || (S.gview === "auto" && C3.n > 3);
    const sheets = graph ? null : coverSheets({ perm: L.perm, s: S.s, labels: C3.labels, hl: S.hl, baseLabel: L.name.split(" ")[0], coverLabel: "Y" });
    const G = E.generate([C3.a, C3.b], C3.n), deck = E.centralizer([C3.a, C3.b], C3.n);
    const rel = E.compose(C3.a, C3.b, E.inverse(E.compose(C3.a, C3.b)));
    const m = cheb();
    return {
      geometry: { kind: S.pantsModel === "pants" ? "analogy" : "literal", svg: geo, cap: S.pantsModel === "pants" ? "Deform the thrice-punctured sphere: a pair of pants with cuffs at 0, 1 and ∞. Drag γ₀ and γ₁ along the legs; click a loop to follow it." : "ℙ¹ − {0, 1, ∞} drawn literally." },
      cover: { kind: graph ? "schematic" : "literal", svg: sheets || monoGraph({ n: C3.n, gens, labels: C3.labels, hl: S.hl }), cap: graph ? `Monodromy (Schreier) graph: ${C3.n} fibre points, an edge i → a(i) and i → b(i). ${E.isTransitive([C3.a, C3.b], C3.n) ? "One connected piece: the cover is connected." : ""}` : `Sheet view over the loop ${L.name}: the restriction of the cover to that loop.` },
      fibre: { svg: fibreFig({ n: C3.n, labels: C3.names, perm: S.s >= 0.999 ? L.perm : null, hl: S.hl, layout: C3.n > 3 ? "circle" : "column" }), cap: `${C3.n} points over the base point; after ${L.name} they are permuted.` },
      group: { html: groupHTML([["F₂ = ⟨a, b⟩ → S" + E.sub(C3.n), `a ↦ ${cyc(C3.a)}, b ↦ ${cyc(C3.b)}`], [L.name, liveCycle(L)], ["image (monodromy group)", `order ${G.length}${G.length === 6 ? " ≅ S₃" : ""}`], ["deck group Aut(Y/X)", `order ${deck.length} ${deck.length === C3.n ? "= degree: Galois" : "< degree: not Galois"}`], ["γ₀γ₁γ∞ (lifted numerically)", `${cyc(m.relation)} ${E.equal(m.relation, E.identity(3)) ? '<span class="check-ok">= 1</span>' : '<span class="check-bad">≠ 1</span>'}`], ["γ₀γ₁γ∞ in this cover", `${cyc(rel)} = 1`], ["π₁ᵉᵗ(ℙ¹ − {0,1,∞})", "<strong>F̂₂</strong> (alg. closed, char 0)"]]) },
      controls: `<span class="seg" role="group" aria-label="Model">${[["pants", "pair of pants"], ["sphere", "punctured sphere"], ["plane", "ℂ − {0, 1}"]].map(([m2, l]) => `<button type="button" data-ctl="pantsModel" data-v="${m2}" aria-pressed="${S.pantsModel === m2}">${l}</button>`).join("")}</span><span class="seg" role="group" aria-label="Cover">${[["s3", "S₃ Galois, 6 sheets"], ["cheb", "Chebyshev, 3 sheets"]].map(([v, l]) => `<button type="button" data-ctl="cover3" data-v="${v}" aria-pressed="${S.cover3 === v}">${l}</button>`).join("")}</span><span class="seg" role="group" aria-label="Loop">${[["a", "a = γ₀"], ["b", "b = γ₁"], ["ab", "γ∞"]].map(([v, l]) => `<button type="button" data-ctl="gen" data-v="${v}" aria-pressed="${S.gen === v}">${l}</button>`).join("")}</span><span class="seg" role="group" aria-label="Cover view">${[["graph", "graph view"], ["sheets", "sheet view"]].map(([v, l]) => `<button type="button" data-ctl="gview" data-v="${v}" aria-pressed="${(S.gview === v) || (S.gview === "auto" && (v === "graph") === (C3.n > 3))}">${l}</button>`).join("")}</span>${S.pantsModel === "pants" ? '<button type="button" class="btn" data-act="relation">Animate γ₀γ₁γ∞ = 1</button><button type="button" class="btn" data-act="eliminate">Eliminate γ∞</button>' : '<button type="button" class="btn" data-act="compactify">Compactify</button>'}`,
      steps: ["ℙ¹ − {0,1,∞}: a pair of pants.", `A finite cover: ${C3.name}.`, `Fibre: ${C3.n} points.`, `Loops a, b permute it: a ↦ ${E.cycleString(C3.a)}, b ↦ ${E.cycleString(C3.b)}.`, `F₂ ↠ a group of order ${G.length}.`, "All finite quotients of F₂ together: F̂₂."],
    };
  },
  curve() {
    const Sx = E.surface(S.g, S.r), cc = curveCover(S.g, S.r), L = currentLoop();
    const gens = Sx.gens.filter((x) => !E.equal(cc.imgs[x], E.identity(3))).slice(0, 2).map((x, k) => ({ perm: cc.imgs[x], name: x, color: k ? "var(--gb)" : "var(--ga)" }));
    return {
      geometry: { kind: "literal", svg: surfaceFig(S.g, S.r, { hl: S.hlLoop, elim: S.elim }), cap: `Genus ${S.g}: ${S.g} handle${S.g === 1 ? "" : "s"}; ${S.r} puncture${S.r === 1 ? "" : "s"} drawn as actual holes.` },
      cover: { kind: "schematic", svg: gens.length ? monoGraph({ n: 3, gens, hl: S.hl }) : fibreFig({ n: 1, labels: ["·"] }), cap: gens.length ? `A finite quotient: generators sent into S₃ with the relation checked (${cc.relOk ? "holds" : "fails"}); monodromy graph of the ${cc.transitive ? "connected " : ""}degree-3 cover.` : "No loops: the only connected finite cover is the identity." },
      fibre: { svg: fibreFig({ n: 3, perm: S.s >= 0.999 ? L.perm : null, hl: S.hl }), cap: `Three points; the loop ${L.name} permutes them.` },
      group: { html: groupHTML([["generators", Sx.gens.join(", ") || "none"], ["relation", esc(E.relationString(Sx))], ["χ = 2 − 2g − r", String(Sx.chi)], ["π₁", Sx.free ? `free of rank 2g + r − 1 = ${Sx.rank}` : S.g === 0 ? "1" : "surface group (one relator)"], ["relation in the quotient", cc.relOk ? '<span class="check-ok">evaluates to id</span>' : '<span class="check-bad">fails</span>'], ["π₁ᵉᵗ (char 0)", `<strong>${Sx.et}</strong>`]]) },
      controls: `<label class="ctl">g <input type="range" data-ctl="g" min="0" max="4" value="${S.g}" aria-label="Genus"><output>${S.g}</output></label><label class="ctl">r <input type="range" data-ctl="r" min="0" max="6" value="${S.r}" aria-label="Punctures"><output>${S.r}</output></label><a class="btn" href="#surfaces">Open the surface renderer</a>`,
      steps: [`Genus ${S.g} with ${S.r} punctures.`, "A finite quotient of the surface group, here into S₃.", "Three fibre points.", "Each generator permutes them; the relation is checked.", Sx.free ? `Eliminate c${E.sub(S.r)}: free of rank ${Sx.rank}.` : "One relator remains.", `Profinitely complete: ${Sx.et}.`],
    };
  },
  elliptic() {
    const n = S.n, L = currentLoop();
    const [a, b] = S.ellCurve.split(",").map(Number);
    const geo = S.ellModel === "cubic" ? cubicFig(a, b) : torusFig({ stage: S.ellModel === "lattice" ? 0 : 2, n: 0, probe: S.s / n, hl: "a", scale: 0.27 });
    const coverSvg = svg(320, 300, nest(torusFig({ stage: 2, n, w: 320, h: 200, caption: false, hlPt: S.hl, label: "source torus with E[n]" }), 0, 0, 320, 170) + line([160, 172], [160, 196], "sv-line") + arrowHead([160, 198], Math.PI / 2, "var(--fg)", 8) + txt(170, 190, `[${n}]`, "sv-big") + nest(torusFig({ stage: 2, n: 1, w: 320, h: 200, caption: false, label: "target torus with 0" }), 60, 200, 200, 100), `Multiplication by ${n} as a self-cover of the torus`);
    const shift = S.s;
    return {
      geometry: { kind: S.ellModel === "cubic" ? "schematic" : "literal", svg: geo, cap: S.ellModel === "cubic" ? "The real points of the cubic, plus O at infinity. Over ℂ the same curve is a torus." : "E(ℂ) ≅ ℂ/Λ: a torus with cycles a, b, so π₁ = ℤ²." },
      cover: { kind: "literal", svg: coverSvg, cap: `[${n}] : E → E has degree ${n * n}; the points over 0 are E[${n}].` },
      fibre: { svg: latticeShiftFig(n, shift), cap: `E[${n}] ≅ (ℤ/${n})²: ${n * n} points. Moving 0 once along a lifts to a translation by 1/${n}: the grid slides one column.` },
      group: { html: groupHTML([["loop a acts as", liveCycle(L)], ["deck group", `E[${n}] ≅ (ℤ/${n})², order ${n * n}`], ["π₁ top", "ℤ²"], ["π₁ᵉᵗ(E)", "<strong>ℤ̂²</strong> (alg. closed, char 0)"]]) },
      controls: `<label class="ctl">n <input type="range" data-ctl="n" min="1" max="5" value="${n}" aria-label="n"><output>${n}</output></label><span class="seg" role="group" aria-label="Model">${["cubic", "lattice", "torus"].map((m2) => `<button type="button" data-ctl="ellModel" data-v="${m2}" aria-pressed="${S.ellModel === m2}">${m2}</button>`).join("")}</span><a class="btn" href="#elliptic">Morph cubic → torus</a>`,
      steps: ["E: a cubic, a lattice quotient, a torus.", `[${n}] : E → E, degree ${n * n}.`, `Fibre over 0: E[${n}], ${n * n} points.`, "Loops a, b translate the grid.", `(ℤ/${n})².`, "lim (ℤ/n)² = ℤ̂²."],
    };
  },
  abelian() {
    return {
      geometry: { kind: "analogy", svg: abelianFig(S.dim, S.ab), cap: `A(ℂ) ≅ ℂ${E.sup(S.dim)}/Λ, a real ${2 * S.dim}-torus, drawn as a product of ${S.dim} coordinate tori (not an embedding in space).` },
      cover: { kind: "schematic", svg: abelianGridFig(S.dim, S.ab), cap: `[${S.ab}] : A → A has degree ${E.torsionCount(S.ab, S.dim)}.` },
      fibre: { svg: fibreFig({ n: Math.min(E.torsionCount(S.ab, S.dim), 16), labels: [], layout: "circle" }), cap: `The fibre over 0 is A[${S.ab}] ≅ (ℤ/${S.ab})${E.sup(2 * S.dim)}${E.torsionCount(S.ab, S.dim) > 16 ? " (first 16 points shown)" : ""}.` },
      group: { html: groupHTML([["π₁ top", `ℤ${E.sup(2 * S.dim)}`], ["finite quotients", `(ℤ/n)${E.sup(2 * S.dim)}`], ["π₁ᵉᵗ(A)", `<strong>ℤ̂${E.sup(2 * S.dim)}</strong> (char 0)`]]) },
      controls: `<label class="ctl">dimension g <input type="range" data-ctl="dim" min="1" max="3" value="${S.dim}" aria-label="Dimension"><output>${S.dim}</output></label><label class="ctl">n <input type="range" data-ctl="ab" min="2" max="3" value="${S.ab}" aria-label="n"><output>${S.ab}</output></label>`,
      steps: [`A = ℂ${E.sup(S.dim)}/Λ.`, `[${S.ab}] : A → A.`, `A[${S.ab}]: ${E.torsionCount(S.ab, S.dim)} points.`, "Lattice translations act.", `(ℤ/${S.ab})${E.sup(2 * S.dim)}.`, `ℤ̂${E.sup(2 * S.dim)}.`],
    };
  },
  "a1-p"() {
    const A = E.artinSchreier(S.p, 1), L = currentLoop();
    return {
      geometry: { kind: "schematic", svg: asChar0Fig(S.p), cap: `CHAR 0 (dimmed): the same equation over ℂ branches over ${S.p - 1} points of the plane, so it is not an étale cover of 𝔸¹(ℂ). Contractible plane, π₁ᵉᵗ = 1.` },
      cover: { kind: "schematic", svg: asFig(S.p, S.tpos, S.shift + S.s, { hl: S.hl }), cap: `CHAR ${S.p}: y${E.sup(S.p)} − y = t over the affine line. ${S.p} sheets y, y+1, …; move the probe: they never meet, because ∂/∂y = −1.` },
      fibre: { svg: fibreFig({ n: S.p, labels: L.labels, perm: S.s >= 0.999 ? L.perm : null, hl: S.hl }), cap: `Over t = 1 the fibre is the field ${A.fString} = 0, with Frobenius acting as y ↦ ${A.frobeniusString} (${A.frobIsTranslation ? "computed" : "check failed"}).` },
      group: { html: groupHTML([["deck group", `𝔽${E.sub(S.p)} acting by y ↦ y + a: ${esc(A.deckCycle)}`], ["∂/∂y(y^p − y − t)", "−1: unramified everywhere on 𝔸¹"], ["yᵖ − y − 1 irreducible over 𝔽" + E.sub(S.p), A.irreducible ? '<span class="check-ok">yes</span>' : '<span class="check-bad">no</span>'], ["π₁ᵉᵗ(𝔸¹) (char p)", `↠ ℤ/${S.p} ≠ 1, and not finitely generated; only these quotients are shown`]]) },
      controls: `<label class="ctl">p <select data-ctl="p" aria-label="p">${[2, 3, 5, 7].map((v) => `<option ${v === S.p ? "selected" : ""}>${v}</option>`).join("")}</select></label><label class="ctl">probe t <input type="range" data-ctl="tpos" min="0" max="1000" value="${Math.round(S.tpos * 1000)}" aria-label="Probe"></label>`,
      steps: ["𝔸¹ over 𝔽̄ₚ: an algebraic line, not a plane.", `y${E.sup(S.p)} − y = t: ${S.p} sheets.`, `Fibre: ${S.p} points y + a.`, "Deck y ↦ y + 1 cycles them; no point ever ramifies.", `ℤ/${S.p}.`, "Infinitely many such quotients: π₁ᵉᵗ(𝔸¹) ≠ 1 in characteristic p."],
    };
  },
  "ell-p"() {
    const [a, b] = S.ellCurve.split(",").map(Number), Ec = E.ellipticModP(a, b, S.ellP);
    if (Ec.singular) return { geometry: { kind: "schematic", svg: svg(300, 120, txt(10, 60, "singular mod p: choose another p", "sv-label"), "singular"), cap: "" }, cover: { kind: "schematic", svg: "", cap: "" }, fibre: { svg: "", cap: "" }, group: { html: "" }, controls: ellPControls(), steps: Array(6).fill("—") };
    return {
      geometry: { kind: "schematic", svg: fpPointsFig(a, b, S.ellP), cap: `The curve as an algebraic object: its ${Ec.count - 1} affine points in 𝔽${E.sub(S.ellP)}², plus O. Its real-cubic shape says nothing about ordinary versus supersingular.` },
      cover: { kind: "schematic", svg: towersFig(Ec), cap: Ec.supersingular ? `Supersingular: the étale p-adic tower is gone; every ℓ ≠ ${S.ellP} tower survives.` : `Ordinary: an étale tower of ${S.ellP}ᵏ points survives beside every ℓ-tower.` },
      fibre: { svg: fibreFig({ n: Ec.supersingular ? 1 : S.ellP, labels: Ec.supersingular ? ["O"] : E.identity(S.ellP).map((k) => (k ? `${k}P` : "O")), layout: "circle" }), cap: `E[${S.ellP}](𝔽̄${E.sub(S.ellP)}) has ${Ec.supersingular ? "only O" : `${S.ellP} points (≅ ℤ/${S.ellP})`}.` },
      group: { html: groupHTML([["#E(𝔽ₚ)", String(Ec.count)], ["aₚ = p + 1 − #E", String(Ec.ap)], ["Hasse invariant", `${Ec.hasse} ${Ec.hasse === E.mod(Ec.ap, S.ellP) ? "≡ aₚ mod p ✓" : ""}`], ["type", Ec.supersingular ? "supersingular" : "ordinary"], ["T_ℓ (ℓ ≠ p)", "ℤ_ℓ², rank 2"], ["étale T_p", Ec.supersingular ? "0, rank 0" : "ℤ_p, rank 1"]]) },
      controls: ellPControls(),
      steps: ["E over 𝔽̄ₚ, drawn algebraically.", "Multiplication by ℓᵏ and by pᵏ.", "Torsion fibres E[ℓᵏ], E[pᵏ].", "Galois and deck actions on them.", "Tate modules T_ℓ, T_p.", Ec.supersingular ? "T_p = 0: supersingular." : "T_p ≅ ℤ_p: ordinary."],
    };
  },
  arith() {
    const n = S.arN, a = S.a, ok = E.conjugationCheck(n, a);
    const mode = S.arMode;
    return {
      geometry: { kind: "schematic", svg: layersFig(n, S.s, mode), cap: "Two layers: inside the geometric cover world over ℚ̄ a loop moves points; Galois moves the coefficients." },
      cover: { kind: "schematic", svg: rootsFig(n, { mode, s: S.s, a, hl: S.hl, step: 1 }), cap: mode === "gal" ? `σ${E.sub(a)} : ζ ↦ ζ${E.sup(a)} jumps along chords.` : "The geometric loop rotates μₙ one step." },
      fibre: { svg: fibreFig({ n, labels: E.labelsMu(n), layout: "circle", perm: S.s >= 0.999 ? (mode === "gal" ? E.galoisPerm(n, a) : E.rotation(n)) : null, hl: S.hl }), cap: "The fibre of xⁿ = t over t = 1 is μₙ." },
      group: { html: groupHTML([["γ (geometric)", cyc(E.rotation(n), E.labelsMu(n))], [`σ${E.sub(a)} (Galois)`, cyc(E.galoisPerm(n, a), E.labelsMu(n))], [`σ${E.sub(a)}⁻¹ γ σ${E.sub(a)} = γ${E.sup(a)}`, ok ? '<span class="check-ok">holds</span>' : '<span class="check-bad">fails</span>'], ["χ(σₐ)", `${a} ∈ (ℤ/${n})^× = {${E.units(n).join(", ")}}`], ["exact sequence", "1 → ℤ̂(1) → π₁ᵉᵗ(𝔾ₘ,ℚ) → G_ℚ → 1"]]) },
      controls: `<label class="ctl">n <input type="range" data-ctl="arN" min="3" max="12" value="${n}" aria-label="n"><output>${n}</output></label><label class="ctl">a <select data-ctl="a" aria-label="a">${E.units(n).map((u) => `<option ${u === a ? "selected" : ""}>${u}</option>`).join("")}</select></label><span class="seg" role="group" aria-label="Motion"><button type="button" data-ctl="arMode" data-v="loop" aria-pressed="${mode === "loop"}">geometric loop</button><button type="button" data-ctl="arMode" data-v="gal" aria-pressed="${mode === "gal"}">Galois σₐ</button></span>`,
      steps: ["𝔾ₘ over ℚ, with 𝔾ₘ over ℚ̄ above it.", "xⁿ = t over ℚ.", "Fibre over 1: μₙ.", "γ rotates; σₐ multiplies exponents by a.", `ℤ/${n} ⋊ (ℤ/${n})^×.`, "π₁ᵉᵗ(𝔾ₘ,ℚ) = ℤ̂(1) ⋊ G_ℚ, with G_ℚ acting through χ."],
    };
  },
};
function ellPControls() {
  const primes = [5, 7, 11, 13, 17, 19, 23, 29, 31];
  return `<label class="ctl">curve <select data-ctl="ellCurve" aria-label="Curve">${[["-1,0", "y² = x³ − x"], ["0,1", "y² = x³ + 1"], ["1,1", "y² = x³ + x + 1"], ["2,3", "y² = x³ + 2x + 3"]].map(([v, l]) => `<option value="${v}" ${v === S.ellCurve ? "selected" : ""}>${l}</option>`).join("")}</select></label><label class="ctl">p <select data-ctl="ellP" aria-label="p">${primes.map((v) => `<option ${v === S.ellP ? "selected" : ""}>${v}</option>`).join("")}</select></label>`;
}
/* Extra small renderers used only by the lab. */
function forcedBranchFig(n) {
  const w = 300, h = 260, cx = 150;
  let b = "";
  for (let k = 0; k < n; k++) { const y = 50 + k * (150 / Math.max(1, n - 1)); b += ell(cx, y, 100, 16, "", `style="fill:none;stroke:${sheetVar(k)}" stroke-width="2"`); }
  for (let k = 0; k < n; k++) { const y = 50 + k * (150 / Math.max(1, n - 1)); b += line([cx - 100, y], [cx - 120, 125], "sv-dash") + line([cx + 100, y], [cx + 120, 125], "sv-dash"); }
  b += circ(cx - 120, 125, 7, "sv-red") + circ(cx + 120, 125, 7, "sv-red");
  b += txt(cx - 140, 150, "branch", "sv-small ui-t", 'style="fill:var(--bad)"') + txt(cx + 96, 150, "branch", "sv-small ui-t", 'style="fill:var(--bad)"');
  b += ell(cx, 236, 100, 14, "sv-edge") + txt(cx + 108, 240, "ℙ¹", "sv-big");
  b += txt(10, 18, `g(Y) = 1 − ${n} < 0: impossible without branching`, "sv-small ui-t");
  return svg(w, h, b, "An unramified cover of the sphere is forced to branch");
}
/* z ↦ zⁿ near 0: the n preimages of t = ρe^{iθ} on a circle of radius ρ^{1/n}, colliding as ρ → 0. */
function ramFig(n, rho, removed) {
  const w = 300, h = 250, cx = 150, cy = 130, K = E.kummer(n);
  const fib = K.fibre(E.C(Math.max(rho, 1e-6) * Math.cos(0.4), Math.max(rho, 1e-6) * Math.sin(0.4)));
  let b = circ(cx, cy, 95, "sv-faint");
  if (!removed) b += circ(cx, cy, 6, "sv-red");
  else b += circ(cx, cy, 6, "sv-hole");
  fib.forEach((z, k) => { b += circ(cx + 95 * z.re, cy - 95 * z.im, 7, `${sheetCls(k)} sv-pt`, `data-pt="${k}"`); });
  b += txt(10, 20, removed ? "FINITE ÉTALE: 0 removed, no collisions" : rho < 0.08 ? "RAMIFIED: the preimages collide at 0" : `|t| = ${n1(rho)}: ${n} distinct preimages`, "sv-label", `style="font-weight:700;fill:${removed ? "var(--ok)" : rho < 0.08 ? "var(--bad)" : "var(--fg)"}"`);
  b += txt(10, h - 10, `radius |t|^(1/${n}) = ${n1(Math.pow(Math.max(rho, 0), 1 / n))}`, "sv-small ui-t");
  return svg(w, h, b, `The ${n} preimages of t under z to the n`);
}
function latticeShiftFig(n, s) {
  const base = latticeFig(n, { hlPt: S.hl });
  if (!s) return base;
  const tau = TAU_LAT, Sz = 170, ox = 40, oy = 250 - 40, P = (x, y) => [ox + Sz * (x + y * tau.re), oy - Sz * y * tau.im];
  let extra = "";
  for (const p of E.torsion(n, tau)) { const q = P(((p.i + s) / n) % 1, p.j / n); extra += circ(q[0], q[1], 4, "", 'style="fill:var(--glow)" opacity=".85"'); }
  return base.replace("</svg>", `${extra}</svg>`);
}
function abelianGridFig(g, n) {
  const side = Math.pow(n, g), w = 300, cell = Math.min(24, 240 / side), h = side * cell + 50;
  let b = "";
  for (let i = 0; i < side; i++) for (let j = 0; j < side; j++) b += circ(30 + (i + 0.5) * cell, 20 + (j + 0.5) * cell, Math.max(1.5, cell * 0.3), "", `style="fill:${i === 0 && j === 0 ? "var(--fg)" : "var(--s2)"}"`);
  b += txt(10, h - 10, `${side} × ${side} = ${n}${E.sup(2 * g)} points`, "sv-small ui-t");
  return svg(w, h, b, "The torsion points as an abstract grid");
}
function fpPointsFig(a, b0, p) {
  const w = 300, h = 300, cell = 240 / p;
  let b = `<rect x="40" y="20" width="${n1(cell * p)}" height="${n1(cell * p)}" style="fill:none;stroke:var(--rule)"/>`;
  for (let x = 0; x < p; x++) for (let y = 0; y < p; y++) if (E.mod(y * y - (x * x * x + a * x + b0), p) === 0) b += circ(40 + (x + 0.5) * cell, 20 + (p - y - 0.5) * cell, Math.max(2, cell * 0.28), "", 'style="fill:var(--alg)"');
  b += txt(40, h - 18, `points of ${curveName(a, b0)} in 𝔽${E.sub(p)}², plus O`, "sv-small ui-t");
  return svg(w, h, b, "The affine points of the curve over the finite field");
}

/* ---------- rendering the lab ---------- */
let lastView = null;
function renderLab() {
  const V = VIEWS[S.obj]();
  lastView = V;
  $("lab-objects").innerHTML = LAB_ORDER.map((k) => `<button type="button" class="chip" data-obj="${k}" aria-pressed="${k === S.obj}">${esc(LAB_LABEL[k])}</button>`).join("");
  $("lab-controls").innerHTML = V.controls || "";
  $("lab-pipe").innerHTML = STEPS.map((s, i) => `<li><button type="button" data-step="${i}" class="${S.done.has(i) ? "on" : ""}">${esc(s)}</button></li>`).join("");
  for (const k of ["geometry", "cover", "fibre"]) {
    $(`pane-${k}`).innerHTML = V[k].svg || "";
    $(`cap-${k}`).textContent = V[k].cap || "";
  }
  $("geom-badge").innerHTML = badge(V.geometry.kind);
  $("cover-badge").innerHTML = V.cover.kind ? badge(V.cover.kind) : "";
  $("pane-group").innerHTML = V.group.html;
  $("cap-group").textContent = "";
  const charp = S.obj === "a1-p" || S.obj === "ell-p";
  $("charp-banner").hidden = !charp;
  $("lab-panels").classList.toggle("charp", charp);
  const L = currentLoop();
  $("mono-loops").textContent = `loop: ${L.name}`;
  $("mono-s").value = String(Math.round(S.s * 1000));
  $("lab-calc").innerHTML = `<p class="small" style="margin:0 0 .2rem"><strong>Algebraic computation underneath</strong></p><ol>${V.steps.map((s, i) => `<li><strong>${esc(STEPS[i])}.</strong> ${esc(s)}</li>`).join("")}</ol>`;
  renderStatus();
}
/* Animation frames only redraw the panels that move. */
function renderLabPanels() {
  const V = VIEWS[S.obj]();
  lastView = V;
  for (const k of ["geometry", "cover", "fibre"]) $(`pane-${k}`).innerHTML = V[k].svg || "";
  $("pane-group").innerHTML = V.group.html;
  $("mono-s").value = String(Math.round(S.s * 1000));
  renderStatus();
}

function setObj(obj, opts = {}) {
  if (!VIEWS[obj]) return;
  S.obj = obj; S.s = 0; S.hl = null; S.stage = 0; S.merge = 0; S.relStage = 0; S.compact = 0; S.shift = 0;
  if (obj === "gm" && opts.n) S.n = opts.n;
  if (obj === "elliptic" && S.n > 5) S.n = 3;
  if (obj === "arith" && !E.units(S.arN).includes(S.a)) S.a = E.units(S.arN)[1] ?? 1;
  Object.assign(S, opts);
  stopAnim("mono");
  renderLab();
  if (opts.scroll !== false) $("lab").scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
}
function playMonodromy() {
  S.done.add(3);
  const from = S.s >= 0.999 ? 0 : S.s;
  if (S.s >= 0.999 && S.obj === "a1-p") S.shift = (S.shift + 1) % S.p;
  animate("mono", from, 1, 2600 * (1 - from), (v) => { S.s = v; renderLabPanels(); }, () => { S.done.add(4); renderLab(); });
}
