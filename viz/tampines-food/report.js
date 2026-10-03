/* The Tampines food page's numbers as a beamdswitch report.
 *
 * report(D, view) turns the dataset and the page's current view ({ cuisine, mall, sort, open }) into
 * the plain-data report that the standard template (beamdswitch.js, `Beamdswitch.deck`) writes as a
 * narrated Markdown deck. Every number comes from the dataset, formatted as the page shows it; the
 * page uses the same formatters, so the deck and the page cannot drift apart.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TampinesReport = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const fmtDate = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" });
  const sayDate = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const kcalOf = (o) => (o.nutrition.status === "estimate" || o.nutrition.status === "approximate" ? o.nutrition.energy_kcal : null);
  function nutritionText(n) {
    if (n.status === "not_estimable") return `Not estimable. ${n.reason}`;
    const source = n.source === "yeo2021" ? "Yeo et al. (2021), measured in Singapore" : "USDA FoodData Central (FNDDS), a U.S. recipe";
    const label = n.status === "approximate" ? " (approximate: based on a generic equivalent)" : " (estimate)";
    return `About ${n.energy_kcal} kcal${label}: ${n.carbohydrate_g} g carbohydrate, ${n.protein_g} g protein, ${n.fat_g} g fat. Reference: ${n.reference}, ${n.match}; ${n.portion}. Source: ${source}.${n.note ? " " + n.note : ""}`;
  }

  /* Markdown text: characters beamdswitch would read as maths or markup are escaped. */
  const md = (s) => String(s ?? "").replace(/\s+/g, " ").trim().replace(/[\\$*_`|<>[\]]/g, "\\$&");
  /* Narration is read aloud: symbols become words and markup characters are dropped. */
  const say = (s) => String(s ?? "")
    .replace(/(\d)\s?%/g, "$1 percent").replace(/&/g, " and ").replace(/×/g, " times ").replace(/≈/g, "about ")
    .replace(/\bkcal\b/g, "kilocalories").replace(/(\d)\s?g\b/g, "$1 grams").replace(/#(\d+)/g, "number $1")
    .replace(/[“”"]/g, "").replace(/[$\\`*_#|<>[\]]/g, " ").replace(/\s+/g, " ").trim();
  const list = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

  function report(D, view = {}) {
    const CUISINE = Object.fromEntries(D.cuisines.map((c) => [c.id, c.label]));
    const MALL = Object.fromEntries(D.malls.map((m) => [m.id, m]));
    const GUIDE = Object.fromEntries(D.sources.guides.map((g) => [g.id, g]));
    const DIRECTORY = Object.fromEntries(D.sources.directories.map((d) => [d.id, d]));
    const cuisine = CUISINE[view.cuisine] ? view.cuisine : null, mall = MALL[view.mall] ? view.mall : null;
    const shown = D.outlets.filter((o) => (!cuisine || o.cuisine === cuisine) && (!mall || o.mall === mall));
    const scope = [cuisine && CUISINE[cuisine], mall && MALL[mall].name].filter(Boolean);
    const scopeText = scope.length ? scope.join(" · ") : "every cuisine and mall";
    const scopeSaid = scope.length ? `${cuisine ? say(CUISINE[cuisine]) + " places" : "places"}${mall ? " in " + MALL[mall].name : ""}` : "places across every cuisine and mall";
    const estimated = shown.filter((o) => kcalOf(o) != null), notEstimable = shown.filter((o) => kcalOf(o) == null);
    const byRank = view.sort === "rank";
    const bars = [...estimated].sort(byRank ? (a, b) => a.rank - b.rank : (a, b) => kcalOf(b) - kcalOf(a) || a.rank - b.rank);
    const guides = D.sources.guides.filter((g) => g.used_in_top), publishers = new Set(guides.map((g) => g.publisher));
    const approximate = shown.filter((o) => o.nutrition.status === "approximate").length;
    const first = shown[0];

    const setup = [{
      title: `The list: ${shown.length} of ${D.outlets.length} places, ${scopeText}`,
      body: [
        `- ${D.outlets.length} places, ranked, across ${D.malls.length} malls: ${D.malls.map((m) => md(m.name)).join(", ")}.`,
        `- ${guides.length} food guides from ${publishers.size} publishers.`,
        `- Showing ${shown.length} of ${D.outlets.length} · ${md(scopeText)}.`,
        `- ${estimated.length} of these dishes have a calorie figure (${approximate} approximate, ${notEstimable.length} not estimable).`,
        `- Every page was read on ${fmtDate(D.as_of)}. Outlets open and close, so check before you go.`,
      ].join("\n"),
      narration: `The list holds the ${D.outlets.length} places food writers recommend most across ${list(D.malls.map((m) => m.name))}, drawn from ${guides.length} food guides by ${publishers.size} publishers. This talk covers ${shown.length} of them: ${scopeSaid}. Every page was read on ${sayDate(D.as_of)}.`,
    }, {
      title: "What each mall offers",
      body: [
        "| Mall | In the top 50 | Food and drink outlets in its directory |",
        "| --- | ---: | --- |",
        ...D.malls.map((m) => `| ${md(m.name)} | ${m.in_top} | ${m.directory ? `${m.fnb_listings}, ${md(DIRECTORY[m.directory].publisher)} directory, ${fmtDate(DIRECTORY[m.directory].retrieved)}` : "no official directory found"} |`),
      ].join("\n"),
      narration: `${list(D.malls.map((m) => `${m.name} has ${m.in_top}`))} of the top 50. ${list(D.malls.filter((m) => m.directory).map((m) => `${m.name} lists ${m.fnb_listings}`))} food and drink outlets in its own directory${D.malls.some((m) => !m.directory) ? `; ${list(D.malls.filter((m) => !m.directory).map((m) => m.name))} has no official directory` : ""}.`,
    }];

    const method = [{
      title: "Ranked by how many independent publishers recommend each place",
      body: D.method.map((t) => `- ${md(t)}`).join("\n"),
      narration: "A place needs at least two different publishers to be a candidate. Rank is by the number of distinct publishers, then the number of guides, then the most recent guide. Google ratings could not be retrieved, so the ranking measures how often writers recommend a place, not how it tastes.",
    }, {
      title: "Calories: an estimate for a reference dish, split by macronutrient",
      body: [
        ...D.calorie_method.map((t) => `- ${md(t)}`),
        "",
        "$$ E_{\\text{carbohydrate}} = 4\\,C, \\quad E_{\\text{protein}} = 4\\,P, \\quad E_{\\text{fat}} = 9\\,F \\quad \\text{(kcal, with } C, P, F \\text{ in g)} $$",
      ].join("\n"),
      narration: "Each calorie figure is an estimate for a reference dish, measured in Singapore by Yeo and colleagues in 2021 where possible, otherwise the closest United States survey recipe. Energy is split into carbohydrate, protein and fat at 4, 4 and 9 kilocalories per gram. Buffets and shared plates are marked not estimable rather than guessed.",
    }];

    const results = [];
    if (!shown.length) {
      results.push({
        title: `No places match: ${scopeText}`,
        body: "No places match. Clear a filter to see more.",
        narration: `No place in the top ${D.outlets.length} matches ${scopeSaid}.`,
      });
    } else {
      const top = shown.slice(0, 10);
      results.push({
        title: `Most recommended: #${first.rank} ${first.name}, ${plural(first.publishers, "publisher", "publishers")}`,
        body: [
          "| # | Place | Signature dish | Where | Publishers | Calories |",
          "| ---: | --- | --- | --- | ---: | --- |",
          ...top.map((o) => `| ${o.rank} | ${md(o.name)} | ${md(o.dish)} | ${md([o.venue.includes(MALL[o.mall].name) ? null : MALL[o.mall].name, o.venue, o.unit].filter(Boolean).join(" · "))} | ${o.publishers} | ${kcalOf(o) == null ? "not estimable" : `≈${kcalOf(o)} kcal`} |`),
        ].join("\n"),
        notes: shown.length > top.length ? `The page lists all ${shown.length}; the deck shows the first ${top.length}.` : "",
        narration: `The most recommended is ${say(first.name)} in ${MALL[first.mall].name}, named by ${plural(first.publishers, "publisher", "publishers")}, for its ${say(first.dish)}.${top.length > 1 ? ` Next come ${list(top.slice(1, 3).map((o) => say(o.name)))}.` : ""}`,
      });
      if (bars.length) {
        const lead = bars[0], n = lead.nutrition;
        results.push({
          title: byRank ? `Calories by list rank: #${lead.rank} ${lead.dish}, about ${n.energy_kcal} kcal` : `Most energy: ${lead.dish} at ${lead.name}, about ${n.energy_kcal} kcal`,
          body: [
            "| # | Dish | Place | kcal | Carbohydrate g | Protein g | Fat g |",
            "| ---: | --- | --- | ---: | ---: | ---: | ---: |",
            ...bars.slice(0, 8).map((o) => `| ${o.rank} | ${md(o.dish)} | ${md(o.name)} | ${o.nutrition.energy_kcal} | ${o.nutrition.carbohydrate_g} | ${o.nutrition.protein_g} | ${o.nutrition.fat_g} |`),
          ].join("\n"),
          notes: md(nutritionText(n)),
          narration: `${byRank ? `In list order, the first estimated dish is ${say(lead.dish)}` : `The most energy-dense signature dish is ${say(lead.dish)}`} at ${say(lead.name)}: about ${n.energy_kcal} kilocalories, with ${n.carbohydrate_g} grams of carbohydrate, ${n.protein_g} grams of protein and ${n.fat_g} grams of fat.${estimated.length > 1 ? ` Across the ${estimated.length} estimated dishes, energy runs from ${Math.min(...estimated.map(kcalOf))} to ${Math.max(...estimated.map(kcalOf))} kilocalories.` : ""}`,
        });
      }
      if (notEstimable.length) {
        results.push({
          title: `Not estimable: ${plural(notEstimable.length, "dish", "dishes")} with no fixed portion`,
          body: notEstimable.map((o) => `- **#${o.rank} ${md(o.name)}** · ${md(o.dish)}: ${md(o.nutrition.reason)}`).join("\n"),
          narration: `${notEstimable.length === 1 ? "One dish has" : `${notEstimable.length} dishes have`} no fixed portion and ${notEstimable.length === 1 ? "is" : "are"} marked not estimable rather than guessed: ${list(notEstimable.map((o) => say(o.name)))}.`,
        });
      }
      const open = shown.find((o) => o.id === view.open && kcalOf(o) != null);
      if (open) {
        const n = open.nutrition;
        results.push({
          title: `#${open.rank} ${open.name}: ${open.dish}, about ${n.energy_kcal} kcal`,
          body: [
            "| Macronutrient | Grams | kcal at 4, 4 and 9 kcal/g |",
            "| --- | ---: | ---: |",
            ...[["Carbohydrate", "carbohydrate"], ["Protein", "protein"], ["Fat", "fat"]].map(([label, k]) => `| ${label} | ${n[k + "_g"]} | ${n.kcal_from[k]} |`),
            "",
            md(nutritionText(n)),
          ].join("\n"),
          narration: `${say(open.dish)} at ${say(open.name)} comes to about ${n.energy_kcal} kilocalories: ${n.kcal_from.carbohydrate} from carbohydrate, ${n.kcal_from.protein} from protein and ${n.kcal_from.fat} from fat.`,
        });
      }
    }

    const listed = shown.filter((o) => o.presence.checked_by !== "guides"), byGuides = shown.length - listed.length;
    const checks = [{
      title: `Still there: ${listed.length} found in a mall directory, ${byGuides} dated by the guides`,
      body: [
        `- ${listed.length} of ${shown.length} places are listed in their mall's official directory on ${fmtDate(D.as_of)}.`,
        `- ${byGuides} rely on the most recent guide naming them, because no official directory could be found.`,
        `- Recommended but no longer there, so left out: ${D.excluded.length ? D.excluded.map((o) => md(o.name)).join(", ") : "none"}.`,
        ...(shown[0] ? [`- Dish named by: ${md(GUIDE[shown[0].dish_named_by].publisher)}, ${fmtDate(GUIDE[shown[0].dish_named_by].published)} (for #${shown[0].rank}).`] : []),
      ].join("\n"),
      narration: `Each place was checked. ${plural(listed.length, "place is", "places are")} listed in a mall's own directory, and ${plural(byGuides, "place relies", "places rely")} on the date of the latest guide naming it. ${plural(D.excluded.length, "recommended place is", "recommended places are")} left out because they are no longer there.`,
    }, {
      title: "Takeaway",
      key: shown.length
        ? `#${first.rank} ${md(first.name)} (${md(first.dish)}, ${kcalOf(first) == null ? "not estimable" : `≈${kcalOf(first)} kcal`}) is the most recommended of ${shown.length} places, ${md(scopeText)}. Calories are estimates for a reference dish; outlets open and close, so check before you go.`
        : `No place in the top ${D.outlets.length} matches ${md(scopeText)}. Clear a filter to see more.`,
      narration: shown.length
        ? `${say(first.name)} is the most recommended of these ${shown.length} places. Remember that every calorie figure is an estimate for a reference dish, and that outlets open and close, so check before you go.`
        : "No place matches this selection. Clear a filter to see more.",
    }];

    return {
      meta: {
        title: `Good food in Tampines${scope.length ? ": " + scope.join(", ") : ""}`,
        subtitle: `${shown.length} of the ${D.outlets.length} places food writers recommend most, ranked by publishers`,
        date: `As of ${fmtDate(D.as_of)}`,
      },
      narration: `This talk ranks the places food writers recommend most in Tampines, by how many independent publishers name them, with a calorie estimate for each signature dish in kilocalories. It covers ${scopeSaid}.`,
      setup, method, results, checks,
    };
  }

  return { fmtDate, sayDate, plural, kcalOf, nutritionText, report };
});
