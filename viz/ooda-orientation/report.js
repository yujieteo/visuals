/* The current situation in Orient as a beamdswitch report.
 *
 * report(state, L, D) turns the planner state into the plain-data report that the standard template
 * (beamdswitch.js, `Beamdswitch.deck`) writes as a narrated Markdown deck. `L` is OrientLogic, already
 * initialised with the page data `D`. The deck follows the situation as a sequence: situation, reality
 * ledger, original orientation, contradictions, destruction operations, fragments, candidate
 * orientations, adopted orientation, action, prediction, observed result and current conclusion. With
 * several loops it follows only the current lineage (the chain of adopted orientations), so abandoned
 * branches appear only as the candidates each transition rejected. Every deck is narrated by bf_emma.
 */
/** @param {any} root the global object @param {() => any} factory */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.OrientReport = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const VOICE = "bf_emma";
  /** @param {unknown} s */
  const clean = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  /** @param {unknown} s */
  const bare = (s) => clean(s).replace(/[.!?;:,]+$/, "");
  /* Markdown body text: the user's words are literal, never markup. */
  /** @param {unknown} s */
  const md = (s) => clean(s).replace(/[\\`*_$<>|#[\]]/g, "\\$&").replace(/^:::/, "\\:::");
  /* Narration is read aloud: no markup, maths or symbols. */
  /** @param {unknown} s */
  const speak = (s) => clean(String(s == null ? "" : s).replace(/&/g, " and ").replace(/%/g, " percent").replace(/[→↓]/g, ", then ").replace(/[−–—]/g, ", ")
    .replace(/[$\\`*_#|<>×⁰¹²³⁴⁵⁶⁷⁸⁹⁻≈·∠°σ£€µ[\]{}~^]/g, " ")).replace(/\s+([,.;:!?])/g, "$1").replace(/,\s*,/g, ",");
  /** @param {unknown} s */
  const sentence = (s) => { const t = bare(s); return t ? t + "." : ""; };
  /** @param {string[]} xs @param {string} none */
  const list = (xs, none) => (xs.length ? xs.map((x) => "- " + md(x)).join("\n") : none);
  /** @param {string[]} xs */
  const spokenList = (xs) => (xs.length < 2 ? xs.join("") : xs.slice(0, -1).join("; ") + "; and " + xs[xs.length - 1]);
  /** @param {number} n @param {string} one @param {string} many */
  const count = (n, one, many) => (n === 0 ? "no " + many : n === 1 ? "one " + one : n + " " + many);

  /** @param {Orient.State} state @param {Orient.Logic} L @param {Orient.Data} D @returns {Orient.Report} */
  function report(state, L, D) {
    const S = state, o = L.current(S);
    if (!o) throw new Error("Start a situation before exporting a deck.");
    const chain = L.currentLineage(S);
    const transitions = /** @type {Orient.Transition[]} */ (chain.slice(1).map((x) => S.history.find((h) => h.kind === "transition" && h.to === x.id)).filter(Boolean));
    /** @param {string} id */
    const item = (id) => S.items.find((i) => i.id === id);
    const live = S.items.filter((i) => i.status !== "withdrawn");
    const intent = S.intent && item(S.intent);
    const title = clean(S.situation.title) || "Untitled situation";
    // @ts-expect-error the state's mode is one of the page data's modes
    const mode = D.modes.find((m) => m.id === S.mode).label;
    /** @param {string} id */
    // @ts-expect-error every recorded move names one of the page data's operations
    const opLabel = (id) => D.operations.find((x) => x.id === id).label;

    const observed = live.filter((i) => i.ledger === "observed" && i.type !== "contradiction");
    const inferred = live.filter((i) => i.ledger === "inferred" && i.type !== "intention");
    const unknown = live.filter((i) => i.ledger === "unknown");
    const contradictions = S.items.filter((i) => i.type === "contradiction");
    /** @param {Orient.Item} i */
    // @ts-expect-error every recorded provenance is one of the page data's qualifiers
    const qual = (i) => i.text + (i.provenance.length ? " (" + i.provenance.map((q) => D.qualifiers.find((x) => x.id === q).label).join(", ") + ")" : "");

    const setup = [
      { title: "The situation", body: ["**" + md(title) + "**", S.situation.description ? "\n" + md(S.situation.description) : "", "",
        "- Intent: " + (intent ? md(intent.text) : "not stated"), "- Tempo: " + S.tempo, "- Situation mode: " + md(mode), "- Loop " + S.loop].join("\n"),
        narration: "The situation: " + speak(sentence(title)) + " " + (intent ? "The intent is to " + speak(sentence(intent.text.charAt(0).toLowerCase() + intent.text.slice(1))) : "No intent is stated.") + " Tempo is " + S.tempo + "." },
      { title: "The reality ledger", body: ["**Observed**", list(observed.map(qual), "- Nothing recorded"), "", "**Inferred**", list(inferred.map((i) => i.text), "- Nothing recorded"), "", "**Unknown**", list(unknown.map((i) => i.text), "- Nothing recorded")].join("\n"),
        notes: "Observed, inferred and unknown items are kept apart; an inference cannot be relabelled as an observation.",
        narration: "The ledger keeps observation apart from interpretation. It holds " + count(observed.length, "observation", "observations") + ", " + count(inferred.length, "inference", "inferences") + " and " + count(unknown.length, "unknown", "unknowns") + "." +
          (observed.length ? " For example: " + speak(sentence(observed[0].text)) : "") },
    ];

    const first = chain[0];
    /** @type {Orient.Frame[]} */
    const method = [
      { title: "The original orientation, " + L.label(S, first), body: md(L.statement(first)) + (L.boundaryText(S, first) ? "\n\nBoundary: " + md(L.boundaryText(S, first)) : ""),
        narration: "The starting orientation. " + speak(L.statement(first)) },
      { title: "Contradictions", body: contradictions.length ? contradictions.map((c) => "- " + md(c.text) + " — " + c.status + (c.reason ? ": " + md(c.reason) : "")).join("\n") : "Nothing recorded contradicts the orientation. That does not mean it is correct.",
        narration: contradictions.length ? "What did not fit: " + spokenList(contradictions.map((c) => speak(bare(c.text)) + ", now " + c.status)) + "." : "No contradiction has been recorded. That does not mean the orientation is correct." },
    ];
    if (!transitions.length) {
      method.push({ title: "No reorientation yet", body: "The orientation has not been destroyed: no destruction operations, fragments or candidates yet.",
        narration: "There has been no reorientation yet, so there are no destructive moves, fragments or candidates to show." });
    }
    for (const t of transitions) {
      const from = L.labelOf(S, t.from), to = L.labelOf(S, t.to);
      // @ts-expect-error filter(Boolean) keeps only the items found, and a move with no result item reads as ""
      const moves = t.moves.map((m) => ({ op: opLabel(m.op), targets: m.targets.map(item).filter(Boolean).map((i) => i.text), challenge: m.challenge, result: (item(m.result) || {}).text || "" }));
      method.push({ title: "Destruction: " + from + " to " + to, body: moves.length ? moves.map((m) => "- **" + md(m.op) + "**" + (m.targets.length ? ": " + md(m.targets.join("; ")) : "") + "\n  - Challenge: " + md(m.challenge) + "\n  - Replacement: " + md(m.result)).join("\n") : "No explicit move: the new orientation rearranged existing fragments.",
        narration: moves.length ? spokenList(moves.map((m) => speak(m.op) + (m.targets.length ? ", applied to " + speak(m.targets.join(", and ")) : "") + ", replaced by " + speak(bare(m.result)))) + "." : "No explicit destructive move was recorded for this transition." });
      const sig = /** @type {NonNullable<ReturnType<Orient.Logic["signature"]>>} */ (L.signature(S, t.id)), names = (/** @type {{ text: string }[]} */ xs) => xs.map((i) => i.text);
      method.push({ title: "Fragments: kept, destroyed, created", body: ["**Kept**", list(names(sig.kept), "- Nothing"), "", "**Destroyed**", list(names(sig.destroyed), "- Nothing"), "", "**Created**", list(names(sig.created), "- Nothing")].join("\n"),
        narration: "Moving from " + from + " to " + to + ", " + count(sig.kept.length, "fragment was", "fragments were") + " kept, " + count(sig.destroyed.length, "was", "were") + " destroyed and " + count(sig.created.length, "was", "were") + " created." +
          (sig.destroyed.length ? " Destroyed: " + speak(spokenList(names(sig.destroyed).map(bare))) + "." : "") + (sig.created.length ? " Created: " + speak(spokenList(names(sig.created).map(bare))) + "." : "") });
      const cands = /** @type {Orient.Orientation[]} */ ([t.to].concat(t.rejected).map((id) => S.orientations.find((x) => x.id === id)));
      method.push({ title: "Candidate orientations", body: cands.map((c) => "- **" + L.label(S, c) + (c.id === t.to ? " (adopted provisionally)" : " (rejected)") + "**: " + md(L.statement(c)) + (c.falsifier ? "\n  - Would be less credible if: " + md(c.falsifier) : "\n  - Hard to test")).join("\n"),
        narration: count(cands.length, "candidate was", "candidates were") + " contrasted. " + spokenList(cands.map((c) => L.label(S, c) + (c.id === t.to ? ", adopted provisionally, " : ", rejected, ") + "held that the situation is " + speak(bare(c.inside) || "unstated"))) + "." });
    }

    const a = S.actions.filter((x) => x.orientation === o.id).slice(-1)[0] || null;
    const p = a && a.prediction ? S.predictions.find((x) => x.id === a.prediction) : null;
    const r = a ? S.outcomes.find((x) => x.action === a.id) : null;
    const results = [
      { title: "Adopted orientation, " + L.label(S, o), body: md(L.statement(o)) + "\n\n- Falsifier: " + (o.falsifier ? md(o.falsifier) : "Hard to test") + "\n- Confidence: " + o.confidence + " (" + L.basisText(L.basis(S, o)).join(", ") + ")",
        narration: "The orientation now adopted provisionally. " + speak(L.statement(o)) + " Confidence is " + o.confidence + ", shown beside its evidence: " + speak(L.basisText(L.basis(S, o)).join(", ")) + "." },
      a ? { title: "The action", body: md(L.actionSentence(S, a)) + "\n\n- Type: " + a.type + "\n- Reconsider if: " + (a.reconsider ? md(a.reconsider) : "not stated"),
        narration: speak(L.actionSentence(S, a)) + (a.reconsider ? " Reconsider if " + speak(sentence(a.reconsider.charAt(0).toLowerCase() + a.reconsider.slice(1))) : "") }
        : { title: "No action yet", body: "No action has been chosen from this orientation.", narration: "No action has been chosen from this orientation yet." },
      { title: "The prediction", body: p ? "Before acting I expected: " + md(p.locked ? p.original : p.text) + (p.locked ? "\n\nFrozen when the action started; it is never rewritten." : "\n\nStill editable: the action has not started.") : "No prediction recorded.",
        narration: p ? "Before acting, the expectation was: " + speak(sentence(p.locked ? p.original : p.text)) + (p.locked ? " It was frozen when the action started." : " It is still editable, because the action has not started.") : "No prediction has been recorded." },
      { title: "What happened", body: r ? ["- Before acting: " + md(p ? p.original || p.text : "no prediction"), "- Reality: " + md(r.observed), "- Interpretation: " + (r.interpretation ? md(r.interpretation) : "not recorded"), p ? "- The prediction was " + p.status : ""].filter(Boolean).join("\n") : "No result recorded yet.",
        narration: r ? "What happened: " + speak(sentence(r.observed)) + (r.interpretation ? " The interpretation: " + speak(sentence(r.interpretation)) : "") : "No result has been recorded yet." },
    ];
    const trig = L.triggers(S);
    const conclusion = trig.length ? "Reasons to reorient: " + trig.map((x) => x.label.toLowerCase()).join("; ") + "." : "No obvious reason to destroy this orientation yet. Test or exploit it.";
    const checks = [
      { title: "How far to trust this", body: "The planner does not decide which orientation is correct. Predictions were written before acting and frozen when the action started; reality, not the tool, discriminates between models.",
        narration: "The planner does not decide which orientation is correct. Predictions are written before acting and frozen once the action starts, so reality, not the tool, tells the models apart." },
      { title: "Current conclusion", key: md(L.statement(o)) + "\n\n" + md(conclusion),
        narration: "The current conclusion. " + speak(L.statement(o)) + " " + speak(conclusion) },
    ];
    return {
      meta: { title, subtitle: "An orientation record from Orient", voice: VOICE },
      notes: "Generated from the situation as recorded in the planner, following the current lineage only.",
      narration: speak(sentence(title)) + " An orientation record: from reality, to an orientation, to an action and what it showed.",
      setup, method, results, checks,
    };
  }

  return { VOICE, report, speak, md };
});
