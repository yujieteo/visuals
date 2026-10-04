/* Good food in Ubi, Hougang, Woodleigh, Paya Lebar and Eunos: the report adapter. This file is the visual's own:
 * report(state, derived, data) turns the current view into the plain-data report that the site's beamdswitch
 * template (beamdswitch.js, Beamdswitch.deck) writes as a narrated deck, and that the kit writes as the Markdown
 * record (§14, §15). It reads only the state, the values Model.derive gives for it and the dataset, so the deck and
 * the page never disagree. The page uses the same formatters. Narration is plain spoken prose: no markup or symbols.
 */
/** @param {any} root the global object @param {() => any} factory */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Report = api;
})(/** @type {any} */ (typeof self !== "undefined" ? self : this), function () {
  "use strict";

  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  /** An ISO date as the page shows it, such as 4 Oct 2026, the same in every time zone. @param {string} iso */
  const fmtDate = (iso) => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${MONTHS[m - 1].slice(0, 3)} ${y}`; };
  /** An ISO date as it is read aloud, such as 4 October 2026. @param {string} iso */
  const sayDate = (iso) => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
  /** @param {number} n @param {string} one @param {string} many */
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  /** @param {string[]} xs */
  const list = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
  /** @param {any} o */
  const kcalOf = (o) => (o.nutrition.status === "not_estimable" ? null : o.nutrition.energy_kcal);

  /** The calorie estimate of a dish in words, with its reference and source. @param {any} n */
  function nutritionText(n) {
    if (n.status === "not_estimable") return `Not estimable. ${n.reason}`;
    const source = n.source === "yeo2021" ? "Yeo et al. (2021), measured in Singapore" : "USDA FoodData Central (FNDDS), a U.S. recipe";
    const label = n.status === "approximate" ? " (approximate: based on a generic equivalent)" : " (estimate)";
    return `About ${n.energy_kcal} kcal${label}: ${n.carbohydrate_g} g carbohydrate, ${n.protein_g} g protein, ${n.fat_g} g fat. Reference: ${n.reference}, ${n.match}; ${n.portion}. Source: ${source}.${n.note ? " " + n.note : ""}`;
  }

  /** Markdown text: characters beamdswitch would read as maths or markup are escaped. @param {unknown} s */
  const md = (s) => String(s ?? "").replace(/\s+/g, " ").trim().replace(/[\\$*_`|<>[\]]/g, "\\$&");
  /** Narration is read aloud: symbols become words and markup characters are dropped. @param {unknown} s */
  const say = (s) => String(s ?? "")
    .replace(/(\d)\s?%/g, "$1 percent").replace(/&/g, " and ").replace(/×/g, " times ").replace(/≈/g, "about ")
    .replace(/\bkcal\b/g, "kilocalories").replace(/(\d)\s?g\b/g, "$1 grams").replace(/#(\d+)/g, "number $1")
    .replace(/[“”"]/g, "").replace(/[$\\`*_#|<>[\]]/g, " ").replace(/\s+/g, " ").trim();

  /**
   * @param {Record<string, any>} state
   * @param {any} d the values Model.derive returns for the state
   * @param {any} data the dataset
   */
  function report(state, d, data) {
    /** @type {Record<string, any>} */
    const AREA = Object.fromEntries(data.areas.map((/** @type {any} */ a) => [a.id, a]));
    /** @type {Record<string, any>} */
    const GUIDE = Object.fromEntries(data.sources.guides.map((/** @type {any} */ g) => [g.id, g]));
    /** @type {Record<string, any>} */
    const CHECK = Object.fromEntries(data.sources.directories.map((/** @type {any} */ c) => [c.id, c]));
    const shown = d.shown, first = shown[0];
    const scope = d.text.scope;
    const used = data.sources.guides.filter((/** @type {any} */ g) => g.used_in_top);
    const publishers = new Set(used.map((/** @type {any} */ g) => g.publisher)).size;
    const estimated = shown.filter((/** @type {any} */ o) => kcalOf(o) !== null);

    const setup = [{
      title: `The list: ${d.text.count}, ${scope}`,
      body: [
        `- ${data.outlets.length} places, ranked, within 1 km of ${data.areas.reduce((/** @type {number} */ n, /** @type {any} */ a) => n + a.stations.length, 0)} MRT stations in ${data.areas.length} areas: ${data.areas.map((/** @type {any} */ a) => md(a.label)).join(", ")}.`,
        `- ${used.length} food guides from ${publishers} publishers.`,
        `- Showing ${md(d.text.count)} · ${md(scope)}.`,
        `- ${d.estimated} of these dishes have a calorie figure (${d.approximate} approximate, ${d.notEstimable.length} not estimable).`,
        `- Every page was read on ${fmtDate(data.as_of)}. Places open and close, so check before you go.`,
      ].join("\n"),
      narration: `The list holds the ${data.outlets.length} places food writers recommend most around ${list(data.areas.map((/** @type {any} */ a) => say(a.label)))}, from ${used.length} food guides by ${publishers} publishers. This talk covers ${shown.length} of them: ${say(scope)}. Every page was read on ${sayDate(data.as_of)}.`,
    }, {
      title: "The five areas, one map each",
      body: [
        "| Area | Stations | In the top 100 | Closed | Unverified |",
        "| --- | --- | ---: | ---: | ---: |",
        ...data.areas.map((/** @type {any} */ a) => `| ${md(a.label)} | ${md(a.stations.join(", "))} | ${a.in_top} | ${a.closed} | ${a.unverified} |`),
      ].join("\n"),
      notes: "The page draws an overview map of all five areas and one map for each area, because places in one food centre overlap on the overview.",
      narration: `${list(data.areas.map((/** @type {any} */ a) => `${say(a.label)} has ${a.in_top}`))} of the top ${data.outlets.length}. The page draws one overview map and one map for each area, so places in the same food centre stay apart.`,
    }];

    const method = [{
      title: "Ranked by how many independent publishers recommend each place",
      body: data.method.map((/** @type {string} */ t) => `- ${md(t)}`).join("\n"),
      narration: "A place needs at least two different publishers to be a candidate. Rank is by the number of distinct publishers, then the number of guides, then the most recent guide. Google ratings could not be retrieved, so the ranking measures how often writers recommend a place, not how it tastes.",
    }, {
      title: "Calories: an estimate for a reference dish, split by macronutrient",
      body: [
        ...data.calorie_method.map((/** @type {string} */ t) => `- ${md(t)}`),
        "",
        "$$ E_{\\text{carbohydrate}} = 4\\,C, \\quad E_{\\text{protein}} = 4\\,P, \\quad E_{\\text{fat}} = 9\\,F \\quad \\text{(kcal, with } C, P, F \\text{ in g)} $$",
      ].join("\n"),
      narration: "Each calorie figure is an estimate for a reference dish, measured in Singapore by Yeo and colleagues in 2021 where possible, otherwise the closest United States survey recipe. Energy is split into carbohydrate, protein and fat at 4, 4 and 9 kilocalories per gram. Shared plates and dishes with no fixed portion are marked not estimable rather than guessed.",
    }];

    const results = [];
    if (!first) {
      results.push({
        title: `No places match: ${scope}`,
        body: "No places match. Choose another area or cuisine, show more of the top 100, or lower the number of publishers.",
        narration: `No place in the top ${state.top} matches ${say(scope)}.`,
      });
    } else {
      const top = shown.slice(0, 10);
      results.push({
        title: `Most recommended: ${first.rank}. ${first.name}, ${plural(first.publishers, "publisher", "publishers")}`,
        body: [
          "| Rank | Place | Signature dish | Where | Publishers | Calories |",
          "| ---: | --- | --- | --- | ---: | --- |",
          ...top.map((/** @type {any} */ o) => `| ${o.rank} | ${md(o.name)} | ${md(o.dish)} | ${md([AREA[o.area].label, o.venue, o.unit].filter(Boolean).join(" · "))} | ${o.publishers} | ${kcalOf(o) === null ? "not estimable" : `≈${kcalOf(o)} kcal`} |`),
        ].join("\n"),
        notes: shown.length > top.length ? `The page lists all ${shown.length}; the deck shows the first ${top.length}.` : "",
        narration: `The most recommended is ${say(first.name)} in ${say(AREA[first.area].label)}, named by ${plural(first.publishers, "publisher", "publishers")}, for its ${say(first.dish)}.${top.length > 1 ? ` Next come ${list(top.slice(1, 3).map((/** @type {any} */ o) => say(o.name)))}.` : ""}`,
      });
      if (d.bars.length) {
        const lead = d.bars[0], n = lead.nutrition, byRank = state.sort === "rank";
        results.push({
          title: byRank ? `Calories in list order: ${lead.rank}. ${lead.dish}, about ${n.energy_kcal} kcal` : `Most energy: ${lead.dish} at ${lead.name}, about ${n.energy_kcal} kcal`,
          body: [
            "| Rank | Dish | Place | kcal | Carbohydrate g | Protein g | Fat g |",
            "| ---: | --- | --- | ---: | ---: | ---: | ---: |",
            ...d.bars.slice(0, 8).map((/** @type {any} */ o) => `| ${o.rank} | ${md(o.dish)} | ${md(o.name)} | ${o.nutrition.energy_kcal} | ${o.nutrition.carbohydrate_g} | ${o.nutrition.protein_g} | ${o.nutrition.fat_g} |`),
          ].join("\n"),
          notes: md(nutritionText(n)),
          narration: `${byRank ? `In list order, the first estimated dish is ${say(lead.dish)}` : `The signature dish with the most energy is ${say(lead.dish)}`} at ${say(lead.name)}: about ${n.energy_kcal} kilocalories, with ${n.carbohydrate_g} grams of carbohydrate, ${n.protein_g} grams of protein and ${n.fat_g} grams of fat.${d.kcalRange && estimated.length > 1 ? ` Across the ${estimated.length} estimated dishes, energy runs from ${d.kcalRange[0]} to ${d.kcalRange[1]} kilocalories.` : ""}`,
        });
      }
      if (d.notEstimable.length) {
        const ne = d.notEstimable;
        results.push({
          title: `Not estimable: ${plural(ne.length, "dish", "dishes")} with no fixed portion or reference`,
          body: ne.map((/** @type {any} */ o) => `- **${o.rank}. ${md(o.name)}** · ${md(o.dish)}: ${md(o.nutrition.reason)}`).join("\n"),
          narration: `${ne.length === 1 ? "One dish has" : `${ne.length} dishes have`} no fixed portion or no reference, so ${ne.length === 1 ? "it is" : "they are"} marked not estimable rather than guessed: ${list(ne.slice(0, 6).map((/** @type {any} */ o) => say(o.name)))}${ne.length > 6 ? ", and others" : ""}.`,
        });
      }
      const open = d.opened;
      if (open && kcalOf(open) !== null) {
        const n = open.nutrition;
        results.push({
          title: `${open.rank}. ${open.name}: ${open.dish}, about ${n.energy_kcal} kcal`,
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

    const listed = shown.filter((/** @type {any} */ o) => o.presence.checked_by !== "guides");
    const byGuides = shown.length - listed.length;
    const closed = data.excluded.filter((/** @type {any} */ o) => o.status === "closed").length;
    const unverified = data.excluded.length - closed;
    const checks = [{
      title: `Still there: ${listed.length} found in a mall directory, ${byGuides} dated by the guides`,
      body: [
        `- ${listed.length} of ${shown.length} places are listed in their mall's directory: ${md(data.sources.directories.map((/** @type {any} */ c) => c.mall).join(", "))}, read on ${fmtDate(data.as_of)}.`,
        `- ${byGuides} are in hawker centres, coffee shops or shophouses with no directory, and a guide named each of them in ${data.recent.slice(0, 4)} or later.`,
        `- Left out: ${closed} recommended places that have closed, and ${unverified} that no guide has named since ${data.recent.slice(0, 4)}.`,
        ...(first ? [`- Dish named by: ${md(GUIDE[first.dish_named_by].publisher)}, ${fmtDate(GUIDE[first.dish_named_by].published)} (for rank ${first.rank}).`] : []),
        ...(listed[0] ? [`- Directory check, for example: ${md(listed[0].name)} in ${md(CHECK[listed[0].presence.checked_by].publisher)}'s directory.`] : []),
      ].join("\n"),
      narration: `Each place was checked. ${plural(listed.length, "place is", "places are")} listed in a mall's directory, and ${plural(byGuides, "place relies", "places rely")} on a guide from ${data.recent.slice(0, 4)} or later. ${closed} recommended places are left out because they have closed, and ${unverified} because no recent guide names them.`,
    }, {
      title: "Takeaway",
      key: first
        ? `${first.rank}. ${md(first.name)} (${md(first.dish)}, ${kcalOf(first) === null ? "not estimable" : `≈${kcalOf(first)} kcal`}) is the most recommended of ${shown.length} places, ${md(scope)}. Calories are estimates for a reference dish; places open and close, so check before you go.`
        : `No place in the top ${state.top} matches ${md(scope)}. Change a filter to see more places.`,
      narration: first
        ? `${say(first.name)} is the most recommended of these ${shown.length} places. Every calorie figure is an estimate for a reference dish, and places open and close, so check before you go.`
        : "No place matches this selection. Change a filter to see more places.",
    }];

    return {
      meta: {
        title: "Good food in Ubi, Hougang, Woodleigh, Paya Lebar and Eunos",
        subtitle: `${d.text.count}: ${scope}`,
        date: `As of ${fmtDate(data.as_of)}`,
        voice: "bf_emma",
      },
      narration: `This talk ranks the places food writers recommend most around Ubi, Hougang, Woodleigh, Paya Lebar and Eunos, by how many independent publishers name them, with a calorie estimate for each signature dish. It covers ${say(scope)}.`,
      setup, method, results, checks,
    };
  }

  return { fmtDate, sayDate, plural, list, nutritionText, report };
});
