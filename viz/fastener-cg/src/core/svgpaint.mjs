/* SVG painter for the print (PDF) report. Like the canvas painter it only
 * turns scene-model primitives into drawing calls; every coordinate comes
 * from the scene, so geometry cannot differ between the two. Elements carry
 * data-role attributes so the consistency test can read them back. */

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const r3 = (v) => Number(v.toFixed(3));

export const PRINT_COLOURS = {
  bg: "#ffffff", fg: "#1d1d1f", muted: "#6e6e73", faint: "#a1a1a6", grid: "#e8e8ed", surface: "#f5f5f7",
  shear: "#2a78d6", axial: "#eb6834", area: "#1baf7a", load: "#8e44ad", reaction: "#1d1d1f", tension: "#eb6834", focus: "#0071e3",
};

function arrow(from, to, colour, width, head, attrs) {
  const dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy);
  if (len < 1) return "";
  const ux = dx / len, uy = dy / len;
  const bx = to.x - ux * head, by = to.y - uy * head;
  const p1 = `${r3(bx - uy * head * 0.45)},${r3(by + ux * head * 0.45)}`, p2 = `${r3(bx + uy * head * 0.45)},${r3(by - ux * head * 0.45)}`;
  return `<g ${attrs}><line x1="${r3(from.x)}" y1="${r3(from.y)}" x2="${r3(to.x - ux * head * 0.8)}" y2="${r3(to.y - uy * head * 0.8)}" stroke="${colour}" stroke-width="${width}"/>`
    + `<polygon points="${r3(to.x)},${r3(to.y)} ${p1} ${p2}" fill="${colour}"/></g>`;
}

/* `tagged` adds the data attributes the consistency test reads (off for legend swatches). */
export function centroidShape(c, colour, tagged = true) {
  const { x, y } = c.screen, s = c.size;
  const attrs = tagged ? `data-role="centroid" data-key="${c.key}" data-x="${r3(x)}" data-y="${r3(y)}"` : `data-legend="${c.key}"`;
  if (c.shape === "ring") {
    return `<g ${attrs} stroke="${colour}" stroke-width="2" fill="none"><circle cx="${r3(x)}" cy="${r3(y)}" r="${s}"/>`
      + `<line x1="${r3(x - s * 1.5)}" y1="${r3(y)}" x2="${r3(x + s * 1.5)}" y2="${r3(y)}"/><line x1="${r3(x)}" y1="${r3(y - s * 1.5)}" x2="${r3(x)}" y2="${r3(y + s * 1.5)}"/></g>`;
  }
  if (c.shape === "diamond") {
    return `<path ${attrs} d="M${r3(x)} ${r3(y - s)}L${r3(x + s)} ${r3(y)}L${r3(x)} ${r3(y + s)}L${r3(x - s)} ${r3(y)}Z" fill="none" stroke="${colour}" stroke-width="2"/>`;
  }
  return `<rect ${attrs} x="${r3(x - s)}" y="${r3(y - s)}" width="${2 * s}" height="${2 * s}" fill="${colour}"/>`;
}

/* The annotated pattern diagram as a standalone SVG string (width × height from the scene). */
export function paintSvg(scene, colours = PRINT_COLOURS, { legend = true } = {}) {
  const { width, height } = scene;
  const legendH = legend ? 22 * Math.ceil(scene.legend.length / 2) + 8 : 0;
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height + legendH}" width="${width}" height="${height + legendH}" font-family="SFMono-Regular, Consolas, monospace" font-size="11" role="img" aria-label="Fastener pattern diagram">`);
  out.push(`<rect width="${width}" height="${height + legendH}" fill="${colours.bg}"/>`);
  const { axes } = scene;
  out.push(`<g data-role="axes" stroke="${colours.faint}" stroke-dasharray="4 4"><line x1="0" y1="${r3(axes.origin.y)}" x2="${width}" y2="${r3(axes.origin.y)}"/><line x1="${r3(axes.origin.x)}" y1="0" x2="${r3(axes.origin.x)}" y2="${height}"/></g>`);
  out.push(arrow(axes.x.from, axes.x.to, colours.muted, 1.4, 7, 'data-role="axis-x"'));
  out.push(arrow(axes.y.from, axes.y.to, colours.muted, 1.4, 7, 'data-role="axis-y"'));
  out.push(`<circle cx="${r3(axes.origin.x)}" cy="${r3(axes.origin.y)}" r="5" fill="none" stroke="${colours.muted}"/><circle cx="${r3(axes.origin.x)}" cy="${r3(axes.origin.y)}" r="1.6" fill="${colours.muted}"/>`);
  out.push(`<g fill="${colours.muted}"><text x="${r3(axes.x.to.x + 4)}" y="${r3(axes.x.to.y + 4)}">x</text><text x="${r3(axes.y.to.x + 5)}" y="${r3(axes.y.to.y + 4)}">y</text><text x="${r3(axes.origin.x - 22)}" y="${r3(axes.origin.y + 16)}">z⊙</text></g>`);

  scene.plates.forEach((p, i) => {
    out.push(`<rect data-role="plate" data-id="${esc(p.id)}" x="${r3(p.screen.x)}" y="${r3(p.screen.y)}" width="${r3(p.screen.w)}" height="${r3(p.screen.h)}" fill="${colours.surface}" fill-opacity=".5" stroke="${colours.muted}" stroke-width="1.2"${i > 0 ? ' stroke-dasharray="6 3"' : ""}/>`);
    out.push(i === 0
      ? `<text x="${r3(p.screen.x + 5)}" y="${r3(p.screen.y + 14)}" fill="${colours.muted}" font-weight="600">${esc(p.label)}</text>`
      : `<text x="${r3(p.screen.x + p.screen.w - 5)}" y="${r3(p.screen.y + p.screen.h - 5)}" text-anchor="end" fill="${colours.muted}" font-weight="600">${esc(p.label)}</text>`);
  });
  if (scene.contactEdge) {
    const { from, to } = scene.contactEdge.screen;
    out.push(`<line data-role="contact-edge" x1="${r3(from.x)}" y1="${r3(from.y)}" x2="${r3(to.x)}" y2="${r3(to.y)}" stroke="${colours.axial}" stroke-width="4" stroke-dasharray="10 5"/>`);
    out.push(`<text x="${r3(Math.min(from.x, to.x) + 6)}" y="${r3(Math.max(from.y, to.y) + 14)}" fill="${colours.axial}" font-weight="600">${esc(scene.contactEdge.label)}</text>`);
  }
  for (const m of scene.markers) {
    out.push(`<circle data-role="fastener" data-id="${esc(m.id)}" cx="${r3(m.screen.x)}" cy="${r3(m.screen.y)}" r="${r3(m.radiusPx)}" fill="${m.tension ? colours.tension : colours.bg}" fill-opacity="${m.tension ? 0.35 : 1}" stroke="${colours.fg}" stroke-width="1.6"${m.unloading ? ' stroke-dasharray="3 2"' : ""}/>`);
    out.push(`<text x="${r3(m.screen.x + m.radiusPx + 3)}" y="${r3(m.screen.y - m.radiusPx - 1)}" fill="${colours.fg}">${esc(m.label)}</text>`);
  }
  for (const v of scene.vectors.filter((q) => q.kind === "reaction")) {
    out.push(arrow(v.screen.from, v.screen.to, colours.reaction, 1.5, 7, `data-role="vector" data-kind="reaction" data-id="${esc(v.id)}" data-x1="${r3(v.screen.from.x)}" data-y1="${r3(v.screen.from.y)}" data-x2="${r3(v.screen.to.x)}" data-y2="${r3(v.screen.to.y)}"`));
  }
  for (const c of [...scene.centroids].sort((a, b) => b.size - a.size)) out.push(centroidShape(c, colours[c.colour]));
  if (scene.icr) {
    const { x, y } = scene.icr.screen;
    out.push(`<g data-role="icr" data-x="${r3(x)}" data-y="${r3(y)}" stroke="${colours.load}" stroke-width="2" fill="none"><circle cx="${r3(x)}" cy="${r3(y)}" r="7"/><line x1="${r3(x - 4)}" y1="${r3(y)}" x2="${r3(x + 4)}" y2="${r3(y)}"/><line x1="${r3(x)}" y1="${r3(y - 4)}" x2="${r3(x)}" y2="${r3(y + 4)}"/></g>`);
    out.push(`<text x="${r3(x + 10)}" y="${r3(y - 8)}" fill="${colours.load}" font-weight="600">${esc(scene.icr.label)}</text>`);
  }
  if (scene.load) {
    const { x, y } = scene.load.screen;
    out.push(`<g data-role="load" data-x="${r3(x)}" data-y="${r3(y)}" stroke="${colours.load}" stroke-width="2"><line x1="${r3(x - 7)}" y1="${r3(y - 7)}" x2="${r3(x + 7)}" y2="${r3(y + 7)}"/><line x1="${r3(x + 7)}" y1="${r3(y - 7)}" x2="${r3(x - 7)}" y2="${r3(y + 7)}"/></g>`);
    out.push(`<text x="${r3(x + 10)}" y="${r3(y + 18)}" fill="${colours.load}" font-weight="600">${esc(scene.load.label)}</text>`);
  }
  for (const v of scene.vectors.filter((q) => q.kind === "applied")) {
    out.push(arrow(v.screen.from, v.screen.to, colours.load, 2.2, 10, `data-role="vector" data-kind="applied" data-id="${esc(v.id)}" data-x1="${r3(v.screen.from.x)}" data-y1="${r3(v.screen.from.y)}" data-x2="${r3(v.screen.to.x)}" data-y2="${r3(v.screen.to.y)}"`));
    out.push(`<text x="${r3(v.screen.to.x + 6)}" y="${r3(v.screen.to.y - 6)}" fill="${colours.load}" font-weight="600">${esc(v.label)}</text>`);
  }
  for (const m of scene.moments) {
    const { x, y } = m.screen, r = m.radiusPx;
    const a0 = 0.6, a1 = m.ccw ? a0 - 1.5 * Math.PI : a0 + 1.5 * Math.PI;
    const p0 = { x: x + r * Math.cos(a0), y: y + r * Math.sin(a0) }, p1 = { x: x + r * Math.cos(a1), y: y + r * Math.sin(a1) };
    out.push(`<path data-role="moment" d="M${r3(p0.x)} ${r3(p0.y)}A${r} ${r} 0 1 ${m.ccw ? 0 : 1} ${r3(p1.x)} ${r3(p1.y)}" fill="none" stroke="${colours.load}" stroke-width="1.8"/>`);
  }
  const b = scene.scaleBar;
  out.push(`<g data-role="scale-bar" data-px="${r3(b.px)}"><path d="M${r3(b.screen.x)} ${r3(b.screen.y - 4)}V${r3(b.screen.y)}H${r3(b.screen.x + b.px)}V${r3(b.screen.y - 4)}" fill="none" stroke="${colours.fg}" stroke-width="1.5"/><text x="${r3(b.screen.x + b.px + 6)}" y="${r3(b.screen.y + 3)}" fill="${colours.fg}">${esc(b.label)}</text></g>`);

  if (legend) {
    out.push(`<g data-role="legend" font-family="-apple-system, Segoe UI, Helvetica, Arial, sans-serif" font-size="11" fill="${colours.muted}">`);
    scene.legend.forEach((e, i) => {
      const x = 12 + (i % 2) * (width / 2), y = height + 16 + Math.floor(i / 2) * 22;
      out.push(legendIcon(e, x, y - 4, colours) + `<text x="${r3(x + 26)}" y="${r3(y)}">${esc(e.label)}</text>`);
    });
    out.push("</g>");
  }
  out.push("</svg>");
  return out.join("");
}

function legendIcon(e, x, y, colours) {
  const c = colours[e.colour] || colours.fg;
  if (e.shape === "arrow") return arrow({ x, y }, { x: x + 20, y }, c, 2, 7, "");
  if (e.shape === "cross") return `<path d="M${x + 4} ${y - 5}L${x + 14} ${y + 5}M${x + 14} ${y - 5}L${x + 4} ${y + 5}" stroke="${c}" stroke-width="2"/>`;
  if (e.shape === "edge") return `<line x1="${x}" y1="${y}" x2="${x + 20}" y2="${y}" stroke="${c}" stroke-width="3" stroke-dasharray="6 3"/>`;
  if (e.shape === "disc") return `<circle cx="${x + 9}" cy="${y}" r="5.5" fill="${c}" fill-opacity=".35" stroke="${colours.fg}" stroke-width="1.5"/>`;
  if (e.shape === "dashed") return `<circle cx="${x + 9}" cy="${y}" r="5.5" fill="none" stroke="${colours.fg}" stroke-width="1.5" stroke-dasharray="3 2"/>`;
  if (e.shape === "icr") return `<circle cx="${x + 9}" cy="${y}" r="6" fill="none" stroke="${c}" stroke-width="2"/>`;
  return centroidShape({ key: e.key, shape: e.shape, size: e.shape === "ring" ? 7 : e.shape === "diamond" ? 6 : 4, screen: { x: x + 9, y } }, c, false);
}
