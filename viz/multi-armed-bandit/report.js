/* The current multi-armed bandit experiment as a beamdswitch report.
 *
 * report(state, view, simView, D, date) turns the committed experiment into the plain-data report that
 * the standard template (beamdswitch.js, `Beamdswitch.deck`) writes as a narrated Markdown deck.
 * `view` is BanditLogic.view(state) and `simView` BanditLogic.simView(...) or null when the simulation
 * has not run, so every number is the one the page shows. Exporting is a snapshot: it reads state and
 * never changes it. The user's own words are escaped so they cannot open a heading, a ::: div or front
 * matter. Every deck is narrated by bf_emma.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BanditReport = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const VOICE = "bf_emma";
  const clean = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  const bare = (s) => clean(s).replace(/[.!?;:,]+$/, "");
  /* Markdown body text: the user's words are literal, never markup. */
  const md = (s) => clean(s).replace(/[\\`*_$<>|#[\]~]/g, "\\$&");
  /* Front matter values: one line; a value wrapped in matching quotes keeps them. */
  const front = (s) => { const t = clean(s); return /^(["']).*\1$/.test(t) ? (t[0] === '"' ? "'" + t + "'" : '"' + t + '"') : t; };
  /* Narration is read aloud: no markup, maths or symbols. */
  const speak = (s) => clean(String(s == null ? "" : s).replace(/&/g, " and ").replace(/%/g, " percent").replace(/[→↓]/g, ", then ").replace(/[−–—]/g, ", ")
    .replace(/[$\\`*_#|<>×⁰¹²³⁴⁵⁶⁷⁸⁹⁻≈·∠°σ£€µ★▲[\]{}~^]/g, " ")).replace(/\s+([,.;:!?])/g, "$1").replace(/,\s*,/g, ",");
  const sentence = (s) => { const t = bare(s); return t ? t + "." : ""; };
  const list = (xs) => xs.map((x) => "- " + x).join("\n");
  const BASIS = {
    fictional: ["Fictional example counts, for illustration only; not real data.", "The counts are a fictional example, for illustration only."],
    mixed: ["Starts from fictional example counts and includes the user's edits or recorded outcomes; not purely real data.", "The counts started as a fictional example and include later edits or recorded outcomes, so they are not purely real data."],
    entered: ["Evidence entered by the user.", "The counts are evidence entered by the user."],
  };

  function report(state, V, simV, D, date) {
    const S = state, title = clean(S.title) || "Multi-armed bandit experiment";
    const success = clean(S.success), unit = clean(S.unit);
    const basis = BASIS[S.basis];
    const setup = [
      { title: "The experiment", body: ["**" + md(title) + "**", "", list(["Success: " + (success ? md(success) : "not yet defined"), "Trial unit: " + (unit ? md(unit) : "not yet defined"),
        "Variants: " + V.rows.map((r) => md(r.name)).join(", "), "Completed trials: " + V.rows.reduce((t, r) => t + r.trials, 0), "Evidence: " + basis[0]])].join("\n"),
        narration: "The experiment is " + speak(sentence(title)) + " " + (success ? "A success means: " + speak(sentence(success)) : "Success has not been defined yet.") + " " +
          (unit ? "Each trial is one " + speak(sentence(unit.charAt(0).toLowerCase() + unit.slice(1))) : "") + " It compares " + V.rows.length + " variants. " + basis[1] },
      { title: "Assumptions", body: list(D.assumptions.map(md)),
        narration: "The recommendations assume that each variant has a stable success probability, that trials are comparable, that one success definition applies to every variant, and that every trial costs the same. Outcomes are counted only once they are resolved." },
    ];
    const method = [
      { title: "Thompson Sampling", body: ["Shared prior " + V.priorText + ", applied independently to every variant.", "",
        "$$\\text{posterior} = \\mathrm{Beta}(a+s,\\; b+f), \\qquad \\text{mean} = \\frac{a+s}{a+b+s+f}$$", "",
        "The 95% credible interval runs between the posterior's 0.025 and 0.975 quantiles, computed numerically. Thompson Sampling draws one value from each posterior and recommends the largest; ties go to the first variant in display order."].join("\n"),
        narration: "Thompson Sampling starts every variant from the same prior, " + speak(V.priorText) + ", and adds its successes and failures to get a posterior. It draws one random value from each posterior and recommends the variant with the largest draw. The interval shown is the central 95 percent of each posterior." },
      { title: "UCB1", body: ["$$\\text{score}_i = \\frac{s_i}{n_i} + \\sqrt{\\frac{2 \\ln T}{n_i}}$$", "",
        "$T$ is the total of completed trials across all variants. A variant with no trials is recommended first, in display order, so the logarithm of zero never arises. Ties go to the first variant in display order. The score is not a probability and is not capped at 1."].join("\n"),
        narration: "UCB1 adds an exploration bonus to each variant's observed success rate. The bonus is larger for variants with fewer trials. Any variant with no trials is tried first. The score is not a probability and can exceed one." },
    ];
    const results = [
      { title: "Evidence", body: list(V.rows.map((r) => "**" + md(r.name) + "**: " + r.text.successes + " successes in " + r.text.trials + " trials (" + r.text.rate + "); posterior " + r.text.posterior + ", mean " + r.text.mean + ", 95% interval " + r.text.interval)),
        narration: V.rows.map((r) => speak(bare(r.name)) + " has " + r.text.successes + " successes in " + r.text.trials + " trials, with posterior mean " + speak(r.text.mean) + ".").join(" ") },
      { title: "Scores behind the recommendations", body: list(V.rows.map((r) => "**" + md(r.name) + "**: Thompson sample " + r.text.sample + "; UCB1 score " + md(r.text.ucb))),
        narration: "These are the displayed scores. " + V.rows.map((r) => speak(bare(r.name)) + " drew " + speak(r.text.sample) + " and has a UCB1 score of " + speak(r.text.ucb) + ".").join(" ") },
      { title: "Recommendations", body: list(["Thompson Sampling recommends **" + md(V.ts.name) + "**: " + md(V.ts.why), "UCB1 recommends **" + md(V.ucb.name) + "**: " + md(V.ucb.why)]) + (V.agree ? "\n\nBoth methods recommend the same variant." : "\n\n" + md(V.disagreement)),
        narration: "Thompson Sampling recommends " + speak(bare(V.ts.name)) + ", whose draw of " + speak(V.ts.value) + " is the largest. " +
          (V.ucb.untried ? "UCB1 recommends " + speak(bare(V.ucb.name)) + ", because it has no trials yet." : "UCB1 recommends " + speak(bare(V.ucb.name)) + ", with the highest score, " + speak(V.ucb.value) + ".") + " " +
          (V.agree ? "Both methods agree." : "They disagree, because Thompson follows a random posterior draw while UCB1 adds a fixed exploration bonus.") },
    ];
    if (simV) {
      const names = simV.settings.map((s) => md(s.name) + " " + s.probability).join(", ");
      results.push({ title: "Simulation", body: [simV.progress + " Seed " + simV.seed + "; known success probabilities " + names + "; prior " + V.priorText + ".", "",
        list(simV.methods.map((m) => "**" + m.label + "**: " + m.text.successes + " successes in " + m.text.pulls + " pulls (" + m.text.rate + "); expected regret " + m.text.regret + "; allocation " + m.allocation.map((a, j) => md(simV.settings[j].name) + " " + a.text).join(", "))), "",
        "Expected regret sums the best known probability minus the chosen variant's known probability over the pulls. One seeded run does not show that one method is better."].join("\n"),
        notes: "Simulation rewards come from the known probabilities above, not from the entered evidence; each variant has one shared reward sequence across methods.",
        narration: (simV.partial ? "This simulation is a partial run. " : "") + "With seed " + simV.seed + " and " + simV.methods[0].text.pulls + " pulls per method, " +
          simV.methods.map((m) => speak(m.label) + " collected " + m.text.successes + " successes with expected regret " + m.text.regret).join("; ") + ". One seeded run does not show that one method is better." });
    }
    const first = V.rows[0];
    const checks = [
      { title: "Hand check", body: list([md(first.name) + ": prior " + V.priorText + " plus " + first.successes + " successes and " + first.failures + " failures gives " + first.text.posterior + ", mean " + first.text.mean + ".",
        V.ucb.untried ? "UCB1 recommends an untried variant, so no logarithm of zero is evaluated." : md(V.ucb.name) + ": " + L4(V.rows[V.ucb.index]) ]),
        narration: "A quick check. " + speak(bare(first.name)) + " has " + first.successes + " successes and " + first.failures + " failures, so its posterior mean is " + speak(first.text.mean) + ". Each recorded outcome moves these numbers by exactly one trial." },
      { title: "Next step", key: "Thompson Sampling suggests **" + md(V.ts.name) + "** (sample " + V.ts.value + "); UCB1 suggests **" + md(V.ucb.name) + "** (" + (V.ucb.untried ? "untried" : "score " + V.ucb.value) + ").\n\nChoose one, run one trial, record the resolved outcome, then look again. Neither method declares the experiment finished or a variant conclusively best.",
        notes: "If the success definition or environment changes, start a new experiment rather than mixing evidence.",
        narration: "The next step: choose one recommendation, run a single trial, and record its outcome once it is resolved. Neither method declares the experiment finished or any variant conclusively best." },
    ];
    return {
      meta: { title: front(title), subtitle: "Thompson Sampling and UCB1 recommendations", author: "Multi-armed Bandit tool", date: "Snapshot " + clean(date), voice: VOICE },
      notes: "Exported from https://teoyujie.org/visuals/multi-armed-bandit/. " + basis[0],
      narration: speak(sentence(title)) + " What Thompson Sampling and UCB1 recommend trying next, from the evidence so far.",
      setup, method, results, checks,
    };
  }
  const L4 = (r) => "observed rate " + r.ucb.mean.toFixed(4) + " plus bonus " + r.ucb.bonus.toFixed(4) + " gives score " + r.ucb.score.toFixed(4) + ".";

  return { VOICE, report, speak, md, front };
});
