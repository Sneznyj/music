// Разбор записанного голоса: высота по кадрам (YIN), ноты, точность в центах, диапазон и тип голоса,
// тембр (окраска, воздух, полётность), вибрато и громкость. Считается в браузере, запись никуда не уходит.
// На входе моно-сигнал и таймлайн минуса: какой аккорд и какая часть песни звучали в каждый момент записи.
import { yin } from '../w/tuner.js';
import * as T from './theory.js';

const HOP = 0.02; // шаг разбора — 20 мс
const MIN_NOTE = 6; // нота — от 6 кадров (120 мс)
const OK_CENTS = 30; // «чисто» — не дальше 30 центов от ноты

const mod12 = (n) => ((n % 12) + 12) % 12;
const tick = () => new Promise((res) => setTimeout(res));

// ориентиры классической школы; mid — где обычно лежит середина песни у такого голоса
export const VOICE_TYPES = [
  { id: 'bass', ru: 'бас', lo: 40, hi: 64, mid: 50 },
  { id: 'baritone', ru: 'баритон', lo: 45, hi: 69, mid: 54 },
  { id: 'tenor', ru: 'тенор', lo: 48, hi: 72, mid: 58 },
  { id: 'alto', ru: 'альт', lo: 53, hi: 77, mid: 62 },
  { id: 'mezzo', ru: 'меццо-сопрано', lo: 57, hi: 81, mid: 65 },
  { id: 'soprano', ru: 'сопрано', lo: 60, hi: 84, mid: 69 },
];

// ноты лада: мажор или минор (с повышенной VII ступенью — она частая гостья в песнях)
export function scaleOf(key) {
  const minor = key.endsWith('m');
  const root = T.pc(minor ? key.slice(0, -1) : key) ?? 0;
  const iv = minor ? [0, 2, 3, 5, 7, 8, 10, 11] : [0, 2, 4, 5, 7, 9, 11];
  return new Set(iv.map((i) => mod12(root + i)));
}

function median(a) {
  if (!a.length) return NaN;
  const s = Float64Array.from(a).sort();
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function std(a) {
  if (a.length < 2) return 0;
  let m = 0;
  for (const v of a) m += v;
  m /= a.length;
  let s = 0;
  for (const v of a) s += (v - m) ** 2;
  return Math.sqrt(s / a.length);
}

// перцентиль с весами (ноты весят по длительности)
function wpct(items, p) {
  const s = [...items].sort((a, b) => a.v - b.v);
  const total = s.reduce((x, it) => x + it.w, 0);
  let acc = 0;
  for (const it of s) {
    acc += it.w;
    if (acc >= total * p) return it.v;
  }
  return s.at(-1)?.v ?? NaN;
}

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

// timeline: [{ t, chord, sec }] по возрастанию t — время в секундах записи голоса
function chordFinder(timeline) {
  return (t) => {
    if (!timeline.length || t < timeline[0].t - 0.05 || t > timeline.at(-1).t + 2) return null;
    let lo = 0;
    let hi = timeline.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (timeline[mid].t <= t) lo = mid;
      else hi = mid - 1;
    }
    return timeline[lo];
  };
}

export async function analyzeVoice(x, sr, { key = 'C', timeline = [], onProgress } = {}) {
  const WIN = sr > 24000 ? 2048 : 1024;
  const hop = Math.round(HOP * sr);
  const n = Math.max(0, Math.floor((x.length - WIN) / hop) + 1);

  // ---------- уровень записи: перегруз и тишина ----------
  let peak = 0;
  let clipped = 0;
  const sample = new Float32Array(Math.ceil(x.length / 8));
  for (let i = 0, j = 0; i < x.length; i++) {
    const a = Math.abs(x[i]);
    if (a > peak) peak = a;
    if (a > 0.985) clipped++;
    if (!(i & 7)) sample[j++] = a;
  }
  sample.sort();
  const loud = sample[Math.floor(sample.length * 0.995)] || 0;
  const gain = Math.min(40, 0.8 / Math.max(loud, 1e-4));
  const level = { peak, clip: clipped / Math.max(1, x.length) > 0.0005, quiet: loud < 0.04 };

  // ---------- высота, непериодичность и громкость по кадрам ----------
  const midi = new Float32Array(n).fill(NaN);
  const ap = new Float32Array(n).fill(NaN);
  const db = new Float32Array(n).fill(-120);
  const buf = new Float32Array(WIN);
  const out = {};
  const NFFT = 1024;
  const re = new Float32Array(NFFT);
  const im = new Float32Array(NFFT);
  const hann = Float32Array.from({ length: NFFT }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (NFFT - 1)));
  const tilt = [];
  const ring = [];
  // при 48 кГц окно вдвое длиннее: для спектра берём каждый второй отсчёт, частота спектра — sr / 2
  const step = WIN / NFFT;
  const bin = (f) => Math.round((f * NFFT * step) / sr);
  for (let i = 0; i < n; i++) {
    const o = i * hop;
    let e = 0;
    for (let k = 0; k < WIN; k++) {
      const v = x[o + k] * gain;
      buf[k] = v;
      e += v * v;
    }
    const rms = Math.sqrt(e / WIN);
    db[i] = 20 * Math.log10(rms + 1e-9);
    if (rms > 0.01) {
      const f = yin(buf, sr, out);
      if (f && f > 70 && f < 1100) {
        midi[i] = 69 + 12 * Math.log2(f / 440);
        ap[i] = out.ap;
        // спектр каждого третьего звонкого кадра: окраска и «певческая форманта»
        if (i % 3 === 0) {
          for (let k = 0; k < NFFT; k++) {
            re[k] = buf[Math.floor(k * step)] * hann[k];
            im[k] = 0;
          }
          fft(re, im);
          const band = (a, b) => {
            let s = 0;
            for (let k = Math.max(1, bin(a)); k <= Math.min(NFFT / 2 - 1, bin(b)); k++) s += re[k] * re[k] + im[k] * im[k];
            return s + 1e-12;
          };
          const low = band(80, 1000);
          tilt.push(10 * Math.log10(band(1000, 5000) / low));
          ring.push(10 * Math.log10(band(2000, 4000) / (low + band(1000, 7000))));
        }
      }
    }
    if (i % 120 === 119) {
      onProgress?.(i / n);
      await tick();
    }
  }

  // ---------- чистка: одиночные скачки на октаву и короткие обрывки ----------
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(midi[i])) continue;
    const near = [];
    for (let k = Math.max(0, i - 6); k <= Math.min(n - 1, i + 6); k++) if (k !== i && !Number.isNaN(midi[k])) near.push(midi[k]);
    if (near.length < 4) continue;
    const m = median(near);
    if (Math.abs(midi[i] - m - 12) < 1.5) midi[i] -= 12;
    else if (Math.abs(midi[i] - m + 12) < 1.5) midi[i] += 12;
  }
  for (let i = 0; i < n; ) {
    if (Number.isNaN(midi[i])) {
      i++;
      continue;
    }
    let j = i;
    while (j < n && !Number.isNaN(midi[j])) j++;
    if (j - i < 3) for (let k = i; k < j; k++) midi[k] = NaN;
    i = j;
  }
  const pitch = Float32Array.from(midi);
  for (let i = 1; i < n - 1; i++) {
    if ([midi[i - 1], midi[i], midi[i + 1]].some(Number.isNaN)) continue;
    pitch[i] = median([midi[i - 1], midi[i], midi[i + 1]]);
  }

  const frameT = (i) => i * HOP + WIN / 2 / sr;
  let voiced = 0;
  for (let i = 0; i < n; i++) if (!Number.isNaN(pitch[i])) voiced++;
  const sung = voiced * HOP;
  const duration = x.length / sr;
  if (sung < 3) return { ok: false, sung, duration, level };

  // ---------- ноты ----------
  const scale = scaleOf(key);
  const chordAt = chordFinder(timeline);
  const notes = [];
  const noteOf = new Int32Array(n).fill(-1);
  let s = -1;
  const close = (e) => {
    if (s >= 0 && e - s >= MIN_NOTE) {
      const fr = Array.from(pitch.subarray(s, e));
      const cut = Math.floor(fr.length * 0.15);
      const core = fr.slice(cut, fr.length - cut);
      const p = median(core);
      const t = frameT(s);
      const dur = (e - s) * HOP;
      const near = Math.round(p);
      const dev = (p - near) * 100;
      const at = chordAt(t + dur / 2);
      const tones = at ? T.chordTones(at.chord) : [];
      const inKey = scale.has(mod12(near)) || tones.includes(mod12(near));
      const note = { t, dur, p, near, dev, inKey, inChord: tones.includes(mod12(near)), sec: at?.sec ?? null };
      note.ok = inKey && Math.abs(dev) <= OK_CENTS;
      // длинная нота: плавание (медленный уход) и вибрато (колебание 4–8 Гц)
      if (dur >= 0.6) {
        const w = 4;
        const smooth = fr.map((_, k) => {
          let a = 0;
          let c = 0;
          for (let q = Math.max(0, k - w); q <= Math.min(fr.length - 1, k + w); q++) {
            a += fr[q];
            c++;
          }
          return a / c;
        });
        const sc = smooth.slice(cut, fr.length - cut);
        const res = core.map((v, k) => (v - sc[k]) * 100);
        let zc = 0;
        for (let k = 1; k < res.length; k++) if (res[k - 1] < 0 !== res[k] < 0) zc++;
        const rate = zc / 2 / (res.length * HOP);
        const amp = Math.SQRT2 * std(res);
        note.wobble = std(sc) * 100;
        note.vib = rate >= 4 && rate <= 8.5 && amp >= 12 && amp <= 150 ? { rate, amp } : null;
      }
      notes.push(note);
      for (let k = s; k < e; k++) noteOf[k] = notes.length - 1;
    }
    s = -1;
  };
  for (let i = 0; i < n; i++) {
    const v = pitch[i];
    if (Number.isNaN(v)) {
      close(i);
      continue;
    }
    if (s >= 0) {
      let ref = 0;
      let c = 0;
      for (let k = Math.max(s, i - 5); k < i; k++) {
        ref += pitch[k];
        c++;
      }
      if (Math.abs(v - ref / c) > 0.75) close(i);
    }
    if (s < 0) s = i;
  }
  close(n);
  if (notes.length < 4) return { ok: false, sung, duration, level };

  // ---------- сводка ----------
  const W = (list, f) => list.reduce((a, nt) => a + (f(nt) ? nt.dur : 0), 0);
  const total = W(notes, () => true);
  const keyNotes = notes.filter((nt) => nt.inKey);
  const keyTotal = W(keyNotes, () => true) || 1;
  const accuracy = W(notes, (nt) => nt.ok) / total;
  const inKey = keyTotal / total;
  const inChord = W(notes, (nt) => nt.inChord) / total;
  const meanDev = keyNotes.reduce((a, nt) => a + Math.abs(nt.dev) * nt.dur, 0) / keyTotal;
  const bias = keyNotes.reduce((a, nt) => a + nt.dev * nt.dur, 0) / keyTotal;

  const items = notes.map((nt) => ({ v: nt.p, w: nt.dur }));
  // крайние ноты — по нотам от четверти секунды: короткие подъезды и срывы диапазоном не считаем
  const solid = notes.filter((nt) => nt.dur >= 0.25).map((nt) => nt.near);
  const range = { lo: solid.length ? Math.min(...solid) : Math.round(wpct(items, 0.05)), hi: solid.length ? Math.max(...solid) : Math.round(wpct(items, 0.95)), from: Math.round(wpct(items, 0.25)), to: Math.round(wpct(items, 0.75)), mid: wpct(items, 0.5) };
  const p10 = wpct(items, 0.1);
  const p90 = wpct(items, 0.9);
  const byMid = [...VOICE_TYPES].sort((a, b) => Math.abs(range.mid - a.mid) - Math.abs(range.mid - b.mid));
  const type = byMid.find((v) => p10 >= v.lo - 2 && p90 <= v.hi + 2) || byMid[0];

  const long = notes.filter((nt) => nt.wobble != null);
  const vibNotes = long.filter((nt) => nt.vib);
  const vibrato = long.length ? { share: vibNotes.length / long.length, rate: median(vibNotes.map((nt) => nt.vib.rate)), amp: median(vibNotes.map((nt) => nt.vib.amp)), long: long.length } : null;
  const wobble = long.length ? median(long.map((nt) => nt.wobble)) : null;

  const vdb = [];
  for (let i = 0; i < n; i++) if (!Number.isNaN(pitch[i])) vdb.push(db[i]);
  vdb.sort((a, b) => a - b);
  const dynamics = vdb[Math.floor(vdb.length * 0.9)] - vdb[Math.floor(vdb.length * 0.1)];

  const aps = [];
  for (let i = 0; i < n; i++) if (!Number.isNaN(pitch[i])) aps.push(ap[i]);
  const clamp = (v) => Math.max(0, Math.min(1, v));
  const timbre = {
    tilt: median(tilt),
    ring: median(ring),
    ap: median(aps),
    // 0…1 на шкалах: тёмный → светлый, плотный → с воздухом, мягкий → звонкий
    bright: clamp((median(tilt) + 26) / 18),
    air: clamp((median(aps) - 0.015) / 0.065),
    ringing: clamp((median(ring) + 28) / 14),
  };

  // по частям песни (куплет, припев…), если части были в таймлайне
  const sections = [];
  for (const nt of notes) {
    if (nt.sec == null) continue;
    let sec = sections.find((x) => x.name === nt.sec);
    if (!sec) sections.push((sec = { name: nt.sec, dur: 0, ok: 0, pitch: 0 }));
    sec.dur += nt.dur;
    sec.ok += nt.ok ? nt.dur : 0;
    sec.pitch += nt.p * nt.dur;
  }
  for (const sec of sections) {
    sec.accuracy = sec.ok / sec.dur;
    sec.pitch /= sec.dur;
  }

  return {
    ok: true,
    duration,
    sung,
    level,
    accuracy,
    inKey,
    inChord,
    meanDev,
    bias,
    range,
    type,
    vibrato,
    wobble,
    dynamics,
    timbre,
    sections: sections.filter((x) => x.dur >= 3),
    notes,
    // для графика: высота по кадрам и к какой ноте кадр относится
    track: { pitch, noteOf, hop: HOP, t0: WIN / 2 / sr },
    chordAt,
    scale,
  };
}
