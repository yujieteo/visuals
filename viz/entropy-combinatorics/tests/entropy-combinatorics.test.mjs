/* The Entropy Methods in Combinatorics Lab: engine, lessons, decks and page.
   The engine and lessons are loaded from the built index.html, as the browser runs them. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { parseDeck, splitSentences } from "./fixtures/beamdswitch/deck.mjs";
import { standIn } from "./beamdswitch-deck-checks.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const html = read("index.html");
const script = (id) => new RegExp(`<script id="entropy-combinatorics-${id}">\\n([\\s\\S]*?)</script>`).exec(html)[1];
const ctx = vm.createContext({});
ctx.self = ctx;
for (const id of ["engine", "lessons", "render"]) vm.runInContext(script(id), ctx);
const E = ctx.EntropyLab, Ls = ctx.EntropyLessons, R = ctx.EntropyRender;
/* Engine values come from another vm realm; compare them as plain JSON. */
const J = (x) => JSON.parse(JSON.stringify(x, (k, v) => (typeof v === "bigint" ? v.toString() : v)));
const deq = (a, b, msg) => assert.deepEqual(J(a), J(b), msg);
const close = (a, b, tol = 1e-9, what = "") => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${what}: ${a} vs ${b}`);

test("index.html and raw.json are the current build of src/ and template.html", async () => {
  const { buildPage, buildData } = await import("../build.mjs");
  assert.equal(html, buildPage(), "run node build.mjs");
  assert.equal(read("raw.json"), buildData(), "run node build.mjs");
});

test("the page is self-contained: no external scripts, styles, fonts or requests", () => {
  assert.doesNotMatch(html, /<script[^>]+src=/i);
  assert.doesNotMatch(html, /<link[^>]+rel="stylesheet"/i);
  assert.doesNotMatch(html, /@import|@font-face|url\(\s*["']?https?:/i);
  assert.doesNotMatch(html, /\bfetch\(|XMLHttpRequest|new WebSocket|import\(/);
  for (const m of html.matchAll(/(?:src|href)="(https?:[^"]+)"/g)) assert.ok(/^https:\/\/teoyujie\.org\//.test(m[1]), `only links to the site: ${m[1]}`);
});

test("entropy, conditional entropy and mutual information from tables", () => {
  close(E.entropyCounts([1, 1, 1, 1]), 2, 1e-12, "uniform on 4");
  close(E.entropyCounts([6, 3, 2, 1]), -(0.5 * Math.log2(0.5) + 0.25 * Math.log2(0.25) + (1 / 6) * Math.log2(1 / 6) + (1 / 12) * Math.log2(1 / 12)), 1e-12, "(6,3,2,1)/12");
  assert.equal(E.entropyCounts([5, 0, 0]), 0);
  const parity = E.jointStats(E.range(8).map((x) => [x % 2 ? 0 : 1, x % 2 ? 1 : 0]));
  close(parity.HX, 3, 1e-12, "H(X)"); close(parity.HY, 1, 1e-12, "H(parity)"); close(parity.HXgY, 2, 1e-12, "H(X|Y)"); close(parity.I, 1, 1e-12, "I");
  const prod = E.jointStats([[1, 1, 1], [1, 1, 1]]);
  assert.ok(prod.independent); close(prod.I, 0, 1e-12, "product");
  const F = E.family("permutations", 4);
  close(E.Hcond(F, [1], [0]), Math.log2(3), 1e-12, "H(X2|X1)");
  close(E.kl([1, 1], [1, 1]), 0, 1e-12, "D(P||P)");
  assert.equal(E.kl([1, 1], [1, 0]), Infinity);
  close(E.kl([5, 3, 1, 1], [1, 1, 1, 1]), 2 - E.entropyCounts([5, 3, 1, 1]), 1e-12, "D(P||U) = log N − H");
});

test("counts are exact integers", () => {
  assert.equal(E.binom(60, 30), 118264581564861424n);
  assert.equal(E.factorial(25), 15511210043330985984000000n);
  assert.equal(E.multinomial([3, 2, 1]), 60n);
  assert.throws(() => E.binom(10, 2.5));
  close(E.log2Big(E.factorial(200)), [...Array(200)].reduce((a, _, i) => a + Math.log2(i + 1), 0), 1e-12, "log2(200!)");
});

test("binomial bounds, with the corrected spec examples", () => {
  const b103 = E.binomialBound(10, 3), b94 = E.binomialBound(9, 4);
  assert.equal(b103.exact, 120n); close(b103.bound, 449.7280292229677, 1e-12, "2^(10 h(0.3))");
  assert.equal(b94.exact, 126n); close(b94.bound, 484.2756112500004, 1e-12, "2^(9 h(4/9))");
  for (let n = 0; n <= 40; n++) for (let k = 0; k <= n; k++) {
    const b = E.binomialBound(n, k);
    assert.ok(b.log2Exact <= b.exponent + 1e-9, `C(${n},${k}) ≤ 2^(n h)`);
    assert.ok(b.bound <= b.ek * (1 + 1e-12), `2^(n h) ≤ (en/k)^k at ${n},${k}`);
  }
  for (let n = 1; n <= 30; n++) for (let k = 0; 2 * k <= n; k++) assert.ok(E.log2Big(E.hammingBall(n, k).exact) <= Math.log2(E.hammingBall(n, k).entropy) + 1e-9);
});

test("multinomial bounds hold on every type", () => {
  for (let n = 0; n <= 10; n++) for (const t of E.types(n, 3)) {
    assert.equal(t.exact, E.multinomial(t.parts));
    assert.ok(t.log2Exact <= t.exponent + 1e-9, `(${t.parts})`);
    assert.ok(t.log2Exact >= t.exponent - 3 * Math.log2(n + 1) - 1e-9, `lower bound at (${t.parts})`);
  }
});

test("the set-system bound: log |F| ≤ Σ h(p_i)", () => {
  const s = E.setSystem([[0, 2], [1, 2], [0, 3], [2, 4], [1, 3], [0, 4]], 5);
  assert.equal(s.size, 6n);
  deq([...s.counts], [3, 2, 3, 2, 2]);
  assert.ok(s.log2Size <= s.sum);
  assert.equal(E.setSystem([[0], [0], [1]], 3).size, 2n, "repeated sets count once");
  const all = E.setSystem(E.range(32).map((v) => E.range(5).filter((i) => (v >> i) & 1)), 5);
  close(all.sum, 5, 1e-12, "the power set is tight");
});

test("Shearer and combinatorial Shearer on small families", () => {
  const cyc = E.shearer(E.family("cyclic-no-adjacent", 4), [[0, 1], [1, 2], [2, 3], [3, 0]]);
  assert.equal(cyc.size, 7n); assert.equal(cyc.r, 2);
  assert.ok(cyc.entropyHolds); assert.equal(cyc.lhs, 49n); assert.equal(cyc.rhs, 81n);
  const full = E.shearer(E.family("all-binary", 4), [[0, 1], [1, 2], [2, 3], [3, 0]]);
  assert.ok(full.tight); close(full.rH, full.sumH, 1e-12, "equality on a product");
  const triples = E.shearer(E.family("even-weight", 4), [[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3]]);
  assert.equal(triples.r, 3); assert.ok(triples.countHolds);
  assert.equal(E.shearer(E.family("one-hot", 4), [[0, 1]]).r, 0, "an uncovered coordinate gives r = 0");
  for (let s = 0; s < 200; s++) {
    const g = E.lcg(s + 1), F = E.product([3, 3, 3]).filter(() => g() < 0.45);
    if (!F.length) continue;
    const r = E.shearer(F, [[0, 1], [1, 2], [0, 2]]);
    assert.ok(r.entropyHolds && r.countHolds, `random family ${s}`);
  }
});

test("Loomis–Whitney: |S|² ≤ |π_xy S| |π_xz S| |π_yz S|", () => {
  for (const [k, P] of Object.entries(Ls.POINTS3)) {
    const w = E.loomisWhitney(P.pts());
    assert.ok(w.holds, k);
    assert.equal(w.lhs, BigInt(w.size) ** 2n);
    assert.equal(w.rhs, w.proj.reduce((a, p) => a * BigInt(p.size), 1n));
  }
  const st = E.loomisWhitney(Ls.POINTS3.staircase.pts());
  assert.equal(st.size, 10); deq(st.proj.map((p) => p.size), [6, 6, 6]); assert.equal(st.rhs, 216n);
  assert.ok(E.loomisWhitney(Ls.POINTS3.box.pts()).tight);
  for (let s = 0; s < 300; s++) { const g = E.lcg(s + 99); assert.ok(E.loomisWhitney(E.product([4, 4, 4]).filter(() => g() < 0.3)).holds); }
});

test("fractional covers: validity, entropy and counting bounds", () => {
  const S = Ls.POINTS3.staircase.pts();
  const lw = E.fractionalCover(S, Ls.COVER_CANDIDATES[0].weights);
  assert.ok(lw.valid); deq([...lw.coverage], [1, 1, 1]);
  close(lw.countBound, Math.sqrt(216), 1e-12, "½,½,½ gives √(6·6·6)");
  assert.ok(lw.entropyBound >= lw.H - 1e-12);
  const short = E.fractionalCover(S, Ls.COVER_CANDIDATES[4].weights);
  assert.equal(short.valid, false);
  const best = E.bestCover(S, Ls.COVER_CANDIDATES);
  assert.equal(best.best.id, "lw");
  for (const c of best.scored) if (c.result.valid) assert.ok(c.result.countBound >= 10 - 1e-9, c.label);
});

test("permanents and Bregman on the matching-lab presets", () => {
  const c6 = E.bregman(Ls.MATCHINGS.c6.adj), k33 = E.bregman(Ls.MATCHINGS.k33.adj), fer = E.bregman(Ls.MATCHINGS.ferrers.adj);
  assert.equal(c6.permanent, 2n); close(c6.bound, 2 ** 1.5, 1e-12, "C6 bound 2^(3/2)"); assert.equal(c6.tight, false);
  assert.equal(k33.permanent, 6n); close(k33.bound, 6, 1e-12, "K33 bound"); assert.equal(k33.tight, true);
  assert.equal(fer.permanent, 8n, "Ferrers board with degrees 2, 3, 4, 4: 2·2·2·1");
  for (const g of Object.values(Ls.MATCHINGS)) {
    const b = E.bregman(g.adj);
    assert.equal(BigInt(E.perfectMatchings(g.adj).length), b.permanent, g.label);
    assert.ok(Number(b.permanent) <= b.bound * (1 + 1e-12), g.label);
    assert.ok(b.bound <= Number(b.naive) + 1e-9, `${g.label}: Bregman beats the product of degrees`);
  }
  assert.equal(E.permanent(E.range(6).map(() => E.range(6))), 720n);
});

test("random reveal: N_i is uniform on 1..d_i, so the average log is log(d_i!)/d_i", () => {
  for (const g of Object.values(Ls.MATCHINGS)) {
    const a = E.revealAverages(g.adj), b = E.bregman(g.adj);
    assert.ok(a.uniformEveryMatching, g.label);
    a.rows.forEach((r, i) => close(r.avgBits, b.rows[i].bits, 1e-12, `${g.label} row ${i + 1}`));
    close(a.totalBits, b.bits, 1e-12, g.label);
  }
  for (let d = 1; d <= 12; d++) { const id = E.averagingIdentity(d); close(id.average, id.logFactOverD, 1e-12, `d = ${d}`); }
  assert.equal(E.permutations(4).length, 24);
  deq(E.permutations(3).map((p) => p.join("")), ["012", "021", "102", "120", "201", "210"], "a fixed, deterministic list of orders");
  const t = E.revealTrajectory(Ls.MATCHINGS.k33.adj, [0, 1, 2], [2, 0, 1]);
  deq(t.steps.map((s) => s.N), [3, 2, 1]);
});

test("bits and nats: entropies rescale, counting bounds do not", () => {
  for (const bits of [0, 1, 3.7, 10 * E.h(0.3), E.bregman(Ls.MATCHINGS.c6.adj).bits]) {
    close(E.inUnit(bits, "nats"), bits * Math.LN2, 1e-12, "nats");
    close(E.countFrom(E.inUnit(bits, "nats"), "nats"), E.countFrom(bits, "bits"), 1e-12, "same count");
  }
});

test("the in-page self-tests all pass", () => {
  const T = Ls.selfTests();
  assert.ok(T.length >= 25);
  assert.equal(T.filter((x) => !x.pass).map((x) => x.name).join("\n"), "");
});

test("the lessons: 34, with stable deep links, problems and finite checks from the engine", () => {
  assert.equal(Ls.LESSONS.length, 34);
  const ids = new Set([...Ls.LESSONS.map((l) => l.id), ...Ls.LABS.map((l) => l.id)]);
  for (const frag of ["entropy", "support-bound", "chain-rule", "conditioning", "binary-entropy", "binomial", "mutual-information", "shearer", "fractional-cover", "loomis-whitney",
    "projection", "perfect-matchings", "bregman", "random-reveal", "compression", "typical-set", "method-of-types", "set-systems", "additive"]) assert.ok(ids.has(frag), `#${frag}`);
  assert.equal(Ls.PROBLEMS.length, 16);
  for (const p of Ls.PROBLEMS) assert.ok(Ls.byId(p.lesson), `problem ${p.level}`);
  assert.equal(new Set(Ls.PROBLEMS.map((p) => p.lesson)).size, 16, "each problem has its own visual model");
  for (const l of Ls.LESSONS) {
    assert.ok(l.proof.length && l.clever && l.widget.type, l.id);
    for (const r of l.related) assert.ok(ids.has(r), `${l.id} → ${r}`);
    assert.ok(Array.isArray(l.example(E).rows));
  }
  assert.equal(Ls.byId("bregman").hints.length, 6, "Bregman's six hints");
  assert.doesNotMatch(Ls.byId("bregman").hints.join(" "), /d_i!|factorial/, "the factorial term is not revealed early");
  assert.match(Ls.byId("antichains").theorem, /LYM/, "the antichain lesson separates intuition from the exact theorem");
});

test("every lesson's text renders with known TeX commands only", () => {
  const unknown = [], texts = [];
  for (const l of Ls.LESSONS) {
    for (const k of ["problem", "family", "randomObject", "theorem", "clever", "when", "equality", "slack", "solution"]) if (l[k]) texts.push(l[k]);
    texts.push(`$${l.identity}$`, l.example(E).md, ...l.proof.map((s) => s.md), ...(l.hints || []));
    for (const v of l.variables) texts.push(`$${v.sym}$ $${v.space}$ ${v.dist ? `$${v.dist}$` : ""} ${v.support ? `$${v.support}$` : ""}`);
  }
  for (const a of Ls.ATLAS) texts.push(`$${a.tex}$`);
  for (const x of Ls.FAILURES) texts.push(x.body);
  for (const c of Ls.COMPARISONS) for (const s of [c.left, c.right]) texts.push(...Object.values(s));
  for (const t of texts) R.md(t, unknown);
  assert.deepEqual([...new Set(unknown)], []);
  assert.match(R.md("$\\binom nk\\le2^{nh(k/n)}$"), /class="binom"/);
});

const SPEECH = /[$\\`*_#|<>×⁰¹²³⁴⁵⁶⁷⁸⁹⁻·∠°σ%&≈]/;
function checkDeck(md, what) {
  const deck = parseDeck(md);
  assert.equal(deck.meta.voice, "bf_emma", `${what}: voice`);
  assert.equal(deck.meta.title, "Entropy Methods in Combinatorics", what);
  assert.equal(deck.frames[0].kind, "title", what);
  assert.equal(md.match(/^::: narration$/gm).length, deck.frames.length, `${what}: one ::: narration per slide`);
  for (const f of deck.frames) {
    assert.ok(splitSentences(f.narration).length > 0, `${what}: "${f.title}" is narrated`);
    assert.doesNotMatch(f.narration, SPEECH, `${what}: "${f.title}" reads as speech: ${f.narration}`);
  }
  assert.equal(md.split("\n").filter((l) => l === "---").length, 2, `${what}: front matter only`);
  return deck;
}

test("every exported deck is a beamdswitch deck: voice, sections, frames, reveals, notes, narration", () => {
  for (const l of Ls.LESSONS) for (const kind of ["theorem", "proof", "problem"]) {
    const md = Ls.deck(kind, l.id), deck = checkDeck(md, `${kind} ${l.id}`);
    assert.ok(deck.frames.some((f) => f.kind === "section"), `${kind} ${l.id}: a # section`);
    assert.match(md, /<!-- beam-md-switch\nlesson: [a-z-]+\nstate: [a-z-]+\n-->/, `${kind} ${l.id}: lab state rides along`);
    if (kind === "proof") {
      const pf = deck.frames.find((f) => f.title.endsWith(": proof"));
      assert.equal(pf.steps, l.proof.length, `${l.id}: one logical move per reveal`);
    }
  }
  const core = Ls.deck("core", "counting"), deck = checkDeck(core, "core");
  const content = deck.frames.filter((f) => f.kind === "frame").length, sections = deck.frames.filter((f) => f.kind === "section").length;
  assert.equal(content, 27); assert.equal(sections, 6); assert.equal(deck.frames.length, 34);
  assert.ok(deck.frames.length >= 32 && deck.frames.length <= 40, `about 32–40 slides: ${deck.frames.length}`);
  assert.match(core, /^::: notes$/m);
  assert.match(core, /randomness is being added to the proof/);
  const breg = deck.frames.find((f) => f.title === "Bregman's theorem");
  assert.ok(breg.steps >= 9, "Bregman reveals its argument step by step");
});

test("the page boots in a stand-in DOM: WebMCP tools and the BeamMD Switch export", async () => {
  const { context, saved, copied, run, document, $ } = standIn({ globals: { CSS: { escape: (s) => String(s) } } });
  run(html);
  const tools = context.EntropyTools;
  // The site checks these names against its catalogue stub (data/visuals/entropy-combinatorics.yaml); here they are listed.
  deq(tools.map((t) => t.name), ["get_metadata", "get_current_state", "get_lesson", "compute_bound", "export_deck", "run_self_tests"]);
  for (const t of tools) assert.equal(t.annotations.readOnlyHint, true, t.name);
  const call = async (name, args = {}) => JSON.parse((await tools.find((t) => t.name === name).execute(args)).content[0].text);
  const meta = await call("get_metadata");
  assert.equal(meta.lessons.length, 34);
  const state = await call("get_current_state");
  assert.equal(state.lesson.id, "counting"); assert.equal(state.unit, "bits");
  const lesson = await call("get_lesson", { id: "bregman" });
  assert.equal(lesson.check[0].exact, "2"); assert.ok((await call("get_lesson", { id: "nope" })).error);
  assert.equal((await call("compute_bound", { kind: "binomial", n: 9, k: 4 })).exact, "126");
  const k33 = await call("compute_bound", { kind: "bregman", adjacency: [[0, 1, 2], [0, 1, 2], [0, 1, 2]] });
  assert.equal(k33.permanent, "6"); assert.equal(k33.tight, true);
  assert.equal((await call("compute_bound", { kind: "loomis_whitney", points: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]] })).holds, true);
  assert.ok((await call("compute_bound", { kind: "bregman", adjacency: [[5]] })).error);
  assert.match((await call("export_deck", { kind: "proof", lesson: "shearer" })).markdown, /^---\ntitle: Entropy Methods in Combinatorics/);
  assert.ok((await call("run_self_tests")).every((x) => x.pass));
  // The rendered page is the first lesson; the no-JavaScript reference is replaced.
  assert.match($("main").innerHTML, /Counting as information/);
  assert.match(document.title, /Counting as information/);
  // BeamMD Switch: download and copy write the deck of the current lesson.
  context.EntropyApp.go("#binomial");
  context.EntropyApp.route();
  context.EntropyApp.downloadDeck("proof");
  assert.equal(saved.length, 1); assert.equal(saved[0].name, "entropy-proof-binomial.md");
  const text = await saved[0].blob.text();
  checkDeck(text, "downloaded"); assert.match(text, /lesson: binomial/);
  await context.EntropyApp.copyDeck("core");
  assert.equal(copied.length, 1); checkDeck(copied[0], "copied");
  context.EntropyApp.setUnit("nats");
  assert.equal((await call("get_current_state")).unit, "nats");
});

test("the no-JavaScript reference covers spec §76 with the engine's numbers", () => {
  const main = /<main id="main" tabindex="-1">([\s\S]*?)<\/main>/.exec(html)[1];
  for (const id of ["intro", "concept-map", "inequalities", "binomial", "shearer", "loomis-whitney", "bregman", "techniques", "problems", "workflow"]) assert.match(main, new RegExp(`id="${id}"`), id);
  assert.match(main, /449\.728/, "2^(10 h(0.3)) from the engine");
  assert.match(main, /2\.828/, "C6 Bregman bound from the engine");
});
