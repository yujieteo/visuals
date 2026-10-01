/* The everyday-actions page's axes and numbers, and its current view as a beamdswitch report.
 *
 * The page reads its axis definitions, formatters and plotted points from here, and report(DATA,
 * view) turns the dataset and the page's current view ({ x, y, pop, partial, sel, tier, domain,
 * decision }) into the plain-data report that the standard template (beamdswitch.js,
 * `Beamdswitch.deck`) writes as a narrated Markdown deck. So the deck says exactly what the page
 * shows, and every coordinate keeps the source record behind it.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.EverydayReport = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const num = (v) => (v === "" || v == null ? null : Number(v));
  const median = (arr) => { const s = [...arr].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const pct = (v) => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`;
  const fx = (d) => (v) => v.toFixed(d);

  const POPS = { all: "All people 15+, all days", weekday: "All people 15+, weekdays", weekend: "All people 15+, weekends", drm_like: "Employed women 18+ who worked, weekdays (DRM-like)" };
  const POP_IDS = { all: "all", weekday: "weekday", weekend: "weekend", drm_like: "drm-like" };
  const AXES = {
    drm_proportion_reporting: { label: "Share reporting it on a workday", short: "Share reporting (DRM)", src: "drm", metric: "proportion_reporting", fmt: pct, lo: 0, hi: 1, low: "less common", high: "more common" },
    atus_participation: { label: "Share doing it on an average day", short: "Share on an average day (ATUS)", src: "atus", metric: "participation", fmt: pct, lo: 0, hi: 1, low: "less common", high: "more common" },
    drm_mean_hours_per_day: { label: "Mean hours per day, all respondents", short: "Hours per day (DRM)", src: "drm", metric: "mean_hours_per_day", fmt: fx(1), lo: 0, low: "less time", high: "more time" },
    atus_minutes_when_performed: { label: "Minutes per day among people who do it", short: "Minutes when done (ATUS)", src: "atus", metric: "minutes_when_performed", fmt: fx(0), lo: 0, low: "shorter when done", high: "longer when done" },
    drm_positive_affect: { label: "Positive affect while doing it (0–6)", short: "Positive affect (DRM)", src: "drm", metric: "positive_affect", fmt: fx(2), low: "lower positive affect", high: "higher positive affect" },
    drm_net_affect: { label: "Net affect: positive minus negative (transformation)", short: "Net affect (DRM, derived)", src: "drm", metric: "net_affect", fmt: fx(2), low: "lower net affect", high: "higher net affect" },
    drm_negative_affect: { label: "Negative affect while doing it (0–6)", short: "Negative affect (DRM)", src: "drm", metric: "negative_affect", fmt: fx(2), low: "lower negative affect", high: "higher negative affect" },
    drm_tired: { label: "Tired while doing it (0–6)", short: "Tired (DRM)", src: "drm", metric: "tired", fmt: fx(2), low: "less tired", high: "more tired" },
    drm_impatient: { label: "Impatient while doing it (0–6)", short: "Impatient (DRM)", src: "drm", metric: "impatient", fmt: fx(2), low: "less impatient", high: "more impatient" },
    drm_competent: { label: "Competent while doing it (0–6)", short: "Competent (DRM)", src: "drm", metric: "competent", fmt: fx(2), low: "less competent", high: "more competent" },
  };
  const X_KEYS = ["drm_proportion_reporting", "atus_participation", "drm_mean_hours_per_day", "atus_minutes_when_performed", "drm_negative_affect", "drm_tired"];
  const Y_KEYS = ["drm_positive_affect", "drm_net_affect", "drm_negative_affect", "drm_tired", "drm_impatient", "drm_competent", "atus_minutes_when_performed"];
  const PRESETS = [
    { label: "Frequency × positive affect (one study)", x: "drm_proportion_reporting", y: "drm_positive_affect" },
    { label: "National frequency × positive affect (two studies)", x: "atus_participation", y: "drm_positive_affect", pop: "all" },
    { label: "Frequency × time when done (ATUS)", x: "atus_participation", y: "atus_minutes_when_performed", pop: "all" },
    { label: "Negative × positive affect", x: "drm_negative_affect", y: "drm_positive_affect" },
    { label: "Tiredness × positive affect", x: "drm_tired", y: "drm_positive_affect" },
    { label: "Hours per day × positive affect", x: "drm_mean_hours_per_day", y: "drm_positive_affect" },
  ];
  const MIN_POINTS = 8;
  const TIERS = ["daily", "weekly", "monthly", "yearly", "rare"];

  // The column and the source record behind an axis, for the chosen ATUS population.
  const col = (key, pop) => (AXES[key].src === "atus" ? `atus_${AXES[key].metric}_${pop}` : key);
  const measId = (key, id, pop) => (AXES[key].src === "atus" ? `atus:${id}:${AXES[key].metric}:${POP_IDS[pop]}` : `drm:${id}:${AXES[key].metric}`);
  const mixed = (v) => AXES[v.x].src !== AXES[v.y].src;
  function points(DATA, v) {
    return DATA.activities.map((a) => ({ a, x: num(a[col(v.x, v.pop)]), y: num(a[col(v.y, v.pop)]) }))
      .filter((p) => p.x != null && p.y != null)
      .filter((p) => v.partial || !(mixed(v) && p.a.crosswalk_match === "partial"));
  }

  /* Markdown text: characters beamdswitch would read as maths or markup are escaped. */
  const md = (s) => String(s ?? "").replace(/\s+/g, " ").trim().replace(/[\\$*_`|<>[\]]/g, "\\$&");
  /* Narration is read aloud: symbols become words and markup characters are dropped. */
  const say = (s) => String(s ?? "")
    .replace(/(\d)\s?%/g, "$1 percent").replace(/&/g, " and ").replace(/×/g, " by ").replace(/(\d)–(\d)/g, "$1 to $2")
    .replace(/\(0–6\)/g, "").replace(/\bDRM\b/g, "day reconstruction study").replace(/\bATUS\b/g, "time use survey")
    .replace(/\b15\+/g, "15 and over").replace(/\b18\+/g, "18 and over")
    .replace(/[()“”"]/g, "").replace(/[$\\`*_#|<>[\]]/g, " ").replace(/\s+/g, " ").trim();
  // An axis read aloud: its full label without the scale in brackets, e.g. "positive affect while doing it".
  const spoken = (key) => say(AXES[key].label.replace(/\s*\(.*?\)/g, "")).replace(/^\w/, (c) => c.toLowerCase());
  const list = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  function provenance(v, n) {
    const X = AXES[v.x], Y = AXES[v.y], pop = POPS[v.pop];
    if (v.x === v.y) return "Pick two different measures.";
    if (!mixed(v) && X.src === "drm") return `One study, one population. Both axes come from Kahneman et al. (2004), Table 1: 909 employed women on a working day. ${n} activities.`;
    if (!mixed(v)) return `One survey, one population. Both axes are ATUS 2014–2016 estimates for: ${pop}. ${n} activities.`;
    return `Two populations. ${(X.src === "atus" ? X : Y).short} is from ATUS 2014–2016 (${pop}). ${(X.src === "drm" ? X : Y).short} is from 909 employed women in the 2004 DRM study. Hollow points are partial crosswalk matches. ${n} activities.`;
  }

  function report(DATA, view = {}) {
    const v = {
      x: X_KEYS.includes(view.x) ? view.x : "drm_proportion_reporting", y: Y_KEYS.includes(view.y) ? view.y : "drm_positive_affect",
      pop: POPS[view.pop] ? view.pop : "all", partial: view.partial !== false, sel: view.sel || null,
    };
    const X = AXES[v.x], Y = AXES[v.y], SOURCES = DATA.sources;
    const MEAS = new Map(DATA.measurements.map((m) => [m.id, m])), CROSS = new Map(DATA.crosswalk.map((c) => [c.activity_id, c]));
    const pts = v.x === v.y ? [] : points(DATA, v), plotted = pts.length >= MIN_POINTS;
    const usesAtus = X.src === "atus" || Y.src === "atus";
    const srcs = [...new Set([X.src, Y.src])].map((s) => (s === "drm" ? "kahneman2004" : "atus2014_2016"));
    const byY = [...pts].sort((a, b) => b.y - a.y);
    const preset = PRESETS.find((p) => p.x === v.x && p.y === v.y && (!p.pop || p.pop === v.pop));
    const title = `${X.label} by ${Y.label}`;

    const setup = [{
      title: `The chart: ${X.short} against ${Y.short}, ${plural(pts.length, "activity", "activities")}`,
      body: [
        `- Horizontal axis: ${md(X.label)}.`,
        `- Vertical axis: ${md(Y.label)}.`,
        ...(usesAtus ? [`- ATUS population: ${md(POPS[v.pop])}.`] : []),
        ...(mixed(v) ? [`- Partial crosswalk matches: ${v.partial ? "shown, hollow" : "hidden"}.`] : []),
        `- ${md(provenance(v, pts.length))}`,
      ].join("\n"),
      notes: "Population averages describe groups. They are not recommendations for any one person.",
      narration: `Each point is an everyday activity. Across, ${spoken(v.x)}; up, ${spoken(v.y)}. ${mixed(v) ? `The two axes come from two populations: the national time use survey, for ${say(POPS[v.pop]).toLowerCase()}, and 909 employed women in the 2004 day reconstruction study.` : X.src === "drm" ? "Both axes come from one study, 909 employed women describing a working day." : `Both axes are national time use survey estimates for ${say(POPS[v.pop]).toLowerCase()}.`} ${plural(pts.length, "activity has", "activities have")} both measures.`,
    }];

    const method = [{
      title: "Every coordinate is a published table cell or a survey estimate",
      body: [
        ...srcs.map((id) => `- ${md(SOURCES[id].citation)} [Source](${SOURCES[id].url}). ${md(SOURCES[id].design)}`),
        "- Activities are cross-walked between the two surveys; a match is close when the definitions agree, partial when the constructs differ.",
        "- The dashed lines on the chart are the medians of the points shown.",
      ].join("\n"),
      notes: srcs.map((id) => md(SOURCES[id].verification || "")).filter(Boolean).join(" "),
      narration: `${srcs.length > 1 ? "The two sources are" : "The source is"} ${list(srcs.map((id) => id === "kahneman2004" ? "the 2004 day reconstruction study by Kahneman and colleagues, where 909 employed women rebuilt a working day and rated how they felt from 0 to 6" : `the American Time Use Survey microdata for 2014 to 2016, with ${SOURCES.atus2014_2016.n.toLocaleString("en-GB")} respondents`))}. The dashed lines on the chart are the medians of the points shown.`,
    }];

    const results = [];
    if (!plotted) {
      results.push({
        title: v.x === v.y ? "Choose two different measures" : `Only ${pts.length} activities have both measures: too few to plot`,
        body: v.x === v.y ? "The two axes are the same measure, so there is nothing to compare." : `The page plots a chart only when at least ${MIN_POINTS} activities have both measures.`,
        narration: v.x === v.y ? "The two axes are the same measure, so there is nothing to compare." : `Only ${pts.length} activities have both measures, too few to plot.`,
      });
    } else {
      const mx = median(pts.map((p) => p.x)), my = median(pts.map((p) => p.y)), top = byY[0], bottom = byY.at(-1);
      results.push({
        title: `Highest ${Y.short}: ${top.a.activity}, ${Y.fmt(top.y)}; lowest: ${bottom.a.activity}, ${Y.fmt(bottom.y)}`,
        body: [
          `| Activity | ${md(X.short)} | ${md(Y.short)} | Crosswalk |`,
          "| --- | ---: | ---: | --- |",
          ...byY.map((p) => `| ${md(p.a.activity)} | ${X.fmt(p.x)} | ${Y.fmt(p.y)} | ${md(CROSS.get(p.a.activity_id).match)} |`),
        ].join("\n"),
        narration: `Sorted by ${spoken(v.y)}, ${say(top.a.activity)} comes top at ${say(Y.fmt(top.y))}, and ${say(bottom.a.activity)} comes last at ${say(Y.fmt(bottom.y))}.`,
      });
      const quads = [[true, false], [true, true], [false, false], [false, true]].map(([hy, hx]) => ({
        name: `${hy ? Y.high : Y.low} · ${hx ? X.high : X.low}`,
        acts: pts.filter((p) => (p.y >= my) === hy && (p.x >= mx) === hx).map((p) => p.a.activity),
      }));
      results.push({
        title: `Medians split the chart: ${X.short} ${X.fmt(mx)}, ${Y.short} ${Y.fmt(my)}`,
        body: quads.map((q) => `- **${md(q.name)}** (${q.acts.length}): ${q.acts.length ? q.acts.map(md).join(", ") : "none"}`).join("\n"),
        notes: "A point on a median line is counted on the higher side.",
        narration: `The median ${spoken(v.x)} is ${say(X.fmt(mx))}, and the median ${spoken(v.y)} is ${say(Y.fmt(my))}. ${quads.filter((q) => q.acts.length).map((q) => `${plural(q.acts.length, "activity sits", "activities sit")} at ${say(q.name.replace(" · ", " and "))}`).join("; ")}.`,
      });
      const a = DATA.activities.find((r) => r.activity_id === v.sel);
      const sp = a && pts.find((p) => p.a === a);
      if (sp) {
        const trace = [v.x, v.y].map((key) => MEAS.get(measId(key, a.activity_id, v.pop)));
        results.push({
          title: `${a.activity}: ${X.short} ${X.fmt(sp.x)}, ${Y.short} ${Y.fmt(sp.y)}`,
          body: [v.x, v.y].map((key, i) => {
            const m = trace[i];
            return m ? `- **${md(AXES[key].short)} = ${md(AXES[key].fmt(m.value))}**, ${md(m.kind)}. ${md(m.location)}. Population: ${md(m.population)}; n = ${m.n}; ${m.year}. [Source](${SOURCES[m.source].url})` : `- ${md(AXES[key].short)}: no measurement`;
          }).join("\n"),
          notes: md(`Crosswalk: ${CROSS.get(a.activity_id).match} — ${CROSS.get(a.activity_id).note}`),
          narration: `${say(a.activity)} sits at ${say(X.fmt(sp.x))} across and ${say(Y.fmt(sp.y))} up. Each coordinate is one published number, cited on the slide.`,
        });
      }
    }

    const tier = TIERS.includes(view.tier) ? view.tier : "", domain = view.domain || "";
    const decisions = DATA.decisions.filter((d) => (!tier || d.frequency_tier === tier) && (!domain || d.domain === domain));
    const cheap = decisions.filter((d) => d.reversibility >= 4 && d.time_sensitivity >= 4);
    const tested = decisions.filter((d) => d.evidence.length);
    results.push({
      title: `A regret frontier: ${plural(decisions.length, "action", "actions")}, ${cheap.length} both reversible and time-limited`,
      body: [
        `- Filters: ${tier ? md(tier[0].toUpperCase() + tier.slice(1)) : "every frequency"} · ${domain ? md(domain[0].toUpperCase() + domain.slice(1)) : "all domains"}.`,
        `- Reversibility 4 or 5 and time sensitivity 4 or 5: ${cheap.length ? cheap.map((d) => md(d.action)).join("; ") : "none"}.`,
        `- ${tested.length} of these ${decisions.length} have an experiment behind them.`,
        "- **These positions are authored codes on 1–5 scales, not measurements.**",
      ].join("\n"),
      narration: `The second chart places ${plural(decisions.length, "action", "actions")} by how easily they can be undone and whether the chance to act closes soon. These are authored codes, not measurements. ${cheap.length ? `${plural(cheap.length, "action is", "actions are")} both reversible and time-limited, the cheapest experiments to run.` : "None is both reversible and time-limited."}`,
    });
    const d = DATA.decisions.find((r) => r.id === view.decision);
    if (d) {
      results.push({
        title: `${d.action}: authored codes`,
        body: [
          `- Reversibility ${d.reversibility} · time sensitivity ${d.time_sensitivity} · downside ${d.downside} · upside ${d.upside} · information ${d.information} (1–5).`,
          ...d.evidence.filter((k) => SOURCES[k]).map((k) => `- Evidence: ${md(SOURCES[k].citation)} [Source](${SOURCES[k].url})`),
        ].join("\n"),
        narration: `${say(d.action)} is coded ${d.reversibility} for reversibility, ${d.time_sensitivity} for time sensitivity, ${d.downside} for downside, ${d.upside} for upside and ${d.information} for information, each on a scale of 1 to 5.`,
      });
    }

    const traced = pts.filter((p) => MEAS.has(measId(v.x, p.a.activity_id, v.pop)) && MEAS.has(measId(v.y, p.a.activity_id, v.pop)));
    const partial = pts.filter((p) => mixed(v) && p.a.crosswalk_match === "partial").length;
    const checks = [{
      title: `Every plotted number has a source record: ${traced.length} of ${pts.length} points`,
      body: [
        `- ${traced.length} of ${pts.length} points have a measurement record for both coordinates, with its table cell or survey estimate, population, sample size and year.`,
        ...(mixed(v) ? [`- ${plural(partial, "point is a partial crosswalk match", "points are partial crosswalk matches")}${v.partial ? ", drawn hollow" : ", hidden"}.`] : []),
        "- Affect ratings stay on their original 0–6 scales; nothing is rescaled.",
      ].join("\n"),
      narration: `${traced.length === pts.length ? `Every one of the ${pts.length} plotted points traces` : `${traced.length} of the ${pts.length} plotted points trace`} both coordinates to a source record, with its table cell or survey estimate, population, sample size and year. Affect ratings stay on their original 0 to 6 scales.`,
    }, {
      title: "Takeaway",
      key: plotted
        ? `${md(byY[0].a.activity)} has the highest ${md(Y.label.replace(/\s*\(.*?\)/g, "").toLowerCase())} (${Y.fmt(byY[0].y)}) and ${md(byY.at(-1).a.activity)} the lowest (${Y.fmt(byY.at(-1).y)}). Population averages describe groups; they are not recommendations for any one person.`
        : "Choose two different measures with enough activities to compare. Population averages describe groups; they are not recommendations for any one person.",
      narration: plotted
        ? `${say(byY[0].a.activity)} has the highest ${spoken(v.y)}, and ${say(byY.at(-1).a.activity)} the lowest. But population averages describe groups. They are not recommendations for any one person.`
        : "Population averages describe groups. They are not recommendations for any one person.",
    }];

    return {
      meta: { title: `Everyday activities: ${title}`, subtitle: preset ? preset.label : provenance(v, pts.length).split(". ")[0], date: srcs.map((id) => `${SOURCES[id].year}`).join(" and ") },
      narration: `This talk places everyday activities by published measurements: ${spoken(v.x)}, against ${spoken(v.y)}. Every number is a published table cell or survey estimate.`,
      setup, method, results, checks,
    };
  }

  return { num, median, pct, fx, POPS, POP_IDS, AXES, X_KEYS, Y_KEYS, PRESETS, MIN_POINTS, TIERS, col, measId, mixed, points, provenance, report };
});
