import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { checkDeck, standIn } from "./beamdswitch-deck-checks.mjs";

const load = createRequire(import.meta.url);
/** @type {BeamdswitchApi} */
const T = load("../beamdswitch.js");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
// The second script is the numeric core; its module.exports guard loads it in Node.
/** @typedef {typeof import("../.typecheck/inline/script-3.js")} Core the page's numeric core, typed from its extracted copy */
/** @type {Core} */
const R = (() => { const module = { exports: {} }; vm.runInNewContext(scripts[1], { module, console }); return /** @type {Core} */ (module.exports); })();
/** @template T @param {T} v @returns {T} */
const plain = (v) => structuredClone(v);

/** @typedef {Parameters<Core["analyze"]>[0]} Inputs */
/* An example the test names: it must exist. */
const example = (/** @type {string} */ id) => { const e = R.EXAMPLES.find((x) => x.id === id); assert.ok(e, id); return e; };
/** @param {string} ex @param {Partial<Inputs>} over @returns {Inputs} */
const withK = (ex, over) => ({ ...plain(example(ex).inputs), ...over });
/* The analysis of a loop that computes. */
const analyzed = (/** @type {Inputs} */ inputs) => { const a = R.analyze(inputs); assert.ok(a.ok, "the loop computes"); return a; };
/* Every example, plus loops that reach the remaining branches: unstable, failing a requirement, a manual K max, a pole at the origin. */
/** @type {Record<string, Inputs>} */
const LOOPS = {
  ...Object.fromEntries(R.EXAMPLES.map((e) => [e.id, plain(e.inputs)])),
  unstable: withK("type1-third-order", { k: 20 }),
  "fails requirements": withK("pi-requirements", { k: 40 }),
  "manual K max": withK("zero-breakin", { kMax: 10 }),
  "pole at the origin": withK("type1-third-order", { k: 0 }),
  "no requirement met": withK("type1-third-order", { requirements: { zetaMin: null, wnMin: null, wnMax: null, settlingTime: 0.5 } }),
};
/* The deck of a loop that computes. */
const deckFor = (/** @type {Inputs} */ inputs) => { const report = R.locusReport(inputs); assert.ok(report, "the loop computes"); return T.deck(report); };
/* The blob saved by a download the test expects. */
const blobOf = (/** @type {{ blob: Blob | undefined } | undefined} */ file) => { assert.ok(file && file.blob, "a file was saved"); return file.blob; };

test("the deck for every loop parses in beamdswitch into the standard template, narrated on every slide", () => {
  for (const [name, inputs] of Object.entries(LOOPS)) {
    const deck = checkDeck(deckFor(inputs), name);
    assert.match(deck.meta.title ?? "", /^Root locus design check: [sz]-plane loop with \d+ poles? and \d+ zeros?$/, name);
  }
});

test("the numbers in the deck are the analysis's, at the page's four significant figures", () => {
  for (const [name, inputs] of Object.entries(LOOPS)) {
    const a = analyzed(inputs), md = deckFor(inputs), loop = a.loop, z = loop.mode === "z";
    const atk = R.closedLoopAt(a, inputs.k, inputs.requirements);
    for (const p of atk.poles) {
      const r = { pole: R.fmtC(p.pole, 4), s: z ? (Number.isFinite(p.s.re) ? R.fmtC(p.s, 4) : "-∞") : null, zeta: R.fmt(p.zeta, 4), wn: R.fmt(p.wn, 4) };
      const row = `| ${r.pole} |${z ? ` ${r.s} |` : ""} ${r.zeta} | ${r.wn} | ${p.pass ? "ok" : p.stable ? "fails req." : "unstable"} |`;
      assert.ok(md.includes(row), `${name}: ${row}`);
    }
    assert.ok(md.includes(`## Closed-loop poles at K = ${R.fmt(inputs.k, 4)}: `), name);
    assert.ok(md.includes(`\`${R.factoredStr(loop.num, loop.den, loop.x, 4)}\``), `${name}: the loop's factored form`);
    assert.ok(md.includes(`K max = ${R.fmt(a.kMax, 4)}`), name);
    for (const c of a.annotations.crossings) assert.ok(md.includes(`K = ${R.fmt(c.k, 4)}`), `${name}: crossing at K = ${c.k}`);
    for (const b of a.annotations.breakpoints) assert.ok(md.includes(`${b.kind} ${loop.x} = ${R.fmt(b.x, 4)} (K = ${R.fmt(b.k, 4)})`), `${name}: ${b.kind}`);
    const tests = R.runSelfTests();
    assert.ok(md.includes(`## Self-tests: ${tests.cases.length} of ${tests.cases.length} verification cases pass`), name);
  }
});

test("the narration reads the loop in words", () => {
  const said = (/** @type {Inputs} */ inputs) => checkDeck(deckFor(inputs), "narration").frames.map((f) => f.narration).join(" ");
  const pi = said(LOOPS["pi-requirements"]);
  assert.match(pi, /It has 3 poles, at 0, minus 4, minus 1, and 1 zero, at minus 0\.5\./);
  assert.match(pi, /with a damping ratio of at least 0\.5, and a 2 percent settling time of at most 10 seconds\./);
  assert.match(pi, /There is a breakaway point at s equals minus 2\.375, where K is 0\.7076\./);
  assert.match(pi, /Every requirement is met for gains between 2\.16 and 4\.684\./);
  const third = said(LOOPS.unstable);
  assert.match(third, /The locus crosses the imaginary axis at K equals 6, at a frequency of 1\.414 radians per second\./);
  assert.match(third, /At K equals 20 the loop has 3 closed-loop poles, and it is unstable\. The dominant pole is at 0\.4186 plus 2\.244 j, with a damping ratio of minus 0\.1833 and a natural frequency of 2\.283 radians per second\./);
  assert.match(said(LOOPS["pole at the origin"]), /The dominant pole is at 0, at the origin, with no defined damping ratio\./);
  assert.match(said(LOOPS["zoh-first-order"]), /The plant is sampled every 1 seconds\./);
});

test("a loop that cannot be analysed has no report", () => {
  assert.equal(R.locusReport(withK("type1-third-order", { fields: { C: "1", G: "foo", H: "1" } })), null);
});

/* ---------- the page's buttons ---------- */
// Timers run at once, so the page's debounced recompute happens before the next line.
/** @param {Parameters<typeof standIn>[0]} [opts] */
function page(opts) {
  const p = standIn({ ...opts, globals: { setTimeout: (/** @type {() => void} */ fn) => { fn(); return 0; } } });
  p.run(html);
  return p;
}

test("the beamdswitch button saves the page's check as a deck whose numbers match the page", async () => {
  for (const i of [0, 2, 6, 7]) {
    const p = page(), what = R.EXAMPLES[i].id;
    Object.assign(p.$("examples"), { value: String(i) });
    await p.$("examples").fire("change");
    await p.$("saveDeckBtn").fire("click");
    assert.equal(p.$("ioStatus").textContent, "Saved root-locus-beamdswitch.md: open it in beamdswitch.", what);
    const [file] = p.saved;
    assert.equal(file.name, "root-locus-beamdswitch.md");
    assert.equal(blobOf(file).type, "text/markdown");
    const md = await blobOf(file).text();
    checkDeck(md, what);
    // Each closed-loop pole the page lists is a row of the deck's pole table, with the same digits.
    const rows = [...p.$("readouts").innerHTML.matchAll(/<tr><td class="mono">([\s\S]*?)<\/tr>/g)].map((m) => [...("<td>" + m[1]).matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => c[1].replace(/<[^>]+>/g, "")));
    assert.ok(rows.length > 0, what);
    for (const row of rows) assert.ok(md.includes(`| ${row.slice(0, -1).join(" | ")} |`), `${what}: ${row}`);
    const verdict = /** @type {RegExpMatchArray} the page writes a verdict */ (p.$("readouts").innerHTML.match(/<br>([^<]*)<\/div>/))[1];
    assert.ok(md.includes(`- ${verdict.replace(/&lt;/g, "<").replace(/&gt;/g, ">")}`), `${what}: ${verdict}`);
    assert.equal(md, deckFor(R.EXAMPLES[i].inputs), `${what}: the page's deck is the example's`);
  }
});

test("Copy deck copies the same deck, and saving falls back to the clipboard when it is blocked", async () => {
  const p = page();
  await p.$("copyDeckBtn").fire("click");
  assert.equal(p.$("ioStatus").textContent, "Copied the beamdswitch deck: paste it into beamdswitch.");
  await p.$("saveDeckBtn").fire("click");
  assert.equal(p.copied[0], await blobOf(p.saved[0]).text());

  const blocked = page({ saveFails: true });
  await blocked.$("saveDeckBtn").fire("click");
  assert.equal(blocked.$("ioStatus").textContent, "Copied the beamdswitch deck, as saving is blocked here: paste it into beamdswitch.");
  checkDeck(blocked.copied[0], "copied");

  const neither = page({ saveFails: true, clipboardFails: true });
  await neither.$("saveDeckBtn").fire("click");
  assert.equal(neither.$("ioStatus").textContent, "Could not save or copy the beamdswitch deck here.");
  await neither.$("copyDeckBtn").fire("click");
  assert.equal(neither.$("ioStatus").textContent, "Copy failed: the browser blocked clipboard access.");
});

test("while a field has an error the deck holds the last valid loop, and says so", async () => {
  const p = page();
  const before = deckFor(R.EXAMPLES[0].inputs);
  Object.assign(p.$("fG"), { value: "1 / (s +" });
  await p.$("fG").fire("input");
  await p.$("saveDeckBtn").fire("click");
  assert.equal(p.$("ioStatus").textContent, "The fields have an error, so the record holds the last valid loop. Saved root-locus-beamdswitch.md: open it in beamdswitch.");
  assert.equal(await blobOf(p.saved[0]).text(), before);
});
