/* Canvas painter and pointer handling. All geometry comes from the scene
 * model; this file only turns its primitives into Canvas 2D calls. */

import { gridLines } from "../core/scene.mjs";

export function palette(el) {
  const cs = getComputedStyle(el);
  const v = (name) => cs.getPropertyValue(name).trim();
  return {
    bg: v("--bg"), fg: v("--fg"), muted: v("--muted"), faint: v("--faint"), grid: v("--grid"), border: v("--border"),
    focus: v("--focus"), shear: v("--shear"), axial: v("--axial"), area: v("--area"), load: v("--load"),
    reaction: v("--reaction"), tension: v("--tension"), surface: v("--surface"), mono: v("--mono"),
  };
}

function arrow(ctx, from, to, colour, width = 1.6, head = 8) {
  const dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy);
  if (len < 1) return;
  const ux = dx / len, uy = dy / len;
  ctx.strokeStyle = colour; ctx.fillStyle = colour; ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x - ux * head * 0.8, to.y - uy * head * 0.8); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - ux * head - uy * head * 0.45, to.y - uy * head + ux * head * 0.45);
  ctx.lineTo(to.x - ux * head + uy * head * 0.45, to.y - uy * head - ux * head * 0.45);
  ctx.closePath(); ctx.fill();
}

export function centroidPath(ctx, shape, x, y, s) {
  ctx.beginPath();
  if (shape === "ring") {
    ctx.arc(x, y, s, 0, 2 * Math.PI);
    ctx.moveTo(x - s * 1.5, y); ctx.lineTo(x + s * 1.5, y);
    ctx.moveTo(x, y - s * 1.5); ctx.lineTo(x, y + s * 1.5);
  } else if (shape === "diamond") {
    ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y); ctx.closePath();
  } else if (shape === "square") {
    ctx.rect(x - s, y - s, 2 * s, 2 * s);
  }
}

/* Text at (x, y), moved to the left of `anchorX` when it would run off the right edge. */
function label(ctx, text, x, y, anchorX, width) {
  const w = ctx.measureText(text).width;
  ctx.fillText(text, x + w > width - 4 ? Math.max(4, anchorX - (x - anchorX) - w) : x, y);
}

/* Paint `scene` onto a 2D context sized in CSS pixels. */
export function paint(ctx, scene, colours, { snapStep = 0, snapOn = false } = {}) {
  const { width, height } = scene;
  ctx.fillStyle = colours.bg; ctx.fillRect(0, 0, width, height);
  const font = (size, weight = 400) => `${weight} ${size}px ${colours.mono || "monospace"}`;

  if (snapOn) {
    ctx.strokeStyle = colours.grid; ctx.lineWidth = 1;
    ctx.beginPath();
    for (const l of gridLines(scene, snapStep)) {
      if (l.axis === "x") { ctx.moveTo(Math.round(l.px) + 0.5, 0); ctx.lineTo(Math.round(l.px) + 0.5, height); }
      else { ctx.moveTo(0, Math.round(l.px) + 0.5); ctx.lineTo(width, Math.round(l.px) + 0.5); }
    }
    ctx.stroke();
  }

  // Axes through the datum.
  const { axes } = scene;
  ctx.setLineDash([4, 4]); ctx.strokeStyle = colours.faint; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, axes.origin.y); ctx.lineTo(width, axes.origin.y); ctx.moveTo(axes.origin.x, 0); ctx.lineTo(axes.origin.x, height); ctx.stroke();
  ctx.setLineDash([]);
  arrow(ctx, axes.x.from, axes.x.to, colours.muted, 1.4, 7);
  arrow(ctx, axes.y.from, axes.y.to, colours.muted, 1.4, 7);
  ctx.strokeStyle = colours.muted; ctx.beginPath(); ctx.arc(axes.origin.x, axes.origin.y, 5, 0, 2 * Math.PI); ctx.stroke();
  ctx.fillStyle = colours.muted; ctx.beginPath(); ctx.arc(axes.origin.x, axes.origin.y, 1.6, 0, 2 * Math.PI); ctx.fill();
  ctx.font = font(11); ctx.fillText("x", axes.x.to.x + 4, axes.x.to.y + 4); ctx.fillText("y", axes.y.to.x + 5, axes.y.to.y + 4);
  ctx.fillText("z⊙", axes.origin.x - 22, axes.origin.y + 16);

  scene.plates.forEach((p, i) => {
    ctx.strokeStyle = colours.muted; ctx.lineWidth = 1.2; ctx.fillStyle = colours.surface;
    ctx.globalAlpha = 0.5; ctx.fillRect(p.screen.x, p.screen.y, p.screen.w, p.screen.h); ctx.globalAlpha = 1;
    if (i > 0) ctx.setLineDash([6, 3]);
    ctx.strokeRect(p.screen.x, p.screen.y, p.screen.w, p.screen.h);
    ctx.setLineDash([]);
    // The second plate's label sits in the opposite corner so coincident outlines stay readable.
    ctx.fillStyle = colours.muted; ctx.font = font(11, 600);
    if (i === 0) ctx.fillText(p.label, p.screen.x + 5, p.screen.y + 14);
    else ctx.fillText(p.label, p.screen.x + p.screen.w - ctx.measureText(p.label).width - 5, p.screen.y + p.screen.h - 5);
  });

  if (scene.contactEdge) {
    const { from, to } = scene.contactEdge.screen;
    ctx.strokeStyle = colours.axial; ctx.lineWidth = 4; ctx.setLineDash([10, 5]);
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = colours.axial; ctx.font = font(10.5, 600);
    label(ctx, scene.contactEdge.label, Math.min(from.x, to.x) + 6, Math.max(from.y, to.y) + 14, Math.min(from.x, to.x), width);
  }

  for (const m of scene.markers) {
    ctx.beginPath(); ctx.arc(m.screen.x, m.screen.y, m.radiusPx, 0, 2 * Math.PI);
    ctx.fillStyle = m.tension ? colours.tension : colours.bg;
    ctx.globalAlpha = m.tension ? 0.35 : 1; ctx.fill(); ctx.globalAlpha = 1;
    ctx.lineWidth = m.selected ? 3 : 1.6;
    ctx.strokeStyle = m.selected ? colours.focus : colours.fg;
    if (m.unloading) ctx.setLineDash([3, 2]);
    ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = colours.fg; ctx.font = font(10.5);
    label(ctx, m.label, m.screen.x + m.radiusPx + 3, m.screen.y - m.radiusPx - 1, m.screen.x, width);
  }

  for (const v of scene.vectors) {
    if (v.kind === "reaction") arrow(ctx, v.screen.from, v.screen.to, colours.reaction, 1.5, 7);
  }

  // Centroids, drawn largest first so coincident markers stay nested and visible.
  for (const c of [...scene.centroids].sort((a, b) => b.size - a.size)) {
    ctx.lineWidth = 2; ctx.strokeStyle = colours[c.colour];
    centroidPath(ctx, c.shape, c.screen.x, c.screen.y, c.size);
    if (c.shape === "square") { ctx.fillStyle = colours[c.colour]; ctx.fill(); } else ctx.stroke();
  }

  if (scene.icr) {
    const { x, y } = scene.icr.screen;
    ctx.strokeStyle = colours.load; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 7, 0, 2 * Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x + 4, y); ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4); ctx.stroke();
    ctx.fillStyle = colours.load; ctx.font = font(11, 600);
    label(ctx, scene.icr.label, x + 10, y - 8, x, width);
  }

  if (scene.load) {
    const { x, y } = scene.load.screen;
    ctx.strokeStyle = colours.load; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - 7, y - 7); ctx.lineTo(x + 7, y + 7); ctx.moveTo(x + 7, y - 7); ctx.lineTo(x - 7, y + 7); ctx.stroke();
    ctx.fillStyle = colours.load; ctx.font = font(11, 600); label(ctx, scene.load.label, x + 10, y + 18, x, width);
  }
  for (const v of scene.vectors) {
    if (v.kind !== "applied") continue;
    arrow(ctx, v.screen.from, v.screen.to, colours.load, 2.2, 10);
    ctx.fillStyle = colours.load; ctx.font = font(11, 600); label(ctx, v.label, v.screen.to.x + 6, v.screen.to.y - 6, v.screen.to.x, width);
  }
  for (const m of scene.moments) {
    const { x, y } = m.screen, r = m.radiusPx;
    // Canvas angles grow clockwise on screen, so a counter-clockwise moment sweeps them downwards.
    const a0 = 0.6, a1 = m.ccw ? a0 - 1.5 * Math.PI : a0 + 1.5 * Math.PI;
    ctx.strokeStyle = colours.load; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.arc(x, y, r, a0, a1, m.ccw); ctx.stroke();
    const end = { x: x + r * Math.cos(a1), y: y + r * Math.sin(a1) };
    const dir = m.ccw ? { x: Math.sin(a1), y: -Math.cos(a1) } : { x: -Math.sin(a1), y: Math.cos(a1) };
    arrow(ctx, { x: end.x - 6 * dir.x, y: end.y - 6 * dir.y }, end, colours.load, 1.8, 7);
  }

  const b = scene.scaleBar;
  ctx.strokeStyle = colours.fg; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(b.screen.x, b.screen.y - 4); ctx.lineTo(b.screen.x, b.screen.y); ctx.lineTo(b.screen.x + b.px, b.screen.y); ctx.lineTo(b.screen.x + b.px, b.screen.y - 4); ctx.stroke();
  ctx.fillStyle = colours.fg; ctx.font = font(10.5); ctx.fillText(b.label, b.screen.x + b.px + 6, b.screen.y + 3);
}

/* Hit test: the fastener under a screen point, else the load point, else null. */
export function hitTest(scene, pt) {
  let best = null, bestD = Infinity;
  for (const m of scene.markers) {
    const d = Math.hypot(m.screen.x - pt.x, m.screen.y - pt.y);
    if (d <= Math.max(m.radiusPx, 9) + 3 && d < bestD) { best = { kind: "fastener", id: m.id }; bestD = d; }
  }
  if (best) return best;
  if (scene.load && Math.hypot(scene.load.screen.x - pt.x, scene.load.screen.y - pt.y) <= 12) return { kind: "load" };
  return null;
}

/* Legend strip for the PNG export, below the diagram (top edge `y0`). */
export function paintLegend(ctx, scene, colours, y0) {
  const col = scene.width / 2;
  ctx.font = `400 11px ${colours.mono || "monospace"}`;
  scene.legend.forEach((e, i) => {
    const x = 12 + (i % 2) * col, y = y0 + 16 + Math.floor(i / 2) * 22, c = colours[e.colour] || colours.fg;
    ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = 2;
    if (e.shape === "arrow") arrow(ctx, { x, y: y - 4 }, { x: x + 20, y: y - 4 }, c, 2, 7);
    else if (e.shape === "cross") { ctx.beginPath(); ctx.moveTo(x + 4, y - 9); ctx.lineTo(x + 14, y + 1); ctx.moveTo(x + 14, y - 9); ctx.lineTo(x + 4, y + 1); ctx.stroke(); }
    else if (e.shape === "edge") { ctx.setLineDash([6, 3]); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + 20, y - 4); ctx.stroke(); ctx.setLineDash([]); }
    else if (e.shape === "icr") { ctx.beginPath(); ctx.arc(x + 9, y - 4, 6, 0, 2 * Math.PI); ctx.stroke(); }
    else if (e.shape === "disc" || e.shape === "dashed") {
      ctx.beginPath(); ctx.arc(x + 9, y - 4, 5.5, 0, 2 * Math.PI);
      if (e.shape === "disc") { ctx.globalAlpha = 0.35; ctx.fill(); ctx.globalAlpha = 1; } else ctx.setLineDash([3, 2]);
      ctx.strokeStyle = colours.fg; ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]);
    }
    else {
      centroidPath(ctx, e.shape, x + 9, y - 4, e.shape === "ring" ? 7 : e.shape === "diamond" ? 6 : 4);
      if (e.shape === "square") ctx.fill(); else ctx.stroke();
    }
    ctx.fillStyle = colours.muted;
    ctx.fillText(e.label, x + 26, y);
  });
}

/* Height of the PNG legend strip for `scene`. */
export const legendHeight = (scene) => 22 * Math.ceil(scene.legend.length / 2) + 8;
