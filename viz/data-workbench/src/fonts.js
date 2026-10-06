/* Universal Data Workbench: the fonts of the publication figures, and the SVG file with its font inside.
 *
 * The bundled font is Liberation Sans 2.1.5 (vendor/liberation-fonts, SIL Open Font License 1.1), Regular and
 * Bold, an Arial-metric font: its widths are Arial's, which are Helvetica's. The person may load their own TrueType
 * or OpenType files instead, such as Arial; a file whose weight is 600 or more is the bold face. fontkit reads each
 * file; the widths below are the sums of the glyphs' advance widths, with no kerning or ligatures, which is how
 * src/pdf.js sets text, so a label measured here takes the same room in every file.
 *
 * svgFile() adds each face that the figure's text uses to the SVG as an @font-face, so the file holds its font: a
 * TrueType face as a subset of the characters the figure shows (subset()), a CFF face whole. readSvg() reads a
 * written file back for the checks, its fonts with fontkit.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DWFonts = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const PT = 25.4 / 72;
  const FALLBACK = "Arimo, Arial, Helvetica, sans-serif";

  /**
   * One face read by fontkit.
   * @param {any} fontkit @param {Uint8Array} bytes @param {string} [file] the file name, for messages
   */
  function face(fontkit, bytes, file = "") {
    let font;
    try {
      font = fontkit.create(bytes);
    } catch (error) {
      throw new Error(`${file || "The file"} is not a font fontkit can read: ${String(/** @type {any} */ (error)?.message ?? error).slice(0, 120)}`);
    }
    if (font.fonts) throw new Error(`${file || "The file"} is a font collection; load one face of it.`);
    const weight = font["OS/2"]?.usWeightClass ?? 400;
    const outlines = font.directory?.tables?.glyf ? "TrueType" : font.directory?.tables?.["CFF "] ? "CFF" : "unknown";
    return { font, bytes, file, family: String(font.familyName ?? "Unnamed"), full: String(font.fullName ?? font.familyName ?? ""), postscript: String(font.postscriptName ?? ""), weight, bold: weight >= 600, outlines, unitsPerEm: font.unitsPerEm };
  }

  /** The advance width of a text in thousandths of the font size: glyphs one by one, unknown characters as .notdef. */
  function advance(f, text) {
    let w = 0;
    for (const ch of String(text)) w += f.font.glyphForCodePoint(ch.codePointAt(0) ?? 0).advanceWidth;
    return (w * 1000) / f.unitsPerEm;
  }

  /** Characters of a text the face has no glyph for. */
  function missing(f, text) {
    return [...new Set([...String(text)].filter((ch) => ch.trim() && f.font.glyphForCodePoint(ch.codePointAt(0) ?? 0).id === 0))];
  }

  /**
   * A font set: the regular face and, when there is one, the bold face; its name, the CSS family the SVG names and
   * measure(text, pt, bold) in millimetres for src/render.js.
   * @param {any} regular a face() @param {any} bold a face() or null @param {"bundled" | "own"} kind
   */
  function set(regular, bold, kind) {
    const family = regular.family;
    return {
      kind, regular, bold, name: family, bundled: kind === "bundled",
      family: `'${family.replace(/'/g, "")}', ${kind === "bundled" ? FALLBACK : `'Liberation Sans', ${FALLBACK}`}`,
      measure: (text, pt, isBold = false) => ((advance(isBold && bold ? bold : regular, text) / 1000) * pt * PT),
      faceOf: (isBold) => (isBold && bold ? bold : regular),
      missing: (text, isBold = false) => missing(isBold && bold ? bold : regular, text),
    };
  }

  function base64(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return typeof btoa === "function" ? btoa(s) : Buffer.from(bytes).toString("base64");
  }

  /* ---------- TrueType subsets with a character map ---------- */

  const u16 = (b, at) => (b[at] << 8) | b[at + 1];
  const u32 = (b, at) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;

  /** The tables of an sfnt font file, by tag. @param {Uint8Array} b @returns {Map<string, Uint8Array>} */
  function tables(b) {
    const out = new Map();
    for (let i = 0, n = u16(b, 4); i < n; i++) {
      const at = 12 + 16 * i;
      const tag = String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);
      out.set(tag, b.subarray(u32(b, at + 8), u32(b, at + 8) + u32(b, at + 12)));
    }
    return out;
  }

  /** The sum of a table's big-endian 32-bit words, zero-padded to four bytes. @param {Uint8Array} b */
  function checksum(b) {
    let sum = 0;
    for (let i = 0; i < b.length; i += 4) sum = (sum + (((b[i] << 24) | ((b[i + 1] ?? 0) << 16) | ((b[i + 2] ?? 0) << 8) | (b[i + 3] ?? 0)) >>> 0)) >>> 0;
    return sum;
  }

  /**
   * A cmap table mapping each character to its glyph: a format 4 subtable (Windows, BMP) of one segment a
   * character, and a format 12 subtable (Windows, full Unicode) when a character lies beyond the BMP.
   * @param {[number, number][]} pairs code point and glyph id, sorted by code point
   */
  function cmap(pairs) {
    const bmp = pairs.filter(([cp]) => cp < 0xffff);
    const seg = bmp.length + 1;
    const f4 = new DataView(new ArrayBuffer(16 + 8 * seg));
    const pow = 2 ** Math.floor(Math.log2(seg));
    [4, f4.byteLength, 0, 2 * seg, 2 * pow, Math.log2(pow), 2 * seg - 2 * pow].forEach((v, i) => f4.setUint16(2 * i, v));
    bmp.forEach(([cp, gid], i) => {
      f4.setUint16(14 + 2 * i, cp);
      f4.setUint16(16 + 2 * seg + 2 * i, cp);
      f4.setUint16(16 + 4 * seg + 2 * i, (gid - cp) & 0xffff);
    });
    [[14, 0xffff], [16 + 2 * seg, 0xffff], [16 + 4 * seg, 1]].forEach(([at, v]) => f4.setUint16(at + 2 * bmp.length, v));
    const wide = pairs.some(([cp]) => cp > 0xffff);
    const f12 = wide ? new DataView(new ArrayBuffer(16 + 12 * pairs.length)) : null;
    if (f12) {
      f12.setUint16(0, 12); f12.setUint32(4, f12.byteLength); f12.setUint32(12, pairs.length);
      pairs.forEach(([cp, gid], i) => { f12.setUint32(16 + 12 * i, cp); f12.setUint32(20 + 12 * i, cp); f12.setUint32(24 + 12 * i, gid); });
    }
    const subs = [[1, f4], ...(f12 ? [[10, f12]] : [])];
    const head = new DataView(new ArrayBuffer(4 + 8 * subs.length));
    head.setUint16(2, subs.length);
    let at = head.byteLength;
    subs.forEach(([enc, t], i) => { head.setUint16(4 + 8 * i, 3); head.setUint16(6 + 8 * i, Number(enc)); head.setUint32(8 + 8 * i, at); at += /** @type {DataView} */ (t).byteLength; });
    return join([head, ...subs.map(([, t]) => t)].map((v) => new Uint8Array(/** @type {DataView} */ (v).buffer)));
  }

  /** @param {Uint8Array[]} parts */
  function join(parts) {
    const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length; }
    return out;
  }

  /** An sfnt file of the given tables, in tag order, each on four bytes, with head's checksum adjustment set. @param {Map<string, Uint8Array>} map */
  function sfnt(map) {
    const tags = [...map.keys()].sort();
    const dir = new DataView(new ArrayBuffer(12 + 16 * tags.length));
    const pow = 2 ** Math.floor(Math.log2(tags.length));
    dir.setUint32(0, 0x00010000);
    [tags.length, 16 * pow, Math.log2(pow), 16 * tags.length - 16 * pow].forEach((v, i) => dir.setUint16(4 + 2 * i, v));
    const head = map.get("head");
    if (head) { const copy = head.slice(); copy.fill(0, 8, 12); map.set("head", copy); }
    let at = dir.byteLength;
    const bodies = tags.map((tag, i) => {
      const t = /** @type {Uint8Array} */ (map.get(tag));
      const padded = new Uint8Array(Math.ceil(t.length / 4) * 4);
      padded.set(t);
      [...tag].forEach((ch, k) => dir.setUint8(12 + 16 * i + k, ch.charCodeAt(0)));
      dir.setUint32(12 + 16 * i + 4, checksum(t));
      dir.setUint32(12 + 16 * i + 8, at);
      dir.setUint32(12 + 16 * i + 12, t.length);
      at += padded.length;
      return padded;
    });
    const font = join([new Uint8Array(dir.buffer), ...bodies]);
    const headAt = 12 + 16 * tags.indexOf("head");
    if (head) new DataView(font.buffer).setUint32(new DataView(font.buffer).getUint32(headAt + 8) + 8, (0xb1b0afba - checksum(font)) >>> 0);
    return font;
  }

  /**
   * A TrueType face cut to the glyphs of some text, with a character map: fontkit's subset (glyf, loca, hmtx, hhea,
   * maxp, head and the hinting tables) and, from the face itself, name and OS/2, a version 3 post table and a cmap
   * of the characters. A browser loads it as a web font; fontkit reads it back.
   * @param {any} f a face() with TrueType outlines @param {string} text
   * @returns {Promise<Uint8Array>}
   */
  async function subset(f, text) {
    const sub = f.font.createSubset();
    /** @type {[number, number][]} */
    const pairs = [];
    for (const cp of [...new Set([...String(text)].map((ch) => ch.codePointAt(0) ?? 0))].sort((a, b) => a - b)) {
      const glyph = f.font.glyphForCodePoint(cp);
      if (glyph.id) pairs.push([cp, sub.includeGlyph(glyph)]);
    }
    const bytes = await new Promise((resolve, reject) => {
      /** @type {Uint8Array[]} */
      const parts = [];
      sub.encodeStream().on("data", (/** @type {Uint8Array} */ d) => parts.push(new Uint8Array(d))).on("end", () => resolve(join(parts))).on("error", reject);
    });
    const own = tables(f.bytes), out = tables(/** @type {Uint8Array} */ (bytes));
    for (const tag of ["name", "OS/2"]) if (own.has(tag)) out.set(tag, own.get(tag) ?? new Uint8Array());
    const post = new Uint8Array(32);
    post.set((own.get("post") ?? new Uint8Array(32)).subarray(0, 32));
    post.set([0, 3, 0, 0], 0);
    out.set("post", post);
    out.set("cmap", cmap(pairs));
    return sfnt(out);
  }

  /**
   * The SVG file of a figure: the drawn SVG with each face its text uses in an @font-face under the family the
   * text names, so the file holds its font with its character map: a TrueType face as a subset of the characters
   * set in it, a CFF face whole.
   * @param {string} svg Render.render's svg @param {any} scene its scene @param {any} fonts a set()
   * @returns {Promise<string>}
   */
  async function svgFile(svg, scene, fonts) {
    /** @type {Map<any, string>} each face and the text set in it */
    const used = new Map();
    for (const it of scene.items.filter((/** @type {any} */ x) => x.t === "text")) {
      const f = fonts.faceOf(it.weight === "bold");
      used.set(f, (used.get(f) ?? "") + it.text);
    }
    const rules = [];
    for (const [f, text] of used) {
      const cff = f.outlines === "CFF";
      const type = cff ? ["font/otf", "opentype"] : ["font/ttf", "truetype"];
      const src = `src:url(data:${type[0]};base64,${base64(cff ? f.bytes : await subset(f, text))}) format('${type[1]}')`;
      // Without a bold face, bold text is set in the regular one, as in the PDF.
      const weights = f === fonts.bold ? [700] : fonts.bold ? [400] : [400, 700];
      for (const w of weights) rules.push(`@font-face{font-family:'${fonts.name.replace(/'/g, "")}';font-weight:${w};${src}}`);
    }
    if (!rules.length) return svg;
    const style = `<defs><style>${rules.join("")}</style></defs>`;
    return svg.replace(/(<desc[^>]*>[\s\S]*?<\/desc>)/, `$1\n${style}`);
  }

  const unescape = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

  /**
   * What a written SVG holds: its size in millimetres, its text elements, its embedded fonts read back by fontkit,
   * the characters of its text that no embedded font of their weight maps to a glyph, and the family named.
   * @param {string} text @param {any} fontkit
   */
  function readSvg(text, fontkit) {
    const root = /<svg\b[^>]*>/.exec(text)?.[0] ?? "";
    const mm = (name) => Number(new RegExp(`\\b${name}="([\\d.]+)mm"`).exec(root)?.[1] ?? NaN);
    /** @type {Map<number, any>} each weight and the font embedded for it */
    const embedded = new Map();
    let fontFaces = 0;
    for (const [, weight, data] of text.matchAll(/@font-face\{[^}]*?font-weight:(\d+);src:url\(data:font\/[a-z]+;base64,([A-Za-z0-9+/=]+)\)[^}]*\}/g)) {
      try {
        const bin = atob(data);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const font = fontkit.create(bytes);
        if (!font.directory?.tables?.cmap) continue;
        embedded.set(Number(weight), font);
        fontFaces++;
      } catch { /* a file fontkit cannot read is not a font */ }
    }
    const unmapped = new Set();
    const elements = [...text.matchAll(/<text\b([^>]*)>(?:<title>[\s\S]*?<\/title>)?([^<]*)<\/text>/g)];
    for (const [, attrs, content] of elements) {
      const font = embedded.get(/font-weight="(bold|700)"/.test(attrs) ? 700 : 400);
      for (const ch of unescape(content)) if (ch.trim() && !(font && font.glyphForCodePoint(ch.codePointAt(0) ?? 0).id)) unmapped.add(ch);
    }
    return {
      width: mm("width"), height: mm("height"),
      texts: (text.match(/<text\b/g) ?? []).length,
      fontFaces, unmapped: [...unmapped],
      family: (/font-family="([^"]*)"/.exec(text)?.[1] ?? "").replace(/&#39;|&quot;|'/g, "").split(",")[0].trim(),
      bytes: new TextEncoder().encode(text).length,
    };
  }

  return { face, set, advance, missing, subset, svgFile, readSvg };
});
