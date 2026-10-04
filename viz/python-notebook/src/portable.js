// The portable HTML file: the writer behind Save HTML copy, in the same form on the website and in a copy.
//
// A portable file is the page's own code (the parts build.py marks with data-pynb-part, copied as they are),
// the portable head (a Content-Security-Policy with no 'self', so nothing can load from beside the file), the
// notebook as one JSON block, each included data file as one base64 block, and every runtime file as one
// base64 block. User content never goes into an attribute or into executable text: the notebook JSON escapes
// every "<", and a data file is named by its index in that JSON.
(function (root, factory) {
  const node = typeof module === "object" && module.exports;
  const api = factory();
  if (node) module.exports = api;
  else (root.PyNb = root.PyNb || {}).portable = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const APP_ROOT = '<div id="app"></div>';

  /** JSON that cannot end its script element or start an HTML comment; JSON.parse gives back the same value. @param {any} value */
  function scriptJSON(value) {
    return JSON.stringify(value).replace(/</g, "\\u003c");
  }

  /**
   * The parts of a portable file, in order, for new Blob(parts). headParts and bodyParts are the page's own
   * elements as HTML text; csp is the portable Content-Security-Policy. Every base64 text is checked here, so
   * no other text can reach a data block.
   * @param {{csp: string, headParts: string[], bodyParts: string[], document: {name: string, notebook: object, files: {path: string, bytes: number, sha256: string}[]},
   *   data: string[], assets: {path: string, base64: string}[]}} input
   * @returns {string[]}
   */
  function write({ csp, headParts, bodyParts, document, data, assets }) {
    if (data.length !== document.files.length) throw new Error(`${document.files.length} data files are listed and ${data.length} are given`);
    if (/["&<>]/.test(csp)) throw new Error("the Content-Security-Policy text has a character that needs escaping");
    const base64 = (text, what) => {
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text)) throw new Error(`${what} is not base64`);
      return text;
    };
    const out = ["<!doctype html>\n<html lang=\"en\" data-pynb-form=\"portable\">\n<head>\n<meta charset=\"utf-8\">\n",
      `<meta http-equiv="Content-Security-Policy" content="${csp}">\n`];
    for (const part of headParts) out.push(part, "\n");
    out.push("</head>\n<body>\n", APP_ROOT, "\n");
    out.push(`<script type="application/json" id="pynb-document">${scriptJSON(document)}</script>\n`);
    data.forEach((text, index) => {
      out.push(`<script type="application/octet-stream" data-pynb-data="${index}">`, base64(text, document.files[index].path), "</script>\n");
    });
    for (const part of bodyParts) out.push(part, "\n");
    for (const asset of assets) {
      if (!/^runtime\/[\w.+-]+$/.test(asset.path)) throw new Error(`${asset.path} is not a runtime file name`);
      out.push(`<script type="application/octet-stream" data-pynb-asset="${asset.path}">`, base64(asset.base64, asset.path), "</script>\n");
    }
    out.push("</body>\n</html>\n");
    return out;
  }

  /** Base64 of bytes, in chunks small enough for String.fromCharCode. @param {Uint8Array} bytes */
  function toBase64(bytes) {
    if (typeof bytes.toBase64 === "function") return bytes.toBase64();
    let text = "";
    for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(text);
  }

  /** @param {string} text */
  function fromBase64(text) {
    const U8 = /** @type {any} */ (Uint8Array);
    if (typeof U8.fromBase64 === "function") return U8.fromBase64(text);
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  return { APP_ROOT, scriptJSON, write, toBase64, fromBase64 };
});
