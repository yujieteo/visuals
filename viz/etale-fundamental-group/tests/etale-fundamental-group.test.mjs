// Étale Fundamental Group: the engine's mathematics, the generated page and data, the page's
// WebMCP tools, and its beamdswitch deck. Runs with Node's built-in runner.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { build, raw } from "../build.mjs";
import { assertSharedTemplate, checkDeck, standIn } from "./beamdswitch-deck-checks.mjs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const html = read("index.html");
const script = (id) => new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`).exec(html)[1];
const ctx = vm.createContext({});
ctx.self = ctx;
vm.runInContext(script("etale-engine"), ctx);
vm.runInContext(script("etale-beamdswitch"), ctx);
const E = ctx.Etale, B = ctx.Beamdswitch;
const J = (x) => JSON.parse(JSON.stringify(x));
const P = (s, n) => E.parseCycles(s, n);
const isId = (p) => E.equal(p, E.identity(p.length));

test("index.html and raw.json are exactly what build.mjs makes from src/", () => {
  assert.equal(html, build(), "run node build.mjs");
  assert.equal(read("raw.json"), raw());
});

test("the page inlines the site's shared beamdswitch template unchanged", () => {
  assertSharedTemplate();
  assert.equal(script("etale-beamdswitch"), `\n${read("tests/fixtures/beamdswitch/template.js")}`);
});

/* ---------- monodromy computed by lifting loops ---------- */
test("the loop once round 𝔾ₘ lifts through x^n = t to an n-cycle", () => {
  for (let n = 2; n <= 12; n++) {
    const { perm, fibre } = E.kummerMonodromy(n);
    const cs = E.cycles(perm);
    assert.equal(cs.length, 1, `n = ${n}: one cycle`);
    assert.equal(cs[0].length, n, `n = ${n}: an n-cycle`);
    assert.deepEqual(J(perm), J(E.rotation(n)), `n = ${n}: ζ^k ↦ ζ^(k+1)`);
    for (const z of fibre) assert.ok(Math.abs(E.cabs(z) - 1) < 1e-12, "the fibre over 1 is μ_n");
  }
  assert.deepEqual(J(E.kummerMonodromy(5, -1).perm), J(E.inverse(E.rotation(5))), "the reversed loop gives the inverse");
  assert.deepEqual(J(E.kummerMonodromy(6, 2).perm), J(E.power(E.rotation(6), 2)), "two turns give the square");
  assert.equal(E.cycleString(E.kummerMonodromy(5).perm), "(1 2 3 4 5)");
});

test("loops round 0, 1, ∞ lifted through the Chebyshev cover satisfy γ₀γ₁γ∞ = 1", () => {
  const m = E.chebyshevMonodromy();
  assert.deepEqual(J(E.cycleType(m.g0)), [2, 1], "γ₀: a transposition");
  assert.deepEqual(J(E.cycleType(m.g1)), [2, 1], "γ₁: a transposition");
  assert.deepEqual(J(E.cycleType(m.ginf)), [3], "γ∞: a 3-cycle (total ramification at ∞)");
  assert.ok(isId(m.relation), "γ₀γ₁γ∞ = 1");
  assert.equal(E.generate([m.g0, m.g1], 3).length, 6, "monodromy group S₃");
  for (const x of m.fibre) assert.ok(E.cabs(E.csub(E.chebyshev.map(x), E.CHEB_BASE)) < 1e-10, "fibre points map to the base point");
  const D = E.dessin(m.g0, m.g1);
  assert.equal(D.genus, 0);
  assert.deepEqual(J(D.black.map((c) => c.length).sort()), [1, 2]);
  assert.deepEqual(J(D.white.map((c) => c.length).sort()), [1, 2]);
  assert.equal(D.faces.length, 1);
  assert.equal(E.centralizer([m.g0, m.g1], 3).length, 1, "the degree-3 cover is not Galois");
});

test("the S₃ cover with a ↦ (12), b ↦ (123) has a transitive 6-point Schreier graph", () => {
  const a = P("(1 2)", 3), b = P("(1 2 3)", 3), R = E.regularAction([a, b], 3);
  assert.equal(R.size, 6);
  assert.ok(E.isTransitive(R.gens, 6), "transitive: the cover is connected");
  assert.deepEqual(J(E.cycleType(R.gens[0])), [2, 2, 2], "a acts freely as three transpositions");
  assert.deepEqual(J(E.cycleType(R.gens[1])), [3, 3], "b acts freely as two 3-cycles");
  const edges = E.schreierEdges(R.gens, ["a", "b"]);
  assert.equal(edges.length, 12);
  assert.equal(E.centralizer(R.gens, 6).length, 6, "Galois: the deck group has order 6");
  assert.equal(E.generate(R.gens, 6).length, 6);
  assert.ok(E.isTransitive([a, b], 3) && E.generate([a, b], 3).length === 6);
});

/* ---------- surfaces ---------- */
test("punctured genus g gives a free group of rank 2g + r − 1, and the relation holds", () => {
  for (let g = 0; g <= 4; g++) for (let r = 0; r <= 6; r++) {
    const S = E.surface(g, r);
    assert.equal(S.gens.length, 2 * g + r);
    assert.equal(S.chi, 2 - 2 * g - r);
    if (r > 0) {
      assert.equal(S.rank, 2 * g + r - 1, `g = ${g}, r = ${r}`);
      assert.equal(S.rank, 1 - S.chi);
      const el = E.eliminateLast(S);
      assert.equal(el.freeGens.length, S.rank);
      // Substituting c_r back makes the relation word reduce to nothing.
      assert.deepEqual(J(E.reduceWord([...S.relation.slice(0, -1), ...el.word])), []);
      // Any images of the free generators, with c_r eliminated, satisfy the relation.
      const imgs = {}; S.gens.forEach((x, k) => { imgs[x] = E.power(P("(1 2 3 4)", 4), k + 1); });
      imgs[el.gen] = E.evalWord(el.word, imgs, 4);
      assert.ok(isId(E.evalWord(S.relation, imgs, 4)));
    } else assert.equal(S.rank, null);
  }
  assert.equal(E.surface(0, 3).et, "F̂₂");
  assert.equal(E.surface(1, 0).et, "ℤ̂²");
  assert.equal(E.surface(0, 2).et, "ℤ̂");
  assert.equal(E.relationString(E.surface(2, 3)), "[a₁,b₁] [a₂,b₂] c₁ c₂ c₃ = 1");
});

test("the 4g-gon glues to one vertex with χ = 2 − 2g", () => {
  for (let g = 1; g <= 4; g++) {
    const Pg = E.polygon(g);
    assert.equal(Pg.edges.length, 4 * g);
    assert.equal(Pg.V, 1, `genus ${g}: one vertex`);
    assert.equal(Pg.chi, 2 - 2 * g);
  }
});

test("P¹ has no connected unramified cover; z ↦ zⁿ on P¹ satisfies Riemann–Hurwitz", () => {
  for (let d = 2; d <= 6; d++) assert.ok(E.hurwitzGenus(0, d) < 0);
  for (let n = 2; n <= 6; n++) assert.equal(E.hurwitzGenus(0, n, 2 * (n - 1)), 0);
  assert.equal(E.hurwitzGenus(1, 4), 1, "[2] on an elliptic curve is unramified of degree 4");
});

/* ---------- tori ---------- */
test("E[n] has n² points, each killed by n; A[n] has n^(2g)", () => {
  for (let n = 1; n <= 6; n++) {
    const T = E.torsion(n);
    assert.equal(T.length, n * n);
    assert.equal(new Set(T.map((p) => E.lattCoords(p.z, E.C(0.3, 0.95)).map((x) => x.toFixed(9)).join())).size, n * n, "distinct mod Λ");
    for (const p of T) {
      const [u, v] = E.lattCoords(E.cscale(p.z, n), E.C(0.3, 0.95));
      assert.ok(Math.min(u, 1 - u) < 1e-9 && Math.min(v, 1 - v) < 1e-9, "n·P ∈ Λ");
    }
  }
  assert.equal(E.torsionCount(2, 2), 16);
  assert.equal(E.torsionCount(3, 2), 81);
});

/* ---------- finite fields and characteristic p ---------- */
test("Frobenius necklaces: the orbit of α closes after exactly n steps", () => {
  assert.deepEqual(J(E.firstIrreducible(2, 2)), [1, 1, 1], "x² + x + 1");
  assert.deepEqual(J(E.firstIrreducible(3, 2)), [1, 1, 0, 1], "x³ + x + 1");
  for (const p of [2, 3, 5]) for (let n = 1; n <= 6; n++) {
    if (p ** n > 20000) continue;
    const N = E.frobeniusNecklace(p, n);
    assert.ok(E.irreducible(N.f, p));
    assert.ok(N.closes, `p = ${p}, n = ${n}: α^(p^n) = α`);
    assert.equal(N.distinct, n, `p = ${p}, n = ${n}: n distinct conjugates`);
  }
  assert.ok(!E.irreducible([1, 0, 1], 2), "x² + 1 = (x + 1)² over 𝔽₂");
});

test("Artin–Schreier: étale everywhere, Frobenius is translation, deck group ℤ/p", () => {
  for (const p of [2, 3, 5, 7]) {
    const A0 = E.artinSchreier(p, 0);
    assert.ok(A0.split && A0.frobenius === null, "over t = 0 the fibre is p rational points");
    for (let t = 1; t < p; t++) {
      const A = E.artinSchreier(p, t);
      assert.deepEqual(J(A.derivative), [p - 1], "∂/∂y = −1");
      assert.ok(A.irreducible, `y^${p} − y − ${t} is irreducible over 𝔽${p}`);
      assert.ok(A.frobIsTranslation, "Frobenius: y ↦ y + t");
      assert.deepEqual(J(E.cycleType(A.deck)), [p]);
    }
    // Over ℂ the same equation branches over p − 1 distinct finite values.
    const { critical, branch } = E.artinSchreierChar0(p);
    assert.equal(branch.length, p - 1);
    for (const y of critical) { let d = E.C(p); for (let i = 0; i < p - 1; i++) d = E.cmul(d, y); assert.ok(E.cabs(E.csub(d, E.C(1))) < 1e-9, "p·y^(p−1) = 1"); }
    for (let i = 0; i < branch.length; i++) for (let j = i + 1; j < branch.length; j++) assert.ok(E.cabs(E.csub(branch[i], branch[j])) > 1e-6);
  }
});

test("ordinary curves have étale T_p of rank 1, supersingular rank 0, T_ℓ rank 2", () => {
  const primes = [5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61];
  for (const p of primes) {
    const E1 = E.ellipticModP(-1, 0, p), E2 = E.ellipticModP(0, 1, p);
    assert.equal(E1.supersingular, p % 4 === 3, `y² = x³ − x mod ${p}`);
    assert.equal(E2.supersingular, p % 3 === 2, `y² = x³ + 1 mod ${p}`);
    for (const [a, b] of [[-1, 0], [0, 1], [1, 1], [2, 3], [3, 5]]) {
      const C = E.ellipticModP(a, b, p);
      if (C.singular) continue;
      assert.equal(C.hasse, E.mod(C.ap, p), `Hasse invariant ≡ a_p mod ${p}`);
      assert.ok(Math.abs(C.ap) <= 2 * Math.sqrt(p), "Hasse bound");
      assert.equal(C.tateL, 2, "T_ℓ has rank 2");
      assert.equal(C.tateP, C.supersingular ? 0 : 1, "étale T_p has rank 1 (ordinary) or 0 (supersingular)");
      assert.equal(C.pTorsion(3), C.supersingular ? 1 : p ** 3);
      assert.equal(C.lTorsion(2, 2), 16);
    }
  }
  assert.deepEqual(J(E.tateRanks(3, 1)), { l: 6, p: 1 });
});

/* ---------- arithmetic π₁ ---------- */
test("σ_a⁻¹ γ σ_a = γ^a on μ_n, and the cyclotomic character is compatible", () => {
  for (let n = 2; n <= 24; n++) for (const a of E.units(n)) {
    assert.ok(E.conjugationCheck(n, a), `n = ${n}, a = ${a}`);
    assert.equal(new Set(E.galoisPerm(n, a)).size, n);
    for (const m of E.divisors(n)) assert.equal(E.galoisPerm(n, a)[(n / m) % n], E.mod(E.reduceUnit(a, n, m) * (n / m), n), "σ_a on μ_m ⊂ μ_n is σ_(a mod m)");
  }
  assert.deepEqual(J(E.units(8)), [1, 3, 5, 7]);
  assert.equal(E.cycleString(E.galoisPerm(8, 3), E.labelsMu(8)), "(ζ ζ³)(ζ² ζ⁶)(ζ⁵ ζ⁷)");
});

test("ℤ̂: reduction maps are compatible", () => {
  assert.deepEqual(J(E.zhatChain([12, 6, 3]).map((x) => x.divides)), [true, true, null]);
  assert.deepEqual(J(E.imageInLevels(17, [12, 6, 3])), [5, 5, 2]);
  for (let x = -30; x <= 30; x++) for (const [m, d] of [[12, 6], [12, 4], [6, 3], [4, 2]]) assert.equal(E.mod(E.mod(x, m), d), E.mod(x, d));
});

test("Spec ℂ and Spec ℝ", () => {
  for (let n = 1; n <= 6; n++) assert.equal(E.croots([E.C(-2), ...Array(n - 1).fill(E.C(0)), E.C(1)]).length, n);
  assert.equal(E.specC(1).connected, true);
  assert.equal(E.specC(3).connected, false);
  assert.deepEqual(J(E.specR().conj), [1, 0]);
});

/* ---------- the results table ---------- */
test("the results table states each computation with the specification's assumptions", () => {
  const SPEC = [
    ["Spec ℂ", "—", "1"], ["Spec ℝ", "—", "C₂"], ["Spec 𝔽_q", "—", "ℤ̂"], ["ℙ¹", "alg. closed, char 0", "1"], ["𝔸¹", "alg. closed, char 0", "1"],
    ["𝔾ₘ", "alg. closed, char 0", "ℤ̂"], ["ℙ¹ − {0,1,∞}", "alg. closed, char 0", "F̂₂"], ["projective genus g curve", "char 0", "profinite surface group"],
    ["punctured genus g curve", "char 0", "free profinite group of rank 2g+r−1"], ["elliptic curve", "alg. closed, char 0", "ℤ̂²"], ["dimension-g abelian variety", "char 0", "ℤ̂²ᵍ"],
    ["𝔸¹", "char p", "show Artin–Schreier quotient"], ["ordinary elliptic curve", "char p", "show nonzero T_p"], ["supersingular elliptic curve", "char p", "show vanished étale T_p"],
  ];
  assert.deepEqual(J(E.RESULTS.map((r) => [r.X, r.assumptions, r.answer])), SPEC);
  for (const r of E.RESULTS) assert.ok(html.includes(`id="res-${r.id}"`), `${r.X} is in the static table`);
  const pics = [...E.RESULTS, ...E.EXTRA_PICTURES].map((r) => r.picture).join(" | ");
  for (const need of ["single algebraic point", "Frobenius cycles", "Riemann sphere", "pair of pants", "g-handled surface", "handles + actual holes", "cubic + lattice + torus", "n-torsion grid", "product-torus", "p algebraic sheets", "p-adic torsion tower", "geometric layer + Galois layer", "roots of unity + Galois permutation", "n-sheeted cylinder cover"])
    assert.ok(pics.includes(need), need);
});

test("Szamuely is cited by chapter only, with the published chapter titles", () => {
  assert.deepEqual(J(E.SZAMUELY.map((c) => [c.chapter, c.title])), [
    [1, "Galois theory of fields"], [2, "Fundamental groups in topology"], [3, "Riemann surfaces"],
    [4, "Fundamental groups of algebraic curves"], [5, "Fundamental groups of schemes"], [6, "Tannakian fundamental groups"],
  ]);
  assert.doesNotMatch(html, /§|\bpp?\.\s*\d|Section \d|Theorem \d|Proposition \d/);
  assert.match(html, /Cambridge Studies in Advanced Mathematics 117/);
});

test("every lab computation is finite and deterministic", () => {
  for (const obj of Object.keys(E.OBJECTS)) for (const n of [2, 3, 5]) {
    const r1 = E.compute({ obj, n }), r2 = E.compute({ obj, n });
    assert.deepEqual(J(r1), J(r2), obj);
    assert.doesNotMatch(JSON.stringify(J(r1)), /NaN|Infinity|undefined/, obj);
  }
  assert.equal(E.compute({ obj: "gm", n: 5 }).monodromy, "(1 2 3 4 5)");
  assert.equal(E.compute({ obj: "elliptic", n: 3 }).fibreSize, 9);
  assert.equal(E.compute({ obj: "curve", g: 2, r: 3 }).quotient, "free of rank 6");
});

/* ---------- the page: self-contained, no-JavaScript fallback, tools ---------- */
test("the page is self-contained and keeps the dictionary and results without JavaScript", () => {
  assert.match(html, /Content-Security-Policy" content="default-src 'none'/);
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+stylesheet|@import|fetch\(|XMLHttpRequest|<img[^>]+src="http/);
  // The dictionary, concept map and results are outside every js-only block.
  for (const id of ["dictionary", "concepts", "results"]) assert.match(html, new RegExp(`<section class="block" id="${id}"`));
  assert.match(html, /<table class="dict">/);
  assert.match(html, /prefers-color-scheme:dark/);
  assert.match(html, /data-theme="dark"/);
  assert.match(html, /prefers-reduced-motion/);
});

function page(opts = {}) { const p = standIn(opts); p.run(html); return p; }

// The site checks these names against its catalogue stub (data/visuals/etale-fundamental-group.yaml); here they are listed.
const TOOLS = ["get_metadata", "get_current_state", "get_results_table", "analyse_cover"];

test("the page boots, recomputes its checks, and registers its read-only WebMCP tools", async () => {
  const registered = [];
  const p = page({ globals: { navigator: { modelContext: { registerTool: (t) => registered.push(t) }, clipboard: { writeText: async () => {} } } } });
  assert.deepEqual(registered.map((t) => t.name), TOOLS);
  for (const t of registered) assert.equal(t.annotations.readOnlyHint, true, t.name);
  const tool = (n) => registered.find((t) => t.name === n);
  const rows = JSON.parse((await tool("get_results_table").execute({})).content[0].text);
  assert.equal(rows.length, 14);
  assert.ok(rows.every((r) => r.checked === true), rows.filter((r) => !r.checked).map((r) => r.id).join());
  const st = JSON.parse((await tool("get_current_state").execute({})).content[0].text);
  assert.equal(st.status.Object, "𝔾ₘ");
  assert.equal(st.status.Monodromy, "(1 2 3)");
  const an = JSON.parse((await tool("analyse_cover").execute({ degree: 3, a: "(1 2)", b: "(1 2 3)" })).content[0].text);
  assert.deepEqual([an.connected, an.group_order, an.deck_group_order, an.galois, an.dessin_genus], [true, 6, 1, false, 0]);
  const bad = JSON.parse((await tool("analyse_cover").execute({ degree: 3, a: "(1 4)", b: "" })).content[0].text);
  assert.ok(bad.error);
  const meta = JSON.parse((await tool("get_metadata").execute({})).content[0].text);
  assert.equal(meta.reference.chapters.length, 6);
  assert.equal(p.$("chk-gm").textContent, "✓");
});

/* ---------- beamdswitch ---------- */
test("every lab computation exports a standard narrated deck with voice bf_emma", () => {
  for (const obj of Object.keys(E.OBJECTS)) for (const n of [2, 5]) {
    const deck = checkDeck(B.deck(E.report({ obj, n, g: 1, r: 2 })), `${obj}, n = ${n}`);
    assert.equal(deck.meta.voice, "bf_emma");
    assert.match(deck.meta.subtitle, /^Current computation: /);
  }
  const md = B.deck(E.report({ obj: "gm", n: 5 }));
  assert.match(md, /\(1 2 3 4 5\)/, "the deck shows the page's computed cycle");
  assert.ok(E.PROGRESSION.length === 16);
});

test("the beamdswitch button saves the lab's deck, and Copy deck copies the same deck", async () => {
  const p = page();
  await p.$("save-beamdswitch").fire("click");
  assert.equal(p.$("io-msg").textContent, "Saved etale-fundamental-group-beamdswitch.md: open it in beamdswitch.");
  const [file] = p.saved;
  assert.equal(file.name, "etale-fundamental-group-beamdswitch.md");
  assert.equal(file.blob.type, "text/markdown");
  const md = await file.blob.text();
  assert.equal(checkDeck(md, "saved").meta.voice, "bf_emma");
  await p.$("copy-beamdswitch").fire("click");
  assert.equal(p.$("io-msg").textContent, "Copied the beamdswitch deck: paste it into beamdswitch.");
  assert.equal(p.copied[0], md);
});

test("a blocked download says to use Copy deck, and a blocked clipboard shows the deck to copy by hand", async () => {
  const p = page({ saveFails: true, clipboardFails: true });
  await p.$("save-beamdswitch").fire("click");
  assert.equal(p.$("io-msg").textContent, "Could not save: downloads are blocked. Use Copy deck instead.");
  await p.$("copy-beamdswitch").fire("click");
  assert.equal(p.$("fallback").hidden, false);
  checkDeck(p.$("fallback-text").value, "fallback");
});
