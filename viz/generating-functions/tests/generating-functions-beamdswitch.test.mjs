/* Generating Functions Lab: its beamdswitch decks. Every lesson (at every parameter it offers), every
   problem and the full core deck is written by the site's shared template and parsed with
   beamdswitch's own parser; the frames follow the lesson's states in order, with `. . .` reveals. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { checkDeck, divs } from "./beamdswitch-deck-checks.mjs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
/** @param {string} id */
const script = (id) => /** @type {RegExpExecArray} */ (new RegExp(`<script id="${id}">\\n([\\s\\S]*?)\\n</script>`).exec(html))[1];
const ctx = vm.createContext({});
ctx.self = ctx;
for (const id of ["gf-engine", "gf-lessons", "gf-beamdswitch"]) vm.runInContext(script(id), ctx);
/** @type {typeof import("../lessons.js")} */
const L = ctx.GFLab;
/** @type {import("./beamdswitch-template").BeamdswitchTemplate} */
const T = ctx.Beamdswitch;
// Engine values come from another vm realm; compare them as plain JSON.
/** @param {unknown} a @param {unknown} b @param {string} [msg] */
const deq = (a, b, msg) => assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), msg);

/* Every lesson at its defaults, then every value of every parameter it offers. */
const CASES = L.LESSONS.flatMap((l) => [
  { l, p: L.defaults(l), what: `${l.hash} defaults` },
  ...Object.entries(l.params || {}).flatMap(([k, spec]) => spec.values.map((v) => ({ l, p: { ...L.defaults(l), [k]: v }, what: `${l.hash} ${k}=${v}` }))),
]);
/** The beam-md-switch state comments of a deck, as key/value maps. @param {string} md */
const comments = (md) => [...md.matchAll(/<!-- beam-md-switch\n([\s\S]*?)\n-->/g)].map((m) => Object.fromEntries(m[1].split("\n").map((line) => line.split(/: (.*)/s).slice(0, 2))));

test("every lesson deck opens in beamdswitch as the standard template, narrated on every slide, voice bf_emma", () => {
  for (const { l, p, what } of CASES) {
    const md = T.deck(L.lessonReport(l.id, p)), deck = checkDeck(md, what);
    assert.equal(deck.meta.voice, "bf_emma", what);
    assert.equal(deck.meta.title, `Generating Functions Lab: ${l.title}`, what);
    assert.equal(divs(deck.frames[deck.frames.length - 1].children, "key").length, 1, `${what}: ends on the takeaway`);
  }
});

test("reveal order follows the lesson's states: problem, then each state in order, then read and verify", () => {
  for (const { l, p, what } of CASES) {
    const n = l.n ? L.clampN(l, l.n.def, p) : null, md = T.deck(L.lessonReport(l.id, p)), states = l.states(p, n);
    const order = comments(md).map((c) => c.state);
    const want = ["problem", ...states.filter((s) => s.stage === "object").map((s) => s.id), ...states.filter((s) => s.stage !== "object").map((s) => s.id), l.coeffs ? "read" : "answer", "verify"];
    deq(order, want, what);
    for (const c of comments(md)) { assert.equal(c.lesson, l.hash, what); if (n !== null) assert.equal(c.n, String(n), what); }
    // Each state's formulas appear on its own frame, one reveal step each.
    const deck = checkDeck(md, what);
    for (const s of states) {
      const f = deck.frames.find((x) => x.title === s.title);
      assert.ok(f, `${what}: frame for ${s.id}`);
      const steps = new Set(f.children.filter((c) => c.type === "md").map((c) => c.step));
      assert.ok(steps.size >= Math.min(s.tex.length + 1, 2), `${what}: ${s.id} reveals step by step`);
    }
  }
});

test("the Fibonacci deck reproduces the spec's reasoning order without collapsing the derivation", () => {
  const md = T.deck(L.lessonReport("fibonacci")), deck = checkDeck(md, "fibonacci");
  const titles = deck.frames.filter((f) => f.kind === "frame").map((f) => f.title);
  deq(titles, ["Problem: Solving a recurrence (Fibonacci)", "The sequence", "The recurrence", "Align shifted sequences", "Translate rows to F(x), xF(x), x²F(x)", "Combine the rows", "Solve the rational equation", "Coefficient formula", "Read the coefficient: n = 8", "Verified: 1 of 1 checks agree", "When to use this"]);
  assert.match(md, /\$\$ F\(x\) - xF\(x\) - x\^2F\(x\) = x \$\$/);
  assert.match(md, /\$\$ \[x\^\{8\}\]\\,F\(x\) = 21 \$\$/);
});

test("every problem deck hides the solution behind its hints, and the full core deck runs 30–40 content slides", () => {
  for (const pr of L.PROBLEMS) {
    const md = T.deck(L.problemReport(pr.k)), deck = checkDeck(md, `problem ${pr.k}`), frames = deck.frames.filter((f) => f.kind === "frame").map((f) => f.title);
    assert.equal(deck.meta.voice, "bf_emma");
    deq(frames.slice(1, 1 + pr.hints.length), pr.hints.map((_, i) => `Hint ${i + 1}`), `problem ${pr.k}`);
    assert.ok(frames.indexOf("Solution") > frames.indexOf(`Hint ${pr.hints.length}`), `problem ${pr.k}: solution after the hints`);
  }
  const md = T.deck(L.fullReport()), deck = checkDeck(md, "full deck"), frames = deck.frames.filter((f) => f.kind === "frame");
  assert.equal(deck.meta.voice, "bf_emma");
  assert.ok(frames.length >= 30 && frames.length <= 45, `${frames.length} content slides`);
  assert.match(md, /^## 22\. The DFT matrix$/m);
  assert.match(md, /\| DFT of 1 \+ 2x \+ 3x² \+ 4x³ at 1, i, −1, −i \| 10, −2 − 2i, −2, −2 \+ 2i \|/);
  assert.ok(md.includes("Generating functions are changes of representation."));
});

test("the in-page presentation draws exactly the deck's frames, in the deck's order", () => {
  for (const { l, p, what } of CASES.slice(0, 40)) {
    const report = L.lessonReport(l.id, p), slides = L.slides(report), deck = checkDeck(T.deck(report), what);
    deq(slides.map((s) => s.title), deck.frames.map((f) => f.kind === "title" ? deck.meta.title : f.title), what);
  }
});
