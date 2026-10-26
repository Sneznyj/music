// Текст с аккордами: разбор и вывод «аккорды над словами».
// Понимает два формата:
//   ChordPro:          [Am]Кукушка [F]поёт…
//   песенник:          Am        F
//                      Кукушка   поёт…        (строка из одних аккордов над строкой текста)
// Аккорд выводится как <b class="sb-c" data-c="Am">, чтобы страница могла его транспонировать.

import { parseChord } from './theory.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const isChord = (t) => /^[A-H]/.test(t) && !!parseChord(t.replace(/^H/, 'B'))?.valid;
const chordLine = (line) => {
  const toks = line.trim().split(/\s+/).filter(Boolean);
  return toks.length > 0 && toks.every((t) => isChord(t) || /^[|/%x×\d-]+$/.test(t)) && toks.some(isChord);
};

// строка ChordPro → куски { chord, text }
function segments(line) {
  const out = [];
  const re = /\[([^\]]+)\]/g;
  let last = 0;
  let chord = null;
  let m;
  while ((m = re.exec(line))) {
    if (m.index > last || chord) out.push({ chord, text: line.slice(last, m.index) });
    chord = m[1].trim();
    last = re.lastIndex;
  }
  out.push({ chord, text: line.slice(last) });
  return out.filter((s) => s.chord || s.text);
}

// песенник (аккорды строкой выше) → ChordPro
export function toChordPro(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/\[[A-H][^\]]*\]/.test(l) || !chordLine(l)) {
      out.push(l);
      continue;
    }
    const next = lines[i + 1];
    const marks = [...l.matchAll(/\S+/g)].filter((m) => isChord(m[0]));
    if (next == null || !next.trim() || chordLine(next)) {
      out.push(marks.map((m) => `[${m[0]}]`).join(' '));
      continue;
    }
    let s = next.padEnd(Math.max(...marks.map((m) => m.index)) + 1, ' ');
    for (const m of marks.slice().reverse()) s = s.slice(0, m.index) + `[${m[0]}]` + s.slice(m.index);
    out.push(s.trimEnd());
    i++;
  }
  return out.join('\n');
}

const chordTag = (c) => `<b class="sb-c" data-c="${esc(c)}">${esc(c)}</b>`;

export function lineHTML(line) {
  if (!line.trim()) return '<div class="sb-gap"></div>';
  const head = /^\s*(\{[^}]*\}|#.*|[А-ЯЁA-Z][^[\]]{0,30}:)\s*$/.exec(line);
  if (head) return `<div class="sb-h">${esc(line.replace(/[{}#]/g, '').trim())}</div>`;
  const segs = segments(line);
  if (!segs.some((s) => s.chord)) return `<div class="sb-line">${esc(line)}</div>`;
  return `<div class="sb-line">${segs.map((s) => `<span class="sb-seg">${s.chord ? chordTag(s.chord) : '<b class="sb-c sb-empty"></b>'}<span class="sb-t">${esc(s.text) || '&nbsp;'}</span></span>`).join('')}</div>`;
}

export function textHTML(text) {
  return toChordPro(text).split('\n').map(lineHTML).join('');
}
