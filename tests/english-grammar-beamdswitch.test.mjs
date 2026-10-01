import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { assertButtonsExport, assertDeckButtons, assertInlined, assertStandardDeck, assertTemplateCopy, load, openPage, read } from "./beamdswitch-decks.mjs";

const SLUG = "english-grammar";
const T = load(`viz/${SLUG}/beamdswitch.js`);
const R = load(`viz/${SLUG}/report.js`);
const html = read(`viz/${SLUG}/index.html`);
const script = (id) => new RegExp(`<script[^>]*id="${id}"[^>]*>([\\s\\S]*?)</script>`).exec(html)[1];
const D = JSON.parse(script("eg-data").replace(/<\\\//g, "</"));
const context = vm.createContext({});
vm.runInContext(script("eg-logic"), context);
const L = context.EGLogic;
const idx = L.index(D);
const raw = JSON.parse(read(`data/${SLUG}/raw.json`));
const deckFor = (id) => T.deck(R.report(idx, L, id));
// A spread of lessons: the start page's concept, ones with and without contrasts, notes, gaps and supplements.
const SOME = ["category-and-function", "subject", "complements-and-adjuncts", "relative-clauses", "fused-relatives", "supplementation", "passive",
  "clause-polarity", "comparative-clauses", "anaphora", "morphological-structure", "primary-terminals", "hyphens"];

test("the site's shared beamdswitch template is the copy the page inlines", () => {
  assertTemplateCopy(SLUG);
  assertInlined(html, "beamdswitch", read(`viz/${SLUG}/beamdswitch.js`), SLUG);
  assertInlined(html, "report", read(`viz/${SLUG}/report.js`), SLUG);
  assertDeckButtons(html, SLUG);
});

test("on each concept page, beamdswitch saves and Copy deck copies that lesson's deck", async () => {
  for (const id of SOME) {
    const location = { hash: `#${id}`, search: "", pathname: `/viz/${SLUG}/`, href: `https://example.test/viz/${SLUG}/#${id}` };
    const page = await openPage(SLUG, { globals: { location } });
    await assertButtonsExport(page, `${SLUG}-${id}`, deckFor(id));
  }
});

test("every lesson's deck parses in beamdswitch into the standard template, narrated on every slide", () => {
  assert.equal(D.concepts.length, 84);
  for (const c of D.concepts) {
    const deck = assertStandardDeck(deckFor(c.id), c.id);
    assert.equal(deck.meta.title, c.name, c.id);
    assert.equal(deck.meta.subtitle, "A lesson from How English Grammar Works", c.id);
  }
});

test("a lesson's deck is built from that concept's own content", () => {
  for (const c of D.concepts) {
    const md = deckFor(c.id), plain = md.replace(/\\(.)/g, "$1");
    const item = c.items[0], e = idx.examples.get(item.ex);
    const contrasts = D.contrasts.filter((k) => k.concepts.includes(c.id));
    assert.ok(plain.includes(c.orientation), `${c.id}: orientation`);
    assert.ok(plain.includes(`## The example: ${e.text}`), `${c.id}: primary example`);
    assert.ok(plain.includes(e.explanation), `${c.id}: explanation`);
    const d = L.describe(idx, e.id, item.node);
    assert.ok(plain.includes(`Selected ${d.level}: “${d.text}”`), `${c.id}: the primary example's analysis`);
    if (c.note) assert.ok(plain.includes(c.note), `${c.id}: technical note`);
    for (const k of contrasts) assert.ok(plain.includes(k.explanation), `${c.id}: contrast ${k.id}`);
    assert.equal((md.match(/^## Compare: /gm) || []).length, contrasts.length, `${c.id}: one slide per contrast`);
    // Every example sentence quoted is the primary example or one of the concept's contrasts.
    const allowed = new Set([e.text, ...contrasts.flatMap((k) => [idx.examples.get(k.a.ex).text, idx.examples.get(k.b.ex).text])]);
    for (const other of D.examples) if (!allowed.has(other.text) && other.text.split(" ").length > 3) assert.ok(!plain.includes(other.text), `${c.id}: unrelated example ${other.id}`);
    for (const o of D.concepts) if (o.id !== c.id) assert.ok(!plain.includes(o.orientation), `${c.id}: another concept's orientation (${o.id})`);
  }
});

test("each deck keeps the page's note that the analyses were not checked against the book", () => {
  const foot = /<footer class="foot">([\s\S]*?)<\/footer>/.exec(html)[1];
  assert.ok(foot.includes(R.HONEST.replace(/'/g, "&#x27;")) || foot.includes(R.HONEST), "the deck's note is the page footer's, word for word");
  for (const c of D.concepts) {
    const md = deckFor(c.id);
    assert.ok(md.includes("have not yet been checked against the book's text"), c.id);
    assert.match(md, /## How far to trust this\n\n.*not yet been checked against the book's text[\s\S]*?::: narration\n.*not yet been checked/, `${c.id}: shown and narrated`);
  }
});

test("decks cite only the concept's own references, each a verified chapter or section", () => {
  const chapters = new Map(raw.chapters.map((ch) => [ch.n, ch]));
  for (const c of D.concepts) {
    let md = deckFor(c.id);
    for (const r of c.references) {
      const ch = chapters.get(r.chapter);
      assert.ok(ch, `${c.id}: chapter ${r.chapter} is in the verified outline`);
      if (r.section) {
        const sec = ch.sections.find((s) => s.id === r.section);
        assert.ok(sec && r.label === `Ch. ${ch.n} §${sec.id} ${sec.title}` && r.page === sec.page, `${c.id}: ${r.label} matches the verified outline`);
      } else assert.equal(r.label, `Ch. ${ch.n} ${ch.title}`, c.id);
      md = md.split(r.label + (r.page ? ` (p. ${r.page})` : "")).join("");
    }
    assert.ok(deckFor(c.id).includes(`CGEL reference: ${c.references[0].label}`), `${c.id}: cites its location`);
    // A technical note may name a chapter in prose ("discussed in Chapter 5"), but only one the concept cites.
    const own = new Set(c.references.map((r) => r.chapter));
    for (const m of md.matchAll(/\bCh(?:apter|\.)?\s*(\d+)/gi)) assert.ok(own.has(Number(m[1])), `${c.id}: ${m[0]} is not one of its verified references`);
    assert.doesNotMatch(md, /§|\bsection\s+\d|\bp\.\s*\d|\bpages?\s+\d/i, `${c.id}: no other section or page numbers`);
  }
});

test("lessons on punctuation, word structure and anaphora carry those structures into the deck", () => {
  const terminals = deckFor("primary-terminals").replace(/\\(.)/g, "$1");
  assert.ok(terminals.includes("Selected mark: “.”"));
  assert.ok(terminals.includes("- Indicator: Full stop (primary terminal)"));
  assert.ok(terminals.includes("Punctuation, attached to constituent boundaries (not part of the tree):"));
  assert.match(terminals, /Look at the full stop\. It is not a constituent/);
  const word = deckFor("morphological-structure").replace(/\\(.)/g, "$1");
  assert.ok(word.includes("The example word is: unhappiness."));
  assert.ok(word.includes("Selected part: “unhappi”"));
  assert.ok(word.includes("  - Base: Adjective “unhappi”\n    - Affix: Prefix “un”"), "the word's structure is outlined layer by layer");
  const spelling = deckFor("spelling-alternations").replace(/\\(.)/g, "$1");
  assert.ok(spelling.includes("- Spelling: the base “stop” is written “stopp” here (doubling)."));
  const anaphora = deckFor("anaphora").replace(/\\(.)/g, "$1");
  assert.ok(anaphora.includes("- Antecedent: “Kim”"));
  assert.ok(anaphora.includes("— antecedent “Kim”"));
});

test("narration says starred examples and gaps in words", () => {
  assert.equal(R.speak("adjectives do not take NP objects (*fond chocolate)."), "adjectives do not take NP objects (not fond chocolate).");
  assert.equal(R.speak("Trees mark the position with a gap (__). The __ is linked."), "Trees mark the position with a gap. The a gap is linked.");
  assert.equal(R.md("(*fond chocolate) a gap (__)"), "(\\*fond chocolate) a gap (\\_\\_)");
});
