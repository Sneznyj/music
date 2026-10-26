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

// Расставить аккорды песни над голым текстом (человек вставил только слова).
// blocks — части песни по порядку исполнения: [{ name: 'Куплет', bars: [['Am'], ['F', 'C'], …] }, …].
// Строфы текста (через пустую строку) по очереди ложатся на части; строфа, которая уже была (припев), берёт ту же часть;
// подпись «Припев» / «Chorus» / «Куплет» / «Verse» над строфой выбирает часть по имени. Такты делятся между строками поровну.
// Ответ — текст в виде «песенника» (аккорды строкой выше), его можно поправить руками.
export function hasChords(text) {
  return /\[[A-H][^\]]*\]/.test(text) || text.split('\n').some(chordLine);
}

export function placeChords(text, blocks) {
  if (!blocks.length) return text;
  const stanzas = text.replace(/\r/g, '').split(/\n\s*\n/).map((s) => s.split('\n').filter((l) => l.trim()));
  const kind = (s) => (/(припев|chorus|refrain)/i.test(s) ? 'chorus' : /(куплет|verse)/i.test(s) ? 'verse' : '');
  const blockKind = (b) => kind(b.name);
  const isHead = (l) => l.trim().length < 40 && (/^\s*[[(]?\s*(припев|куплет|бридж|вступление|проигрыш|кода|chorus|verse|bridge|intro|outro|refrain)\b/i.test(l) || /:\s*$/.test(l));
  const seen = new Map();
  let next = 0;
  const out = [];
  for (const st of stanzas) {
    const head = st[0] && isHead(st[0]) ? st[0] : '';
    const lines = head ? st.slice(1) : st;
    const key = lines.join('\n').toLowerCase().replace(/\s+/g, ' ');
    let bi;
    if (seen.has(key)) bi = seen.get(key);
    else if (kind(head)) {
      bi = blocks.findIndex((b, i) => i >= next && blockKind(b) === kind(head));
      if (bi < 0) bi = blocks.findIndex((b) => blockKind(b) === kind(head));
      if (bi < 0) bi = next % blocks.length;
    } else bi = next % blocks.length;
    if (!seen.has(key)) seen.set(key, bi);
    if (bi >= next) next = bi + 1;
    if (next >= blocks.length) next = 0;
    if (head) out.push(head);
    const bars = blocks[bi].bars;
    lines.forEach((line, i) => {
      const from = Math.floor((i * bars.length) / lines.length);
      const to = Math.floor(((i + 1) * bars.length) / lines.length);
      const names = bars.slice(from, Math.max(to, from + (from < bars.length && i === lines.findIndex((_, j) => Math.floor((j * bars.length) / lines.length) === from) ? 1 : 0))).flat();
      if (!names.length) {
        out.push(line);
        return;
      }
      // аккорды — над началами слов, поровну по строке
      const words = [...line.matchAll(/\S+/g)].map((m) => m.index);
      let row = '';
      names.forEach((n, k) => {
        const at = words.length ? words[Math.floor((k * words.length) / names.length)] : 0;
        const pos = Math.max(at, row.length ? row.length + 1 : 0);
        row = row.padEnd(pos, ' ') + n;
      });
      out.push(row, line);
    });
    out.push('');
  }
  return out.join('\n').trim();
}
