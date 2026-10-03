/* A small YAML reader and writer for the subset Sectionlab uses.
 *
 * Supported: block mappings, block sequences (including sequences of mappings
 * written "- key: value"), flow sequences of scalars ([1, 2, 3]), empty flow
 * collections ([] and {}), comments, and scalars: null (null, ~, empty),
 * booleans, decimal integers and floats, and plain, single- or double-quoted
 * strings. Not supported, and rejected with a line number: anchors, aliases,
 * tags, block scalars (| and >), flow mappings with content, multiple documents,
 * merge keys, and number forms YAML 1.1 readers disagree on (octal, hex,
 * sexagesimal, underscores).
 *
 * Plain scalars resolve the way PyYAML (YAML 1.1) resolves them, so a file read
 * here and by PyYAML gives the same data; tests/test_yaml_agreement.py checks it.
 * The writer quotes every string that would otherwise read back as something else.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.SectionLab = root.SectionLab || {}).yaml = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  class YamlError extends Error {
    constructor(message, line) {
      super(line ? `YAML line ${line}: ${message}` : `YAML: ${message}`);
      this.name = "YamlError";
      this.line = line || null;
    }
  }

  // YAML 1.1 plain-scalar resolution as PyYAML does it (the subset this reader accepts).
  const NULL_RE = /^(?:~|null|Null|NULL)?$/;
  const BOOL_TRUE = /^(?:yes|Yes|YES|true|True|TRUE|on|On|ON)$/;
  const BOOL_FALSE = /^(?:no|No|NO|false|False|FALSE|off|Off|OFF)$/;
  const INT_RE = /^[-+]?(?:0|[1-9][0-9]*)$/;
  const FLOAT_RE = /^[-+]?(?:[0-9]+\.[0-9]*|\.[0-9]+)(?:[eE][-+][0-9]+)?$/;
  const SPECIAL_FLOAT = /^(?:[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN))$/;
  // Plain scalars PyYAML reads as something other than a string in forms this subset does not accept: rejected.
  const AMBIGUOUS = /^(?:[-+]?0[0-7_]+|[-+]?0x[0-9a-fA-F_]+|[-+]?0b[01_]+|[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+(?:\.[0-9_]*)?|[-+]?[0-9][0-9_]*_[0-9_]*(?:\.[0-9_]*)?(?:[eE][-+][0-9]+)?|[-+]?(?:[0-9][0-9_]*)?\.[0-9_]*_[0-9_]*|[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}.*|=|<<)$/;
  // Plain scalars PyYAML reads as strings but YAML 1.2 readers read as numbers or booleans: read as strings, always written quoted.
  const QUOTE_ALWAYS = /^(?:[-+]?[0-9]+(?:\.[0-9]*)?[eE][0-9]+|[-+]?\.?[0-9]+[eE][-+]?[0-9]+|0o[0-7]+|[-+]?(?:inf|nan|Inf|NaN|INF|NAN)|y|Y|n|N)$/;

  function resolvePlain(text, line) {
    if (NULL_RE.test(text)) return null;
    if (BOOL_TRUE.test(text)) return true;
    if (BOOL_FALSE.test(text)) return false;
    if (INT_RE.test(text)) return parseInt(text, 10);
    if (FLOAT_RE.test(text)) return parseFloat(text);
    if (SPECIAL_FLOAT.test(text)) {
      if (/nan/i.test(text)) return NaN;
      return text.startsWith("-") ? -Infinity : Infinity;
    }
    if (AMBIGUOUS.test(text)) throw new YamlError(`the value "${text}" is in a number or date form this reader does not accept; quote it or write a plain decimal`, line);
    if (/^[&*!|>%@`]/.test(text)) throw new YamlError(`"${text[0]}" (anchors, aliases, tags, block scalars, directives) is not supported`, line);
    return text;
  }

  function parseDouble(s, line) {
    let out = "";
    for (let i = 1; i < s.length - 1; i++) {
      const c = s[i];
      if (c !== "\\") { out += c; continue; }
      const n = s[++i];
      const simple = { n: "\n", t: "\t", r: "\r", '"': '"', "\\": "\\", "/": "/", "0": "\0", " ": " " };
      if (n in simple) out += simple[n];
      else if (n === "x" || n === "u" || n === "U") {
        const len = n === "x" ? 2 : n === "u" ? 4 : 8;
        const hex = s.slice(i + 1, i + 1 + len);
        if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length !== len) throw new YamlError("bad escape in a double-quoted string", line);
        out += String.fromCodePoint(parseInt(hex, 16));
        i += len;
      } else throw new YamlError(`unsupported escape "\\${n}"`, line);
    }
    return out;
  }

  /* Split off a trailing comment ("  # …") outside quotes. */
  function stripComment(s) {
    let q = null;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) {
        if (q === '"' && c === "\\") { i++; continue; }
        if (c === q) { if (q === "'" && s[i + 1] === "'") { i++; continue; } q = null; }
        continue;
      }
      if ((c === '"' || c === "'") && (i === 0 || /[\s:[,-]/.test(s[i - 1]))) q = c;
      else if (c === "#" && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i).trimEnd();
    }
    return s.trimEnd();
  }

  /* Index of the quote closing the string that starts at s[0], or −1. */
  function closingQuote(s) {
    const q = s[0];
    for (let i = 1; i < s.length; i++) {
      if (q === '"' && s[i] === "\\") { i++; continue; }
      if (s[i] === q) { if (q === "'" && s[i + 1] === "'") { i++; continue; } return i; }
    }
    return -1;
  }

  function scalar(text, line) {
    const s = text.trim();
    if (s.startsWith('"') || s.startsWith("'")) {
      const end = closingQuote(s);
      if (end < 0) throw new YamlError("unterminated quoted string", line);
      if (end !== s.length - 1) throw new YamlError("unexpected text after a quoted string", line);
      return s[0] === '"' ? parseDouble(s, line) : s.slice(1, -1).replace(/''/g, "'");
    }
    if (s.startsWith("[")) return flowSeq(s, line);
    if (s.startsWith("{")) {
      if (/^\{\s*\}$/.test(s)) return {};
      throw new YamlError("flow mappings are not supported; use a block mapping", line);
    }
    return resolvePlain(s, line);
  }

  function flowSeq(s, line) {
    if (!s.endsWith("]")) throw new YamlError("unterminated flow sequence", line);
    const body = s.slice(1, -1).trim();
    if (!body) return [];
    const items = [];
    let cur = "", q = null;
    for (let i = 0; i < body.length; i++) {
      const c = body[i];
      if (q) {
        cur += c;
        if (q === '"' && c === "\\") { cur += body[++i]; continue; }
        if (c === q) { if (q === "'" && body[i + 1] === "'") { cur += body[++i]; continue; } q = null; }
        continue;
      }
      if (c === '"' || c === "'") { q = c; cur += c; continue; }
      if (c === "[" || c === "{") throw new YamlError("nested flow collections are not supported", line);
      if (c === ",") { items.push(cur); cur = ""; continue; }
      cur += c;
    }
    if (q) throw new YamlError("unterminated string in a flow sequence", line);
    if (cur.trim() || items.length) items.push(cur);
    if (items.length && !items[items.length - 1].trim()) items.pop();
    return items.map((t) => {
      if (!t.trim()) throw new YamlError("empty item in a flow sequence", line);
      if (/^\s*[^'"].*:\s/.test(t) || /:$/.test(t.trim())) throw new YamlError("mappings inside flow sequences are not supported", line);
      return scalar(t, line);
    });
  }

  /* Find "key: value" at the top of a line; returns [key, rest] or null. */
  function splitKey(s, line) {
    let key, rest;
    if (s[0] === '"' || s[0] === "'") {
      const q = s[0];
      let i = 1;
      for (; i < s.length; i++) {
        if (q === '"' && s[i] === "\\") { i++; continue; }
        if (s[i] === q) { if (q === "'" && s[i + 1] === "'") { i++; continue; } break; }
      }
      if (i >= s.length) return null;
      const after = s.slice(i + 1);
      const m = /^\s*:(?:\s|$)/.exec(after);
      if (!m) return null;
      key = scalar(s.slice(0, i + 1), line);
      rest = after.slice(m[0].length);
    } else {
      const m = /^([^#:]*?[^\s#:]|[^\s#:]):(?:\s+|$)/.exec(s);
      if (!m) {
        // Keys may contain ':' only when not followed by a space.
        const m2 = /^(.+?):(?:\s+|$)/.exec(s);
        if (!m2 || m2[1].includes(": ")) return null;
        key = m2[1]; rest = s.slice(m2[0].length);
      } else { key = m[1]; rest = s.slice(m[0].length); }
      if (key.startsWith("?")) throw new YamlError("complex keys are not supported", line);
      if (key.trim() === "<<") throw new YamlError("merge keys are not supported", line);
      key = resolvePlain(key.trim(), line);
    }
    if (key !== null && typeof key === "object") throw new YamlError("keys must be scalars", line);
    return [key === null ? "null" : String(key), rest];
  }

  function parse(text) {
    if (typeof text !== "string") throw new YamlError("input must be text");
    const raw = text.replace(/^\uFEFF/, "").split(/\r\n|\r|\n/);
    const lines = [];
    let docStarted = false;
    raw.forEach((l, i) => {
      if (/\t/.test(l.match(/^\s*/)[0])) throw new YamlError("tabs are not allowed for indentation", i + 1);
      if (/^%/.test(l)) throw new YamlError("directives are not supported", i + 1);
      if (/^---(\s|$)/.test(l)) { if (docStarted || lines.length) throw new YamlError("only one document is supported", i + 1); docStarted = true; if (l.slice(3).trim() && !l.slice(3).trim().startsWith("#")) throw new YamlError("content after --- is not supported", i + 1); return; }
      if (/^\.\.\.(\s|$)/.test(l)) { lines.push({ end: true, n: i + 1 }); return; }
      const body = stripComment(l);
      if (!body.trim()) return;
      lines.push({ indent: body.length - body.trimStart().length, text: body.trimStart(), n: i + 1 });
    });
    const endAt = lines.findIndex((l) => l.end);
    if (endAt >= 0) {
      if (lines.slice(endAt + 1).length) throw new YamlError("only one document is supported", lines[endAt + 1].n);
      lines.length = endAt;
    }
    if (!lines.length) return null;
    let pos = 0;

    function block(indent) {
      const first = lines[pos];
      if (first.text.startsWith("- ") || first.text === "-") return seq(first.indent);
      if (splitKey(first.text, first.n)) return map(first.indent);
      if (lines.length - pos > 1 && lines[pos + 1].indent >= indent) throw new YamlError("multi-line plain scalars are not supported", lines[pos + 1].n);
      pos++;
      return scalar(first.text, first.n);
    }

    function valueAfter(rest, parentIndent, line, seqItem) {
      if (rest.trim() !== "") {
        if (/^[&*!]/.test(rest.trim())) throw new YamlError("anchors, aliases and tags are not supported", line);
        if (/^[|>]/.test(rest.trim())) throw new YamlError("block scalars (| and >) are not supported", line);
        const next = lines[pos];
        if (next && next.indent > parentIndent && !(seqItem && next.indent === parentIndent)) {
          throw new YamlError("multi-line plain scalars are not supported", next.n);
        }
        return scalar(rest, line);
      }
      const next = lines[pos];
      if (!next || next.indent < parentIndent) return null;
      if (next.indent === parentIndent) {
        // A sequence may sit at the same indent as its parent key.
        if (!seqItem && (next.text.startsWith("- ") || next.text === "-")) return seq(next.indent);
        return null;
      }
      return block(next.indent);
    }

    function map(indent) {
      const out = {};
      while (pos < lines.length) {
        const l = lines[pos];
        if (l.indent < indent) break;
        if (l.indent > indent) throw new YamlError("unexpected indentation", l.n);
        if (l.text.startsWith("- ") || l.text === "-") break;
        const kv = splitKey(l.text, l.n);
        if (!kv) throw new YamlError(`expected "key: value"`, l.n);
        const [key, rest] = kv;
        if (key === "<<") throw new YamlError("merge keys are not supported", l.n);
        if (Object.prototype.hasOwnProperty.call(out, key)) throw new YamlError(`duplicate key "${key}"`, l.n);
        pos++;
        out[key] = valueAfter(rest, indent, l.n, false);
      }
      return out;
    }

    function seq(indent) {
      const out = [];
      while (pos < lines.length) {
        const l = lines[pos];
        if (l.indent < indent) break;
        if (l.indent > indent) throw new YamlError("unexpected indentation", l.n);
        if (!(l.text.startsWith("- ") || l.text === "-")) break;
        const rest = l.text === "-" ? "" : l.text.slice(2);
        const inner = rest.length - rest.trimStart().length;
        const itemIndent = indent + 2 + inner;
        const body = rest.trimStart();
        if (!body) { pos++; out.push(valueAfter("", indent, l.n, true)); continue; }
        if (body.startsWith("- ") || body === "-" ) {
          // Nested sequence on the same line: rewrite the line as the nested block.
          lines[pos] = { indent: itemIndent, text: body, n: l.n };
          out.push(seq(itemIndent));
          continue;
        }
        if (!body.startsWith("[") && splitKey(body, l.n)) {
          lines[pos] = { indent: itemIndent, text: body, n: l.n };
          out.push(map(itemIndent));
          continue;
        }
        pos++;
        out.push(valueAfter(body, indent, l.n, true));
      }
      return out;
    }

    const value = block(lines[0].indent);
    if (pos < lines.length) throw new YamlError("unexpected content", lines[pos].n);
    return value;
  }

  /* ---------- writer ---------- */

  function needsQuote(s) {
    if (s === "") return true;
    if (s !== s.trim()) return true;
    if (/[\n\r\t\0-\x08\x0b\x0c\x0e-\x1f\x7f"\\]/.test(s)) return true;
    if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(s)) return true;
    if (/: |:$| #/.test(s)) return true;
    if (QUOTE_ALWAYS.test(s)) return true;
    try {
      if (resolvePlain(s, 0) !== s) return true;
    } catch (e) { return true; }
    return false;
  }

  function quote(s) {
    let out = '"';
    for (const ch of s) {
      const c = ch.codePointAt(0);
      if (ch === '"') out += '\\"';
      else if (ch === "\\") out += "\\\\";
      else if (ch === "\n") out += "\\n";
      else if (ch === "\t") out += "\\t";
      else if (ch === "\r") out += "\\r";
      else if (c < 0x20 || c === 0x7f) out += "\\x" + c.toString(16).padStart(2, "0");
      else out += ch;
    }
    return out + '"';
  }

  /* Numbers are written so YAML 1.1 readers (which need a "." and a signed exponent) read a float. */
  function number(x) {
    if (Number.isNaN(x)) return ".nan";
    if (x === Infinity) return ".inf";
    if (x === -Infinity) return "-.inf";
    if (Number.isInteger(x) && Math.abs(x) < 1e21) return Object.is(x, -0) ? "0" : String(x);
    let s = String(x);
    if (/e/.test(s)) {
      let [m, e] = s.split("e");
      if (!m.includes(".")) m += ".0";
      if (!/^[-+]/.test(e)) e = "+" + e;
      s = `${m}e${e}`;
    } else if (!s.includes(".")) s += ".0";
    return s;
  }

  function scalarOut(v) {
    if (v === null || v === undefined) return "null";
    if (typeof v === "boolean") return v ? "true" : "false";
    if (typeof v === "number") return number(v);
    const s = String(v);
    return needsQuote(s) ? quote(s) : s;
  }

  const isFlat = (a) => Array.isArray(a) && a.every((x) => x === null || typeof x !== "object");

  function stringify(value) {
    const lines = [];
    const key = (k) => scalarOut(String(k)) === String(k) ? String(k) : quote(String(k));
    function emit(v, indent) {
      const pad = " ".repeat(indent);
      if (Array.isArray(v)) {
        for (const item of v) {
          if (item !== null && typeof item === "object" && !(Array.isArray(item) ? isFlat(item) || !item.length : !Object.keys(item).length)) {
            if (Array.isArray(item)) { lines.push(`${pad}-`); emit(item, indent + 2); continue; }
            const sub = [];
            const save = lines.length;
            emit(item, indent + 2);
            sub.push(...lines.splice(save));
            sub[0] = `${pad}- ${sub[0].slice(indent + 2)}`;
            lines.push(...sub);
          } else lines.push(`${pad}- ${inline(item)}`);
        }
        return;
      }
      for (const [k, x] of Object.entries(v)) {
        if (x !== null && typeof x === "object" && !(Array.isArray(x) ? isFlat(x) || !x.length : !Object.keys(x).length)) {
          lines.push(`${pad}${key(k)}:`);
          emit(x, Array.isArray(x) ? indent : indent + 2);
        } else lines.push(`${pad}${key(k)}: ${inline(x)}`);
      }
    }
    // Inside [ … ] the flow indicators , [ ] { } and ": " also end a plain scalar, so such strings are quoted.
    const flowItem = (x) => (typeof x === "string" && /[,[\]{}]|: |:$/.test(x) ? quote(x) : scalarOut(x));
    const inline = (x) => {
      if (Array.isArray(x)) return `[${x.map(flowItem).join(", ")}]`;
      if (x !== null && typeof x === "object") return "{}";
      return scalarOut(x);
    };
    if (value === null || typeof value !== "object") return scalarOut(value) + "\n";
    if (Array.isArray(value) && !value.length) return "[]\n";
    if (!Array.isArray(value) && !Object.keys(value).length) return "{}\n";
    emit(value, 0);
    return lines.join("\n") + "\n";
  }

  return { YamlError, parse, stringify, resolvePlain };
});
