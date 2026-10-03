/* The beamdswitch deck: the page inlines the site's shared template unchanged, and every example's deck
   opens in beamdswitch as the standard template, narrated on every slide, with the page's own numbers. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { assertSharedTemplate, checkDeck } from "./beamdswitch-deck-checks.mjs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const script = (id) => new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`).exec(html)[1];
const ctx = vm.createContext({});
ctx.self = ctx;
vm.runInContext(script("motives-periods-engine"), ctx);
vm.runInContext(script("motives-periods-beamdswitch"), ctx);
const M = ctx.MotivesPeriods, T = ctx.Beamdswitch;

const CASES = [
  ["tate, default", { example: "tate" }],
  ["tate, outside", { example: "tate", tate: { centre: 1.5, turns: -2, steps: 40 } }],
  ["tate, on the pole", { example: "tate", tate: { centre: -1 } }],
  ["zeta, ζ(3)", { example: "zeta" }],
  ["zeta, ζ(4)", { example: "zeta", zeta: { composition: [4], terms: 10 } }],
  ["zeta, ζ(5, 3)", { example: "zeta", zeta: { composition: [5, 3], terms: 100000 } }],
  ...M.GRAPHS.map((g) => [`feynman, ${g.id}`, { example: "feynman", feynman: { graph: g.id } }]),
].map(([what, raw]) => ({ what, st: M.normalize(raw).state }));

test("the page inlines the site's shared beamdswitch template unchanged", () => {
  assertSharedTemplate();
  assert.equal(script("motives-periods-beamdswitch"), `\n${readFileSync(new URL("./fixtures/beamdswitch/template.js", import.meta.url), "utf8")}`);
});

test("every example's deck opens in beamdswitch as the standard template", () => {
  for (const { what, st } of CASES) {
    const deck = checkDeck(T.deck(M.beamdswitchReport(st)), what);
    assert.equal(deck.meta.voice, "bf_emma", what);
    assert.match(deck.meta.title, /^Motives and periods: /, what);
  }
});

test("the decks carry the page's own numbers", () => {
  for (const { what, st } of CASES) {
    const md = T.deck(M.beamdswitchReport(st)), a = M.analyse(st)[st.example];
    if (st.example === "tate") assert.ok(a.onPath ? md.includes("The loop meets the pole") : md.includes(`Riemann sum ${a.sumText}`), what);
    if (st.example === "zeta") { assert.ok(md.includes(`${a.name} = ${a.valueText}`), what); if (a.even) assert.ok(md.includes(`(${a.even.coefficientText})·(2πi)`), what); }
    if (st.example === "feynman") { assert.ok(md.includes(`P = ${a.periodText} = ${a.valueText}`), what); assert.ok(md.includes(`Zeros of Ψ over F_${a.q}: ${a.count}`), what); }
  }
});
