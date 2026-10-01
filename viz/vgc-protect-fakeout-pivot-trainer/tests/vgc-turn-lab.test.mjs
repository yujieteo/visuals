import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const E = require("../engine.js");
const D = JSON.parse(await readFile(new URL("../raw.json", import.meta.url), "utf8"));
const position = (id) => D.positions.find((p) => p.id === id);
const mon = (state, side, species) => state.sides[side].mons.find((m) => m.species === species);
const slotOf = (state, side, species) => state.sides[side].active.findIndex((i) => state.sides[side].mons[i].species === species);
const move = (name, target) => ({ kind: "move", move: name, ...(target === undefined ? {} : { target }) });

test("Champions stats: base + stat points + 20 (HP + 75) with a 10% nature", () => {
  const s = E.calcStats(D.species.Incineroar.base_stats, { hp: 32, spd: 20, def: 14 }, "Careful");
  assert.deepEqual(s, { hp: 202, atk: 135, def: 124, spa: 90, spd: 143, spe: 80 });
});

test("Intimidate pops White Herb and Unburden doubles Sneasler's Speed", () => {
  const { state } = E.newBattle(D, position("intimidate-white-herb"));
  const sneasler = mon(state, 1, "Sneasler");
  assert.equal(sneasler.itemUsed, true);
  assert.equal(sneasler.boosts.atk, 0);
  assert.equal(E.speedOf(state, sneasler), 2 * sneasler.stats.spe);
});

test("Defiant: Intimidate gives +2, Parting Shot's two drops give net +3", () => {
  const { state } = E.newBattle(D, position("defiant-tax"));
  const gambit = mon(state, 1, "Kingambit");
  assert.equal(gambit.boosts.atk, 1);
  const target = slotOf(state, 1, "Kingambit");
  const plans = [[move("Parting Shot", target), move("Swords Dance")], [move("Swords Dance"), move("Protect")]];
  const out = E.resolveTurn(D, state, plans, 3).state;
  assert.equal(mon(out, 1, "Kingambit").boosts.atk, 1 + 3 + 2);
});

test("Fake Out cannot touch a Ghost type", () => {
  const { state } = E.newBattle(D, position("intimidate-white-herb"));
  const fros = slotOf(state, 1, "Froslass");
  const r = E.resolveTurn(D, state, [[move("Fake Out", fros), move("Protect")], [move("Shadow Ball", 1), move("Protect")]], 1);
  assert.ok(r.log.some((e) => e.t === "immune" && e.text.includes("Froslass")));
});

test("Quick Guard and Fake Out tie at +3, so Speed decides", () => {
  const { state } = E.newBattle(D, position("intimidate-white-herb"));
  const plans = (theirs) => [[move("Flare Blitz", 0), move("Quick Guard")], [move("Protect"), theirs]];
  // Unburden Sneasler (378 Spe) outspeeds Justin's Sneasler (189): Fake Out lands first.
  const fast = E.resolveTurn(D, state, plans(move("Fake Out", 0)), 1);
  assert.ok(fast.log.some((e) => e.t === "damage" && e.who === "0:Incineroar"));
  // Without the Unburden boost, Quick Guard goes first and blocks it.
  const slow = E.clone(state);
  mon(slow, 1, "Sneasler").unburden = false;
  const r = E.resolveTurn(D, slow, plans(move("Fake Out", 0)), 1);
  assert.ok(r.log.some((e) => e.t === "blocked" && e.text.includes("Quick Guard")));
});

test("Fake Out is gone after the first turn and Protect drops to 1/3", () => {
  const { state } = E.newBattle(D, position("intimidate-white-herb"));
  const after = E.resolveTurn(D, state, [[move("Protect"), move("Protect")], [move("Protect"), move("Protect")]], 5).state;
  const choices = E.choicesFor(D, after, mon(after, 0, "Incineroar"));
  assert.ok(!choices.some((c) => c.move === "Fake Out"));
  let held = 0;
  for (let seed = 0; seed < 600; seed++) {
    const r = E.resolveTurn(D, after, [[move("Protect"), move("Protect")], [move("Protect"), move("Protect")]], seed);
    held += r.log.filter((e) => e.t === "protect").length;
  }
  assert.ok(Math.abs(held / 2400 - 1 / 3) < 0.05, `second Protect held ${held / 2400}`);
});

test("Sucker Punch fails into a non-attacking target", () => {
  const { state } = E.newBattle(D, position("mega-choice"));
  const r = E.resolveTurn(D, state, [[move("Nasty Plot"), move("Shell Smash")], [move("Sucker Punch", 0), move("Protect")]], 2);
  assert.ok(r.log.some((e) => e.text.startsWith("Sucker Punch failed")));
});

test("Rage Powder redirects single-target moves but not spread moves", () => {
  const { state } = E.newBattle(D, position("spicy-rage-powder"));
  const fros = slotOf(state, 1, "Froslass");
  const r = E.resolveTurn(D, state, [[move("Close Combat", fros), move("Heat Wave")], [move("Rage Powder"), move("Protect")]], 4);
  assert.ok(r.log.some((e) => e.t === "redirect"));
  const scov = r.log.filter((e) => e.t === "damage" && e.who === "1:Scovillain");
  assert.ok(scov.length >= 1);
});

test("the solver finds rock-paper-scissors' uniform mix", () => {
  const M = [[0, -1, 1], [1, 0, -1], [-1, 1, 0]].map((r) => Float64Array.from(r));
  const s = E.solve(M, 4000);
  for (const x of [...s.p, ...s.q]) assert.ok(Math.abs(x - 1 / 3) < 0.02);
  assert.ok(Math.abs(s.value) < 0.01);
});

test("every position solves to legal plans for both sides", () => {
  for (const p of D.positions) {
    const { state } = E.newBattle(D, p);
    const rows = E.jointPlans(D, state, 0), cols = E.jointPlans(D, state, 1);
    assert.ok(rows.length > 1 && cols.length > 1, p.id);
    assert.ok(!rows.some(([a, b]) => a && b && a.mega && b.mega), p.id);
  }
});
