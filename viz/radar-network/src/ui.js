/* Radar network visualiser: browser view helpers (DOM, SVG charts, canvas heatmaps, files, MathJax). */
(function (root) {
  "use strict";
  const ui = {};
  ui.$ = (s, el = document) => el.querySelector(s);
  ui.$$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  ui.esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  /** Element builder: h("button", { class: "x", onclick: f, dataset: { a: 1 } }, "text", child). */
  ui.h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k === "html") el.innerHTML = v;
      else if (k === "dataset") Object.assign(el.dataset, v);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    return el;
  };
  ui.token = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  ui.reducedMotion = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };

  /** Canvas sized to its CSS box and the device pixel ratio. Returns { ctx, w, h } in CSS pixels. */
  ui.setupCanvas = (canvas) => {
    const r = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  };

  /* ===== SVG LINE CHART ===== */
  const niceTicks = (lo, hi, n = 5) => {
    if (!(hi > lo)) { hi = lo + 1; }
    const raw = (hi - lo) / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9 * step; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    return out;
  };
  const tickFmt = (v) => { const a = Math.abs(v); return a !== 0 && (a >= 1e5 || a < 1e-2) ? v.toExponential(1).replace("-", "−") : String(Number(v.toPrecision(4))).replace("-", "−"); };
  /**
   * opts: { width, height, xlabel, ylabel, series: [{ pts: [[x, y]], cls, label, dash }], marks: [{ x, label }],
   * refY, cursorX, title }. NaN breaks a line. Returns an SVG string sized by viewBox.
   */
  ui.lineChart = (o) => {
    const W = o.width ?? 640, H = o.height ?? 200, m = { l: 56, r: 14, t: 22, b: 30 };
    const all = o.series.flatMap((s) => s.pts.filter((p) => Number.isFinite(p[1]) && Number.isFinite(p[0])));
    const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
    let x0 = o.xr ? o.xr[0] : Math.min(...xs), x1 = o.xr ? o.xr[1] : Math.max(...xs);
    let y0 = o.yr ? o.yr[0] : Math.min(...ys, o.refY ?? Infinity), y1 = o.yr ? o.yr[1] : Math.max(...ys, o.refY ?? -Infinity);
    if (!Number.isFinite(x0) || !Number.isFinite(x1)) { x0 = 0; x1 = 1; }
    if (!Number.isFinite(y0) || !Number.isFinite(y1)) { y0 = 0; y1 = 1; }
    if (y1 - y0 < 1e-9) { y0 -= 1; y1 += 1; }
    const pad = (y1 - y0) * 0.06; y0 -= pad; y1 += pad;
    const X = (v) => m.l + ((v - x0) / (x1 - x0 || 1)) * (W - m.l - m.r), Y = (v) => H - m.b - ((v - y0) / (y1 - y0)) * (H - m.t - m.b);
    let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${ui.esc(o.title ?? o.ylabel)}">`;
    s += `<g class="grid">${niceTicks(y0, y1, 4).map((v) => `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}"/>`).join("")}</g>`;
    s += `<g class="axis tick">${niceTicks(y0, y1, 4).map((v) => `<text x="${m.l - 6}" y="${Y(v) + 4}" text-anchor="end">${tickFmt(v)}</text>`).join("")}${niceTicks(x0, x1, 6).map((v) => `<line x1="${X(v)}" x2="${X(v)}" y1="${H - m.b}" y2="${H - m.b + 4}"/><text x="${X(v)}" y="${H - m.b + 16}" text-anchor="middle">${tickFmt(v)}</text>`).join("")}<line x1="${m.l}" x2="${W - m.r}" y1="${H - m.b}" y2="${H - m.b}"/></g>`;
    if (o.refY !== undefined && o.refY >= y0 && o.refY <= y1) s += `<line class="ref" x1="${m.l}" x2="${W - m.r}" y1="${Y(o.refY)}" y2="${Y(o.refY)}"/><text x="${W - m.r}" y="${Y(o.refY) - 4}" text-anchor="end">${ui.esc(o.refLabel ?? "")}</text>`;
    for (const se of o.series) {
      let d = "", pen = false;
      for (const [x, y] of se.pts) {
        if (!Number.isFinite(y) || !Number.isFinite(x)) { pen = false; continue; }
        d += `${pen ? "L" : "M"}${X(x).toFixed(1)},${Y(Math.max(y0, Math.min(y1, y))).toFixed(1)}`;
        pen = true;
      }
      s += `<path class="series ${se.cls ?? ""}" d="${d}" style="stroke:${se.color ?? "var(--c1)"}"${se.dash ? ` stroke-dasharray="${se.dash}"` : ""}/>`;
      if (se.label && se.pts.length) { const last = se.pts.filter((p) => Number.isFinite(p[1])).at(-1); if (last) s += `<text class="direct-label" x="${Math.min(X(last[0]), W - m.r) - 2}" y="${Y(last[1]) - 6}" text-anchor="end">${ui.esc(se.label)}</text>`; }
    }
    for (const mk of o.marks ?? []) if (mk.x >= x0 && mk.x <= x1) s += `<line class="ref" x1="${X(mk.x)}" x2="${X(mk.x)}" y1="${m.t}" y2="${H - m.b}"/>${mk.label ? `<text x="${X(mk.x) + 3}" y="${m.t + 10}">${ui.esc(mk.label)}</text>` : ""}`;
    if (o.points) for (const p of o.points) if (p.x >= x0 && p.x <= x1) s += `<circle class="hl" cx="${X(p.x)}" cy="${Y(p.y)}" r="3.5"><title>${ui.esc(p.title ?? "")}</title></circle>`;
    if (o.cursorX !== undefined && o.cursorX >= x0 && o.cursorX <= x1) s += `<line x1="${X(o.cursorX)}" x2="${X(o.cursorX)}" y1="${m.t}" y2="${H - m.b}" style="stroke:var(--fg);stroke-width:1"/>`;
    s += `<text class="axis-title" x="${m.l}" y="${m.t - 8}">${ui.esc(o.ylabel ?? "")}</text><text class="axis-title" x="${W - m.r}" y="${H - 2}" text-anchor="end">${ui.esc(o.xlabel ?? "")}</text></svg>`;
    return s;
  };

  /* ===== COLOUR RAMP ===== */
  const parseColor = (c) => {
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return [128, 128, 128];
    ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]];
  };
  /** Sequential ramp from --bg to --c1 (and on to --fg at the top), read from the tokens at draw time. */
  ui.ramp = () => {
    const a = parseColor(ui.token("--bg")), b = parseColor(ui.token("--c1")), c = parseColor(ui.token("--fg"));
    return (u) => {
      u = Math.max(0, Math.min(1, u));
      if (u < 0.8) { const t = u / 0.8; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
      const t = (u - 0.8) / 0.2; return [b[0] + (c[0] - b[0]) * t, b[1] + (c[1] - b[1]) * t, b[2] + (c[2] - b[2]) * t];
    };
  };
  /**
   * Heatmap of a [ny][nx] grid (value(ix, iy) in dB) into a canvas region, with max-in-pixel downsampling.
   * Returns the mapping used, for axes and picking.
   */
  ui.heatmap = (ctx, region, nx, ny, value, lo, hi) => {
    const { x, y, w, h } = region;
    const pw = Math.max(1, Math.floor(w)), ph = Math.max(1, Math.floor(h));
    const img = ctx.createImageData(pw, ph), ramp = ui.ramp();
    for (let py = 0; py < ph; py++) {
      const iy0 = Math.floor((py / ph) * ny), iy1 = Math.max(iy0 + 1, Math.floor(((py + 1) / ph) * ny));
      for (let px = 0; px < pw; px++) {
        const ix0 = Math.floor((px / pw) * nx), ix1 = Math.max(ix0 + 1, Math.floor(((px + 1) / pw) * nx));
        let v = -Infinity;
        for (let iy = iy0; iy < iy1; iy++) for (let ix = ix0; ix < ix1; ix++) { const q = value(ix, iy); if (q > v) v = q; }
        const c = ramp((v - lo) / (hi - lo));
        const k = 4 * ((ph - 1 - py) * pw + px);
        img.data[k] = c[0]; img.data[k + 1] = c[1]; img.data[k + 2] = c[2]; img.data[k + 3] = 255;
      }
    }
    // putImageData ignores the transform: scale by the device pixel ratio through an offscreen canvas.
    const off = document.createElement("canvas");
    off.width = pw; off.height = ph;
    off.getContext("2d").putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, x, y, w, h);
    return { x, y, w, h, nx, ny };
  };

  /* ===== FILES ===== */
  ui.download = (name, text, mime = "application/json") => {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = ui.h("a", { href: url, download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  ui.copy = async (text) => {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* fall back */ }
    const ta = ui.h("textarea", { style: "position:fixed;left:-9999px" });
    ta.value = text; document.body.append(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  };

  /* ===== MATHJAX ===== */
  /** Typeset only the given elements, once MathJax is ready. Resolves false when MathJax is unavailable. */
  ui.typeset = (els) => {
    const MJ = window.MathJax;
    if (!MJ || !MJ.startup || !MJ.startup.promise) return Promise.resolve(false);
    return MJ.startup.promise.then(() => {
      if (MJ.typesetClear) MJ.typesetClear(els);
      return MJ.typesetPromise(els);
    }).then(() => true, (e) => { console.warn("MathJax:", e && e.message); return false; });
  };

  (root.RadarNet = root.RadarNet || {}).ui = ui;
})(typeof self !== "undefined" ? self : this);
