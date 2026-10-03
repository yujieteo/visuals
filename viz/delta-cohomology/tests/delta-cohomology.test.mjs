import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { assertButtonsExport, assertInlined, assertStandardDeck, assertTemplateCopy, openPage, read } from "./data-visuals-beamdswitch.mjs";

const html = read("index.html");
const block = (id) => new RegExp(`<script id="${id}">\\n([\\s\\S]*?)</script>`).exec(html)[1];
const ctx = {}; ctx.self = ctx;
vm.runInNewContext(block("delta-cohomology-engine"), ctx);
const D = ctx.DeltaCohomology;
const T = (await import("node:module")).createRequire(import.meta.url)("../beamdswitch.js");
const plain = (v) => JSON.parse(JSON.stringify(v));

/* The specification's matrices and table, typed here from the spec, independently of the engine. */
const STATED = {
  S2: { d2: [[1, -1], [1, -1], [-1, 1]], d1: [[-1, 0, -1], [1, -1, 0], [0, 1, 1]], vertices: ["v0", "v1", "v2"] },
  T2: { d2: [[1, -1], [1, -1], [-1, 1]], d1: [[0, 0, 0]], vertices: ["v"] },
  RP2: { d2: [[1, 1], [-1, 1], [1, -1]], d1: [[0, -1, -1], [0, 1, 1]], vertices: ["v", "w"] },
};
const TABLE = {
  S2: { Z: ["ℤ", "0", "ℤ"], F2: ["𝔽₂", "0", "𝔽₂"], F3: ["𝔽₃", "0", "𝔽₃"] },
  T2: { Z: ["ℤ", "ℤ²", "ℤ"], F2: ["𝔽₂", "𝔽₂²", "𝔽₂"], F3: ["𝔽₃", "𝔽₃²", "𝔽₃"] },
  RP2: { Z: ["ℤ", "0", "ℤ/2"], F2: ["𝔽₂", "𝔽₂", "𝔽₂"], F3: ["𝔽₃", "0", "0"] },
};
const SPACES = ["S2", "T2", "RP2"], P = { Z: 0, F2: 2, F3: 3 };
const ALL_FLIPS = Array.from({ length: 32 }, (_, m) => Object.fromEntries(["U", "L", "a", "b", "c"].map((k, i) => [k, !!(m & (1 << i))])));

// Independent small linear algebra for the checks.
const mul = (A, B) => A.map((r) => B[0].map((_, j) => r.reduce((s, x, k) => s + x * B[k][j], 0)));
const tr = (A) => A[0].map((_, j) => A.map((r) => r[j]));
const mod = (x, p) => ((x % p) + p) % p;
function rankMod(A0, p) {
  const A = A0.map((r) => r.map((x) => mod(x, p))); let r = 0;
  for (let c = 0; c < (A[0] || []).length; c++) {
    const i = A.findIndex((row, k) => k >= r && row[c]);
    if (i < 0) continue;
    [A[r], A[i]] = [A[i], A[r]];
    let inv = 1; while (mod(A[r][c] * inv, p) !== 1) inv++;
    A[r] = A[r].map((x) => mod(x * inv, p));
    A.forEach((row, k) => { if (k !== r && row[c]) { const q = row[c]; A[k] = row.map((x, j) => mod(x - q * A[r][j], p)); } });
    r++;
  }
  return r;
}
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
const isZero = (A) => A.every((r) => r.every((x) => x === 0));

test("the boundary matrices are derived from the gluing and equal the stated ones", () => {
  for (const s of SPACES) {
    const cx = D.complex(s);
    assert.deepEqual(plain(cx.d2), STATED[s].d2, `${s}: ∂₂`);
    assert.deepEqual(plain(cx.d1), STATED[s].d1, `${s}: ∂₁`);
    assert.deepEqual(plain(cx.basis[0]), STATED[s].vertices, `${s}: vertex classes`);
    assert.deepEqual(plain(cx.basis[1]), ["a", "b", "c"]);
    assert.deepEqual(plain(cx.basis[2]), ["U", "L"]);
    // Every entry of ∂₂ is the sum of its faces' (−1)^i · compare · orientation, and every face is glued.
    assert.equal(cx.faces.length, 6);
    for (const f of cx.faces) assert.equal(f.value, f.sign * f.eps * f.edgeOrient * f.triOrient);
    for (const [i, e] of cx.basis[1].entries()) for (const [j, t] of cx.basis[2].entries())
      assert.equal(cx.d2[i][j], cx.faces.filter((f) => f.edge === e && f.tri === t).reduce((a, f) => a + f.value, 0));
  }
  assert.ok(D.SPEC_TABLE && D.selfTests().every((t) => t.pass), "the in-page self-test passes");
});

test("vertex classes collapse as the gluing says: 3, 1 and 2 vertices; a is a loop in T² and RP²", () => {
  const n = Object.fromEntries(SPACES.map((s) => [s, D.complex(s).vertices.length]));
  assert.deepEqual(n, { S2: 3, T2: 1, RP2: 2 });
  const rp = D.complex("RP2");
  assert.deepEqual(plain(rp.edges.map((e) => [e.id, e.tail, e.head])), [["a", "w", "w"], ["b", "v", "w"], ["c", "v", "w"]]);
  assert.deepEqual(plain(rp.vertices.map((v) => v.members.length)), [2, 4]);
  assert.ok(D.complex("T2").edges.every((e) => e.tail === "v" && e.head === "v"));
});

test("∂₁∂₂ = 0 and δ¹δ⁰ = 0 for every space and all 32 orientation choices", () => {
  for (const s of SPACES) for (const flips of ALL_FLIPS) {
    const cx = D.complex(s, flips);
    assert.ok(isZero(mul(cx.d1, cx.d2)), `${s} ${JSON.stringify(flips)}: ∂₁∂₂`);
    const A = D.analyse({ space: s, flips });
    assert.deepEqual(plain(A.delta[0]), plain(tr(cx.d1)), "δ⁰ = ∂₁ᵀ");
    assert.deepEqual(plain(A.delta[1]), plain(tr(cx.d2)), "δ¹ = ∂₂ᵀ");
    assert.ok(isZero(mul(A.delta[1], A.delta[0])), `${s}: δ¹δ⁰`);
  }
});

test("the cohomology table over ℤ, 𝔽₂ and 𝔽₃ matches the specification", () => {
  for (const s of SPACES) for (const c of ["Z", "F2", "F3"]) {
    const A = D.analyse({ space: s, coef: c });
    assert.deepEqual(plain(A.H.map((h) => h.group.text)), TABLE[s][c], `${s} over ${c}`);
  }
  const rp = D.analyse({ space: "RP2" });
  assert.equal(rp.H[2].group.text, "ℤ/2", "H²(RP²; ℤ) = ℤ/2, never 0");
  assert.equal(D.analyse({ space: "RP2", coef: "F2" }).H[1].group.text, "𝔽₂", "H¹(RP²; 𝔽₂) = 𝔽₂");
  assert.deepEqual(plain(rp.smith[1].diag), [1, 2], "Smith form of δ¹ is diag(1, 2)");
  assert.deepEqual(plain(rp.smith[1].D), [[1, 0, 0], [0, 2, 0]]);
  assert.deepEqual(plain(rp.rankOnly), [1, 0, 0], "ranks alone would read H² = 0");
});

test("independent checks: determinantal divisors give the torsion, ranks mod p give the field dimensions", () => {
  // δ¹(RP²) = ∂₂ᵀ: d₁ = gcd of entries, d₁d₂ = gcd of 2×2 minors.
  const d = tr(STATED.RP2.d2);
  const d1 = d.flat().reduce(gcd, 0);
  const minors = [[0, 1], [0, 2], [1, 2]].map(([i, j]) => d[0][i] * d[1][j] - d[0][j] * d[1][i]);
  assert.equal(d1, 1); assert.equal(minors.reduce(gcd, 0) / d1, 2);
  for (const s of SPACES) for (const c of ["F2", "F3"]) {
    const p = P[c], d0 = tr(STATED[s].d1), dl = tr(STATED[s].d2), n = [STATED[s].vertices.length, 3, 2];
    const r0 = rankMod(d0, p), r1 = rankMod(dl, p);
    const dims = [n[0] - r0, n[1] - r1 - r0, n[2] - r1];
    const A = D.analyse({ space: s, coef: c });
    assert.deepEqual(plain(A.H.map((h) => h.summands.length)), dims, `${s} over ${c}`);
  }
});

test("flipping a simplex negates its row or column of the matrices but never changes cohomology", () => {
  for (const s of SPACES) {
    const base = D.complex(s);
    for (const k of ["U", "L", "a", "b", "c"]) {
      const cx = D.complex(s, { [k]: true });
      const j = base.basis[2].indexOf(k), e = base.basis[1].indexOf(k);
      cx.d2.forEach((r, i) => r.forEach((x, jj) => assert.equal(x, (base.d2[i][jj] * ((jj === j) || (i === e) ? -1 : 1)) || 0, `${s} flip ${k}: ∂₂`)));
      cx.d1.forEach((r, i) => r.forEach((x, jj) => assert.equal(x, (base.d1[i][jj] * (jj === e ? -1 : 1)) || 0, `${s} flip ${k}: ∂₁`)));
      assert.ok(JSON.stringify(cx.d2) !== JSON.stringify(base.d2), `${s} flip ${k}: signs visibly change`);
    }
    for (const flips of ALL_FLIPS) for (const c of ["Z", "F2", "F3"])
      assert.deepEqual(plain(D.analyse({ space: s, coef: c, flips }).H.map((h) => h.group.text)), TABLE[s][c], `${s} ${c} ${JSON.stringify(flips)}`);
  }
});

test("generators are cocycles, and the torus classes are dual to the loops a and b", () => {
  for (const s of SPACES) for (const c of ["Z", "F2", "F3"]) {
    const A = D.analyse({ space: s, coef: c }), p = P[c];
    for (const k of [0, 1]) for (const g of A.H[k].summands)
      assert.ok(A.delta[k].every((row) => (p ? mod(row.reduce((a, x, i) => a + x * g.rep[i], 0), p) : row.reduce((a, x, i) => a + x * g.rep[i], 0)) === 0), `${s} ${c}: H${k} generator is a cocycle`);
  }
  const t = D.analyse({ space: "T2" });
  assert.deepEqual(plain(t.H[1].summands.map((g) => g.rep)), [[1, 0, 1], [0, 1, 1]], "α = a* + c*, β = b* + c*");
  assert.deepEqual(plain(t.H[2].summands.map((g) => g.rep)), [[1, 0]], "U* represents the fundamental class");
});

test("cup products come from Alexander–Whitney on these cochains and give the stated rings", () => {
  // Torus by hand: U = +[P,S,R] (front [P,S] = b, back [S,R] = a), L = −[P,Q,R] (front a, back b).
  const t = D.analyse({ space: "T2" }), cx = t.cx, al = [1, 0, 1], be = [0, 1, 1];
  const hand = (x, y) => [x[1] * y[0], -(x[0] * y[1]) || 0];
  for (const [x, y] of [[al, al], [al, be], [be, al], [be, be]]) assert.deepEqual(plain(D.cup11(cx, x, y)), hand(x, y));
  const prod = Object.fromEntries(t.ring.products.map((p) => [`${p.a}${p.b}`, p]));
  assert.ok(prod.αα.zero && prod.ββ.zero, "α² = β² = 0");
  assert.deepEqual(plain(prod.αβ.cls), [-1], "α⌣β = −u generates H²");
  assert.deepEqual(plain(prod.βα.cls), [1], "β⌣α = −α⌣β");
  assert.equal(t.ring.kind, "exterior");
  assert.match(t.ring.text, /Λ_ℤ\(α, β\)/);
  // RP² over 𝔽₂: x = a* + c*; U = [S,P,R] has front [S,P] = c, back [P,R] = a, so x²(U) = 1.
  const r = D.analyse({ space: "RP2", coef: "F2" });
  assert.deepEqual(plain(r.H[1].summands[0].rep), [1, 0, 1]);
  assert.deepEqual(plain(D.cup11(r.cx, [1, 0, 1], [1, 0, 1], 2)), [1, 0]);
  assert.equal(r.ring.products[0].zero, false, "x² ≠ 0");
  assert.equal(r.ring.kind, "truncated");
  assert.equal(r.ring.text, "𝔽₂[x]/(x³)");
  assert.equal(D.analyse({ space: "S2" }).ring.text, "ℤ[u]/(u²)");
  for (const s of SPACES) for (const c of ["Z", "F2", "F3"]) assert.ok(D.analyse({ space: s, coef: c }).ring.unitOk, `${s} ${c}: 1 is the unit`);
  // Orientation flips do not change the ring.
  for (const flips of ALL_FLIPS) {
    assert.equal(D.analyse({ space: "T2", flips }).ring.kind, "exterior");
    assert.equal(D.analyse({ space: "RP2", coef: "F2", flips }).ring.kind, "truncated");
  }
});

test("∂² = 0 term by term: endpoint terms cancel in pairs", () => {
  for (const s of SPACES) for (const tri of ["U", "L"]) {
    const b = D.analyse({ space: s }).bb[tri];
    assert.equal(b.vertexTerms.length, 6);
    assert.equal(b.pairs.length, 3, `${s} ${tri}: three cancelling pairs`);
    assert.ok(Object.values(b.total).every((x) => x === 0));
  }
});

test("Homology is kept apart: H₁(RP²; ℤ) = ℤ/2 while H¹ = 0", () => {
  const A = D.analyse({ space: "RP2" });
  assert.deepEqual(plain(A.homology.map((h) => h.group.text)), ["ℤ", "ℤ/2", "0"]);
  assert.deepEqual(plain(A.H.map((h) => h.group.text)), ["ℤ", "0", "ℤ/2"]);
});

test("raw.json matches the engine", () => {
  const raw = JSON.parse(read("raw.json"));
  assert.deepEqual(raw, plain({ ...D.META, table: D.table(), stated: { matrices: D.SPEC, cohomology: D.SPEC_TABLE } }));
  for (const s of SPACES) assert.deepEqual(raw.table[s].cohomology, TABLE[s]);
});

test("after an orientation flip the explanations quote the flipped matrices", async () => {
  const page = await openPage("delta-cohomology");
  const act = (a, v) => page.run(`document.listeners.click.forEach((f) => f({ target: { closest: (s) => (s === "[data-act]" ? { getAttribute: (k) => ({ "data-act": ${JSON.stringify(a)}, "data-v": ${JSON.stringify(v)} })[k] } : null) } }))`);
  const text = (id) => page.run(`document.getElementById("${id}").innerHTML`).replace(/<[^>]+>/g, "");
  const step = (title) => { act("step", String({ "Orient simplices": 1, "Compute ∂₁": 2, "Compute ker δ¹": 7 }[title])); assert.match(text("guide"), new RegExp(`Step \\d+ of \\d+ · \\S+${title}`)); };
  act("space", "T2");
  step("Compute ker δ¹");
  assert.match(text("guide"), /φ\(c\) = φ\(a\) \+ φ\(b\)/);
  act("flip", "c");
  assert.match(text("guide"), /φ\(c\) = −φ\(a\) − φ\(b\)/, "∂U = a + b + c once c is flipped");
  assert.match(text("result"), /cocycle condition φ\(c\) = −φ\(a\) − φ\(b\)/);
  act("flip", "U");
  step("Orient simplices");
  assert.match(text("guide"), /U−L is a cycle/);
  act("space", "S2"); act("flip", "a");
  step("Compute ∂₁");
  assert.match(text("guide"), /∂a = v₀−v₁, ∂b = −v₁\+v₂, ∂c = −v₀\+v₂/);
  act("space", "RP2");
  assert.match(text("result"), /∂\(U \+ L\) = 2a\)/);
  act("flip", "L");
  assert.match(text("result"), /∂\(U \+ L\) = −2b\+2c\)/);
});

test("every space, coefficient ring and an orientation flip give a standard narrated deck with bf_emma", () => {
  assertTemplateCopy("delta-cohomology");
  assertInlined(html, "beamdswitch", read("beamdswitch.js"), "delta-cohomology");
  for (const s of SPACES) for (const c of ["Z", "F2", "F3"]) for (const flips of [{}, { U: true, b: true }]) {
    const md = T.deck(D.beamdswitchReport({ space: s, coef: c, flips }));
    const deck = assertStandardDeck(md, `${s} ${c}`);
    assert.equal(deck.meta.voice, "bf_emma");
    assert.match(md, /\\begin\{pmatrix\}/, "matrices as LaTeX");
    assert.ok(md.includes(`H⁰, H¹, H² = ${TABLE[s][c].join(", ")}`), `${s} ${c}: the page's groups`);
  }
  const rp = T.deck(D.beamdswitchReport({ space: "RP2" }));
  assert.match(rp, /Smith normal form of δ¹: diag\(1, 2\)/);
  assert.match(rp, /H two is Z mod 2/);
});

test("the page boots, its WebMCP tools answer, and the deck buttons export the page's state", async () => {
  const page = await openPage("delta-cohomology");
  assert.equal(page.run('document.getElementById("app").hidden'), false);
  const tools = page.run("DeltaCohomologyTools");
  assert.deepEqual(plain(tools.map((t) => t.name)), ["get_metadata", "get_current_state", "compute_cohomology", "run_self_tests"]);
  for (const t of tools) assert.equal(t.annotations.readOnlyHint, true);
  const call = async (name, args = {}) => JSON.parse((await tools.find((t) => t.name === name).execute(args)).content[0].text);
  assert.equal((await call("get_metadata")).table.RP2.cohomology.Z[2], "ℤ/2");
  const st = await call("get_current_state");
  assert.equal(st.state.space, "T2", "the torus is the default walkthrough");
  assert.equal(st.ui.mode, "guided");
  assert.deepEqual(st.cohomology.map((h) => h.group), TABLE.T2.Z);
  const rp = await call("compute_cohomology", { space: "RP2", coefficients: "F2" });
  assert.deepEqual(rp.cohomology.map((h) => h.group), TABLE.RP2.F2);
  assert.deepEqual((await call("compute_cohomology", { space: "RP2" })).smith.delta1, [1, 2]);
  assert.ok((await call("compute_cohomology", { space: "X" })).error);
  const self = await call("run_self_tests");
  assert.equal(self.passed, self.total);
  await assertButtonsExport(page, "delta-cohomology", T.deck(D.beamdswitchReport({ space: "T2", coef: "Z" })));
});
