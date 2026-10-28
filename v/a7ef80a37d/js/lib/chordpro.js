// Текст с аккордами: разбор, вывод «аккорды над словами», правка и расстановка аккордов песни над голым текстом.
// Понимает два формата:
//   ChordPro:          [Am]Кукушка [F]поёт…
//   песенник:          Am        F
//                      Кукушка   поёт…        (строка из одних аккордов над строкой текста)
// Аккорд выводится как <b class="sb-c" data-c="Am">, чтобы страница могла его транспонировать.
// Модель строки для правки: { text, chords: [{ at, c }] } — аккорд стоит над буквой номер at; заголовок — { head }.

import { parseChord, transposeChord } from './theory.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const isChord = (t) => /^[A-H]/.test(t) && !!parseChord(t.replace(/^H/, 'B'))?.valid;
const chordLine = (line) => {
  const toks = line.trim().split(/\s+/).filter(Boolean);
  return toks.length > 0 && toks.every((t) => isChord(t) || /^[|/%x×\d().:-]+$/.test(t)) && toks.some(isChord);
};
// [Am] — аккорд, [Припев] или [Verse 1] — заголовок части (так пишут Genius и многие сайты)
const bracketChord = (s) => isChord(s.trim());

// ---------- чистка текста, скопированного с сайтов ----------
const JUNK = [
  /^\d*\s*contributors?/i,
  /^you might also like/i,
  /^see .* live$/i,
  /^get tickets/i,
  /^\d*embed$/i,
  /^(источник|source|текст песни|lyrics)\s*:/i,
  /lyricfind|musixmatch|lyrics licensed/i,
  /^(слова|музыка|автор[ы]?|words|music)\s*:/i,
  /^translations?\b/i,
];
export function cleanPasted(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .replace(/\t/g, '    ')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .split('\n')
    .map((l) => l.replace(/\d*Embed\s*$/, '').trimEnd())
    .filter((l) => !JUNK.some((re) => re.test(l.trim())))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// строка ChordPro → куски { chord, text }
function segments(line) {
  const out = [];
  const re = /\[([^\]]+)\]/g;
  let last = 0;
  let chord = null;
  let buf = '';
  let m;
  while ((m = re.exec(line))) {
    if (!bracketChord(m[1])) continue;
    buf += line.slice(last, m.index);
    if (buf || chord) out.push({ chord, text: buf });
    buf = '';
    chord = m[1].trim();
    last = re.lastIndex;
  }
  out.push({ chord, text: buf + line.slice(last) });
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
    if (next == null || !next.trim() || chordLine(next) || isHeadLine(next)) {
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

// заголовок части: «Припев:», «[Chorus]», «{c: Куплет}», «# …», «Куплет 2», «(Припев)»
const HEAD_WORDS = /^\s*[[({]?\s*(c:\s*)?(припев|куплет|бридж|вступление|проигрыш|кода|окончание|соло|запев|переход|chorus|verse|bridge|intro|outro|refrain|pre-?chorus|hook|interlude|solo|instrumental)\b[^[\]]{0,24}$/i;
function isHeadLine(line) {
  const t = line.trim();
  if (!t || t.length > 40) return false;
  if (/^\{[^}]*\}$/.test(t) || /^#/.test(t)) return true;
  const br = /^\[([^\]]+)\]$/.exec(t);
  if (br && !bracketChord(br[1])) return true;
  if (HEAD_WORDS.test(t) && !chordLine(t)) return true;
  return /^[А-ЯЁA-Z][^[\]]{0,30}:$/.test(t);
}
const headText = (line) => line.trim().replace(/^[[({#]\s*|\s*[\])}]$/g, '').replace(/^c:\s*/i, '').replace(/:$/, '').trim();

// ---------- модель для правки ----------
export function parseLines(text) {
  return toChordPro(String(text || '')).split('\n').map((line) => {
    if (!line.trim()) return { text: '', chords: [] };
    if (isHeadLine(line)) return { head: headText(line) };
    let at = 0;
    let txt = '';
    const chords = [];
    for (const s of segments(line)) {
      if (s.chord) chords.push({ at, c: s.chord });
      txt += s.text;
      at += s.text.length;
    }
    return { text: txt, chords };
  });
}

// модель → текст: аккорды строкой выше, а если в строке они налезают друг на друга — в квадратных скобках
export function serialize(model) {
  return model
    .map((l) => {
      if (l.head != null) return `${l.head}:`;
      const cs = l.chords.slice().sort((a, b) => a.at - b.at);
      if (!cs.length) return l.text;
      if (!l.text.trim()) return cs.map((c) => c.c).join(' ');
      let row = '';
      let fits = true;
      for (const c of cs) {
        if (row.length && c.at < row.length + 1) fits = false;
        row = row.padEnd(c.at, ' ') + c.c;
      }
      if (fits) return `${row}\n${l.text}`;
      let s = l.text.padEnd(cs.at(-1).at, ' ');
      for (const c of cs.slice().reverse()) s = s.slice(0, c.at) + `[${c.c}]` + s.slice(c.at);
      return s.trimEnd();
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^(\s*\n)+|(\n\s*)+$/g, '')
    .trimEnd();
}

// пустые строки в начале и в конце — долой, но пробелы перед первым аккордом строки остаются (это его место)
const trimLines = (s) => s.replace(/^(\s*\n)+|(\n\s*)+$/g, '').trimEnd();

const chordTag = (c, extra = '') => `<b class="sb-c" data-c="${esc(c)}"${extra}>${esc(c)}</b>`;

// строка модели → html; edit — с номерами строк, аккордов и букв (для перетаскивания)
function modelLineHTML(l, li, edit) {
  if (l.head != null) return `<div class="sb-h">${esc(l.head)}</div>`;
  if (!l.text.trim() && !l.chords.length) return '<div class="sb-gap"></div>';
  const cs = l.chords.map((c, k) => ({ ...c, k })).sort((a, b) => a.at - b.at);
  if (!cs.length) return `<div class="sb-line"${edit ? ` data-l="${li}"` : ''}><span class="sb-seg"${edit ? ' data-o="0"' : ''}><b class="sb-c sb-empty"></b><span class="sb-t">${esc(l.text)}</span></span></div>`;
  const parts = [];
  if (cs[0].at > 0) parts.push({ at: 0, chord: null, text: l.text.slice(0, cs[0].at) });
  cs.forEach((c, i) => {
    const end = i + 1 < cs.length ? cs[i + 1].at : l.text.length;
    parts.push({ at: c.at, chord: c, text: l.text.slice(c.at, Math.max(c.at, end)) });
  });
  const segs = parts.map((p) => {
    const ch = p.chord ? chordTag(p.chord.c, edit ? ` data-l="${li}" data-k="${p.chord.k}" tabindex="0" role="button"` : '') : '<b class="sb-c sb-empty"></b>';
    return `<span class="sb-seg"${edit ? ` data-o="${p.at}"` : ''}>${ch}<span class="sb-t">${esc(p.text) || '&nbsp;'}</span></span>`;
  });
  return `<div class="sb-line${l.text.trim() ? '' : ' sb-only'}"${edit ? ` data-l="${li}"` : ''}>${segs.join('')}</div>`;
}

export function modelHTML(model, { edit = false } = {}) {
  return model.map((l, i) => modelLineHTML(l, i, edit)).join('');
}

export function lineHTML(line) {
  return modelLineHTML(parseLines(line)[0] || { text: '', chords: [] }, 0, false);
}

export function textHTML(text) {
  return modelHTML(parseLines(text));
}

export function hasChords(text) {
  const t = String(text || '');
  return [...t.matchAll(/\[([^\]]+)\]/g)].some((m) => bracketChord(m[1])) || t.split('\n').some(chordLine);
}

// все аккорды текста по порядку
export function chordsOf(text) {
  return parseLines(text).flatMap((l) => (l.chords || []).map((c) => c.c));
}

export function transposeText(text, semi, flats) {
  if (!semi) return text;
  const model = parseLines(text);
  for (const l of model) for (const c of l.chords || []) c.c = transposeChord(c.c.replace(/^H/, 'B'), semi, flats);
  return serialize(model);
}

// Вставили текст с аккордами с другого сайта: там песня бывает в другой тональности или с другим каподастром.
// Ищем сдвиг, при котором аккорды текста лучше всего совпадают с аккордами песни на сайте.
// Ответ: { shift, score, base } — score и base: доля совпавших аккордов со сдвигом и без.
export function fitKey(text, songChords) {
  const toks = chordsOf(text).map((c) => parseChord(c.replace(/^H/, 'B'))).filter((c) => c?.valid);
  if (!toks.length) return { shift: 0, score: 0, base: 0 };
  const song = songChords.map((n) => parseChord(n)).filter((c) => c?.valid);
  const minor = (c) => /^m(?!aj)/.test(c.suffix);
  const names = new Set(song.map((c) => `${c.root}|${c.suffix}`));
  const fams = new Set(song.map((c) => `${c.root}|${minor(c)}`));
  const roots = new Set(song.map((c) => c.root));
  const score = (s) => {
    let sum = 0;
    for (const c of toks) {
      const r = (((c.root + s) % 12) + 12) % 12;
      sum += names.has(`${r}|${c.suffix}`) ? 1 : fams.has(`${r}|${minor(c)}`) ? 0.8 : roots.has(r) ? 0.3 : 0;
    }
    return sum / toks.length;
  };
  const base = score(0);
  let best = 0;
  let bestScore = base;
  for (let s = 1; s < 12; s++) {
    const v = score(s);
    if (v > bestScore + 0.001) {
      bestScore = v;
      best = s;
    }
  }
  // сдвигаем, только если так заметно лучше и совпадает больше половины
  if (best && !(bestScore >= 0.55 && bestScore > base + 0.15)) best = 0;
  return { shift: best > 6 ? best - 12 : best, score: bestScore, base };
}

// ---------- расстановка аккордов песни над голым текстом ----------
// Части песни делятся на поющиеся (куплет, припев, бридж…) и инструментальные (вступление, проигрыш, соло, кода).
// Строфы текста (через пустую строку) получают часть: по подписи («Припев», «[Chorus]», «Куплет 2»), а без подписи —
// строфа, которая повторяется, считается припевом, остальные — куплетами. Число тактов на строку выбирается по тому,
// сколько тактов в части и сколько слогов в строках; аккорды встают над слогом, на который приходится их доля.
// Инструментальные части вставляются между строфами строкой аккордов. Ответ — текст «песенником».

const VOWELS = /[аеёиоуыэюяaeiouyäöüéèàáíóú]/i;
const LETTER = /[a-zа-яё]/i;
export function kindOf(name) {
  const n = String(name || '').toLowerCase();
  if (/вступ|проигр|соло|solo|intro|outro|кода|coda|оконч|финал|ending|instrument|interlude|рифф|riff|перебивк|break/.test(n)) return 'inst';
  if (/пред.?припев|pre.?chorus|распев/.test(n)) return 'pre';
  if (/припев|chorus|refrain|hook/.test(n)) return 'chorus';
  if (/бридж|bridge|middle|связк|переход/.test(n)) return 'bridge';
  if (/куплет|verse|запев/.test(n)) return 'verse';
  return 'other';
}

// слоги строки: позиция начала каждого слога (согласная перед гласной, если она в том же слове)
export function syllables(line) {
  const out = [];
  for (let i = 0; i < line.length; i++) {
    if (!VOWELS.test(line[i])) continue;
    const lat = /[a-z]/i.test(line[i]);
    // «ау», «ея» — два слога, а «ea», «ou» в английском — один
    if (lat && i > 0 && VOWELS.test(line[i - 1])) continue;
    // немая e на конце английского слова: name, come, there (но не the, me)
    if (lat && /e/i.test(line[i]) && !LETTER.test(line[i + 1] || '') && i >= 3 && !VOWELS.test(line[i - 1]) && LETTER.test(line[i - 2]) && LETTER.test(line[i - 3])) continue;
    let s = i;
    if (s > 0 && LETTER.test(line[s - 1]) && !VOWELS.test(line[s - 1])) s--;
    out.push({ at: s, vowel: i });
  }
  return out;
}

// короткие служебные слова, с которых строку обычно поют до сильной доли
const PICKUP = /^(the|a|an|to|oh|and|but|we'?ll|i'?m|i|in|on|of|so|there|then|when|if|my|your|it'?s|и|а|в|во|на|но|я|ты|он|не|по|за|из|у|к|с|со|о|мы|вы|да|ну|ах|ох|что|как|где)[,.!]?$/i;
const wordStarts = (line) => [...line.matchAll(/[^\s,.!?;:«»"()—–-]+/g)].map((m) => m.index);
const norm = (s) => s.toLowerCase().replace(/[^a-zа-яё]+/g, ' ').trim();

export function placeChords(text, sections, { bpm = 100, meter = '4/4' } = {}) {
  if (!sections?.length) return text;
  const beatsPerBar = meter === '6/8' ? 2 : Number(meter.split('/')[0]) || 4;
  const secs = sections.map((s, i) => ({
    i,
    name: s.name,
    repeat: s.repeat || 1,
    kind: kindOf(s.name),
    bars: s.bars.map((b) => {
      let pos = 0;
      const total = b.reduce((n, c) => n + (c.slots || 1), 0);
      return b.map((c) => {
        const o = { name: c.name ?? c, start: pos / total };
        pos += c.slots || 1;
        return o;
      });
    }),
  }));
  let vocal = secs.filter((s) => s.kind !== 'inst');
  if (!vocal.length) vocal = secs;
  const firstVocal = vocal[0].i;
  const lastVocal = vocal.at(-1).i;

  // строфы
  const raw = cleanPasted(text).split('\n');
  const stanzas = [];
  let cur = null;
  const flush = () => {
    if (cur && (cur.lines.length || cur.head)) stanzas.push(cur);
    cur = null;
  };
  for (const line of raw) {
    if (!line.trim()) {
      flush();
      continue;
    }
    if (isHeadLine(line)) {
      flush();
      cur = { head: headText(line), lines: [] };
      continue;
    }
    // «Припев: слова…» в одной строке
    const inl = /^\s*(припев|куплет|chorus|verse)\s*\d*\s*:\s*(\S.*)$/i.exec(line);
    if (inl) {
      flush();
      cur = { head: inl[1], lines: [inl[2]] };
      continue;
    }
    cur ??= { head: '', lines: [] };
    cur.lines.push(line.trim());
  }
  flush();
  // скопировали без пустых строк — режем по четыре строки
  if (stanzas.length === 1 && stanzas[0].lines.length > 8 && !stanzas[0].head) {
    const all = stanzas.pop().lines;
    for (let i = 0; i < all.length; i += 4) stanzas.push({ head: '', lines: all.slice(i, i + 4) });
  }

  // какая строфа — какой кусок песни
  const keyOf = (st) => norm(st.lines.join(' '));
  const count = new Map();
  for (const st of stanzas) if (st.lines.length) count.set(keyOf(st), (count.get(keyOf(st)) || 0) + 1);
  const firstLines = new Map();
  for (const st of stanzas) if (st.lines.length >= 2) firstLines.set(norm(st.lines.slice(0, 2).join(' ')), (firstLines.get(norm(st.lines.slice(0, 2).join(' '))) || 0) + 1);
  const hasKind = (k) => vocal.some((s) => s.kind === k);
  const byKind = (k, n) => {
    const list = vocal.filter((s) => s.kind === k);
    return list.length ? list[Math.min(n, list.length - 1)] : null;
  };
  const seen = new Map();
  const used = { verse: 0, chorus: 0, bridge: 0, pre: 0, other: 0 };
  let seq = 0;
  const plan = stanzas.map((st) => {
    // одна подпись без строк: «Вступление:» мы вставим сами, а «Припев:» значит «спеть припев ещё раз»
    if (!st.lines.length) return { st, sec: null, skip: kindOf(st.head) === 'inst' };
    let kind = st.head ? kindOf(st.head) : '';
    if (kind === 'other') kind = '';
    if (kind === 'inst') return { st, sec: secs.find((s) => s.kind === 'inst' && norm(s.name).startsWith(norm(st.head).split(' ')[0])) || null, inst: true };
    const k = keyOf(st);
    if (seen.has(k)) return { st, sec: seen.get(k) };
    if (!kind && (count.get(k) > 1 || firstLines.get(norm(st.lines.slice(0, 2).join(' '))) > 1)) kind = 'chorus';
    let sec = null;
    if (kind && hasKind(kind)) sec = byKind(kind, kind === 'chorus' ? 0 : used[kind]++);
    else if (!kind && hasKind('verse')) sec = byKind('verse', used.verse++);
    else if (kind === 'pre' || kind === 'bridge') sec = byKind('verse', 0);
    if (!sec) {
      // у песни части без подписей («Вся песня», «Часть 1»): по очереди
      const pool = vocal.filter((s) => !(kind !== 'chorus' && s.kind === 'chorus' && hasKind('verse')));
      sec = (pool.length ? pool : vocal)[seq++ % (pool.length || vocal.length)];
    }
    seen.set(k, sec);
    return { st, sec };
  });

  const out = [];
  const instLine = (s) => {
    out.push(`${s.name}${s.repeat > 1 ? ` ×${s.repeat}` : ''}:`);
    out.push(s.bars.map((b) => b.map((c) => c.name).join(' ')).join('   '));
    out.push('');
  };
  const insertedInst = new Set();
  const instBetween = (a, b) => secs.filter((s) => s.kind === 'inst' && s.i > a && s.i < b && s.i > firstVocal && s.i < lastVocal && !insertedInst.has(s.i));
  // вступление
  for (const s of secs) if (s.kind === 'inst' && s.i < firstVocal) {
    instLine(s);
    insertedInst.add(s.i);
  }
  let prev = -1;
  for (const { st, sec, inst, skip } of plan) {
    if (skip) continue;
    if (inst) {
      if (sec) {
        instLine(sec);
        insertedInst.add(sec.i);
      } else out.push(`${st.head}:`, '');
      continue;
    }
    if (!sec) {
      out.push(`${st.head}:`, '');
      continue;
    }
    if (prev >= 0) for (const s of instBetween(prev, sec.i > prev ? sec.i : lastVocal + 1)) {
      instLine(s);
      insertedInst.add(s.i);
    }
    prev = sec.i;
    out.push(`${st.head || sec.name}:`);
    const model = placeStanza(st.lines, sec, { bpm, beatsPerBar });
    out.push(serialize(model), '');
  }
  // кода, окончание
  for (const s of secs) if (s.kind === 'inst' && s.i > lastVocal && !insertedInst.has(s.i)) instLine(s);
  return trimLines(out.join('\n').replace(/\n{3,}/g, '\n\n'));
}

// одна строфа на одну часть песни
function placeStanza(lines, sec, { bpm, beatsPerBar }) {
  const B = sec.bars.length;
  const L = lines.length;
  const syl = lines.map((l) => syllables(l).length);
  const avg = syl.reduce((a, b) => a + b, 0) / Math.max(1, L);
  // сколько слогов обычно приходится на долю: в медленных песнях больше, в быстрых меньше
  const want = bpm >= 140 ? 1 : bpm >= 105 ? 1.4 : bpm >= 80 ? 1.8 : 2.2;
  let best = 1;
  let bestPen = Infinity;
  for (const bpl of [1, 2, 4, 8]) {
    // главное — чтобы строфа заняла часть целиком (или часть с повторами); слоги решают, только если вариантов несколько
    const covered = L * bpl;
    const total = B * sec.repeat;
    const struct = covered === B ? 0 : covered === total ? 0.3 : covered % B === 0 || B % covered === 0 ? 2 : 4;
    const dens = avg / (bpl * beatsPerBar);
    const pen = struct + Math.abs(Math.log2((dens || want) / want)) * 0.5;
    if (pen < bestPen - 1e-9) {
      bestPen = pen;
      best = bpl;
    }
  }
  let last = null;
  return lines.map((text, li) => {
    const chords = [];
    const sy = syllables(text);
    const words = wordStarts(text);
    const taken = new Set();
    for (let k = 0; k < best; k++) {
      const bar = sec.bars[(li * best + k) % B];
      for (const c of bar) {
        if (c.name === last && !(k === 0 && c.start === 0)) continue;
        last = c.name;
        const f = (k + c.start) / best;
        let at = 0;
        // строка с затакта («The…», «И…»): первый аккорд — на следующем слове
        if (f === 0) at = words[PICKUP.test(text.slice(words[0] ?? 0).split(/\s/)[0]) && words.length > 2 ? 1 : 0] ?? 0;
        else if (sy.length) {
          // слог, на который приходится доля аккорда, — и начало его слова (так читать проще всего)
          const s = sy[Math.min(sy.length - 1, Math.round(f * sy.length))];
          at = words.filter((x) => x <= s.at).at(-1) ?? 0;
          if (taken.has(at)) at = words.find((x) => x > at && !taken.has(x)) ?? (taken.has(s.at) ? text.length : s.at);
        } else if (text.length) at = Math.round(f * text.length);
        while (taken.has(at) && at < text.length) at++;
        taken.add(at);
        chords.push({ at, c: c.name });
      }
    }
    // если два аккорда встали на одну букву (строка короче), дальний уезжает в конец строки
    chords.sort((a, b) => a.at - b.at);
    return { text, chords };
  });
}
