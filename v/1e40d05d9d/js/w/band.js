// Полная версия песни: гитара, укулеле, клавишные, бас и барабаны по аккордам песни — от начала до конца,
// со всеми повторами частей. Играет «Вся группа» в панели «Играть вместе» и ▶ на обложках песен без клипа.
// Состав — src/band.mjs: первая буква — ведущий инструмент (играет бой или перебор песни), остальные аккомпанируют.
import { Seq, audio, drum, hush, loadDrums, note, prefetch } from '../audio.js';
import { icon } from '../lib/icons.js';
import { drumHits, styleFor } from '../lib/drums.js';
import { voicingFor } from '../lib/instruments.js';
import { METERS, PATTERNS } from '../lib/patterns.js';
import { fullForm } from '../lib/songtime.js';
import { parseTab } from '../lib/tab.js';
import * as T from '../lib/theory.js';
import { loadPiano, pianoHush, pianoNote } from '../piano.js';
import { claim, playStepOn, playTabEvent, release, store } from './util.js';

const mod12 = (v) => ((v % 12) + 12) % 12;

// Партии из записи: часть с riff играется нотами таба, а не боем или перебором по аккордам.
// Такты партии идут по кругу вместе с тактами части; место ноты — в восьмых от начала такта (бывает дробным).
export function riffBars(data) {
  const M = METERS[data.meter];
  const out = {};
  for (const [id, r] of Object.entries(data.riffs || {})) {
    const tab = parseTab(r.tab, { grid: r.grid, meter: r.meter });
    out[id] = tab.bars.map((b) => tab.events.filter((e) => e.t >= b.start && e.t < b.start + b.len).map((ev) => ({ ev, at: ((ev.t - b.start) * M.slots) / tab.ticksPerBar })));
  }
  return out;
}
// ноты партии в этой восьмой такта; null — у части нет партии. bar — такт порядка игры ({ bi, r }):
// у части с повтором (×2) партия может идти на оба круга — второй круг берёт её такты дальше
export function riffSlot(riffs, sec, bar, pos) {
  const bars = sec?.riff && riffs[sec.riff];
  if (!bars?.length) return null;
  return bars[((bar.r || 0) * sec.bars.length + bar.bi) % bars.length].filter((x) => x.at >= pos && x.at < pos + 1);
}
// shift — сдвиг в полутонах: каподастр песни (лады партии считаются от него) и смена тональности
export function playRiff(list, pos, time, slotSec, { shift = 0, vel = 0.8 } = {}) {
  for (const x of list) playTabEvent(x.ev, time + (x.at - pos) * slotSec, x.at === 0 ? vel * 1.12 : vel, 'guitar', { shift, keep: true });
}
export const PART_NAMES = { g: 'Гитара', u: 'Укулеле', p: 'Клавишные', b: 'Бас', d: 'Барабаны' };
export const PART_ORDER = 'gupbd';

// Такты песни по порядку исполнения (части с повторами). chip — номер аккорда в листе «по частям», l и k — аккорд над словами
// (если порядок взят из текста). form — номера частей по порядку (fullForm — вся песня), без него — каждая часть по разу.
// Запись формы — номер части или [номер, сколько кругов] (src/forms.json: как в песне целиком).
// secStart — первый такт каждой части, marks — первые такты всех частей подряд.
export function timeline(data, form = data.sections.map((_, i) => i)) {
  const tl = [];
  const secStart = [];
  const marks = [];
  const firstChip = [];
  let chip = 0;
  data.sections.forEach((s, si) => {
    firstChip[si] = chip;
    s.bars.forEach((b) => (chip += b.length));
  });
  for (const f of form) {
    const si = Array.isArray(f) ? f[0] : f;
    const s = data.sections[si];
    const n = Array.isArray(f) ? f[1] : s.repeat || 1;
    secStart[si] ??= tl.length;
    marks.push(tl.length);
    for (let r = 0; r < n; r++) {
      let c = firstChip[si];
      s.bars.forEach((b, bi) => {
        let pos = 0;
        tl.push({
          si,
          bi,
          r,
          n,
          chords: b.map((ch) => {
            const o = { orig: ch.name, slots: ch.slots, start: pos, chip: c++, l: ch.l, k: ch.k };
            pos += ch.slots;
            return o;
          }),
        });
      });
    }
  }
  return { tl, secStart, marks };
}

// Какие инструменты звучат: выбор человека для этой песни или состав оригинала.
export const partsFor = (data) => store.get('band.' + data.slug, data.band || 'gbd');
export const saveParts = (data, parts) => store.set('band.' + data.slug, parts);

// Записи инструментов — заранее, чтобы первый такт уже звучал живьём.
export function preload(parts) {
  if (parts.includes('d')) loadDrums();
  if (parts.includes('p')) loadPiano();
  if (parts.includes('b')) prefetch('bass');
  if (parts.includes('u')) prefetch('nylon');
  if (parts.includes('g')) prefetch();
}

// key() → { tr, capo }: сдвиг тональности от оригинала и каподастр гитары (на странице песни их выбирает человек).
// pattern() → id рисунка песни. form — порядок частей (см. timeline), по умолчанию вся песня.
export function makeBand(data, { key = () => ({ tr: 0, capo: data.capo || 0 }), pattern = () => data.pattern, form = fullForm(data.sections, data) } = {}) {
  const M = METERS[data.meter];
  const { tl, secStart } = timeline(data, form);
  const altPos = data.meter === '6/8' ? 3 : M.slots / 2;
  const cache = new Map();
  const riffs = riffBars(data);

  // звучащий аккорд (у всех, кроме гитары с каподастром) и форма гитары при её каподастре
  const chordAt = (orig) => {
    const k = key();
    const id = `${orig}|${k.tr}|${k.capo}`;
    if (cache.has(id)) return cache.get(id);
    const soundShift = (data.capo || 0) + k.tr;
    const soundKey = T.transposeKey(data.key, k.tr);
    const sound = soundShift ? T.transposeChord(orig, soundShift, T.keyUsesFlats(soundKey)) : orig;
    const shapeShift = soundShift - k.capo;
    const shapeName = shapeShift ? T.transposeChord(orig, shapeShift, T.keyUsesFlats(T.transposeKey(soundKey, -k.capo))) : orig;
    let gv = !shapeShift && data.shapes?.[orig] ? T.voicingFromString(...data.shapes[orig].split(' ')) : T.voicings(shapeName)[0] || null;
    // каподастр: открытые струны звучат с его лада — двигаем всю форму
    if (gv && k.capo) gv = { ...gv, frets: gv.frets.map((f) => (f < 0 ? f : f + k.capo)) };
    const c = T.parseChord(sound);
    const out = {
      sound,
      shape: shapeName,
      g: gv,
      u: voicingFor('ukulele', sound),
      p: voicingFor('piano', sound),
      bass: c?.valid ? 28 + mod12((c.bassPc ?? c.root) - 4) : null,
      fifth: c?.valid && T.QUALITIES[c.quality]?.iv.includes(7),
    };
    cache.set(id, out);
    return out;
  };

  // одна восьмая (в 6/8 — шестая часть такта) всей группы
  function tick(t, time, parts, bpm) {
    const bi = Math.floor(t / M.slots);
    const bar = tl[bi];
    if (!bar) return;
    const pos = t % M.slots;
    const ch = bar.chords.find((c) => pos >= c.start && pos < c.start + c.slots);
    if (!ch) return;
    const p = PATTERNS[pattern()] || PATTERNS[data.pattern];
    const step = p.steps[pos % p.steps.length];
    const beat = pos % M.slotsPerBeat === 0;
    const startOfChord = pos === ch.start;
    const lead = parts[0];
    const a = chordAt(ch.orig);
    const half = 30 / bpm / M.slotsPerBeat;
    const slotSec = 60 / bpm / M.slotsPerBeat;
    // следующий аккорд — для шага N (бас следующего аккорда в переборе)
    const nx = ch.start + ch.slots < M.slots ? bar.chords[bar.chords.indexOf(ch) + 1] : tl[bi + 1]?.chords[0];
    const nextFor = (inst) => (nx ? { v: chordAt(nx.orig)[inst === 'guitar' ? 'g' : inst === 'ukulele' ? 'u' : 'p'], name: inst === 'guitar' ? chordAt(nx.orig).shape : chordAt(nx.orig).sound } : null);

    if (parts.includes('g')) {
      const vel = (pos === 0 ? 0.8 : 0.66) * (lead === 'g' ? 1 : 0.72);
      // ведущая гитара в части с партией из записи играет её (в своей тональности), остальное — по аккордам
      const rs = lead === 'g' ? riffSlot(riffs, data.sections[bar.si], bar, pos) : null;
      if (rs) playRiff(rs, pos, time, slotSec, { shift: (data.capo || 0) + key().tr, vel: 0.76 });
      else playStepOn('guitar', step, a.g, a.shape, time, { kind: p.kind, vel, beat, half, next: nextFor('guitar') });
    }
    if (parts.includes('u')) {
      if (lead === 'u') playStepOn('ukulele', step, a.u, a.sound, time, { kind: p.kind, vel: pos === 0 ? 0.8 : 0.68, beat, half, next: nextFor('ukulele') });
      else if (p.kind === 'strum' ? step !== '.' : beat) playStepOn('ukulele', p.kind === 'strum' ? step : 'D', a.u, a.sound, time, { kind: 'strum', vel: 0.5, beat });
    }
    if (parts.includes('p') && a.p) {
      if (lead === 'p') pianoLead(p, step, a, pos, beat, startOfChord, time, slotSec, half, nextFor('piano'));
      else if (startOfChord || (pos === altPos && ch.start < altPos && ch.slots > altPos)) {
        // аккомпанемент: аккорд держится, пока не сменится (в середине длинного аккорда — ещё раз, тише)
        const left = (ch.start + ch.slots - pos) * slotSec;
        const vel = startOfChord ? 0.42 : 0.3;
        a.p.rh.forEach((m, i) => pianoNote(m, time + i * 0.006, left + 0.15, vel));
        if (!parts.includes('b') && startOfChord) pianoNote(a.p.bass, time, left + 0.2, 0.5);
      }
    }
    if (parts.includes('b') && a.bass != null) {
      // бас: в песнях с боем — четвертями (тоника, на третьей доле квинта), в переборе — тоника и квинта
      let m = null;
      if (startOfChord) m = a.bass;
      else if (pos === altPos && ch.start < altPos) m = a.fifth ? a.bass + 7 : a.bass;
      else if (p.kind === 'strum' && beat) m = a.bass;
      if (m != null) note(m, time, { string: 0, voice: 'bass', vel: startOfChord || pos === 0 ? 0.95 : 0.78, bright: 0 });
    }
    if (parts.includes('d')) {
      const next = tl[bi + 1];
      const opts = { first: bar.bi === 0 && bar.r === 0 && bi > 0, last: !next || next.si !== bar.si };
      for (const h of drumHits(styleFor(p.kind), data.meter, pos, M.slots, opts)) drum(h, time, beat ? 0.9 : 0.62);
    }
  }

  // клавишные ведут: перебор — как у гитары; бой — бас и аккорд на сильную долю, на остальные доли — аккорд
  function pianoLead(p, step, a, pos, beat, startOfChord, time, slotSec, half, next) {
    if (p.kind === 'pick') return playStepOn('piano', step, a.p, a.sound, time, { kind: 'pick', vel: pos === 0 ? 0.8 : 0.66, beat, half, next });
    if (!beat && !startOfChord) return;
    const len = slotSec * (METERS[data.meter].slotsPerBeat || 2) * 0.95;
    if (startOfChord) pianoNote(a.p.bass, time, len * 4, 0.7);
    a.p.rh.forEach((m, i) => pianoNote(m, time + i * 0.005, len, pos === 0 ? 0.62 : 0.48));
  }

  return { M, tl, secStart, tick, chordAt, total: tl.length * M.slots };
}

export function silence() {
  hush();
  pianoHush();
}

// ---------- превью: ▶ на обложке играет оригинал (клип в углу), а у песни без клипа — полную версию сайта ----------
const PLAY = icon('play', { fill: true });
const PAUSE = icon('pause', { fill: true });
const players = new Map();

export function initPreviews() {
  document.addEventListener(
    'click',
    (e) => {
      const btn = e.target.closest('.cc-play');
      const card = btn?.closest('a.cover-card[href^="/songs/"]');
      if (!card) return;
      e.preventDefault();
      e.stopPropagation();
      const slug = card.getAttribute('href').split('/')[2];
      let p = players.get(slug);
      if (!p) {
        p = previewPlayer(slug, card);
        players.set(slug, p);
      }
      p.cards.add(card);
      p.toggle();
    },
    true,
  );
}

// ▶ на обложке: оригинал (клип в окне в углу, w/original.js); у песни без клипа — полная версия силами сайта
function previewPlayer(slug, card) {
  const cards = new Set([card]);
  let p = null;
  const paint = () =>
    cards.forEach((c) => {
      c.classList.toggle('cc-on', !!p?.playing);
      const b = c.querySelector('.cc-play');
      if (b) b.innerHTML = p?.playing ? PAUSE : PLAY;
    });
  let ready = null;
  const load = () =>
    (ready ??= fetch(`/data/play/${slug}.json`)
      .then((r) => r.json())
      .then(async (d) => {
        if (d.orig) {
          const { original } = await import('./original.js');
          p = original({ slug, title: d.title, artist: d.artist, ...d.orig });
          p.onChange(paint);
        } else {
          p = bandPreview(slug, cards, d);
        }
        return p;
      })
      .catch(() => null));
  return {
    cards,
    async toggle() {
      const pl = p || (await load());
      if (!pl) return;
      pl.playing ? pl.stop() : pl.resume();
      paint();
    },
  };
}

// полная версия силами сайта в нижнем плеере (песня без клипа)
function bandPreview(slug, cards, d) {
  let lastT = 0;
  const band = makeBand(d);
  const paint = () =>
    cards.forEach((c) => {
      c.classList.toggle('cc-on', api.playing);
      const b = c.querySelector('.cc-play');
      if (b) b.innerHTML = api.playing ? PAUSE : PLAY;
    });
  const seq = new Seq({
    total: band.total,
    ticksPerBeat: band.M.slotsPerBeat,
    bpm: () => d.bpm,
    onTick: (t, time) => band.tick(t, time, partsFor(d), d.bpm),
    onVisual: (t) => (lastT = t),
    onEnd: () => {
      api.playing = false;
      lastT = 0;
      paint();
      release(api);
    },
  });
  const jump = (dir) => {
    const bi = Math.floor(lastT / band.M.slots);
    let k = 0;
    band.secStart.forEach((b, i) => b <= bi && (k = i));
    k = Math.max(0, Math.min(band.secStart.length - 1, k + dir));
    lastT = band.secStart[k] * band.M.slots;
    if (api.playing) seq.start(lastT);
  };
  const api = {
    title: d.title,
    sub: `${d.artist} · полная версия`,
    slug,
    href: `/songs/${slug}/`,
    el: [...cards][0],
    playing: false,
    progress: () => lastT / band.total,
    duration: () => band.total * seq.tickDur(),
    seek(p) {
      lastT = Math.floor((p * band.total) / band.M.slots) * band.M.slots;
      if (api.playing) seq.start(lastT);
    },
    prev: () => jump(-1),
    next: () => jump(1),
    stop() {
      if (!api.playing) return;
      api.playing = false;
      seq.stop(true);
      silence();
      paint();
      release(api);
    },
    resume() {
      audio();
      api.playing = true;
      paint();
      preload(partsFor(d));
      claim(api);
      seq.start(lastT > 0 && lastT < band.total - 1 ? lastT : 0);
    },
  };
  return api;
}
