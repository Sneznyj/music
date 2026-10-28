// Партия фортепиано на две руки для тренажёра «падающие ноты» — из данных песни (/data/play/<слаг>.json).
// Время — в долях (как считает метроном песни), поэтому темп меняется без пересчёта.
//   Мелодия (народные и классика, data.melody): правая рука — мелодия, левая — бас и аккорд по подписям.
//   Рифф части (section.riff, у Shape of My Heart): ноты из таба — струны 1–4 правой рукой, 5–6 левой.
//   Перебор: те же ноты, что у гитары в рисунке песни, — бас левой рукой, верхние струны правой.
//   Бой: правая рука — аккорд на доли, левая — бас на смену аккорда и квинта в середине такта.
// Ответ: { notes: [{ t, d, m, h: 'R'|'L' }], bars: [{ t }], chords: [{ t, name }], sections: [{ t, name }], bpm, beatsPerBar, total }
import { pianoVoicing } from './instruments.js';
import { METERS, PATTERNS } from './patterns.js';
import { parseNotes } from './pnotes.js';
import { parseTab } from './tab.js';
import * as T from './theory.js';

const mod12 = (v) => ((v % 12) + 12) % 12;

export function pianoPart(data) {
  if (data.melody) return fromMelody(data);
  const M = METERS[data.meter] || METERS['4/4'];
  const slot = 1 / M.slotsPerBeat; // доля на один шаг рисунка
  const pat = PATTERNS[data.pattern] || PATTERNS.p8;
  const capo = data.capo || 0;
  const notes = [];
  const bars = [];
  const chords = [];
  const sections = [];
  const riffs = {};
  for (const [id, r] of Object.entries(data.riffs || {})) riffs[id] = parseTab(r.tab, { grid: r.grid, meter: r.meter });

  // такты по порядку исполнения
  const tl = [];
  data.sections.forEach((s) => {
    for (let r = 0; r < (s.repeat || 1); r++) s.bars.forEach((b, bi) => tl.push({ sec: s, bi, r, chords: b }));
  });

  const cache = new Map();
  const chordAt = (name) => {
    if (cache.has(name)) return cache.get(name);
    const sound = capo ? T.transposeChord(name, capo, T.keyUsesFlats(data.key)) : name;
    const g = data.shapes?.[name] ? T.voicingFromString(...data.shapes[name].split(' ')) : T.voicings(name)[0] || null;
    const o = { sound, g, p: pianoVoicing(sound), bs: g ? T.bassString(g, name) : -1 };
    cache.set(name, o);
    return o;
  };
  const gPitch = (a, s) => T.OPEN[s] + a.g.frets[s] + capo;
  // струна для номера в рисунке: сама струна или ближайшая звучащая тоньше (как в табе перебора)
  const gString = (a, n) => {
    let s = 6 - n;
    while (s < 6 && a.g.frets[s] < 0) s++;
    if (s >= 6) for (s = 6 - n - 1; s > a.bs && a.g.frets[s] < 0; s--);
    return s > a.bs && s < 6 && a.g.frets[s] >= 0 ? s : -1;
  };

  let t = 0;
  let lastSec = null;
  tl.forEach((bar, k) => {
    bars.push({ t });
    if (bar.sec !== lastSec) {
      sections.push({ t, name: bar.sec.name });
      lastSec = bar.sec;
    }
    const barLen = M.slots * slot;
    const riff = bar.sec.riff && riffs[bar.sec.riff];
    let pos = 0;
    const list = bar.chords.map((c) => {
      const o = { ...c, start: pos };
      pos += c.slots;
      return o;
    });
    for (const c of list) chords.push({ t: t + c.start * slot, name: chordAt(c.name).sound });
    if (riff) fromRiff(riff, bar.bi % riff.bars.length, t, barLen, capo, notes);
    else if (pat.kind === 'pick') {
      list.forEach((c, ci) => {
        const a = chordAt(c.name);
        if (!a.g) return;
        const end = t + (c.start + c.slots) * slot;
        const nextName = ci + 1 < list.length ? list[ci + 1].name : tl[k + 1]?.chords[0]?.name;
        for (let j = 0; j < c.slots; j++) {
          const p = c.start + j;
          const step = pat.steps[p % pat.steps.length];
          step.split(',').forEach((part, half) => {
            const at = t + (p + half / 2) * slot;
            for (const tok of part.split('+')) {
              if (!tok || tok === '.') continue;
              if (tok === 'N' || tok.startsWith('B')) {
                // N — бас следующего аккорда (в середине длинного аккорда — его же); B2 — второй бас на соседней струне
                const b = tok === 'N' ? chordAt(p + 1 < c.start + c.slots ? c.name : nextName || c.name) : a;
                if (!b.g || b.bs < 0) continue;
                let s = b.bs;
                if (tok === 'B2') for (s = b.bs + 1; s < 6 && b.g.frets[s] < 0; s++);
                if (s >= 6) continue;
                const until = tok === 'N' ? at + 2 * slot : end;
                notes.push({ t: at, d: Math.max(slot, Math.min(until - at, 4)), m: gPitch(b, s), h: 'L' });
              } else {
                const s = gString(a, Number(tok));
                if (s < 0) continue;
                notes.push({ t: at, d: Math.max(slot / 2, Math.min(end - at, 1.5)), m: gPitch(a, s), h: 'R' });
              }
            }
          });
        }
      });
    } else {
      // бой: аккорд правой рукой на доли (и на смену аккорда), бас левой
      const altPos = data.meter === '6/8' ? 3 : M.slots / 2;
      list.forEach((c) => {
        const a = chordAt(c.name);
        if (!a.p) return;
        const end = t + (c.start + c.slots) * slot;
        const hits = [];
        for (let j = 0; j < c.slots; j++) {
          const p = c.start + j;
          const step = pat.steps[p % pat.steps.length];
          if (j === 0 || (p % M.slotsPerBeat === 0 && step !== '.')) hits.push(t + p * slot);
        }
        hits.forEach((at, i) => {
          const until = hits[i + 1] ?? end;
          for (const m of a.p.rh) notes.push({ t: at, d: Math.max(slot, until - at - 0.04), m, h: 'R' });
        });
        // бас — от ми большой до ре-диез малой октавы (E2–D#3), в середине длинного аккорда — квинта
        const bass = 40 + mod12(a.p.bass - 40);
        const fifth = T.QUALITIES[T.parseChord(a.sound)?.quality]?.iv.includes(7);
        const mid = c.start < altPos && c.start + c.slots > altPos ? t + altPos * slot : null;
        notes.push({ t: t + c.start * slot, d: (mid ?? end) - (t + c.start * slot) - 0.04, m: bass, h: 'L' });
        if (mid != null) notes.push({ t: mid, d: end - mid - 0.04, m: bass + (fifth ? 7 : 0), h: 'L' });
      });
    }
    t += barLen;
  });
  notes.sort((a, b) => a.t - b.t || a.m - b.m);
  return { notes, bars, chords, sections, bpm: data.bpm, beatsPerBar: M.slots * slot, total: t, title: data.title, artist: data.artist };
}

// Такт риффа: шаг сетки = 1/grid доли. Нота звучит до следующей на той же струне (не дольше двух долей).
function fromRiff(riff, idx, t0, barLen, capo, out) {
  const b = riff.bars[idx];
  if (!b) return;
  const step = 1 / riff.grid;
  const evs = riff.events.filter((e) => e.t >= b.start && e.t < b.start + b.len);
  const lastOn = new Map();
  for (const e of evs) {
    e.notes.forEach((n, i) => {
      if (n.dead) return;
      const at = t0 + (e.t - b.start) * step + (e.roll ? i * 0.04 : 0);
      const prev = lastOn.get(n.s);
      if (prev) prev.d = Math.max(step / 2, Math.min(prev.d, at - prev.t));
      const note = { t: at, d: Math.min(2, t0 + barLen - at), m: T.OPEN[6 - n.s] + n.f + capo, h: n.s >= 5 ? 'L' : 'R' };
      out.push(note);
      lastOn.set(n.s, note);
    });
  }
}

// Мелодия из общественного достояния (src/courses.mjs → MELODIES): правая рука — мелодия, левая — бас и аккорд.
function fromMelody(data) {
  const mel = data.melody;
  const p = parseNotes(mel.notes, { grid: mel.grid, meter: mel.meter });
  const step = 1 / mel.grid;
  const beatsPerBar = mel.meter[0] * (4 / mel.meter[1]);
  const notes = [];
  const chords = [];
  for (const e of p.events) {
    const t = e.t * step;
    if (e.chord) chords.push({ t, name: e.chord });
    for (const m of e.notes || []) notes.push({ t, d: Math.max(step, e.d * step - 0.05), m, h: 'R' });
  }
  // левая рука: бас аккорда на его начало, аккорд держится до следующего
  chords.forEach((c, i) => {
    const v = pianoVoicing(c.name);
    if (!v) return;
    const end = chords[i + 1]?.t ?? p.total * step;
    notes.push({ t: c.t, d: end - c.t - 0.05, m: 48 + mod12(v.bass - 48), h: 'L' });
  });
  notes.sort((a, b) => a.t - b.t || a.m - b.m);
  const bars = p.bars.map((b) => ({ t: b.start * step }));
  return { notes, bars, chords, sections: [{ t: 0, name: mel.title }], bpm: mel.bpm, beatsPerBar, total: p.total * step, title: data.title, artist: data.artist };
}
