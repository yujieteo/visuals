import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { TEMPLATE, assertButtonsExport, assertInlined, assertStandardDeck, assertTemplateCopy, openPage, read } from "./beamdswitch-deck-checks.mjs";

const html = read("index.html");
const engine = /<script id="kent-engine">\n([\s\S]*?)<\/script>/.exec(html)[1];
const load = () => { const ctx = {}; ctx.self = ctx; vm.runInNewContext(engine, ctx); return ctx.Kent; };
const K = load();
const T = (await import("node:module")).createRequire(import.meta.url)("./fixtures/beamdswitch/template.js");
const plain = (v) => JSON.parse(JSON.stringify(v));
const T0 = "2026-10-01T09:00:00.000Z", T1 = "2026-10-01T10:00:00.000Z", T2 = "2026-10-02T10:00:00.000Z";

test("the Kent 1964 scale is the essay's chart: anchors and give-or-take bands", () => {
  const S = K.scaleOf("kent1964");
  assert.equal(S.name, "Kent 1964");
  assert.match(S.source, /Words of Estimative Probability.*Studies in Intelligence 8\(4\), Fall 1964/);
  assert.deepEqual(plain(S.terms.map((t) => [t.label, t.anchor, t.lo, t.hi])), [
    ["Impossible", 0, 0, 0], ["Almost certainly not", 7, 2, 12], ["Probably not", 30, 20, 40], ["Chances about even", 50, 40, 60],
    ["Probable", 75, 63, 87], ["Almost certain", 93, 87, 99], ["Certain", 100, 100, 100]]);
  // Each band is the anchor give or take Kent's stated margin.
  for (const [id, margin] of [["acn", 5], ["pn", 10], ["even", 10], ["probable", 12], ["ac", 6]]) {
    const t = K.termById(id);
    assert.deepEqual([t.anchor - t.lo, t.hi - t.anchor], [margin, margin], id);
    assert.match(t.give, new RegExp(`${margin}%$`));
  }
  assert.deepEqual([K.termById("certain").kent, K.termById("impossible").kent], ["Certainty", "Impossibility"]);
  assert.deepEqual(plain(K.termById("probable").synonyms), ["likely", "we believe", "we estimate"]);
  assert.deepEqual(plain(K.termById("acn").synonyms), [], "none claimed for the row missing from the transcription");
  assert.equal(K.scaleOf("nato").name, "Kent 1964", "only Kent 1964 ships; unknown scales fall back to it");
  assert.deepEqual(Object.keys(K.SCALES), ["kent1964"]);
});

test("lookup at 0, 50 and 100% and at every edge and gap: anchor and band never collapse", () => {
  const at = (p) => { const L = K.lookup(p); return [L.term.id, L.inBand, L.boundary, L.between && L.between.map((t) => t.id)]; };
  assert.deepEqual(plain(at(0)), ["impossible", true, false, null]);
  assert.deepEqual(plain(at(100)), ["certain", true, false, null]);
  assert.deepEqual(plain(at(50)), ["even", true, false, null]);
  assert.deepEqual(plain(at(0.5)), ["acn", false, false, ["impossible", "acn"]], "only exactly 0 is impossible");
  assert.deepEqual(plain(at(99.5)), ["ac", false, false, ["ac", "certain"]], "only exactly 100 is certain");
  assert.deepEqual(plain(at(15)), ["acn", false, false, ["acn", "pn"]]);
  assert.deepEqual(plain(at(18)), ["pn", false, false, ["acn", "pn"]]);
  assert.deepEqual(plain(at(61)), ["even", false, false, ["even", "probable"]]);
  assert.deepEqual(plain(at(62)), ["probable", false, false, ["even", "probable"]]);
  assert.deepEqual(plain(at(40)), ["even", true, true, null], "a shared edge tie goes to the term nearer 50");
  assert.deepEqual(plain(at(87)), ["ac", true, true, null], "87 is nearer 93 than 75");
  assert.deepEqual(plain(at(72)), ["probable", true, false, null]);
  assert.equal(K.region(18), "between “almost certainly not” and “probably not”");
  assert.equal(K.region(40), "Chances about even, at the edge of “probably not”");
  assert.equal(K.region(72), "Probable");
  // 74 and 75 read the same: words are coarse over a continuous space.
  assert.equal(K.region(74), K.region(75));
  assert.equal(K.lookup(-5).term.id, "impossible");
  assert.equal(K.lookup(NaN).term.id, "even", "a missing probability reads as the landing 50%");
});

test("the translation lens: one probability, several coordinate systems", () => {
  const z = K.lens(72);
  assert.deepEqual([z.percent, z.term, z.anchor, z.band, z.small, z.frequency, z.odds, z.complement], ["72%", "Probable", 75, "63–87%", "about 7 in 10", "72 in 100", "2.6 : 1", "28% chance it does not happen"]);
  const p = K.lens(75);
  assert.deepEqual([p.small, p.odds, p.oddsWords, p.complementP], ["3 in 4", "3 : 1", "3 to 1 on", 25]);
  assert.deepEqual([K.lens(25).odds, K.lens(25).oddsWords], ["1 : 3", "3 to 1 against"]);
  assert.deepEqual([K.lens(50).small, K.lens(50).odds, K.lens(50).oddsWords], ["1 in 2", "1 : 1", "evens"]);
  assert.deepEqual([K.lens(0).odds, K.lens(0).small, K.lens(0).complement], ["0 : 1", "0 in 10: never, on this estimate", "100% chance it does not happen"]);
  assert.deepEqual([K.lens(100).odds, K.lens(100).small, K.lens(100).complement], ["1 : 0", "10 in 10: every time, on this estimate", "0% chance it does not happen"]);
  assert.deepEqual([K.lens(7).small, K.lens(93).small, K.lens(0.5).small, K.lens(0.01).small, K.lens(99.99).small], ["7 in 100", "93 in 100", "5 in 1,000", "fewer than 1 in 1,000", "more than 999 in 1,000"]);
  assert.equal(K.oddsPair(65), "65 to 35 in favour", "Kent's own way of writing odds");
  for (let p = 0; p <= 100; p += 0.5) {
    const l = K.lens(p);
    assert.doesNotMatch(JSON.stringify(l), /NaN|Infinity|undefined/, String(p));
    assert.equal(l.complementP, 100 - p);
  }
});

test("false precision is displayed rounded, kept exactly and flagged gently, never refused", () => {
  const r = K.parseP("72.384729%");
  assert.deepEqual([r.ok, r.value, r.display, r.precise, r.warning], [true, 72.384729, "72%", true, "Your input contains more precision than most real-world judgments can support."]);
  assert.equal(K.fmtExact(r.value), "72.384729%");
  assert.deepEqual(plain(K.parseP("72")), { ok: true, value: 72, precise: false, warning: null, display: "72%" });
  assert.equal(K.parseP("0.25").precise, false, "two decimals are fine below 1%");
  assert.equal(K.parseP("0.253").precise, true);
  assert.equal(K.parseP("72 percent").value, 72);
  for (const [s, msg] of [["", K.MESSAGES.blank], ["abc", K.MESSAGES.nan], ["101", K.MESSAGES.range], ["-1", K.MESSAGES.range], ["1e2", K.MESSAGES.nan]]) assert.equal(K.parseP(s).error, msg, s);
  assert.deepEqual([K.fmtP(0), K.fmtP(100), K.fmtP(50), K.fmtP(0.04), K.fmtP(0.5), K.fmtP(99.6), K.fmtP(99.96), K.fmtP(74.5)], ["0%", "100%", "50%", "<0.1%", "0.5%", "99.6%", ">99.9%", "75%"]);
  assert.deepEqual([K.fmtPP(-54), K.fmtPP(45), K.fmtPP(0.2)], ["−54 pp", "+45 pp", "0 pp"]);
});

test("thresholds: break-even C / (C + L), and unlikely is not irrelevant", () => {
  const th = K.threshold("2", "20");
  assert.deepEqual([th.ok, Math.round(th.value * 1000) / 1000, th.display], [true, 9.091, "9%"]);
  assert.equal(K.threshold(0, 5).value, 0, "acting is free: always act");
  assert.equal(K.threshold(5, 0).value, 100, "missing costs nothing: never act");
  for (const [a, b, msg] of [["0", "0", K.MESSAGES.noCosts], ["-1", "3", K.MESSAGES.costs], ["", "3", K.MESSAGES.costs], ["x", "3", K.MESSAGES.costs]]) assert.equal(K.threshold(a, b).error, msg);
  const rain = K.decide(38, 20, { subject: "rain" });
  assert.deepEqual([rain.act, rain.lesson], [true, "Unlikely is not irrelevant."]);
  assert.equal(rain.text, "Even though rain is “probably not”, 38% is above your 20% action threshold: under your costs, acting is worth it.");
  const likely = K.decide(80, 90);
  assert.deepEqual([likely.act, likely.lesson], [false, "Likely is not the same as act."]);
  const bus = K.decide(K.WORKED.after, K.WORKED.threshold, { direction: "below" });
  assert.equal(bus.act, true);
  assert.equal(bus.text, "25% is below your 35% action threshold: under the entered costs, the alternative becomes rational.");
  assert.equal(K.decide(20, 20).act, true, "at the threshold counts as reaching it");
});

test("forecasts are append-only: editing after commit adds a revision and never erases the original", () => {
  let r = K.commit([], { claim: "The shop will close before I arrive.", probability: 65, confidence: "medium", criterion: "Door is locked when I reach the entrance", resolveBy: "2026-10-01T18:30" }, T0);
  assert.ok(r.ok);
  const id = r.id, original = r.ledger[0];
  assert.throws(() => { "use strict"; r.ledger[0].probability = 10; }, /read only|read-only/, "committed events are frozen");
  assert.throws(() => { r.ledger.push({}); }, /not extensible/, "the ledger itself is frozen");
  const rev = K.revise(r.ledger, id, 40, T1, "Bus delayed");
  assert.ok(rev.ok);
  assert.equal(rev.ledger.length, 2);
  assert.equal(rev.ledger[0], original, "the commit event is untouched");
  let [f] = K.forecasts(rev.ledger, T1);
  assert.deepEqual([f.probability, f.latest, f.revisions.length, f.status], [65, 40, 1, "open"]);
  // Resolved after the deadline: kept, flagged late, scored at the committed probability.
  const res = K.resolve(rev.ledger, id, "no", T2);
  [f] = K.forecasts(res.ledger, T2);
  assert.deepEqual([f.outcome, f.late, f.status, f.brier], ["no", true, "resolved", 0.4225]);
  assert.equal(K.forecasts(rev.ledger, T2)[0].status, "overdue", "unresolved past its deadline");
  assert.equal(K.revise(res.ledger, id, 10, T2).error, K.MESSAGES.resolved);
  const fix = K.resolve(res.ledger, id, "ambiguous", T2);
  assert.ok(fix.correction);
  [f] = K.forecasts(fix.ledger, T2);
  assert.deepEqual([f.outcome, f.corrections, f.brier, fix.ledger.length], ["ambiguous", 1, null, 4]);
  assert.equal(K.commit([], { claim: "  ", probability: 50 }, T0).error, K.MESSAGES.claim, "missing claim");
  assert.equal(K.commit([], { claim: "x", probability: 101 }, T0).error, K.MESSAGES.range);
  assert.equal(K.resolve(fix.ledger, "nope", "yes", T2).error, K.MESSAGES.unknown);
  assert.equal(K.resolve(fix.ledger, id, "maybe", T2).error, K.MESSAGES.outcome);
  const long = K.commit([], { claim: "x".repeat(1000), probability: 50 }, T0);
  assert.equal(K.forecasts(long.ledger)[0].claim.length, K.MAX_CLAIM, "a very long claim is kept to its limit");
  const two = K.commit(K.commit([], { claim: "a", probability: 1 }, T0).ledger, { claim: "b", probability: 2 }, T0);
  assert.equal(new Set(two.ledger.map((e) => e.id)).size, 2, "ids stay unique at the same instant");
});

test("an imported ledger must be append-only history", () => {
  const ok = K.commit([], { claim: "a", probability: 70 }, T0);
  assert.ok(K.validateLedger(plain(ok.ledger)).ok);
  const bad = [
    [{ type: "resolve", id: "x", at: T0, outcome: "yes" }, /not committed before/],
    [[...plain(ok.ledger), { ...plain(ok.ledger[0]) }], /twice/],
    [[{ type: "commit", id: "a", at: T0, claim: "a", probability: 120 }], /outside 0–100/],
    [[{ type: "edit", id: "a", at: T0 }], /unknown type/],
    [[{ type: "commit", id: "a", at: "yesterday", claim: "a", probability: 5 }], /valid time/],
    [[...plain(ok.ledger), { type: "resolve", id: ok.id, at: T1, outcome: "no" }, { type: "revise", id: ok.id, at: T2, probability: 20 }], /after it was resolved/],
  ];
  for (const [ledger, re] of bad) assert.match(K.validateLedger(Array.isArray(ledger) ? ledger : [ledger]).errors.join(" "), re);
  assert.equal(K.validateLedger("nope").ok, false);
});

/* n resolved forecasts at probability p, k of which happened. */
function many(specs) {
  let L = [];
  let t = Date.parse(T0);
  for (const { p, yes = 0, no = 0, confidence = null, phrase = "" } of specs) {
    for (let i = 0; i < yes + no; i++) {
      const at = new Date((t += 1000)).toISOString(), r = K.commit(L, { claim: `c${t}`, probability: p, confidence, phrase }, at);
      L = K.resolve(r.ledger, r.id, i < yes ? "yes" : "no", new Date((t += 1000)).toISOString()).ledger;
    }
  }
  return K.forecasts(L);
}

test("calibration: ten bins by committed probability, small groups hidden, ambiguous kept but unscored", () => {
  assert.deepEqual(plain(K.bins([]).map((b) => [b.n, b.shown])), Array(10).fill([0, false]), "no calibration history");
  const list = many([{ p: 74, yes: 13, no: 6, phrase: "probably", confidence: "high" }, { p: 72, yes: 2, no: 1, confidence: "low" }, { p: 100, yes: 1 }, { p: 0, no: 1 }]);
  const b = K.bins(list);
  assert.equal(b[7].label, "70–79%");
  assert.equal(b[7].n, 22);
  assert.ok(b[7].shown);
  assert.equal(Math.round(b[7].predicted * 10) / 10, 73.7);
  assert.equal(Math.round(b[7].observed * 10) / 10, 68.2);
  assert.deepEqual([b[9].label, b[9].n, b[9].shown], ["90–100%", 1, false], "100% falls in the top bin; one forecast is too few");
  assert.deepEqual([b[0].n, b[0].shown], [1, false]);
  const tiny = many([{ p: 80, yes: 4 }]);
  assert.equal(K.bins(tiny)[8].shown, false, `fewer than ${K.MIN_GROUP} is hidden`);
  assert.equal(K.groupNote(K.bins(tiny)[8]), "Only 4 resolved forecasts: too few to say anything (needs 5).");
  const phrase = K.byPhrase(list).find((g) => g.key === "probably");
  assert.equal(phrase.n, 19);
  assert.equal(K.groupNote(phrase, "probably"), "Your “probably” has historically been more confident than the outcomes justify.");
  assert.equal(K.byPhrase(list).find((g) => g.key === "certain").n, 1, "no phrase given: grouped under the Kent term");
  assert.deepEqual(plain(K.byConfidence(list).map((g) => [g.key, g.n, g.shown])), [["low", 3, false], ["medium", 0, false], ["high", 19, true]]);
  const under = many([{ p: 30, yes: 5, no: 5, phrase: "unlikely" }]);
  assert.equal(K.groupNote(K.byPhrase(under)[0], "unlikely"), "What you call “unlikely” has happened more often than you said.");
  const close = many([{ p: 70, yes: 7, no: 3 }]);
  assert.equal(K.groupNote(K.bins(close)[7]), "These forecasts have matched the outcomes closely so far.");
  let L = K.commit([], { claim: "a", probability: 60 }, T0);
  L = K.resolve(L.ledger, L.id, "ambiguous", T1);
  assert.equal(K.bins(K.forecasts(L.ledger)).reduce((s, x) => s + x.n, 0), 0, "ambiguous outcomes are not scored");
});

test("the Brier score: (p − o)², lower is better", () => {
  assert.equal(K.brier(80, 1), 0.04);
  assert.equal(K.brier(70, 0), 0.49, "the worked example: forecast 70%, outcome NO");
  assert.deepEqual([K.brier(0, 0), K.brier(100, 1), K.brier(100, 0), K.brier(50, 1)], [0, 0, 1, 0.25]);
  assert.deepEqual(plain(K.brierSummary([])), { n: 0, mean: null });
  assert.deepEqual(plain(K.brierSummary(many([{ p: 80, yes: 1, no: 1 }]))), { n: 2, mean: 0.34 });
});

test("URL state carries only the claim, probability and confidence", () => {
  const qs = K.encodeState({ claim: "Train arrives within 5 minutes", p: 72, confidence: "medium", evidence: ["secret"], ledger: [1] });
  assert.equal(qs, "q=Train+arrives+within+5+minutes&p=72&c=medium");
  assert.deepEqual(plain(K.decodeState(`?${qs}`)), { claim: "Train arrives within 5 minutes", p: 72, confidence: "medium" });
  assert.equal(K.encodeState({ p: 72.384729 }), "p=72.4");
  assert.equal(K.encodeState({ p: 0 }), "p=0");
  assert.equal(K.encodeState({ p: 100, confidence: "huge" }), "p=100");
  assert.deepEqual(plain(K.decodeState("?p=150&c=x&q=%E0%A4%A")), {}, "invalid values are ignored");
  assert.deepEqual(plain(K.decodeState("q=a%26b%3Dc&p=50")), { claim: "a&b=c", p: 50 });
  const round = (s) => K.decodeState(K.encodeState(s));
  for (const s of [{ claim: "Odd ünïcode & 50% + “quotes”?", p: 33, confidence: "low" }, { claim: "", p: 0 }]) assert.deepEqual(plain(round(s)), plain(Object.fromEntries(Object.entries(s).filter(([, v]) => v !== ""))));
});

test("simulated readers are seeded, deterministic, broad and always labelled simulated", () => {
  const a = K.simulateReaders("likely", { seed: 1 }), b = K.simulateReaders("Likely ", { seed: 1 });
  assert.deepEqual(plain(a), plain(b), "same phrase and seed: same readers");
  assert.notDeepEqual(plain(K.simulateReaders("likely", { seed: 2 }).readers), plain(a.readers));
  assert.deepEqual([a.label, a.simulated, a.centre], ["SIMULATED READERS", true, 75]);
  assert.match(a.note, /not measurements of real people/);
  assert.ok(a.readers.every((r) => /^Simulated reader [A-Z]$/.test(r.name) && r.value >= 1 && r.value <= 99 && Number.isInteger(r.value)));
  assert.ok(a.max - a.min >= 20, "an intentionally broad spread");
  assert.equal(K.simulateReaders("decent chance", { dict: { "decent chance": 62 } }).centre, 62);
  assert.equal(K.simulateReaders("a pretty good chance", { fallback: 70 }).source, "your meaning");
  // Over many seeds the spread is the stated one, centred where it says.
  const vals = [];
  for (let s = 0; s < 400; s++) vals.push(...K.simulateReaders("we doubt", { seed: s }).readers.map((r) => r.value));
  const mean = vals.reduce((x, y) => x + y, 0) / vals.length, sd = Math.sqrt(vals.reduce((x, y) => x + (y - mean) ** 2, 0) / vals.length);
  assert.ok(Math.abs(mean - 30) < 1.5 && Math.abs(sd - K.SPREAD) < 2, `${mean} ${sd}`);
});

test("free English: phrases are highlighted, Kent values only for Kent's own words, never invented", () => {
  const spans = K.findPhrases("I think there is a pretty good chance the shop closes, though it's probably not shut and highly likely open; 70% sure.");
  assert.deepEqual(plain(spans.map((s) => [s.text, s.kind, s.kent && s.kent.label])), [
    ["I think", "hedge", null], ["pretty good chance", "hedge", null], ["probably not", "kent", "Probably not"], ["highly likely", "kent", "Almost certain"], ["70%", "number", null]]);
  assert.equal(spans[0].start, 0);
  const mine = K.findPhrases("I'll probably finish tonight.", { dict: { probably: 75 } })[0];
  assert.deepEqual([mine.text, mine.kind, mine.user, mine.kent.label, mine.kent.anchor, mine.kent.via], ["probably", "kent", 75, "Probable", 75, "term"], "the user's value and Kent's, side by side");
  assert.equal(K.findPhrases("A decent chance.", { dict: { "decent chance": 65 } })[0].kind, "user");
  assert.equal(K.findPhrases("Unlikely, I'd say.")[0].kent.via, "synonym");
  assert.deepEqual(plain(K.findPhrases("Possibly. Definitely. Impossible.").map((s) => [s.phrase, s.kent && s.kent.anchor])), [["possibly", null], ["definitely", null], ["impossible", 0]]);
  assert.deepEqual(plain(K.findPhrases("No hedges here.")), []);
  assert.deepEqual(plain(K.findPhrases("")), []);
  assert.equal(K.kentMatch("Probable").term.id, "probable");
  assert.equal(K.kentMatch("pretty good chance"), null);
});

test("comparisons: writer and reader, before and after, the lab and the reverse test", () => {
  assert.deepEqual(plain(K.gap(65, 25)), { delta: 40, signed: -40, text: "Δ 40 pp", sameTerm: false });
  const w = K.shift(K.WORKED.meant, K.WORKED.after);
  assert.deepEqual([w.text, w.from, w.to, w.changed], ["−45 pp", "Probable", "Probably not", true], "the worked example: 70% → 25%");
  assert.deepEqual([K.shift(72, 18).text, K.shift(72, 18).to], ["−54 pp", "between “almost certainly not” and “probably not”"]);
  const lab = K.labCompare({ probable: 68, acn: 10 });
  assert.deepEqual(plain(lab.map((r) => [r.id, r.you, r.kent, r.delta, r.inBand])), [["acn", 10, 7, 3, true], ["pn", null, 30, null, null], ["even", null, 50, null, null], ["probable", 68, 75, -7, true], ["ac", null, 93, null, null]]);
  const rev = K.reverseFeedback(73, "even");
  assert.deepEqual([rev.kent, rev.covers, rev.implied], ["Probable", false, 50]);
  assert.equal(rev.text, "Your phrase “chances about even” implies about 50% (band 40–60%) under the Kent convention. 73% sits in “probable” (63–87%).");
  assert.doesNotMatch(rev.text, /correct|wrong|incorrect/i, "never a school test");
  assert.equal(K.reverseFeedback(73, "probable").text, "Under the Kent convention “probable” covers 63–87%, which includes 73%.");
  assert.equal(K.reverseFeedback(73, "nope"), null);
});

test("the sentence composer says the number as well as the word", () => {
  assert.deepEqual(plain(K.compose({ claim: "The queue clears within 20 minutes", p: 78, confidence: "medium" })), {
    full: "It is probable that the queue clears within 20 minutes. Probability: 78%. Analytic confidence: medium.",
    concise: "The queue clears within 20 minutes — 78%, medium confidence." });
  assert.equal(K.compose({ claim: "Will the train arrive within 5 minutes?", p: 72 }).full, "Will the train arrive within 5 minutes? Probable: 72% (Kent band 63–87%). Analytic confidence: not stated.");
  assert.equal(K.compose({ claim: "", p: 50 }).concise, "This claim — 50%.");
  assert.equal(K.compose({ claim: "I finish today.", p: 9 }).full, "It is almost certainly not the case that I finish today. Probability: 9%. Analytic confidence: not stated.");
  assert.equal(K.compose({ claim: "NASA launches", p: 100 }).full, "It is certain that NASA launches. Probability: 100%. Analytic confidence: not stated.");
});

test("export and import round-trip; probability and confidence are never combined", () => {
  const ledger = K.commit([], { claim: "a", probability: 70, confidence: "low" }, T0).ledger;
  const out = K.exportData({ estimate: { claim: "x", p: 72, confidence: "low", evidence: [{ text: "Tracker says 3 min", kind: "for" }], history: [{ before: 72, after: 18, evidence: "Delay" }], range: { lo: 60, hi: 80 } }, ledger, dictionary: { Maybe: 45, bad: 300 }, lab: { probable: 70 } }, T1);
  const back = K.importData(JSON.parse(JSON.stringify(out)));
  assert.ok(back.ok);
  assert.deepEqual(plain(back.data.estimate), { claim: "x", p: 72, confidence: "low", evidence: [{ id: "e0", text: "Tracker says 3 min", kind: "for" }], history: [{ at: "", before: 72, after: 18, evidence: "Delay" }], range: { lo: 60, hi: 80 }, threshold: null });
  assert.deepEqual(plain(back.data.dictionary), { maybe: 45 });
  assert.deepEqual(plain(back.data.lab), { probable: 70 });
  assert.equal(K.importData({ format: "other" }).ok, false);
  assert.equal(K.normEstimate({ p: 72, range: { lo: 75, hi: 80 } }).range, null, "a range must contain the best estimate");
  assert.deepEqual(plain(K.range(60, 72, 80)), { ok: true, errors: [], text: "60%–80%, best 72%" });
  assert.deepEqual(plain(K.range(75, 72, 80).errors), [K.MESSAGES.orderLo]);
  // Confidence never changes any number derived from the probability.
  for (const c of K.CONFIDENCE) assert.deepEqual(plain(K.lens(72)), plain(K.lens(72, undefined, c)));
});

test("raw.json matches the engine", () => {
  const raw = JSON.parse(read("raw.json"));
  assert.deepEqual(raw.scale, plain(K.SCALES.kent1964));
  assert.deepEqual(raw.examples, plain(K.EXAMPLES));
  assert.deepEqual(raw.worked_example, plain(K.WORKED));
  assert.deepEqual(raw.glossary, plain(K.GLOSSARY));
  assert.deepEqual(raw.messages, plain(K.MESSAGES));
  assert.deepEqual(raw.planned_scales, plain(K.PLANNED_SCALES));
  assert.equal(raw.min_group, K.MIN_GROUP);
  assert.equal(raw.simulated_spread, K.SPREAD);
});

const attrs = (s) => Object.fromEntries([...s.matchAll(/([\w:-]+)(?:="([^"]*)")?/g)].map((m) => [m[1], m[2] ?? ""]));
const tags = (name) => [...html.matchAll(new RegExp(`<${name}\\b([^>]*)>`, "g"))].map((m) => attrs(m[1]));
const textOf = (s) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&");

test("the page is one offline file with the metadata it promises and stands on its own", async () => {
  // The catalogue stub (data/visuals/kent.yaml, with these tools and title) is checked in yujieteo/site.
  assert.equal(textOf(/<title>([^<]*)<\/title>/.exec(html)[1]), "Kent: Words of Estimative Probability — Yu Jie Teo");
  assert.deepEqual(tags("link").filter((l) => l.rel === "canonical").map((l) => l.href), ["https://teoyujie.org/visuals/kent"]);
  assert.ok(tags("a").some((a) => a.href === "https://teoyujie.org/visuals.html"), "a way back to the Visuals index");
  assert.deepEqual(tags("script").filter((s) => s.src || s.type === "module"), [], "no external or module scripts");
  assert.deepEqual(tags("link").filter((l) => l.rel !== "canonical" && !/^data:/.test(l.href)), [], "no external stylesheets or icons");
  const nojs = /<div id="nojs">([\s\S]*?)<\/div>/.exec(html);
  assert.match(textOf(nojs[1]), /Probable\s*75%\s*63–87%[\s\S]*Enable JavaScript/);
  assert.ok("hidden" in tags("div").find((d) => d.id === "app"), "controls stay hidden without JavaScript");
  assert.match(html, /Words of Estimative Probability<\/a>”, <i>Studies in Intelligence<\/i> 8\(4\), Fall 1964/, "About cites Kent");
  assert.match(html, /Psychology of Intelligence Analysis/);
});

const offline = () => { throw new Error("the page must not reach the network"); };
const seed = (estimate) => JSON.stringify(K.exportData({ estimate, ledger: [], dictionary: {}, lab: {}, prefs: {} }, T0));
const storage = (init) => { const m = new Map(init ? [["kent:v1", init]] : []); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), stored: () => JSON.parse(m.get("kent:v1")) }; };
const boot = (estimate, search = "") => {
  const ls = storage(estimate && seed(estimate));
  return openPage("kent", { search, globals: { localStorage: ls, fetch: offline, XMLHttpRequest: offline, WebSocket: offline, EventSource: offline } }).then((page) => Object.assign(page, { ls }));
};
const click = (page, dataset) => page.run(`document.listeners.click.forEach((fn) => fn({ target: { closest: () => ({ dataset: ${JSON.stringify(dataset)} }) } }))`);
const input = (page, id, value) => page.run(`document.listeners.input.forEach((fn) => fn({ target: { id: ${JSON.stringify(id)}, value: ${JSON.stringify(value)} } }))`);
const nudge = (page) => page.run(`document.listeners.keydown.forEach((fn) => fn({ key: "ArrowRight", target: document.getElementById("ruler"), preventDefault() {}, stopPropagation() {} }))`);

test("a reload keeps the stored estimate; only a different shared link replaces it, and nothing reaches the network", async () => {
  const stored = { claim: "The bus arrives within 10 minutes", p: 25, confidence: "medium", evidence: [{ id: "e0", text: "Transit app: 17 min", kind: "against" }],
    history: [{ at: T0, before: 70, after: 25, evidence: "Transit app changes" }], range: { lo: 20, hi: 30 }, threshold: { value: 35, direction: "below" } };
  const same = await boot(stored, `?${K.encodeState(stored)}`);
  nudge(same);
  assert.deepEqual(plain(same.ls.stored().estimate), plain(K.normEstimate({ ...stored, p: 26 })), "the synced URL of the stored estimate keeps evidence, history, range and threshold");
  const other = await boot(stored, "?q=Rain+this+evening&p=38");
  nudge(other);
  assert.deepEqual(plain(other.ls.stored().estimate), plain(K.normEstimate({ claim: "Rain this evening", p: 39 })), "a different shared estimate replaces it");
});

test("moving the estimate outside the uncertainty range drops the range, whichever control moves it", async () => {
  const fields = (page) => plain(page.run(`["u-lo", "u-hi", "u-err"].map((id) => document.getElementById(id).value || document.getElementById(id).textContent)`));
  const up = await boot({ claim: "x", p: 72, range: { lo: 60, hi: 80 } });
  assert.deepEqual(fields(up), ["60", "80", ""], "the fields show the stored range");
  input(up, "up-after", "25");
  click(up, { act: "up-record" });
  const state = async (page) => JSON.parse((await page.run("KentTools").find((t) => t.name === "get_current_state").execute({})).content[0].text);
  const e = await state(up);
  assert.deepEqual(plain([e.probability, e.your_uncertainty_range]), [25, null]);
  assert.deepEqual(plain(up.ls.stored().estimate.history.map((h) => [h.before, h.after])), [[72, 25]]);
  assert.deepEqual(fields(up), ["", "", "Your range no longer contained the best estimate, so it was cleared."]);
  const typed = await boot({ claim: "x", p: 72, range: { lo: 60, hi: 80 } });
  await typed.change("p-input", "25");
  typed.run(`document.getElementById("p-input").listeners.blur.forEach((fn) => fn({}))`);
  assert.deepEqual(fields(typed), ["", "", "Your range no longer contained the best estimate, so it was cleared."], "the notice survives the renders after a typed number");
  const draft = await boot({ claim: "x", p: 72 });
  draft.run(`document.getElementById("u-lo").value = "80"; document.getElementById("u-hi").value = "90"`);
  input(draft, "u-lo", "80");
  nudge(draft);
  assert.deepEqual(fields(draft).slice(0, 2), ["80", "90"], "a draft range survives unrelated renders");
  const round = await boot({ claim: "x", p: 72.4, range: { lo: 72.2, hi: 72.45 } });
  click(round, { act: "round" });
  const r = await state(round);
  assert.deepEqual(plain([r.probability, r.your_uncertainty_range]), [72, null]);
});

test("a forecast saved with no phrase stores none and is labelled as Kent's term, never as the user's", async () => {
  const page = await boot({ claim: "The queue clears", p: 74 });
  click(page, { open: "forecast" });
  click(page, { act: "fc-save" });
  assert.equal(page.ls.stored().ledger[0].phrase, "");
  const panel = page.run(`document.getElementById("panel-host").innerHTML`);
  assert.match(panel, /no phrase given; Kent term: probable/);
  assert.doesNotMatch(panel, /said as/);
  const list = many([{ p: 74, yes: 2, no: 3 }, { p: 74, yes: 1, phrase: "probable" }]);
  assert.deepEqual(plain(K.byPhrase(list).map((g) => [g.key, g.kent, g.n])), [["probable", true, 5], ["probable", false, 1]], "the user's word and Kent's fallback stay apart");
  assert.equal(K.groupNote(K.byPhrase(list)[0], "probable"), "No phrase given; Kent term “probable”. These forecasts have historically been more confident than the outcomes justify.");
  const low = many([{ p: 30, yes: 5, no: 5 }]);
  assert.equal(K.groupNote(K.byPhrase(low)[0], "probably not"), "No phrase given; Kent term “probably not”. These events have happened more often than you said.");
});

const STATES = [
  { claim: "", p: 50 },
  { claim: "The queue clears within 20 minutes", p: 78, confidence: "medium" },
  { claim: "The bus arrives within 10 minutes", p: 25, history: [{ before: 70, after: 25, evidence: "Transit app changes: 8 min → 17 min" }], threshold: { value: 35, direction: "below" } },
  { claim: "Rain this evening", p: 38, threshold: { value: 20, direction: "above" } },
  { claim: "Edge <b>|x|</b> & `ticks` $5 *bold* _u_ #h", p: 0 },
  { claim: "Certain", p: 100, confidence: "high" },
  { claim: "Precise", p: 72.384729 },
  { claim: "Gap", p: 99.95 },
  { claim: "Forecasts", p: 70, forecasts: many([{ p: 74, yes: 4, no: 2, phrase: "probably" }, { p: 20, yes: 1, no: 1 }]) },
];

test("every scenario's deck opens in beamdswitch as the standard narrated template with voice bf_emma", () => {
  assertTemplateCopy();
  assertInlined(html, "beamdswitch", TEMPLATE, "kent");
  for (const st of STATES) {
    const md = T.deck(K.report(st)), what = JSON.stringify(st).slice(0, 100), deck = assertStandardDeck(md, what);
    assert.equal(deck.meta.voice, "bf_emma", what);
    assert.ok(md.includes(K.fmtP(st.p)), what);
  }
  const md = T.deck(K.report(STATES[2]));
  assert.match(md, /^## Update: 70% → 25% \(−45 pp\)$/m);
  assert.match(md, /^## Decision threshold 35%$/m);
  assert.match(md, /^Say the number: 25%, probably not \(Kent band 20–40%\)\.$/m);
  assert.match(K.speak("72% → 18% (−54 pp), odds 2.6 : 1, band 63–87%"), /^72 percent to 18 percent \(minus 54 percentage points\), odds 2\.6 to 1, band 63 to 87 percent$/);
});

test("the page boots, its WebMCP tools answer, and the deck buttons export the page as set", async () => {
  const page = await openPage("kent", { search: "?q=Train+arrives+within+5+minutes&p=72&c=medium" });
  const tools = page.run("KentTools");
  assert.deepEqual(plain(tools.map((t) => t.name)), ["get_metadata", "get_scale", "get_current_state", "translate_probability", "find_phrases"]);
  for (const t of tools) assert.equal(t.annotations.readOnlyHint, true);
  const call = async (name, args = {}) => JSON.parse((await tools.find((t) => t.name === name).execute(args)).content[0].text);
  const now = await call("get_current_state");
  assert.deepEqual([now.claim, now.probability, now.analytic_confidence, now.display.term, now.display.band, now.display.small], ["Train arrives within 5 minutes", 72, "medium", "Probable", "63–87%", "about 7 in 10"]);
  assert.equal(now.share_url, "https://teoyujie.org/visuals/kent/?q=Train+arrives+within+5+minutes&p=72&c=medium");
  assert.equal((await call("get_metadata")).url, "https://teoyujie.org/visuals/kent");
  assert.equal((await call("get_scale")).terms.length, 7);
  assert.equal((await call("translate_probability", { probability: 9 })).region, "Almost certainly not");
  assert.equal((await call("translate_probability", { probability: 120 })).problem, K.MESSAGES.range);
  assert.equal((await call("find_phrases", { text: "a decent chance" }))[0].kent, null);
  // Change the probability with the keyboard, then export.
  page.run(`document.listeners.keydown.forEach((fn) => fn({ key: "ArrowRight", shiftKey: true, target: document.getElementById("ruler"), preventDefault() {}, stopPropagation() {} }))`);
  assert.equal((await call("get_current_state")).probability, 77);
  await assertButtonsExport(page, "kent", T.deck(K.report({ claim: "Train arrives within 5 minutes", p: 77, confidence: "medium", history: [], threshold: null, forecasts: [] })));
});
