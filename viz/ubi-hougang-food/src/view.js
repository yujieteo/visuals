/* Good food in Ubi, Hougang, Woodleigh, Paya Lebar and Eunos: the views. This file is the visual's own: it draws the
 * page from the state (§5) and adds the domain's WebMCP tools and palette commands. The kit (VisualKit.start) owns
 * the state, the URL, Back and Forward, Reset, the JSON, Markdown and beamdswitch exports, the command palette and
 * the shared WebMCP tools. The filters, the slider and the sort buttons name their state field (data-field), so
 * the kit connects them.
 */
(function () {
  "use strict";

  const D = JSON.parse(/** @type {HTMLElement} */ (document.getElementById("dataset")).textContent ?? "{}");
  const SVG = "http://www.w3.org/2000/svg";
  /** @param {string} id @returns {any} */
  const $ = (id) => document.getElementById(id);
  /** @type {Record<string, string>} */
  const CUISINE = Object.fromEntries(D.cuisines.map((/** @type {any} */ c) => [c.id, c.label]));
  /** @type {Record<string, any>} */
  const AREA = Object.fromEntries(D.areas.map((/** @type {any} */ a) => [a.id, a]));
  /** @type {Record<string, any>} */
  const GUIDE = Object.fromEntries(D.sources.guides.map((/** @type {any} */ g) => [g.id, g]));
  /** @type {Record<string, any>} */
  const CHECK = Object.fromEntries([...D.sources.directories, ...D.sources.notices].map((/** @type {any} */ d) => [d.id, d]));
  /** @type {Record<string, any>} */
  const OUTLET = Object.fromEntries(D.outlets.map((/** @type {any} */ o) => [o.id, o]));
  const LAYERS = [["park", "m-park"], ["water", "m-water"], ["waterway", "m-waterway"], ["road_minor", "m-road-minor"],
    ["road_major", "m-road-major"], ["rail_tunnel", "m-rail-tunnel"], ["rail", "m-rail"]];

  /**
   * An element with attributes and children; text children become text nodes.
   * @param {string} tag @param {Record<string, string | number | boolean>} [attrs] @param {...(Node | string)} kids
   */
  function h(tag, attrs = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) if (v !== false) el.setAttribute(k, v === true ? "" : String(v));
    el.append(...kids);
    return el;
  }
  /** An SVG element with attributes; colours come from CSS classes. @param {string} tag @param {Record<string, string | number>} attrs @param {string} [text] */
  function s(tag, attrs, text) {
    const el = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    if (text !== undefined) el.textContent = text;
    return el;
  }
  /** @param {string} url @param {string} text */
  const link = (url, text) => (url ? h("a", { href: url, rel: "noopener" }, text) : document.createTextNode(text));
  /** @param {string} iso */
  const fmtDate = (iso) => Report.fmtDate(iso);
  /** @param {any} o */
  const where = (o) => [o.venue, o.unit].filter(Boolean).join(" · ") || o.address;

  /* ---------- static parts, drawn once from the dataset ---------- */

  /** The base of one map view: land use, water, roads, rail, stations, road names and a 200 m scale bar. @param {any} v */
  function baseMap(v) {
    const svg = s("svg", { viewBox: `0 0 ${v.w} ${v.h}`, role: "img", "aria-labelledby": `map-${v.id}-cap` });
    for (const [key, cls] of LAYERS) if (v.layers[key]) svg.append(s("path", { class: cls, d: v.layers[key] }));
    for (const r of v.road_labels) svg.append(s("text", { class: "m-road-label", x: r.x, y: r.y, "text-anchor": "middle", transform: `rotate(${r.a} ${r.x} ${r.y})` }, r.t));
    for (const st of v.stations) {
      svg.append(s("circle", { class: "m-station", cx: st.x, cy: st.y, r: 9 }));
      svg.append(s("text", { class: "m-station-label", x: st.x + 14, y: st.y - 12 }, st.name));
    }
    const bar = Math.round(v.m100 * 2), y = v.h - 24;
    svg.append(s("line", { class: "m-scale", x1: 24, x2: 24 + bar, y1: y, y2: y }));
    svg.append(s("text", { class: "m-scale-label", x: 24, y: y - 8 }, "200 m"));
    const markers = s("g", { class: "m-markers" });
    svg.append(markers);
    return { svg, markers };
  }

  /** @type {Record<string, { figure: HTMLElement, caption: HTMLElement, markers: SVGGElement }>} */
  const maps = {};
  for (const v of D.map.views) {
    const { svg, markers } = baseMap(v);
    const caption = h("figcaption", { id: `map-${v.id}-cap`, class: "label" });
    const figure = h("figure", { class: v.id === "overview" ? "overview" : "area-map", "data-map": v.id }, caption, svg);
    maps[v.id] = { figure, caption, markers: /** @type {SVGGElement} */ (markers) };
    $("maps").append(figure);
  }
  $("map-credit").append("Map data ", link(D.map.license_url, `${D.map.attribution}, ${D.map.license}`),
    `, as of ${fmtDate(D.map.osm_base.slice(0, 10))}. Stations are the centres of their exits in the LTA exit dataset. Place positions come from OneMap postal-code searches. Places in one mall share its postal code, so their markers are spread in rings around the shared point, in rank order. On an area map, markers that would overlap are also pushed apart. A line joins each moved marker to a dot at its true point. The overview does not push apart markers of nearby points, so use an area map to pick one place.`);

  $("as-of").textContent = fmtDate(D.as_of);
  const used = D.sources.guides.filter((/** @type {any} */ g) => g.used_in_top);
  const statsData = [[D.outlets.length, "places ranked"], [used.length, "guides behind them"],
    [new Set(used.map((/** @type {any} */ g) => g.publisher)).size, "publishers"], [D.areas.length, "areas, one map each"],
    [D.outlets.filter((/** @type {any} */ o) => o.nutrition.status !== "not_estimable").length, "dishes with a calorie estimate"]];
  $("stats").append(...statsData.map(([n, t]) => h("li", {}, h("strong", {}, String(n)), String(t))));

  for (const a of D.areas) {
    const malls = a.malls.map((/** @type {any} */ m) => `${m.name}: ${m.in_top} in the top ${D.top}, ${m.fnb_listings} food and drink listings in the ${CHECK[m.directory].publisher} directory (${fmtDate(CHECK[m.directory].retrieved)})`);
    $("areas").append(h("div", { class: "card" },
      h("h3", {}, `${a.label} · ${a.in_top} places`),
      h("p", { class: "note" }, `Within 1 km of ${Report.list(a.stations)} MRT station${a.stations.length > 1 ? "s" : ""}`),
      h("p", {}, a.summary),
      ...(malls.length ? [h("p", { class: "note" }, `Mall directories: ${malls.join("; ")}.`)] : [h("p", { class: "note" }, "No place here is in a mall with a directory, so each one relies on the date of its newest guide.")]),
      ...(a.cuisines.length ? [h("p", { class: "note" }, `Cuisines: ${a.cuisines.map((/** @type {[string, number]} */ [c, n]) => `${CUISINE[c]} ${n}`).join(", ")}.`)] : [])));
  }

  $("next-summary").textContent = `Next in line: ${D.next_in_line.length} more open places with two or more publishers`;
  $("next-in-line").append(...D.next_in_line.map((/** @type {any} */ o) => h("li", { value: o.rank },
    `${o.name}, ${AREA[o.area].label}${o.venue ? ` (${o.venue})` : ""}: ${Report.plural(o.publishers, "publisher", "publishers")}, ${Report.plural(o.guides, "guide", "guides")}, newest ${fmtDate(o.latest_mention)}`)));
  const closed = D.excluded.filter((/** @type {any} */ o) => o.status === "closed").length;
  $("excluded-summary").textContent = `Recommended, but left out: ${closed} closed and ${D.excluded.length - closed} unverified`;
  $("excluded").append(...D.excluded.map((/** @type {any} */ o) => {
    const check = CHECK[o.checked_by];
    const why = o.status === "closed"
      ? (check?.mall ? `not in the ${check.mall} directory on ${fmtDate(check.retrieved)}` : check ? `closure notice: ` : "closed")
      : `unverified: its newest guide is from ${fmtDate(o.latest_mention)}, before ${D.recent.slice(0, 4)}`;
    return h("li", {}, `${o.name}, ${AREA[o.area].label}: ${why}`, ...(check && !check.mall ? [link(check.url, `${check.publisher}, ${fmtDate(check.published)}`)] : []));
  }));

  $("method").append(...D.method.map((/** @type {string} */ t) => h("li", {}, t)));
  $("calorie-method").append(...D.calorie_method.map((/** @type {string} */ t) => h("li", {}, t)));
  $("guides").append(...[...D.sources.guides].sort((/** @type {any} */ a, /** @type {any} */ b) => b.published.localeCompare(a.published)).map((/** @type {any} */ g) =>
    h("li", {}, link(g.url, g.title), ` · ${g.publisher}, ${fmtDate(g.published)}${g.used_in_top ? "" : " (names no place in the top 100)"}`)));
  $("checks").append(...D.sources.directories.map((/** @type {any} */ d) => h("li", {}, link(d.url, d.title), ` · ${d.publisher}, read ${fmtDate(d.retrieved)}`)),
    ...D.sources.notices.map((/** @type {any} */ n) => h("li", {}, link(n.url, n.title), ` · ${n.publisher}, ${fmtDate(n.published)}`)));
  $("geography").append(...D.sources.geography.map((/** @type {any} */ g) => h("li", {}, link(g.url, g.title), ` · ${g.publisher}, read ${fmtDate(g.retrieved)}. ${g.note}`)));
  $("nutrition-sources").append(...D.sources.nutrition.map((/** @type {any} */ n) => h("li", {}, link(n.url, n.citation), ` Read ${fmtDate(n.retrieved)}. ${n.note}`)));
  $("not-retrieved").append(...D.sources.not_retrieved.map((/** @type {any} */ n) => h("li", {}, n.url ? link(n.url, n.name) : n.name, `: ${n.reason}`)));

  /* ---------- the parts that follow the state ---------- */

  /** @type {any} */
  let app = null;

  /** Open a place from a map marker and bring its list entry into view. @param {string} id */
  function openFromMap(id) {
    app.set({ open: id });
    $(`place-${id}`)?.scrollIntoView({ block: "nearest" });
  }

  /** @param {any} o */
  function detail(o) {
    const p = o.presence;
    const check = p.checked_by === "guides"
      ? `No directory covers this place, so it counts as open because a guide named it on ${fmtDate(p.latest_mention)}.`
      : `Listed as “${p.listed_as}” in the ${CHECK[p.checked_by].publisher} directory of ${CHECK[p.checked_by].mall} on ${fmtDate(p.as_of)}.`;
    const named = GUIDE[o.dish_named_by];
    return h("div", { class: "detail" },
      h("p", {}, `${o.address} · ${o.station_m} m from the nearest exit of ${o.station} station · ${CUISINE[o.cuisine]}`),
      h("p", {}, `Signature dish: ${o.dish}, named by `, link(named.url, named.publisher), ` (${fmtDate(named.published)}).`),
      h("p", {}, `Calories: ${Report.nutritionText(o.nutrition)}`),
      h("p", {}, `Still there? ${check}`),
      ...(p.notice ? [h("p", {}, `Notice: ${p.note} `, link(CHECK[p.notice].url, `${CHECK[p.notice].publisher}, ${fmtDate(CHECK[p.notice].published)}`))] : []),
      h("p", {}, `Recommended by ${Report.plural(o.guides, "guide", "guides")} from ${Report.plural(o.publishers, "publisher", "publishers")}:`),
      h("ul", {}, ...o.mentions.map((/** @type {string} */ g) => h("li", {}, link(GUIDE[g].url, GUIDE[g].title), ` · ${GUIDE[g].publisher}, ${fmtDate(GUIDE[g].published)}`))));
  }

  /** @param {Record<string, any>} state @param {any} d */
  function drawMaps(state, d) {
    const live = new Set(d.maps.map((/** @type {any} */ m) => m.id));
    for (const [id, m] of Object.entries(maps)) m.figure.hidden = !live.has(id);
    for (const m of d.maps) {
      const { caption, markers } = maps[m.id];
      caption.textContent = `${m.id === "overview" ? "Overview: all five areas" : m.label} · ${Report.plural(m.markers.length, "place", "places")}`;
      const focusable = m.id !== "overview";
      // A marker moved off its place's point keeps a line to a dot at the true point.
      const moved = m.markers.filter((/** @type {any} */ k) => k.x !== k.px || k.y !== k.py);
      const points = new Map(moved.map((/** @type {any} */ k) => [`${k.px},${k.py}`, k]));
      // Lower ranks are drawn last, so the most recommended stay on top where markers overlap.
      markers.replaceChildren(...moved.map((/** @type {any} */ k) => s("line", { class: "m-leader", x1: k.px, y1: k.py, x2: k.x, y2: k.y })),
        ...[...points.values()].map((/** @type {any} */ k) => s("circle", { class: "m-point", cx: k.px, cy: k.py, r: 4 })),
        ...[...m.markers].reverse().map((/** @type {any} */ k) => {
        const o = OUTLET[k.id];
        const g = s("g", { class: `m-marker${k.id === state.open ? " on" : ""}`, transform: `translate(${k.x} ${k.y})` });
        if (focusable) {
          g.setAttribute("tabindex", "0");
          g.setAttribute("role", "button");
          g.setAttribute("aria-label", `${o.rank}. ${o.name}`);
          g.addEventListener("keydown", (/** @type {KeyboardEvent} */ e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openFromMap(k.id); } });
        }
        g.addEventListener("click", () => openFromMap(k.id));
        g.append(s("title", {}, `${o.rank}. ${o.name}: ${o.dish}`), s("circle", { r: m.id === "overview" ? 13 : 15 }), s("text", {}, String(k.rank)));
        return g;
      }));
    }
  }

  /** @param {Record<string, any>} state @param {any} d */
  function drawList(state, d) {
    $("list-empty").hidden = d.shown.length > 0;
    $("rank-list").replaceChildren(...d.shown.map((/** @type {any} */ o) => {
      const isOpen = o.id === state.open;
      const kcal = Model.kcalOf(o);
      const button = h("button", { type: "button", "aria-expanded": String(isOpen), "aria-controls": `detail-${o.id}` },
        h("span", { class: "rank" }, String(o.rank)),
        h("span", {}, h("strong", {}, o.name), " · ", o.dish, h("span", { class: "meta" }, `${AREA[o.area].label} · ${where(o)} · ${CUISINE[o.cuisine]}`)),
        h("span", { class: "pubs" }, `${o.publishers} pub. · ${kcal === null ? "n/e" : `≈${kcal} kcal`}`));
      button.addEventListener("click", () => app.set({ open: isOpen ? "" : o.id }));
      const li = h("li", { id: `place-${o.id}` }, button);
      if (isOpen) li.append(Object.assign(detail(o), { id: `detail-${o.id}` }));
      return li;
    }));
  }

  /** @param {any} d */
  function drawBars(d) {
    const most = Math.max(1, ...d.bars.map((/** @type {any} */ o) => o.nutrition.kcal_from.carbohydrate + o.nutrition.kcal_from.protein + o.nutrition.kcal_from.fat));
    $("bars").replaceChildren(...d.bars.map((/** @type {any} */ o) => {
      const n = o.nutrition;
      const bar = h("span", { class: "bar", "aria-hidden": "true" },
        ...["carb", "protein", "fat"].map((k, i) => h("span", { class: k, style: `width:${(100 * n.kcal_from[["carbohydrate", "protein", "fat"][i]] / most).toFixed(2)}%` })));
      return h("li", { class: n.status === "approximate" ? "approx" : "" },
        h("span", { class: "who", title: `${o.rank}. ${o.name}: ${o.dish}` }, `${o.rank}. ${o.dish} · ${o.name}`),
        bar,
        h("span", { class: "kcal" }, `≈${n.energy_kcal}`),
        h("span", { class: "visually-hidden" }, `: ${n.carbohydrate_g} g carbohydrate, ${n.protein_g} g protein, ${n.fat_g} g fat, ${n.status === "approximate" ? "approximate" : "estimate"}.`));
    }));
    $("not-estimable").textContent = d.notEstimable.length
      ? `Not estimable (${d.notEstimable.length}): ${d.notEstimable.map((/** @type {any} */ o) => `${o.rank}. ${o.name}`).join(", ")}. Open a place in the list for the reason.`
      : "";
  }

  /** Draw everything from the state. @param {Record<string, any>} state @param {any} d */
  function render(state, d) {
    $("top-value").textContent = String(state.top);
    $("publishers-value").textContent = String(state.publishers);
    for (const [a, n] of Object.entries(d.byArea)) /** @type {HTMLElement} */ (document.querySelector(`[data-count-area="${a}"]`)).textContent = String(n);
    for (const [c, n] of Object.entries(d.byCuisine)) /** @type {HTMLElement} */ (document.querySelector(`[data-count-cuisine="${c}"]`)).textContent = String(n);
    $("status").textContent = `Showing ${d.text.count}: ${d.text.scope}.${d.shown.length ? ` ${d.estimated} with a calorie estimate.` : ""}`;
    drawMaps(state, d);
    drawList(state, d);
    drawBars(d);
    for (const b of document.querySelectorAll("[data-example]")) {
      const example = Model.EXAMPLES.find((/** @type {KitExample} */ e) => e.id === b.getAttribute("data-example"));
      const full = example && VisualKit.normalize(Model.FIELDS, example.state).state;
      b.setAttribute("aria-pressed", String(Boolean(full) && Object.keys(Model.FIELDS).filter((k) => k !== "open").every((k) => state[k] === full?.[k])));
    }
  }

  /** @param {unknown} value */
  const out = (value) => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }] });
  const filterProps = {
    cuisine: { type: "string", enum: Model.CUISINES },
    area: { type: "string", enum: Model.AREAS },
  };
  /** @param {any} o */
  const brief = (o) => ({ rank: o.rank, id: o.id, name: o.name, area: o.area, venue: o.venue, unit: o.unit, cuisine: o.cuisine, dish: o.dish,
    publishers: o.publishers, guides: o.guides, estimated_kcal: Model.kcalOf(o), nutrition_status: o.nutrition.status });

  /** The domain's read-only WebMCP tools; the kit adds get_metadata, get_state and get_markdown. @type {KitTool[]} */
  const tools = [
    { name: "query_outlets", description: "List the top places in rank order, optionally only one cuisine or one area: rank, id, name, area, venue, unit, cuisine, signature dish, publishers, guides and the estimated kcal.",
      inputSchema: { type: "object", properties: { ...filterProps, limit: { type: "integer", minimum: 1, maximum: 100 } }, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async (/** @type {{ cuisine?: string, area?: string, limit?: number }} */ input = {}) =>
        out(Model.select(D, { cuisine: input.cuisine, area: input.area }).slice(0, input.limit ?? 100).map(brief)) },
    { name: "get_outlet", description: "Return one place by id: where it is, the guides that recommend it, how its presence was checked and its signature dish's calorie estimate.",
      inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async (/** @type {{ id?: string }} */ input = {}) => {
        const o = OUTLET[input.id ?? ""];
        if (!o) return out({ error: "unknown place id; query_outlets lists the ids" });
        return out({ ...o, guides_detail: o.mentions.map((/** @type {string} */ g) => GUIDE[g]) });
      } },
    { name: "get_calorie_breakdown", description: "Return the estimated energy, carbohydrate, protein and fat of each signature dish, optionally for one cuisine or area, and the dishes that cannot be estimated with the reason.",
      inputSchema: { type: "object", properties: filterProps, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async (/** @type {{ cuisine?: string, area?: string }} */ input = {}) => {
        const shown = Model.select(D, input);
        return out({
          estimates: shown.filter((/** @type {any} */ o) => Model.kcalOf(o) !== null).map((/** @type {any} */ o) => ({ rank: o.rank, name: o.name, dish: o.dish, ...o.nutrition })),
          not_estimable: shown.filter((/** @type {any} */ o) => Model.kcalOf(o) === null).map((/** @type {any} */ o) => ({ rank: o.rank, name: o.name, dish: o.dish, reason: o.nutrition.reason })),
        });
      } },
    { name: "get_area", description: "Return one area: its stations, summary, mall directories, cuisines, the places of the top 100 on its map, and the places left out as closed or unverified.",
      inputSchema: { type: "object", properties: { area: filterProps.area }, required: ["area"], additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async (/** @type {{ area?: string }} */ input = {}) => {
        const a = AREA[input.area ?? ""];
        if (!a) return out({ error: `unknown area; use one of ${Model.AREAS.join(", ")}` });
        return out({ ...a, places: Model.select(D, { area: a.id }).map(brief),
          left_out: D.excluded.filter((/** @type {any} */ o) => o.area === a.id).map((/** @type {any} */ o) => ({ name: o.name, status: o.status, checked_by: o.checked_by, latest_mention: o.latest_mention })) });
      } },
    { name: "get_sources", description: "Return the as-of date, the ranking and calorie methods, and every source: food guides, mall directories, closure notices, map and place data, nutrition tables and what could not be retrieved.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async () => out({ as_of: D.as_of, method: D.method, calorie_method: D.calorie_method, sources: D.sources }) },
  ];

  app = VisualKit.start({
    slug: Model.SLUG,
    title: document.title,
    summary: document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "",
    schemaVersion: Model.SCHEMA_VERSION,
    fields: Model.FIELDS,
    derive: (state) => Model.derive(state, D),
    render,
    report: (state, d) => Report.report(state, d, D),
    tools,
    commands: [
      ...Model.EXAMPLES.map((/** @type {KitExample} */ e) => ({ label: `Example: ${e.label}`, run: () => app.set({ ...VisualKit.defaults(Model.FIELDS), ...e.state }) })),
      ...D.areas.map((/** @type {any} */ a) => ({ label: `Show ${a.label}`, run: () => app.set({ area: a.id }) })),
    ],
    bind(app) {
      for (const b of document.querySelectorAll("[data-example]")) {
        const example = Model.EXAMPLES.find((/** @type {KitExample} */ e) => e.id === b.getAttribute("data-example"));
        if (example) b.addEventListener("click", () => app.set({ ...VisualKit.defaults(Model.FIELDS), ...example.state }));
      }
    },
  });
})();
