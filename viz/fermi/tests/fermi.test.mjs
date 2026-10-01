import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { assertButtonsExport, assertInlined, assertStandardDeck, assertTemplateCopy, openPage, read } from "./data-visuals-beamdswitch.mjs";

const html = read("index.html");
const engine = /<script id="fermi-engine">\n([\s\S]*?)<\/script>/.exec(html)[1];
const load = () => { const ctx = {}; ctx.self = ctx; vm.runInNewContext(engine, ctx); return ctx.Fermi; };
const F = load();
const T = (await import("node:module")).createRequire(import.meta.url)("../beamdswitch.js");
const plain = (v) => JSON.parse(JSON.stringify(v));
const near = (a, b, what) => assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)), `${what}: ${a} ≠ ${b}`);
/* rows: [op, low, best, high] (or [op, best] for a single value) */
const chain = (rows, extra = {}) => F.compute({ showRange: true, ...extra, factors: rows.map(([op, a, b, c]) => (b === undefined ? { op, best: String(a) } : { op, low: String(a), best: String(b), high: String(c), ranged: true })) });
const QUEUE = () => F.compute(F.defaults());
const shown = (r) => { const h = F.headline(r); return JSON.stringify([h, F.trail(r), F.sensitivity(r).map((x) => [x.effect, x.width]), F.axis(r), F.scale(r), F.summary(r.s), F.describe(r)]); };

test("the in-source self-tests pass", () => {
  assert.deepEqual(plain(F.selfTest()), []);
});

test("multiplication, division, addition and ordinary precedence", () => {
  near(chain([["mul", 3], ["mul", 4]]).best, 12, "3 × 4");
  near(chain([["mul", 12], ["div", 4]]).best, 3, "12 ÷ 4");
  near(chain([["mul", 2], ["add", 3]]).best, 5, "2 + 3");
  near(chain([["mul", 2], ["add", 3], ["mul", 4]]).best, 14, "2 + 3 × 4 is 14, not 20");
  near(chain([["mul", 12], ["div", 4], ["add", 10], ["div", 5], ["mul", 2]]).best, 7, "12 ÷ 4 + 10 ÷ 5 × 2");
  assert.deepEqual(plain(F.terms(chain([["mul", 1], ["mul", 1], ["add", 1], ["div", 1], ["add", 1]]).factors)), [[0, 1], [2, 3], [4]]);
  assert.equal(chain([["div", 2], ["mul", 5]]).best, 10, "the first factor's operator is ignored");
});

test("the queue example: best 30 min, range 12.8 to about 74.7 min, shown as roughly 13–75 min", () => {
  const r = QUEUE(), h = F.headline(r);
  near(r.best, 30, "12 × 10 ÷ 4");
  near(r.low, 12.8, "8 × 8 ÷ 5");
  near(r.high, (16 * 14) / 3, "16 × 14 ÷ 3");
  assert.equal(r.high.toFixed(1), "74.7");
  assert.equal(h.best, "≈ 30 min");
  assert.equal(h.range, "≈ 13–75 min");
  assert.equal(h.mag, "≈ 3 × 10¹ min");
  assert.deepEqual(plain(F.trail(r).map((x) => [x.label, x.expr, x.value, x.exact])), [
    ["Best estimate", "12 × 10 ÷ 4", "≈ 30 min", "30"],
    ["Low-side estimate", "8 × 8 ÷ 5", "≈ 13 min", "12.8"],
    ["High-side estimate", "16 × 14 ÷ 3", "≈ 75 min", "74.6667"]]);
  assert.deepEqual(plain(F.chainLines(r)), ["12 groups", "× 10 min/cycle", "÷ 4 groups/cycle"]);
  assert.equal(F.describe(r), "Best estimate about 30 min. Range from your assumptions about 13 to 75 min.");
});

test("range propagation is exact for each operation, not every low with every low", () => {
  const prod = chain([["mul", 2, 3, 4], ["mul", 5, 6, 7]]);
  assert.deepEqual([prod.low, prod.best, prod.high], [10, 18, 28]);
  const quot = chain([["mul", 10, 20, 30], ["div", 2, 4, 5]]);
  assert.deepEqual([quot.low, quot.high], [2, 15], "A ÷ B: A_low ÷ B_high to A_high ÷ B_low");
  const sum = chain([["mul", 1, 2, 3], ["div", 1, 2, 4], ["add", 10, 20, 30]]);
  assert.deepEqual([sum.low, sum.best, sum.high], [10.25, 21, 33]);
  // Brute force over every corner: the propagated extremes are the true extremes.
  const rows = [["mul", 2, 3, 5], ["div", 1, 2, 3], ["add", 4, 6, 7], ["mul", 0.5, 1, 2], ["div", 2, 3, 8]], r = chain(rows);
  let lo = Infinity, hi = -Infinity;
  for (let m = 0; m < 2 ** rows.length; m++) {
    const v = F.evaluate(r.factors, (f, i) => ((m >> i) & 1 ? f.high : f.low));
    lo = Math.min(lo, v); hi = Math.max(hi, v);
  }
  near(r.low, lo, "lowest corner"); near(r.high, hi, "highest corner");
});

test("best only: blank low and high mean the best value, and fast mode ignores ranges", () => {
  const r = F.compute({ factors: [{ best: "12" }, { op: "mul", best: "10" }, { op: "div", best: "4" }] });
  assert.deepEqual([r.low, r.best, r.high, r.ranged], [30, 30, 30, false]);
  assert.equal(F.headline(r).best, "≈ 30");
  const half = F.compute({ factors: [{ best: "10", low: "", high: "20", ranged: true }] });
  assert.deepEqual([half.low, half.high], [10, 20]);
  const fast = F.compute({ ...F.defaults(), showRange: false });
  assert.deepEqual([fast.best, fast.low, F.headline(fast).range], [30, null, null]);
  assert.deepEqual(plain(F.sensitivity(fast)), []);
});

test("every invalid input gets a plain message and never NaN, Infinity or undefined", () => {
  const cases = [
    [{ best: "" }, "blank", "best"], [{ best: "-3" }, "negative", "best"], [{ best: "abc" }, "nan", "best"], [{ best: "?" }, "nan", "best"],
    [{ best: "1e400" }, "overflow", "best"], [{ best: "1e-400" }, "underflow", "best"],
  ];
  for (const [f, code, blocks] of cases) {
    const r = F.compute({ factors: [{ best: "2" }, { op: "mul", ...f }] }), e = r.errors[0];
    assert.equal(e.code, code, JSON.stringify(f));
    assert.equal(e.blocks, blocks);
    assert.equal(r.best, null);
    assert.equal(F.headline(r).issue, F.MESSAGES[code]);
    assert.doesNotMatch(shown(r), /NaN|Infinity|undefined/);
  }
  const zero = F.compute({ factors: [{ best: "12" }, { op: "div", best: "0" }] });
  assert.equal(zero.issue.message, "This factor cannot be zero because it is used as a divisor.");
  const zeroLow = chain([["mul", 12, 12, 12], ["div", 0, 4, 5]]);
  assert.equal(zeroLow.best, 3, "a zero low divisor still leaves the best estimate");
  assert.equal(zeroLow.rangeIssue.code, "zeroDivisor");
  assert.equal(F.headline(zeroLow).range, null);
  const lowAbove = chain([["mul", 13, 12, 16]]), bestAbove = chain([["mul", 8, 12, 11]]);
  assert.deepEqual([lowAbove.best, lowAbove.rangeIssue.code, bestAbove.rangeIssue.code], [12, "lowAboveBest", "bestAboveHigh"]);
  assert.equal(chain([["mul", 1e300, 1e300, 1e300], ["mul", 1e300, 1e300, 1e300]]).issue.code, "overflowResult");
  assert.equal(chain([["mul", 1e-200, 1e-200, 1e-200], ["mul", 1e-200, 1e-200, 1e-200]]).issue.code, "underflowResult");
  assert.equal(F.compute({ factors: [] }).issue.code, "empty");
  for (const bad of [null, 7, "x", { factors: "nope" }, { factors: [null, 5, { op: "toString", best: {} }] }]) assert.doesNotMatch(shown(F.compute(bad)), /NaN|Infinity|undefined/, JSON.stringify(bad));
  assert.equal(F.normalize({ factors: [{}, { op: "constructor" }] }).factors[1].op, "mul");
  assert.equal(F.normalize({ factors: Array(40).fill({ best: "1" }) }).factors.length, F.MAX_FACTORS);
  assert.deepEqual(plain(F.parseNum("1,000")), { value: 1000 });
  assert.deepEqual(plain(F.parseNum(" 2.5e3 ")), { value: 2500 });
  assert.deepEqual(plain(F.parseNum("-0")), { value: 0 });
});

test("large and small quantities, including intermediate overflow and underflow", () => {
  assert.equal(F.fmt(chain([["mul", 2e200], ["mul", 2e200], ["div", 1e300]]).best), "4 × 10¹⁰⁰");
  assert.equal(F.fmt(chain([["mul", 3e-200], ["mul", 1e-150], ["div", 1e-200]]).best), "3 × 10⁻¹⁵⁰");
  const big = chain([["mul", 2e6, 2.4e6, 3e6]]);
  assert.equal(F.headline(big).best, "≈ 2.4 million");
  assert.equal(F.headline(big).mag, "≈ 2 × 10⁶");
  assert.equal(F.headline(chain([["mul", 0.003]])).best, "≈ 0.003");
});

test("results use about two significant figures, coarser when the range is wide", () => {
  const cases = [[0.003, "0.003"], [3, "3"], [30, "30"], [300, "300"], [3000, "3,000"], [30000, "30,000"], [3e6, "3 million"], [2.416666667, "2.4"], [75.000001, "75"], [1047, "1,000"], [999999, "1 million"], [4.5e9, "4.5 billion"], [2e15, "2 × 10¹⁵"], [0.00042, "4.2 × 10⁻⁴"], [0, "0"], [NaN, "—"], [Infinity, "—"]];
  for (const [x, s] of cases) assert.equal(F.fmt(x), s, String(x));
  assert.equal(F.fmt(1047, 1), "1,000");
  const spec = chain([["mul", 400, 1047, 3000]]);
  assert.deepEqual([F.headline(spec).best, F.headline(spec).range, F.headline(spec).wide], ["≈ 1,000", "≈ 400–3,000", false]);
  const wide = chain([["mul", 100, 347, 2000]]);
  assert.equal(F.sigFor(wide), 1, "a range of ten times or more gets one significant figure");
  assert.deepEqual([F.headline(wide).best, F.headline(wide).range, F.headline(wide).wide], ["≈ 300", "≈ 100–2,000", true]);
  assert.match(F.NOTES.wide, /^Your plausible range spans more than one order of magnitude\. That may be fine/);
  assert.equal(F.headline(chain([["mul", 10, 30, 40], ["mul", 2.5]])).best, "≈ 75");
  assert.equal(F.fmtRange(1.2e6, 3e6, 2, "people"), "1.2–3 million people");
  assert.equal(F.fmtRange(2e15, 4e16, 2, ""), "2 × 10¹⁵ – 4 × 10¹⁶");
  assert.equal(F.magnitude(30), "3 × 10¹");
  assert.equal(F.magnitude(95), "1 × 10²");
});

test("sensitivity ranks by |ln(high/low)| and suggests what to improve first", () => {
  const rows = F.sensitivity(QUEUE());
  assert.deepEqual(plain(rows.map((x) => [x.name, x.a, x.b, x.effect])), [
    ["Groups ahead", 20, 40, "large effect"], ["Average seating cycle", 24, 42, "medium effect"], ["Groups seated every cycle", 24, 40, "medium effect"]]);
  near(rows[0].score, Math.log(2), "score");
  assert.equal(rows[0].width, 100);
  const seated = rows.find((x) => x.i === 2);
  assert.deepEqual([seated.atLow, seated.atHigh], [40, 24], "a divisor at its low gives the higher answer");
  const nx = F.next(rows);
  assert.equal(nx.text, "If you want a better estimate, improve this assumption first: Groups ahead.");
  assert.equal(nx.why, "This assumption currently has the biggest effect on your result.");
  // Scale-free: the same multiplicative spread scores the same at any size.
  const s1 = F.sensitivity(chain([["mul", 1, 2, 4], ["mul", 10, 10, 10]])), s2 = F.sensitivity(chain([["mul", 1e6, 2e6, 4e6], ["mul", 10, 10, 10]]));
  near(s1[0].score, s2[0].score, "scale-free");
  // A factor that can reach zero outranks any finite ratio; single values have no effect.
  const z = F.sensitivity(chain([["mul", 2, 3, 9], ["add", 0, 1, 2], ["mul", 5]]));
  assert.deepEqual(plain(z.map((x) => [x.name, x.effect])), [["Factor 2", "large effect"], ["Factor 1", "large effect"], ["Factor 3", "no range entered"]]);
  const zz = F.sensitivity(chain([["mul", 0, 1, 2], ["mul", 2, 3, 9]]));
  assert.deepEqual(plain(zz.map((x) => [x.name, x.effect, x.width])), [["Factor 1", "can reach zero", 100], ["Factor 2", "large effect", 85]]);
  assert.equal(F.next(F.sensitivity(chain([["mul", 5], ["mul", 2]]))), null, "nothing to suggest without ranges");
});

test("units cancel conservatively and warnings appear only when clear", () => {
  const q = QUEUE();
  assert.equal(F.units(q).derived, "min");
  assert.equal(F.resultUnit({ ...q, s: { ...q.s, unit: "" } }), "min");
  const u = (rows) => F.units(F.compute({ factors: rows.map(([op, unit]) => ({ op, unit, best: "2" })) }));
  assert.equal(u([["mul", "customer/h"], ["mul", "h/day"], ["mul", "coffee/customer"]]).derived, "coffee/day");
  assert.equal(u([["mul", "m"], ["mul", "m"]]).derived, "m²");
  assert.equal(u([["mul", "groups"], ["div", "min"]]).derived, "groups/min");
  assert.equal(u([["mul", "a/b/c"], ["mul", "b"]]).derived, null, "unparseable units are left alone");
  assert.equal(u([["mul", "groups"], ["mul", ""]]).derived, null, "a missing unit makes the result uncertain");
  const mixed = u([["mul", "minutes"], ["add", "dollars"]]);
  assert.equal(mixed.warning.text, "Check your units: these terms do not appear to use the same unit.");
  assert.equal(u([["mul", "min"], ["add", "h"]]).warning.kind, "family");
  assert.match(u([["mul", "min"], ["add", "h"]]).warning.text, /different units of time \(min, h\)/);
  assert.equal(u([["mul", "minutes"], ["add", "minute"]]).warning, null, "plural and singular are not flagged");
  assert.equal(u([["mul", "min"], ["add", ""]]).warning, null, "uncertain: no warning");
  assert.equal(u([["mul", "m"], ["div", "m/min"], ["add", "min"]]).derived, "min");
  for (const e of F.EXAMPLES) assert.equal(F.units(F.compute(F.example(e.id))).warning, null, e.id);
});

test("sanity checks: scale, benchmark and the reverse check", () => {
  const r = QUEUE(), rows = F.sensitivity(r);
  assert.deepEqual(plain(F.scale(r)), { k: 1, text: "Your estimate is around 10¹: in the tens.", prompt: "Would ones, tens or hundreds make sense here?" });
  assert.equal(F.scale(chain([["mul", 300]])).text, "Your estimate is around 10²: in the hundreds.");
  assert.equal(F.benchmark(r, "45").text, "Your estimate is about 0.67× this benchmark: smaller.");
  assert.equal(F.benchmark(r, "15").text, "Your estimate is about 2× this benchmark: larger.");
  assert.equal(F.benchmark(r, "31").text, "Your estimate is about the same as this benchmark (0.97×).");
  assert.match(F.benchmark(r, "1000").text, /more than an order of magnitude apart/);
  assert.equal(F.benchmark(r, "0").error, "Use a benchmark above zero.");
  assert.equal(F.benchmark(r, "abc").error, F.MESSAGES.nan);
  assert.equal(F.benchmark(r, ""), null);
  assert.deepEqual(plain(F.reverse(r, F.benchmark(r, "45"), rows)), [
    "If the answer really were ≈ 30 min, that is about 2.5 min for each of the 12 groups.",
    "To reach the benchmark of 45 min, Groups ahead would need to be about 18 groups instead of 12. That is outside your range of 8–16 groups."]);
  const div = chain([["mul", 12, 12, 12], ["div", 2, 4, 8]], { unit: "min" });
  assert.match(F.reverse(div, F.benchmark(div, "6"), F.sensitivity(div))[1], /Factor 2 would need to be about 2 instead of 4\. That is inside your range\.$/);
  assert.equal(F.reverse(chain([["mul", 2], ["add", 3]]), null, []), null, "no reverse check across + terms");
});

test("copy summary as plain text and Markdown", () => {
  assert.equal(F.summary(F.defaults()), [
    "How long will this restaurant queue take?", "", "Estimate:", "12 groups", "× 10 min/cycle", "÷ 4 groups/cycle", "≈ 30 min", "",
    "Range from assumptions:", "≈ 13–75 min", "", "Assumptions:", "- Groups ahead: 8 / 12 / 16 groups", "- Average seating cycle: 8 / 10 / 14 min/cycle",
    "- Groups seated every cycle: 3 / 4 / 5 groups/cycle", "", "Most sensitive assumption:", "Groups ahead"].join("\n"));
  const md = F.summary(F.defaults(), "markdown");
  assert.match(md, /^\*\*How long will this restaurant queue take\?\*\*\n/);
  assert.match(md, /```\n12 groups\n× 10 min\/cycle\n÷ 4 groups\/cycle\n≈ 30 min\n```/);
  assert.match(md, /^Range from assumptions: ≈ 13–75 min$/m);
  assert.match(md, /^Most sensitive assumption: Groups ahead$/m);
  assert.equal(F.summary({ question: "", factors: [{ best: "" }] }), "Fermi estimate\n\nNo estimate yet: Enter a best estimate.");
});

test("the result axis is logarithmic where valid and linear from zero otherwise", () => {
  const a = F.axis(QUEUE());
  assert.equal(a.kind, "log");
  assert.deepEqual(plain(a.ticks.map((t) => t.label)), ["1", "10", "100", "1k"]);
  assert.ok(a.lo < a.best && a.best < a.hi && a.lo > 0 && a.hi < 1);
  const z = F.axis(chain([["mul", 0, 2, 8]]));
  assert.equal(z.kind, "linear");
  assert.equal(z.lo, 0);
  assert.equal(z.hi, 1);
  assert.equal(F.axis(chain([["mul", 0]])).kind, "linear");
  const wide = F.axis(chain([["mul", 1e-3, 1, 1e9]]));
  assert.ok(wide.ticks.filter((t) => t.label).length <= 8, "labels thin out on wide axes");
});

test("what-if sliders use the factor's own range, with a labelled log scale when it spans ten times", () => {
  const lin = F.sliderScale({ low: 8, best: 12, high: 16 });
  assert.deepEqual([lin.log, lin.label], [false, "Linear scale, 8 to 16"]);
  assert.equal(F.fromPos(lin, F.toPos(lin, 12)), 12);
  assert.equal(F.fromPos(lin, 1000), 16);
  const log = F.sliderScale({ low: 12, best: 12, high: 12 });
  assert.deepEqual([log.log, log.label], [true, "Log scale, 1.2 to 120"]);
  assert.equal(F.fromPos(log, 500), 12);
  assert.equal(F.sliderScale({ low: 0, best: 0, high: 0 }).log, false);
  // Bounds with more than three significant figures: the slider stays inside the factor's own range.
  const odd = F.sliderScale(chain([["mul", 1234, 1500, 1876]]).factors[0]);
  assert.equal(odd.label, "Linear scale, 1,234 to 1,876");
  assert.deepEqual([F.fromPos(odd, 0), F.fromPos(odd, 1000)], [1234, 1876]);
  for (const p of [0, 1000]) assert.equal(chain([["mul", 1234, F.fromPos(odd, p), 1876]]).rangeIssue, null);
});

test("an invalid low or high is shown as no range, never as a range from zero", () => {
  const st = { ...F.defaults(), factors: [{ op: "mul", name: "A", unit: "", low: "abc", best: "12", high: "16", ranged: true }, { op: "mul", name: "B", unit: "", best: "2" }] };
  const r = F.compute(st), f = r.factors[0];
  assert.deepEqual([f.low, f.high, F.hasRange(f)], [null, 16, false]);
  assert.equal(F.summary(st).split("\n").find((l) => l.startsWith("- A")), "- A: 12");
  const md = T.deck(F.report(st));
  assert.ok(md.includes("A: 12."), "narration gives the best value only");
  assert.ok(!md.includes("between") && !md.includes("— / 12"), "no range from a missing side");
  assert.deepEqual(plain(F.sliderScale(f)), plain(F.sliderScale({ low: 12, best: 12, high: 12 })));
});

test("every example loads, stays editable and computes a range", () => {
  assert.deepEqual(plain(F.EXAMPLES.map((e) => e.chip)), ["Queue", "Travel", "Shopping", "Food", "Time", "Money", "Household", "Café", "Crowd", "Storage"]);
  for (const e of F.EXAMPLES) {
    const s = F.example(e.id), r = F.compute({ ...s, showRange: true });
    assert.ok(r.best > 0 && r.low <= r.best && r.best <= r.high, e.id);
    assert.ok(s.question && s.factors.length >= 2 && s.factors.length <= F.MAX_FACTORS, e.id);
    s.factors[0].best = "1"; assert.notEqual(F.example(e.id).factors[0].best, "1", "a loaded example is a copy");
  }
  assert.ok(F.EXAMPLES.find((e) => e.id === "food").factors.some((f) => f.op === "add"), "an additive example");
  assert.match(F.EXAMPLES.find((e) => e.id === "food").note, /not measured nutritional data/);
  assert.deepEqual(plain(F.blank()), plain({ question: "", unit: "", factors: [F.blankFactor()], showRange: true, showMag: false, benchmark: "", example: "blank" }));
});

test("raw.json matches the engine", () => {
  const raw = JSON.parse(read("raw.json"));
  assert.deepEqual(raw.examples, plain(F.EXAMPLES));
  assert.deepEqual(raw.initial, plain(F.defaults()));
  assert.deepEqual(raw.messages, plain(F.MESSAGES));
  assert.deepEqual(raw.notes, plain(F.NOTES));
  assert.deepEqual(raw.rules, plain(F.RULES));
  assert.equal(raw.max_factors, F.MAX_FACTORS);
});

/* The page's head and no-JavaScript fallback, read as the served document. */
const attrs = (s) => Object.fromEntries([...s.matchAll(/([\w:-]+)(?:="([^"]*)")?/g)].map((m) => [m[1], m[2] ?? ""]));
const tags = (name) => [...html.matchAll(new RegExp(`<${name}\\b([^>]*)>`, "g"))].map((m) => attrs(m[1]));
const textOf = (s) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&");
const DESCRIPTION = "Break everyday estimation problems into rough quantities, propagate plausible ranges, and see which assumptions matter most.";

test("the page is one offline file with the metadata it promises", async () => {
  const page = await openPage("fermi");
  const tools = page.run("FermiTools"), meta = JSON.parse((await tools.find((t) => t.name === "get_metadata").execute({})).content[0].text);
  const title = textOf(/<title>([^<]*)<\/title>/.exec(html)[1]);
  assert.match(title, / — Yu Jie Teo$/);
  const named = Object.fromEntries(tags("meta").map((m) => [m.name || m.property, m.content]));
  assert.equal(named.description, DESCRIPTION);
  assert.deepEqual([named["og:title"], named["og:description"], named["og:type"], named["og:url"]], [title, DESCRIPTION, "website", meta.url]);
  assert.deepEqual(tags("link").filter((l) => l.rel === "canonical").map((l) => l.href), ["https://teoyujie.org/visuals/fermi"]);
  assert.equal(meta.url, "https://teoyujie.org/visuals/fermi");
  assert.ok(tags("a").some((a) => a.href === "https://teoyujie.org/visuals.html"), "a way back to the Visuals index");
  assert.deepEqual(tags("script").filter((s) => s.src || s.type === "module"), [], "no external or module scripts");
  assert.deepEqual(tags("link").filter((l) => l.rel !== "canonical" && !/^data:/.test(l.href)), [], "no external stylesheets or icons");
  const nojs = /<div id="nojs">([\s\S]*?)<\/div>/.exec(html);
  assert.ok(nojs, "a no-JavaScript fallback");
  assert.match(textOf(nojs[1]), /12 groups\n× 10 minutes per cycle\n÷ 4 groups per cycle\n≈ 30 minutes[\s\S]*Enable JavaScript to build and edit your own estimate\./, "worked example without JavaScript");
  assert.ok("hidden" in tags("div").find((d) => d.id === "app"), "controls stay hidden without JavaScript");
  assert.ok(Buffer.byteLength(html) < 100_000, `${Buffer.byteLength(html)} bytes`);
});

test("the range is never called a confidence interval in what the page writes", () => {
  const st = { ...F.defaults(), benchmark: "45" }, r = F.compute(st);
  const out = [F.describe(r), F.summary(st), F.summary(st, "markdown"), T.deck(F.report(st)), ...Object.values(F.NOTES), ...F.trail(r).map((x) => x.label)].join("\n");
  assert.match(out, /from (your|these) assumptions/);
  for (const m of out.matchAll(/(.{0,16})confidence interval/gi)) assert.match(m[1], /not a measured $/, `never labelled a confidence interval: ${m[0]}`);
});

const STATES = [
  F.defaults(),
  { ...F.defaults(), benchmark: "45" },
  { ...F.defaults(), showRange: false },
  { ...F.example("food"), showRange: true, benchmark: "" },
  { ...F.example("crowd"), showRange: true, benchmark: "100" },
  { ...F.blank(), question: "Odd $ma*rk_up# <b>|x|</b> & 50%" },
  { ...F.defaults(), factors: [{ op: "mul", name: "A `tick`", unit: "m²", best: "1e20", low: "1e19", high: "1e21", ranged: true }, { op: "add", name: "B", unit: "s", best: "3" }] },
  { ...F.defaults(), factors: [{ op: "mul", best: "12" }, { op: "div", best: "0" }] },
];

test("every scenario's deck opens in beamdswitch as the standard narrated template", () => {
  assertTemplateCopy("fermi");
  assertInlined(html, "beamdswitch", read("beamdswitch.js"), "fermi");
  for (const st of STATES) {
    const md = T.deck(F.report(st)), what = JSON.stringify(st).slice(0, 120);
    assertStandardDeck(md, what);
    const h = F.headline(F.compute(st));
    if (h.ok) assert.ok(md.includes(h.best), what);
  }
  const md = T.deck(F.report(F.defaults()));
  assert.match(md, /^## Best estimate ≈ 30 min, range ≈ 13–75 min$/m);
  assert.match(md, /^## Sensitivity to the assumptions: Groups ahead matters most$/m);
  assert.match(md, /^≈ 30 min \(range ≈ 13–75 min\); improve Groups ahead first\.$/m);
  assert.match(F.speak("≈ 13–75 min/cycle, 2 × 10⁶ m²"), /^about 13 to 75 min per cycle, 2 times 10 to the power 6 m squared$/);
  for (const [best, said] of [[30, "around 10 to the power 1: in the tens."], [4000, "around 10 to the power 3: in the thousands."], [0.02, "around 10 to the power minus 2: in the hundredths."]])
    assert.ok(F.speak(F.scale(chain([["mul", best]])).text).endsWith(`is ${said}`), `narrates the scale of ${best}`);
});

test("the page boots, its WebMCP tools answer, and the deck buttons export the page as set", async () => {
  const page = await openPage("fermi");
  const tools = page.run("FermiTools");
  assert.deepEqual(plain(tools.map((t) => t.name)), ["get_metadata", "get_current_state", "list_examples", "estimate"]);
  for (const t of tools) assert.equal(t.annotations.readOnlyHint, true);
  const call = async (name, args = {}) => JSON.parse((await tools.find((t) => t.name === name).execute(args)).content[0].text);
  const now = await call("get_current_state");
  assert.equal(now.display.best, "≈ 30 min");
  assert.equal(now.display.range, "≈ 13–75 min");
  assert.equal(now.improve_first, "Groups ahead");
  assert.equal((await call("get_metadata")).url, "https://teoyujie.org/visuals/fermi");
  assert.equal((await call("list_examples")).length, F.EXAMPLES.length);
  const est = await call("estimate", { factors: [{ best: 12, low: 8, high: 16 }, { op: "mul", best: 10, low: 8, high: 14 }, { op: "div", best: 4, low: 3, high: 5 }], result_unit: "min" });
  assert.deepEqual([est.best, est.low, est.display.range], [30, 12.8, "≈ 13–75 min"]);
  const bad = await call("estimate", { factors: [{ best: 1 }, { op: "div", best: 0 }] });
  assert.equal(bad.problem, "This factor cannot be zero because it is used as a divisor.");
  // Change a factor through the page's own input handler, then export.
  page.run(`document.getElementById("app").listeners.input[0]({ target: { value: "16", dataset: { i: "0", k: "best" } } })`);
  const st = F.defaults();
  st.factors[0].best = "16";
  await assertButtonsExport(page, "fermi", T.deck(F.report(st)));
});
