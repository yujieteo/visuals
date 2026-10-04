// Safe display of Markdown cells and cell outputs.
//
// Imported notebooks are not trusted. HTML (from Markdown, from text/html outputs, from pandas) goes through an
// allowlist in an inert document: no script, style, event handler, form, frame or SVG survives, a link keeps
// only an http(s), mailto or # address, and an image keeps only a data: image. So a notebook output never runs
// code and never loads anything; the page's Content-Security-Policy is a second wall behind this one.
// Mathematics ($…$, $$…$$, text/latex) goes through KaTeX, which makes its own HTML from the TeX text.
(function (root, factory) {
  const node = typeof module === "object" && module.exports;
  const api = factory();
  if (node) module.exports = api;
  else (root.PyNb = root.PyNb || {}).render = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const TEXT_LIMIT = 200000;           // characters of one text output shown before "Show all"
  const IMAGE_LIMIT = 25 * 1024 * 1024; // base64 characters of one image shown at once

  const KEEP = new Set(["a", "abbr", "b", "blockquote", "br", "caption", "code", "col", "colgroup", "dd", "del", "details",
    "div", "dl", "dt", "em", "figcaption", "figure", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "input", "ins",
    "kbd", "li", "mark", "ol", "p", "pre", "q", "s", "samp", "small", "span", "strong", "sub", "summary", "sup", "table",
    "tbody", "td", "tfoot", "th", "thead", "tr", "u", "ul"]);
  // Removed with everything inside them.
  const DROP = new Set(["script", "style", "template", "iframe", "frame", "frameset", "object", "embed", "noscript",
    "svg", "math", "link", "meta", "base", "form", "textarea", "select", "button", "audio", "video", "source",
    "track", "canvas", "applet", "title", "head"]);
  const ATTRS = new Set(["title", "lang", "dir", "colspan", "rowspan", "scope", "headers", "align", "alt", "width",
    "height", "start", "reversed", "open", "type", "checked", "disabled"]);
  const SAFE_HREF = /^(?:https?:|mailto:|#)/i;
  const SAFE_IMAGE = /^data:image\/(?:png|jpeg|gif|webp|bmp|svg\+xml)[;,]/i;

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  /** @param {Element} node @param {(src: string) => string | null} image */
  function clean(node, image) {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 8) { child.remove(); continue; }
      if (child.nodeType !== 1) continue;
      const element = /** @type {Element} */ (child);
      const tag = element.localName;
      if (DROP.has(tag)) { element.remove(); continue; }
      if (!KEEP.has(tag)) {
        clean(element, image);
        element.replaceWith(...Array.from(element.childNodes));
        continue;
      }
      for (const attr of Array.from(element.attributes)) {
        const name = attr.name.toLowerCase();
        if (name === "href" && tag === "a" && SAFE_HREF.test(attr.value.trim())) continue;
        if (name === "src" && tag === "img") continue;
        if (!ATTRS.has(name)) element.removeAttribute(attr.name);
      }
      if (tag === "input" && element.getAttribute("type") !== "checkbox") { element.remove(); continue; }
      if (tag === "input") element.setAttribute("disabled", "");
      if (tag === "a" && element.hasAttribute("href")) {
        element.setAttribute("rel", "noopener noreferrer");
        if (!element.getAttribute("href").startsWith("#")) element.setAttribute("target", "_blank");
      }
      if (tag === "img") {
        const src = image((element.getAttribute("src") || "").trim());
        if (!src) {
          element.replaceWith(el("span", "blocked", `[image not shown: ${element.getAttribute("alt") || "it is not inside the notebook"}]`));
          continue;
        }
        element.setAttribute("src", src);
      }
      clean(element, image);
    }
  }

  /**
   * A fragment of html with only the allowlisted tags and attributes. image maps an img src to a safe data:
   * URL, or to null to block it.
   * @param {string} html @param {(src: string) => string | null} [image]
   */
  function sanitize(html, image = (src) => (SAFE_IMAGE.test(src) ? src : null)) {
    const doc = new DOMParser().parseFromString(`<!doctype html><body>${html}`, "text/html");
    clean(doc.body, image);
    const fragment = document.createDocumentFragment();
    for (const child of Array.from(doc.body.childNodes)) fragment.append(document.importNode(child, true));
    return fragment;
  }

  /** @param {string} tex @param {boolean} display */
  function mathNode(tex, display) {
    const katex = globalThis.pynbVendor.katex;
    const template = document.createElement("template");
    template.innerHTML = katex.renderToString(tex, { displayMode: display, throwOnError: false, trust: false, strict: "ignore", output: "htmlAndMathml" });
    const wrap = el(display ? "div" : "span", display ? "math-display" : "math-inline");
    wrap.append(template.content);
    return wrap;
  }

  // Math in Markdown becomes a placeholder before the HTML is sanitised, and KaTeX output after.
  const OPEN = "", CLOSE = "";
  let markdownReady = false;
  /** @type {{tex: string, display: boolean}[]} */
  let pending = [];
  function setupMarkdown() {
    if (markdownReady) return;
    markdownReady = true;
    const placeholder = (tex, display) => `${OPEN}${pending.push({ tex, display }) - 1}${CLOSE}`;
    globalThis.pynbVendor.marked.use({
      gfm: true,
      extensions: [
        { name: "mathBlock", level: "block", start: (src) => src.indexOf("$$"),
          tokenizer(src) { const m = /^\$\$([\s\S]+?)\$\$[^\S\n]*(?:\n|$)/.exec(src); return m ? { type: "mathBlock", raw: m[0], tex: m[1].trim() } : undefined; },
          renderer: (token) => `<div>${placeholder(token.tex, true)}</div>` },
        { name: "mathInline", level: "inline", start: (src) => src.indexOf("$"),
          tokenizer(src) {
            const m = /^\$\$([^$]+?)\$\$/.exec(src) || /^\$(?!\s)((?:\\.|[^\\$\n])+?)(?<!\s)\$(?!\d)/.exec(src);
            return m ? { type: "mathInline", raw: m[0], tex: m[1], display: m[0].startsWith("$$") } : undefined;
          },
          renderer: (token) => placeholder(token.tex, token.display) },
      ],
    });
  }

  /** @param {Node} root */
  function placeMath(root, found) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const texts = [];
    while (walker.nextNode()) if (walker.currentNode.nodeValue.includes(OPEN)) texts.push(walker.currentNode);
    for (const text of texts) {
      const parts = text.nodeValue.split(new RegExp(`${OPEN}(\\d+)${CLOSE}`));
      const nodes = parts.map((part, i) => (i % 2 ? (found[Number(part)] ? mathNode(found[Number(part)].tex, found[Number(part)].display) : document.createTextNode("")) : document.createTextNode(part)));
      text.replaceWith(...nodes);
    }
  }

  /**
   * A Markdown cell as safe HTML with typeset mathematics. attachment:name images come from the cell's
   * attachments.
   * @param {string} source @param {Record<string, Record<string, string>>} [attachments]
   */
  function markdown(source, attachments) {
    setupMarkdown();
    pending = [];
    const html = globalThis.pynbVendor.marked.parse(source.replaceAll(OPEN, "").replaceAll(CLOSE, ""));
    const found = pending;
    pending = [];
    const image = (src) => {
      if (SAFE_IMAGE.test(src)) return src;
      const m = /^attachment:(.+)$/.exec(src);
      const bundle = m && attachments && attachments[decodeURIComponent(m[1])];
      if (bundle) for (const [mime, data] of Object.entries(bundle)) {
        if (/^image\/(?:png|jpeg|gif|webp|svg\+xml)$/.test(mime) && typeof data === "string") return `data:${mime};base64,${data.replace(/\s+/g, "")}`;
      }
      return null;
    };
    const fragment = sanitize(html, image);
    placeMath(fragment, found);
    return fragment;
  }

  /** Text without ANSI colour codes (Jupyter tracebacks have them). @param {string} text */
  const plain = (text) => text.replace(/\u001b\[[0-9;]*[A-Za-z]/g, "");

  /** @param {(name: string, bytes: Blob) => void} download @param {string} name @param {string} text */
  function bounded(text, className, download, name) {
    const pre = el("pre", className);
    if (text.length <= TEXT_LIMIT) {
      pre.textContent = text;
      return pre;
    }
    const box = el("div");
    pre.textContent = text.slice(0, TEXT_LIMIT);
    const note = el("p", "output-note", `Showing the first ${TEXT_LIMIT.toLocaleString("en")} of ${text.length.toLocaleString("en")} characters. `);
    const all = el("button", "", "Show all");
    all.type = "button";
    all.addEventListener("click", () => { pre.textContent = text; note.remove(); });
    const save = el("button", "", "Download text");
    save.type = "button";
    save.addEventListener("click", () => download(name, new Blob([text], { type: "text/plain" })));
    note.append(all, " ", save);
    box.append(note, pre);
    return box;
  }

  const ORDER = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml", "text/html", "text/markdown", "text/latex", "application/json", "text/plain"];

  /** @param {Record<string, any>} data @param {any} metadata @param {(name: string, bytes: Blob) => void} download */
  function bundle(data, metadata, download) {
    const mime = ORDER.find((m) => m in data);
    if (!mime) return null;
    const value = data[mime];
    if (mime.startsWith("image/")) {
      const text = mime === "image/svg+xml" ? btoa(unescape(encodeURIComponent(String(value)))) : String(value).replace(/\s+/g, "");
      if (text.length > IMAGE_LIMIT) {
        const note = el("p", "output-note", `This image is ${(text.length * 0.75 / 1048576).toFixed(1)} MB, more than the display limit. `);
        const save = el("button", "", "Download image");
        save.type = "button";
        save.addEventListener("click", () => download(`output.${mime.split("/")[1].replace("svg+xml", "svg")}`, new Blob([globalThis.PyNb.portable.fromBase64(text)], { type: mime })));
        note.append(save);
        return note;
      }
      const img = el("img", "output-image");
      img.alt = typeof data["text/plain"] === "string" ? data["text/plain"].slice(0, 200) : "Output image";
      img.src = `data:${mime};base64,${text}`;
      const size = metadata && metadata[mime];
      if (size && Number(size.width) > 0) img.width = Number(size.width);
      return img;
    }
    if (mime === "text/html") {
      const box = el("div", "output-html");
      const preview = metadata && metadata.pynb && metadata.pynb.preview;
      if (preview) {
        const rows = preview.row_ranges.map(([a, b]) => `${a.toLocaleString("en")}–${b.toLocaleString("en")}`).join(" and ");
        box.append(el("p", "output-note", preview.complete
          ? `Table: ${preview.rows.toLocaleString("en")} rows × ${preview.columns.toLocaleString("en")} columns, all shown.`
          : `Preview of a ${preview.rows.toLocaleString("en")} × ${preview.columns.toLocaleString("en")} table: rows ${rows || "none"}` +
            `${preview.columns_shown < preview.columns ? `, columns 1–${preview.columns_shown}` : ""}. The full table is in Python.`));
      }
      const scroll = el("div", "scroll");
      scroll.tabIndex = 0;
      scroll.setAttribute("role", "region");
      scroll.setAttribute("aria-label", "Output table");
      scroll.append(sanitize(String(value)));
      box.append(scroll);
      return box;
    }
    if (mime === "text/markdown") { const box = el("div", "output-markdown markdown"); box.append(markdown(String(value))); return box; }
    if (mime === "text/latex") {
      const tex = String(value).trim().replace(/^\$\$?([\s\S]*?)\$?\$$/, "$1").replace(/^\\displaystyle\s*/, "");
      return mathNode(tex, true);
    }
    if (mime === "application/json") return bounded(JSON.stringify(value, null, 2), "output-text", download, "output.json");
    return bounded(String(value), "output-text", download, "output.txt");
  }

  /**
   * One nbformat output as an element. An output this page cannot show gets a notice; its payload stays in
   * the notebook for export.
   * @param {any} output @param {(name: string, bytes: Blob) => void} download
   */
  function output(output, download) {
    const kind = output.output_type;
    if (kind === "stream") return bounded(output.text, output.name === "stderr" ? "output-text stderr" : "output-text", download, `${output.name}.txt`);
    if (kind === "error") {
      const lines = output.traceback && output.traceback.length ? output.traceback.map(plain).join("\n") : `${output.ename}: ${output.evalue}`;
      const box = bounded(lines, "output-error", download, "error.txt");
      box.setAttribute("role", "alert");
      return box;
    }
    if (kind === "display_data" || kind === "execute_result") {
      const node = bundle(output.data, output.metadata, download);
      if (node) return node;
    }
    const types = output.data ? Object.keys(output.data).join(", ") : kind;
    return el("p", "output-note", `This output (${types}) cannot be shown here. It stays in the notebook and goes out with Export .ipynb.`);
  }

  return { sanitize, markdown, output, TEXT_LIMIT, IMAGE_LIMIT };
});
