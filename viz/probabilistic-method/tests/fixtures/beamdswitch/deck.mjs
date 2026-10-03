// Vendored read-only from yujieteo/beamdswitch src/deck.js at commit 7dfd98d; do not edit here.
// The tests parse beamdiag's beamdswitch decks with beamdswitch's own parser.
// Markdown deck -> frames. Pure: no DOM, so node --test can load it.
//
// A deck is one Markdown file:
//   ---             front matter (title, subtitle, author, institute, date, voice)
//   # Section       a section divider slide
//   ## Frame title  a frame; everything until the next heading is its body
//   . . .           a pause: what follows appears on the next overlay step
//   ::: notes       speaker notes (handout, presenter view; never on the slide)
//   ::: narration   what the video says for this frame, one caption per sentence
//   ::: block Title a titled block; also theorem, example, alert, key,
//                   columns / column, morph (display equations that morph)
// Content before the first heading belongs to the title slide.

const FENCE = /^\s*(```+|~~~+)/;
const DIV = /^\s*(:{3,})\s*(?:\{?\.?([A-Za-z][\w-]*)\}?)?\s*(.*?)\s*:*\s*$/;
const PAUSE = /^\s*\.\s+\.\s+\.\s*$/;
const HEADING = /^(#{1,2})\s+(.*?)\s*#*\s*$/;
// Divs whose body is kept as raw text rather than rendered on the slide.
const RAW_DIVS = new Set(['notes', 'narration']);
// Divs that occupy one overlay step per display equation.
const STEPPED_DIVS = new Set(['morph']);

export function parseFrontMatter(src) {
  const text = src.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const m = /^---\n([\s\S]*?)\n(?:---|\.\.\.)\s*(?:\n|$)/.exec(text);
  if (!m) return { meta: {}, body: text, offset: 0 };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    let v = kv[2].trim();
    if (/^(["']).*\1$/.test(v)) v = v.slice(1, -1);
    meta[kv[1].toLowerCase()] = v;
  }
  const offset = m[0].split('\n').length - (m[0].endsWith('\n') ? 1 : 0);
  return { meta, body: text.slice(m[0].length), offset };
}

// Count display equations ($$...$$ or \[...\]) in a Markdown fragment.
export function displayEquations(text) {
  const out = [];
  const re = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]/g;
  let m;
  while ((m = re.exec(text))) out.push((m[1] ?? m[2]).trim());
  return out;
}

// Split a frame body into a tree of Markdown chunks and fenced divs, each
// tagged with the overlay step it first appears on.
export function parseBody(lines) {
  const root = { type: 'root', children: [] };
  const stack = [root];
  const raw = {};
  let step = 0, buf = [], bufStep = 0, fence = null, rawDiv = null;
  const top = () => stack[stack.length - 1];
  const flush = () => {
    if (buf.some(l => l.trim())) top().children.push({ type: 'md', text: buf.join('\n'), step: bufStep });
    buf = [];
  };
  for (const line of lines) {
    if (rawDiv) {
      if (!fence && DIV.test(line) && !DIV.exec(line)[2]) {
        const text = rawDiv.lines.join('\n').trim();
        raw[rawDiv.name] = raw[rawDiv.name] ? raw[rawDiv.name] + '\n\n' + text : text;
        rawDiv = null;
      } else rawDiv.lines.push(line);
      continue;
    }
    const f = FENCE.exec(line);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
      if (!buf.length) bufStep = step;
      buf.push(line);
      continue;
    }
    if (fence) { buf.push(line); continue; }
    if (PAUSE.test(line)) { flush(); step++; continue; }
    const d = DIV.exec(line);
    if (d) {
      flush();
      const name = d[2] && d[2].toLowerCase();
      if (name && RAW_DIVS.has(name)) { rawDiv = { name, lines: [] }; continue; }
      if (name) {
        const node = { type: 'div', name, title: d[3] || '', step, children: [] };
        top().children.push(node);
        stack.push(node);
      } else if (stack.length > 1) {
        const node = stack.pop();
        if (STEPPED_DIVS.has(node.name)) {
          const n = node.children.reduce((k, c) => k + (c.type === 'md' ? displayEquations(c.text).length : 0), 0);
          node.count = Math.max(n, 1);
          step = node.step + node.count - 1;
        }
      }
      bufStep = step;
      continue;
    }
    if (!buf.length) bufStep = step;
    buf.push(line);
  }
  if (rawDiv) raw[rawDiv.name] = (raw[rawDiv.name] ? raw[rawDiv.name] + '\n\n' : '') + rawDiv.lines.join('\n').trim();
  flush();
  while (stack.length > 1) stack.pop();
  return { children: root.children, steps: step + 1, notes: raw.notes || '', narration: raw.narration || '' };
}

export function parseDeck(src) {
  const { meta, body, offset } = parseFrontMatter(src);
  const lines = body.split('\n');
  const chunks = [];
  let cur = { kind: 'title', title: meta.title || 'Untitled', lines: [], line: offset + 1 };
  let fence = null;
  lines.forEach((line, i) => {
    const f = FENCE.exec(line);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
    }
    const h = !fence && !f && HEADING.exec(line);
    if (h) {
      chunks.push(cur);
      cur = { kind: h[1].length === 1 ? 'section' : 'frame', title: h[2], lines: [], line: offset + i + 1 };
    } else cur.lines.push(line);
  });
  chunks.push(cur);

  const frames = [];
  let section = '', sectionNo = 0;
  for (const c of chunks) {
    const b = parseBody(c.lines);
    const frame = {
      kind: c.kind, title: c.title, line: c.line,
      children: b.children, steps: b.steps, notes: b.notes, narration: b.narration,
    };
    if (c.kind === 'section') {
      section = c.title;
      frame.number = ++sectionNo;
      if (!frame.narration) frame.narration = `Part ${sectionNo}. ${stripMarkup(c.title)}.`;
    }
    if (c.kind === 'title') {
      Object.assign(frame, { subtitle: meta.subtitle || '', author: meta.author || '', institute: meta.institute || '', date: meta.date || '' });
      if (!frame.narration) frame.narration = [meta.title, meta.subtitle].filter(Boolean).map(s => stripMarkup(s).replace(/[.!?]*$/, '.')).join(' ');
    }
    frame.section = c.kind === 'title' ? '' : section;
    frames.push(frame);
  }
  frames.forEach((f, i) => { f.index = i; f.id = slug(f.title) || `frame-${i + 1}`; });
  const seen = {};
  for (const f of frames) { if (seen[f.id]) f.id += '-' + (++seen[f.id]); else seen[f.id] = 1; }
  return { meta, frames };
}

export function stripMarkup(s) {
  return String(s)
    .replace(/\$\$?([^$]*)\$\$?/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function slug(s) {
  return stripMarkup(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

// Split narration into sentences, one caption and one TTS call each.
export function splitSentences(text) {
  const t = String(text).replace(/\s+/g, ' ').trim();
  if (!t) return [];
  const out = [];
  const re = /[^.!?]+(?:[.!?]+["')\]]*|$)/g;
  let m, acc = '';
  while ((m = re.exec(t))) {
    if (!m[0]) { re.lastIndex++; continue; }
    acc += m[0];
    const rest = t.slice(re.lastIndex);
    // Keep "e.g.", "i.e.", "Fig. 2", "3.5" and initials inside one sentence.
    const tail = acc.trimEnd();
    const abbrev = /\b(?:e\.g|i\.e|etc|vs|cf|Fig|Eq|Dr|Mr|Mrs|Ms|Prof|No|approx)\.$/i.test(tail) || /\b[A-Z]\.$/.test(tail);
    if (rest && (abbrev || /^\d/.test(rest) || !/^\s/.test(rest))) continue;
    if (acc.trim()) out.push(acc.trim());
    acc = '';
  }
  if (acc.trim()) out.push(acc.trim());
  return out;
}

export const WORDS_PER_MINUTE = 130;

// Estimated speaking time for a sentence when there is no audio yet.
export function estimateSeconds(sentence) {
  const words = String(sentence).split(/\s+/).filter(Boolean).length;
  return Math.max(0.8, words * 60 / WORDS_PER_MINUTE);
}
