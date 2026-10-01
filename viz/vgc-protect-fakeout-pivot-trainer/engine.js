// Turn engine for the VGC turn lab.
// One doubles turn at level 50 under Pokémon Champions rules as implemented in
// Pokémon Showdown's `champions` mod: stats are base + stat points + 20 (HP: + 75)
// with a 10% nature, Protect has 8 PP, Fake Out only works on the first action.
// Damage follows the Gen 9 formula with float modifiers (can differ from the
// cartridge by a point). Everything not listed in raw.json "not_modelled" is
// resolved here; the page and the Node test both load this file.
(function (root) {
  "use strict";

  const TYPES = ["Normal", "Fire", "Water", "Electric", "Grass", "Ice", "Fighting", "Poison", "Ground", "Flying", "Psychic", "Bug", "Rock", "Ghost", "Dragon", "Dark", "Steel", "Fairy"];
  // Attacking type -> defending types it hits for 2x / 0.5x / 0x (Showdown typechart.ts).
  const CHART = {
    Normal: { h: [], r: ["Rock", "Steel"], z: ["Ghost"] },
    Fire: { h: ["Grass", "Ice", "Bug", "Steel"], r: ["Fire", "Water", "Rock", "Dragon"], z: [] },
    Water: { h: ["Fire", "Ground", "Rock"], r: ["Water", "Grass", "Dragon"], z: [] },
    Electric: { h: ["Water", "Flying"], r: ["Electric", "Grass", "Dragon"], z: ["Ground"] },
    Grass: { h: ["Water", "Ground", "Rock"], r: ["Fire", "Grass", "Poison", "Flying", "Bug", "Dragon", "Steel"], z: [] },
    Ice: { h: ["Grass", "Ground", "Flying", "Dragon"], r: ["Fire", "Water", "Ice", "Steel"], z: [] },
    Fighting: { h: ["Normal", "Ice", "Rock", "Dark", "Steel"], r: ["Poison", "Flying", "Psychic", "Bug", "Fairy"], z: ["Ghost"] },
    Poison: { h: ["Grass", "Fairy"], r: ["Poison", "Ground", "Rock", "Ghost"], z: ["Steel"] },
    Ground: { h: ["Fire", "Electric", "Poison", "Rock", "Steel"], r: ["Grass", "Bug"], z: ["Flying"] },
    Flying: { h: ["Grass", "Fighting", "Bug"], r: ["Electric", "Rock", "Steel"], z: [] },
    Psychic: { h: ["Fighting", "Poison"], r: ["Psychic", "Steel"], z: ["Dark"] },
    Bug: { h: ["Grass", "Psychic", "Dark"], r: ["Fire", "Fighting", "Poison", "Flying", "Ghost", "Steel", "Fairy"], z: [] },
    Rock: { h: ["Fire", "Ice", "Flying", "Bug"], r: ["Fighting", "Ground", "Steel"], z: [] },
    Ghost: { h: ["Psychic", "Ghost"], r: ["Dark"], z: ["Normal"] },
    Dragon: { h: ["Dragon"], r: ["Steel"], z: ["Fairy"] },
    Dark: { h: ["Psychic", "Ghost"], r: ["Fighting", "Dark", "Fairy"], z: [] },
    Steel: { h: ["Ice", "Rock", "Fairy"], r: ["Fire", "Water", "Electric", "Steel"], z: [] },
    Fairy: { h: ["Fighting", "Dragon", "Dark"], r: ["Fire", "Poison", "Steel"], z: [] },
  };
  const NATURES = {
    Adamant: ["atk", "spa"], Modest: ["spa", "atk"], Jolly: ["spe", "spa"], Timid: ["spe", "atk"],
    Bold: ["def", "atk"], Careful: ["spd", "spa"], Calm: ["spd", "atk"], Impish: ["def", "spa"],
  };
  const STATS = ["hp", "atk", "def", "spa", "spd", "spe"];

  function effectiveness(type, defTypes) {
    let m = 1;
    for (const t of defTypes) {
      const c = CHART[type];
      if (c.z.includes(t)) return 0;
      if (c.h.includes(t)) m *= 2;
      if (c.r.includes(t)) m *= 0.5;
    }
    return m;
  }

  // Champions stat formula (Showdown mods/champions/scripts.ts statModify).
  function calcStats(base, sp, nature) {
    const out = {};
    const [plus, minus] = NATURES[nature] || [null, null];
    for (const s of STATS) {
      const points = (sp && sp[s]) || 0;
      if (s === "hp") { out.hp = base.hp + points + 75; continue; }
      let v = base[s] + points + 20;
      if (s === plus) v = Math.trunc(v * 110 / 100);
      if (s === minus) v = Math.trunc(v * 90 / 100);
      out[s] = v;
    }
    return out;
  }

  function stageMult(stage) {
    return stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage);
  }

  // ---------- RNG (seeded so a shown sample can be replayed) ----------
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- state ----------
  function buildMon(data, set, side, slot) {
    const sp = data.species[set.species];
    const stats = calcStats(sp.base_stats, set.stat_points, set.nature);
    return {
      key: side + ":" + set.species, side, slot, species: set.species, form: set.species,
      types: sp.types.slice(), ability: set.ability, item: set.item, nature: set.nature,
      sp: set.stat_points, moves: set.moves.slice(), stats, maxhp: stats.hp, hp: stats.hp,
      boosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, status: null, sleepTurns: 0,
      protectCount: 0, fresh: true, fainted: false, itemUsed: false, unburden: false,
      megaStone: (data.items[set.item] || {}).mega || null, isMega: false, throatChop: 0,
    };
  }

  function megaEvolve(data, state, mon, log) {
    const target = mon.megaStone;
    const sp = data.species[target];
    const hpFrac = mon.hp / mon.maxhp;
    const stats = calcStats(sp.base_stats, mon.sp, mon.nature);
    stats.hp = mon.maxhp; // HP never changes on Mega Evolution
    mon.stats = stats; mon.form = target; mon.types = sp.types.slice(); mon.ability = sp.abilities[0];
    mon.isMega = true; mon.hp = Math.round(hpFrac * mon.maxhp);
    state.sides[mon.side].megaUsed = true;
    log.push({ t: "mega", who: mon.key, text: `${mon.species} Mega Evolved into ${target} (${mon.ability})` });
    onEntryAbility(data, state, mon, log);
  }

  // A side's Pokémon on the field, in slot order, skipping fainted ones.
  function actives(state, side) {
    return state.sides[side].active.map((i) => state.sides[side].mons[i]).filter((m) => m && !m.fainted);
  }
  function foeSide(side) { return 1 - side; }

  function applyBoost(data, state, target, boosts, source, log, fromFoe) {
    let lowered = 0;
    for (const [stat, amount] of Object.entries(boosts)) {
      const before = target.boosts[stat];
      target.boosts[stat] = Math.max(-6, Math.min(6, before + amount));
      if (target.boosts[stat] !== before) {
        log.push({ t: "boost", who: target.key, text: `${target.form} ${stat.toUpperCase()} ${amount > 0 ? "+" : ""}${amount}` });
        if (amount < 0) lowered++;
      }
    }
    if (lowered && fromFoe && target.ability === "Defiant") {
      for (let i = 0; i < lowered; i++) {
        target.boosts.atk = Math.min(6, target.boosts.atk + 2);
      }
      log.push({ t: "boost", who: target.key, text: `Defiant: ${target.form} ATK +${2 * lowered}` });
    }
    if (target.item === "White Herb" && !target.itemUsed && Object.values(target.boosts).some((v) => v < 0)) {
      for (const s in target.boosts) if (target.boosts[s] < 0) target.boosts[s] = 0;
      consumeItem(target, log, "White Herb restored its lowered stats");
    }
  }

  function consumeItem(mon, log, text) {
    mon.itemUsed = true;
    log.push({ t: "item", who: mon.key, text: `${mon.form}: ${text}` });
    if (mon.ability === "Unburden") {
      mon.unburden = true;
      log.push({ t: "ability", who: mon.key, text: `Unburden doubled ${mon.form}'s Speed` });
    }
  }

  function onEntryAbility(data, state, mon, log) {
    if (mon.ability === "Intimidate") {
      log.push({ t: "ability", who: mon.key, text: `${mon.form}'s Intimidate` });
      for (const foe of actives(state, foeSide(mon.side))) applyBoost(data, state, foe, { atk: -1 }, mon, log, true);
    }
    if (mon.ability === "Snow Warning") {
      state.snow = 5;
      log.push({ t: "field", text: "Snow started (5 turns)" });
    }
    if (mon.ability === "Hospitality") {
      for (const ally of actives(state, mon.side)) {
        if (ally !== mon && ally.hp < ally.maxhp) {
          const heal = Math.floor(ally.maxhp / 4);
          ally.hp = Math.min(ally.maxhp, ally.hp + heal);
          log.push({ t: "heal", who: ally.key, hp: ally.hp / ally.maxhp, text: `Hospitality restored ${ally.form}'s HP` });
        }
      }
    }
  }

  function speedOf(state, mon) {
    let s = mon.stats.spe * stageMult(mon.boosts.spe);
    if (mon.unburden && mon.itemUsed) s *= 2;
    if (mon.status === "par") s *= 0.5;
    return Math.floor(s);
  }

  function cloneMon(m) {
    const c = Object.assign({}, m);
    c.boosts = Object.assign({}, m.boosts);
    c.types = m.types.slice();
    return c; // stats, moves and sp are never mutated in place
  }
  function clone(state) {
    return {
      turn: state.turn, trickRoom: state.trickRoom, snow: state.snow,
      sides: state.sides.map((s) => Object.assign({}, s, { active: s.active.slice(), mons: s.mons.map(cloneMon) })),
    };
  }

  // ---------- legal choices ----------
  // A choice is {kind:'move', move, target?, mega?} | {kind:'switch', to}
  // target: 'foe0'|'foe1' (slot index on the other side) for single-target moves.
  function choicesFor(data, state, mon) {
    const side = state.sides[mon.side];
    const out = [];
    const foes = state.sides[foeSide(mon.side)].active
      .map((i, slot) => ({ i, slot, m: state.sides[foeSide(mon.side)].mons[i] }))
      .filter((f) => f.m && !f.m.fainted);
    const canMega = mon.megaStone && !mon.isMega && !side.megaUsed;
    for (const name of mon.moves) {
      const mv = data.moves[name];
      if (name === "Fake Out" && !mon.fresh) continue;
      if (name === "Aurora Veil" && !state.snow) continue;
      if (mv.flags && mv.flags.sound && mon.throatChop) continue;
      const base = { kind: "move", move: name };
      const variants = [];
      const bench = side.brought.filter((i) => !side.active.includes(i) && !side.mons[i].fainted);
      if (mv.target === "normal") {
        for (const f of foes) {
          if (name === "Parting Shot" && bench.length) for (const b of bench) variants.push({ ...base, target: f.slot, pivot: b });
          else variants.push({ ...base, target: f.slot });
        }
      } else variants.push(base);
      for (const v of variants) {
        out.push(v);
        if (canMega) out.push({ ...v, mega: true });
      }
    }
    for (const i of side.mons.map((m, i) => i)) {
      const m = side.mons[i];
      if (m.fainted || side.active.includes(i) || !side.brought.includes(i)) continue;
      out.push({ kind: "switch", to: i });
    }
    return out;
  }

  // Joint plans for a side: every pair of per-Pokémon choices, excluding two
  // Mega Evolutions and two switches into the same Pokémon.
  function jointPlans(data, state, sideIdx) {
    const mons = state.sides[sideIdx].active.map((i) => state.sides[sideIdx].mons[i]);
    const per = mons.map((m) => (m && !m.fainted ? choicesFor(data, state, m) : [null]));
    const plans = [];
    for (const a of per[0] || [null]) {
      for (const b of per[1] || [null]) {
        if (a && b && a.mega && b.mega) continue;
        if (a && b && a.kind === "switch" && b.kind === "switch" && a.to === b.to) continue;
        if (a && b && a.move === "Parting Shot" && b.kind === "switch") continue;
        if (a && b && b.move === "Parting Shot" && a.kind === "switch") continue;
        plans.push([a, b]);
      }
    }
    return plans;
  }

  function describeChoice(data, state, sideIdx, slot, c) {
    if (!c) return "—";
    const foe = state.sides[foeSide(sideIdx)];
    if (c.kind === "switch") return "Switch → " + state.sides[sideIdx].mons[c.to].species;
    let s = c.move;
    if (c.target !== undefined) {
      const m = foe.mons[foe.active[c.target]];
      s += " → " + (m ? m.form.replace("-Mega", "") : "?");
    }
    if (c.pivot !== undefined) s += " (pivot to " + state.sides[sideIdx].mons[c.pivot].species + ")";
    if (c.mega) s = "Mega + " + s;
    return s;
  }

  function describePlan(data, state, sideIdx, plan) {
    const mons = state.sides[sideIdx].active.map((i) => state.sides[sideIdx].mons[i]);
    return plan.map((c, slot) => (mons[slot] && !mons[slot].fainted ? `${mons[slot].form.replace("-Mega", "")}: ${describeChoice(data, state, sideIdx, slot, c)}` : null)).filter(Boolean).join(" · ");
  }

  // ---------- damage ----------
  function damageRange(data, state, atk, def, moveName, spreadHit, rand) {
    const mv = data.moves[moveName];
    let bp = mv.bp;
    if (moveName === "Water Spout") bp = Math.max(1, Math.floor(150 * atk.hp / atk.maxhp));
    if (moveName === "Last Respects") bp = 50 + 50 * state.sides[atk.side].mons.filter((m) => m.fainted).length;
    if (atk.ability === "Mega Launcher" && mv.flags && mv.flags.pulse) bp *= 1.5;
    if (atk.ability === "Tough Claws" && mv.flags && mv.flags.contact) bp *= 1.3;
    if (atk.item === "Black Glasses" && mv.type === "Dark") bp *= 1.2;
    const physical = mv.cat === "Physical";
    const aStat = physical ? "atk" : "spa";
    const dStat = physical ? "def" : "spd";
    let A = atk.stats[aStat] * stageMult(atk.boosts[aStat]);
    let D = def.stats[dStat] * stageMult(def.boosts[dStat]);
    if (physical && state.snow && def.types.includes("Ice")) D *= 1.5;
    A = Math.floor(A); D = Math.floor(D);
    let base = Math.floor(Math.floor(Math.floor((2 * 50) / 5 + 2) * bp * A / D) / 50) + 2;
    let mod = 1;
    if (spreadHit) mod *= 0.75;
    const stab = atk.types.includes(mv.type) ? (atk.ability === "Adaptability" ? 2 : 1.5) : 1;
    const eff = effectiveness(mv.type, def.types);
    mod *= stab * eff;
    if (physical && atk.status === "brn") mod *= 0.5;
    if (state.sides[def.side].veil) mod *= 2732 / 4096;
    if (atk.item === "Life Orb") mod *= 5324 / 4096;
    let berry = false;
    if (def.item === "Colbur Berry" && !def.itemUsed && mv.type === "Dark" && eff > 1) { mod *= 0.5; berry = true; }
    const roll = rand === undefined ? null : 85 + Math.floor(rand * 16);
    const calc = (r) => Math.max(eff === 0 ? 0 : 1, Math.floor(Math.floor(base * r / 100) * mod));
    return { min: calc(85), max: calc(100), dmg: roll === null ? null : calc(roll), eff, berry };
  }

  // ---------- turn resolution ----------
  function priorityOf(data, action) {
    if (action.choice.kind === "switch") return 7;
    return data.moves[action.choice.move].pri;
  }

  function resolveTurn(data, input, plans, seed) {
    const state = clone(input);
    const R = rng(seed);
    const log = [];
    state.turn += 1;
    const actions = [];
    for (const sideIdx of [0, 1]) {
      const side = state.sides[sideIdx];
      side.active.forEach((monIdx, slot) => {
        const mon = side.mons[monIdx];
        const choice = plans[sideIdx][slot];
        if (mon && !mon.fainted && choice) actions.push({ side: sideIdx, slot, monIdx, choice, done: false });
      });
    }
    const monOf = (a) => state.sides[a.side].mons[a.monIdx];
    const startedOnField = [0, 1].flatMap((s) => actives(state, s).map((m) => m.key));
    const turnFlags = { protected: new Set(), flinch: new Set(), moved: new Set(), quickGuard: [false, false], ragePowder: [null, null] };

    // Switches first (fastest first), then Mega Evolution, then moves.
    const byOrder = (list) => list.sort((x, y) => {
      const px = priorityOf(data, x), py = priorityOf(data, y);
      if (px !== py) return py - px;
      let sx = speedOf(state, monOf(x)), sy = speedOf(state, monOf(y));
      if (state.trickRoom && px < 7) { sx = -sx; sy = -sy; }
      if (sx !== sy) return sy - sx;
      return x.tie - y.tie;
    });
    actions.forEach((a) => { a.tie = R(); });
    for (const a of byOrder(actions.filter((a) => a.choice.kind === "switch"))) {
      doSwitch(data, state, a.side, a.slot, a.choice.to, log);
      a.done = true;
    }
    for (const a of byOrder(actions.filter((a) => a.choice.mega))) megaEvolve(data, state, monOf(a), log);

    let pending = actions.filter((a) => !a.done);
    while (pending.length) {
      byOrder(pending); // Gen 8+ re-sorts after every action
      const a = pending.shift();
      a.done = true;
      const mon = monOf(a);
      if (mon.fainted || state.sides[a.side].active[a.slot] !== a.monIdx) continue;
      if (turnFlags.flinch.has(mon.key)) { log.push({ t: "flinch", who: mon.key, text: `${mon.form} flinched` }); turnFlags.moved.add(mon.key); continue; }
      if (mon.status === "slp") {
        mon.sleepTurns -= 1;
        if (mon.sleepTurns > 0) { log.push({ t: "cant", who: mon.key, text: `${mon.form} is asleep` }); turnFlags.moved.add(mon.key); continue; }
        mon.status = null; log.push({ t: "cure", who: mon.key, text: `${mon.form} woke up` });
      }
      if (mon.status === "par" && R() < 1 / 8) { log.push({ t: "cant", who: mon.key, text: `${mon.form} is fully paralysed` }); turnFlags.moved.add(mon.key); continue; }
      useMove(data, state, a, mon, turnFlags, pending, R, log);
      turnFlags.moved.add(mon.key);
    }

    endOfTurn(data, state, actions, turnFlags, R, log);
    // Fake Out only works on a Pokémon's first turn out: anything that spent
    // this whole turn on the field has had its chance.
    for (const s of [0, 1]) for (const m of actives(state, s)) if (startedOnField.includes(m.key)) m.fresh = false;
    return { state, log };
  }

  function doSwitch(data, state, sideIdx, slot, toIdx, log) {
    const side = state.sides[sideIdx];
    const out = side.mons[side.active[slot]];
    if (out) {
      out.boosts = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
      out.protectCount = 0; out.throatChop = 0;
      log.push({ t: "switchout", who: out.key, text: `${out.form} switched out` });
    }
    side.active[slot] = toIdx;
    const inn = side.mons[toIdx];
    inn.fresh = true; inn.protectCount = 0;
    log.push({ t: "switchin", who: inn.key, slot, side: sideIdx, hp: inn.hp / inn.maxhp, text: `${inn.form} came in` });
    onEntryAbility(data, state, inn, log);
  }

  function useMove(data, state, a, mon, flags, pending, R, log) {
    const name = a.choice.move;
    const mv = data.moves[name];
    const foeIdx = foeSide(a.side);
    const foeSideObj = state.sides[foeIdx];
    log.push({ t: "move", who: mon.key, move: name, text: `${mon.form} used ${name}` });
    const wasFresh = mon.fresh;
    mon.fresh = false;
    if (name !== "Protect") mon.protectCount = 0;

    if (name === "Protect") {
      const chance = Math.pow(1 / 3, mon.protectCount);
      if (R() < chance) { flags.protected.add(mon.key); mon.protectCount += 1; log.push({ t: "protect", who: mon.key, text: `${mon.form} protected itself` }); }
      else { mon.protectCount = 0; log.push({ t: "fail", who: mon.key, text: `Protect failed (${Math.round(chance * 100)}% chance)` }); }
      return;
    }
    if (name === "Quick Guard") { flags.quickGuard[a.side] = true; log.push({ t: "protect", who: mon.key, text: "Quick Guard shields the team from priority" }); return; }
    if (name === "Rage Powder") { flags.ragePowder[a.side] = mon.key; log.push({ t: "status", who: mon.key, text: `${mon.form} became the centre of attention` }); return; }
    if (name === "Trick Room") {
      state.trickRoom = state.trickRoom ? 0 : 5;
      log.push({ t: "field", text: state.trickRoom ? "Trick Room twisted the dimensions (5 turns)" : "Trick Room ended" });
      return;
    }
    if (name === "Aurora Veil") {
      if (!state.snow || state.sides[a.side].veil) { log.push({ t: "fail", who: mon.key, text: "Aurora Veil failed" }); return; }
      state.sides[a.side].veil = 5; log.push({ t: "field", text: "Aurora Veil halves damage to that side (x0.67 in doubles), 5 turns" });
      return;
    }
    if (mv.self_boosts && mv.cat === "Status") { applyBoost(data, state, mon, mv.self_boosts, mon, log, false); return; }

    // Targets
    let targets;
    const foes = foeSideObj.active.map((i) => foeSideObj.mons[i]);
    if (mv.target === "allAdjacentFoes") targets = foes.filter((m) => m && !m.fainted);
    else {
      let t = foes[a.choice.target];
      if (!t || t.fainted) t = foes.find((m) => m && !m.fainted);
      const rp = flags.ragePowder[foeIdx];
      if (rp && !mon.types.includes("Grass")) {
        const redirect = foes.find((m) => m && m.key === rp && !m.fainted);
        if (redirect && redirect !== t) { log.push({ t: "redirect", who: redirect.key, text: `${redirect.form} drew the attack (Rage Powder)` }); t = redirect; }
      }
      targets = t ? [t] : [];
    }
    if (!targets.length) { log.push({ t: "fail", who: mon.key, text: "No target" }); return; }
    const spread = targets.length > 1;
    let totalDealt = 0;
    for (const t of targets) {
      if (flags.protected.has(t.key)) { log.push({ t: "blocked", who: t.key, text: `${t.form} protected itself from ${name}` }); continue; }
      if (mv.pri > 0 && flags.quickGuard[foeIdx]) { log.push({ t: "blocked", who: t.key, text: `Quick Guard blocked ${name}` }); continue; }
      if (name === "Fake Out" && !wasFresh) { log.push({ t: "fail", who: mon.key, text: "Fake Out failed" }); continue; }
      if (name === "Sucker Punch") {
        const tAct = pending.find((p) => state.sides[p.side].mons[p.monIdx].key === t.key);
        const damaging = tAct && tAct.choice.kind === "move" && data.moves[tAct.choice.move].cat !== "Status";
        if (!damaging) { log.push({ t: "fail", who: mon.key, text: "Sucker Punch failed (target was not attacking)" }); continue; }
      }
      const acc = name === "Blizzard" && state.snow ? 100 : mv.acc;
      if (acc && R() * 100 >= acc) { log.push({ t: "miss", who: t.key, text: `${name} missed ${t.form}` }); continue; }
      if (mv.cat === "Status") {
        if (name === "Parting Shot") {
          applyBoost(data, state, t, { atk: -1, spa: -1 }, mon, log, true);
        }
        continue;
      }
      const r = damageRange(data, state, mon, t, name, spread, R());
      if (r.eff === 0) { log.push({ t: "immune", who: t.key, text: `${t.form} is immune to ${name}` }); continue; }
      let dmg = r.dmg;
      if (r.berry) consumeItem(t, log, "Colbur Berry weakened the hit");
      if (dmg >= t.hp && t.hp === t.maxhp && t.item === "Focus Sash" && !t.itemUsed) { dmg = t.hp - 1; consumeItem(t, log, "hung on with Focus Sash"); }
      dmg = Math.min(dmg, t.hp);
      t.hp -= dmg; totalDealt += dmg;
      log.push({ t: "damage", who: t.key, from: mon.key, hp: t.hp / t.maxhp, pct: Math.round(100 * dmg / t.maxhp), eff: r.eff, text: `${t.form} lost ${Math.round(100 * dmg / t.maxhp)}%${r.eff > 1 ? " (super effective)" : r.eff < 1 ? " (resisted)" : ""}` });
      if (t.hp <= 0) { t.fainted = true; t.hp = 0; log.push({ t: "faint", who: t.key, text: `${t.form} fainted` }); }
      if (!t.fainted) {
        if (t.item === "Sitrus Berry" && !t.itemUsed && t.hp <= t.maxhp / 2) { t.hp += Math.floor(t.maxhp / 4); consumeItem(t, log, "Sitrus Berry restored HP"); log.push({ t: "heal", who: t.key, hp: t.hp / t.maxhp, text: `${t.form} is healthier` }); }
        if (name === "Fake Out" && !flags.moved.has(t.key)) flags.flinch.add(t.key);
        if (name === "Throat Chop") t.throatChop = 2;
        const sec = mv.secondary;
        if (sec && R() * 100 < sec.chance) {
          if (sec.flinch && !flags.moved.has(t.key)) flags.flinch.add(t.key);
          if (sec.status) setStatus(t, sec.status === "random" ? ["psn", "par", "slp"][Math.floor(R() * 3)] : sec.status, R, log);
          if (sec.boosts) applyBoost(data, state, t, sec.boosts, mon, log, true);
        }
        if (mon.ability === "Poison Touch" && mv.flags && mv.flags.contact && R() < 0.3) setStatus(t, "psn", R, log);
        if (t.ability === "Spicy Spray" && !mon.fainted) setStatus(mon, "brn", R, log, "Spicy Spray");
      }
    }
    if (totalDealt > 0) {
      if (mv.drain) { mon.hp = Math.min(mon.maxhp, mon.hp + Math.floor(totalDealt * mv.drain)); log.push({ t: "heal", who: mon.key, hp: mon.hp / mon.maxhp, text: `${mon.form} drained HP` }); }
      if (mv.recoil) recoil(mon, Math.floor(totalDealt * mv.recoil), log, "recoil");
      if (mon.item === "Life Orb" && !mon.fainted) recoil(mon, Math.floor(mon.maxhp / 10), log, "Life Orb");
      if (mv.self_boosts) applyBoost(data, state, mon, mv.self_boosts, mon, log, false);
    }
    if (name === "Parting Shot") {
      const side = state.sides[a.side];
      const bench = side.brought.filter((i) => !side.active.includes(i) && !side.mons[i].fainted);
      const to = a.choice.pivot !== undefined && bench.includes(a.choice.pivot) ? a.choice.pivot : bench[0];
      if (to !== undefined && targets.some((t) => !flags.protected.has(t.key))) doSwitch(data, state, a.side, a.slot, to, log);
    }
  }

  function recoil(mon, amount, log, why) {
    mon.hp = Math.max(0, mon.hp - Math.max(1, amount));
    log.push({ t: "recoil", who: mon.key, hp: mon.hp / mon.maxhp, text: `${mon.form} was hurt by ${why}` });
    if (mon.hp === 0) { mon.fainted = true; log.push({ t: "faint", who: mon.key, text: `${mon.form} fainted` }); }
  }

  function setStatus(mon, status, R, log, source) {
    if (mon.status || mon.fainted) return;
    if (status === "brn" && mon.types.includes("Fire")) return;
    if (status === "psn" && (mon.types.includes("Poison") || mon.types.includes("Steel"))) return;
    mon.status = status;
    if (status === "slp") mon.sleepTurns = [2, 3, 3][Math.floor(R() * 3)];
    const names = { brn: "burned", psn: "poisoned", par: "paralysed", slp: "put to sleep" };
    log.push({ t: "status", who: mon.key, text: `${mon.form} was ${names[status]}${source ? " by " + source : ""}` });
  }

  function endOfTurn(data, state, actions, flags, R, log) {
    for (const sideIdx of [0, 1]) {
      for (const mon of actives(state, sideIdx)) {
        if (mon.status === "brn") recoil(mon, Math.floor(mon.maxhp / 16), log, "its burn");
        else if (mon.status === "psn") recoil(mon, Math.floor(mon.maxhp / 8), log, "poison");
        if (!mon.fainted && mon.ability === "Moody" && !mon.isMega) {
          const pool = ["atk", "def", "spa", "spd", "spe"];
          const up = pool[Math.floor(R() * 5)];
          const rest = pool.filter((s) => s !== up);
          const down = rest[Math.floor(R() * 4)];
          applyBoost(data, state, mon, { [up]: 2, [down]: -1 }, mon, log, false);
        }
      }
      if (state.sides[sideIdx].veil) state.sides[sideIdx].veil -= 1;
      if (state.sides[sideIdx].veil === 0) delete state.sides[sideIdx].veil;
    }
    for (const a of actions) {
      const mon = state.sides[a.side].mons[a.monIdx];
      if (!(a.choice.kind === "move" && a.choice.move === "Protect")) mon.protectCount = 0;
    }
    for (const sideIdx of [0, 1]) for (const m of state.sides[sideIdx].mons) if (m.throatChop) m.throatChop -= 1;
    if (state.trickRoom) { state.trickRoom -= 1; if (!state.trickRoom) log.push({ t: "field", text: "Trick Room wore off" }); }
    if (state.snow) { state.snow -= 1; if (!state.snow) log.push({ t: "field", text: "The snow stopped" }); }
  }

  // ---------- evaluation ----------
  // Board value from side 0's point of view, in "Pokémon" units: a healthy
  // Pokémon is worth 1.0 (0.35 for being alive + 0.65 scaled by HP). On top of
  // material, each side gets THREAT_WEIGHT x the best average hit each of its
  // active Pokémon could land next turn (as a share of the target's value),
  // discounted when it would move second. That is where tempo lives: boosts,
  // Speed, Trick Room and chip all change next turn's threat.
  const THREAT_WEIGHT = 0.3;

  function monValue(mon) {
    if (mon.fainted) return 0;
    let v = 0.35 + 0.65 * mon.hp / mon.maxhp;
    if (mon.status === "brn") v -= isPhysical(mon) ? 0.15 : 0.05;
    if (mon.status === "psn") v -= 0.07;
    if (mon.status === "par") v -= 0.08;
    if (mon.status === "slp") v -= 0.12;
    if (mon.fresh && mon.moves.includes("Fake Out")) v += 0.04;
    if (mon.protectCount > 0) v -= 0.02;
    return v;
  }
  function isPhysical(mon) { return mon.stats.atk >= mon.stats.spa; }

  function threat(data, state, sideIdx) {
    const mine = actives(state, sideIdx);
    const foes = actives(state, foeSide(sideIdx));
    if (!foes.length) return 0;
    let total = 0;
    for (const m of mine) {
      if (m.status === "slp") continue;
      let best = 0;
      for (const name of m.moves) {
        const mv = data.moves[name];
        if (mv.cat === "Status" || name === "Fake Out") continue;
        const targets = mv.target === "allAdjacentFoes" ? foes : foes.map((f) => [f]);
        const groups = mv.target === "allAdjacentFoes" ? [foes] : targets;
        for (const group of groups) {
          let gain = 0;
          for (const f of group) {
            const r = damageRange(data, state, m, f, name, group.length > 1);
            const avg = (r.min + r.max) / 2 * (mv.acc ? mv.acc / 100 : 1);
            const frac = Math.min(1, avg / f.hp);
            // Knocking out removes the whole Pokémon; chip removes HP value.
            let g = frac >= 1 ? monValue(f) : 0.65 * avg / f.maxhp;
            let mine_first = speedOf(state, m) > speedOf(state, f);
            if (state.trickRoom > 1) mine_first = !mine_first;
            if (mv.pri > 0) mine_first = true;
            gain += g * (mine_first ? 1 : 0.75);
          }
          best = Math.max(best, gain);
        }
      }
      total += best;
    }
    return total;
  }

  function evaluate(data, state) {
    let total = 0;
    for (const sideIdx of [0, 1]) {
      const side = state.sides[sideIdx];
      let s = 0;
      for (const i of side.brought) s += monValue(side.mons[i]);
      if (side.veil) s += 0.03 * side.veil;
      s += THREAT_WEIGHT * threat(data, state, sideIdx);
      total += sideIdx === 0 ? s : -s;
    }
    return total;
  }

  // ---------- the matrix game ----------
  function payoffMatrix(data, state, opts) {
    const rows = jointPlans(data, state, 0);
    const cols = jointPlans(data, state, 1);
    const budget = (opts && opts.budget) || 60000;
    const trials = Math.max(4, Math.min(32, Math.floor(budget / Math.max(1, rows.length * cols.length))));
    const v0 = evaluate(data, state);
    const M = rows.map(() => new Float64Array(cols.length));
    const seed = (opts && opts.seed) || 1;
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < cols.length; c++) {
        let sum = 0;
        // Common random numbers: trial k uses the same seed in every cell, so
        // differences between cells are not swamped by roll noise.
        for (let k = 0; k < trials; k++) {
          const out = resolveTurn(data, state, [rows[r], cols[c]], seed * 7919 + k);
          sum += evaluate(data, out.state) - v0;
        }
        M[r][c] = sum / trials;
      }
    }
    return { rows, cols, M, trials };
  }

  // Approximate Nash equilibrium of the zero-sum game (row maximises) by
  // regret matching; the averaged strategies converge to equilibrium.
  function solve(M, iters) {
    const R = M.length, C = M[0].length;
    const rReg = new Float64Array(R), cReg = new Float64Array(C);
    const rSum = new Float64Array(R), cSum = new Float64Array(C);
    const strat = (reg) => {
      let pos = 0; for (const x of reg) pos += Math.max(0, x);
      return Array.from(reg, (x) => (pos > 0 ? Math.max(0, x) / pos : 1 / reg.length));
    };
    iters = iters || 3000;
    for (let t = 0; t < iters; t++) {
      const p = strat(rReg), q = strat(cReg);
      const rowU = new Float64Array(R), colU = new Float64Array(C);
      for (let i = 0; i < R; i++) { let s = 0; for (let j = 0; j < C; j++) s += M[i][j] * q[j]; rowU[i] = s; }
      for (let j = 0; j < C; j++) { let s = 0; for (let i = 0; i < R; i++) s += M[i][j] * p[i]; colU[j] = -s; }
      let ev = 0; for (let i = 0; i < R; i++) ev += p[i] * rowU[i];
      let evc = 0; for (let j = 0; j < C; j++) evc += q[j] * colU[j];
      // Regret matching+ (floor regrets at zero) with linear averaging.
      for (let i = 0; i < R; i++) { rReg[i] = Math.max(0, rReg[i] + rowU[i] - ev); rSum[i] += p[i] * (t + 1); }
      for (let j = 0; j < C; j++) { cReg[j] = Math.max(0, cReg[j] + colU[j] - evc); cSum[j] += q[j] * (t + 1); }
    }
    const norm = (a) => { const s = a.reduce((x, y) => x + y, 0); return Array.from(a, (x) => x / s); };
    const p = norm(rSum), q = norm(cSum);
    let value = 0;
    for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) value += p[i] * q[j] * M[i][j];
    return { p, q, value };
  }

  function rowStats(M, q) {
    return Array.from(M, (row) => {
      let ev = 0, worst = Infinity, best = -Infinity, uni = 0;
      row.forEach((x, j) => { ev += x * q[j]; worst = Math.min(worst, x); best = Math.max(best, x); uni += x / row.length; });
      return { ev, worst, best, uniform: uni };
    });
  }

  // ---------- setup ----------
  function newBattle(data, position) {
    const sides = [0, 1].map((sideIdx) => {
      const spec = position.sides[sideIdx];
      const team = data.teams[spec.team];
      const mons = team.members.map((set, i) => buildMon(data, set, sideIdx, i));
      const byName = (n) => team.members.findIndex((m) => m.species === n);
      const side = {
        name: team.player, megaUsed: false,
        brought: spec.bring.map(byName),
        active: spec.leads.map(byName),
        mons,
      };
      for (const [name, st] of Object.entries(spec.state || {})) {
        const m = mons[byName(name)];
        if (st.mega) { megaEvolveSilently(data, m); side.megaUsed = true; }
        if (st.hp !== undefined) m.hp = Math.round(st.hp * m.maxhp);
        if (st.fainted) { m.fainted = true; m.hp = 0; }
        if (st.item_used) m.itemUsed = true;
        if (st.fresh === false) m.fresh = false;
        if (st.boosts) Object.assign(m.boosts, st.boosts);
      }
      if (spec.mega_used) side.megaUsed = true;
      if (spec.veil) side.veil = spec.veil;
      return side;
    });
    const state = { turn: position.turn || 0, trickRoom: position.trick_room || 0, snow: position.snow || 0, sides };
    const log = [];
    if (!position.turn) {
      // Battle start: leads' entry abilities, faster first.
      const leads = [0, 1].flatMap((s) => actives(state, s));
      leads.sort((a, b) => speedOf(state, b) - speedOf(state, a));
      for (const m of leads) onEntryAbility(data, state, m, log);
    }
    if (!position.turn) {
      for (const s of [0, 1]) for (const m of actives(state, s)) m.fresh = true;
    }
    return { state, log };
  }
  function megaEvolveSilently(data, mon) {
    const sp = data.species[mon.megaStone];
    const stats = calcStats(sp.base_stats, mon.sp, mon.nature);
    stats.hp = mon.maxhp;
    mon.stats = stats; mon.form = mon.megaStone; mon.types = sp.types.slice(); mon.ability = sp.abilities[0]; mon.isMega = true;
  }

  // Send a replacement into a slot whose Pokémon fainted (between turns).
  function sendIn(data, state, sideIdx, slot, toIdx) {
    const next = clone(state);
    const log = [];
    const side = next.sides[sideIdx];
    side.active[slot] = toIdx;
    const inn = side.mons[toIdx];
    inn.fresh = true; inn.protectCount = 0;
    log.push({ t: "switchin", who: inn.key, slot, side: sideIdx, hp: inn.hp / inn.maxhp, text: `${inn.form} was sent in` });
    onEntryAbility(data, next, inn, log);
    return { state: next, log };
  }
  function benchOf(state, sideIdx) {
    const side = state.sides[sideIdx];
    return side.brought.filter((i) => !side.active.includes(i) && !side.mons[i].fainted);
  }

  const api = { sendIn, benchOf, calcStats, effectiveness, damageRange, newBattle, resolveTurn, jointPlans, choicesFor, describePlan, describeChoice, evaluate, payoffMatrix, solve, rowStats, speedOf, actives, clone };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.VGCEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
