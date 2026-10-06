/* Universal Data Workbench: a figure's scene graph as a PNG at a set resolution, and what a written PNG holds.
 *
 * draw() paints the scene of src/render.js on a 2D canvas at dpi / 25.4 pixels a millimetre, with the text in the
 * font set's faces (registered as FontFace by the page). withDpi() writes the resolution into the file: a pHYs chunk
 * of pixels a metre right after IHDR, replacing any the browser wrote, with its CRC. read() reads the size, colour
 * type and pHYs back for the checks. A canvas of more than 16.7 megapixels (the limit of iOS browsers) is refused
 * with its reason before anything is drawn; the SVG and PDF of the figure are not affected.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DWPng = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const PT = 25.4 / 72;
  const MAX_PIXELS = 16_777_216;
  const PAPER = "#ffffff";
  const MARK = "#2a78d6";

  /** The pixel size of a figure at a resolution, and whether a canvas of that size is allowed. */
  function pixels(widthMm, heightMm, dpi) {
    const width = Math.round((widthMm / 25.4) * dpi), height = Math.round((heightMm / 25.4) * dpi);
    const ok = width * height <= MAX_PIXELS;
    return { width, height, ok, reason: ok ? "" : `${width.toLocaleString("en-US")} × ${height.toLocaleString("en-US")} px is ${((width * height) / 1e6).toFixed(1)} megapixels, more than the 16.7 a phone's browser can draw: lower the resolution or the size. The SVG and PDF are not affected.` };
  }

  /**
   * Paint a scene on a canvas context sized by pixels(): paper, then every item in order, in millimetres.
   * @param {CanvasRenderingContext2D} ctx @param {any} scene @param {number} dpi @param {string} family the CSS family the canvas sets text in
   */
  function draw(ctx, scene, dpi, family) {
    const k = dpi / 25.4;
    ctx.save();
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, scene.width, scene.height);
    const stroke = (it) => {
      if (!it.stroke || it.stroke === "none") return false;
      ctx.strokeStyle = it.stroke;
      ctx.lineWidth = (it.sw ?? 0.5) * PT;
      ctx.setLineDash(it.dash ? String(it.dash).split(/[\s,]+/).map(Number) : []);
      ctx.lineCap = it.cap === "round" ? "round" : "butt";
      ctx.lineJoin = it.cap === "round" ? "round" : "miter";
      return true;
    };
    for (const it of scene.items) {
      ctx.save();
      if (it.t === "text") {
        ctx.fillStyle = it.fill;
        ctx.font = `${it.weight === "bold" ? "bold " : ""}${it.size * PT}px ${family}`;
        ctx.textAlign = it.anchor === "middle" ? "center" : it.anchor === "end" ? "right" : "left";
        ctx.textBaseline = "alphabetic";
        ctx.translate(it.x, it.y);
        if (it.rotate) ctx.rotate((it.rotate * Math.PI) / 180);
        ctx.fillText(it.text, 0, 0);
        ctx.restore();
        continue;
      }
      const path = new Path2D();
      if (it.t === "rect") path.rect(it.x, it.y, it.w, it.h);
      else if (it.t === "line") { path.moveTo(it.x1, it.y1); path.lineTo(it.x2, it.y2); }
      else if (it.t === "circle") path.arc(it.cx, it.cy, it.r, 0, 2 * Math.PI);
      else if (it.t === "path") path.addPath(new Path2D(it.d));
      if (it.hatch) {
        ctx.save();
        ctx.clip(path);
        ctx.fillStyle = PAPER;
        ctx.fill(path);
        ctx.strokeStyle = MARK;
        ctx.lineWidth = 0.3;
        ctx.beginPath();
        for (let d = -it.h; d < it.w + it.h; d += 1.2 * Math.SQRT2) { ctx.moveTo(it.x + d, it.y + it.h); ctx.lineTo(it.x + d + it.h, it.y); }
        ctx.stroke();
        ctx.restore();
      } else if (it.fill && it.fill !== "none" && it.t !== "line") {
        ctx.globalAlpha = it.opacity ?? 1;
        ctx.fillStyle = it.fill;
        ctx.fill(path);
        ctx.globalAlpha = 1;
      }
      if (stroke(it)) ctx.stroke(path);
      ctx.restore();
    }
    ctx.restore();
  }

  /* ---------- PNG chunks ---------- */

  const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
  /** @type {Uint32Array | null} */
  let table = null;
  function crc32(bytes) {
    if (!table) {
      table = new Uint32Array(256);
      for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
    }
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = table[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  /** The chunks of a PNG: type, data and where each starts. */
  function chunks(bytes) {
    if (bytes.length < 8 || SIGNATURE.some((b, i) => bytes[i] !== b)) throw new Error("not a PNG file");
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const out = [];
    for (let at = 8; at + 12 <= bytes.length;) {
      const length = view.getUint32(at);
      const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
      out.push({ type, start: at, end: at + 12 + length, data: bytes.subarray(at + 8, at + 8 + length) });
      at += 12 + length;
      if (type === "IEND") break;
    }
    return out;
  }

  /** One chunk's bytes: length, type, data, CRC of type and data. */
  function chunk(type, data) {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  }

  /** A PNG with its resolution: a pHYs chunk (pixels a metre, unit 1) after IHDR, and no other pHYs. */
  function withDpi(bytes, dpi) {
    const list = chunks(bytes);
    const ppm = Math.round(dpi / 0.0254);
    const data = new Uint8Array(9);
    const view = new DataView(data.buffer);
    view.setUint32(0, ppm);
    view.setUint32(4, ppm);
    data[8] = 1;
    const parts = [Uint8Array.from(SIGNATURE)];
    for (const c of list) {
      if (c.type === "pHYs") continue;
      parts.push(bytes.subarray(c.start, c.end));
      if (c.type === "IHDR") parts.push(chunk("pHYs", data));
    }
    const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length; }
    return out;
  }

  /** What a PNG holds: size, bit depth, colour type, pHYs (pixels a metre and dpi) and whether every CRC holds. */
  function read(bytes) {
    const list = chunks(bytes);
    const ihdr = list.find((c) => c.type === "IHDR");
    if (!ihdr || list[0] !== ihdr) throw new Error("the PNG does not start with IHDR");
    const v = new DataView(ihdr.data.buffer, ihdr.data.byteOffset, ihdr.data.byteLength);
    const phys = list.find((c) => c.type === "pHYs");
    let ppm = null, dpi = null;
    if (phys) {
      const p = new DataView(phys.data.buffer, phys.data.byteOffset, phys.data.byteLength);
      if (p.getUint8(8) === 1 && p.getUint32(0) === p.getUint32(4)) { ppm = p.getUint32(0); dpi = ppm * 0.0254; }
    }
    const crcs = list.every((c) => new DataView(bytes.buffer, bytes.byteOffset + c.end - 4, 4).getUint32(0) === crc32(bytes.subarray(c.start + 4, c.end - 4)));
    return { width: v.getUint32(0), height: v.getUint32(4), bitDepth: v.getUint8(8), colorType: v.getUint8(9), ppm, dpi, physBeforeData: !!phys && list.indexOf(phys) < list.findIndex((c) => c.type === "IDAT"), crcs, bytes: bytes.length };
  }

  return { MAX_PIXELS, pixels, draw, withDpi, read, crc32, chunks };
});
