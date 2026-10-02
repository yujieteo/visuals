import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createHash } from "node:crypto";
import { assertButtonsExport, assertInlined, assertStandardDeck, assertTemplateCopy, openPage, read } from "./data-visuals-beamdswitch.mjs";

const html = read("index.html");
const script = (id) => new RegExp(`<script id="${id}">\\n([\\s\\S]*?)</script>`).exec(html)[1];
const load = () => { const ctx = {}; ctx.self = ctx; vm.runInNewContext(script("bayes-data"), ctx); vm.runInNewContext(script("bayes-engine"), ctx); return ctx.Bayes; };
const B = load();
const T = (await import("node:module")).createRequire(import.meta.url)("../beamdswitch.js");
const plain = (v) => JSON.parse(JSON.stringify(v));
const near = (x, y, tol = 1e-12) => assert.ok(Math.abs(x - y) < tol, `${x} ≈ ${y}`);
const direct = (p, a, b) => (a * p) / (a * p + b * (1 - p));

test("the in-page self-checks all pass", () => {
  const checks = B.selfTest();
  assert.ok(checks.length >= 12);
  for (const c of checks) assert.ok(c.ok, c.name);
});

test("neutral evidence leaves the prior exactly unchanged", () => {
  for (const p of [0, 0.01, 0.265, 0.5, 0.7, 0.999, 1]) for (const a of [0.01, 0.3, 0.85, 1]) {
    const r = B.update(p, a, a);
    assert.equal(r.posterior, p, `p=${p} a=b=${a}`);
    assert.equal(r.lr.kind, "one");
    assert.equal(B.explain(r), "This evidence does not favour either possibility, so your probability stays the same.");
  }
});

test("a 50% prior with likelihood ratio 3 gives odds 1:1 → 3:1 and 75%", () => {
  for (const [a, b] of [[0.75, 0.25], [0.6, 0.2], [0.3, 0.1]]) {
    const r = B.update(0.5, a, b);
    near(r.posterior, 0.75);
    near(r.lr.value, 3);
    assert.equal(B.odds(0.5).text, "1 : 1");
    assert.equal(B.odds(r.posterior).text, "3 : 1");
    assert.equal(B.approx(r.posterior), "≈75%");
  }
  // The spec's worked odds example: 40%, likelihood ratio 4 → 2:3 → 8:3 → ≈73%.
  const r = B.update(0.4, 0.8, 0.2);
  assert.equal(B.odds(0.4).text, "2 : 3");
  assert.equal(B.odds(r.posterior).text, "8 : 3");
  assert.equal(B.approx(r.posterior), "≈73%");
  assert.equal(B.leanText(r), "About 4× more expected if the hypothesis is true");
});

test("sequential evidence: each posterior is exactly the next prior, and editing an earlier step recomputes the rest", () => {
  const s = B.fromExample("restaurant");
  s.evidence = B.SCENARIOS[0].evidence.map((e) => ({ text: e.text, a: B.cleanInput(e.a), b: B.cleanInput(e.b) }));
  const e = B.evaluate(s);
  assert.equal(e.steps.length, 3);
  for (let i = 1; i < 3; i++) assert.equal(e.steps[i].prior, e.steps[i - 1].posterior, `step ${i + 1}`);
  near(e.steps[0].posterior, direct(0.265, 0.7, 0.2));
  near(e.final, direct(direct(direct(0.265, 0.7, 0.2), 0.3, 0.6), 0.7, 0.35));
  const edited = structuredClone(s);
  edited.evidence[0].a = { value: 95 };
  const f = B.evaluate(edited);
  near(f.steps[0].posterior, direct(0.265, 0.95, 0.2));
  assert.equal(f.steps[1].prior, f.steps[0].posterior);
  assert.notEqual(f.final, e.final);
  const deleted = structuredClone(s);
  deleted.evidence.splice(0, 1);
  assert.equal(B.evaluate(deleted).steps[0].prior, 0.265, "deleting the first step hands the starting estimate to the next");
});

test("range propagation computes both ends independently through Bayes' rule", () => {
  const [g] = B.propagate({ lo: 0.2, hi: 0.388 }, [{ a: { lo: 0.65, hi: 0.75 }, b: { lo: 0.1, hi: 0.288 } }]);
  near(g.lo, direct(0.2, 0.65, 0.288));
  near(g.hi, direct(0.388, 0.75, 0.1));
  // Sequential: each end chains through its own extremes.
  const two = B.propagate({ lo: 0.2, hi: 0.4 }, [{ a: { lo: 0.6, hi: 0.8 }, b: { lo: 0.1, hi: 0.3 } }, { a: { lo: 0.5, hi: 0.5 }, b: { lo: 0.2, hi: 0.4 } }]);
  near(two[1].lo, direct(direct(0.2, 0.6, 0.3), 0.5, 0.4));
  near(two[1].hi, direct(direct(0.4, 0.8, 0.1), 0.5, 0.2));
  // From the page model: phrase inputs span the middle half of survey answers, widened to the chosen value.
  const e = B.evaluate(B.defaults());
  assert.ok(e.ambiguous);
  const pr = e.prior, a = e.ev[0].a, b = e.ev[0].b;
  assert.deepEqual([pr.lo, pr.hi], [0.2, B.PHRASES.get("probably not").survey.q3 / 100]);
  near(e.ranges[0].lo, direct(pr.lo, a.lo, b.hi));
  near(e.ranges[0].hi, direct(pr.hi, a.hi, b.lo));
  assert.ok(e.ranges[0].lo < e.final && e.final < e.ranges[0].hi);
  const s = B.defaults(); s.prior = { phrase: "likely", value: 95 };
  assert.equal(B.evaluate(s).prior.hi, 0.95, "a value chosen outside the phrase range widens it");
  const exact = B.defaults(); exact.prior = { value: 30 }; exact.evidence[0].a = { value: 70 }; exact.evidence[0].b = { value: 20 };
  assert.equal(B.evaluate(exact).ambiguous, false, "exact numbers carry no phrase range");
});

test("every 0/1 combination is handled without NaN or Infinity", () => {
  const vals = [0, 0.3, 1];
  for (const p of vals) for (const a of vals) for (const b of vals) {
    const r = B.update(p, a, b), what = `p=${p} a=${a} b=${b}`;
    const den = a * p + b * (1 - p);
    if (den === 0) { assert.equal(r.status, "undetermined", what); assert.equal(r.posterior, null, what); }
    else { assert.equal(r.status, "ok", what); assert.ok(r.posterior >= 0 && r.posterior <= 1, what); }
    const text = [B.explain(r), B.leanText(r), B.approx(r.posterior), B.natural(r.posterior), B.odds(r.prior).text, B.odds(r.posterior).text].join(" ");
    assert.doesNotMatch(text, /NaN|Infinity|undefined/, `${what}: ${text}`);
  }
  assert.equal(B.update(0.4, 0, 0).reason, "impossible-both");
  assert.match(B.explain(B.update(0.4, 0, 0)), /cannot determine an update/);
  assert.equal(B.update(0, 0.9, 0.1).posterior, 0);
  assert.match(B.explain(B.update(0, 0.9, 0.1)), /^Your estimate was 0%/);
  assert.equal(B.update(1, 0.1, 0.9).posterior, 1);
  assert.equal(B.update(0.3, 0.5, 0).posterior, 1);
  assert.equal(B.update(0.3, 0.5, 0).lr.kind, "infinite");
  assert.equal(B.update(0.3, 0, 0.5).posterior, 0);
  near(B.update(0.4, 1, 0.5).posterior, 0.4 / 0.7);
  near(B.update(0.4, 0.5, 1).posterior, 0.2 / 0.8);
  const c = B.chain(0.4, [{ a: 0, b: 0 }, { a: 0.5, b: 0.2 }]);
  assert.deepEqual([c[1].status, c[1].posterior], ["blocked", null], "an undetermined step blocks the rest");
  const s = B.defaults(); s.evidence[0].a = { value: 0 }; s.evidence[0].b = { value: 0 };
  const e = B.evaluate(s);
  assert.equal(e.final, null);
  assert.doesNotMatch(T.deck(B.report(s, B.selfTest())), /NaN|Infinity|undefined/);
});

test("results are rounded for back-of-envelope reading", () => {
  const cases = [[0, "0%"], [1e-9, "<1%"], [0.004, "<1%"], [0.07, "≈7%"], [0.3, "≈30%"], [0.5, "≈50%"], [0.73284619, "≈73%"], [0.995, ">99%"], [0.99999, ">99%"], [1, "100%"]];
  for (const [x, t] of cases) assert.equal(B.approx(x), t, String(x));
  for (const x of [null, NaN, Infinity, undefined]) assert.equal(B.approx(x), "—");
  assert.equal(B.natural(0.7), "about 7 in 10");
  assert.equal(B.natural(0.73), "about 73 in 100");
  assert.equal(B.natural(0.003), "about 3 in 1,000");
  assert.equal(B.natural(1e-6), "fewer than 1 in 1,000");
  assert.equal(B.times(3.4999999999999996), "3.5×");
  assert.equal(B.times(1.04), "1.04×");
  assert.equal(B.times(24.4), "24×");
  // Below 10× one decimal; from 10× whole numbers with thousands separators.
  assert.equal(B.times(1.1), "1.1×");
  assert.equal(B.times(9.96), "10×");
  assert.equal(B.times(1234.4), "1,234×");
  assert.equal(B.ratio(1 / 9), "1 : 9");
  assert.equal(B.ratio(37.3), "37 : 1");
  const t = B.tree(0.5, 0.75, 0.25);
  assert.deepEqual([t.N, t.h, t.eh, t.nh, t.enh], [1000, 500, 375, 500, 125], "natural frequencies use 1,000 when 100 would round");
  assert.deepEqual(plain(B.tree(0.4, 0.5, 0.25)), { N: 100, h: 40, nh: 60, eh: 20, enh: 15, seen: 35 });
  assert.equal(B.word(0.56).phrase, "better than even");
  assert.equal(B.word(0).phrase, "ruled out");
  assert.equal(B.word(1).phrase, "certain");
});

test("explanations follow the documented likelihood-ratio thresholds", () => {
  assert.match(B.explain(B.update(0.4, 0.52, 0.5)), /about equally expected either way, so it tells you very little/);
  assert.match(B.explain(B.update(0.4, 0.6, 0.4)), /favours the hypothesis slightly.*up a little/);
  assert.match(B.explain(B.update(0.4, 0.6, 0.2)), /favours the hypothesis clearly.*moves upward/);
  assert.match(B.explain(B.update(0.4, 0.9, 0.1)), /favours the hypothesis strongly.*substantially upward/);
  assert.match(B.explain(B.update(0.4, 0.9, 0.01)), /very strongly/);
  assert.match(B.explain(B.update(0.4, 0.2, 0.6)), /more expected if the hypothesis is false, so your estimate moves downward/);
  for (const [a, b] of [[0.6, 0.4], [0.2, 0.6], [0.9, 0.01]]) assert.doesNotMatch(B.explain(B.update(0.4, a, b)), /\bThe probability is\b|confidence/);
});

test("Kent's scale is embedded as printed in the essay", () => {
  assert.deepEqual(plain(B.KENT.scale.map((k) => [k.phrase, k.centre, k.giveOrTake])), [
    ["almost certain", 93, 6], ["probable", 75, 12], ["chances about even", 50, 10], ["probably not", 30, 10], ["almost certainly not", 7, 5]]);
  const k = (p) => plain(B.PHRASES.get(p).kent);
  assert.deepEqual([k("probable").lo, k("probable").hi], [63, 87]);
  assert.deepEqual([k("almost certainly not").lo, k("almost certainly not").hi], [2, 12]);
  assert.equal(k("likely").group, "probable");
  assert.equal(k("likely").via, "synonym");
  assert.equal(k("we doubt").group, "probably not");
  assert.equal(k("odds overwhelming").group, "almost certain");
  assert.equal(k("chances overwhelming").group, "almost certain");
  assert.equal(k("probably").via, "text");
  assert.deepEqual([k("certain").lo, k("impossible").hi], [100, 0]);
  for (const p of ["possible", "conceivable", "could", "may", "might", "perhaps"]) {
    const ph = B.PHRASES.get(p);
    assert.ok(ph.possible && !ph.kent && !ph.survey && B.working(ph) === null, `${p} carries no numbers`);
  }
  assert.equal(B.KENT.source.url, "https://www.cia.gov/resources/csi/static/Words-of-Estimative-Probability.pdf");
});

test("the survey layer is every answer from probly.csv, unchanged, with statistics computed from it", () => {
  const csv = read("probly.csv");
  assert.equal(createHash("sha256").update(csv).digest("hex"), B.SURVEY.source.sha256);
  const rows = csv.trim().split("\n").map((l) => l.split(","));
  const head = rows[0], body = rows.slice(1);
  assert.equal(body.length, 46);
  assert.deepEqual(plain(B.SURVEY.columns.map((c) => c[0])), head);
  B.SURVEY.columns.forEach(([label, values], j) => assert.deepEqual(plain(values), body.map((r) => Number(r[j])), label));
  const s = B.PHRASES.get("likely").survey;
  assert.deepEqual([s.n, s.median, s.q1, s.q3, s.min, s.max], [46, 70, 65, 75, 40, 90]);
  assert.equal(B.PHRASES.get("probably not").survey.median, 26.5);
  assert.equal(B.stats([10, 20, 30, 40]).median, 25);
  assert.equal(B.stats([10, 20, 30, 40]).q1, 17.5);
  assert.deepEqual(plain(B.stats([0, 9.9, 10, 100]).bins), [2, 1, 0, 0, 0, 0, 0, 0, 0, 1]);
  assert.equal(B.SURVEY.source.licence, "MIT License, copyright (c) 2016 Zoni Nation");
  assert.match(html, /Copyright \(c\) 2016 Zoni Nation[\s\S]*THE SOFTWARE IS PROVIDED "AS IS"/, "the MIT notice travels with the data");
});

test("phrases: ascending order, disclosed defaults, and no calibration for unknown phrases", () => {
  const vals = B.LIST.filter(B.numbered).map((p) => B.working(p).value);
  assert.deepEqual(plain(vals), plain([...vals].sort((x, y) => x - y)));
  assert.deepEqual(plain(B.working(B.PHRASES.get("likely"))), { value: 70, basis: "median survey answer" });
  assert.deepEqual(plain(B.working(B.PHRASES.get("we estimate"))), { value: 75, basis: "middle of Kent's range" });
  assert.equal(B.lookup("  Likely! ").key, "likely");
  assert.equal(B.lookup("we believe that ... not").key, "we believe that … not");
  for (const p of ["pretty plausible", "realistic possibility", "remote chance", "very likely"]) {
    assert.equal(B.lookup(p), null, p);
    const inp = B.cleanInput({ phrase: p, value: 40 });
    assert.equal(inp.phrase, null, `${p} is never treated as calibrated`);
  }
  assert.deepEqual(plain(B.suggest("very unlikely").map((p) => p.key).slice(0, 2)), ["unlikely", "highly unlikely"]);
  assert.ok(!B.suggest("plausible").some((p) => p.key === "impossible"), "no end-of-scale suggestion without a shared word");
  const custom = B.resolve({ custom: { label: "pretty plausible", lo: 55, hi: 75 }, value: 65 });
  assert.deepEqual([custom.kind, custom.basis, custom.lo, custom.hi], ["custom", "your calibration", 0.55, 0.75]);
  const r = B.resolve({ phrase: "likely" });
  assert.equal(B.inputText(r), "likely — interpreted here as 70% (median survey answer)");
  assert.equal(B.inputText(B.resolve({ phrase: "likely", value: 65 })), "likely — interpreted here as 65% (your choice)");
  assert.equal(B.cleanInput({ value: 140 }).value, 100);
  assert.equal(B.cleanInput({ value: "abc" }).value, 50);
});

test("stored scenarios are sanitised before use", () => {
  assert.deepEqual(plain(B.clean(null)), plain(B.defaults()));
  const junk = B.clean({ hypothesis: 5, prior: { phrase: "toString" }, evidence: Array(30).fill({ text: 7, a: { value: -5 }, b: null }), sel: 99, showRange: "yes" });
  assert.equal(junk.hypothesis, B.defaults().hypothesis);
  assert.equal(junk.evidence.length, B.MAX_EVIDENCE);
  assert.equal(junk.evidence[0].a.value, 0);
  assert.equal(junk.sel, B.MAX_EVIDENCE - 1);
  assert.equal(junk.showRange, false);
  assert.equal(junk.prior.phrase, null);
  assert.equal(B.clean({ evidence: [] }).evidence.length, 0);
});

test("raw.json matches the page", () => {
  const raw = JSON.parse(read("raw.json"));
  assert.deepEqual(raw.kent, plain(B.KENT));
  assert.deepEqual(raw.survey, plain(B.SURVEY));
  assert.deepEqual(raw.scenarios, plain(B.SCENARIOS));
  assert.deepEqual(raw.initial, plain(B.defaults()));
  assert.equal(raw.url, "https://teoyujie.org/visuals/bayes");
  assert.equal(B.SCENARIOS.length, 6);
  assert.deepEqual(plain(B.SCENARIOS.map((s) => s.chip)), ["Restaurant", "Delivery", "Rain", "Phishing", "Shopping", "Project"]);
  for (const s of B.SCENARIOS) for (const e of [s.prior, ...s.evidence.flatMap((x) => [x.a, x.b])]) if (e.phrase) assert.ok(B.numbered(B.lookup(e.phrase)), `${s.id}: ${e.phrase}`);
});

test("the page is one offline file with the metadata and static fallback it promises", () => {
  assert.match(html, /<title>Bayesian reasoning in plain English — Yu Jie Teo<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/teoyujie\.org\/visuals\/bayes">/);
  for (const p of ["og:title", "og:description", "og:type", "og:url"]) assert.match(html, new RegExp(`<meta property="${p}" content="[^"]+">`));
  assert.match(html, /<meta name="description" content="[^"]+">/);
  assert.match(html, /<a href="https:\/\/teoyujie\.org\/visuals\.html">Visuals<\/a>/);
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+rel="stylesheet"|@import|type="module"|@font-face/, "no external scripts, styles or fonts to load");
  const css = /<style>\n([\s\S]*?)<\/style>/.exec(html)[1], media = (q) => css.split("\n").filter((l) => l.startsWith(`@media (${q})`)).join("\n");
  for (const v of ["--bg", "--fg", "--focus"]) assert.match(media("prefers-color-scheme:dark"), new RegExp(`${v}:#`), `dark theme sets ${v}`);
  const still = css.split("\n").filter((l) => !l.startsWith("@media (prefers-reduced-motion:no-preference)")).join("\n");
  assert.match(media("prefers-reduced-motion:no-preference"), /transition:/);
  assert.doesNotMatch(still, /transition|animation/, "motion only when the reader has not asked to reduce it");
  assert.match(html, /<noscript>[\s\S]*The reference chart works without JavaScript\.[\s\S]*Enable JavaScript to use the interactive Bayesian calculator\.[\s\S]*<\/noscript>/);
  assert.match(html, /<div id="app" hidden>/, "controls stay hidden without JavaScript");
  assert.match(html, /<div id="nojs">[\s\S]*P\(E \| not H\)[\s\S]*after = \(if true × before\)/, "the three quantities and the formula without JavaScript");
  assert.match(html, /<details id="tables" open>/, "the reference chart is open without JavaScript");
  assert.ok(html.includes(B.staticRows()), "the static reference rows are the engine's own");
  assert.match(html, /<p class="sr" id="live" aria-live="polite"><\/p>/, "the result is announced in a polite live region");
  assert.match(html, /Runs entirely in your browser\. Nothing you enter is sent anywhere\./);
  const logic = html.length - script("bayes-data").length - B.staticRows().length;
  assert.ok(logic < 100_000, `HTML, CSS and logic stay under 100 KB without the embedded data (${logic})`);
});

const full = (id) => { const s = B.fromExample(id); s.evidence = B.SCENARIOS.find((x) => x.id === id).evidence.map((e) => ({ text: e.text, a: B.cleanInput(e.a), b: B.cleanInput(e.b) })); s.showRange = true; return s; };
const odd = { ...B.defaults(), hypothesis: "# 100% *sure* & <b>x</b> $5 | `y`: ::: no", evidence: [{ text: "## ::: 50%", a: { custom: { label: "pretty *plausible*", lo: 40, hi: 80 }, value: 60 }, b: { value: 0 } }] };
const states = [B.defaults(), ...B.SCENARIOS.map((s) => full(s.id)), { ...B.defaults(), evidence: [] }, { ...B.defaults(), prior: { value: 0 } },
  { ...B.defaults(), evidence: [{ text: "", a: { value: 0 }, b: { value: 0 } }, { text: "next", a: { value: 50 }, b: { value: 20 } }] }, odd];

test("every scenario's deck opens in beamdswitch as the standard narrated template", () => {
  assertTemplateCopy("bayes");
  assertInlined(html, "beamdswitch", read("beamdswitch.js"), "bayes");
  const checks = B.selfTest();
  for (const st of states) {
    const md = T.deck(B.report(st, checks)), what = JSON.stringify(st).slice(0, 100);
    assertStandardDeck(md, what);
    assert.doesNotMatch(md, /NaN|Infinity|undefined/, what);
    const e = B.evaluate(st);
    if (e.ev.length && e.final !== null) assert.ok(md.includes(B.approx(e.final)), what);
  }
  const md = T.deck(B.report(full("restaurant"), checks));
  assert.match(md, /^## Evidence 1: ≈27% to ≈56%$/m);
  assert.match(md, /^Given these estimates, ≈27% → ≈\d+%/m);
});

test("the page boots, its WebMCP tools answer, and the deck buttons export the scenario as set", async () => {
  const page = await openPage("bayes");
  const tools = page.run("BayesTools");
  assert.deepEqual(plain(tools.map((t) => t.name)), ["get_metadata", "get_current_state", "lookup_phrase", "bayes_update"]);
  for (const t of tools) assert.equal(t.annotations.readOnlyHint, true);
  const call = async (name, args = {}) => JSON.parse((await tools.find((t) => t.name === name).execute(args)).content[0].text);
  const meta = await call("get_metadata");
  assert.equal(meta.url, "https://teoyujie.org/visuals/bayes");
  assert.equal(meta.sources.kent.authors, "Sherman Kent");
  assert.ok(meta.self_checks.every((c) => c.ok));
  const state = await call("get_current_state");
  assert.equal(state.prior, "probably not — interpreted here as 26.5% (median survey answer)");
  assert.deepEqual(state.trail, ["≈27%", "≈56%"]);
  const likely = await call("lookup_phrase", { phrase: "Likely" });
  assert.deepEqual([likely.survey.median, likely.kent.range_percent, likely.default_working.basis], [70, [63, 87], "median survey answer"]);
  const unknown = await call("lookup_phrase", { phrase: "pretty plausible" });
  assert.equal(unknown.calibrated, false);
  const up = await call("bayes_update", { prior_percent: 50, evidence: [{ if_true_percent: 75, if_false_percent: 25 }, { if_true_percent: 0, if_false_percent: 0 }] });
  assert.deepEqual([up.steps[0].posterior_percent, up.steps[0].prior_odds, up.steps[0].posterior_odds, up.steps[1].status], [75, "1 : 1", "3 : 1", "undetermined"]);
  // Out-of-range or non-numeric percents are clamped to 0–100, as the page clamps its own inputs.
  const clamped = await call("bayes_update", { prior_percent: 150, evidence: [{ if_true_percent: -5, if_false_percent: "x" }, { if_true_percent: 40, if_false_percent: 20 }] });
  assert.deepEqual(clamped.steps.map((s) => [s.prior_percent, s.status]), [[100, "undetermined"], [null, "blocked"]]);
  const high = await call("bayes_update", { prior_percent: -20, evidence: [{ if_true_percent: 250, if_false_percent: 50 }] });
  assert.deepEqual([high.steps[0].prior_percent, high.steps[0].posterior_percent, high.steps[0].likelihood_ratio], [0, 0, 2]);
  // Change the hypothesis through the page's own input handler, then export.
  page.run(`document.getElementById("app").listeners.input[0]({ target: { id: "hyp", value: "The bus will arrive within 10 minutes.", dataset: {} } })`);
  await assertButtonsExport(page, "bayes", T.deck(B.report({ ...B.defaults(), hypothesis: "The bus will arrive within 10 minutes." }, B.selfTest())));
});

// Opens the page with the given scenario saved, timers run at once, and every network API recording its use.
const boot = async (saved = null) => {
  const net = [];
  const spy = (name) => function () { net.push(name); };
  const page = await openPage("bayes", { globals: {
    fetch: spy("fetch"), XMLHttpRequest: spy("XMLHttpRequest"), WebSocket: spy("WebSocket"), EventSource: spy("EventSource"),
    setTimeout: (fn) => { fn(); return 0; },
    localStorage: { getItem: (k) => (k === "bayes:scenario" && saved ? JSON.stringify(saved) : null), setItem() {}, removeItem() {} },
  } });
  page.run("navigator.sendBeacon = () => { throw new Error('sendBeacon'); }");
  return { page, net, text: (id) => page.run(`document.getElementById(${JSON.stringify(id)}).textContent`) };
};

test("booted, the page swaps the no-JavaScript fallback for the app, announces the result and uses no network", async () => {
  const { page, net, text } = await boot();
  assert.equal(page.run(`document.getElementById("nojs").hidden`), true);
  assert.equal(page.run(`document.getElementById("app").hidden`), false);
  assert.equal(text("live"), "After the evidence: ≈56%, close to what people meant by “better than even”.");
  page.run(`document.getElementById("app").listeners.input[0]({ target: { id: "hyp", value: "The bus is late.", dataset: {} } })`);
  await page.click("save-beamdswitch");
  await page.click("copy-beamdswitch");
  assert.equal(page.saved.length, 1);
  assert.deepEqual(net, []);
});

test("a step after an undetermined one says the update cannot be determined", async () => {
  const { text } = await boot({ ...B.defaults(), sel: 1, evidence: [{ text: "", a: { value: 0 }, b: { value: 0 } }, { text: "next", a: { value: 50 }, b: { value: 20 } }] });
  assert.equal(text("r-axis-text"), "The update cannot be determined.");
  assert.equal(text("r-explain"), "An earlier step could not be determined, so this one cannot be computed either.");
});

test("an undeterminable range end does not blame evidence impossible both ways", async () => {
  const { page, text } = await boot({ ...B.defaults(), showRange: true, prior: { custom: { label: "maybe", lo: 0, hi: 40 }, value: 20 }, evidence: [{ text: "seen", a: { value: 50 }, b: { value: 0 } }] });
  assert.equal(text("r-after"), "100%");
  assert.equal(page.run(`document.getElementById("r-range").innerHTML`), "One end of the range cannot be determined, because at an extreme of your phrase ranges the evidence you saw could not have appeared.");
});

test("the deck reports how many self-checks passed out of how many", () => {
  const narr = (checks) => B.report(B.defaults(), checks).checks[0].narration;
  assert.match(narr(B.selfTest()), /The page's (\d+) self checks: \1 of \1 passed\.$/);
  assert.match(narr([{ ok: true }, { ok: false }, { ok: true }]), /The page's 3 self checks: 2 of 3 passed\.$/);
});
