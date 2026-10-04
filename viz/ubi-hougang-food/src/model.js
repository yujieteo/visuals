/* Good food in Ubi, Hougang, Woodleigh, Paya Lebar and Eunos: the domain model.
 *
 * FIELDS is the semantic state (§5): the cuisine and area filters, how many of the top 100 to show, the order of
 * the calorie bars and the place whose details are open. The URL, the JSON file and the exports share it. Change
 * SCHEMA_VERSION when a field changes meaning, so an old saved file is refused rather than read wrongly (§13).
 * derive(state, data) computes every value the page shows from the state and the dataset (raw.json) alone, so the
 * same state always gives the same list, maps and bars (§4). It touches no DOM, so node tests run it.
 */
/** @param {any} root the global object @param {() => any} factory */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Model = api;
})(/** @type {any} */ (typeof self !== "undefined" ? self : this), function () {
  "use strict";

  const SLUG = "ubi-hougang-food";
  const SCHEMA_VERSION = 1;
  // The ids of raw.json, repeated here so the state schema can be read without the dataset; a model test checks
  // that they match the dataset.
  const CUISINES = ["chinese", "malay", "indian", "japanese", "korean", "southeast-asian", "western", "cafe-bakery", "dessert"];
  const AREAS = ["ubi", "hougang", "woodleigh", "paya-lebar", "eunos"];

  /** @type {Record<string, KitField>} */
  const FIELDS = {
    cuisine: { type: "enum", label: "Cuisine", default: "all", values: ["all", ...CUISINES] },
    area: { type: "enum", label: "Area", default: "all", values: ["all", ...AREAS] },
    top: { type: "integer", label: "Places shown from the top", default: 100, min: 10, max: 100, step: 10 },
    publishers: { type: "integer", label: "Least number of publishers that name a place", default: 2, min: 2, max: 7, step: 1 },
    sort: { type: "enum", label: "Order of the calorie bars", default: "energy", values: ["energy", "rank"] },
    open: { type: "string", label: "Place whose details are open", default: "" },
  };

  /** The distance between the centres of spread markers, in map units: the marker diameter and a 2-unit gap. */
  const MARKER_GAP = { overview: 28, area: 32 };

  /** Named states with stable ids (§5, §18). @type {KitExample[]} */
  const EXAMPLES = [
    { id: "top-10", label: "The top 10", state: { top: 10 } },
    { id: "eunos-indian", label: "Indian food in Eunos", state: { area: "eunos", cuisine: "indian" } },
    { id: "woodleigh-by-rank", label: "Woodleigh, calories in list order", state: { area: "woodleigh", sort: "rank" } },
  ];

  /**
   * @typedef {{ status: "estimate" | "approximate", energy_kcal: number, carbohydrate_g: number, protein_g: number,
   *   fat_g: number, kcal_from: Record<string, number>, source: string, reference: string, match: string,
   *   portion: string, note: string } | { status: "not_estimable", reason: string }} Nutrition
   * @typedef {{ id: string, name: string, rank: number, area: string, cuisine: string, venue: string, unit: string,
   *   lat: number, lon: number, publishers: number, guides: number, dish: string, nutrition: Nutrition,
   *   [key: string]: any }} Outlet
   * @typedef {{ id: string, label: string, bbox: number[], w: number, h: number }} MapView
   */

  /** The energy of a place's signature dish, or null when it is not estimable. @param {Outlet} o */
  const kcalOf = (o) => (o.nutrition.status === "not_estimable" ? null : o.nutrition.energy_kcal);

  /**
   * A point on a map view: equirectangular, scaled by the cosine of the view's centre latitude, the projection
   * map.json records. x grows east and y grows south, in the view's own units.
   * @param {MapView} view @param {number} lat @param {number} lon @returns {[number, number]}
   */
  function project(view, lat, lon) {
    const [w, s, e, n] = view.bbox;
    const k = Math.cos(((s + n) / 2) * (Math.PI / 180));
    const scale = view.w / ((e - w) * k);
    return [(lon - w) * k * scale, (n - lat) * scale];
  }

  /**
   * Offsets that spread n markers which share one point over a hexagonal pack: one marker stays on the point, but
   * when n > 1 the point is left free for its dot and ring k holds 6k markers, gap units apart. Places in one mall share the mall's postal code, so they share a point.
   * @param {number} n @param {number} gap @returns {[number, number][]}
   */
  function spread(n, gap) {
    /** @type {[number, number][]} */
    const out = n === 1 ? [[0, 0]] : [];
    for (let k = 1; out.length < n; k++) {
      for (let side = 0; side < 6; side++) {
        const a0 = (side * Math.PI) / 3, a1 = ((side + 1) * Math.PI) / 3;
        for (let j = 0; j < k; j++) {
          const x = k * ((1 - j / k) * Math.cos(a0) + (j / k) * Math.cos(a1));
          const y = k * ((1 - j / k) * Math.sin(a0) + (j / k) * Math.sin(a1));
          out.push([x * gap, y * gap]);
        }
      }
    }
    return out.slice(0, n);
  }

  /**
   * Push apart, in place, every pair of markers less than gap apart, in a fixed number of rounds and inside the view.
   * Each pair moves equally along the line between them; the result depends only on the input order.
   * @param {{ x: number, y: number }[]} markers @param {number} gap @param {{ w: number, h: number }} view
   */
  function separate(markers, gap, view) {
    const half = gap / 2;
    for (let round = 0; round < 60; round++) {
      let moved = false;
      for (let i = 0; i < markers.length; i++) {
        for (let j = i + 1; j < markers.length; j++) {
          const a = markers[i], b = markers[j];
          const dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy);
          if (dist >= gap - 1e-6) continue;
          const [ux, uy] = dist > 1e-6 ? [dx / dist, dy / dist] : [Math.cos(i + j), Math.sin(i + j)];
          const push = (gap - dist) / 2 + 0.01;
          a.x -= ux * push; a.y -= uy * push; b.x += ux * push; b.y += uy * push;
          moved = true;
        }
      }
      for (const k of markers) {
        k.x = Math.min(view.w - half, Math.max(half, k.x));
        k.y = Math.min(view.h - half, Math.max(half, k.y));
      }
      if (!moved) return;
    }
  }

  /**
   * The places that pass the filters, in rank order. A null filter passes everything.
   * @param {{ outlets: Outlet[] }} data
   * @param {{ cuisine?: string | null, area?: string | null, top?: number, publishers?: number }} filter
   */
  function select(data, filter) {
    return data.outlets.filter((o) => (!filter.cuisine || filter.cuisine === "all" || o.cuisine === filter.cuisine)
      && (!filter.area || filter.area === "all" || o.area === filter.area) && o.rank <= (filter.top ?? Infinity) && o.publishers >= (filter.publishers ?? 0));
  }

  /**
   * Every value the page shows, from the state and the dataset only.
   * @param {Record<string, any>} state @param {any} data
   */
  function derive(state, data) {
    const cuisineLabel = Object.fromEntries(data.cuisines.map((/** @type {any} */ c) => [c.id, c.label]));
    const areaLabel = Object.fromEntries(data.areas.map((/** @type {any} */ a) => [a.id, a.label]));
    /** @type {Outlet[]} */
    const shown = select(data, state);
    const estimated = shown.filter((o) => kcalOf(o) !== null);
    const notEstimable = shown.filter((o) => kcalOf(o) === null);
    const bars = [...estimated].sort(state.sort === "rank" ? (a, b) => a.rank - b.rank : (a, b) => Number(kcalOf(b)) - Number(kcalOf(a)) || a.rank - b.rank);
    const opened = shown.find((o) => o.id === state.open) ?? null;
    // Each map: the overview always, and an area's own map unless another area is chosen.
    const maps = data.map.views.filter((/** @type {MapView} */ v) => v.id === "overview" || state.area === "all" || v.id === state.area)
      .map((/** @type {MapView} */ v) => {
        // Places at one point (one mall) are spread around it in rank order, so each marker can be seen and clicked;
        // px, py keep the true point, which the view marks.
        /** @type {Map<string, Outlet[]>} */
        const at = new Map();
        for (const o of shown.filter((o) => v.id === "overview" || o.area === v.id)) {
          const key = `${o.lat},${o.lon}`;
          at.set(key, [...(at.get(key) ?? []), o]);
        }
        const gap = v.id === "overview" ? MARKER_GAP.overview : MARKER_GAP.area;
        const r1 = (/** @type {number} */ n) => Math.round(n * 10) / 10;
        const markers = [...at.values()].flatMap((group) => {
          const [px, py] = project(v, group[0].lat, group[0].lon);
          const offsets = spread(group.length, gap);
          return group.map((o, i) => ({ id: o.id, rank: o.rank, x: px + offsets[i][0], y: py + offsets[i][1], px, py, shared: group.length }));
        }).sort((a, b) => a.rank - b.rank);
        // On an area map, where each marker can be clicked, markers of nearby points are pushed apart too.
        if (v.id !== "overview") separate(markers, gap, v);
        return {
          id: v.id,
          label: v.label,
          markers: markers.map((k) => ({ ...k, x: r1(k.x), y: r1(k.y), px: r1(k.px), py: r1(k.py) })),
        };
      });
    // The counts each filter would show, with the other filters kept.
    const byArea = Object.fromEntries(AREAS.map((a) => [a, select(data, { ...state, area: a }).length]));
    const byCuisine = Object.fromEntries(CUISINES.map((c) => [c, select(data, { ...state, cuisine: c }).length]));
    const scope = [state.cuisine !== "all" ? cuisineLabel[state.cuisine] : null, state.area !== "all" ? areaLabel[state.area] : null];
    const scopeText = (scope[0] && scope[1] ? `${scope[0]} in ${scope[1]}` : scope[0] ?? scope[1] ?? "Every cuisine and area")
      + (state.publishers > 2 ? `, named by ${state.publishers} or more publishers` : "");
    const energies = estimated.map((o) => Number(kcalOf(o)));
    return {
      shown,
      opened,
      estimated: estimated.length,
      approximate: shown.filter((o) => o.nutrition.status === "approximate").length,
      notEstimable,
      bars,
      maps,
      byArea,
      byCuisine,
      kcalRange: energies.length ? [Math.min(...energies), Math.max(...energies)] : null,
      text: {
        scope: scopeText,
        count: `${shown.length} of the top ${state.top}${state.top < data.top ? ` (of ${data.top})` : ""}`,
      },
    };
  }

  return { SLUG, SCHEMA_VERSION, CUISINES, AREAS, FIELDS, EXAMPLES, MARKER_GAP, kcalOf, project, spread, separate, select, derive };
});
