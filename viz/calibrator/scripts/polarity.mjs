#!/usr/bin/env node
// Polarity check: flag cards whose high and low actions look swapped. A card's high action is what to do if its
// proposition is true, so a proposition that something is working or worth it should not have "stop" as its high
// action while its low action carries on. This is an offline word heuristic, run before a session is published
// (docs/generation-policy.md): it flags cards for a person or agent to read, and never rewrites one.
//
//   node scripts/polarity.mjs sessions/2026-10-03-s8.toon [more.toon ...]
//
// Exit status: 0 when nothing is flagged, 1 when a card is flagged, 2 when a file does not validate.
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

// An action stops, shrinks or puts off work when its first verb, or a verb after "and", "or" or "then", is one of
// these; it carries work on or adds to it when it starts with one of the CONTINUE verbs.
const STOPS = String.raw`stop|stopp\w*|paus\w*|cap|capp\w*|cut|cutting|delet\w*|drop\w*|defer\w*|postpon\w*|abandon\w*|retir\w*|remov\w*|reduc(e|es|ed|ing)|limit\w*|trim\w*|shelv\w*|freez\w*|halt\w*|quit|prun\w*|replac\w*|skip`;
const REDUCE = new RegExp(String.raw`(^|\b(and|or|then)\s+)(${STOPS}|keep (only|just)|only keep|do not|don't|hold off|scale back|no longer)\b`, "i");
const CONTINUE = /^(keep|continue|build|scale|add|adopt|start|expand|extend|ship|launch|invest|double|grow|rely|stay|carry on|go ahead)\b/i;
// In a proposition, each of these words turns its sense over: a stopping verb ("Should I drop X?") or a word saying
// something goes badly ("Is X costing me more than it saves?"). "Would deleting X lose anything?" has two, so it
// argues for keeping X.
const TURNS = new RegExp(String.raw`\b(${STOPS.replace("|skip", "")}|fail\w*|lose|loses|losing|lost|wast\w*|not|never|no(?!-)|nobody|nothing|\w+n't|against|distract\w*|harm\w*|hurt\w*|worse|less|crowd\w* out|come out|weak\w*|overrun\w*|exceed\w*|higher than|cost(s|ing)? (me|us)|pull\w*|regret\w*|relieved)\b`, "gi");
// The main clause: drop parentheses, a leading "If ...," condition and everything after the next comma.
const mainClause = (p) => p.trim().replace(/\([^)]*\)/g, "").replace(/^if [^,]*,\s*/i, "").split(",")[0];
const lead = (action) => action.trim().replace(/^if [^,]*,\s*/i, "");

// "reduce", "continue" or null when the action has neither kind of word.
export function direction(action) {
  const a = lead(action);
  if (/^keep (only|just)\b/i.test(a)) return "reduce";
  if (CONTINUE.test(a)) return "continue";
  return REDUCE.test(a) ? "reduce" : null;
}
// true when the proposition argues for less: its main clause turns over an odd number of times.
export function negative(proposition) {
  return (mainClause(proposition).match(TURNS) || []).length % 2 === 1;
}
// The reason a card looks swapped, or null.
export function polarity(q) {
  const high = direction(q.high_action), low = direction(q.low_action);
  if (!high || !low || high === low) return null;
  const wants = negative(q.proposition) ? "reduce" : "continue";
  if (high === wants) return null;
  return `the proposition argues to ${wants}, but the high action would ${high} and the low action would ${low}`;
}
export function checkSession(doc) {
  return doc.questions.flatMap((q) => { const why = polarity(q); return why ? [{ question_id: q.question_id, why }] : []; });
}

function engine() {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const ctx = {}; ctx.self = ctx;
  vm.runInNewContext(/<script id="calibrator-engine">\n([\s\S]*?)<\/script>/.exec(html)[1], ctx);
  return ctx.Calibrator;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const C = engine();
  let status = 0;
  for (const file of process.argv.slice(2)) {
    let doc;
    try { doc = C.parseSession(fs.readFileSync(file, "utf8")); } catch (e) { console.error(`${file}: ${e.message}`); status = 2; continue; }
    const flagged = checkSession(doc);
    for (const f of flagged) {
      const q = doc.questions.find((x) => x.question_id === f.question_id);
      console.log(`${file}: ${f.question_id}: ${f.why}\n  proposition: ${q.proposition}\n  high: ${q.high_action}\n  low:  ${q.low_action}`);
    }
    console.log(`${file}: ${flagged.length} of ${doc.questions.length} cards flagged`);
    if (flagged.length && !status) status = 1;
  }
  process.exit(status);
}
