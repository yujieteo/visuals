/* Page controller: state, inputs, table, canvas, results, warnings,
 * library and files. Calculations all come from ../core. */

import { examplePattern, addFastener, clone, defaultPlate } from "../core/model.mjs";
import { solve } from "../core/solve.mjs";
import { convertPattern, unitLabel, round12, UNIT_SYSTEMS } from "../core/units.mjs";
import { fmt } from "../core/format.mjs";
import { buildScene, CENTROID_STYLE } from "../core/scene.mjs";
import { rectangularArray, staggeredRows, boltCircle, mirror } from "../core/generators.mjs";
import { toJSON, toMarkdown, parseJSON, normalizePattern, parsePatternFile } from "../core/persist.mjs";
import { runVerification } from "../core/verify.mjs";
import { sortIssues } from "../core/warnings.mjs";
import { marginText, noMarginSummary } from "../core/checks.mjs";
import { PRESETS } from "../core/interaction.mjs";
import { preloadFromTorque } from "../core/tension.mjs";
import { suggestContactEdge, EDGES } from "../core/contact.mjs";
import { TOOL_VERSION } from "../core/meta.mjs";
import { paint, palette, hitTest, centroidPath, paintLegend, legendHeight } from "./canvas.mjs";
import { traceFastenerId } from "../core/trace.mjs";
import { handCalc, handCalcMarkdown } from "../core/handcalc.mjs";
import { deckReport } from "../core/deck.mjs";
import { reportHtml } from "../core/report.mjs";
import { readLibrary, writeLibrary, readWorking, writeWorking, uniqueName, StorageFullError } from "./storage.mjs";
import { registerTools } from "./webmcp.mjs";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const SNAP_DEFAULT = { "N-mm": 5, "in-lbf": 0.25 };
const DEBOUNCE_AFTER_MS = 50;

const state = {
  pattern: null,
  result: null,
  selected: null,
  snap: { on: true, step: 5 },
  importIssues: [],
  lastSolveMs: 0,
  scene: null,
  drag: null,
};

/* ---------- model helpers ---------- */

function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function setPath(obj, path, value) {
  const keys = path.split(".");
  let o = obj;
  for (const k of keys.slice(0, -1)) o = o[k] ??= {};
  o[keys.at(-1)] = value;
}
/* '' → null; numbers → number; anything else is kept as typed so E-002 can name it. */
function parseInput(text) {
  const t = String(text).trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : t;
}
const inputText = (v) => (v === null || v === undefined ? "" : String(v));
const units = (kind) => unitLabel(state.pattern.unitSystem, kind);
const precision = () => {
  const p = state.pattern.settings?.precision;
  return Number.isInteger(p) && p >= 1 && p <= 15 ? p : 4;
};
const f = (v, scale = 0) => fmt(v, precision(), scale);
const snapValue = (v) => (state.snap.on && state.snap.step > 0 ? round12(Math.round(v / state.snap.step) * state.snap.step) : round12(v));

/* ---------- recalculation ---------- */

let timer = 0;
function changed({ structure = false } = {}) {
  if (structure) renderStructure();
  clearTimeout(timer);
  if (state.lastSolveMs > DEBOUNCE_AFTER_MS) timer = setTimeout(recompute, 120);
  else recompute();
}

function recompute() {
  const t0 = performance.now();
  state.result = solve(state.pattern);
  state.lastSolveMs = performance.now() - t0;
  renderResults();
  renderIssues();
  markInvalid();
  renderInline();
  renderPresets();
  renderLegend();
  renderTrace();
  renderPageSize();
  draw();
  autosave();
}

function autosave() {
  try {
    writeWorking(toJSON(state.pattern));
  } catch (e) {
    storageProblem(e);
  }
}

function storageProblem(e) {
  const banner = $("#storage-banner");
  if (!e) { banner.hidden = true; return; }
  $("#storage-message").textContent = e instanceof StorageFullError ? e.message : `Could not save in this browser: ${e.message}`;
  banner.hidden = false;
}

/* ---------- rendering: inputs ---------- */

function renderUnits() {
  for (const el of $$("[data-unit]")) el.textContent = units(el.dataset.unit);
  for (const b of $$("[data-units]")) b.setAttribute("aria-pressed", String(b.dataset.units === state.pattern.unitSystem));
}

function renderInputs() {
  $("#name").value = state.pattern.name;
  $("#precision").value = state.pattern.settings.precision;
  const plates = state.pattern.plates;
  $("#applied-plate").innerHTML = plates.map((p) => `<option value="${esc(p.id)}">${esc(p.id)}</option>`).join("") || `<option value="">(none)</option>`;
  for (const el of $$("[data-path]")) {
    const v = getPath(state.pattern, el.dataset.path);
    if (el.type === "checkbox") el.checked = !!v;
    else el.value = inputText(v);
  }
  renderToggles();
  renderOverrides();
  $("#tq-d").value = inputText(state.pattern.defaults.diameter);
  $("#snap").setAttribute("aria-pressed", String(state.snap.on));
  $("#snap-step").value = state.snap.step;
  renderPlates();
}

const PLATE_FIELDS = [["xMin", "length"], ["xMax", "length"], ["thickness", "length", "t"], ["yMin", "length"], ["yMax", "length"],
  ["bearingAllowable", "stress", "Fbr"], ["bearingLoadAllowable", "force", "Bearing direct"], ["shearOutAllowable", "stress", "Fsu"],
  ["minEdgeRatio", "none", "min e/D"], ["flangeStrength", "stress", "Fp"]];
const NULLABLE_PLATE = new Set(["bearingAllowable", "bearingLoadAllowable", "shearOutAllowable", "minEdgeRatio", "flangeStrength"]);

function renderPlates() {
  $("#plates").innerHTML = state.pattern.plates.map((p, i) => `
    <div class="plate-block" data-plate="${i}">
      <h4>${esc(p.id)}${p.id === state.pattern.load.appliedPlate ? ' <span class="tag">loaded</span>' : ""}${i > 0 ? ` <button class="btn danger" type="button" data-remove-plate="${i}">Remove ${esc(p.id)}</button>` : ""}</h4>
      <div class="row three">
      ${PLATE_FIELDS.map(([k, kind, label]) => `<label class="f"><span>${esc(label || k)}${kind !== "none" ? ` (${units(kind)})` : ""}</span><input type="number" step="any" data-plate-key="${k}" data-field="plates.${esc(p.id)}.${k}" value="${esc(inputText(p[k]))}"${NULLABLE_PLATE.has(k) ? ' placeholder="—"' : ""}></label>`).join("")}
      </div>
    </div>`).join("");
  $("#add-plate").hidden = state.pattern.plates.length >= 2;
  $("#edge-plate").innerHTML = state.pattern.plates.map((p) => `<option value="${esc(p.id)}">${esc(p.id)}</option>`).join("") || `<option value="">(no plates)</option>`;
  $("#edge-plate").value = state.pattern.settings.contactEdge?.plateId ?? "";
}

function renderTable() {
  const d = state.pattern.defaults;
  const cell = (fa, key) => {
    const has = fa.overrides && key in fa.overrides;
    return `<td><input type="number" step="any" aria-label="${esc(fa.id)} ${key}" data-id="${esc(fa.id)}" data-key="${key}" class="${has ? "override" : ""}" value="${has ? esc(inputText(fa.overrides[key])) : ""}" placeholder="${esc(d[key] === null || d[key] === undefined ? "—" : inputText(d[key]))}"></td>`;
  };
  $("#fastener-rows").innerHTML = state.pattern.fasteners.map((fa) => `
    <tr data-row="${esc(fa.id)}" class="${fa.id === state.selected ? "selected" : ""}">
      <th scope="row">${esc(fa.id)}</th>
      <td><input type="text" aria-label="${esc(fa.id)} label" data-id="${esc(fa.id)}" data-key="label" value="${esc(fa.label)}"></td>
      <td><input type="number" step="any" aria-label="${esc(fa.id)} x" data-id="${esc(fa.id)}" data-key="x" value="${esc(inputText(fa.x))}"></td>
      <td><input type="number" step="any" aria-label="${esc(fa.id)} y" data-id="${esc(fa.id)}" data-key="y" value="${esc(inputText(fa.y))}"></td>
      ${cell(fa, "area")}${cell(fa, "ks")}${cell(fa, "ka")}${cell(fa, "diameter")}${cell(fa, "shearAllowable")}${cell(fa, "tensionAllowable")}
      <td><button class="btn danger" type="button" data-remove="${esc(fa.id)}" aria-label="Remove ${esc(fa.id)}">×</button></td>
    </tr>`).join("") || `<tr><td colspan="11" class="muted">No fasteners. Click the canvas, use a generator or “+ Fastener”.</td></tr>`;
}

function renderLibrary() {
  const lib = readLibrary();
  const names = Object.keys(lib).sort((a, b) => a.localeCompare(b));
  $("#library").innerHTML = names.length
    ? names.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join("")
    : `<option value="">(empty)</option>`;
  $("#lib-load").disabled = $("#lib-delete").disabled = !names.length;
}

function renderSelection() {
  for (const tr of $$("#fastener-rows tr[data-row]")) tr.classList.toggle("selected", tr.dataset.row === state.selected);
  $("#delete-fastener").disabled = !state.selected;
  renderOverrides();
}

/* Point the contact edge at the compressive side of the applied moment. */
function suggestEdge(announceIt) {
  const st = state.pattern.settings;
  st.contactEdge ??= { plateId: "", edge: "yMin" };
  const plate = state.pattern.plates.find((p) => p.id === st.contactEdge.plateId) || state.pattern.plates[0];
  if (!plate) { $("#edge-note").textContent = "Method (b) needs a plate: add one in the Plates card."; return; }
  st.contactEdge.plateId = plate.id;
  const Ca = state.result?.ok ? state.result.props.Ca : { x: 0, y: 0 };
  const edge = suggestContactEdge(plate, state.pattern.load, Ca);
  if (edge) {
    st.contactEdge.edge = edge;
    if (announceIt) $("#edge-note").textContent = `Contact edge set to the ${EDGES[edge].label} of ${plate.id}, on the compressive side of the applied moment.`;
  } else if (announceIt) {
    $("#edge-note").textContent = "No edge has a positive moment about it: the applied load puts no plate edge in compression.";
  }
}

const TENSION_FIELDS = [
  ["prying", "prying.b", "b", "length"], ["prying", "prying.a", "a", "length"], ["prying", "prying.p", "p", "length"],
  ["prying", "prying.holeDiameter", "d_h", "length"], ["prying", "prying.boltStrengthB", "B", "force"], ["prying", "prying.manualFactor", "Manual factor", "none"],
  ["preload", "preload.pMax", "P_max", "force"], ["preload", "preload.pMin", "P_min", "force"], ["preload", "preload.phi", "φ", "none"],
  ["icr", "icr.rult", "Rult", "force"], ["icr", "icr.deltaMax", "Δmax", "length"], ["icr", "icr.deltaY", "Δy", "length"],
  ["icr", "icr.mu", "μ", "invLength"], ["icr", "icr.lambda", "λ", "none"],
];

function renderToggles() {
  for (const el of $$("[data-show]")) el.hidden = !getPath(state.pattern, el.dataset.show);
  for (const el of $$("[data-show-method]")) el.hidden = state.pattern.settings.axialMethod !== el.dataset.showMethod;
  for (const el of $$("[data-show-model]")) el.hidden = (state.pattern.settings.icr?.model || "crawford-kulak") !== el.dataset.showModel;
  const pts = state.pattern.fasteners.filter((q) => typeof q.x === "number" && typeof q.y === "number");
  let nn = Infinity;
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) nn = Math.min(nn, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y));
  $("#spacing-hint").textContent = Number.isFinite(nn) ? `Hint only: the nearest-neighbour spacing in this pattern is ${f(nn)} ${units("length")}. Type p yourself.` : "";
}

/* Prying and preload overrides for the selected fastener (blank = group default). */
function renderOverrides() {
  const box = $("#override-editor");
  const st = state.pattern.settings;
  const fa = state.pattern.fasteners.find((q) => q.id === state.selected);
  const groups = ["prying", "preload", "icr"].filter((g) => st[g]?.enabled);
  if (!groups.length) { box.innerHTML = ""; return; }
  if (!fa) { box.innerHTML = `<p class="note">Select a fastener to override its prying, preload or ICR inputs.</p>`; return; }
  const d = state.pattern.defaults;
  box.innerHTML = `<h4>Overrides for ${esc(fa.id)}</h4><div class="row three">${TENSION_FIELDS.filter(([g]) => groups.includes(g)).map(([, path, label, kind]) => {
    const own = getPath(fa.overrides || {}, path);
    const has = own !== undefined;
    const def = getPath(d, path);
    return `<label class="f"><span>${esc(label)}${kind !== "none" ? ` (${units(kind)})` : ""}</span><input type="number" step="any" data-ov="${path}" class="${has ? "override" : ""}" value="${has ? esc(inputText(own)) : ""}" placeholder="${esc(def === null || def === undefined ? "—" : inputText(def))}"></label>`;
  }).join("")}</div>`;
}

function renderStructure() {
  renderUnits();
  renderInputs();
  renderTable();
  renderSelection();
}

function renderAll() {
  renderStructure();
  renderLibrary();
  renderLegend();
  recompute();
}

/* Flag inputs named by error issues. */
function markInvalid() {
  for (const el of $$("[aria-invalid]")) el.removeAttribute("aria-invalid");
  for (const i of state.result.issues) {
    if (i.tier !== "error") continue;
    if (i.fastener && i.field) $(`#fastener-rows input[data-id="${CSS.escape(i.fastener)}"][data-key="${CSS.escape(i.field)}"]`)?.setAttribute("aria-invalid", "true");
    else if (i.field) ($(`[data-path="${CSS.escape(i.field)}"]`) || $(`[data-field="${CSS.escape(i.field)}"]`))?.setAttribute("aria-invalid", "true");
    if (i.fastener && i.field && i.fastener === state.selected) $(`#override-editor [data-ov="${CSS.escape(i.field)}"]`)?.setAttribute("aria-invalid", "true");
  }
  const p = state.pattern.settings.precision;
  if (!(Number.isInteger(p) && p >= 1 && p <= 15)) $("#precision").setAttribute("aria-invalid", "true");
}

/* ---------- rendering: canvas ---------- */

const canvas = () => $("#canvas");

function draw() {
  const el = canvas();
  const rect = el.getBoundingClientRect();
  const width = Math.max(1, rect.width), height = Math.max(1, rect.height);
  const dpr = window.devicePixelRatio || 1;
  if (el.width !== Math.round(width * dpr) || el.height !== Math.round(height * dpr)) {
    el.width = Math.round(width * dpr);
    el.height = Math.round(height * dpr);
  }
  const ctx = el.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // Keep the view fixed while dragging so the pattern does not slide under the pointer.
  const frozen = state.drag && state.drag.moved ? state.drag.transform : null;
  state.scene = buildScene(state.pattern, state.result, { width, height }, { selected: state.selected, transform: frozen });
  paint(ctx, state.scene, palette(el), { snapOn: state.snap.on, snapStep: state.snap.step });
}

function legendIcon(entry, colours) {
  const c = colours[entry.colour] || colours.fg;
  if (entry.shape === "arrow") return `<svg width="22" height="12" aria-hidden="true"><line x1="1" y1="6" x2="15" y2="6" stroke="${c}" stroke-width="2"/><path d="M21 6L14 2V10z" fill="${c}"/></svg>`;
  if (entry.shape === "disc") return `<svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5.5" fill="${c}" fill-opacity=".35" stroke="${colours.fg}" stroke-width="1.5"/></svg>`;
  if (entry.shape === "dashed") return `<svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5.5" fill="none" stroke="${colours.fg}" stroke-width="1.5" stroke-dasharray="3 2"/></svg>`;
  if (entry.shape === "icr") return `<svg width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="${c}" stroke-width="2"/><path d="M5 8H11M8 5V11" stroke="${c}" stroke-width="2"/></svg>`;
  if (entry.shape === "edge") return `<svg width="22" height="10" aria-hidden="true"><line x1="1" y1="5" x2="21" y2="5" stroke="${c}" stroke-width="3" stroke-dasharray="6 3"/></svg>`;
  if (entry.shape === "cross") return `<svg width="14" height="14" aria-hidden="true"><path d="M2 2L12 12M12 2L2 12" stroke="${c}" stroke-width="2"/></svg>`;
  return centroidSvg(entry.key, c);
}

function centroidSvg(key, colour) {
  const s = CENTROID_STYLE[key];
  if (s.shape === "ring") return `<svg width="22" height="22" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="${colour}" stroke-width="2"/><path d="M1 11H21M11 1V21" stroke="${colour}" stroke-width="2"/></svg>`;
  if (s.shape === "diamond") return `<svg width="16" height="16" aria-hidden="true"><path d="M8 1L15 8L8 15L1 8z" fill="none" stroke="${colour}" stroke-width="2"/></svg>`;
  return `<svg width="10" height="10" aria-hidden="true"><rect x="1" y="1" width="8" height="8" fill="${colour}"/></svg>`;
}

function renderLegend() {
  const colours = palette(canvas());
  const scene = buildScene(state.pattern, state.result, { width: 100, height: 100 });
  $("#legend").innerHTML = scene.legend.map((e) => `<li>${legendIcon(e, colours)}<span>${esc(e.label)}</span></li>`).join("");
}

function eventPoint(e) {
  const r = canvas().getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function announce(text) {
  $("#canvas-status").textContent = text;
}

function select(id, { scroll = false } = {}) {
  state.selected = id;
  renderSelection();
  draw();
  if (scroll && id) $(`#fastener-rows tr[data-row="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "nearest" });
}

function moveFastener(id, x, y) {
  const fa = state.pattern.fasteners.find((q) => q.id === id);
  if (!fa) return;
  fa.x = x; fa.y = y;
  for (const key of ["x", "y"]) {
    const input = $(`#fastener-rows input[data-id="${CSS.escape(id)}"][data-key="${key}"]`);
    if (input && document.activeElement !== input) input.value = inputText(fa[key]);
  }
  changed();
}

function removeFastener(id) {
  state.pattern.fasteners = state.pattern.fasteners.filter((q) => q.id !== id);
  if (state.selected === id) state.selected = null;
  announce(`Removed ${id}.`);
  changed({ structure: true });
}

function bindCanvas() {
  const el = canvas();
  el.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || !state.scene) return;
    const pt = eventPoint(e);
    const hit = hitTest(state.scene, pt);
    state.drag = { hit, start: pt, moved: false, transform: state.scene.transform };
    el.setPointerCapture(e.pointerId);
    if (hit?.kind === "fastener") select(hit.id); // no scrolling: the canvas must stay under the pointer
  });
  el.addEventListener("pointermove", (e) => {
    const pt = eventPoint(e);
    const d = state.drag;
    if (!d) {
      const hit = state.scene && hitTest(state.scene, pt);
      el.style.cursor = hit ? "move" : "crosshair";
      return;
    }
    if (!d.moved && Math.hypot(pt.x - d.start.x, pt.y - d.start.y) < 3) return;
    d.moved = true;
    if (!d.hit) return;
    const { scale, ox, oy } = d.transform;
    const w = { x: snapValue((pt.x - ox) / scale), y: snapValue((oy - pt.y) / scale) };
    if (d.hit.kind === "fastener") moveFastener(d.hit.id, w.x, w.y);
    else if (d.hit.kind === "load") {
      state.pattern.load.point.x = w.x; state.pattern.load.point.y = w.y;
      $('[data-path="load.point.x"]').value = w.x; $('[data-path="load.point.y"]').value = w.y;
      changed();
    }
  });
  const end = (e) => {
    const d = state.drag;
    state.drag = null;
    if (!d) return;
    if (!d.hit && !d.moved && e.type === "pointerup") {
      const { scale, ox, oy } = d.transform;
      const w = { x: snapValue((d.start.x - ox) / scale), y: snapValue((oy - d.start.y) / scale) };
      const fa = addFastener(state.pattern, w.x, w.y);
      state.selected = fa.id;
      announce(`Added ${fa.id} at (${f(w.x)}, ${f(w.y)}).`);
      changed({ structure: true });
    } else if (!d.hit && !d.moved) {
      // cancelled
    } else if (!d.hit) {
      select(null);
    } else {
      draw(); // re-fit the view now the drag is over
    }
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
  el.addEventListener("keydown", (e) => {
    const id = state.selected;
    const ids = state.pattern.fasteners.map((q) => q.id);
    if (e.key === "Tab") return;
    if ((e.key === "n" || e.key === "p") && ids.length) {
      const i = ids.indexOf(id), n = ids.length;
      select(e.key === "n" ? ids[(i + 1) % n] : ids[(i - 1 + n) % n]);
      announce(`Selected ${state.selected}.`);
      e.preventDefault();
      return;
    }
    if (!id) return;
    const fa = state.pattern.fasteners.find((q) => q.id === id);
    const step = (state.snap.step > 0 ? state.snap.step : 1) * (e.shiftKey ? 10 : 1);
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[e.key] && typeof fa.x === "number" && typeof fa.y === "number") {
      moveFastener(id, round12(fa.x + moves[e.key][0]), round12(fa.y + moves[e.key][1]));
      announce(`${id} at (${f(fa.x)}, ${f(fa.y)}).`);
      e.preventDefault();
    } else if (e.key === "Delete" || e.key === "Backspace") {
      removeFastener(id);
      e.preventDefault();
    } else if (e.key === "Escape") {
      select(null);
    }
  });
  new ResizeObserver(() => draw()).observe(el);
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => { renderLegend(); draw(); });
}

/* ---------- rendering: results ---------- */

function table(head, rows, { numeric = [] } = {}) {
  return `<div class="table-wrap"><table><thead><tr>${head.map((h, i) => `<th scope="col" class="${numeric.includes(i) ? "num" : ""}">${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td class="${numeric.includes(i) ? "num" : ""}">${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

/* The results panel's tables share one context: the result, its display units and the scales
   that set each column's significant figures. */
function resultContext(r) {
  const p = r.props, red = r.reduced;
  const lenScale = Math.max(p.extent, 1);
  const forceScale = Math.max(...r.fasteners.map((q) => Math.max(q.shear.Rs, Math.abs(q.axial.T))), Math.hypot(red.Fx, red.Fy, red.Fz), 0);
  const momScale = Math.max(Math.abs(red.shear.Mz), Math.hypot(red.axial.Mx, red.axial.My), forceScale * lenScale);
  const secScale = Math.max(p.J, p.Ixx + p.Iyy);
  return { r, p, red, L: units("length"), F: units("force"), M: units("moment"), S: units("section"), lenScale, forceScale, momScale, secScale };
}
const selectButton = (q) => `<button class="btn" type="button" data-select="${esc(q.id)}">${esc(q.id)}</button>`;
const msCell = (m) => (m.status === "ok" ? `<span class="${m.ms < 0 ? "ms-neg" : ""}">${f(m.ms)}</span>` : `<span class="muted">${esc(marginText(m))}</span>`);

function centroidsTable({ p, L, lenScale }) {
  const colours = palette(canvas());
  return table(["", "Centroid", `x (${L})`, `y (${L})`, "Weight", "Used for"],
    p.centroids.map((c) => [
      centroidSvg(c.key, colours[CENTROID_STYLE[c.key].colour]),
      `${esc(c.name)} <b>${c.key}</b>${c.key === "Cs" ? ' <span class="tag">CG</span>' : ""}${c.coincidentWith.length ? ` <span class="tag">coincident with ${c.coincidentWith.join(", ")}</span>` : ""}`,
      f(c.x, lenScale), f(c.y, lenScale), c.weight, esc(c.usedFor),
    ]), { numeric: [2, 3] });
}

function propertiesTable({ p, S, secScale }) {
  return table(["Property", "Value", "Unit"], [
    ["J about Cs", f(p.J, secScale), S], ["Ixx about Ca", f(p.Ixx, secScale), S], ["Iyy about Ca", f(p.Iyy, secScale), S],
    ["Ixy about Ca", f(p.Ixy, secScale), S], ["I₁ (major)", f(p.principal.I1, secScale), S], ["I₂ (minor)", f(p.principal.I2, secScale), S],
    ["θp, CCW from +x to the I₁ axis", f(p.principal.thetaDeg, 360), "°"], ["Σks", f(p.Ks), ""], ["Σka", f(p.Ka), ""],
  ], { numeric: [1] });
}

function reducedLoadTable({ red, F, M, lenScale, forceScale, momScale }) {
  return table(["Component", "Value", "Unit", "Reduced to", "Transfer"], [
    ["Fx", f(red.Fx, forceScale), F, "", ""], ["Fy", f(red.Fy, forceScale), F, "", ""], ["Fz", f(red.Fz, forceScale), F, "", ""],
    ["Mz,s", f(red.shear.Mz, momScale), M, `Cs (${f(red.shear.Q.x, lenScale)}, ${f(red.shear.Q.y, lenScale)}, 0)`, `Mz + rx·Fy − ry·Fx; rx = ${f(red.shear.rx, lenScale)}, ry = ${f(red.shear.ry, lenScale)}`],
    ["Mx,a", f(red.axial.Mx, momScale), M, `Ca (${f(red.axial.Q.x, lenScale)}, ${f(red.axial.Q.y, lenScale)}, 0)`, `Mx + ry·Fz − zp·Fy; ry = ${f(red.axial.ry, lenScale)}, zp = ${f(red.axial.zp, lenScale)}`],
    ["My,a", f(red.axial.My, momScale), M, `Ca (${f(red.axial.Q.x, lenScale)}, ${f(red.axial.Q.y, lenScale)}, 0)`, `My + zp·Fx − rx·Fz; rx = ${f(red.axial.rx, lenScale)}, zp = ${f(red.axial.zp, lenScale)}`],
  ], { numeric: [1] });
}

function fastenerLoadsTable({ r, F, forceScale }) {
  const maxRs = Math.max(...r.fasteners.map((q) => q.shear.Rs));
  const maxT = Math.max(...r.fasteners.map((q) => q.axial.T));
  return table(["Fastener", `Rdx (${F})`, `Rdy (${F})`, `Rtx (${F})`, `Rty (${F})`, `Rs (${F})`, "Direction", `T (${F})`, "State"],
    r.fasteners.map((q) => {
      const tags = [];
      if (q.shear.Rs === maxRs && maxRs > 0) tags.push('<span class="tag">max shear</span>');
      if (q.axial.T === maxT && maxT > 0) tags.push('<span class="tag tension">max tension</span>');
      const st = q.axial.unloading ? '<span class="tag unloading">unloading</span>' : q.axial.T > 1e-9 * forceScale ? "tension" : "—";
      return [`${selectButton(q)} ${tags.join("")}`,
        f(q.shear.Rdx, forceScale), f(q.shear.Rdy, forceScale), f(q.shear.Rtx, forceScale), f(q.shear.Rty, forceScale),
        `<b>${f(q.shear.Rs, forceScale)}</b>`, q.shear.Rs > 0 ? `${f(q.shear.angleDeg, 360)}°` : "—", f(q.axial.T, forceScale), st];
    }), { numeric: [1, 2, 3, 4, 5, 6, 7] });
}

function marginsTable({ r, F, forceScale }) {
  return table(["Fastener", `Rs (${F})`, `Rt (${F})`, `Fs (${F})`, `Ft (${F})`, "IF(1)", "k*", "MS interaction", "Governing MS"],
    r.fasteners.map((q) => {
      const m = q.checks.modes.find((x) => x.mode === "interaction");
      const crit = r.critical && r.critical.id === q.id ? ' <span class="tag unloading">critical</span>' : "";
      const zero = q.axial.unloading ? ' <span class="tag">T counted as 0</span>' : "";
      const evaluated = m.status !== "not-evaluated";
      return [`${selectButton(q)}${crit}`,
        f(m.Rs, forceScale), `${f(m.Rt, forceScale)}${zero}`, evaluated ? f(m.Fs) : "—", evaluated ? f(m.Ft) : "—",
        evaluated && Number.isFinite(m.IF1) ? f(m.IF1) : "—", m.status === "ok" ? f(m.kStar) : "—", msCell(m),
        q.checks.governing ? `<b>${Number.isFinite(q.checks.governing.ms) ? f(q.checks.governing.ms) : "∞"}</b> <span class="muted">(${esc(q.checks.governing.label)})</span>` : '<span class="muted">—</span>'];
    }), { numeric: [1, 2, 3, 4, 5, 6] });
}

/* The critical fastener's line, or why no margin was evaluated. */
function criticalLine({ r }) {
  const it = r.interaction;
  const none = r.critical ? null : noMarginSummary(r.fasteners.map((q) => q.checks));
  return r.critical
    ? `<p class="critical">Critical fastener <b>${esc(r.critical.id)}</b>: governing MS <b class="ms ${r.critical.ms < 0 ? "ms-neg" : ""}">${f(r.critical.ms)}</b> — ${esc(r.critical.label)}${r.critical.mode === "interaction" && (it.a !== 1 || it.b !== 1) ? ` <span class="muted">(exact load scale factor, not 1/IF − 1; W-006)</span>` : ""}.</p>`
    : none.unloaded.length || none.blocked.length
    ? `<p class="critical muted">${esc(none.text)}</p>`
    : `<p class="critical muted">No margin evaluated: enter shear and tension allowables Fs and Ft (group defaults or per-fastener overrides). A check without its allowable shows “not evaluated” and never a margin.</p>`;
}

/* Bolt tension with prying and preload; empty when neither is on. */
function boltTensionTable({ r, F, forceScale }) {
  const ts = r.tensionSettings;
  if (!ts.prying && !ts.preload) return "";
  const head = ["Fastener", `T external (${F})`];
  if (ts.prying) head.push("Prying", "α'", `Q (${F})`);
  if (ts.preload) head.push(`P_max + φT (${F})`, `Clamp force (${F})`, `Separation at T (${F})`);
  head.push(`Bolt load F_b (${F})`, "Joint");
  return table(head, r.fasteners.map((q) => {
    const t = q.checks.tension, c = q.checks.clamp;
    const row = [selectButton(q), f(t.Text, forceScale)];
    if (ts.prying) {
      const pm = t.prying;
      row.push(pm.method === "manual" ? `manual × ${f(pm.factor)}` : pm.method === "t-stub" ? (t.Text > 0 ? "T-stub" : "T-stub (no tension)") : "—",
        pm.method === "t-stub" && pm.alphaRaw !== null ? `${f(pm.alpha)}${pm.alphaRaw !== pm.alpha ? ` <span class="muted">(${f(pm.alphaRaw)} clamped)</span>` : ""}` : "—",
        f(t.Q, forceScale));
    }
    if (ts.preload) row.push(f(t.preload.shared, forceScale), `${f(t.preload.clamp, forceScale)}`, f(t.preload.separationLoad, forceScale));
    row.push(`<b>${f(t.Fb, forceScale)}</b>`, c.status === "separated" ? '<span class="tag unloading">separated</span>' : c.status === "clamped" ? "clamped" : "—");
    return row;
  }), { numeric: [1, 2, 3, 4, 5, 6, 7, 8] });
}

/* Bearing and tear-out for every plate a fastener bears on; empty when no plate is checked. */
function plateChecksTable({ r, F, L, lenScale }) {
  const plateIds = [...new Set(r.fasteners.flatMap((q) => q.checks.modes.filter((m) => m.plate).map((m) => m.plate)))];
  if (!plateIds.length) return "";
  return table(["Fastener", "Plate", `Bearing capacity (${F})`, "MS bearing", "Bears towards", `e (${L})`, "e/D", `Tear-out capacity (${F})`, "MS tear-out"],
    r.fasteners.flatMap((q) => plateIds.map((pid) => {
      const b = q.checks.modes.find((m) => m.mode === "bearing" && m.plate === pid);
      const t = q.checks.modes.find((m) => m.mode === "tearout" && m.plate === pid);
      const gov = q.checks.governing && q.checks.governing.plate === pid ? ' <span class="tag">governing</span>' : "";
      return [selectButton(q), `${esc(pid)}${gov}`,
        b.capacity !== undefined ? `${f(b.capacity)} <span class="muted">(${esc(b.basis)})</span>` : "—", msCell(b),
        t.e !== undefined ? esc(t.bearsTowards) : "—", t.e !== undefined ? f(t.e, lenScale) : "—",
        t.eOverD !== undefined && t.eOverD !== null ? `${f(t.eOverD)}${t.minRatio !== null && t.eOverD < t.minRatio ? ' <span class="tag unloading">below min</span>' : ""}` : "—",
        t.capacity !== undefined ? f(t.capacity) : "—", msCell(t)];
    })), { numeric: [5, 6, 7] });
}

/* The ICR summary and its per-fastener comparison with the elastic result; empty without ICR. */
function icrSection({ r, F, M, L, lenScale, forceScale }) {
  const ic = r.icr;
  if (!ic) return "";
  if (ic.status !== "converged") {
    return `<p class="blocked">ICR not converged (W-014): ${esc(ic.reason)}${ic.residual !== null && ic.residual !== undefined ? `, residual ${fmt(ic.residual, 3)}` : ""}. No ICR numbers are shown; the elastic result remains.${r.designBasis === "icr" ? " The checks on the ICR basis are not computed." : ""}</p>`;
  }
  if (ic.mode === "no-shear") {
    return `<p class="note">${esc(ic.modelLabel)}; no in-plane load (Fx = Fy = Mz,s = 0), so every ICR shear is zero and the checks use Rs = 0.</p>`;
  }
  const where = ic.mode === "translation" ? "at infinity (uniform translation: the translation loads balance the applied moment)"
    : `at (${f(ic.icr.x, lenScale)}, ${f(ic.icr.y, lenScale)}) ${L}${ic.mode === "pure-moment" ? " (pure moment)" : ""}${ic.offLine ? " — moved off the search line to balance an asymmetric group" : ""}`;
  const cmp = r.comparison;
  const icrRows = table(["Fastener", `ρ (${L})`, `Δ (${L})`, `R ultimate (${F})`, `Rs at applied load (${F})`, `Elastic Rs (${F})`, "ICR vs elastic"],
    r.fasteners.map((q) => {
      const u = q.icr.ultimate, a = q.icr.atLoad;
      const change = q.shear.Rs > 0 ? a.Rs / q.shear.Rs - 1 : null;
      const gov = ic.governing === q.id ? ' <span class="tag">governs Δmax</span>' : "";
      return [`${selectButton(q)}${gov}`,
        Number.isFinite(u.rho) ? f(u.rho, lenScale) : "∞", f(u.delta), f(u.R), `<b>${f(a.Rs, forceScale)}</b>`, f(q.shear.Rs, forceScale),
        change === null ? "—" : `${change >= 0 ? "+" : "−"}${f(Math.abs(change) * 100, 100)}%`];
    }), { numeric: [1, 2, 3, 4, 5, 6] });
  return `
        <ul class="stats-row">
          <li><b>${f(ic.gamma)}</b><span>γ_ult = ${ic.mode === "pure-moment" ? "M_u/|Mz,s|" : "P_u/|F|"}</span></li>
          <li><b class="${ic.margin < 0 ? "ms-neg" : ""}">${f(ic.margin)}</b><span>ICR margin γ_ult − 1 (ultimate capacity; not comparable to allowable MS)</span></li>
          <li><b>${ic.mode === "pure-moment" ? `${f(ic.Mu)} ${M}` : `${f(ic.Pu)} ${F}`}</b><span>${ic.mode === "pure-moment" ? "M_u" : "P_u"}, ultimate load</span></li>
          <li><b>${esc(ic.governing)}</b><span>governing fastener (smallest Δmax/ρ)</span></li>
        </ul>
        <p class="note">${esc(ic.modelLabel)}; ICR ${where}. ${ic.iterations} iterations, residual ${fmt(ic.residual, 2)}. Reactions at the applied load are the ultimate reactions ÷ γ_ult (proportional scaling convention${r.designBasis === "icr" ? ", W-015" : ""}).</p>
        ${cmp ? `<p class="critical">Critical-fastener load: elastic <b>${esc(cmp.elasticCritical.id)}</b> ${f(cmp.elasticCritical.Rs)} ${F} vs ICR <b>${esc(cmp.icrCritical.id)}</b> ${f(cmp.icrCritical.Rs)} ${F}${cmp.change === null ? "" : ` — <b class="${cmp.change > 0 ? "ms-neg" : ""}">${cmp.change >= 0 ? "+" : "−"}${f(Math.abs(cmp.change) * 100, 100)}%</b>`}. Checks use the <b>${r.designBasis === "icr" ? "ICR" : "elastic"}</b> basis.</p>` : ""}
        ${icrRows}`;
}

function closureTable({ r }) {
  return table(["Equilibrium check", "Residual", "Relative", ""],
    r.closure.checks.map((c) => [esc(c.name), fmt(c.residual, 3), c.relative.toExponential(1), c.pass ? '<span class="pass">pass</span>' : '<span class="fail">fail</span>']),
    { numeric: [1, 2] });
}

/* How the out-of-plane tension was found, for the fastener-loads note. */
function axialMethodNote({ r, F, M, lenScale, forceScale, momScale, secScale }) {
  return r.axial.mode === "contact-edge"
    ? `Method (b), contact edge: the ${EDGES[r.axial.edge].label} of ${r.axial.plateId} is the neutral axis. M_L = ${f(r.axial.ML, momScale)} ${M} (reduced to (${f(r.axial.Q.x, lenScale)}, ${f(r.axial.Q.y, lenScale)}, 0)), Σka·d² = ${f(r.axial.S)}, contact reaction C = ${f(r.axial.C, forceScale)} ${F}.`
    : r.axial.mode === "general"
    ? `Method (a): D = ${f(r.axial.D, secScale * secScale)}, θx = ${f(r.axial.thetaX)}, θy = ${f(r.axial.thetaY)}.`
    : r.axial.mode === "collinear" ? "Method (a), collinear pattern: bending resisted about the pattern's major principal axis only." : "Method (a): all fasteners at one point; only Fz is resisted.";
}

function renderResults() {
  const r = state.result;
  const out = $("#results");
  if (!r.ok) {
    const n = r.issues.filter((i) => i.tier === "error").length;
    out.innerHTML = `<p class="blocked">No results: ${n} error${n === 1 ? "" : "s"} must be fixed first (see Warnings). Errors block every result so no number is shown that the checks rejected.</p>`;
    return;
  }
  const c = resultContext(r), it = r.interaction, ts = r.tensionSettings;
  const centroids = centroidsTable(c), props = propertiesTable(c), reduced = reducedLoadTable(c), per = fastenerLoadsTable(c);
  const checks = marginsTable(c), crit = criticalLine(c), tensionTable = boltTensionTable(c), plateTable = plateChecksTable(c);
  const icrHtml = icrSection(c), closure = closureTable(c), axialNote = axialMethodNote(c);

  out.innerHTML = `
    <div class="results-grid">
      <div><h3>Centroids</h3>${centroids}</div>
      <div><h3>Section properties</h3>${props}</div>
    </div>
    <h3 style="margin-top:1.25rem">Reduced load</h3>${reduced}
    <h3 style="margin-top:1.25rem">Fastener loads — elastic</h3>
    <p class="note">In-plane: direct Rd plus torsional Rt about Cs, resultant Rs and its direction CCW from +x. Out-of-plane: T by ${esc(axialNote)} Positive T is tension; unloading fasteners are shown as computed.</p>
    ${per}
    ${tensionTable ? `<h3 style="margin-top:1.25rem">Bolt tension — ${[ts.prying ? `prying from ${esc(ts.flangePlate || "?")}` : "", ts.preload ? "preload" : ""].filter(Boolean).join(" and ")}</h3>
    <p class="note">F_b replaces T in the interaction and is recomputed at every load multiplier k; preload does not scale. Prying acts on positive external tension only.</p>${tensionTable}` : ""}
    <h3 style="margin-top:1.25rem">Margins of safety — ${r.designBasis === "icr" ? "ICR" : "elastic"} basis, exponents (a, b) = (${f(it.a)}, ${f(it.b)})</h3>
    ${crit}
    <p class="note">IF(1) is the plain interaction value at the applied load; k* is the load multiplier at which IF(k*) = 1, and MS = k* − 1. Rt is the bolt tension: the positive external tension plus prying, through preload when enabled; unloading counts as zero external tension${ts.preload ? ", so the bolt load is P_max" : ""}.</p>
    ${checks}
    ${plateTable ? `<h3 style="margin-top:1.25rem">Bearing and tear-out, per plate</h3>
    <p class="note">Rs on the ${r.designBasis === "icr" ? "ICR" : "elastic"} basis. The loaded plate (${esc(r.fasteners.length ? state.pattern.load.appliedPlate : "")}) bears against the −R side of each hole and the other plate against +R; the tear-out ray follows that direction to the plate edge.</p>${plateTable}` : ""}
    ${r.icr ? `<h3 style="margin-top:1.25rem">ICR method and elastic vs ICR</h3>${icrHtml}` : ""}
    <h3 style="margin-top:1.25rem">Equilibrium closure (tolerance ${r.closure.tol} relative)</h3>${closure}`;
}

function renderIssues() {
  const issues = sortIssues([...state.importIssues, ...state.result.issues]);
  const count = (t) => issues.filter((i) => i.tier === t).length;
  $("#issue-counts").innerHTML = `<span>${count("error")} errors</span><span>${count("warning")} warnings</span><span>${count("note")} notes</span>`;
  $("#issues").innerHTML = issues.length ? issues.map((i) => `
    <li class="${i.tier}"><span class="id">${i.id}</span><b>${esc(i.title)}</b>${i.fasteners?.length ? ` — ${i.fasteners.map((id) => `<button class="link" type="button" data-select="${esc(id)}">${esc(id)}</button>`).join(", ")}` : ""}${i.field && !i.fastener ? ` — <code>${esc(i.field)}</code>` : ""}${i.fastener && i.field ? ` <code>${esc(i.field)}</code>` : ""}
    <span class="detail">${esc(i.detail)}</span></li>`).join("") : `<li class="note">No warnings.</li>`;
}

/* Issue ids beside the field or fastener they name (every tier also appears in the list above). */
function renderInline() {
  for (const el of $$(".inline-issue")) el.remove();
  const issues = [...state.importIssues, ...state.result.issues];
  const badge = (i) => `<span class="inline-issue ${i.tier}" title="${esc(`${i.title}: ${i.detail}`)}">${i.id}</span>`;
  const add = (target, i) => {
    if (!target || target.querySelector(`.inline-issue[data-id="${i.id}"]`)) return;
    target.insertAdjacentHTML("beforeend", badge(i).replace("<span ", `<span data-id="${i.id}" `));
  };
  for (const i of issues) {
    if (i.fasteners?.length) {
      for (const id of i.fasteners) add($(`#fastener-rows tr[data-row="${CSS.escape(id)}"] th`), i);
    } else if (i.field) {
      const input = $(`[data-path="${CSS.escape(i.field)}"]`) || $(`[data-field="${CSS.escape(i.field)}"]`);
      const target = input ? input.closest("label")?.querySelector("span") : i.field === "settings.interaction" ? $("#interaction-card h3") : null;
      add(target, i);
    }
  }
}

function renderPresets() {
  const it = state.pattern.settings.interaction || {};
  for (const b of $$("[data-preset]")) {
    const p = PRESETS[b.dataset.preset];
    b.setAttribute("aria-pressed", String(it.a === p.a && it.b === p.b));
  }
}

/* ---------- hand calculations (the calculation trace, worked into the group steps) ---------- */

const handOf = () => handCalc(state.pattern, state.result, { precision: precision(), fastenerId: state.traceId });

function handBlock(b) {
  if (b.p != null) return `<p>${esc(b.p)}</p>`;
  if (b.list) return `<ul>${b.list.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`;
  if (b.steps) return table(["Step", "Formula", "Substituted", "Value", "Unit"], b.steps.map((l) => [esc(l.label), `<code>${esc(l.formula)}</code>`, esc(l.substituted), esc(l.text), esc(l.unit)]), { numeric: [3] });
  return table(b.table.head.map(esc), b.table.rows.map((r) => r.map(esc)), { numeric: b.table.numeric });
}

function renderTrace() {
  const r = state.result;
  const pick = $("#trace-fastener");
  const out = $("#trace");
  if (!r.ok) {
    pick.innerHTML = ""; pick.disabled = true;
    out.innerHTML = `<p class="blocked">No hand calculations: the pattern has errors.</p>`;
    return;
  }
  const gov = traceFastenerId(r);
  const ids = r.fasteners.map((q) => q.id);
  const current = ids.includes(state.traceId) ? state.traceId : gov;
  pick.disabled = false;
  pick.innerHTML = ids.map((id) => `<option value="${esc(id)}"${id === current ? " selected" : ""}>${esc(id)}${id === gov ? " (governing)" : ""}</option>`).join("");
  out.innerHTML = handOf().sections.map((sec) => `<h3>${esc(sec.title)}</h3>${sec.frames.map((fr) => `<h4>${esc(fr.title)}</h4>${fr.blocks.map(handBlock).join("")}`).join("")}`).join("");
}

/* ---------- hand-calculation Markdown and the beamdswitch deck ----------
   Save and Copy are separate buttons: a blocked download fails silently, so Copy is the explicit fallback. */

const handMarkdown = () => handCalcMarkdown(state.pattern, state.result, { precision: precision(), fastenerId: state.traceId, date: today() });
const deckText = () => globalThis.Beamdswitch.deck(deckReport(state.pattern, state.result, { precision: precision(), fastenerId: state.traceId, date: today(), verification: runVerification() }));

function message(id, text, kind = "") {
  const el = $(`#${id}`);
  el.textContent = text;
  el.className = `msg ${kind}`;
}
function showFallback(label, text) {
  $("#fallback").hidden = false;
  $("#fallback-label").textContent = label;
  const ta = $("#fallback-text");
  ta.value = text;
  ta.focus(); ta.select();
}
function saveText(text, filename, msg, done) {
  try {
    download(text, filename, "text/markdown");
    message(msg, done, "ok");
  } catch (e) {
    message(msg, `Could not save: ${e.message}. Use ${msg === "hand-msg" ? "Copy Markdown" : "Copy deck"} instead.`, "bad");
  }
}
async function copyText(text, msg, done, what) {
  try {
    if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error("no clipboard API");
    await navigator.clipboard.writeText(text);
    message(msg, done, "ok");
  } catch (e) {
    showFallback(`Clipboard access is blocked; the ${what} is selected below. Press Ctrl+C or ⌘C.`, text);
    message(msg, `Clipboard access is blocked; the ${what} is shown under Reports to copy by hand.`, "bad");
  }
}
const handFile = () => `${slug(state.pattern.name)}-hand-calculations.md`;
const deckFile = () => `${slug(state.pattern.name)}-beamdswitch.md`;
const saveHand = () => saveText(handMarkdown(), handFile(), "hand-msg", `Saved ${handFile()}; beamdswitch also opens it as a deck.`);
const copyHand = () => copyText(handMarkdown(), "hand-msg", "Copied the hand calculations as Markdown.", "Markdown");
const saveDeck = () => saveText(deckText(), deckFile(), "io-msg", `Saved ${deckFile()}: open it in beamdswitch.`);
const copyDeck = () => copyText(deckText(), "io-msg", "Copied the beamdswitch deck: paste it into beamdswitch.", "deck");

/* ---------- reports ---------- */

function renderPageSize() {
  const size = state.pattern.settings.pageSize === "Letter" ? "letter" : "A4";
  $("#page-style").textContent = `@page{size:${size};margin:14mm}`;
}

const today = () => new Date().toISOString().slice(0, 10);

function buildPrintReport() {
  renderPageSize();
  const v = runVerification();
  $("#print-report").innerHTML = reportHtml(state.pattern, state.result, { date: today(), precision: precision(), verification: v });
}

function exportPng() {
  const el = canvas();
  const rect = el.getBoundingClientRect();
  const width = Math.max(600, Math.round(rect.width)), height = Math.max(400, Math.round(rect.height));
  const scene = buildScene(state.pattern, state.result, { width, height });
  const extra = legendHeight(scene);
  const out = document.createElement("canvas");
  out.width = width * 2; out.height = (height + extra) * 2;
  const ctx = out.getContext("2d");
  ctx.setTransform(2, 0, 0, 2, 0, 0);
  const colours = { ...palette(el), bg: "#ffffff", fg: "#1d1d1f", muted: "#6e6e73", faint: "#a1a1a6", grid: "#e8e8ed", surface: "#f5f5f7", reaction: "#1d1d1f" };
  ctx.fillStyle = colours.bg; ctx.fillRect(0, 0, width, height + extra);
  paint(ctx, scene, colours, { snapOn: false });
  paintLegend(ctx, scene, colours, height);
  out.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${slug(state.pattern.name)}.png`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/png");
}

/* ---------- verification ---------- */

function renderVerification() {
  const v = runVerification();
  $("#verify-results").innerHTML = `
    <p><span class="${v.pass ? "pass" : "fail"}">${v.passed} pass${v.failed ? `, ${v.failed} fail` : ""}</span> of ${v.results.length} cases · set ${esc(v.set)} · closed-form tolerance ${v.tol} relative (or the stated ± where the specification rounds) · tool ${esc(TOOL_VERSION)}</p>
    ${v.results.map((r) => `<details class="verify-case"><summary><span class="${r.status}">${r.status}</span> <b>${esc(r.id)}</b> ${esc(r.title)}</summary>
      ${r.error ? `<p class="fail">${esc(r.error)}</p>` : table(["Check", "Actual", "Expected", "Tolerance", ""], r.checks.map((c) => [
        esc(c.label), typeof c.actual === "number" ? String(Number(c.actual.toPrecision(10))) : esc(c.actual),
        typeof c.expected === "number" ? String(Number(c.expected.toPrecision(10))) : esc(c.expected), esc(c.tol), c.pass ? '<span class="pass">pass</span>' : '<span class="fail">fail</span>']), { numeric: [1, 2] })}
    </details>`).join("")}`;
}

/* ---------- generators ---------- */

const GEN_FIELDS = {
  rect: [["nx", "Columns", 2], ["ny", "Rows", 2], ["sx", "Column pitch", 100, "length"], ["sy", "Row pitch", 60, "length"], ["cx", "Centre x", 0, "length"], ["cy", "Centre y", 0, "length"]],
  stagger: [["rows", "Rows", 2], ["perRow", "Per row", 3], ["sx", "Pitch", 60, "length"], ["sy", "Gauge (row spacing)", 40, "length"], ["cx", "Centre x", 0, "length"], ["cy", "Centre y", 0, "length"]],
  circle: [["n", "Fasteners", 6], ["r", "Radius", 50, "length"], ["startDeg", "First at (° from +x)", 0], ["cx", "Centre x", 0, "length"], ["cy", "Centre y", 0, "length"]],
  mirror: [["c", "Line position", 0, "length"]],
};
const genValues = {};

function renderGenerator() {
  const kind = $("#gen-kind").value;
  const fields = GEN_FIELDS[kind];
  const vals = genValues[kind] ??= Object.fromEntries(fields.map(([k, , v]) => [k, v]));
  $("#gen-fields").innerHTML = `
    ${kind === "mirror" ? `<div class="row"><label class="f"><span>Mirror about</span><select id="gen-axis"><option value="x">vertical line x = c</option><option value="y">horizontal line y = c</option></select></label>
      <label class="f"><span>Mirror</span><select id="gen-scope"><option value="all">all fasteners</option><option value="selected">selected fastener</option></select></label></div>` : ""}
    <div class="row three">${fields.map(([k, label, , kindU]) => `<label class="f"><span>${esc(label)}${kindU ? ` (${units(kindU)})` : ""}</span><input type="number" step="any" data-gen="${k}" value="${esc(vals[k])}"></label>`).join("")}</div>`;
  if (kind === "mirror") {
    $("#gen-axis").value = vals.axis || "x";
    $("#gen-scope").value = vals.scope || "all";
  }
  $("#gen-replace").hidden = kind === "mirror";
  $("#gen-append").textContent = kind === "mirror" ? "Add mirror images" : "Add to pattern";
  $("#gen-error").textContent = "";
}

function runGenerator(replace) {
  const kind = $("#gen-kind").value;
  const vals = genValues[kind];
  for (const el of $$("[data-gen]")) vals[el.dataset.gen] = Number(el.value);
  if (kind === "mirror") { vals.axis = $("#gen-axis").value; vals.scope = $("#gen-scope").value; }
  const intKeys = ["nx", "ny", "rows", "perRow", "n"];
  try {
    for (const k of intKeys) if (k in vals && !Number.isInteger(vals[k])) throw new Error("Counts must be whole numbers.");
    let points, sources = null;
    if (kind === "rect") points = rectangularArray(vals);
    else if (kind === "stagger") points = staggeredRows(vals);
    else if (kind === "circle") points = boltCircle(vals);
    else {
      sources = state.pattern.fasteners.filter((q) => typeof q.x === "number" && typeof q.y === "number" && (vals.scope === "all" || q.id === state.selected));
      if (!sources.length) throw new Error(vals.scope === "all" ? "There are no fasteners to mirror." : "Select a fastener to mirror.");
      const imgs = sources.map((q) => mirror([q], { axis: vals.axis, c: vals.c, existing: [] })[0]);
      const taken = state.pattern.fasteners.filter((q) => typeof q.x === "number").map((q) => ({ x: q.x, y: q.y }));
      points = [];
      imgs.forEach((p, i) => {
        if (taken.some((t) => Math.hypot(t.x - p.x, t.y - p.y) <= 1e-9 * Math.max(1, Math.abs(p.x), Math.abs(p.y)))) return;
        taken.push(p);
        points.push({ ...p, from: sources[i] });
      });
      if (!points.length) throw new Error("Every mirror image lands on an existing fastener.");
    }
    if (replace) state.pattern.fasteners = [];
    for (const p of points) {
      addFastener(state.pattern, p.x, p.y, p.from ? { label: p.from.label, overrides: clone(p.from.overrides || {}) } : {});
    }
    state.selected = null;
    $("#gen-error").textContent = `${replace ? "Replaced the pattern with" : "Added"} ${points.length} fastener${points.length === 1 ? "" : "s"}.`;
    changed({ structure: true });
  } catch (e) {
    $("#gen-error").textContent = e.message;
  }
}

/* ---------- files and library ---------- */

function slug(name) {
  return (name || "pattern").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "pattern";
}

function download(text, filename, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const exportJSON = () => download(toJSON(state.pattern), `${slug(state.pattern.name)}.json`, "application/json");
/* Markdown report: the trace is for the governing fastener, and the footer cites the verification run. */
const markdownOf = (pattern = state.pattern, result = state.result) => toMarkdown(pattern, result, { version: TOOL_VERSION, date: today(), verification: runVerification() });
const exportMarkdown = () => download(markdownOf(), `${slug(state.pattern.name)}.md`, "text/markdown");

/* Resolve a library name collision: "overwrite", "keep" or "cancel". */
function askCollision(name) {
  const dialog = $("#collision");
  $("#collision-text").textContent = `“${name}” is already in the library. Overwrite it, keep both (the new one gets a numbered name), or cancel?`;
  if (typeof dialog.showModal !== "function") {
    return Promise.resolve(confirm(`“${name}” is already in the library. OK overwrites it; Cancel keeps both.`) ? "overwrite" : "keep");
  }
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue || "cancel"), { once: true });
    dialog.returnValue = "";
    dialog.showModal();
  });
}

/* Put `pattern` in the library under its name, asking on a collision. Returns the stored name or null. */
async function saveToLibrary(pattern) {
  const lib = readLibrary();
  let name = pattern.name;
  if (name in lib) {
    const choice = await askCollision(name);
    if (choice === "cancel") return null;
    if (choice === "keep") name = uniqueName(name, Object.keys(lib));
  }
  const stored = { ...clone(pattern), name };
  lib[name] = { pattern: JSON.parse(toJSON(stored)), saved: new Date().toISOString() };
  try {
    writeLibrary(lib);
    storageProblem(null);
  } catch (e) {
    storageProblem(e);
    return null;
  }
  return name;
}

function loadPattern(pattern, issues = []) {
  state.pattern = pattern;
  state.selected = null;
  state.importIssues = issues;
  if (!Number.isFinite(state.snap.step) || state.snap.unitSystem !== pattern.unitSystem) {
    state.snap = { on: state.snap.on, step: SNAP_DEFAULT[pattern.unitSystem], unitSystem: pattern.unitSystem };
  }
  renderAll();
  renderGenerator();
}

async function importFile(file) {
  const text = await file.text();
  const parsed = parsePatternFile(text, file.name);
  if (!parsed.pattern) {
    state.importIssues = parsed.issues.map((i) => ({ ...i, detail: `${file.name}: ${i.detail}${/not loaded/.test(i.detail) ? "" : " The file was not loaded."}` }));
    renderIssues();
    $("#warnings-h").scrollIntoView({ block: "start" });
    return;
  }
  const name = await saveToLibrary(parsed.pattern);
  if (name === null) {
    if (!$("#storage-banner").hidden) loadPattern(parsed.pattern, parsed.issues); // storage failed: still open it
    return;
  }
  parsed.pattern.name = name;
  loadPattern(parsed.pattern, parsed.issues.map((i) => ({ ...i, detail: `${file.name}: ${i.detail}` })));
  renderLibrary();
  $("#library").value = name;
}

/* ---------- bindings ---------- */

function bind() {
  $("#name").addEventListener("input", (e) => { state.pattern.name = e.target.value; autosave(); });
  $("#precision").addEventListener("input", (e) => {
    const v = parseInput(e.target.value);
    state.pattern.settings.precision = typeof v === "number" ? v : state.pattern.settings.precision;
    changed();
  });
  for (const b of $$("[data-units]")) {
    b.addEventListener("click", () => {
      const to = b.dataset.units;
      if (to === state.pattern.unitSystem || !UNIT_SYSTEMS.includes(to)) return;
      state.pattern = convertPattern(state.pattern, to);
      state.snap = { on: state.snap.on, step: SNAP_DEFAULT[to], unitSystem: to };
      changed({ structure: true });
      renderGenerator();
    });
  }
  $("#new-example").addEventListener("click", () => loadPattern(examplePattern(state.pattern.unitSystem)));

  for (const el of $$("[data-path]")) {
    const handler = () => {
      const value = el.type === "checkbox" ? el.checked : el.tagName === "SELECT" ? el.value : parseInput(el.value);
      setPath(state.pattern, el.dataset.path, value);
      if (el.type === "checkbox") { renderToggles(); renderOverrides(); }
      if (el.dataset.path === "settings.axialMethod") {
        if (value === "contact-edge") suggestEdge(false);
        renderToggles();
      }
      if (el.dataset.path === "load.appliedPlate") renderPlates();
      if (el.dataset.path === "settings.icr.model") renderToggles();
      if (el.dataset.path === "settings.designBasis" && value === "icr" && !state.pattern.settings.icr?.enabled) {
        state.pattern.settings.icr = { ...(state.pattern.settings.icr || {}), enabled: true };
        $('[data-path="settings.icr.enabled"]').checked = true;
        renderToggles(); renderOverrides();
      }
      changed();
    };
    el.addEventListener(el.tagName === "SELECT" || el.type === "checkbox" ? "change" : "input", handler);
  }
  $("#add-plate").addEventListener("click", () => {
    if (state.pattern.plates.length >= 2) return;
    const first = state.pattern.plates[0];
    const used = new Set(state.pattern.plates.map((p) => p.id));
    const id = used.has("P2") ? "P3" : "P2";
    const base = first ? { ...clone(first), id, bearingAllowable: null, bearingLoadAllowable: null, shearOutAllowable: null, minEdgeRatio: null, flangeStrength: null } : { ...defaultPlate(id) };
    state.pattern.plates.push(base);
    changed({ structure: true });
  });
  $("#plates").addEventListener("click", (e) => {
    const i = e.target.closest("[data-remove-plate]")?.dataset.removePlate;
    if (i === undefined) return;
    const [gone] = state.pattern.plates.splice(Number(i), 1);
    if (state.pattern.load.appliedPlate === gone.id) state.pattern.load.appliedPlate = state.pattern.plates[0]?.id ?? "";
    if (state.pattern.settings.contactEdge?.plateId === gone.id) state.pattern.settings.contactEdge.plateId = state.pattern.plates[0]?.id ?? "";
    changed({ structure: true });
  });
  $("#edge-suggest").addEventListener("click", () => { suggestEdge(true); changed({ structure: true }); });
  $("#override-editor").addEventListener("input", (e) => {
    const path = e.target.dataset.ov;
    const fa = state.pattern.fasteners.find((q) => q.id === state.selected);
    if (!path || !fa) return;
    const v = parseInput(e.target.value);
    fa.overrides ??= {};
    const [group, key] = path.split(".");
    if (v === null) {
      if (fa.overrides[group]) {
        delete fa.overrides[group][key];
        if (!Object.keys(fa.overrides[group]).length) delete fa.overrides[group];
      }
    } else {
      fa.overrides[group] = { ...(fa.overrides[group] || {}), [key]: v };
    }
    e.target.classList.toggle("override", v !== null);
    changed();
  });
  const torqueP = () => {
    try {
      const P = preloadFromTorque(parseInput($("#tq-torque").value), parseInput($("#tq-k").value), parseInput($("#tq-d").value));
      $("#tq-out").textContent = `P = T / (K·D) = ${f(P)} ${units("force")}`;
      return P;
    } catch (err) {
      $("#tq-out").textContent = err.message;
      return null;
    }
  };
  for (const id of ["#tq-torque", "#tq-k", "#tq-d"]) $(id).addEventListener("input", torqueP);
  for (const b of $$("[data-torque]")) {
    b.addEventListener("click", () => {
      const P = torqueP();
      if (P === null) return;
      state.pattern.defaults.preload[b.dataset.torque] = round12(P);
      $(`[data-path="defaults.preload.${b.dataset.torque}"]`).value = round12(P);
      changed();
    });
  }
  $("#plates").addEventListener("input", (e) => {
    const key = e.target.dataset.plateKey;
    const i = Number(e.target.closest("[data-plate]")?.dataset.plate);
    if (!key || !state.pattern.plates[i]) return;
    state.pattern.plates[i][key] = parseInput(e.target.value);
    changed();
  });

  const rows = $("#fastener-rows");
  rows.addEventListener("input", (e) => {
    const { id, key } = e.target.dataset;
    const fa = state.pattern.fasteners.find((q) => q.id === id);
    if (!fa || !key) return;
    if (key === "label") fa.label = e.target.value;
    else if (key === "x" || key === "y") fa[key] = parseInput(e.target.value);
    else {
      const v = parseInput(e.target.value);
      fa.overrides ??= {};
      if (v === null) delete fa.overrides[key];
      else fa.overrides[key] = v;
      e.target.classList.toggle("override", v !== null);
    }
    changed();
  });
  rows.addEventListener("focusin", (e) => {
    const id = e.target.dataset?.id;
    if (id && id !== state.selected) select(id);
  });
  rows.addEventListener("click", (e) => {
    const id = e.target.closest("[data-remove]")?.dataset.remove;
    if (id) removeFastener(id);
  });
  document.addEventListener("click", (e) => {
    const id = e.target.closest("[data-select]")?.dataset.select;
    if (!id) return;
    select(id, { scroll: true });
    $(`#fastener-rows input[data-id="${CSS.escape(id)}"][data-key="x"]`)?.focus();
  });

  $("#add-fastener").addEventListener("click", () => {
    const xs = state.pattern.fasteners.filter((q) => typeof q.x === "number");
    const x = xs.length ? snapValue(Math.max(...xs.map((q) => q.x)) + (state.snap.step || 10) * 4) : 0;
    const y = xs.length ? xs[xs.length - 1].y : 0;
    const fa = addFastener(state.pattern, x, y);
    state.selected = fa.id;
    changed({ structure: true });
    $(`#fastener-rows input[data-id="${CSS.escape(fa.id)}"][data-key="x"]`)?.focus();
  });
  $("#delete-fastener").addEventListener("click", () => state.selected && removeFastener(state.selected));
  $("#fit-plate").addEventListener("click", () => {
    const pts = state.pattern.fasteners.filter((q) => typeof q.x === "number" && typeof q.y === "number");
    if (!pts.length || !state.pattern.plates.length) return;
    const D = state.pattern.defaults.diameter;
    const m = typeof D === "number" && D > 0 ? 2 * D : 0.1 * Math.max(1, ...pts.map((q) => Math.hypot(q.x, q.y)));
    Object.assign(state.pattern.plates[0], {
      xMin: round12(Math.min(...pts.map((q) => q.x)) - m), xMax: round12(Math.max(...pts.map((q) => q.x)) + m),
      yMin: round12(Math.min(...pts.map((q) => q.y)) - m), yMax: round12(Math.max(...pts.map((q) => q.y)) + m),
    });
    changed({ structure: true });
  });
  $("#snap").addEventListener("click", () => { state.snap.on = !state.snap.on; $("#snap").setAttribute("aria-pressed", String(state.snap.on)); draw(); });
  $("#snap-step").addEventListener("input", (e) => {
    const v = Number(e.target.value);
    if (Number.isFinite(v) && v >= 0) { state.snap.step = v; e.target.removeAttribute("aria-invalid"); draw(); }
    else e.target.setAttribute("aria-invalid", "true");
  });

  $("#gen-kind").addEventListener("change", renderGenerator);
  $("#gen-replace").addEventListener("click", () => runGenerator(true));
  $("#gen-append").addEventListener("click", () => runGenerator(false));

  $("#export-json").addEventListener("click", exportJSON);
  $("#storage-export").addEventListener("click", exportJSON);
  $("#export-md").addEventListener("click", exportMarkdown);
  $("#import").addEventListener("click", () => $("#import-file").click());
  $("#import-file").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) await importFile(file);
  });
  $("#lib-save").addEventListener("click", async () => {
    const name = await saveToLibrary(state.pattern);
    if (name === null) return;
    state.pattern.name = name;
    $("#name").value = name;
    autosave();
    renderLibrary();
    $("#library").value = name;
  });
  $("#lib-load").addEventListener("click", () => {
    const entry = readLibrary()[$("#library").value];
    if (!entry) return;
    const parsed = normalizePattern(entry.pattern, { lenient: true });
    if (parsed.pattern) loadPattern(parsed.pattern, parsed.issues);
    else { state.importIssues = parsed.issues; renderIssues(); }
  });
  $("#lib-delete").addEventListener("click", () => {
    const name = $("#library").value;
    const lib = readLibrary();
    if (!(name in lib) || !confirm(`Delete “${name}” from the library?`)) return;
    delete lib[name];
    try { writeLibrary(lib); } catch (e) { storageProblem(e); }
    renderLibrary();
  });
  $("#run-verify").addEventListener("click", renderVerification);
  $("#trace-fastener").addEventListener("change", (e) => { state.traceId = e.target.value; renderTrace(); });
  $("#print-report-btn").addEventListener("click", () => window.print());
  window.addEventListener("beforeprint", buildPrintReport);
  $("#export-png").addEventListener("click", exportPng);
  $("#hand-save").addEventListener("click", saveHand);
  $("#hand-copy").addEventListener("click", copyHand);
  $("#save-beamdswitch").addEventListener("click", saveDeck);
  $("#copy-beamdswitch").addEventListener("click", copyDeck);
  for (const b of $$("[data-preset]")) {
    b.addEventListener("click", () => {
      const p = PRESETS[b.dataset.preset];
      state.pattern.settings.interaction = { a: p.a, b: p.b };
      $('[data-path="settings.interaction.a"]').value = p.a;
      $('[data-path="settings.interaction.b"]').value = p.b;
      changed();
    });
  }
}

/* ---------- start ---------- */

function initialPattern() {
  const saved = readWorking();
  if (saved) {
    const parsed = parseJSON(saved, { lenient: true });
    if (parsed.pattern) return parsed.pattern;
  }
  return examplePattern("N-mm");
}

export function start() {
  const pattern = initialPattern();
  state.snap = { on: true, step: SNAP_DEFAULT[pattern.unitSystem], unitSystem: pattern.unitSystem };
  state.pattern = pattern;
  bind();
  bindCanvas();
  renderGenerator();
  renderAll();
  registerTools({
    current: () => ({ pattern: state.pattern, result: state.result }),
    markdown: (pattern) => markdownOf(pattern, solve(pattern)),
  });
}
