import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { parseDeck, splitSentences as beamSplit } from "./fixtures/beamdswitch/deck.mjs";

const read = (p) => readFile(new URL(p, import.meta.url), "utf8");
const html = await read("../index.html");
const engineSrc = /<script id="toulmin-engine">([\s\S]*?)<\/script>/.exec(html)[1];
const uiSrc = /<script id="toulmin-ui">([\s\S]*?)<\/script>/.exec(html)[1];
const ctx = {};
vm.createContext(ctx);
vm.runInContext(engineSrc, ctx);
const T = ctx.Toulmin;
const J = (x) => JSON.parse(JSON.stringify(x));
const essayWith = (args, meta = {}) => ({ format: "toulmin-essay", version: 1, essay: Object.assign({ title: "Test essay", thesis: "", author: "", voice: "bf_emma", speed: 1 }, meta), arguments: args.map((a, i) => Object.assign(T.newArgument("a" + (i + 1)), a)), active: 0, origin: "user" });

/* ---------- golden deck ---------- */

test("the template deck equals tests/fixtures/toulmin-template.md byte for byte and is deterministic", async () => {
  const golden = await read("./fixtures/toulmin-template.md");
  const a = T.exportDeck(T.clone(T.TEMPLATE)), b = T.exportDeck(T.clone(T.TEMPLATE));
  assert.equal(a.ok, true);
  assert.equal(a.text, golden);
  assert.equal(b.text, a.text);
  assert.doesNotMatch(a.text, /^date:/m, "no date line, ever");
  assert.deepEqual(J(a.warnings), []);
});

test("the template deck parses in beamdswitch into the expected frames, with narration and notes on every frame", () => {
  const d = T.exportDeck(T.TEMPLATE);
  const deck = parseDeck(d.text);
  assert.equal(deck.meta.title, T.TEMPLATE.essay.title);
  assert.equal(deck.meta.subtitle, T.TEMPLATE.essay.thesis);
  assert.equal(deck.meta.voice, "bf_emma");
  assert.equal(deck.meta.speed, "1");
  assert.equal(deck.meta.date, undefined);
  // Title; argument 1: section + 4 frames; argument 2: section + 4; argument 3 (no qualifier or rebuttals): section + 3; summary: section + glance.
  assert.equal(deck.frames.length, 17);
  assert.equal(d.frames.length, 17);
  assert.deepEqual(deck.frames.map((f) => f.kind), ["title", "section", "frame", "frame", "frame", "frame", "section", "frame", "frame", "frame", "frame", "section", "frame", "frame", "frame", "section", "frame"]);
  assert.deepEqual(deck.frames.filter((f) => f.kind === "section").map((f) => f.title), ["It works", "It is cheap", "Make it required", "Summary"]);
  assert.deepEqual(deck.frames.filter((f) => f.kind === "frame").map((f) => f.title).slice(0, 4), ["Claim", "Grounds", "Warrant and backing", "Qualifier and rebuttals"]);
  assert.deepEqual(deck.frames.map((f) => f.narration), J(d.frames.map((f) => f.narration)));
  for (const f of deck.frames) {
    assert.ok(f.narration, `${f.title} has narration`);
    assert.ok(f.notes, `${f.title} has notes`);
  }
  assert.match(deck.frames[0].notes, /^Estimated total narration: \d+ min \d+ s at 130 words a minute, plus frame lead and tail times\.$/);
  assert.equal(deck.frames[1].narration, "Part 1. It works.");
  assert.equal(deck.frames[2].narration, "The claim. Adopting a surgical safety checklist lowers deaths and complications.");
  // Grounds: two bullets, one pause, sources in notes only.
  assert.equal(deck.frames[3].steps, 2);
  assert.match(deck.frames[3].notes, /^Ground 1 source: Haynes et al\./);
  assert.doesNotMatch(deck.frames[3].narration, /Haynes|doi/);
  assert.match(deck.frames[3].narration, /^Ground one\. In eight hospitals .* 1\.5 percent to 0\.8 percent .* Ground two\. Major complications fell from 11\.0 percent to 7\.0 percent/);
  // "$" is escaped on the slide and left alone in narration.
  assert.match(d.text, /save \\\$15 billion to \\\$25 billion/);
  assert.match(deck.frames[9].narration, /save \$15 billion to \$25 billion/);
  assert.equal(deck.frames.at(-1).title, "Essay at a glance");
  assert.match(deck.frames.at(-1).narration, /^Essay at a glance\. Argument one\. Adopting .* Argument two\. .* Argument three\. Hospitals should require/);
  // Confirmations never reach the deck.
  assert.doesNotMatch(d.text, /CONFIRMED|UNCONFIRMED|sceptic accept/);
});

test("UI totals and deck notes agree: frame estimates sum to the total", () => {
  const d = T.exportDeck(T.TEMPLATE);
  assert.equal(d.totalMs, d.frames.reduce((t, f) => t + f.ms, 0));
  assert.equal(d.perArgument.reduce((t, x) => t + x, 0) + d.frames.filter((f) => f.argument === null).reduce((t, f) => t + f.ms, 0), d.totalMs);
  const deck = parseDeck(d.text);
  deck.frames.slice(1).forEach((f, i) => assert.match(f.notes, new RegExp(`Estimated narration: ${d.frames[i + 1].estimate.replace(".", "\\.")} \\(\\d+ words?\\)\\.$`)));
  assert.match(deck.frames[0].notes, new RegExp(d.total));
});

/* ---------- timing ported from beamdswitch (the site's tests/toulmin.test.mjs also checks the constants and
   the splitter against the beamdswitch build vendored at visuals/beamdswitch/) ---------- */

test("sentence splitting is beamdswitch's, exactly", () => {
  const cases = [
    "Major complications fell from 11.0% to 7.0% in the same study.",
    "Deaths fell from 1.5 percent to 0.8 percent. Then they rose.",
    "Use a checklist, e.g. the WHO one. It helps.",
    "Dr. Haynes led it. Mr. Smith did not.",
    "See Fig. 2 and No. 5. Then stop!",
    "J. R. R. Tolkien wrote it. Fine.",
    "He said \"stop.\" Then went (quietly.) Done?",
    "...leading dots. And a trailing ellipsis...",
    "no terminator at all",
    "   ",
    "A.B. Cd. Ef! Gh? Ij?! Kl.",
    T.exportDeck(T.TEMPLATE).frames.map((f) => f.narration).join(" "),
  ];
  for (const s of cases) {
    assert.deepEqual(J(T.splitSentences(s)), J(beamSplit(s)), s);
  }
  assert.deepEqual(J(T.splitSentences("It fell from 11.0 percent to 7.0 percent. Good.")), ["It fell from 11.0 percent to 7.0 percent.", "Good."]);
  assert.deepEqual(J(T.splitSentences("Use e.g. this. Ask Dr. Who.")), ["Use e.g. this.", "Ask Dr. Who."]);
});

test("integer-ms timing: a 13-word single-sentence frame is 6,950 ms and shows 7.0 s", () => {
  const s = "one two three four five six seven eight nine ten eleven twelve thirteen.";
  assert.equal(T.countWords(s), 13);
  const t = T.frameTiming(s);
  assert.equal(t.ms, 6950);
  assert.equal(T.formatFrame(t.ms), "7.0 s");
  assert.equal(T.sentenceMs("Short."), 800, "800 ms floor");
  assert.equal(T.frameTiming("Short. Brief.").ms, 350 + 800 + 250 + 800 + 600);
  assert.equal(T.formatFrame(6949), "6.9 s");
  assert.equal(T.formatFrame(6950), "7.0 s");
  assert.equal(T.formatTotal(48300), "48.3 s");
  assert.equal(T.formatTotal(59949), "59.9 s");
  assert.equal(T.formatTotal(272000), "4 min 32 s");
  assert.equal(T.formatTotal(272499), "4 min 32 s");
  assert.equal(T.formatTotal(272500), "4 min 33 s");
});

test("narration cleaning: URLs dropped, percent spoken, terminators added, words otherwise unchanged", () => {
  assert.equal(T.narrate("Fell  to 0.8%   (see https://example.org/x)"), "Fell to 0.8 percent (see.");
  assert.equal(T.narrate('He said "no."'), 'He said "no."');
  assert.equal(T.narrate("Probably"), "Probably.");
  assert.equal(T.narrate("100 % sure"), "100 % sure.");
  const d = T.exportDeck(essayWith([{ label: "Why?", claim: "Is it 50% right", qualifier: "possibly!" }]));
  const deck = parseDeck(d.text);
  assert.equal(deck.frames[1].narration, "Part 1. Why.");
  assert.equal(deck.frames[2].narration, "The claim. Is it 50 percent right.");
  assert.equal(deck.frames[3].narration, "The qualifier. possibly!");
});

/* ---------- escaping ---------- */

test("user text never changes deck structure: $, *, _, #, :::, . . ., fences and headings stay inside their lines", () => {
  const nasty = ["# Heading", "## Frame", "::: notes", ":::", ". . .", "```js", "~~~", "$x$ and *b* and _i_ and `c` [l](u) <b>", "-- -", "1. list", "a\n# split\n:::\n. . .\nb"];
  for (const s of nasty) {
    const e = essayWith([{ label: s, claim: s, grounds: [{ text: s, source: s }, { text: s, source: "" }], warrant: s, backing: s, qualifier: s.slice(0, 100), rebuttals: [s, s] }], { title: s, thesis: s, author: s });
    const d = T.exportDeck(e);
    const deck = parseDeck(d.text);
    assert.equal(deck.frames.length, 8, JSON.stringify(s));
    assert.deepEqual(deck.frames.map((f) => f.kind), ["title", "section", "frame", "frame", "frame", "frame", "section", "frame"], JSON.stringify(s));
    assert.deepEqual(deck.frames.slice(2, 6).map((f) => f.title), ["Claim", "Grounds", "Warrant and backing", "Qualifier and rebuttals"]);
    assert.equal(deck.frames[3].steps, 2, "grounds keep exactly one pause");
    assert.equal(deck.frames[5].steps, 3, "qualifier and two rebuttals keep two pauses");
    for (const f of deck.frames) { assert.ok(f.narration); assert.ok(f.notes); }
    assert.equal(deck.meta.title, T.collapse(s));
    for (const line of d.text.split("\n")) {
      if (/^(#|##) /.test(line)) assert.ok(/^(# |## )(Summary|Claim|Grounds|Warrant and backing|Qualifier and rebuttals|Essay at a glance|.*\S)$/.test(line));
    }
  }
  assert.equal(T.escMd("a$b*c_d`e[f]g<h>i\\j"), "a\\$b\\*c\\_d\\`e\\[f\\]g\\<h\\>i\\\\j");
});

test("a deck needs a claim; empty arguments are skipped; claimless ones are warned about and numbering counts exported arguments", () => {
  assert.deepEqual(J(T.exportDeck(T.newEssay())).ok, false);
  assert.equal(T.exportDeck(T.newEssay()).message, "Add at least one claim to export.");
  const e = essayWith([{ claim: "" }, { warrant: "A warrant only." }, { label: "Real", claim: "A claim." }]);
  const d = T.exportDeck(e);
  assert.equal(d.ok, true);
  assert.deepEqual(J(d.warnings), ["Argument 2 has no claim"]);
  const deck = parseDeck(d.text);
  assert.deepEqual(deck.frames.map((f) => f.title), ["Test essay", "Argument 2", "Warrant", "Real", "Claim", "Summary", "Essay at a glance"]);
  assert.equal(deck.frames[3].narration, "Part 2. Real.");
  assert.equal(deck.frames.at(-1).narration, "Essay at a glance. Argument one. A claim.");
  const only = (patch, title) => assert.equal(parseDeck(T.exportDeck(essayWith([Object.assign({ claim: "C." }, patch)])).text).frames[3].title, title);
  only({ backing: "B." }, "Backing");
  only({ qualifier: "Q" }, "Qualifier");
  only({ rebuttals: ["R."] }, "Rebuttals");
});

test("export voice and speed come from the essay or the call, and front matter is quoted", () => {
  const e = essayWith([{ claim: "C." }], { title: 'Say "hi"', author: "Ann", voice: "am_michael", speed: 1.25 });
  const d = T.exportDeck(e);
  const deck = parseDeck(d.text);
  assert.equal(deck.meta.title, 'Say "hi"');
  assert.equal(deck.meta.author, "Ann");
  assert.equal(deck.meta.voice, "am_michael");
  assert.equal(deck.meta.speed, "1.25");
  const o = T.exportDeck(e, { voice: "bm_lewis", speed: 9 });
  assert.equal(parseDeck(o.text).meta.voice, "bm_lewis");
  assert.equal(parseDeck(o.text).meta.speed, "2");
  assert.equal(e.essay.voice, "am_michael", "the essay is unchanged");
  assert.match(T.exportDeck(essayWith([{ claim: "C." }], { title: "" })).text, /^title: "Untitled essay"$/m);
});

/* ---------- JSON ---------- */

test("JSON round-trips to an identical essay", () => {
  for (const e of [T.TEMPLATE, T.HARRY, T.newEssay()]) {
    const text = T.toJSON(e);
    const r = T.parseEssayText(text);
    assert.equal(r.ok, true);
    assert.deepEqual(J(r.essay), J(e));
    assert.equal(T.toJSON(r.essay), text);
  }
  const t = JSON.parse(T.toJSON(T.TEMPLATE));
  assert.deepEqual(Object.keys(t), ["format", "version", "essay", "arguments", "active", "origin"]);
  assert.deepEqual(t.arguments[0].confirmed, ["grounds", "warrant", "backing", "qualifier", "rebuttal", "thesis"]);
});

test("imports are validated: ids regenerated, unknown keys ignored, invalid, oversized and newer files rejected with the first problem", () => {
  const base = () => JSON.parse(T.toJSON(T.TEMPLATE));
  const ok = base(); ok.arguments.forEach((a, i) => { a.id = "zz" + i; a.extra = 1; }); ok.extra = true;
  const r = T.validateEssay(ok);
  assert.equal(r.ok, true);
  assert.deepEqual(J(r.essay.arguments.map((a) => a.id)), ["a1", "a2", "a3"]);
  assert.equal(r.essay.extra, undefined);
  const bad = (mutate, re) => { const x = base(); mutate(x); const v = T.validateEssay(x); assert.equal(v.ok, false); assert.match(v.error, re); };
  bad((x) => { x.format = "other"; }, /format/);
  bad((x) => { x.version = 2; }, /newer version \(2\)/);
  bad((x) => { x.version = "1"; }, /version/);
  bad((x) => { x.arguments[1].claim = "x".repeat(2001); }, /^Argument 2 claim is longer than 2000 characters \(2001\)\.$/);
  bad((x) => { x.arguments[0].grounds[0].source = "x".repeat(301); }, /Argument 1 ground 1 source is longer than 300/);
  bad((x) => { x.arguments[0].qualifier = "x".repeat(101); }, /qualifier is longer than 100/);
  bad((x) => { x.arguments[0].label = "x".repeat(41); }, /label is longer than 40/);
  bad((x) => { x.essay.title = "x".repeat(121); }, /title is longer than 120/);
  bad((x) => { x.essay.thesis = "x".repeat(301); }, /thesis is longer than 300/);
  bad((x) => { x.essay.author = "x".repeat(81); }, /author is longer than 80/);
  bad((x) => { x.arguments[0].grounds = Array.from({ length: 11 }, () => ({ text: "g", source: "" })); }, /11 grounds; the maximum is 10/);
  bad((x) => { x.arguments[0].rebuttals = Array(11).fill("r"); }, /11 rebuttals; the maximum is 10/);
  bad((x) => { x.arguments = Array.from({ length: 13 }, () => x.arguments[0]); }, /13 arguments; the maximum is 12/);
  bad((x) => { x.arguments = []; }, /no arguments/);
  bad((x) => { x.arguments[0].claim = 5; }, /Argument 1 claim must be text/);
  bad((x) => { x.essay.voice = "robot"; }, /voice/);
  bad((x) => { x.essay.speed = 3; }, /speed/);
  bad((x) => { x.active = 7; }, /active/);
  assert.match(T.parseEssayText("{nope").error, /not valid JSON/);
  assert.equal(T.validateEssay(null).ok, false);
});

test("export filenames slug the title", () => {
  assert.equal(T.slug("Why every major operation should run through a checklist"), "why-every-major-operation-should-run-through-a-checklist");
  assert.equal(T.slug(""), "toulmin-essay");
  assert.equal(T.slug("!!!"), "toulmin-essay");
  assert.ok(T.slug("a ".repeat(80)).length <= 60);
});

/* ---------- checklist, hints, limits, paragraphs ---------- */

test("checklist: six auto and six confirm lines with the exact wording and counts", () => {
  const [a1, a2, a3] = T.TEMPLATE.arguments.map(T.checklist);
  assert.deepEqual(J(a1.auto.map((l) => l.label)), ["CLAIM: one arguable statement", "GROUNDS: at least one", "WARRANT: stated", "BACKING: stated", "QUALIFIER: stated", "REBUTTAL: at least one"]);
  assert.deepEqual(J(a1.confirm.map((l) => l.challenge)), ["Would a sceptic accept these grounds as facts?", "Does the warrant really link the grounds to the claim?", "Does the backing support the warrant, not just the claim?", "Does the qualifier match the strength of the evidence?", "Is the strongest objection answered?", "Does this argument support the essay's thesis?"]);
  assert.equal(a1.clear, 12);
  assert.equal(a2.clear, 6);
  assert.ok(a2.auto.every((l) => l.clear));
  assert.equal(a3.clear, 4);
  assert.deepEqual(J(a3.auto.filter((l) => !l.clear).map((l) => l.key)), ["qualifier", "rebuttal"]);
  assert.deepEqual(J(a3.auto.map((l) => l.response)), ["CLEAR ✓", "CLEAR ✓", "CLEAR ✓", "CLEAR ✓", "OPEN ○", "OPEN ○"]);
  assert.deepEqual(J(a1.confirm.map((l) => l.response)), Array(6).fill("CONFIRMED ✓"));
  assert.deepEqual(J(a2.confirm.map((l) => l.response)), Array(6).fill("UNCONFIRMED ○"));
  for (const key of ["claim", "warrant", "backing", "qualifier"]) {
    const a = Object.assign(T.newArgument("a1"), { [key]: "  " });
    assert.equal(T.checklist(a).auto.find((l) => l.key === key).clear, false, `${key} whitespace only`);
    a[key] = "x";
    assert.equal(T.checklist(a).auto.find((l) => l.key === key).clear, true, key);
  }
  const g = T.newArgument("a1"); g.grounds = [{ text: " ", source: "src" }];
  assert.equal(T.checklist(g).auto[1].clear, false);
  g.grounds.push({ text: "fact", source: "" });
  assert.equal(T.checklist(g).auto[1].clear, true);
  const r = T.newArgument("a1"); r.rebuttals = ["", " "];
  assert.equal(T.checklist(r).auto[5].clear, false);
  r.rebuttals.push("unless");
  assert.equal(T.checklist(r).auto[5].clear, true);
  assert.deepEqual(J(T.preflight(T.TEMPLATE).map((x) => x.open)), [0, 6, 8]);
});

test("hints: four prompts with the exact wording, only when the claim is non-empty", () => {
  const H = T.HINTS;
  assert.equal(H.question, "Your claim is phrased as a question. Try stating it as a position someone could disagree with.");
  assert.equal(H.qualifier, "No qualifier yet. How strong is this claim: always, usually, probably? Say so.");
  assert.equal(H.rebuttal, "No rebuttal yet. Name one condition under which the claim would fail.");
  assert.equal(H.warrant, "No warrant yet. Say why the grounds count as a reason for the claim.");
  assert.deepEqual(J(T.hints(T.newArgument("a1"))), [], "a blank argument is not nagged");
  assert.deepEqual(J(T.hints(Object.assign(T.newArgument("a1"), { claim: "Is this a claim?" }))), [H.question, H.qualifier, H.rebuttal, H.warrant]);
  assert.deepEqual(J(T.hints(T.TEMPLATE.arguments[2])), [H.qualifier, H.rebuttal], "template argument 3 shows two live hints");
  assert.deepEqual(J(T.hints(T.TEMPLATE.arguments[0])), []);
});

test("limits: 2,000 characters, 10 items, 12 arguments, and the page enforces them", () => {
  assert.equal(T.LIMITS.text, 2000);
  assert.equal(T.LIMITS.items, 10);
  assert.equal(T.LIMITS.arguments, 12);
  const full = essayWith(Array.from({ length: 12 }, () => ({ claim: "c", grounds: Array.from({ length: 10 }, () => ({ text: "g", source: "" })), rebuttals: Array(10).fill("r") })));
  const page = T.view.argumentHTML(full, 0);
  assert.match(page, /<button type="button" data-act="item-add" data-list="grounds" disabled[^>]*>\+ Add ground<\/button><p class="reason" id="r-grounds">Maximum of 10 grounds reached\.<\/p>/);
  assert.match(page, /data-list="rebuttals" disabled/);
  assert.match(page, /data-act="dup-arg" disabled/);
  assert.equal((page.match(/maxlength="2000"/g) || []).length, 3 + 10 + 10);
  assert.match(page, /id="f-qualifier" data-f="qualifier" maxlength="100"/);
  assert.match(page, /id="f-label" data-f="label" maxlength="40"/);
  assert.match(html, /id="e-title" data-e="title" maxlength="120"/);
  assert.match(html, /id="e-thesis" data-e="thesis" maxlength="300"/);
  assert.match(html, /id="e-author" data-e="author" maxlength="80"/);
  assert.equal(T.view.counterText(1799, 2000), "");
  assert.equal(T.view.counterText(1800, 2000), "200 characters left");
  assert.equal(T.view.counterText(2000, 2000), "0 characters left");
});

test("tab labels: label, else the first 24 characters of the claim, else Argument N", () => {
  assert.equal(T.displayLabel({ label: " Mine ", claim: "x" }, 0), "Mine");
  assert.equal(T.displayLabel({ label: "", claim: "Short claim." }, 0), "Short claim.");
  assert.equal(T.displayLabel({ label: "", claim: "Adopting a surgical safety checklist lowers deaths." }, 0), "Adopting a surgical safe…");
  assert.equal(T.displayLabel({ label: "", claim: "" }, 4), "Argument 5");
});

test("paragraphs: both orderings, lead-ins, qualifier punctuation and empty parts", () => {
  const h = T.HARRY.arguments[0];
  assert.equal(T.paragraph(h, "claim-first"), [
    "Harry is a British subject. (Strength: Presumably.)",
    "The reasons: Harry was born in Bermuda.",
    "What connects the reasons to the claim: A man born in Bermuda will generally be a British subject.",
    "Why that connection holds: The statutes and other legal provisions that govern British nationality.",
    "Unless: Unless both his parents were aliens, or he has become a naturalised American.",
  ].join("\n"));
  assert.equal(T.paragraph(h, "grounds-first"), [
    "Given the evidence: Harry was born in Bermuda.",
    "And this connecting principle: A man born in Bermuda will generally be a British subject.",
    "Backed by: The statutes and other legal provisions that govern British nationality.",
    "We can conclude (Presumably): Harry is a British subject.",
    "Unless: Unless both his parents were aliens, or he has become a naturalised American.",
  ].join("\n"));
  const a = Object.assign(T.newArgument("a1"), { claim: "  A   claim. ", qualifier: "probably!?", grounds: [{ text: "G1.", source: "s" }, { text: "", source: "" }, { text: "G2\n2.", source: "" }] });
  assert.equal(T.paragraph(a, "claim-first"), "A claim. (Strength: probably.)\nThe reasons: G1. G2 2.");
  assert.equal(T.paragraph(a, "grounds-first"), "Given the evidence: G1. G2 2.\nWe can conclude (probably): A claim.");
  a.qualifier = "";
  assert.equal(T.paragraph(a, "claim-first"), "A claim.\nThe reasons: G1. G2 2.");
  assert.equal(T.paragraph(a, "grounds-first"), "Given the evidence: G1. G2 2.\nWe can conclude: A claim.");
  assert.equal(T.paragraph(T.newArgument("a1"), "claim-first"), "");
  const essay = T.essayParagraph(T.HARRY, "claim-first");
  assert.equal(essay, "Harry's nationality (Toulmin's example)\n\nArgument 1 (Harry).\n" + T.paragraph(h, "claim-first"));
  assert.match(T.essayParagraph(T.TEMPLATE, "grounds-first"), /^Why every major operation should run through a checklist\nEvery hospital should require a short written safety checklist for major operations\.\n\nArgument 1 \(It works\)\.\nGiven the evidence: /);
  assert.match(T.essayParagraph(T.TEMPLATE, "grounds-first"), /\n\nArgument 3 \(Make it required\)\.\n[\s\S]*\nWe can conclude: Hospitals should require the checklist rather than leave it optional\.$/);
});

/* ---------- page file checks ---------- */

test("one file within 150 KB, no external requests, no forbidden APIs", () => {
  assert.ok(Buffer.byteLength(html) <= 150 * 1024, `${Buffer.byteLength(html)} bytes`);
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+rel="stylesheet"|@import/i);
  const css = /<style>([\s\S]*?)<\/style>/.exec(html)[1];
  assert.doesNotMatch(css, /url\(/, "no CSS url()");
  const allowed = new Set(["https://teoyujie.org/visuals/toulmin", "https://doi.org/10.1056/NEJMsa0810119"]);
  for (const m of html.matchAll(/(?:https?:)?\/\/[^\s"'<>)\\]+/g)) {
    const u = m[0];
    if (u.startsWith("//") && /\/\/\s|\/\/ /.test(u)) continue;
    assert.ok(allowed.has(u.replace(/[.,;]+$/, "")) || /^https\?:\\\/\\\/\\S\+$/.test(u), `unexpected URL ${u}`);
  }
  for (const m of html.matchAll(/(?:href|src|action)="([^"]*)"/g)) {
    const u = m[1];
    assert.ok(allowed.has(u) || u.startsWith("#") || u.startsWith("../") || u === "data:,", `unexpected link ${u}`);
  }
  for (const bad of ["alert(", "confirm(", "prompt(", "execCommand", "eval(", "fetch(", "XMLHttpRequest", "WebSocket", "sendBeacon", "importScripts", "window.top", "window.parent"]) {
    assert.ok(!html.includes(bad), `uses ${bad}`);
  }
});

test("head: title, description, canonical, Open Graph and Twitter card; no og:image", () => {
  assert.match(html, /<meta charset="utf-8">/);
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">/);
  assert.match(html, /<title>Toulmin argument builder<\/title>/);
  assert.match(html, /<meta name="description" content="[^"]{50,}">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/teoyujie\.org\/visuals\/toulmin">/);
  assert.match(html, /<meta property="og:title" content="Toulmin argument builder">/);
  assert.match(html, /<meta property="og:description" content="[^"]+">/);
  assert.match(html, /<meta property="og:url" content="https:\/\/teoyujie\.org\/visuals\/toulmin">/);
  assert.match(html, /<meta property="og:type" content="website">/);
  assert.match(html, /<meta name="twitter:card" content="summary">/);
  assert.match(html, /<link rel="icon" href="data:,">/);
  assert.doesNotMatch(html, /og:image/);
  assert.match(html, /href="\.\.\/\.\.\/visuals\.html">← All visuals</);
  assert.match(html, /<a class="skip" href="#argument">Skip to the argument<\/a>/);
  assert.match(html, /<noscript>[\s\S]*The position you want the reader to accept\.[\s\S]*← All visuals[\s\S]*<\/noscript>/);
});

function controlsWithoutNames(markup) {
  const labelled = new Set([...markup.matchAll(/<label[^>]*\bfor="([^"]+)"/g)].map((m) => m[1]));
  const missing = [];
  for (const m of markup.matchAll(/<(button|input|select|textarea)\b([^>]*)>([\s\S]*?)(?=<\/\1>|$)/g)) {
    const [, tag, attrs] = m;
    if (/type="(hidden)"/.test(attrs)) continue;
    const id = /\bid="([^"]+)"/.exec(attrs);
    if (/aria-label(ledby)?="[^"]+"/.test(attrs)) continue;
    if (id && labelled.has(id[1])) continue;
    if (tag === "button") { const text = /^([\s\S]*?)<\/button>/.exec(markup.slice(m.index + m[0].indexOf(">") + 1)); if (text && text[1].replace(/<[^>]+>/g, "").trim()) continue; }
    if (tag === "input" && /type="radio"/.test(attrs)) { const before = markup.slice(0, m.index); if (/<label>[^<]*$/.test(before)) continue; }
    missing.push(`${tag} ${attrs.trim().slice(0, 80)}`);
  }
  return missing;
}

test("every control has an accessible name (static page and generated argument, outline, checklist)", () => {
  const body = html.slice(html.indexOf("<body>"), html.indexOf('<script id="toulmin-engine">'));
  assert.deepEqual(controlsWithoutNames(body), []);
  for (const e of [T.TEMPLATE, T.HARRY, T.newEssay()]) {
    e.arguments.forEach((_, i) => assert.deepEqual(controlsWithoutNames(T.view.argumentHTML(e, i)), [], `argument ${i + 1}`));
    assert.deepEqual(controlsWithoutNames(T.view.outlineHTML(e)), []);
    assert.deepEqual(controlsWithoutNames(T.view.tabsHTML(e)), []);
  }
});

test("ARIA tabs: roles, aria-selected, roving tabindex and aria-controls; one h1, h2 per argument, h3 per part", () => {
  const tabs = T.view.tabsHTML(Object.assign(T.clone(T.TEMPLATE), { active: 1 }));
  assert.equal((tabs.match(/role="tab"/g) || []).length, 3);
  assert.deepEqual([...tabs.matchAll(/aria-selected="(\w+)" tabindex="(-?\d)"/g)].map((m) => m[1] + m[2]), ["false-1", "true0", "false-1"]);
  assert.equal((tabs.match(/aria-controls="argpanel"/g) || []).length, 3);
  assert.match(html, /role="tablist" aria-label="Arguments in essay order"/);
  assert.match(html, /role="tabpanel" id="argpanel"/);
  assert.equal((html.slice(0, html.indexOf('<script id="toulmin-engine">')).match(/<h1[\s>]/g) || []).length, 1);
  const page = T.view.argumentHTML(T.TEMPLATE, 2);
  assert.equal((page.match(/<h2[\s>]/g) || []).length, 1);
  for (const p of T.PARTS) assert.match(page, new RegExp(`<h3 id="h-${p.key}"><span class="badge" aria-hidden="true">${p.letter}</span>${p.name}</h3>`));
  // DOM order is the logical order.
  const order = [...page.matchAll(/class="card part-(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(order, ["claim", "grounds", "warrant", "backing", "qualifier", "rebuttal"]);
  assert.match(page, /Your turn: finish this one\./);
  assert.doesNotMatch(page, /id="marker" hidden/);
  assert.match(T.view.argumentHTML(T.TEMPLATE, 0), /id="marker" hidden/);
});

test("guidance text: definitions, Why/Example, chips and the 60-second panel", () => {
  const defs = { claim: "The position you want the reader to accept.", grounds: "The facts, data or observations you offer in support.", warrant: "The principle that explains why the grounds count as support for the claim.", backing: "What supports the warrant itself: a law, rule, theory or body of evidence.", qualifier: "How strong the claim is: always, usually, probably, possibly.", rebuttal: "The conditions under which the claim would not hold, including honest objections." };
  for (const p of T.PARTS) assert.equal(p.def, defs[p.key]);
  const page = T.view.argumentHTML(T.TEMPLATE, 0);
  assert.equal((page.match(/<details class="why"><summary>Why \/ Example<\/summary>/g) || []).length, 6);
  assert.deepEqual(J(T.QUALIFIER_CHIPS), ["always", "almost certainly", "probably", "in most cases", "presumably", "possibly", "sometimes"]);
  assert.match(html, /<summary>Toulmin in 60 seconds<\/summary>/);
  assert.match(html, /body\.compact \.def\{display:none\}/);
  for (const sym of ["CLEAR ✓", "OPEN ○", "CONFIRMED ✓", "UNCONFIRMED ○"]) assert.ok(Object.values(T.RESPONSES).includes(sym));
});

/* ---------- colour ---------- */

function tokens(block) { return Object.fromEntries([...block.matchAll(/--(\w+):(#[0-9a-f]{6})/g)].map((m) => [m[1], m[2]])); }
function lum(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test("colour tokens in the shipped CSS meet the contrast figures in spec 10.1", () => {
  const light = tokens(/:root\{([^}]*)\}/.exec(html)[1]);
  const dark = tokens(/@media \(prefers-color-scheme:dark\)\{:root:not\(\[data-theme="light"\]\)\{([^}]*)\}\}/.exec(html)[1]);
  const forced = tokens(/:root\[data-theme="dark"\]\{([^}]*)\}/.exec(html)[1]);
  assert.deepEqual(forced, dark, "the data-theme hook matches the dark scheme");
  assert.deepEqual([light.bg, light.surface, light.fg, light.muted, light.control, light.focus], ["#ffffff", "#f5f5f7", "#1d1d1f", "#6e6e73", "#86868b", "#0071e3"]);
  assert.deepEqual([dark.bg, dark.surface, dark.fg, dark.muted, dark.control, dark.focus], ["#1d1d1f", "#2c2c2e", "#f5f5f7", "#a1a1a6", "#8e8e93", "#2997ff"]);
  const min = (a, b, m, what) => assert.ok(ratio(a, b) >= m, `${what}: ${ratio(a, b).toFixed(2)} < ${m}`);
  min(light.fg, light.bg, 12.0, "light text on page"); min(light.fg, light.surface, 10.6, "light text on surface");
  min(dark.fg, dark.bg, 12.2, "dark text on page"); min(dark.fg, dark.surface, 10.6, "dark text on surface");
  min(light.muted, light.bg, 4.5, "light muted on page");
  min(dark.muted, dark.bg, 4.5, "dark muted on page"); min(dark.muted, dark.surface, 4.5, "dark muted on surface");
  min(light.control, light.surface, 3, "light control outline on surface"); min(dark.control, dark.surface, 3, "dark control outline on surface");
  for (const [fg, bg, what] of [[light.focus, light.bg, "light page"], [light.focus, light.surface, "light surface"], [dark.focus, dark.bg, "dark page"], [dark.focus, dark.surface, "dark surface"]]) min(fg, bg, 3, `focus on ${what}`);
  min(light.muted, light.surface, 4.5, "light muted on surface");
  assert.doesNotMatch(html, /\.(card|panel|notice|banner|confirm)[^{]*\{[^}]*color:var\(--muted\)/, "no muted text on surfaces");
  for (const accent of ["claim", "grounds", "warrant", "backing", "qualifier", "rebuttal", "c1", "c2", "c3", "c4", "hl"]) assert.doesNotMatch(html, new RegExp(`[^-]color:var\\(--${accent}\\)`), `accent ${accent} is never text`);
  assert.match(html, /a\{color:var\(--fg\);text-decoration:underline\}/);
});

test("colour is never the only cue: letters, distinct bar patterns, words plus symbols", () => {
  const bars = Object.fromEntries([...html.matchAll(/\.part-(\w+) \.bar\{background:([^}]+)\}/g)].map((m) => [m[1], m[2].replace(/var\(--\w+\)/g, "C")]));
  assert.deepEqual(Object.keys(bars).sort(), ["backing", "claim", "grounds", "qualifier", "rebuttal", "warrant"]);
  assert.equal(new Set(Object.values(bars)).size, 6, "six different patterns once hue is removed");
  assert.deepEqual(J(T.PARTS.map((p) => p.letter)), ["C", "G", "W", "B", "Q", "R"]);
});

/* ---------- data ---------- */

test("raw.json carries the same template, example, constants and connectives as the page", async () => {
  const raw = JSON.parse(await read("../raw.json"));
  assert.deepEqual(raw.template, J(T.TEMPLATE));
  assert.deepEqual(raw.example, J(T.HARRY));
  assert.deepEqual(raw.constants.timing, J(T.TIMING));
  assert.deepEqual(raw.constants.limits, J(T.LIMITS));
  assert.deepEqual(raw.constants.voices, J(T.VOICES));
  assert.deepEqual(raw.connectives.paragraph, J(T.LEADINS));
  assert.deepEqual(raw.connectives.narration, J(T.NARRATION));
  assert.deepEqual(raw.checklist.auto, J(T.AUTO_LINES));
  assert.deepEqual(raw.checklist.confirm, J(T.CONFIRM_LINES));
  assert.deepEqual(raw.hints, J(T.HINTS));
  assert.equal(raw.fetched, "2026-10-01");
});

/* ---------- the page script, booted against a minimal DOM ---------- */

function bootPage({ saved = null } = {}) {
  const els = new Map();
  const make = (props = {}) => {
    const attrs = {}, listeners = {};
    return Object.assign({
      textContent: "", innerHTML: "", value: "", hidden: false, disabled: false, open: false, placeholder: "", dataset: {}, style: {},
      classList: { add() {}, remove() {}, toggle() {} },
      setAttribute(k, v) { attrs[k] = String(v); }, getAttribute: (k) => (k in attrs ? attrs[k] : null),
      addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
      fire(type, e = {}) { for (const fn of listeners[type] || []) fn(Object.assign({ preventDefault() {} }, e)); },
      querySelectorAll: () => [], querySelector: () => make(), closest: () => null,
      focus() { page.document.activeElement = this; },
    }, props);
  };
  const $ = (id) => { if (!els.has(id)) els.set(id, make({ id })); return els.get(id); };
  for (const id of ["export", "preflight"]) $(id).hidden = true;
  const store = new Map(saved ? [["toulmin:v1", JSON.stringify(saved)]] : []);
  const registered = [], copied = [];
  const doc = make({ getElementById: $, body: make(), contains: () => true, activeElement: null });
  const page = {
    setTimeout: () => 0, clearTimeout() {}, addEventListener() {},
    document: doc,
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    navigator: { modelContext: { registerTool(t) { registered.push(t); } }, clipboard: { writeText: async (t) => { copied.push(t); } } },
  };
  page.self = page.window = page;
  vm.createContext(page);
  vm.runInContext(engineSrc, page);
  vm.runInContext(uiSrc, page);
  const click = (act, data = {}) => {
    const btn = make({ dataset: Object.assign({ act }, data) });
    doc.fire("click", { target: { closest: (sel) => (sel === "button[data-act]" ? btn : null) } });
  };
  const call = async (name, input) => JSON.parse((await registered.find((t) => t.name === name).execute(input)).content[0].text);
  return { $, doc, registered, copied, click, call };
}

test("WebMCP: the page registers five read-only tools that report the essay without changing it", async () => {
  const p = bootPage();
  assert.deepEqual(p.registered.map((t) => t.name), ["get_data", "get_metadata", "query", "get_paragraph", "export_markdown"]);
  for (const t of p.registered) assert.equal(t.annotations.readOnlyHint, true, t.name);
  const before = await p.call("get_data");
  assert.equal(before.essay.title, T.TEMPLATE.essay.title);
  assert.deepEqual(J(before.columns), J(T.COLUMNS));
  assert.deepEqual(J(before.rows), J(T.TEMPLATE.arguments.map((a, i) => T.argumentRow(a, i))));
  assert.equal(before.total, 3);
  const meta = await p.call("get_metadata");
  assert.equal(meta.fetched, "2026-10-01");
  assert.deepEqual(J(meta.constants), J(T.TIMING));
  const byId = await p.call("query", { id: "a2" }), byPos = await p.call("query", { id: 2 });
  assert.equal(byId.row.id, "a2");
  assert.deepEqual(byPos.row, byId.row);
  assert.equal((await p.call("query", { id: "a9" })).row, null);
  assert.equal((await p.call("get_paragraph", {})).text, T.essayParagraph(T.TEMPLATE, "claim-first"));
  assert.equal((await p.call("get_paragraph", { ordering: "grounds-first", scope: 1 })).text, T.paragraph(T.TEMPLATE.arguments[0], "grounds-first"));
  assert.equal((await p.call("get_paragraph", { scope: "a7" })).text, null);
  const md = await p.call("export_markdown", { voice: "bm_lewis", speed: 1.5 });
  assert.equal(md.text, T.exportDeck(T.TEMPLATE, { voice: "bm_lewis", speed: 1.5 }).text);
  assert.equal(parseDeck(md.text).meta.voice, "bm_lewis");
  assert.deepEqual(await p.call("get_data"), before, "the tools leave the essay unchanged");
  assert.equal((await p.call("export_markdown")).text, T.exportDeck(T.TEMPLATE).text);
});

test("the page stops adding arguments at 12 and disables the add button with a reason", async () => {
  const p = bootPage({ saved: essayWith(Array.from({ length: 11 }, () => ({ claim: "c" }))) });
  assert.equal(p.$("addarg").disabled, false);
  p.click("add-arg");
  assert.equal((await p.call("get_data")).total, 12);
  assert.equal(p.$("addarg").disabled, true);
  assert.equal(p.$("addarg-reason").textContent, "Maximum of 12 arguments reached.");
  p.click("add-arg");
  p.click("dup-arg");
  assert.equal((await p.call("get_data")).total, 12);
});

test("ARIA tabs: the panel is labelled by the active tab and arrow, Home and End keys move focus", () => {
  const p = bootPage();
  assert.equal(p.$("argpanel").getAttribute("aria-labelledby"), "tab-a1");
  const tabs = T.TEMPLATE.arguments.map((a, i) => p.$("tab-" + a.id));
  p.$("tablist").querySelectorAll = () => tabs;
  const key = (from, k) => { tabs[from].focus(); p.$("tablist").fire("keydown", { key: k }); return tabs.indexOf(p.doc.activeElement); };
  assert.equal(key(0, "ArrowRight"), 1);
  assert.equal(key(2, "ArrowRight"), 0);
  assert.equal(key(0, "ArrowLeft"), 2);
  assert.equal(key(1, "Home"), 0);
  assert.equal(key(0, "End"), 2);
  assert.deepEqual(J(tabs.map((t) => t.getAttribute("tabindex"))), ["-1", "-1", "0"]);
  assert.equal(key(1, "a"), 1);
  p.doc.fire("click", { target: { closest: (sel) => (sel === "[role=tab]" ? { dataset: { i: "2" } } : null) } });
  assert.equal(p.$("argpanel").getAttribute("aria-labelledby"), "tab-a3");
});

test("Copy deck exports the latest text before the debounced refresh, and a cleared speed means 1", async () => {
  const p = bootPage();
  p.doc.fire("input", { target: { dataset: { e: "title" }, value: "Fresh title" } });
  p.click("copy-md");
  await new Promise((r) => setImmediate(r));
  assert.equal(parseDeck(p.copied[0]).meta.title, "Fresh title");
  p.$("x-speed").value = " ";
  p.$("x-speed").fire("change", { target: p.$("x-speed") });
  assert.equal(p.$("x-speed").value, "1");
  p.click("copy-md");
  await new Promise((r) => setImmediate(r));
  assert.equal(parseDeck(p.copied[1]).meta.speed, "1");
  assert.equal(T.normSpeed(""), 1);
  assert.equal(T.normSpeed(null), 1);
  assert.equal(T.normSpeed("0.2"), 0.5);
});

/* ---------- performance ---------- */

test("re-rendering the active argument at maximum size takes under 50 ms", () => {
  const long = "word ".repeat(400).slice(0, 2000);
  const e = essayWith(Array.from({ length: 12 }, () => ({ label: "L".repeat(40), claim: long, grounds: Array.from({ length: 10 }, () => ({ text: long, source: "s".repeat(300) })), warrant: long, backing: long, qualifier: "q".repeat(100), rebuttals: Array(10).fill(long), confirmed: ["grounds"] })));
  for (let k = 0; k < 3; k++) { T.view.argumentHTML(e, 0); T.paragraph(e.arguments[0], "claim-first"); }
  const runs = [];
  for (let k = 0; k < 10; k++) {
    const t0 = performance.now();
    T.view.checklistHTML(e.arguments[0]); T.view.promptsHTML(e.arguments[0]); T.paragraph(e.arguments[0], "claim-first"); T.view.argumentHTML(e, 0);
    runs.push(performance.now() - t0);
  }
  runs.sort((a, b) => a - b);
  assert.ok(runs[5] < 50, `median ${runs[5].toFixed(1)} ms`);
  const t0 = performance.now();
  const d = T.exportDeck(e);
  assert.ok(d.ok && performance.now() - t0 < 500, "a maximum-size export still runs quickly on demand");
  assert.equal(parseDeck(d.text).frames.length, 1 + 12 * 5 + 2);
});
