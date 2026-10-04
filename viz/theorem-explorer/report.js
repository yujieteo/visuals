/* Theorem Explorer: which result to learn next: the report adapter. This file is the visual's own: report(state, derived, data) turns the current
 * view into the plain-data report that the site's beamdswitch template (beamdswitch.js, Beamdswitch.deck) writes
 * as a narrated deck, and that the kit writes as the Markdown record (§14, §15). It reads only the state, the
 * values the page derives from it and the snapshot, so the deck and the page never disagree. It never invents a
 * worked example: an application frame cites a documented use record, or says that there is none. Narration is
 * plain spoken prose in ASD-STE100: no maths, markup or symbols.
 */
/** @param {any} root the global object @param {(model: any) => any} factory */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./src/model.js"));
  else root.Report = factory(root.Model);
})(/** @type {any} */ (typeof self !== "undefined" ? self : this), function (/** @type {any} */ Model) {
  "use strict";

  /** Spoken text: no characters that the narration voice reads badly. @param {string} text */
  function say(text) {
    return String(text)
      .replace(/%/g, " percent").replace(/&/g, " and ").replace(/≈/g, "about ").replace(/×/g, " times ")
      .replace(/[$\\`*_#|<>⁰¹²³⁴⁵⁶⁷⁸⁹⁻]/g, " ").replace(/\s+/g, " ").trim();
  }
  /** One line of body text: no line can start a heading or a fenced block. @param {string} text @param {number} [max] */
  function line(text, max = 300) {
    const t = String(text ?? "").replace(/\s+/g, " ").trim();
    return t.length > max ? `${t.slice(0, max - 3)}...` : t;
  }
  /** @param {number | null} v */
  const score = (v) => Model.scoreLabel(v);
  /** @param {string[]} list */
  const and = (list) => (list.length <= 1 ? list.join("") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`);

  /** @param {Record<string, any>} state @param {any} d @param {any} data */
  function report(state, d, data) {
    const s = d.selected;
    const det = Model.detail(data);
    const x = det ? det[s.i] : null;
    const level = Model.LEVEL_NAMES[Model.LEVELS.indexOf(s.level)];
    const weights = Model.COMPONENT_NAMES.map((/** @type {string} */ n, /** @type {number} */ k) => `${n} ${d.weights[k]}`);
    const scoreText = s.score === null ? `unknown, between ${score(s.lo)} and ${score(s.hi)}` : score(s.score);

    /* ---------- set-up ---------- */
    const setup = [
      {
        title: "The reader profile and the goal",
        body: [
          `- View: ${state.view}`,
          `- Weights: ${state.preset} (${weights.join(", ")}; sum ${d.weightSum})`,
          d.excluded.length ? `- Excluded components (custom view): ${d.excluded.join(", ")}` : null,
          `- Depth: ${state.depth}; reader level: ${state.reader}; study budget: band ${state.budget} (${Model.BANDS[state.budget - 1]})`,
          `- Interests: ${d.learn.baseline ? "none (baseline profile)" : d.learn.interests.join(", ")}`,
          `- Known results: ${d.counts.known}`,
          `- Filters: ${d.filters.length ? d.filters.map((/** @type {any} */ f) => `${f.label} ${f.value}`).join("; ") : "none"}; ${d.counts.shown} of ${d.counts.records} records shown`,
        ].filter(Boolean).join("\n"),
        narration: say(`The goal is to find the result to learn next. The weights are the ${state.preset} preset. The depth is ${state.depth}, and the reader level is ${Model.LEVEL_NAMES[Model.LEVELS.indexOf(state.reader)]}. ${d.learn.baseline ? "The profile has no interests, so every result is equally relevant." : `The interests are ${and(d.learn.interests)}.`} The table shows ${d.counts.shown} of ${d.counts.records} records.`),
      },
      {
        title: `The selected result: ${s.name}`,
        body: [
          `- Identifier: ${s.id}`,
          `- Type: ${s.type}; needed reader level: ${level}`,
          `- Theorem categories: ${s.cats.join(", ") || "unclassified"}`,
          `- Application categories: ${s.acats.join(", ") || "none"}`,
          `- Formal proof in mathlib: ${s.formal ? s.decl : "no"}`,
          `- Pinned results: ${d.pinned.length ? d.pinned.map((/** @type {any} */ p) => p.name).join("; ") : "none"}`,
        ].join("\n"),
        narration: say(`The selected result is ${s.name}. It is ${/^[aeiou]/.test(s.type) ? "an" : "a"} ${s.type}, at the ${level} level. ${s.formal ? "Mathlib has a formal proof of it." : "Mathlib has no formal proof of it."}`),
      },
    ];

    /* ---------- method ---------- */
    const source = x?.evs.find((/** @type {any} */ e) => e.kind === "source statement") ?? x?.evs.find((/** @type {any} */ e) => e.kind === "formal declaration");
    const statement = [
      source ? `> ${line(source.claim, 500).replace(/`/g, "'")}` : "No source statement text is in the snapshot.",
      source ? `\nSource: ${line(source.location, 120)}, revision ${String(source.revision).slice(0, 12)}.` : "",
      x?.concl ? `\nLean conclusion: \`${line(x.concl, 240).replace(/`/g, "'")}\`` : "",
      x?.sig ? `\nExplicit hypotheses: ${x.hyps.length}; typeclass assumptions: ${x.cls.length}.` : "",
    ].join("");
    const pathSteps = s.path.steps.slice(-8);
    const half = Math.ceil(pathSteps.length / 2);
    const method = [
      {
        title: `The statement of ${s.name}`,
        body: statement,
        narration: say(`${source ? `This is the original statement from the ${source.kind === "formal declaration" ? "formal library" : "source"}, not a restatement.` : "The snapshot has no source text of the statement."} ${x?.sig ? `The formal version has ${x.hyps.length} explicit hypotheses and ${x.cls.length} typeclass assumptions.` : "The snapshot has no formal version of it."}`),
      },
      {
        title: "The rubric and the weights",
        body: [
          "$$\\text{overall} = \\sum_k w_k \\, \\frac{r_k}{4}$$",
          "",
          "| Component | Weight | Score |",
          "|---|---|---|",
          ...Model.COMPONENT_NAMES.map((/** @type {string} */ n, /** @type {number} */ k) => `| ${n} | ${d.weights[k]} | ${s.scores[k]} |`),
          "",
          "A score u (unknown) or na (not applicable) makes the aggregate unknown. The page then shows the interval with 0 and 4 for the missing scores.",
        ].join("\n"),
        narration: say(`Each component has a score from zero to four. The overall score is the weighted sum of the scores, divided by four. If a score is unknown, the overall score is unknown too. Then the page shows an interval.`),
      },
      {
        title: `The prerequisite path to ${s.name}`,
        body: pathSteps.length > 1
          ? [
            ...pathSteps.slice(0, half).map((/** @type {any} */ st, /** @type {number} */ k) => `${k + 1}. ${st.name} (${Model.bandLabel(st.band)})`),
            "",
            ". . .",
            "",
            ...pathSteps.slice(half).map((/** @type {any} */ st, /** @type {number} */ k) => `${half + k + 1}. ${st.name} (${Model.bandLabel(st.band)})`),
            "",
            `${s.path.supported} edges have a formal reference; ${s.path.uncertain} are judged only. ${s.path.cycles.length ? `Cycles: ${s.path.cycles.length}.` : "No cycle."} This is not a guaranteed curriculum.`,
          ].join("\n")
          : `No unknown prerequisite result is recorded for ${s.name}.${s.path.knownStops.length ? ` Known prerequisites: ${s.path.knownStops.length}.` : ""}`,
        narration: say(pathSteps.length > 1
          ? `The path has ${s.path.steps.length} steps. Each prerequisite comes before the results that need it. ${s.path.uncertain} of the links are judged only, so the path is not a guaranteed curriculum.`
          : `The snapshot records no unknown prerequisite result for ${s.name}.`),
      },
    ];

    /* ---------- results ---------- */
    const results = [viewFrame(state, d, data)];
    results.push({
      title: `The scores of ${s.name}`,
      body: [
        `- Aggregate: ${scoreText}${s.rank ? ` (rank ${s.rank})` : ""}`,
        `- Scores ${Model.COMPONENTS.join(" ")}: ${s.scores.join(" ")}`,
        `- Second assessment: ${s.second ?? "none"}; consistency: ${s.consistency}`,
        `- Confidence: ${s.conf}; evidence: ${s.ev}`,
        `- Effort (understand, apply, prove): ${s.effort.map((/** @type {string} */ b) => Model.bandLabel(b)).join("; ")}`,
      ].join("\n"),
      narration: say(`Under these weights, the aggregate score of ${s.name} is ${scoreText}. The confidence is ${s.conf}. ${s.second ? `A second assessment exists, and the consistency is ${s.consistency}.` : "There is no second assessment."}`),
    });
    const apps = (x?.evs ?? []).filter((/** @type {any} */ e) => e.kind === "use record (application)").slice(0, 3);
    results.push(apps.length
      ? {
        title: `Documented applications of ${s.name}`,
        body: apps.map((/** @type {any} */ e) => `- ${line(e.paper ?? e.location, 160)}: ${line(e.claim, 260)}`).join("\n"),
        narration: say(`The sources document ${s.uses.application} applications. Here are ${apps.length} of them, from the papers that use the result.`),
      }
      : {
        title: `Documented applications of ${s.name}`,
        body: "No documented application in the declared sources. This deck does not invent one.",
        narration: say("The declared sources document no application of this result, so this deck shows none."),
      });

    /* ---------- checks ---------- */
    const cutoff = data.snapshot.evidence_cutoff;
    const checks = [
      {
        title: "Evidence limits",
        body: [
          `- Evidence records for ${s.name}: ${x ? x.evs.length : "unknown"}; uses: ${s.uses.application} applications, ${s.uses.influence} influences`,
          `- Scores are judgments by ${data.snapshot.judge.model} under rubric ${data.rubric.version}`,
          `- Evidence cutoff ${cutoff}; snapshot ${data.snapshot.id}`,
          "- Shares over time describe the evidence corpus, not importance",
        ].join("\n"),
        narration: say(`The scores are judgments, not measurements. They use the evidence up to ${cutoff}. Thin evidence gives a lower confidence.`),
      },
      {
        title: "Takeaway",
        body: [
          `- Selected: ${s.name}, aggregate ${scoreText}`,
          d.learn.recs.length ? `- Learn next: ${d.learn.recs[0].name} (priority ${d.learn.recs[0].complete ? score(d.learn.recs[0].p) : `${score(d.learn.recs[0].lo)} to ${score(d.learn.recs[0].hi)}`})` : "- Learn next: no candidate after the filters",
          "- Next: inspect the statement, compare an alternative, learn a missing prerequisite, or examine an application",
        ].join("\n"),
        key: line(d.learn.recs.length
          ? `Learn ${d.learn.recs[0].name} next: it has the highest learning priority for this profile.`
          : `No result is a candidate after the filters; ${s.name} has the aggregate ${scoreText}.`, 200),
        narration: say(d.learn.recs.length
          ? `For this profile, learn ${d.learn.recs[0].name} next. It has the highest learning priority.`
          : "No result is a candidate after the filters. Clear a filter to see recommendations."),
        notes: `Snapshot ${data.snapshot.id}; rubric ${data.rubric.version}; learning rule te-learn/1.`,
      },
    ];

    return {
      meta: { title: "Theorem Explorer: which result to learn next", subtitle: `${s.name}, ${state.preset} weights, ${state.view} view`, voice: "bf_emma" },
      narration: say(`This deck reads the Theorem Explorer in the ${state.view} view. The selected result is ${s.name}.`),
      notes: `Generated from snapshot ${data.snapshot.id}. The page never refreshes its sources.`,
      setup, method, results, checks,
    };
  }

  /** The frame for the active view. @param {Record<string, any>} state @param {any} d @param {any} data */
  function viewFrame(state, d, data) {
    if (state.view === "concepts" && d.concepts) {
      const c = d.concepts, s = c.selected;
      return {
        title: `Concepts: ${s.name}`,
        body: [
          `- ${c.counts.shown} of ${c.counts.concepts} concepts shown; ${c.counts.full} have the full assessment`,
          `- ${s.name}: ${s.kind}, ${s.assessment} assessment, aggregate ${s.score === null ? `unknown, ${score(s.lo)} to ${score(s.hi)}` : score(s.score)}`,
          `- Scores ${Model.CONCEPT_COMPONENTS.join(" ")}: ${s.scores.join(" ")}`,
          s.definition ? `- Definition (${s.definitionBasis === "judge" ? "judge" : s.definitionBasis}): ${line(s.definition, 240).replace(/`/g, "'")}` : "- No definition text in the snapshot",
          `- Prerequisites: ${s.prerequisites.map((/** @type {any} */ p) => p.name).join("; ") || "none recorded"}`,
          `- arXiv papers that name it: ${s.papers === null ? "not counted" : s.papers}; catalog results that name it: ${s.resultCount}`,
          "",
          "Top concepts in the table:",
          ...c.top.slice(0, 5).map((/** @type {any} */ t, /** @type {number} */ k) => `${k + 1}. ${t.name}: ${t.score === null ? `${score(t.lo)} to ${score(t.hi)}` : score(t.score)}`),
        ].join("\n"),
        narration: say(`The concept catalog has ${c.counts.concepts} concepts. The selected concept is ${s.name}. ${s.score === null ? "Its aggregate score is unknown, so the page shows an interval." : `Its aggregate score is ${score(s.score)}.`} ${s.resultCount ? `${s.resultCount} catalog results name it.` : "No catalog result names it."}`),
      };
    }
    if (state.view === "tree" && d.tree) {
      const t = d.tree;
      const steps = t.study.slice(-8);
      return {
        title: `Prerequisite tree of ${t.root.name}`,
        body: [
          `- Root: ${t.root.name} (${t.root.kind}); depth ${t.depth}; ${t.unique} distinct items${t.truncated ? `, cut at ${Model.TREE_NODES} nodes` : ""}`,
          `- Unknown: ${t.studyCount} (${t.results} results, ${t.concepts} concepts)`,
          "",
          "Study order, the last steps:",
          ...steps.map((/** @type {any} */ n, /** @type {number} */ k) => `${t.studyCount - steps.length + k + 1}. ${n.name} (${n.kind})`),
          "",
          "Results need their judged prerequisite results and key concepts; concepts need their prerequisite concepts. Not a guaranteed curriculum.",
        ].join("\n"),
        narration: say(`The prerequisite tree of ${t.root.name} has ${t.unique} distinct items to depth ${t.depth}. ${t.studyCount} of them are not known: ${t.results} results and ${t.concepts} concepts. The study order puts each item after the items it needs.`),
      };
    }
    if (state.view === "popularity" && d.popularity) {
      const p = d.popularity;
      const top = p.perTag.map((/** @type {any} */ t) => `- ${t.tag}: ${t.top.slice(0, 3).map((/** @type {any} */ x) => x.name).join("; ") || "none"}`);
      return {
        title: `Popularity by arXiv tag: ${p.kind}`,
        body: [
          `Measure: ${p.unit}. Papers ${p.years[0]} to ${p.years[1]}, titles and abstracts.`,
          "",
          "The top three in each tag:",
          ...top,
          p.trend ? `\nTrend item: ${p.trend.name}` : "",
        ].join("\n"),
        narration: say(`This frame compares the popularity of ${p.kind} across ${p.tags.length} arXiv tags. ${p.perTag[0]?.top[0] ? `In ${p.perTag[0].tag}, the top item is ${p.perTag[0].top[0].name}.` : ""} A count shows use in abstracts, not importance.`),
      };
    }
    if (state.view === "compare") {
      const c = d.compare;
      const ranked = c.entries.filter((/** @type {any} */ e) => e.value !== null);
      const excluded = c.entries.filter((/** @type {any} */ e) => e.value === null);
      const best = ranked.find((/** @type {any} */ e) => e.result === c.best);
      return {
        title: `Comparison: ${c.title}`,
        body: [
          line(c.question, 300),
          "",
          ...ranked.map((/** @type {any} */ e) => `- ${e.rank ? `${e.rank}. ` : ""}${e.name}: $${e.tex}$ gives ${e.text}`),
          c.reference ? `- Reference: ${c.reference.label}: ${c.reference.text}` : null,
          ...excluded.map((/** @type {any} */ e) => `- Excluded: ${e.name}: ${line(e.excluded, 200)}`),
          "",
          `Metric: ${c.metric.name}, ${c.metric.direction} is better. Calculated guarantees, not empirical data.`,
        ].filter((v) => v !== null).join("\n"),
        narration: say(best
          ? `The case asks for ${c.metric.name}. ${best.name} gives the best calculated value, ${best.text}. These values are calculated guarantees, not empirical data. ${excluded.length ? `${excluded.length} result does not apply, and the page gives the reason.` : ""}`
          : `All results in this case give the same value, so no result dominates. The trade off is the machinery that each result needs.`),
      };
    }
    if (state.view === "connections") {
      const s = d.selected;
      const counts = Model.REL_ORDER.filter((/** @type {string} */ t) => s.relations[t]).map((/** @type {string} */ t) => `${t} ${s.relations[t].count}`);
      return {
        title: `Connections of ${s.name}`,
        body: counts.length
          ? [...Model.REL_ORDER.filter((/** @type {string} */ t) => s.relations[t]).map((/** @type {string} */ t) => `- ${t} (${s.relations[t].count}): ${s.relations[t].items.slice(0, 4).map((/** @type {any} */ e) => e.name).join("; ")}`)].join("\n")
          : "No relation is recorded for this result.",
        narration: say(counts.length ? `${s.name} has ${counts.length} kinds of relations in the snapshot. Each relation has its evidence and its status.` : `The snapshot records no relation for ${s.name}.`),
      };
    }
    if (state.view === "fields") {
      const f = d.fields;
      let body = `${f.label}. ${line(f.basis, 300)}`;
      let said = `${f.label}. The share describes the evidence corpus, not importance.`;
      if (f.years && f.shares) {
        const lastRow = f.shares.map((/** @type {any} */ r, /** @type {number} */ j) => [r, j]).filter((/** @type {any} */ p) => p[0] !== null).pop();
        if (lastRow) {
          const [row, j] = lastRow;
          const top = f.keys.map((/** @type {string} */ k, /** @type {number} */ c) => [k, row[c], f.counts[j][c]]).sort((/** @type {any} */ a, /** @type {any} */ b) => b[1] - a[1]).slice(0, 5);
          body += `\n\nLast year with data: ${f.years[j]} (total ${Model.scoreLabel(f.total[j])}).\n\n${top.map((/** @type {any} */ t) => `- ${t[0]}: ${t[1]}% (${Model.scoreLabel(t[2])})`).join("\n")}\n\nUndated records, totalled apart: ${f.undated}.`;
          said += ` In ${f.years[j]}, the largest share is ${top[0][0]}, with ${top[0][1]} percent.`;
        }
      } else if (f.bars) {
        body += `\n\n${f.bars.slice(0, 6).map((/** @type {any} */ b) => `- ${b.key}: ${b.formal} of ${b.results} linked to mathlib`).join("\n")}`;
      } else if (f.steps) {
        body += `\n\n${f.steps.map((/** @type {any} */ st) => `- ${st.year}: ${st.text} (${st.by})`).join("\n") || "No dated step."}`;
      } else if (f.changes) {
        body += `\n\n${f.changes.length} results have a second assessment.`;
      }
      return { title: `Fields over time: ${f.label}`, body, narration: say(said) };
    }
    if (state.view === "learn") {
      const recs = d.learn.recs.slice(0, 5);
      return {
        title: "Recommendations: what to learn next",
        body: recs.length
          ? [...recs.map((/** @type {any} */ r, /** @type {number} */ k) => `${k + 1}. ${r.name}: priority ${r.complete ? score(r.p) : `incomplete, ${score(r.lo)} to ${score(r.hi)}`}; missing prerequisites ${r.missing.length}; ${Model.bandLabel(r.band === "x" ? "x" : String(r.shifted))}`),
            "", `${d.learn.excludedKnown} known results left out; ${d.learn.incomplete} of ${d.learn.candidates} candidates have an incomplete priority.`].join("\n")
          : "No candidate after the filters.",
        narration: say(recs.length ? `The first recommendation is ${recs[0].name}. The priority adds value, relevance, accessibility, future access and effort fit, with published weights.` : "No result is a candidate after the filters."),
      };
    }
    const rows = d.order.slice(0, 8).map((/** @type {number} */ i) => Model.index(data).rows[i]);
    const agg = (/** @type {number} */ i) => (d.weightsOk ? Model.aggregate(Model.index(data).scores[i], d.weights).v : null);
    return {
      title: state.view === "about" ? "Sources and coverage" : "The catalog under these weights",
      body: state.view === "about"
        ? `- Named records: ${data.coverage.named.records}; scored: ${data.coverage.named.scored}\n- mathlib theorems: ${data.coverage.formal.theorems}; unnamed and unscored: ${data.coverage.formal.unnamed_unscored}\n- Evidence cutoff: ${data.snapshot.evidence_cutoff}`
        : rows.map((/** @type {any} */ r, /** @type {number} */ k) => `${k + 1}. ${r.n}: ${score(agg(d.order[k]))}`).join("\n") || "No record after the filters.",
      narration: say(state.view === "about"
        ? `The snapshot has ${data.coverage.named.scored} scored results. Every named result has a score.`
        : rows.length ? `Under these weights, ${rows[0].n} has the highest aggregate score in the table.` : "No record is left after the filters."),
    };
  }

  return { report, say };
});
