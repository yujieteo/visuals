import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { parseDeck } from "./fixtures/beamdswitch/deck.mjs";
import { assertInlined, assertStandardDeck, assertTemplateCopy, openPage, read } from "./data-visuals-beamdswitch.mjs";

const require = createRequire(import.meta.url);
const SL = require("../src/engine.js");
const T = require("./fixtures/beamdswitch/template.js");
const { Z } = SL;
const range = (lo, hi) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
const same = (u, v) => u.length === v.length && u.every((x, i) => x === v[i]);

/* ---------- section 45: the mathematics, computed ---------- */

test("the integer example's squares commute: p∘β = γ∘p′ and β∘i′ = i∘α", () => {
  // Both rows are 0 → ℤ → ℤ² → ℤ → 0 with the same i and p, so i′ = i and p′ = p.
  for (const a of range(-25, 25)) for (const c of range(-25, 25)) assert.equal(Z.p(Z.beta([a, c])), Z.gamma(Z.p([a, c])), `right square at (${a}, ${c})`);
  for (const a of range(-25, 25)) assert.ok(same(Z.beta(Z.i(a)), Z.i(Z.alpha(a))), `left square at ${a}`);
  // and the rows are short exact on the range: i injective, ker p = im i, p onto
  for (const a of range(-25, 25)) for (const b of range(-25, 25)) if (a !== b) assert.ok(!same(Z.i(a), Z.i(b)));
  for (const a of range(-25, 25)) for (const c of range(-25, 25)) assert.equal(Z.p([a, c]) === 0, same([a, c], Z.i(a)));
  for (const c of range(-25, 25)) assert.equal(Z.p([0, c]), c);
});

test("α(n) = 2n, γ(n) = 0, β(a, c) = (2a + c, 0), and δ(n) = n mod 2 for every permitted lift", () => {
  for (const n of range(-30, 30)) {
    assert.equal(Z.alpha(n), 2 * n);
    assert.equal(Z.gamma(n), 0);
    assert.equal(Z.delta(n), ((n % 2) + 2) % 2);
    const classes = new Set();
    for (const k of range(-60, 60)) {
      const r = Z.chase(n, k);
      assert.ok(same(r.lift, [k, n]) && Z.p(r.lift) === n, "the lift is a preimage under p′");
      assert.ok(same(r.image, [2 * k + n, 0]), "β(k, n) = (2k + n, 0)");
      assert.equal(Z.p(r.image), 0, "β(b′) ∈ ker p");
      assert.ok(same(Z.i(r.a), r.image), "i(a) = β(b′)");
      assert.equal(r.a, 2 * k + n);
      classes.add(r.coset);
    }
    assert.deepEqual([...classes], [Z.delta(n)], `every lift of ${n} gives the class δ(${n})`);
  }
  // The well-definedness argument itself: two lifts differ by i′(a′), and their endpoints by α(a′).
  for (const n of range(-6, 6)) for (const k1 of range(-8, 8)) for (const k2 of range(-8, 8)) {
    const r1 = Z.chase(n, k1), r2 = Z.chase(n, k2), aPrime = k1 - k2;
    assert.ok(same([r1.lift[0] - r2.lift[0], r1.lift[1] - r2.lift[1]], Z.i(aPrime)), "b′₁ − b′₂ = i′(a′)");
    assert.equal(r1.a - r2.a, Z.alpha(aPrime), "a₁ − a₂ = α(a′)");
  }
  // The page's default chase: c′ = 1, b′ = (0, 1), β(b′) = (1, 0), a = 1, δ(1) = [1].
  const d = Z.chase(1, 0);
  assert.deepEqual([d.lift, d.image, d.a, d.coset], [[0, 1], [1, 0], 1, 1]);
  assert.deepEqual(SL.LIFT_ORDER.slice(0, 5), [0, 1, -1, 2, -2], "deterministic order of “try another lift”");
});

test("the ℤ example's six-term sequence is what the page says, and exact at the four junctions", () => {
  const R = range(-12, 12), pairs = R.flatMap((a) => R.map((c) => [a, c]));
  const mod2 = Z.mod2;
  assert.deepEqual(R.filter((a) => Z.alpha(a) === 0), [0], "ker α = 0");
  const kerBeta = pairs.filter((b) => same(Z.beta(b), [0, 0]));
  assert.ok(kerBeta.every(([a, c]) => c === -2 * a) && kerBeta.length === R.filter((a) => Math.abs(2 * a) <= 12).length, "ker β = ℤ·(1, −2)");
  // exact at ker β: ker(ker β → ker γ) is the image of ker α = 0
  assert.deepEqual(kerBeta.filter((b) => Z.p(b) === 0), [[0, 0]]);
  // exact at ker γ: im(ker β → ker γ) = even integers = ker δ
  const imKerBeta = new Set(kerBeta.map(Z.p));
  for (const n of R) if (Math.abs(n) <= 12) assert.equal(imKerBeta.has(n), Z.delta(n) === 0, `n = ${n}`);
  // exact at coker α: δ is onto ℤ/2ℤ and coker α → coker β is zero, since (a, 0) = β(0, a)
  assert.deepEqual(new Set(R.map(Z.delta)), new Set([0, 1]));
  for (const a of R) assert.ok(same(Z.i(a), Z.beta([0, a])));
  // coker β = ℤ² / (ℤ × 0) ≅ ℤ via c, and coker β → coker γ = ℤ is that isomorphism (exact at coker β)
  for (const [u, v] of pairs) assert.equal(pairs.some((b) => same(Z.beta(b), [u, v])), v === 0);
  assert.deepEqual(SL.Z_SEQUENCE.map((z) => z.value), ["0", "ℤ·(1, −2)", "ℤ", "ℤ/2ℤ", "ℤ (via c)", "ℤ"]);
  assert.equal(mod2(-3), 1);
});

/* ---------- the proof as a dependency graph ---------- */

test("the proof-dependency graph is well formed and every state names what it uses", () => {
  for (const [id, n] of Object.entries(SL.GRAPH)) for (const d of n.needs) assert.ok(SL.GRAPH[d], `${id} needs unknown ${d}`);
  const order = SL.closure(Object.keys(SL.GRAPH));
  assert.equal(new Set(order).size, Object.keys(SL.GRAPH).length, "acyclic: every node is reached once");
  for (const s of SL.ALL_STATES) for (const u of s.uses) assert.ok(SL.GRAPH[u], `${s.id} uses unknown ${u}`);
  // the spec's own examples
  assert.deepEqual(SL.GRAPH["lift-c-prime"].needs, ["p-prime-surjective"]);
  assert.ok(SL.GRAPH["beta-in-kernel-p"].needs.includes("right-square-commutes") && SL.GRAPH["beta-in-kernel-p"].needs.includes("gamma-c-prime-zero"));
  assert.ok(SL.GRAPH["solve-for-a"].needs.includes("exact-at-B"));
  assert.deepEqual(SL.HYPOTHESES.map((h) => h.label), ["upper row exact", "lower row exact", "left square commutes", "right square commutes", "i injective", "p′ surjective"]);
  // the δ construction rests on exactly the four hypotheses it should, well-definedness on all six
  assert.deepEqual(new Set(SL.hypothesesOf(["define-delta"])), new Set(["p-prime-surjective", "right-square-commutes", "exact-at-B", "i-injective"]));
  assert.deepEqual(new Set(SL.hypothesesOf(["delta-well-defined"])), new Set(SL.HYP_IDS));
});

test("Break assumptions: the proof stops at the first move that depends on a switched-off hypothesis", () => {
  const ids = SL.PROOF.map((s) => s.id);
  const stop = (off) => SL.blockedAt(SL.PROOF, off);
  assert.equal(stop([]), null);
  assert.equal(stop(["p-prime-surjective"]).state, "proof/lift");
  assert.equal(stop(["p-prime-surjective"]).message, "Cannot continue. To lift c′ to B′ you need: p′ : B′ → C′ to be surjective.");
  assert.equal(stop(["right-square-commutes"]).state, "proof/commutativity");
  assert.equal(stop(["exact-at-B"]).state, "proof/exactness");
  assert.equal(stop(["i-injective"]).state, "proof/exactness");
  assert.equal(stop(["exact-at-B-prime"]).state, "proof/another-lift");
  assert.equal(stop(["left-square-commutes"]).state, "proof/well-defined");
  // in general: the first state whose dependency closure contains the hypothesis, and nothing earlier
  for (const h of SL.HYP_IDS) {
    const b = stop([h]), first = SL.PROOF.findIndex((s) => SL.hypothesesOf(s.uses).includes(h));
    assert.equal(b.index, first, h);
    assert.equal(b.hypothesis, h);
    assert.match(b.message, /^Cannot continue\. .+ you need: .+\.$/);
    assert.ok(ids.slice(0, b.index).every((id) => !SL.hypothesesOf(SL.stateById(id).uses).includes(h)));
  }
  // with two switched off, the earlier stop wins
  assert.equal(stop(["left-square-commutes", "right-square-commutes"]).state, "proof/commutativity");
  for (const seq of SL.EXACT_IDS) for (const h of SL.HYP_IDS) {
    const b = SL.blockedAt(SL.EXACT[seq].steps, [h]);
    if (b) assert.ok(SL.hypothesesOf(SL.EXACT[seq].steps[b.index].uses).includes(h), `${seq} ${h}`);
  }
});

test("the proof trace reads as a program, with a reason for every step and the lift marked as a choice", () => {
  const i = SL.PROOF.findIndex((s) => s.id === "proof/quotient");
  const t = SL.trace(SL.PROOF, i);
  assert.deepEqual(t.map((x) => x.node), ["gamma-c-prime-zero", "lift-c-prime", "compute-beta", "beta-in-kernel-p", "solve-for-a", "a-unique", "quotient-a"]);
  assert.ok(t.every((x) => x.reason));
  assert.deepEqual(t.filter((x) => x.choice).map((x) => x.node), ["lift-c-prime"]);
  assert.deepEqual(t.find((x) => x.node === "lift-c-prime").hypotheses, ["p′ surjective"]);
});

/* ---------- the Chase Lab: moves generated from the mathematics ---------- */

const CONSTRUCT = ["lift.pp", "apply.beta", "push.p", "kernel.p", "exact.B", "solve.i", "quotient"];
test("the Chase Lab constructs δ(c′) with the guided proof's moves, each one offered only when legal", () => {
  let lab = SL.labStart("c");
  assert.deepEqual(SL.labMoves(lab, []).moves.map((m) => m.id), ["apply.gamma", "lift.pp"], "from c′: apply γ or choose a lift through p′");
  for (const op of CONSTRUCT) {
    const moves = SL.labMoves(lab, []).moves.map((m) => m.id);
    assert.ok(moves.includes(op), `${op} is offered (offered: ${moves})`);
    lab = SL.labApply(lab, op, []);
  }
  assert.equal(SL.show(lab.token.x), "[a]");
  assert.equal(lab.quotient, "coker α");
  assert.equal(SL.labOutcome(lab).done, true);
  const facts = lab.facts.map(SL.factText);
  for (const f of ["p′(b′) = c′", "p(β(b′)) = 0", "β(b′) ∈ ker p", "β(b′) ∈ im i", "i(a) = β(b′)"]) assert.ok(facts.includes(f), f);
  // the commutativity move is the chain the guided proof animates
  assert.deepEqual(lab.history[2].chain, ["p(β(b′))", "γ(p′(b′))", "γ(c′)", "0"]);
  assert.deepEqual(lab.history.map((h) => h.choice), [true, false, false, false, false, false, false], "only the lift is a choice");
  // every fact keeps its justification chain back to the givens
  const kerP = lab.facts.find((f) => SL.factText(f) === "β(b′) ∈ ker p");
  assert.deepEqual(SL.justification(lab, kerP.id).map((c) => c.text), ["p′(b′) = c′", "γ(c′) = 0", "p(β(b′)) = 0", "β(b′) ∈ ker p"]);
  // illegal moves are never offered: no moving back along i before exactness has been used
  const early = SL.labReplay("c", CONSTRUCT.slice(0, 3), []);
  assert.ok(!SL.labMoves(early, []).moves.some((m) => m.id === "solve.i"));
  assert.ok(SL.labMoves(early, []).blocked.some((b) => /not justified yet/.test(b.reason)));
  // replay is deterministic and drops anything that is not (or no longer) legal
  assert.deepEqual(SL.labReplay("c", [...CONSTRUCT, "apply.p"], []).ops, CONSTRUCT);
  assert.deepEqual(SL.labReplay("c", ["solve.i", ...CONSTRUCT], []).ops, []);
  assert.deepEqual(JSON.stringify(SL.labReplay("c", CONSTRUCT, [])), JSON.stringify(SL.labReplay("c", CONSTRUCT, [])));
});

test("switching off a hypothesis removes exactly the lab moves it pays for", () => {
  const offLift = SL.labMoves(SL.labStart("c"), ["p-prime-surjective"]);
  assert.deepEqual(offLift.moves.map((m) => m.id), ["apply.gamma"]);
  assert.match(offLift.blocked[0].reason, /p′ : B′ → C′ to be surjective/);
  assert.deepEqual(SL.labReplay("c", CONSTRUCT, ["right-square-commutes"]).ops, CONSTRUCT.slice(0, 2));
  assert.deepEqual(SL.labReplay("c", CONSTRUCT, ["exact-at-B"]).ops, CONSTRUCT.slice(0, 4));
});

test("the other lab starts reach their exactness conclusions, and an arbitrary element stalls", () => {
  const b = SL.labReplay("b", ["kernel.pp", "exact.Bp", "solve.ip", "apply.alpha", "push.i", "inject.i", "kernel.alpha"], []);
  assert.equal(b.ops.length, 7, `stopped at ${b.ops}`);
  assert.equal(SL.labOutcome(b).done, true);
  assert.ok(b.facts.map(SL.factText).includes("a′ ∈ ker α"));
  const a = SL.labReplay("a", ["apply.i", "solve.beta", "apply.pp", "push.gamma", "kernel.gamma"], []);
  assert.equal(a.ops.length, 5, `stopped at ${a.ops}`);
  assert.equal(SL.labOutcome(a).done, true);
  assert.deepEqual(a.history[3].chain, ["γ(p′(b′))", "p(β(b′))", "p(i(a))", "0"]);
});

/* ---------- stable URL state ---------- */

test("every state has a stable hash that round-trips, including the spec's examples", () => {
  const spec = { "#proof/start": "proof/start", "#proof/lift": "proof/lift", "#proof/commutativity": "proof/commutativity", "#proof/exactness": "proof/exactness",
    "#proof/quotient": "proof/quotient", "#proof/well-defined": "proof/well-defined", "#exact/ker-gamma": "exact/ker-gamma/start", "#exact/coker-alpha": "exact/coker-alpha/start",
    "#example/integer": "example/integer", "#lab": "lab" };
  for (const [hash, id] of Object.entries(spec)) {
    const s = SL.decodeHash(hash);
    assert.equal(s.id, id, hash);
    assert.equal(SL.encodeHash(s), hash, `${hash} encodes back to itself`);
  }
  const all = [...SL.ALL_STATES.map((s) => ({ mode: s.id.startsWith("exact/") ? "exact" : "proof", id: s.id })),
    ...range(-5, 5).flatMap((k) => range(-3, 3).map((c) => ({ mode: "example", k, c, view: k % 2 ? "mod" : "raw", lifts: 3 }))),
    ...SL.LAB_START_IDS.map((start) => ({ mode: "lab", start, ops: start === "c" ? CONSTRUCT : [] })),
    { mode: "proof", id: "proof/lift", off: ["p-prime-surjective", "i-injective"] }, { mode: "proof", id: "proof/well-defined", view: "mod", lifts: 4 }];
  for (const s0 of all) {
    const s = SL.normalize(s0), h = SL.encodeHash(s), back = SL.decodeHash(h);
    assert.deepEqual(back, s, h);
    assert.equal(SL.encodeHash(back), h);
  }
  assert.equal(SL.encodeHash(SL.decodeHash("#exact/ker-gamma?step=3")), "#exact/ker-gamma?step=3");
  assert.equal(SL.decodeHash("#exact/ker-gamma?step=3").id, "exact/ker-gamma/correct");
  assert.equal(SL.encodeHash(SL.decodeHash("#lab?ops=lift.pp,apply.beta")), "#lab?ops=lift.pp,apply.beta");
  // nonsense degrades to a sensible state instead of failing
  assert.equal(SL.decodeHash("#nowhere").id, "proof/start");
  assert.equal(SL.decodeHash("#example/integer?k=99&c=-99").k, 5);
  assert.equal(SL.decodeHash("#example/integer?k=99&c=-99").c, -3);
  assert.deepEqual(SL.decodeHash("#proof/lift?off=bogus,i-injective").off, ["i-injective"]);
  assert.deepEqual(SL.decodeHash("#lab?ops=solve.i,lift.pp").ops, []);
  assert.equal(SL.encodeHash(SL.decodeHash("")), "#proof/start");
});

/* ---------- beamdswitch export ---------- */

const PROSE = /[^\x20-\x7e]/; // narration is plain ASCII speech
const switches = (frame) => frame.children.filter((c) => c.type === "md").flatMap((c) =>
  [...c.text.matchAll(/^\[\/\/\]: # "beam-md-switch visual=snake-lemma state=(\S+) switch=(\d+)"$/gm)].map((m) => ({ ref: m[1], n: +m[2], step: c.step })));

test("every preset is a deterministic beamdswitch deck that keeps the page's reveal order", () => {
  for (const preset of SL.PRESET_IDS) {
    const md = T.deck(SL.report(preset)), what = `preset ${preset}`;
    assert.equal(T.deck(SL.report(preset)), md, `${what} is deterministic`);
    const deck = assertStandardDeck(md, what);
    assert.equal(deck.meta.voice, "bf_emma");
    assert.equal(deck.meta.title, "The Snake Lemma");
    for (const f of deck.frames) assert.doesNotMatch(f.narration, PROSE, `${what}: "${f.title}" narration is plain speech`);
    // each `. . .` overlay step of a frame carries exactly one state, in order
    const refs = [];
    for (const f of deck.frames.filter((f) => f.kind === "frame")) {
      const sw = switches(f);
      assert.ok(sw.length > 0, `${what}: "${f.title}" names its states`);
      assert.equal(f.steps, sw.length, `${what}: "${f.title}" has one overlay step per state`);
      sw.forEach((s, i) => { assert.equal(s.n, i + 1); assert.equal(s.step, i, `${what}: "${f.title}" switch ${s.n} is revealed on step ${i + 1}`); });
      assert.ok(f.notes.length > 0, `${what}: "${f.title}" has speaker notes`);
      refs.push(...sw.map((s) => s.ref));
    }
    // the reveals are the presentation sequence, and every one is a real state of the page
    assert.deepEqual(refs, SL.presentation(preset).map((p) => p.ref), `${what}: deck order is the presentation order`);
    for (const ref of refs) assert.ok(SL.resolveState(ref).state, `${what}: ${ref} is a page state`);
    assert.equal(md.split("\n").filter((l) => l === "---").length, 2, "only the front matter uses ---: slides are frames, not --- separators");
    assert.doesNotMatch(md, /<!--|-->/, "no raw HTML: beamdswitch would print it on the slide");
  }
  const frames = (p) => parseDeck(T.deck(SL.report(p))).frames.filter((f) => f.kind === "frame").length;
  assert.ok(frames("short") >= 7 && frames("short") <= 9, `Short is about 8 slides (${frames("short")})`);
  assert.ok(frames("standard") >= 18 && frames("standard") <= 21, `Standard is about 20 slides (${frames("standard")})`);
  assert.ok(frames("full") > frames("standard"));
  const full = parseDeck(T.deck(SL.report("full"))).frames.map((f) => f.title);
  for (const t of ["Exactness at ker β", "Exactness at ker γ", "Exactness at coker α", "Exactness at coker β", "Concrete ℤ example"]) assert.ok(full.includes(t), `Full includes ${t}`);
  // the standard deck follows the spec's sequence
  assert.deepEqual(parseDeck(T.deck(SL.report("standard"))).frames.filter((f) => f.kind === "frame").map((f) => f.title), [
    "The commutative diagram", "What must be constructed?", "Start with c′ ∈ ker γ", "Lift c′ to B′", "Move down by β", "Use commutativity", "Use exactness", "Pass to coker α",
    "The connecting morphism δ", "Why the lift is not unique", "Why the answer is well-defined", "The full snake sequence", "Exactness at ker γ", "Exactness at coker α",
    "Concrete ℤ example", "Change the lift", "Quotient kills the ambiguity", "Chase Lab", "The proof as a diagram chase"]);
  // the commutativity slide reveals the question first, then the square
  const commute = parseDeck(T.deck(SL.report("standard"))).frames.find((f) => f.title === "Use commutativity");
  assert.deepEqual(switches(commute).map((s) => s.ref), ["proof/ask", "proof/commutativity"]);
});

test("Export this chase: the lab's own moves become a mini deck, in order, deterministically", () => {
  const md = T.deck(SL.labReport("c", CONSTRUCT, []));
  assert.equal(T.deck(SL.labReport("c", CONSTRUCT, [])), md);
  const deck = assertStandardDeck(md, "lab chase");
  assert.equal(deck.meta.voice, "bf_emma");
  const method = deck.frames.filter((f) => f.section === "Method" && f.kind === "frame");
  assert.deepEqual(method.map((f) => f.title), ["1. Chosen lift (choice)", "2. Apply a map", "3. Commuting-square rewrite", "4. Kernel inference", "5. Exactness inference", "6. Exactness inference", "7. Quotient"]);
  method.forEach((f, i) => assert.equal(switches(f)[0].ref, `lab?ops=${CONSTRUCT.slice(0, i + 1).join(",")}`, "each frame names the lab state after its move"));
  assert.match(deck.frames.find((f) => f.title === "Where the element ended").children.map((c) => c.text).join("\n"), /\[a\] in coker α/);
  for (const f of deck.frames) assert.doesNotMatch(f.narration, PROSE);
  // a different chase gives a different deck; an empty chase still opens
  assert.notEqual(T.deck(SL.labReport("b", ["kernel.pp"], [])), md);
  assertStandardDeck(T.deck(SL.labReport("a", [], [])), "empty chase");
});

/* ---------- challenges, palette and catalogue ---------- */

test("challenges answer in non-judgemental language and name the fact that would justify the move", () => {
  for (const c of SL.CHALLENGES.filter((c) => c.kind === "choose")) for (const o of c.options) {
    const r = SL.challengeResponse(c.id, o);
    assert.doesNotMatch(r.text, /\b(wrong|bad|incorrect|mistake|fail)/i, `${c.id} ${o}`);
    assert.equal(r.justified, o === c.answer);
    if (!r.justified) assert.match(r.text, /^This move is not justified yet/);
  }
  assert.equal(SL.CHALLENGES.length, 6);
  const labels = SL.COMMANDS.map((c) => c.label);
  for (const l of ["Construct δ", "Why is δ well-defined?", "Exactness at ker γ", "Exactness at coker α", "Integer example", "Try another lift", "Show hypotheses", "Break commutativity", "Reset chase", "Presentation mode", "Export Beam MD Switch"]) assert.ok(labels.includes(l), l);
  for (const c of ["kernel", "cokernel", "lift", "exactness", "commutativity", "quotient", "connecting morphism"]) assert.ok(SL.CONCEPTS.some((x) => x.label === c), c);
  for (const c of [...SL.COMMANDS, ...SL.CONCEPTS].filter((c) => c.hash)) assert.equal(SL.encodeHash(SL.decodeHash(c.hash)), c.hash, c.hash);
});

test("the abelian-category note is exact and nothing claims arbitrary abelian categories have elements", () => {
  assert.equal(SL.ABELIAN_NOTE, "The Snake Lemma is valid in any abelian category. The moving-element visualisation models the familiar proof in modules/abelian groups; it should not imply that arbitrary abelian categories literally have elements.");
  const html = read("index.html");
  const doc = html.slice(html.indexOf('<article class="doc"'), html.indexOf("</article>"));
  assert.ok(doc.includes(SL.ABELIAN_NOTE), "the no-JavaScript document carries the note too");
});

/* ---------- the page: one self-contained file ---------- */

test("the page is built from its sources, inlines the shared template and needs nothing else", () => {
  execFileSync(process.execPath, ["build.mjs", "--check"], { cwd: new URL("../", import.meta.url) });
  const html = read("index.html");
  assertTemplateCopy();
  assertInlined(html, "beamdswitch", read("tests/fixtures/beamdswitch/template.js"), "snake-lemma");
  assertInlined(html, "snake-lemma-engine", read("src/engine.js"), "snake-lemma");
  assertInlined(html, "snake-lemma-ui", read("src/ui.js"), "snake-lemma");
  assert.match(html, /<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'/);
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+rel="stylesheet"|<img[^>]+src="(?!data:)/, "no external scripts, styles or images");
  // no-JavaScript fallback: the diagram, the sequence, the six steps, well-definedness and the ℤ example
  const doc = html.slice(html.indexOf('<article class="doc"'), html.indexOf("</article>"));
  for (const s of ["0 → A′ → B′ → C′ → 0", "ker α → ker β → ker γ —δ→ coker α → coker β → coker γ", "Constructing δ in six moves", "Why δ is well defined", "A concrete example over ℤ", "δ(n) = n mod 2"]) assert.ok(doc.includes(s), s);
  for (const s of ["Start in the kernel.", "Lift left (a choice).", "Move down.", "Discover a kernel condition.", "Move left by exactness.", "Pass to the quotient.", "At ker β:", "At ker γ:", "At coker α:", "At coker β:"]) assert.ok(doc.includes(s), `six construction steps and four exactness checks: ${s}`);
  assert.deepEqual(JSON.parse(read("raw.json")), JSON.parse(JSON.stringify(SL.catalogue())));
});

test("the page boots offline, exposes read-only WebMCP tools and exports the deck it shows", async () => {
  const page = await openPage("snake-lemma", { hash: "#exact/ker-gamma?step=3" });
  const tools = page.run("self.SnakeLemmaTools");
  assert.deepEqual([...tools.map((t) => t.name)], ["get_metadata", "get_current_state", "get_proof_state", "get_beamdswitch_deck"], "the tools the site's catalogue stub lists");
  assert.ok(tools.length >= 3 && tools.every((t) => t.annotations.readOnlyHint));
  const call = async (name, args = {}) => JSON.parse((await tools.find((t) => t.name === name).execute(args)).content[0].text);
  const cur = await call("get_current_state");
  assert.equal(cur.hash, "#exact/ker-gamma?step=3");
  assert.equal(cur.state, "exact/ker-gamma/correct");
  const meta = await call("get_metadata");
  assert.equal(meta.hypotheses.length, 6);
  assert.ok(meta.states.includes("proof/well-defined"));
  const lift = await call("get_proof_state", { state: "proof/lift" });
  assert.deepEqual(lift.uses, ["p′ surjective"]);
  const lab = await call("get_proof_state", { state: "lab?ops=lift.pp,apply.beta" });
  assert.ok(lab.lab.moves.some((m) => /commutativity/.test(m)));
  assert.equal((await call("get_beamdswitch_deck", { preset: "short" })).markdown, T.deck(SL.report("short")));
  // Download .md and Copy Markdown give the Standard deck by default
  await page.click("btn-download-md");
  assert.deepEqual(page.saved, [{ name: "snake-lemma-standard.md", text: T.deck(SL.report("standard")) }]);
  await page.click("btn-copy-md");
  assert.deepEqual(page.copied, [T.deck(SL.report("standard"))]);
  // in the Chase Lab, Export this chase is the default
  const labPage = await openPage("snake-lemma", { hash: `#lab?ops=${CONSTRUCT.join(",")}` });
  await labPage.click("btn-export");
  await labPage.click("btn-copy-md");
  assert.deepEqual(labPage.copied, [T.deck(SL.labReport("c", CONSTRUCT, []))]);
});
