/* Theorem Learner: proofs from concepts to results: the report adapter. report(state, derived, data) turns the
 * selected proof into the plain-data report that the site's beamdswitch template (Beamdswitch.deck) writes as a
 * narrated deck and that the kit writes as the Markdown record. It reads the same proof objects as the page, so the
 * slides and the page agree. Order: the exact statement; the concept reminders, one concept per slide; the hypotheses
 * and their roles; the steps, one per slide (slogan, inputs, output, speaker notes); the conclusion; the alternative
 * proofs and theory connections; the evidence and verification status. Narration is plain spoken prose in
 * ASD-STE100: no maths, markup or symbols.
 */
/** @param {any} root the global object @param {(model: any) => any} factory */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./src/model.js"));
  else root.Report = factory(root.Model);
})(/** @type {any} */ (typeof self !== "undefined" ? self : this), function (/** @type {any} */ Model) {
  "use strict";

  /** Spoken text: no characters that the voice reads badly, and no TeX. @param {string} text */
  function say(text) {
    return String(text)
      .replace(/\$[^$]*\$/g, " ").replace(/%/g, " percent").replace(/&/g, " and ").replace(/[≤]/g, " at most ").replace(/[≥]/g, " at least ")
      .replace(/[$\\`*_#|<>{}^]/g, " ").replace(/\s+/g, " ").trim();
  }
  /** One line of body text, with its TeX kept for the slide. @param {string} text @param {number} [max] */
  function line(text, max = 400) {
    const t = String(text ?? "").replace(/\s+/g, " ").trim();
    return t.length > max ? `${t.slice(0, max - 3)}...` : t;
  }
  /** @param {any[] | null | undefined} sg */
  const txt = (sg) => line(Model.flat(sg));

  /** @param {Record<string, any>} state @param {any} d @param {any} data */
  function report(state, d, data) {
    const s = d.surface;
    const p = s.proof;
    const ix = Model.index(data);
    const hypName = (/** @type {string} */ id) => `H${s.hypotheses.findIndex((/** @type {any} */ x) => x.id === id) + 1}`;

    /* ---------- set-up: the statement and the concept reminders ---------- */
    const setup = [{
      title: `${s.name}: the statement`,
      body: [txt(s.statement), "", s.statementBasis === "authored" ? `Type: ${s.type}; level: ${s.level}.` : `Statement basis: ${s.statementBasis}.`, p ? `Selected proof: ${p.name}.` : "No proof is authored for this theorem in this snapshot."].join("\n"),
      narration: say(`The theorem is ${s.name}. ${p ? `This deck follows the proof called ${p.name}.` : "No proof is written for it here, so this deck shows only its statement and evidence."}`),
    }];
    const conceptIds = p ? [...new Set([...s.hypotheses.flatMap((/** @type {any} */ h) => (h.concept !== null ? [h.concept] : [])), ...p.steps.flatMap((/** @type {any} */ st) => st.concepts)])].slice(0, 8) : [];
    for (const ci of conceptIds) {
      const r = Model.reminderOf(data, ci, s);
      setup.push({
        title: `Concept reminder: ${r.name}`,
        body: [r.reminder ? `**In short.** ${txt(r.reminder)}` : null, r.definition ? `**Definition.** ${txt(r.definition)}` : null,
          r.why ? `**Why here.** ${txt(r.why)}` : null, `**Used at:** ${r.usedAt.length ? r.usedAt.map((/** @type {any} */ u) => `step ${u.number}`).join(", ") : "no step"}${r.hyps.length ? `; hypotheses ${r.hyps.map(hypName).join(", ")}` : ""}.`].filter(Boolean).join("\n\n"),
        narration: say(`${r.name}. ${r.reminder ? Model.flat(r.reminder) : ""} ${r.why ? `In this proof: ${Model.flat(r.why)}` : ""}`),
      });
    }

    /* ---------- method: the hypotheses, their roles and the steps ---------- */
    /** @type {any[]} */
    const method = [];
    if (p) {
      method.push({
        title: "Hypotheses and their roles",
        body: s.hypotheses.map((/** @type {any} */ h, /** @type {number} */ k) => {
          const r = p.roles.find((/** @type {any} */ x) => x.h === h.id);
          return `- **H${k + 1}.** ${txt(h.seg)} ${r ? (r.unused ? "Not used in this proof." : `Role: ${txt(r.why)} Used at ${r.steps.map((/** @type {number} */ x) => `step ${x + 1}`).join(", ")}.`) : ""}`;
        }).join("\n") || "The statement has no separate hypotheses.",
        narration: say(`The theorem has ${s.hypotheses.length} hypotheses. Each one supplies something to particular steps of the proof.`),
      });
      for (const st of p.steps) {
        const inputs = [...st.hyps.map(hypName), ...st.inputs.map((/** @type {number} */ x) => `step ${x + 1}`)];
        const output = st.conclusion ? "the conclusion" : st.outputs.map((/** @type {number} */ x) => `step ${x + 1}`).join(", ") || "nothing later";
        method.push({
          title: `Step ${st.number}: ${line(Model.flat(st.slogan), 90)}`,
          body: [`**${txt(st.slogan)}**`, "", `- Inputs: ${inputs.join(", ") || "none"}`, `- Output: goes to ${output}`, st.lemmas.length ? `- Cites: ${st.lemmas.map((/** @type {any} */ l) => l.name).join("; ")}` : null].filter((x) => x !== null).join("\n"),
          narration: say(Model.flat(st.slogan)),
          notes: line(Model.flat(st.detail), 900),
        });
      }
    }

    /* ---------- results: the conclusion and the connections ---------- */
    const results = [{
      title: "Conclusion",
      body: s.conclusion ? txt(s.conclusion) : txt(s.statement),
      narration: say(p ? `Step ${p.conclusion + 1} gives the conclusion of the theorem.` : "The conclusion is the statement above."),
    }];
    if (p) {
      const alt = s.proofs.filter((/** @type {any} */ q) => q.slug !== p.slug);
      results.push({
        title: "Alternative proofs and theory connections",
        body: [`- Other proofs: ${alt.length ? alt.map((/** @type {any} */ q) => q.name).join("; ") : "none in this snapshot"}`,
          `- Proof moves: ${p.mechanisms.map((/** @type {any} */ m) => `${m.name} (in ${m.others} other proofs)`).join("; ") || "none named"}`,
          s.relations.length ? `- Related theorems (not proofs): ${s.relations.slice(0, 6).map((/** @type {any} */ r) => r.name).join("; ")}` : null,
          `- Lemmas cited: ${[...new Set(p.steps.flatMap((/** @type {any} */ st) => st.lemmas.map((/** @type {any} */ l) => l.name)))].join("; ") || "none"}`].filter(Boolean).join("\n"),
        narration: say(alt.length ? `The theorem has ${alt.length + 1} proofs here. The others are ${alt.map((/** @type {any} */ q) => q.name).join(" and ")}.` : "This snapshot has one proof of the theorem."),
      });
    }

    /* ---------- checks: evidence and verification ---------- */
    const v = p ? p.verification : null;
    const checks = [{
      title: "Evidence and verification status",
      body: [
        `- Formal declaration: ${s.formal ? `${s.formal.decl}${s.formal.evidence?.file ? ` (${s.formal.evidence.file}, lines ${s.formal.evidence.lines[0]}-${s.formal.evidence.lines[1]}, mathlib ${String(s.formal.evidence.revision).slice(0, 12)})` : ""}` : "none linked"}`,
        s.formal?.difference ? `- Difference from the statement: ${line(s.formal.difference, 300)}` : null,
        v ? `- Authored explanation: yes, ${v.authoredExplanation.route}` : "- Authored explanation: none",
        `- Checked correspondence: ${v?.checkedCorrespondence.present ? "yes" : "no"}`,
        `- Lean-checked proof: ${v?.leanCheckedProof.present ? "yes" : "no"}`,
        p && p.source.kind === "cited" ? `- Published proof: ${line(p.source.ref, 300)}` : null,
        p && p.source.kind === "web" ? `- Web source: ${p.source.url}` : null,
      ].filter(Boolean).join("\n"),
      narration: say(`The formal declaration is evidence about the theorem, not about this explanation. ${v ? "These steps are an authored explanation; no review has checked them against the formal proof, and Lean has not checked them." : ""}`),
    }, {
      title: "Takeaway",
      body: p ? p.steps.map((/** @type {any} */ st) => `${st.number}. ${txt(st.slogan)}`).join("\n") : txt(s.statement),
      key: line(p ? `${s.name} by ${p.name}: ${Model.flat(p.slogan)}` : `${s.name}: ${Model.flat(s.statement)}`, 200),
      narration: say(p ? `To remember the proof, read the slogans in order. ${Model.flat(p.slogan)}` : `Remember the statement of ${s.name}.`),
      notes: `Snapshot ${data.snapshot.id}; schema ${data.schema}; ${ix.proofs.length} proofs in the snapshot.`,
    }];

    return {
      meta: { title: "Theorem Learner: proofs from concepts to results", subtitle: p ? `${s.name}: ${p.name}` : s.name, voice: "bf_emma" },
      narration: say(`This deck teaches ${s.name}${p ? ` through the proof called ${p.name}` : ""}.`),
      notes: `Generated from snapshot ${data.snapshot.id}. The page never refreshes its sources.`,
      setup, method, results, checks,
    };
  }

  return { report, say };
});
