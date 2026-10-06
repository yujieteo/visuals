/* Universal Data Workbench: a figure's scene graph as a PDF, and what a written PDF holds.
 *
 * write() draws the scene of src/render.js on one page whose MediaBox is the figure's size in millimetres
 * (converted to points, 72 a 25.4 mm), with pdf-lib 1.17.1 and its fontkit: every text is real text in the font
 * set's faces, embedded as subsets (TrueType outlines as FontFile2), never outlines, so it stays editable; marks are
 * vector paths in DeviceRGB; line widths keep their points; translucent marks use an ExtGState. Patterns are lines
 * clipped to their rectangle. read() opens a written file with pdf-lib again and reports its page size, its fonts
 * and how they are embedded, its text-showing operators and any CMYK colour, for the checks of src/figure.js.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DWPdf = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const K = 72 / 25.4;
  const PAPER = "#ffffff";
  const MARK = "#2a78d6";

  /** #rrggbb as 0–1 components. */
  const rgb = (c) => [1, 3, 5].map((i) => parseInt(String(c).slice(i, i + 2), 16) / 255);
  const isColour = (c) => /^#[0-9a-f]{6}$/i.test(String(c ?? ""));

  /**
   * The PDF of a scene.
   * @param {any} PDFLib @param {any} fontkit
   * @param {any} scene Render.render's scene @param {any} fonts a DWFonts.set
   * @param {{ title?: string, subject?: string, date?: Date }} [meta]
   * @returns {Promise<Uint8Array>}
   */
  async function write(PDFLib, fontkit, scene, fonts, meta = {}) {
    const P = PDFLib;
    const doc = await P.PDFDocument.create();
    doc.registerFontkit(fontkit);
    // Glyph by glyph, with no ligature or kerning, as src/fonts.js measures text.
    const features = { liga: false, clig: false, dlig: false, calt: false, rlig: false, kern: false };
    /** @type {Map<any, any>} */
    const embedded = new Map();
    const fontOf = async (isBold) => {
      const f = fonts.faceOf(isBold);
      if (!embedded.has(f)) embedded.set(f, await doc.embedFont(f.bytes, { subset: true, features }));
      return { pdf: embedded.get(f), face: f };
    };
    const W = scene.width, H = scene.height;
    const page = doc.addPage([W * K, H * K]);
    if (meta.title) doc.setTitle(meta.title);
    if (meta.subject) doc.setSubject(meta.subject);
    doc.setCreator("Universal Data Workbench (teoyujie.org/visuals/data-workbench)");
    if (meta.date) { doc.setCreationDate(meta.date); doc.setModificationDate(meta.date); }
    const X = (x) => x * K, Y = (y) => (H - y) * K;
    const ops = (...list) => page.pushOperators(...list.flat(3).filter(Boolean));
    /** @type {Map<number, any>} ExtGState names by opacity */
    const states = new Map();
    const alpha = (a) => {
      if (!states.has(a)) states.set(a, page.node.newExtGState("GS", doc.context.obj({ Type: "ExtGState", ca: a, CA: 1 })));
      return P.setGraphicsState(states.get(a));
    };
    const fillColour = (c) => P.setFillingRgbColor(...rgb(c));
    const strokeStyle = (it) => [
      P.setStrokingRgbColor(...rgb(it.stroke)),
      P.setLineWidth(it.sw ?? 0.5),
      it.dash ? P.setDashPattern(String(it.dash).split(/[\s,]+/).map((v) => Number(v) * K), 0) : null,
      it.cap === "round" ? [P.setLineCap(P.LineCapStyle.Round), P.setLineJoin(P.LineJoinStyle.Round)] : null,
    ];
    /** Fill, stroke or both, as the item asks. */
    const paint = (it, hasFill) => {
      const stroke = isColour(it.stroke);
      if (hasFill && stroke) return P.fillAndStroke();
      if (hasFill) return P.fill();
      if (stroke) return P.stroke();
      return P.endPath();
    };
    const circle = (cx, cy, r) => {
      const k = 0.5522847498 * r;
      return [P.moveTo(cx + r, cy), P.appendBezierCurve(cx + r, cy + k, cx + k, cy + r, cx, cy + r), P.appendBezierCurve(cx - k, cy + r, cx - r, cy + k, cx - r, cy),
        P.appendBezierCurve(cx - r, cy - k, cx - k, cy - r, cx, cy - r), P.appendBezierCurve(cx + k, cy - r, cx + r, cy - k, cx + r, cy), P.closePath()];
    };

    ops(P.pushGraphicsState(), fillColour(PAPER), P.rectangle(0, 0, W * K, H * K), P.fill(), P.popGraphicsState());
    for (const it of scene.items) {
      if (it.t === "text") {
        const { pdf } = await fontOf(it.weight === "bold");
        const size = it.size;
        const w = (fonts.measure(it.text, size, it.weight === "bold") / 25.4) * 72;
        const shift = it.anchor === "middle" ? w / 2 : it.anchor === "end" ? w : 0;
        const a = (-(it.rotate ?? 0) * Math.PI) / 180;
        const x = X(it.x) - shift * Math.cos(a), y = Y(it.y) - shift * Math.sin(a);
        page.drawText(it.text, { x, y, size, font: pdf, color: P.rgb(...rgb(isColour(it.fill) ? it.fill : "#000000")), rotate: P.degrees((a * 180) / Math.PI) });
        continue;
      }
      const hasFill = !it.hatch && isColour(it.fill) && it.t !== "line";
      const list = [P.pushGraphicsState()];
      if (it.opacity !== undefined && it.opacity < 1 && hasFill) list.push(alpha(Math.round(it.opacity * 1000) / 1000));
      if (hasFill) list.push(fillColour(it.fill));
      if (isColour(it.stroke)) list.push(...strokeStyle(it));
      if (it.t === "rect") {
        if (it.hatch) {
          // A pattern: lines at 45° every 1.2 mm, 0.3 mm wide, clipped to the rectangle, over the paper.
          list.push(P.pushGraphicsState(), fillColour(PAPER), P.rectangle(X(it.x), Y(it.y + it.h), it.w * K, it.h * K), P.fill(), P.rectangle(X(it.x), Y(it.y + it.h), it.w * K, it.h * K), P.clip(), P.endPath(),
            P.setStrokingRgbColor(...rgb(MARK)), P.setLineWidth(0.3 * K));
          const step = 1.2 * Math.SQRT2;
          for (let d = -it.h; d < it.w + it.h; d += step) list.push(P.moveTo(X(it.x + d), Y(it.y + it.h)), P.lineTo(X(it.x + d + it.h), Y(it.y)));
          list.push(P.stroke(), P.popGraphicsState());
          if (isColour(it.stroke)) list.push(P.rectangle(X(it.x), Y(it.y + it.h), it.w * K, it.h * K), P.stroke());
        } else {
          list.push(P.rectangle(X(it.x), Y(it.y + it.h), it.w * K, it.h * K), paint(it, hasFill));
        }
      } else if (it.t === "line") {
        list.push(P.moveTo(X(it.x1), Y(it.y1)), P.lineTo(X(it.x2), Y(it.y2)), P.stroke());
      } else if (it.t === "circle") {
        list.push(...circle(X(it.cx), Y(it.cy), it.r * K), paint(it, hasFill));
      } else if (it.t === "path") {
        for (const m of String(it.d).matchAll(/([MLZ])\s*(?:(-?[\d.]+(?:e-?\d+)?)[,\s]+(-?[\d.]+(?:e-?\d+)?))?/gi)) {
          const cmd = m[1].toUpperCase();
          if (cmd === "Z") list.push(P.closePath());
          else list.push(cmd === "M" ? P.moveTo(X(Number(m[2])), Y(Number(m[3]))) : P.lineTo(X(Number(m[2])), Y(Number(m[3]))));
        }
        list.push(paint(it, hasFill));
      }
      list.push(P.popGraphicsState());
      ops(list);
    }
    return doc.save();
  }

  /**
   * What a written PDF holds: page count, MediaBox in points and millimetres, each font with its subtype and how its
   * outlines are embedded, Type 3 fonts, text-showing operators, and any CMYK colour operator.
   * @param {any} PDFLib @param {Uint8Array} bytes
   */
  async function read(PDFLib, bytes) {
    const P = PDFLib;
    const doc = await P.PDFDocument.load(bytes, { updateMetadata: false });
    const pages = doc.getPages();
    const page = pages[0];
    const box = page.getMediaBox();
    const mediaBox = [box.x, box.y, box.width, box.height];
    const ctx = doc.context;
    const look = (o) => (o instanceof P.PDFRef ? ctx.lookup(o) : o);
    const name = (o) => (o ? String(o).replace(/^\//, "") : "");
    const fonts = [];
    let type3 = false;
    const res = look(page.node.Resources());
    const fontDict = res ? look(res.get(P.PDFName.of("Font"))) : null;
    // pdf-lib names a face again on each drawText: each embedded font object is listed once.
    const seen = new Set();
    for (const [key, ref] of fontDict ? fontDict.entries() : []) {
      if (seen.has(String(ref))) continue;
      seen.add(String(ref));
      const f = look(ref);
      const subtype = name(f.get(P.PDFName.of("Subtype")));
      if (subtype === "Type3") type3 = true;
      let descriptor = look(f.get(P.PDFName.of("FontDescriptor")));
      let shown = subtype;
      if (subtype === "Type0") {
        const desc = look(look(f.get(P.PDFName.of("DescendantFonts"))).get(0));
        shown = `Type0/${name(desc.get(P.PDFName.of("Subtype")))}`;
        descriptor = look(desc.get(P.PDFName.of("FontDescriptor")));
      }
      const file = descriptor ? ["FontFile2", "FontFile3", "FontFile"].find((k) => descriptor.get(P.PDFName.of(k))) ?? null : null;
      fonts.push({ key: name(key), name: name(f.get(P.PDFName.of("BaseFont"))), subtype: shown, file });
    }
    let content = "";
    const streams = page.node.Contents();
    const list = streams instanceof P.PDFArray ? streams.asArray().map(look) : [look(streams)];
    for (const s of list) {
      const data = s instanceof P.PDFRawStream ? P.decodePDFRawStream(s).decode() : s.getContents();
      content += new TextDecoder("latin1").decode(data) + "\n";
    }
    const showText = (content.match(/(?:^|\s)(?:Tj|TJ|'|")(?=\s|$)/gm) ?? []).length;
    const cmyk = /(?:^|\s)(?:k|K)\s*$/m.test(content) || /\/DeviceCMYK/.test(content);
    return { pages: pages.length, mediaBox, mediaBoxMm: [box.width / K, box.height / K], fonts, type3, showText, textObjects: (content.match(/(?:^|\s)BT(?=\s)/gm) ?? []).length, cmyk, bytes: bytes.length };
  }

  return { K, write, read };
});
