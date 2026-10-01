import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createHash } from "node:crypto";
import { assertButtonsExport, assertInlined, assertStandardDeck, assertTemplateCopy, openPage, read } from "./data-visuals-beamdswitch.mjs";

const html = read("index.html");
const block = (id) => new RegExp(`<script id="${id}">\\n([\\s\\S]*?)</script>`).exec(html)[1];
const data = block("information-gain-phrases"), engine = block("information-gain-engine");
const load = () => { const ctx = {}; ctx.self = ctx; vm.runInNewContext(data, ctx); vm.runInNewContext(engine, ctx); return ctx.InformationGain; };
const D = (() => { const ctx = {}; ctx.self = ctx; vm.runInNewContext(data, ctx); return ctx.PhraseData; })();
const G = load();
const T = (await import("node:module")).createRequire(import.meta.url)("../beamdswitch.js");
const plain = (v) => JSON.parse(JSON.stringify(v));
const near = (x, y, e = 1e-9, what = "") => assert.ok(Math.abs(x - y) <= e, `${what} ${x} ≈ ${y}`);
const ig = (p, a, b) => G.analyze(p, G.binary(a, b));
const GRID = [0, 1e-9, 0.01, 0.1, 0.25, 0.5, 0.7, 0.9, 0.99, 1 - 1e-9, 1];
const finite = (x) => x === null || Number.isFinite(x);

test("the page's own self-tests all pass", () => {
  const t = G.selfTests();
  assert.ok(t.length >= 13);
  for (const r of t) assert.equal(r.pass, true, r.name);
});

test("binary entropy: 0 and 1 at the ends, 1 bit at 50%, symmetric", () => {
  assert.equal(G.entropy(0), 0);
  assert.equal(G.entropy(1), 0);
  assert.equal(G.entropy(0.5), 1);
  near(G.entropy(0.25), 0.8113, 1e-4);
  near(G.entropy(0.9), 0.469, 1e-3);
  near(G.entropy(0.99), 0.0808, 1e-4);
  for (const p of GRID) near(G.entropy(p), G.entropy(1 - p), 1e-12, `h(${p})`);
  assert.equal(G.entropy(NaN), null);
});

test("key acceptance: 1 bit at 50%, 0 bits for a useless check at every prior, prior entropy for a perfect check", () => {
  near(ig(0.5, 1, 0).ig, 1, 1e-12, "perfect at 50%");
  near(ig(0.5, 0, 1).ig, 1, 1e-12, "perfect, reversed");
  for (const p of GRID) {
    for (const a of [0, 0.3, 0.7, 1]) assert.equal(ig(p, a, a).ig, 0, `useless ${a} at ${p}`);
    near(ig(p, 1, 0).ig, G.entropy(p), 1e-12, `perfect at ${p}`);
  }
});

test("expected information gain = mutual information = expected KL, never negative or NaN, at every edge", () => {
  const ps = [...GRID, 0.3, 0.83], ls = [0, 1e-12, 0.05, 0.2, 0.5, 0.85, 0.95, 1];
  for (const p of ps) for (const a of ls) for (const b of ls) {
    const z = ig(p, a, b), what = `p=${p} a=${a} b=${b}`;
    for (const v of [z.entropy, z.expectedEntropy, z.ig, z.mi, z.expectedKL]) assert.ok(Number.isFinite(v) && v >= 0, what);
    near(z.ig, z.mi, 1e-9, what);
    near(z.ig, z.expectedKL, 1e-9, what);
    assert.ok(z.ig <= z.entropy + 1e-12, what);
    for (const o of z.outcomes) {
      for (const v of [o.prob, o.posterior, o.kl, o.surprisal, o.entropyAfter]) assert.ok(finite(v), what);
      if (!o.possible) assert.deepEqual([o.prob, o.posterior, o.kl, o.surprisal], [0, null, null, null], what);
    }
    near(z.outcomes[0].prob + z.outcomes[1].prob, 1, 1e-12, what);
  }
});

test("posteriors, belief change and surprise follow Bayes, with limits rather than errors", () => {
  const r = ig(0.7, 0.85, 0.2), [e, n] = r.outcomes;
  near(e.prob, 0.655);
  near(e.posterior, 0.595 / 0.655);
  near(n.posterior, 0.105 / 0.345);
  near(e.kl, 0.9084 * Math.log2(0.9084 / 0.7) + 0.0916 * Math.log2(0.0916 / 0.3), 1e-3);
  near(e.surprisal, -Math.log2(0.655));
  assert.equal(G.pctText(e.posterior), "91%");
  assert.equal(G.bitsText(e.entropyAfter), "0.44 bits");
  // A result that rules out not-H settles the belief at 100%.
  const settle = ig(0.3, 0.6, 0).outcomes[0];
  assert.equal(settle.posterior, 1);
  near(settle.kl, -Math.log2(0.3), 1e-12, "KL to certainty is −log₂ p");
  // P(E) = 0: the result cannot happen, nothing is divided by zero.
  const never = ig(0.4, 0, 0).outcomes[0];
  assert.equal(never.possible, false);
  // Exact 0% and 100% priors cannot move.
  for (const p of [0, 1]) for (const o of ig(p, 0.9, 0.1).outcomes) assert.ok(!o.possible || (o.posterior === p && o.kl === 0));
  assert.equal(G.kl(0.5, 0), null);
  assert.equal(G.kl(0, 0), 0);
  assert.equal(G.surprisal(0), null);
  assert.equal(G.surprisal(1), 0);
});

test("information per unit time: minutes internally, a sensible display unit, zero time is essentially free", () => {
  near(G.rate(0.42, 1).perMin, 0.42);
  assert.equal(G.rateText(G.rate(0.42, 1)), "0.42 bits/min");
  assert.equal(G.rateText(G.rate(0.9, 5 * G.UNITS.s)), "0.18 bits/sec");
  assert.equal(G.rateText(G.rate(0.5, 3 * G.UNITS.h)), "0.17 bits/hour");
  assert.equal(G.rateText(G.rate(0.5, 30 * G.UNITS.d)), "0.02 bits/day");
  assert.equal(G.rateText(G.rate(0, 5)), "0 bits/min");
  assert.equal(G.rate(0.3, 0).kind, "free");
  assert.equal(G.rateText(G.rate(0.3, 0)), "Essentially free");
  assert.equal(G.rateText(G.rate(0.3, null)), "No time entered");
  assert.equal(G.minutes({ free: true, value: 9, unit: "h" }), 0);
  assert.equal(G.minutes({ free: false, value: 90, unit: "s" }), 1.5);
  assert.equal(G.minutes({ free: false, value: null, unit: "min" }), null);
  assert.equal(G.timeText({ free: false, value: 30, unit: "s" }), "30 s");
  assert.equal(G.minutesText(0.5), "30 s");
  assert.equal(G.minutesText(180), "3 h");
});

test("sequential updates recompute every remaining check from the new belief", () => {
  const s = G.defaults(), before = G.evaluate(s);
  s.trail = [{ id: "c1", outcome: 0 }];
  const after = G.evaluate(s), st = after.steps[0];
  near(st.after, 0.595 / 0.655);
  near(after.belief, st.after);
  assert.equal(after.rows[0].observed, true);
  for (const id of ["c2", "c4"]) {
    const was = before.rows.find((r) => r.id === id), now = after.rows.find((r) => r.id === id);
    near(now.ig, ig(after.belief, now.a, now.b).ig, 1e-12, id);
    assert.ok(now.ig < was.ig, `${id} teaches less once the host has answered`);
  }
  s.trail.push({ id: "c2", outcome: 0 });
  const two = G.evaluate(s);
  near(two.belief, (0.7 * 0.85 * 0.9) / (0.7 * 0.85 * 0.9 + 0.3 * 0.2 * 0.15), 1e-12, "two updates = one joint update");
  assert.deepEqual(plain(two.steps.map((x) => x.id)), ["c1", "c2"]);
  assert.equal(G.evaluate({ ...s, trail: [{ id: "c1", outcome: 0 }, { id: "c1", outcome: 1 }] }).steps.length, 1, "a check is observed once");
  // An impossible result stops the replay rather than producing NaN.
  const imp = G.scenario({ prior: { pct: 100 }, checks: [{ id: "c1", a: { pct: 0 }, b: { pct: 50 } }], trail: [{ id: "c1", outcome: 0 }] });
  assert.equal(G.evaluate(imp).steps.length, 0);
});

test("two rankings, a time budget and a best next check only under an explicit objective", () => {
  const E = G.evaluate(G.defaults());
  assert.equal(E.most.name, "Simply wait another 10 minutes");
  assert.equal(E.fastest.name, "Ask the host for an estimate");
  assert.deepEqual(plain(E.byInfo.map((r) => r.id)), ["c4", "c2", "c1", "c3"]);
  assert.deepEqual(plain(E.byRate.map((r) => r.id)), ["c1", "c2", "c4", "c3"]);
  assert.equal(E.best, null, "never silently choose an objective");
  assert.deepEqual(plain(E.explain), [
    "“Simply wait another 10 minutes” could teach you more overall, but it takes much longer.",
    "“Ask the host for an estimate” gives less information than “Simply wait another 10 minutes”, but much more information per minute."]);
  assert.equal(G.evaluate({ ...G.defaults(), objective: "most" }).best.id, "c4");
  assert.equal(G.evaluate({ ...G.defaults(), objective: "fastest" }).best.id, "c1");
  const b = G.evaluate({ ...G.defaults(), objective: "most", budget: { on: true, value: 5, unit: "min" } });
  assert.deepEqual(plain(b.rows.map((r) => r.fits)), [true, true, true, false]);
  assert.equal(b.best.id, "c2", "the most informative check that fits in 5 minutes");
  assert.equal(G.evaluate({ ...G.defaults(), objective: "most", budget: { on: true, value: 10, unit: "s" } }).best, null);
  // Free informative checks rank first per unit time; checks with no time are not ranked per minute.
  const x = G.scenario({ prior: { pct: 50 }, checks: [
    { name: "timed", time: { value: 1, unit: "s" }, a: { pct: 99 }, b: { pct: 1 } },
    { name: "free", time: { free: true }, a: { pct: 60 }, b: { pct: 40 } },
    { name: "free but useless", time: { value: 0, unit: "min" }, a: { pct: 50 }, b: { pct: 50 } },
    { name: "no time", a: { pct: 90 }, b: { pct: 10 } }] });
  const R = G.evaluate(x);
  assert.deepEqual(plain(R.byRate.map((r) => r.name)), ["free", "timed", "free but useless"]);
  assert.equal(R.most.name, "timed");
  assert.equal(R.fastest.name, "free");
  assert.equal(R.rows[3].rate.kind, "unknown");
  assert.equal(G.evaluate({ ...x, budget: { on: true, value: 1, unit: "min" } }).rows[3].fits, false, "an unknown time never fits a budget");
});

test("diagnosticity wording is a deterministic consequence of the numbers", () => {
  const d = (p, a, b) => G.diagnose(p, a, b, ["A", "B"], ig(p, a, b));
  assert.equal(d(0.5, 0.7, 0.7).headline, "You are equally likely to see this result either way. So observing it cannot help distinguish the two possibilities.");
  assert.deepEqual(plain(d(0.5, 0.7, 0.7).lines), []);
  assert.match(d(0.5, 1, 0).headline, /settles the question/);
  assert.match(d(0.5, 0.52, 0.5).headline, /could easily produce the same result/);
  assert.equal(d(0.5, 0.95, 0.05).tag, "highly diagnostic");
  // P(positive | H) = 90%, P(positive | not H) = 60%: the negative result matters more.
  assert.ok(d(0.5, 0.9, 0.6).lines.includes("“B” would matter much more than “A”."));
  assert.ok(d(0.5, 0.9, 0.6).lines.includes("“B” would strongly count against the hypothesis."));
  assert.ok(d(0.5, 0.3, 0.02).lines.includes("This check is useful mainly because “A” would be very surprising if the hypothesis were false."));
  assert.ok(d(0.97, 0.9, 0.1).lines.includes("You are already quite sure, so even a good check has less uncertainty left to remove."));
  assert.ok(d(1, 0.9, 0.1).lines.includes(G.EXTREME));
  assert.ok(d(0.5, 0.6, 0).lines.includes("“A” would settle it: it cannot happen if the hypothesis is false."));
  assert.equal(JSON.stringify(d(0.4, 0.8, 0.3)), JSON.stringify(load().diagnose(0.4, 0.8, 0.3, ["A", "B"], ig(0.4, 0.8, 0.3))), "same words from a fresh engine");
  assert.equal(G.uncertaintyWords(0.5), "maximum uncertainty");
  assert.equal(G.uncertaintyWords(0.9), "fairly sure");
  assert.equal(G.uncertaintyWords(0.99), "almost settled");
  assert.equal(G.uncertaintyWords(1), "no uncertainty left under this model");
  assert.equal(G.learningWord(0), "none");
  assert.equal(G.learningWord(0.42), "large");
});

test("realised learning is told apart from expected learning", () => {
  // A usually-uninformative check that produced its rare, telling result.
  const s = G.scenario({ prior: { pct: 50 }, checks: [{ id: "c1", a: { pct: 12 }, b: { pct: 1 } }], trail: [{ id: "c1", outcome: 0 }] });
  const st = G.evaluate(s).steps[0], R = G.realised(st);
  assert.ok(st.kl > 2 * st.expected && st.prob < 0.25);
  assert.match(R.lines[0], /usually teach little/);
  // A result that raises uncertainty still counts as information.
  const up = G.evaluate(G.scenario({ prior: { pct: 90 }, checks: [{ id: "c1", a: { pct: 10 }, b: { pct: 60 } }], trail: [{ id: "c1", outcome: 0 }] })).steps[0];
  assert.ok(up.entropyAfter > up.entropyBefore && up.kl > 0);
  assert.ok(G.realised(up).lines.some((l) => /uncertainty went up/.test(l)));
});

test("inputs: percentages are validated, blank and invalid values never reach the maths", () => {
  assert.deepEqual(plain(G.parsePct("70")), { ok: true, value: 70, error: null });
  assert.equal(G.parsePct(" 12.5 % ").value, 12.5);
  for (const bad of ["", "abc", "-1", "101", "1e5", "NaN", "Infinity", "7O"]) assert.equal(G.parsePct(bad).ok, false, bad);
  const s = G.scenario({ prior: { pct: "70" }, checks: [{ a: { pct: -3 }, b: { pct: 200 } }, null, { id: "c1" }], trail: [{ id: "nope", outcome: 0 }, { id: "c1", outcome: 7 }], level: 9, objective: "both" });
  assert.equal(s.prior.pct, null);
  assert.deepEqual(plain(s.checks.map((c) => c.id)), ["c1", "c2", "c3"]);
  assert.deepEqual([s.trail.length, s.level, s.objective, s.view], [0, 1, null, "total"]);
  const E = G.evaluate(s);
  assert.equal(E.belief, null);
  assert.equal(E.stop.text, "Enter a starting belief to see how much uncertainty is left.");
  for (const bad of [undefined, null, 5, "x", { checks: "x" }, { checks: [{ time: { value: -4, unit: "weeks" } }] }]) assert.doesNotThrow(() => G.evaluate(bad));
});

const NOT_SHOWN = /NaN|Infinity|undefined|\bnull\b/;
const EDGE = [
  G.defaults(),
  { ...G.defaults(), trail: [{ id: "c1", outcome: 0 }, { id: "c4", outcome: 1 }], objective: "fastest", budget: { on: true, value: 4, unit: "min" } },
  { ...G.load("parcel"), trail: [{ id: "c3", outcome: 0 }] },
  G.load("useless"), G.load("diagnostic"), G.load("custom"),
  G.scenario({ hypothesis: "Edge > 20% & <b>bold</b> # $x$ `code`", prior: { pct: 0 }, checks: [{ name: "A > B", resultA: "says >20 min", time: { value: 0 }, a: { pct: 100 }, b: { pct: 0 } }, { a: { pct: 0 }, b: { pct: 1 } }] }),
  G.scenario({ prior: { pct: 100 }, checks: [{ time: { free: true }, a: { pct: 1 }, b: { pct: 1 } }] }),
  G.scenario({ prior: { pct: 50 }, checks: [] }),
  ...["parcel", "phishing", "shopping", "project", "fault"].map((id) => ({ ...G.load(id), objective: "most" })),
];

test("the phrase layer is Kent's scale and every survey answer from probly.csv, kept as separate sources", () => {
  const csv = read("probly.csv"), S = D.EMPIRICAL_PHRASE_DATA;
  assert.equal(createHash("sha256").update(csv).digest("hex"), S.source.sha256);
  const [head, ...rows] = csv.trim().split(/\r?\n/).map((l) => l.split(","));
  assert.deepEqual(plain(S.columns.map((c) => c[0])), head);
  assert.equal(rows.length, S.respondents);
  S.columns.forEach(([label, values], j) => assert.deepEqual(plain(values), rows.map((r) => Number(r[j])), label));
  assert.match(S.source.licence, /^MIT License, copyright \(c\) 2016 Zoni Nation$/);
  assert.match(D.KENT_DATA.source.url, /Words-of-Estimative-Probability\.pdf$/);
  // Owned licence contract: the MIT notice travels with the embedded answers, in the folder's LICENSE and on the published page.
  assert.match(data, /The MIT License \(MIT\)\n \*\n \* Copyright \(c\) 2016 Zoni Nation/);
  assert.match(read("LICENSE"), /Copyright \(c\) 2016 Zoni Nation[\s\S]*Words of Estimative Probability/);
  assert.match(html, /Used under the MIT License, copyright © 2016 Zoni Nation/);
  // The vocabulary: survey median first, else the middle of Kent's range; Kent's range shown separately.
  const likely = G.phrase("likely");
  assert.deepEqual([likely.value, likely.basis, likely.kent.lo, likely.kent.hi, likely.kent.group, likely.survey.q1, likely.survey.q3], [70, "median survey answer", 63, 87, "probable", 65, 75]);
  assert.equal(G.phrase("virtually certain").value, 93);
  assert.equal(G.phrase("virtually certain").basis, "middle of Kent's range");
  assert.equal(G.phrase("very good chance").kent, null);
  assert.equal(G.phrase("certain").value, 100);
  assert.equal(G.phrase("possible"), null, "Kent's possibility words carry no odds");
  const all = G.phrases();
  assert.equal(all.length, new Set(all.map((p) => p.id)).size);
  for (let i = 1; i < all.length; i++) assert.ok(all[i - 1].value <= all[i].value, "ordered by working value");
  for (const p of all) assert.ok(Number.isFinite(p.value) && p.value >= 0 && p.value <= 100, p.id);
  assert.equal(G.defaults().prior.phrase, "likely");
  assert.equal(G.defaults().prior.pct, 70, "the restaurant prior: likely ≈ 70%");
  assert.equal(G.load("parcel").prior.pct, G.phrase("better than even").value);
  assert.match(G.phraseNote({ phrase: "likely", pct: 70 }), /^Working value 70% \(median survey answer\)\. Kent's reference \(as “probable”\): 63%–87%\. Survey of 46 readers: median 70%, middle half 65%–75%\.$/);
  assert.match(G.phraseNote({ phrase: "likely", pct: 95 }), /outside both reference ranges/);
  assert.equal(G.phraseNote({ phrase: null, pct: 40 }), "");
  assert.equal(G.scenario({ prior: { phrase: "made up", pct: 40 } }).prior.phrase, null, "an unknown phrase is never given numbers");
  assert.match(G.analysis(G.defaults()), /^likely — 70%$/m);
});

test("Copy analysis gives the question, checks, rankings and trail, never NaN or Infinity", () => {
  const md = G.analysis(EDGE[1]);
  for (const line of ["## Question", "The restaurant wait will be longer than 20 minutes.", "## Starting belief", "likely — 70%", "## Remaining uncertainty", "1. Ask the host for an estimate (observed)",
    "   Time: 1 min", '   P("Host says over 20 minutes" | H): 85%', '   P("Host says over 20 minutes" | not H): 20%', "## Most information overall", "## Most information per minute", "## Learning trail", "## Best next check (learn fastest, within the budget)"])
    assert.ok(md.split("\n").includes(line), line);
  assert.match(md, /Expected information: \d\.\d\d bits/);
  assert.match(md, /Information rate: \d\.\d\d bits\/min/);
  for (const s of EDGE) assert.doesNotMatch(G.analysis(s), NOT_SHOWN);
});

test("raw.json matches the engine", () => {
  const raw = JSON.parse(read("raw.json"));
  assert.deepEqual(raw.kent, plain(D.KENT_DATA));
  assert.deepEqual(raw.survey, plain(D.EMPIRICAL_PHRASE_DATA));
  assert.deepEqual(raw.thresholds, plain(G.THRESHOLDS));
  assert.deepEqual(raw.units_in_minutes, plain(G.UNITS));
  assert.deepEqual(raw.limits, plain(G.LIMITS));
  assert.deepEqual(raw.initial, plain(G.defaults()));
  assert.deepEqual(raw.examples, plain(G.EXAMPLES));
  assert.deepEqual(raw.teaching_presets, plain(G.TEACHING));
  assert.equal(G.EXAMPLES.length, 6);
});

// The published HTML is an owned contract: its metadata, offline single-file shape, theme and motion queries and no-JS fallback.
test("the page is one offline file with the metadata it promises", () => {
  assert.match(html, /<title>Information gain — Yu Jie Teo<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/teoyujie\.org\/visuals\/information-gain">/);
  for (const p of ["og:title", "og:description", "og:type", "og:url"]) assert.match(html, new RegExp(`<meta property="${p}" content="[^"]+">`));
  assert.match(html, /<meta name="description" content="Express uncertain beliefs in plain English, compare possible observations by expected information gain and time cost, and see how new evidence changes what you believe\.">/);
  assert.match(html, /<a href="https:\/\/teoyujie\.org\/visuals\.html">Visuals<\/a>/);
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+rel="stylesheet"|@import|@font-face|type="module"|https?:\/\/[^"\s]*\.(js|css|woff2?)\b/);
  assert.match(html, /prefers-reduced-motion/);
  assert.match(html, /prefers-color-scheme:dark/);
  assert.match(html, /<div id="nojs">[\s\S]*If E occurs: posterior = 90%[\s\S]*Enable JavaScript to compare your own checks interactively/);
  assert.match(html, /<div id="app" hidden/);
  // The ~100 KB budget counts the page's own code. It excludes the reused probability-phrase data block (exempt by the
  // specification) and the inlined beamdswitch template (the site's shared deck exporter, a standing requirement on every
  // visualisation, kept byte-identical to templates/beamdswitch.js).
  const own = Buffer.byteLength(html) - Buffer.byteLength(data) - Buffer.byteLength(read("beamdswitch.js"));
  assert.ok(own < 100_000, `the page's own code is ${own} bytes, under the ~100 KB budget`);
});

test("every scenario's deck opens in beamdswitch as the standard narrated template", () => {
  assertTemplateCopy("information-gain");
  assertInlined(html, "beamdswitch", read("beamdswitch.js"), "information-gain");
  for (const s of EDGE) {
    const md = T.deck(G.report(s)), what = JSON.stringify(s).slice(0, 100);
    assertStandardDeck(md, what);
    assert.doesNotMatch(md, NOT_SHOWN, what);
  }
  const md = T.deck(G.report(EDGE[1]));
  assert.match(md, /^## Observed: 70% → /m);
  assert.match(md, /^## Most informative: /m);
  assert.match(md, /^## Fastest: /m);
});

test("the page boots, its WebMCP tools answer, and the deck buttons export the page as set", async () => {
  const network = [], record = (what) => function () { network.push(what); };
  const page = await openPage("information-gain", { globals: { fetch: record("fetch"), XMLHttpRequest: record("XMLHttpRequest"), WebSocket: record("WebSocket") } });
  const tools = page.run("InformationGainTools");
  assert.deepEqual(plain(plain(tools.map((t) => t.name))), ["get_metadata", "get_current_state", "analyze_check", "run_self_tests"]);
  for (const t of tools) assert.equal(t.annotations.readOnlyHint, true);
  const call = async (name, args = {}) => JSON.parse((await tools.find((t) => t.name === name).execute(args)).content[0].text);
  assert.equal((await call("get_metadata")).url, "https://teoyujie.org/visuals/information-gain");
  const st = await call("get_current_state");
  assert.equal(st.most_informative, "Simply wait another 10 minutes");
  assert.equal(st.fastest, "Ask the host for an estimate");
  assert.equal(st.best_next_check, null);
  const a = await call("analyze_check", { prior: 0.5, p_result_if_h: 1, p_result_if_not_h: 0, minutes: 0 });
  near(a.expected_information_bits, 1, 1e-12);
  assert.equal(a.rate, "Essentially free");
  assert.equal((await call("analyze_check", { prior: 0.5, p_result_if_h: 2, p_result_if_not_h: 0 })).error.length > 0, true);
  assert.ok((await call("run_self_tests")).every((t) => t.pass));
  // Observe the host's answer through the page's own click handler, then export.
  const btn = { disabled: false, textContent: "", dataset: { act: "observe", id: "c1", outcome: "0" } };
  page.run("document.getElementById('app').listeners.click[0]")({ target: { closest: () => btn } });
  assert.equal((await call("get_current_state")).trail.length, 1);
  await assertButtonsExport(page, "information-gain", T.deck(G.report({ ...G.defaults(), trail: [{ id: "c1", outcome: 0 }] })));
  assert.deepEqual(network, [], "the page makes no network requests");
});

test("an observation the starting belief now rules out stays observed and can still be undone", async () => {
  // Parcel: "It arrives in that window" (70% / 0%) settles the belief at 100%; a 0% starting belief then rules it out.
  const saved = JSON.stringify({ ...G.load("parcel"), trail: [{ id: "c3", outcome: 0 }] });
  let stored = saved;
  const page = await openPage("information-gain", { globals: { localStorage: { getItem: () => saved, setItem: (_, v) => { stored = v; }, removeItem() {} } } });
  const state = () => JSON.parse(stored);
  const app = page.run("document.getElementById('app')"), $ = (id) => page.run(`document.getElementById('${id}')`), learned = $("learned");
  const prior = (value) => app.listeners.input[0]({ target: { dataset: { pf: "text", pk: "prior" }, value, validity: {} } });
  const click = (dataset) => app.listeners.click[0]({ target: { closest: () => ({ disabled: false, textContent: "", dataset }) } });
  assert.match($("checks").innerHTML, /id="card-c3"[\s\S]*Observed, so its numbers are locked/);
  // A blank starting belief rules nothing out: the observations wait for one.
  prior("");
  const waiting = "1 observed result is not applied yet: enter a starting belief to apply it.";
  assert.ok(learned.innerHTML.includes(waiting));
  assert.ok(G.analysis(state()).includes(`## Observations not applied\n${waiting}`));
  assert.match(learned.innerHTML, /data-act="undo"/);
  prior("0");
  const E = G.evaluate(state());
  assert.deepEqual([E.steps.length, E.unapplied], [0, 1]);
  assert.equal(E.rows.find((r) => r.id === "c3").observed, true, "still locked as observed");
  assert.ok(E.live.every((r) => r.id !== "c3"), "not ranked again as a live check");
  assert.match(G.analysis(state()), /\(observed\)[\s\S]*## Observations not applied\n1 observed result is not applied/);
  assert.match(learned.innerHTML, /1 observed result is not applied/);
  const ruled = "1 observed result is not applied: the current starting belief rules it out. Undo it or change the starting belief.";
  assert.ok(learned.innerHTML.includes(ruled));
  assert.match(learned.innerHTML, /data-act="undo"/, "Undo is offered");
  click({ act: "observe", id: "c1", outcome: "0" });
  assert.equal(state().trail.length, 1, "a later observation cannot be stacked on one that does not apply");
  assert.equal($("live").textContent, ruled);
  click({ act: "undo" });
  assert.deepEqual(state().trail, []);
  assert.doesNotMatch(learned.innerHTML, /data-act="undo"|not applied/);
  assert.equal(G.evaluate(state()).rows.find((r) => r.id === "c3").observed, false);
});
