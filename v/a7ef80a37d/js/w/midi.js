// MIDI-клавиатура (/midi/): подключение по Web MIDI, выбор звука (записи инструментов или свой сэмпл), второй звук
// слоем или слева от точки разделения, педаль, колёса, регуляторы с «обучением», пэды — барабаны, запись игры
// в .mid и в звук. Без клавиатуры играет экранная: мышью, пальцем или клавишами компьютера.
import { audio, dryOut } from '../audio.js';
import { icon } from '../lib/icons.js';
import { keyboardSVG, pianoLatin, pianoName } from '../lib/keyboard.js';
import { yin } from './tuner.js';
import { el, store } from './util.js';

// ---------- звуки: записи в static/audio (авторы — в CREDITS.txt), ноты — как их нарезал tools/midi_samples.py ----------
// rel — сколько звучит после отпускания клавиши (постоянная затухания, с), loop — звук держится, пока держат клавишу,
// fixed — инструмент не чувствует силу нажатия (орган, клавесин), att — мягкое начало (с), gm — программа General MIDI для .mid
const PIANO = 'A1 C2 Ds2 Fs2 A2 C3 Ds3 Fs3 A3 C4 Ds4 Fs4 A4 C5 Ds5 Fs5 A5 C6 Ds6 Fs6 A6 C7';
export const SOUNDS = [
  { id: 'piano', group: 'Клавишные', name: 'Рояль', sub: 'Yamaha C5', dir: 'piano', notes: PIANO, rel: 0.1, gm: 0 },
  { id: 'rhodes', group: 'Клавишные', name: 'Электропиано', sub: 'Rhodes 1977', dir: 'rhodes', notes: 'F1 B1 E2 A2 D3 G3 B3 D4 F4 B4 E5 A5 D6 G6 C7', rel: 0.09, gm: 4 },
  { id: 'organ', group: 'Клавишные', name: 'Орган', sub: 'трубы, тихий регистр', dir: 'organ', notes: 'C2 Ds2 Fs2 A2 C3 Ds3 Fs3 A3 C4 Ds4 Fs4 A4 C5 Ds5 Fs5 A5 C6 Ds6 Fs6 A6 C7', loop: true, fixed: true, att: 0.03, rel: 0.12, gm: 19 },
  { id: 'harpsichord', group: 'Клавишные', name: 'Клавесин', sub: 'английский', dir: 'harpsichord', notes: 'As1 C2 D2 E2 Fs2 Gs2 As2 C3 D3 E3 Fs3 Gs3 As3 C4 D4 E4 Fs4 Gs4 As4 C5 D5 E5 Fs5 Gs5 As5 C6 D6 E6', fixed: true, rel: 0.07, gm: 6 },
  { id: 'vibes', group: 'Ударные с нотами', name: 'Вибрафон', sub: 'мягкие палочки', dir: 'vibes', notes: 'F3 A3 C4 E4 G4 B4 D5 F5 A5 C6 E6', rel: 0.25, gm: 11 },
  { id: 'marimba', group: 'Ударные с нотами', name: 'Маримба', sub: 'деревянная', dir: 'marimba', notes: 'F2 C3 G3 B3 F4 C5 G5 B5 F6 C7', rel: 0.3, gm: 12 },
  { id: 'glock', group: 'Ударные с нотами', name: 'Колокольчики', sub: 'глокеншпиль', dir: 'glock', notes: 'G5 C6 G6 C7 G7 C8', rel: 0.7, gm: 9 },
  { id: 'kalimba', group: 'Ударные с нотами', name: 'Калимба', sub: 'Кения', dir: 'kalimba', notes: 'B3 Cs4 Ds4 Fs4 Gs4 B4 Cs5 Ds5 Fs5 A5 B5', rel: 0.6, gm: 108 },
  { id: 'harp', group: 'Струнные', name: 'Арфа', sub: 'концертная', dir: 'harp', notes: 'B1 D2 F2 A2 C3 E3 G3 B3 D4 F4 A4 C5 E5 G5 B5 D6 F6 A6 B6', rel: 0.9, gm: 46 },
  { id: 'steel', group: 'Струнные', name: 'Акустическая гитара', sub: 'стальные струны', dir: 'guitar-steel', notes: 'E2 G2 As2 Cs3 E3 G3 As3 Cs4 E4 G4 As4 Cs5 D5', rel: 0.12, gm: 25 },
  { id: 'nylon', group: 'Струнные', name: 'Классическая гитара', sub: 'нейлон', dir: 'guitar-nylon', notes: 'E2 Fs2 Gs2 A2 B2 Cs3 D3 E3 Fs3 G3 A3 B3 Cs4 Ds4 E4 Fs4 Gs4 A4 B4 Cs5 E5 Fs5 Gs5 A5', rel: 0.12, gm: 24 },
  { id: 'bass', group: 'Струнные', name: 'Бас-гитара', sub: 'электрический', dir: 'bass', notes: 'E1 G1 As1 Cs2 E2 G2 As2 Cs3 E3 G3 As3 Cs4', rel: 0.08, gm: 33 },
  { id: 'sax', group: 'Духовые', name: 'Саксофон', sub: 'тенор', dir: 'sax', notes: 'Gs2 As2 C3 D3 E3 Fs3 Gs3 As3 C4 D4 E4 Fs4 Gs4 As4 C5 D5 E5 Fs5 Gs5 As5 C6', loop: true, att: 0.035, rel: 0.12, gm: 66 },
  { id: 'kit', group: 'Барабаны', name: 'Барабаны', sub: 'по схеме General MIDI', kit: true },
  { id: 'custom', group: 'Свой звук', name: 'Свой сэмпл', sub: 'файл или микрофон', custom: true, rel: 0.15, gm: 0 },
];
const byId = Object.fromEntries(SOUNDS.map((s) => [s.id, s]));

// ударные: Virtuosity Drums (CC0) + хлопок VCSL, static/audio/kit. Нота General MIDI → [звук, скорость (высота тома)]
const GM_KIT = {
  35: ['kick', 1], 36: ['kick', 1], 37: ['stick', 1], 38: ['snare', 1], 39: ['clap', 1], 40: ['rim', 1], 41: ['tomlo', 0.8], 42: ['hh', 1],
  43: ['tomlo', 0.9], 44: ['hhpedal', 1], 45: ['tomlo', 1], 46: ['hhopen', 1], 47: ['tomhi', 0.92], 48: ['tomhi', 1], 49: ['crash', 1], 50: ['tomhi', 1.1],
  51: ['ride', 1], 52: ['crash', 0.88], 53: ['bell', 1], 54: ['tamb', 1], 55: ['crash', 1.25], 56: ['cowbell', 1], 57: ['crash', 1.06], 59: ['ride', 0.95],
  60: ['bongohi', 1], 61: ['bongolo', 1], 62: ['conga', 1.12], 63: ['conga', 1], 64: ['conga', 0.85], 69: ['shaker', 1.1], 70: ['shaker', 1], 75: ['claves', 1], 82: ['shaker', 0.95],
};
const KIT_GAIN = { kick: 0.95, snare: 0.75, stick: 0.5, clap: 0.6, rim: 0.7, tomlo: 0.75, tomhi: 0.72, hh: 0.36, hhpedal: 0.34, hhopen: 0.4, crash: 0.5, ride: 0.42, bell: 0.45, tamb: 0.4, cowbell: 0.4, bongohi: 0.5, bongolo: 0.5, conga: 0.55, claves: 0.45, shaker: 0.36 };
const KIT_RU = { kick: 'Бочка', snare: 'Малый барабан', stick: 'Удар по ободу', clap: 'Хлопок', rim: 'Римшот', tomlo: 'Низкий том', tomhi: 'Высокий том', hh: 'Хай-хэт закрытый', hhpedal: 'Хай-хэт педалью', hhopen: 'Хай-хэт открытый', crash: 'Тарелка крэш', ride: 'Тарелка райд', bell: 'Колокол райда', tamb: 'Бубен', cowbell: 'Ковбелл', bongohi: 'Бонго высокий', bongolo: 'Бонго низкий', conga: 'Конга', claves: 'Клавесы', shaker: 'Шейкер' };
const kitOf = (n) => GM_KIT[n] || GM_KIT[36 + ((((n - 36) % 24) + 24) % 24)] || GM_KIT[36];

const PC = { C: 0, Cs: 1, D: 2, Ds: 3, E: 4, F: 5, Fs: 6, G: 7, Gs: 8, A: 9, As: 10, B: 11 };
const midiOf = (n) => {
  const m = /^([A-G]s?)(\d)$/.exec(n);
  return 12 * (Number(m[2]) + 1) + PC[m[1]];
};

// ---------- настройки (помнятся в браузере) ----------
const DEF = {
  a: 'piano', b: 'organ', mode: 'one', split: 60, oct: 0, oct2: 0, tr: 0, vol: 80, vol2: 70, dvol: 80,
  curve: 'normal', rel: 50, bright: 100, reverb: 18, bend: 2, pads: true, input: 'all', ch: -1,
  // регуляторы MPK mini (программа MPC): K1–K6 = CC70–75
  cc: { vol: 70, bright: 71, reverb: 72, rel: 73, vol2: 74, dvol: 75 },
};
const cfg = { ...DEF, ...store.get('midi', {}) };
cfg.cc = { ...DEF.cc, ...(store.get('midi', {}).cc || {}) };
if (!byId[cfg.a]) cfg.a = DEF.a;
if (!byId[cfg.b]) cfg.b = DEF.b;
const save = () => store.set('midi', cfg);

const PARAMS = {
  vol: { label: 'Громкость', min: 0, max: 100, fmt: (v) => `${v} %` },
  vol2: { label: 'Второй звук', min: 0, max: 100, fmt: (v) => `${v} %` },
  dvol: { label: 'Барабаны', min: 0, max: 100, fmt: (v) => `${v} %` },
  bright: { label: 'Яркость', min: 0, max: 100, fmt: (v) => `${v} %` },
  reverb: { label: 'Зал', min: 0, max: 100, fmt: (v) => `${v} %` },
  rel: { label: 'Затухание', min: 0, max: 100, fmt: (v) => `×${relMul(v).toFixed(v < 30 ? 2 : 1).replace('.', ',')}` },
};
const relMul = (v) => 4 ** ((v - 50) / 50);
const volGain = (v) => 1.25 * (v / 100) ** 1.5;
const CURVES = { soft: ['Чутко', (v) => v ** 0.55], normal: ['Обычно', (v) => v], hard: ['Туго', (v) => v ** 1.7], fixed: ['Без силы', () => 0.8] };

// ---------- звуковой движок ----------
let ctx = null;
let busA, busB, busD, sum, tone, wet, recDest, lfo, lfoGain;
let bendCents = 0;
const voices = new Set();

function engine() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  ctx = audio();
  busA = ctx.createGain();
  busB = ctx.createGain();
  busD = ctx.createGain();
  sum = ctx.createGain();
  tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.Q.value = 0.6;
  const dry = ctx.createGain();
  const conv = ctx.createConvolver();
  conv.buffer = hallIR();
  wet = ctx.createGain();
  for (const b of [busA, busB, busD]) b.connect(tone);
  tone.connect(dry).connect(sum);
  tone.connect(conv).connect(wet).connect(sum);
  sum.connect(dryOut());
  // колесо модуляции — вибрато: общий LFO, глубина в центах
  lfo = ctx.createOscillator();
  lfo.frequency.value = 5.6;
  lfoGain = ctx.createGain();
  lfoGain.gain.value = 0;
  lfo.connect(lfoGain);
  lfo.start();
  applyMix();
  // записи нужных звуков — сразу, чтобы первая нота и первый удар по пэду не молчали
  loadSound(byId[cfg.a]);
  if (cfg.mode !== 'one') loadSound(byId[cfg.b]);
  if (cfg.pads) loadSound(byId.kit);
  return ctx;
}

// Зал ≈ 2,3 с: шум, который глохнет и темнеет к концу.
function hallIR() {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * 2.6);
  const ir = ctx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const k = 0.55 - 0.42 * (i / len);
      lp += (Math.random() * 2 - 1 - lp) * k;
      d[i] = i < sr * 0.018 ? 0 : lp * Math.exp((-6.2 * i) / len);
    }
  }
  return ir;
}

function applyMix() {
  if (!ctx) return;
  const t = ctx.currentTime;
  sum.gain.setTargetAtTime(volGain(cfg.vol), t, 0.03);
  busB.gain.setTargetAtTime(volGain(cfg.vol2) / volGain(80), t, 0.03);
  busD.gain.setTargetAtTime(volGain(cfg.dvol) / volGain(80), t, 0.03);
  tone.frequency.setTargetAtTime(cfg.bright >= 100 ? 20000 : 380 * 2 ** ((cfg.bright / 100) * 5.6), t, 0.03);
  wet.gain.setTargetAtTime((cfg.reverb / 100) * 0.65, t, 0.05);
}

// ---------- загрузка записей ----------
const fetched = new Map();
function fetchFiles(snd) {
  if (fetched.has(snd.id)) return fetched.get(snd.id);
  const names = snd.kit ? Object.keys(KIT_GAIN) : snd.notes.split(' ');
  const dir = snd.kit ? 'kit' : snd.dir;
  snd.prog = 0;
  let done = 0;
  const p = Promise.all(
    names.map((n) =>
      fetch(`/audio/${dir}/${n}.mp3`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(n))))
        .then((b) => {
          snd.prog = ++done / names.length;
          emit('load', snd);
          return [n, b];
        }),
    ),
  );
  fetched.set(snd.id, p);
  p.catch(() => fetched.delete(snd.id));
  return p;
}

function loadSound(snd) {
  if (snd.custom) return Promise.resolve(!!snd.list);
  if (snd.list) return Promise.resolve(true);
  if (snd.loading) return snd.loading;
  engine();
  snd.loading = (async () => {
    try {
      const files = await fetchFiles(snd);
      const bufs = await Promise.all(files.map(async ([n, b]) => [n, await ctx.decodeAudioData(b.slice(0))]));
      if (snd.kit) snd.kitBufs = Object.fromEntries(bufs);
      snd.list = snd.kit ? [] : bufs.map(([n, buf]) => prep(buf, midiOf(n), snd.loop)).sort((x, y) => x.midi - y.midi);
      emit('load', snd);
      return true;
    } catch {
      snd.loading = null;
      emit('load', snd);
      return false;
    }
  })();
  return snd.loading;
}

// Начало звука, уровень (по средней громкости первых 0,4 с — все ноты и инструменты звучат ровно) и петля для держащихся звуков.
function prep(buf, midi, loop) {
  const x = buf.getChannelData(0);
  const sr = buf.sampleRate;
  let peak = 0;
  for (let i = 0; i < Math.min(x.length, sr); i++) peak = Math.max(peak, Math.abs(x[i]));
  let i = 0;
  while (i < x.length && Math.abs(x[i]) < peak * 0.03) i++;
  let s = 0;
  let n = 0;
  for (let j = i; j < Math.min(x.length, i + sr * 0.4); j++, n++) s += x[j] * x[j];
  const rms = Math.sqrt(s / (n || 1)) || 1;
  const v = { midi, buf, onset: Math.max(0, i / sr - 0.002), norm: Math.min(0.11 / rms, 0.9 / (peak || 1)) };
  if (loop) Object.assign(v, makeLoop(buf, v.onset) || {});
  return v;
}

// Петля без щелчка: конец петли плавно переходит в то, что звучит перед её началом (запекается в буфер).
function makeLoop(buf, start) {
  const sr = buf.sampleRate;
  const X = Math.floor(0.25 * sr);
  const ls = Math.floor(Math.max(start + 0.7, buf.duration * 0.3) * sr);
  const le = buf.length - Math.floor(0.08 * sr);
  if (le - ls < X * 2 || ls < X) return null;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < X; i++) {
      const a = (i / X) * (Math.PI / 2);
      d[le - X + i] = d[le - X + i] * Math.cos(a) + d[ls - X + i] * Math.sin(a);
    }
  }
  return { ls: ls / sr, le: le / sr };
}

// ---------- ноты ----------
const curveOf = (vel) => CURVES[cfg.curve][1](Math.max(1, vel) / 127);

// Сыграть ноту звуком snd в шину bus. Возвращает голос — его отпускают release().
function voice(snd, midi, vel, when, bus) {
  const t = Math.max(when ?? ctx.currentTime, ctx.currentTime);
  if (!snd.list?.length) {
    loadSound(snd);
    return synth(midi, vel, t, bus);
  }
  let s = snd.list[0];
  for (const c of snd.list) if (Math.abs(c.midi - midi) < Math.abs(s.midi - midi)) s = c;
  const src = ctx.createBufferSource();
  src.buffer = s.buf;
  src.playbackRate.value = 2 ** ((midi - s.midi) / 12);
  src.detune.value = bendCents;
  lfoGain.connect(src.detune);
  const loop = snd.custom ? snd.loopOn && s.ls : snd.loop && s.ls;
  if (loop) {
    src.loop = true;
    src.loopStart = s.ls;
    src.loopEnd = s.le;
  }
  const v = snd.fixed ? 0.8 : curveOf(vel);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.5;
  lp.frequency.value = snd.fixed || snd.custom ? 20000 : 1600 + 15000 * v ** 1.6;
  const g = ctx.createGain();
  const level = (0.12 + 0.88 * v ** 1.4) * s.norm;
  const att = snd.att || 0.002;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(level, t + att);
  src.connect(lp).connect(g).connect(bus);
  src.start(t, s.onset);
  const vc = { src, g, snd, t };
  src.onended = () => {
    voices.delete(vc);
    try {
      lfoGain.disconnect(src.detune);
    } catch {
      /* уже отключён */
    }
  };
  voices.add(vc);
  limitVoices();
  return vc;
}

// Пока записи грузятся — простой звук, чтобы клавиша не молчала.
function synth(midi, vel, t, bus) {
  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.value = 440 * 2 ** ((midi - 69) / 12);
  o.detune.value = bendCents;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.16 * curveOf(vel), t + 0.01);
  g.gain.setTargetAtTime(0.05 * curveOf(vel), t + 0.02, 0.4);
  o.connect(g).connect(bus);
  o.start(t);
  const vc = { src: o, g, snd: { rel: 0.08 }, t };
  o.onended = () => voices.delete(vc);
  voices.add(vc);
  return vc;
}

function release(vc, when, fast = false) {
  if (!vc || vc.off) return;
  vc.off = true;
  const t = Math.max(when ?? ctx.currentTime, ctx.currentTime);
  const tc = fast ? 0.03 : vc.snd.rel * relMul(cfg.rel);
  const p = vc.g.gain;
  if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t);
  else {
    p.cancelScheduledValues(t);
    p.setValueAtTime(p.value, t);
  }
  p.setTargetAtTime(0, t, tc);
  try {
    vc.src.stop(t + tc * 7 + 0.05);
  } catch {
    /* уже остановлен */
  }
}

function limitVoices() {
  if (voices.size <= 72) return;
  let old = null;
  for (const v of voices) if (!old || v.t < old.t) old = v;
  release(old, null, true);
}

// Удар барабана по ноте General MIDI.
let openHat = null;
function hit(n, vel, when, bus = busD) {
  const kit = byId.kit;
  const t = Math.max(when ?? ctx.currentTime, ctx.currentTime);
  if (!kit.kitBufs) {
    loadSound(kit);
    return null;
  }
  const [name, rate] = kitOf(n);
  if ((name === 'hh' || name === 'hhpedal') && openHat && !openHat.off) release(openHat, t, true);
  const src = ctx.createBufferSource();
  src.buffer = kit.kitBufs[name];
  src.playbackRate.value = rate * (0.985 + Math.random() * 0.03);
  const v = curveOf(vel);
  const g = ctx.createGain();
  g.gain.value = KIT_GAIN[name] * (0.2 + 0.8 * v ** 1.3);
  src.connect(g).connect(bus);
  src.start(t);
  const vc = { src, g, snd: { rel: 0.05 }, t };
  src.onended = () => voices.delete(vc);
  voices.add(vc);
  if (name === 'hhopen') openHat = vc;
  return name;
}

function hushAll() {
  for (const v of [...voices]) release(v, null, true);
}

function setBend(cents) {
  bendCents = cents;
  if (!ctx) return;
  for (const v of voices) v.src.detune?.setTargetAtTime(cents, ctx.currentTime, 0.008);
}

// ---------- игра: клавиша → один или два звука ----------
const held = new Map(); // ключ клавиши (канал·нота) → { raw, parts: [{ L, p, vc }] }
const sustained = new Set(); // голоса, которые держит педаль
let pedal = false;
const listeners = new Map();
const on = (type, fn) => listeners.set(type, [...(listeners.get(type) || []), fn]);
function emit(type, data) {
  for (const fn of listeners.get(type) || []) fn(data);
}

// по какой клавише какие звуки звучат: [слой, звук, высота]
function route(raw, ch) {
  if (cfg.pads && ch === 9) return [['D', byId.kit, raw]];
  const A = byId[cfg.a];
  const B = byId[cfg.b];
  const pa = A.kit ? raw + 12 * cfg.oct : raw + 12 * cfg.oct + cfg.tr;
  const pb = B.kit ? raw + 12 * cfg.oct2 : raw + 12 * cfg.oct2 + cfg.tr;
  if (cfg.mode === 'layer') return [['A', A, pa], ['B', B, pb]];
  if (cfg.mode === 'split') return raw < cfg.split ? [['B', B, pb]] : [['A', A, pa]];
  return [['A', A, pa]];
}

const busOf = (L) => (L === 'A' ? busA : L === 'B' ? busB : busD);
const lastByPitch = new Map();

// Включить один звук слоя L (общая часть живой игры и прослушивания записи).
function startPart(L, snd, p, vel, when) {
  if (snd.kit) return { L, p, vc: null, kit: true, drum: hit(p, vel, when, busOf(L)) };
  if (p < 0 || p > 127) return null;
  const key = L + p;
  const prev = lastByPitch.get(key);
  if (prev && !prev.off) {
    sustained.delete(prev);
    release(prev, when, true);
  }
  const vc = voice(snd, p, vel, when, busOf(L));
  lastByPitch.set(key, vc);
  return { L, p, vc };
}

let learnSplit = null;
function noteOn(raw, vel, ch = 0, from = 'midi') {
  engine();
  if (learnSplit) {
    cfg.split = raw;
    save();
    const cb = learnSplit;
    learnSplit = null;
    cb(raw);
    return;
  }
  const k = ch * 128 + raw;
  if (held.has(k)) noteOff(raw, ch);
  const parts = route(raw, ch).map(([L, snd, p]) => startPart(L, snd, p, vel)).filter(Boolean);
  held.set(k, { raw, ch, parts });
  for (const pt of parts) recEvent({ on: true, L: pt.L, p: pt.p, v: vel });
  emit('keys', { raw, on: true, from, parts, vel });
}

function noteOff(raw, ch = 0) {
  const k = ch * 128 + raw;
  const h = held.get(k);
  if (!h) return;
  held.delete(k);
  for (const pt of h.parts) {
    recEvent({ on: false, L: pt.L, p: pt.p });
    if (!pt.vc) continue;
    if (pedal) sustained.add(pt.vc);
    else release(pt.vc);
  }
  emit('keys', { raw, on: false });
}

function setPedal(down) {
  if (down === pedal) return;
  pedal = down;
  recEvent({ ped: down });
  if (!down) {
    for (const v of sustained) release(v);
    sustained.clear();
  }
  emit('pedal', down);
}

function panic() {
  held.clear();
  sustained.clear();
  pedal = false;
  hushAll();
  emit('pedal', false);
  emit('keys', { all: true });
}

// ---------- регуляторы ----------
let learnCC = null;
function controlChange(cc, val) {
  if (learnCC && ![64, 1, 120, 121, 123].includes(cc)) {
    for (const p of Object.keys(cfg.cc)) if (cfg.cc[p] === cc) delete cfg.cc[p];
    cfg.cc[learnCC] = cc;
    save();
    const p = learnCC;
    learnCC = null;
    emit('learned', p);
    return;
  }
  if (cc === 64) return setPedal(val >= 64);
  if (cc === 1) {
    if (lfoGain) lfoGain.gain.setTargetAtTime((val / 127) * 38, ctx.currentTime, 0.02);
    return;
  }
  if (cc === 120 || cc === 123) return panic();
  let param = Object.keys(cfg.cc).find((p) => cfg.cc[p] === cc);
  if (!param && cc === 7) param = 'vol';
  if (!param && cc === 91) param = 'reverb';
  if (!param) return;
  cfg[param] = Math.round((val / 127) * PARAMS[param].max);
  applyMix();
  emit('param', param);
  clearTimeout(controlChange.t);
  controlChange.t = setTimeout(save, 400);
}

// ---------- Web MIDI ----------
let access = null;
const midiState = { status: 'idle', inputs: [] };

async function connect(silent = false) {
  if (!navigator.requestMIDIAccess) {
    midiState.status = 'unsupported';
    emit('midi');
    return;
  }
  try {
    access = await navigator.requestMIDIAccess({ sysex: false });
  } catch {
    if (!silent) midiState.status = 'denied';
    emit('midi');
    return;
  }
  access.onstatechange = (e) => {
    bindInputs();
    if (e.port.type === 'input') emit('port', e.port);
  };
  bindInputs();
}

function bindInputs() {
  midiState.inputs = [...access.inputs.values()].filter((i) => i.state !== 'disconnected');
  midiState.status = midiState.inputs.length ? 'ok' : 'none';
  for (const inp of access.inputs.values()) inp.onmidimessage = (e) => onMessage(e, inp);
  emit('midi');
}

function onMessage(e, port) {
  if (cfg.input !== 'all' && port.id !== cfg.input) return;
  const [st, d1 = 0, d2 = 0] = e.data;
  if (st >= 0xf0) return; // часы, SysEx, «я живой»
  const type = st & 0xf0;
  const ch = st & 0x0f;
  if (cfg.ch >= 0 && ch !== cfg.ch && !(cfg.pads && ch === 9)) return;
  if (type === 0x90 && d2) noteOn(d1, d2, ch);
  else if (type === 0x80 || type === 0x90) noteOff(d1, ch);
  else if (type === 0xb0) controlChange(d1, d2);
  else if (type === 0xe0) setBend(((((d2 << 7) | d1) - 8192) / 8192) * cfg.bend * 100);
  else if (type === 0xc0 && SOUNDS[d1]) emit('program', SOUNDS[d1].id);
  emit('msg', { type, ch, d1, d2, port });
}

// ---------- запись игры ----------
const rec = { on: false, t0: 0, ev: [], dur: 0, media: null, chunks: [], blob: null };
function recEvent(ev) {
  if (rec.on) rec.ev.push({ t: performance.now() - rec.t0, ...ev });
}

function recStart() {
  engine();
  rec.on = true;
  rec.ev = [];
  rec.blob = null;
  rec.t0 = performance.now();
  // уже нажатые клавиши — с начала записи
  for (const h of held.values()) for (const pt of h.parts) rec.ev.push({ t: 0, on: true, L: pt.L, p: pt.p, v: 96 });
  if (pedal) rec.ev.push({ t: 0, ped: true });
  if (window.MediaRecorder) {
    if (!recDest) {
      recDest = ctx.createMediaStreamDestination();
      sum.connect(recDest);
    }
    rec.chunks = [];
    try {
      rec.media = new MediaRecorder(recDest.stream);
      rec.media.ondataavailable = (e) => e.data.size && rec.chunks.push(e.data);
      rec.media.onstop = () => {
        rec.blob = new Blob(rec.chunks, { type: rec.media.mimeType || 'audio/webm' });
        emit('rec');
      };
      rec.media.start();
    } catch {
      rec.media = null;
    }
  }
  emit('rec');
}

function recStop() {
  if (!rec.on) return;
  rec.on = false;
  rec.dur = performance.now() - rec.t0;
  for (const h of held.values()) for (const pt of h.parts) rec.ev.push({ t: rec.dur, on: false, L: pt.L, p: pt.p });
  if (pedal) rec.ev.push({ t: rec.dur, ped: false });
  if (rec.media?.state === 'recording') setTimeout(() => rec.media.stop(), 600);
  emit('rec');
}

// Прослушать запись: события ставятся в звук заранее, на 0,2 с вперёд.
const pb = { on: false, timer: 0, i: 0, t0: 0, open: new Map(), ped: false, held: [] };
function playStart() {
  if (!rec.ev.length) return;
  engine();
  playStop();
  pb.on = true;
  pb.i = 0;
  pb.t0 = ctx.currentTime + 0.12;
  pb.open = new Map();
  pb.ped = false;
  pb.held = [];
  const tick = () => {
    const horizon = ctx.currentTime + 0.2;
    while (pb.i < rec.ev.length && pb.t0 + rec.ev[pb.i].t / 1000 < horizon) {
      const ev = rec.ev[pb.i++];
      const when = pb.t0 + ev.t / 1000;
      if ('ped' in ev) {
        pb.ped = ev.ped;
        if (!ev.ped) {
          for (const v of pb.held) release(v, when);
          pb.held = [];
        }
      } else if (ev.on) {
        const snd = ev.L === 'D' ? byId.kit : byId[ev.L === 'A' ? cfg.a : cfg.b];
        const pt = startPart(ev.L, snd, ev.p, ev.v, when);
        if (pt?.vc) pb.open.set(ev.L + ev.p, pt.vc);
        const ms = (when - ctx.currentTime) * 1000;
        setTimeout(() => pb.on && emit('pbkey', { L: ev.L, p: ev.p, on: true }), ms);
      } else {
        const vc = pb.open.get(ev.L + ev.p);
        pb.open.delete(ev.L + ev.p);
        if (vc) pb.ped ? pb.held.push(vc) : release(vc, when);
        const ms = (when - ctx.currentTime) * 1000;
        setTimeout(() => pb.on && emit('pbkey', { L: ev.L, p: ev.p, on: false }), ms);
      }
    }
    const end = pb.t0 + rec.dur / 1000;
    if (pb.i >= rec.ev.length && ctx.currentTime > end + 0.3) return playStop();
    pb.timer = setTimeout(tick, 40);
  };
  tick();
  emit('play');
}

function playStop() {
  if (!pb.on) return;
  pb.on = false;
  clearTimeout(pb.timer);
  for (const v of pb.open.values()) release(v);
  for (const v of pb.held) release(v);
  pb.open.clear();
  pb.held = [];
  emit('play');
  emit('pbkey', { all: true });
}

// Стандартный MIDI-файл (формат 0, 480 тиков на четверть, 120 уд/мин): первый звук — канал 1, второй — 2, барабаны — 10.
function toMidi(events) {
  const bytes = [];
  const vlq = (n) => {
    const out = [n & 0x7f];
    while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80);
    return out;
  };
  const chOf = (L) => (L === 'A' ? 0 : L === 'B' ? 1 : 9);
  const list = [];
  list.push([0, [0xff, 0x51, 0x03, 0x07, 0xa1, 0x20]]);
  list.push([0, [0xc0, byId[cfg.a].gm ?? 0]]);
  if (cfg.mode !== 'one') list.push([0, [0xc1, byId[cfg.b].gm ?? 0]]);
  const tick = (ms) => Math.round((ms * 480) / 500);
  for (const ev of events) {
    if ('ped' in ev) {
      list.push([tick(ev.t), [0xb0, 64, ev.ped ? 127 : 0]]);
      if (cfg.mode !== 'one') list.push([tick(ev.t), [0xb1, 64, ev.ped ? 127 : 0]]);
    } else {
      const L = ev.L === 'A' && byId[cfg.a].kit ? 'D' : ev.L === 'B' && byId[cfg.b].kit ? 'D' : ev.L;
      list.push([tick(ev.t), ev.on ? [0x90 | chOf(L), ev.p & 0x7f, Math.max(1, ev.v | 0)] : [0x80 | chOf(L), ev.p & 0x7f, 64]]);
    }
  }
  list.sort((a, b) => a[0] - b[0]);
  let last = 0;
  for (const [t, msg] of list) {
    bytes.push(...vlq(t - last), ...msg);
    last = t;
  }
  bytes.push(0, 0xff, 0x2f, 0);
  const len = bytes.length;
  const head = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0x01, 0xe0, 0x4d, 0x54, 0x72, 0x6b, (len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255];
  return new Blob([new Uint8Array([...head, ...bytes])], { type: 'audio/midi' });
}

function download(blob, name) {
  const a = el('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// ---------- свой сэмпл: файл или микрофон, хранится в браузере (IndexedDB) ----------
const DB = 'snezh-midi';
function idb(mode, fn) {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('s');
    r.onerror = () => rej(r.error);
    r.onsuccess = () => {
      const tx = r.result.transaction('s', mode);
      const q = fn(tx.objectStore('s'));
      tx.oncomplete = () => res(q?.result);
      tx.onerror = () => rej(tx.error);
    };
  });
}

async function setCustom(buf, name, root, loopOn, keep = true) {
  engine();
  const snd = byId.custom;
  const mono = ctx.createBuffer(1, buf.length, buf.sampleRate);
  const d = mono.getChannelData(0);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const x = buf.getChannelData(c);
    for (let i = 0; i < x.length; i++) d[i] += x[i] / buf.numberOfChannels;
  }
  const s = prep(mono, root ?? detectRoot(mono), true);
  snd.list = [s];
  snd.label = name;
  snd.loopOn = loopOn;
  snd.dur = mono.duration;
  if (keep) {
    try {
      await idb('readwrite', (st) => st.put({ name, root: s.midi, loopOn, sr: mono.sampleRate, data: d }, 'custom'));
    } catch {
      /* хранилище недоступно — сэмпл живёт до перезагрузки */
    }
  }
  emit('custom');
  emit('load', snd);
}

function detectRoot(buf) {
  const x = buf.getChannelData(0);
  const sr = buf.sampleRate;
  let peak = 0;
  let at = 0;
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > peak) ((peak = Math.abs(x[i])), (at = i));
  const from = Math.min(Math.max(0, at + Math.floor(sr * 0.06)), Math.max(0, x.length - 4096));
  const f = yin(x.subarray(from, from + 4096), sr, null, 40);
  return f ? Math.max(24, Math.min(108, Math.round(69 + 12 * Math.log2(f / 440)))) : 60;
}

async function restoreCustom() {
  try {
    const v = await idb('readonly', (st) => st.get('custom'));
    if (!v?.data) return;
    engine();
    const buf = ctx.createBuffer(1, v.data.length, v.sr);
    buf.copyToChannel(v.data, 0);
    await setCustom(buf, v.name, v.root, v.loopOn, false);
  } catch {
    /* нет сохранённого сэмпла */
  }
}

async function saveCustomMeta() {
  const snd = byId.custom;
  if (!snd.list) return;
  try {
    const v = await idb('readonly', (st) => st.get('custom'));
    if (v) await idb('readwrite', (st) => st.put({ ...v, root: snd.list[0].midi, loopOn: snd.loopOn }, 'custom'));
  } catch {
    /* не страшно */
  }
}

// ---------- названия ----------
const RU = ['до', 'до♯', 'ре', 'ми♭', 'ми', 'фа', 'фа♯', 'соль', 'соль♯', 'ля', 'си♭', 'си'];
const LAT = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
const INTERVALS = ['унисон', 'малая секунда', 'большая секунда', 'малая терция', 'большая терция', 'кварта', 'тритон', 'квинта', 'малая секста', 'большая секста', 'малая септима', 'большая септима'];
const CHORDS = [
  ['0 4 7', ''], ['0 3 7', 'm'], ['0 4 7 10', '7'], ['0 4 7 11', 'maj7'], ['0 3 7 10', 'm7'], ['0 3 6', 'dim'], ['0 3 6 9', 'dim7'],
  ['0 3 6 10', 'm7b5'], ['0 4 8', 'aug'], ['0 2 7', 'sus2'], ['0 5 7', 'sus4'], ['0 5 7 10', '7sus4'], ['0 4 7 9', '6'], ['0 3 7 9', 'm6'],
  ['0 2 4 7', 'add9'], ['0 2 3 7', 'madd9'], ['0 2 4 7 10', '9'], ['0 2 4 7 11', 'maj9'], ['0 2 3 7 10', 'm9'], ['0 3 7 11', 'mMaj7'],
  ['0 4 10', '7'], ['0 3 10', 'm7'], ['0 4 11', 'maj7'], ['0 7', '5'],
];
const CHORD_MAP = new Map(CHORDS.map(([iv, s]) => [iv, s]));

function describe(pitches) {
  const ps = [...new Set(pitches)].sort((a, b) => a - b);
  if (!ps.length) return null;
  const names = ps.map((p) => RU[p % 12]).join(' · ');
  if (ps.length === 1) return { big: pianoLatin(ps[0]), sub: `${RU[ps[0] % 12]} ${octRu(ps[0])}` };
  const pcs = [...new Set(ps.map((p) => p % 12))];
  const bass = ps[0] % 12;
  if (pcs.length === 1) return { big: pianoLatin(ps[0]), sub: `${names} — октава` };
  const roots = [bass, ...pcs.filter((p) => p !== bass)];
  for (const r of roots) {
    const key = pcs.map((p) => (p - r + 12) % 12).sort((a, b) => a - b).join(' ');
    if (CHORD_MAP.has(key)) return { big: LAT[r] + CHORD_MAP.get(key) + (r !== bass ? '/' + LAT[bass] : ''), sub: names };
  }
  if (ps.length === 2) return { big: INTERVALS[(ps[1] - ps[0]) % 12], sub: names, small: true };
  return { big: ps.map((p) => LAT[p % 12]).join(' '), sub: names, small: true };
}
const OCT_RU = ['субконтроктавы', 'контроктавы', 'большой октавы', 'малой октавы', 'первой октавы', 'второй октавы', 'третьей октавы', 'четвёртой октавы', 'пятой октавы'];
const octRu = (m) => OCT_RU[Math.floor(m / 12) - 1] || '';
const noteLabel = (m) => `${pianoLatin(m)} · ${pianoName(m)}`;

// ---------- страница ----------
export function init() {
  document.querySelectorAll('.mk').forEach(setup);
}

const KB_FROM = 36;
const KB_TO = 96;
// клавиши компьютера (по положению, раскладка не важна): нижний ряд — от C3, верхний — от C4
const PC_KEYS = {
  KeyZ: 0, KeyS: 1, KeyX: 2, KeyD: 3, KeyC: 4, KeyV: 5, KeyG: 6, KeyB: 7, KeyH: 8, KeyN: 9, KeyJ: 10, KeyM: 11, Comma: 12, KeyL: 13, Period: 14, Semicolon: 15, Slash: 16,
  KeyQ: 12, Digit2: 13, KeyW: 14, Digit3: 15, KeyE: 16, KeyR: 17, Digit5: 18, KeyT: 19, Digit6: 20, KeyY: 21, Digit7: 22, KeyU: 23, KeyI: 24, Digit9: 25, KeyO: 26, Digit0: 27, KeyP: 28, BracketLeft: 29, Equal: 30, BracketRight: 31,
};

function setup(root) {
  const I = (n) => icon(n);
  root.textContent = '';

  // --- подключение ---
  const led = el('i', { class: 'mk-led', 'aria-hidden': 'true' });
  const stTitle = el('b', {}, 'Клавиатура не подключена');
  const stText = el('span', { class: 'muted small' }, 'Подключите MIDI-клавиатуру кабелем USB и нажмите «Подключить».');
  const connBtn = el('button', { type: 'button', class: 'btn btn-play', html: `${I('usb')}<span>Подключить</span>` });
  const inputSel = el('select', { 'aria-label': 'Клавиатура' });
  const chanSel = el('select', { 'aria-label': 'MIDI-канал' }, el('option', { value: -1 }, 'Все каналы'), ...Array.from({ length: 16 }, (_, i) => el('option', { value: i }, `Канал ${i + 1}`)));
  chanSel.value = String(cfg.ch);
  const lastMsg = el('code', { class: 'mk-msg', 'aria-live': 'off' }, '—');
  const latency = el('span', { class: 'mk-lat muted small' });
  const connRow = el('div', { class: 'mk-conn-sel', hidden: true }, el('label', { class: 'ctl-select' }, el('span', { class: 'ctl-label' }, 'Вход'), inputSel), el('label', { class: 'ctl-select' }, el('span', { class: 'ctl-label' }, 'Канал'), chanSel), el('span', { class: 'mk-msg-w' }, el('span', { class: 'ctl-label' }, 'Сигнал'), lastMsg));
  const conn = el('section', { class: 'mk-conn panel' }, el('div', { class: 'mk-conn-top' }, led, el('div', { class: 'mk-st' }, stTitle, stText), connBtn), connRow, latency);

  // --- сцена: название, клавиатура, кнопки ---
  const big = el('div', { class: 'mk-big idle' }, '♪');
  const sub = el('div', { class: 'mk-sub muted' }, 'Нажмите клавишу — здесь будет нота или аккорд');
  const nowSnd = el('span', { class: 'mk-now' });
  const pedalBtn = el('button', { type: 'button', class: 'tg', 'aria-pressed': 'false', title: 'Педаль: держит звук, пока включена (на клавиатуре — педаль сустейна, CC64)' }, 'Педаль');
  const panicBtn = el('button', { type: 'button', class: 'tg', title: 'Заглушить все звуки' }, 'Тишина');
  const octOut = el('output', { class: 'mk-oct' });
  const octDown = el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Октавой ниже' }, '−');
  const octUp = el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Октавой выше' }, '+');
  const recBtn = el('button', { type: 'button', class: 'btn btn-small btn-ghost mk-rec-btn', html: `${I('circle-dot')}<span>Запись</span>` });
  const playBtn = el('button', { type: 'button', class: 'btn btn-small btn-ghost', disabled: true, html: `${I('play')}<span>Слушать</span>` });
  const midBtn = el('button', { type: 'button', class: 'btn btn-small btn-ghost', disabled: true, title: 'Ноты — для REAPER, FL Studio, MuseScore', html: `${I('download')}<span>.mid</span>` });
  const wavBtn = el('button', { type: 'button', class: 'btn btn-small btn-ghost', disabled: true, title: 'Звук записи', html: `${I('download')}<span>Звук</span>` });
  const recTime = el('span', { class: 'mk-rec-t muted small' });
  const kbBox = el('div', { class: 'mk-kb', html: keyboardSVG({ from: KB_FROM, to: KB_TO, labels: false }) });
  const svg = kbBox.querySelector('svg');
  svg.setAttribute('aria-label', 'Экранная клавиатура: играйте мышью или пальцем');
  const keyEl = new Map([...svg.querySelectorAll('[data-m]')].map((r) => [Number(r.dataset.m), r]));
  const kbHint = el('p', { class: 'mk-hint muted small' }, 'Без клавиатуры — мышью, пальцем (ниже по клавише — громче) или клавишами компьютера: Z S X D C V… — нижняя октава, Q 2 W 3 E R… — верхняя.');
  const sound = el('div', { class: 'mk-off', hidden: true }, el('span', {}, 'Браузер выключил звук до первого нажатия — нажмите в любом месте страницы.'));
  const stage = el(
    'section',
    { class: 'mk-stage panel' },
    el('div', { class: 'mk-disp' }, el('div', { class: 'mk-name' }, big, sub), nowSnd),
    el('div', { class: 'mk-bar' }, el('div', { class: 'mk-bar-g' }, el('span', { class: 'ctl-label' }, 'Октава'), octDown, octOut, octUp), el('div', { class: 'mk-bar-g' }, pedalBtn, panicBtn), el('div', { class: 'mk-bar-g mk-rec' }, recBtn, playBtn, midBtn, wavBtn, recTime)),
    sound,
    kbBox,
    kbHint,
  );

  // --- звуки ---
  const sndBtns = new Map();
  const groups = [...new Set(SOUNDS.map((s) => s.group))];
  const grid = el(
    'div',
    { class: 'mk-snds' },
    groups.map((g) =>
      el(
        'div',
        { class: 'mk-sg' },
        el('p', { class: 'mk-sg-h' }, g),
        SOUNDS.filter((s) => s.group === g).map((s) => {
          const b = el('button', { type: 'button', class: 'mk-snd', 'aria-pressed': 'false', 'data-id': s.id }, el('b', {}, s.name), el('span', { class: 'mk-snd-sub' }, s.sub), el('i', { class: 'mk-load' }));
          sndBtns.set(s.id, b);
          return b;
        }),
      ),
    ),
  );

  // свой сэмпл
  const fileIn = el('input', { type: 'file', accept: 'audio/*,.wav,.mp3,.ogg,.flac,.m4a', hidden: true });
  const fileBtn = el('button', { type: 'button', class: 'btn btn-small btn-ghost', html: `${I('upload')}<span>Загрузить файл</span>` });
  const micBtn = el('button', { type: 'button', class: 'btn btn-small btn-ghost', html: `${I('mic')}<span>Записать с микрофона</span>` });
  const rootSel = el('select', { 'aria-label': 'Основная нота сэмпла' }, Array.from({ length: 85 }, (_, i) => el('option', { value: 24 + i }, noteLabel(24 + i))));
  const loopTg = el('button', { type: 'button', class: 'tg', 'aria-pressed': 'false' }, 'Держать звук');
  const customInfo = el('p', { class: 'muted small' }, 'Загрузите короткий звук (нота, слово, хлопок) — он разойдётся по всей клавиатуре. Основную ноту сайт услышит сам.');
  const customBox = el('div', { class: 'mk-custom', hidden: true }, customInfo, el('div', { class: 'mk-row' }, fileBtn, micBtn, fileIn), el('div', { class: 'mk-row', hidden: true }, el('label', { class: 'ctl-select' }, el('span', { class: 'ctl-label' }, 'Звучит как'), rootSel), loopTg));
  const customOpts = customBox.lastElementChild;

  // второй звук
  const modeBtns = [['one', 'Один звук'], ['layer', 'Два слоем'], ['split', 'Разделить клавиатуру']].map(([m, label]) => el('button', { type: 'button', class: 'tg', 'data-mode': m, 'aria-pressed': String(cfg.mode === m) }, label));
  const bSel = el('select', { 'aria-label': 'Второй звук' }, SOUNDS.map((s) => el('option', { value: s.id }, s.name)));
  bSel.value = cfg.b;
  const splitOut = el('b', { class: 'mk-split-n' });
  const splitBtn = el('button', { type: 'button', class: 'btn btn-small btn-ghost' }, 'Указать клавишей');
  const oct2 = el('select', { 'aria-label': 'Октава второго звука' }, [-3, -2, -1, 0, 1, 2, 3].map((o) => el('option', { value: o }, o > 0 ? `+${o}` : String(o))));
  oct2.value = String(cfg.oct2);
  const layerOpts = el(
    'div',
    { class: 'mk-layer-o' },
    el('label', { class: 'ctl-select' }, el('span', { class: 'ctl-label' }, 'Второй звук'), bSel),
    el('label', { class: 'ctl-select' }, el('span', { class: 'ctl-label' }, 'Его октава'), oct2),
    el('span', { class: 'mk-split-w' }, el('span', { class: 'ctl-label' }, 'Левая рука — до'), splitOut, splitBtn),
  );
  const layerBox = el('div', { class: 'mk-layer' }, el('div', { class: 'tg-group' }, modeBtns), layerOpts);

  const sounds = el('section', { class: 'mk-sounds panel' }, el('h2', {}, 'Звук'), grid, customBox, el('h3', {}, 'Второй звук'), layerBox);

  // --- настройки ---
  const sliders = {};
  const mkSlider = (p) => {
    const P = PARAMS[p];
    const out = el('output', {}, P.fmt(cfg[p]));
    const input = el('input', { type: 'range', min: P.min, max: P.max, value: cfg[p], 'aria-label': P.label });
    input.addEventListener('input', () => {
      cfg[p] = Number(input.value);
      out.textContent = P.fmt(cfg[p]);
      engine();
      applyMix();
      save();
    });
    sliders[p] = { input, out };
    return el('label', { class: 'mk-sl' }, el('span', { class: 'ctl-label' }, P.label), input, out);
  };
  const curveSel = el('select', { 'aria-label': 'Чувствительность к силе нажатия' }, Object.entries(CURVES).map(([k, [label]]) => el('option', { value: k }, label)));
  curveSel.value = cfg.curve;
  const trSel = el('select', { 'aria-label': 'Транспонирование' }, Array.from({ length: 25 }, (_, i) => i - 12).map((t) => el('option', { value: t }, t > 0 ? `+${t}` : t ? String(t) : '0 — как есть')));
  trSel.value = String(cfg.tr);
  const bendSel = el('select', { 'aria-label': 'Колесо высоты' }, [1, 2, 5, 7, 12].map((b) => el('option', { value: b }, `± ${b} ${b === 1 ? 'полутон' : b < 5 ? 'полутона' : 'полутонов'}`)));
  bendSel.value = String(cfg.bend);
  const padsTg = el('button', { type: 'button', class: 'tg', 'aria-pressed': String(cfg.pads) }, 'Пэды — барабаны (10-й канал)');
  const resetBtn = el('button', { type: 'button', class: 'btn btn-small btn-ghost' }, 'Всё как было');
  const settings = el(
    'section',
    { class: 'mk-set panel' },
    el('h2', {}, 'Настройки'),
    el('div', { class: 'mk-sls' }, ['vol', 'bright', 'reverb', 'rel', 'vol2', 'dvol'].map(mkSlider)),
    el(
      'div',
      { class: 'mk-sels' },
      el('label', { class: 'ctl-select' }, el('span', { class: 'ctl-label' }, 'Сила нажатия'), curveSel),
      el('label', { class: 'ctl-select' }, el('span', { class: 'ctl-label' }, 'Транспонирование'), trSel),
      el('label', { class: 'ctl-select' }, el('span', { class: 'ctl-label' }, 'Колесо высоты'), bendSel),
    ),
    el('div', { class: 'mk-row' }, padsTg, resetBtn),
  );

  // --- регуляторы ---
  const ccRows = new Map();
  const ccList = el(
    'div',
    { class: 'mk-ccs' },
    Object.keys(PARAMS).map((p) => {
      const val = el('code', {});
      const btn = el('button', { type: 'button', class: 'tg' }, 'Назначить');
      btn.addEventListener('click', () => {
        engine();
        learnCC = learnCC === p ? null : p;
        drawCC();
      });
      ccRows.set(p, { val, btn });
      return el('div', { class: 'mk-cc' }, el('span', {}, PARAMS[p].label), val, btn);
    }),
  );
  const ccNote = el('p', { class: 'muted small' }, 'Нажмите «Назначить» и покрутите ручку на клавиатуре. Педаль (CC64), колесо модуляции (CC1 — вибрато) и колесо высоты работают сами. Сразу настроено под ручки K1–K6 Akai MPK mini.');
  const ccMpk = el('button', { type: 'button', class: 'btn btn-small btn-ghost' }, 'Как у MPK mini');
  const knobs = el('section', { class: 'mk-knobs panel' }, el('h2', {}, 'Ручки клавиатуры'), ccNote, ccList, el('div', { class: 'mk-row' }, ccMpk));

  root.append(conn, stage, el('div', { class: 'mk-cols' }, sounds, el('div', { class: 'mk-side' }, settings, knobs)));

  // ---------- поведение ----------
  const unlock = () => {
    engine();
    sound.hidden = ctx.state === 'running';
    if (ctx.state !== 'running') ctx.resume().then(() => (sound.hidden = true));
    showLatency();
  };
  addEventListener('pointerdown', unlock, { capture: true });
  addEventListener('keydown', unlock, { capture: true });

  function showLatency() {
    if (!ctx) return;
    const ms = Math.round(((ctx.baseLatency || 0) + (ctx.outputLatency || 0)) * 1000);
    if (!ms) return;
    latency.textContent = ms > 60 ? `Задержка звука ≈ ${ms} мс — заметно. Bluetooth-колонки и наушники добавляют задержку; по проводу звук будет сразу.` : `Задержка звука ≈ ${ms} мс`;
    latency.classList.toggle('mk-warn', ms > 60);
  }

  // подключение
  const drawMidi = () => {
    const { status, inputs } = midiState;
    connRow.hidden = !(status === 'ok' || status === 'none');
    inputSel.textContent = '';
    inputSel.append(el('option', { value: 'all' }, inputs.length > 1 ? 'Все клавиатуры' : inputs[0]?.name || 'Все клавиатуры'));
    for (const i of inputs) if (inputs.length > 1) inputSel.append(el('option', { value: i.id }, i.name || 'MIDI-устройство'));
    inputSel.value = inputs.some((i) => i.id === cfg.input) ? cfg.input : 'all';
    led.className = 'mk-led' + (status === 'ok' ? ' ok' : status === 'none' ? ' wait' : '');
    connBtn.hidden = status === 'ok' || status === 'none' || status === 'unsupported';
    if (status === 'ok') {
      stTitle.textContent = inputs.length > 1 ? `Подключено: ${inputs.length} устройства` : `Подключено: ${inputs[0].name || 'MIDI-клавиатура'}`;
      stText.textContent = 'Играйте — звук выбирается ниже. Подключите другую клавиатуру — сайт увидит её сам.';
    } else if (status === 'none') {
      stTitle.textContent = 'Клавиатура не найдена';
      stText.textContent = 'Доступ есть, но устройств нет. Подключите клавиатуру кабелем USB — она появится здесь сама.';
    } else if (status === 'denied') {
      stTitle.textContent = 'Доступ к MIDI не разрешён';
      stText.textContent = 'Разрешите «MIDI-устройства» для сайта: значок слева от адреса → Настройки сайта → MIDI → Разрешить. Потом нажмите «Подключить».';
    } else if (status === 'unsupported') {
      stTitle.textContent = 'Этот браузер не умеет работать с MIDI';
      stText.textContent = 'Откройте страницу в Chrome, Яндекс Браузере, Edge или Opera — на компьютере или Android. Safari и iPhone MIDI не поддерживают; играть можно на экранной клавиатуре.';
    }
  };
  on('midi', drawMidi);
  on('port', (p) => {
    lastMsg.textContent = p.state === 'connected' ? `+ ${p.name}` : `− ${p.name}`;
  });
  connBtn.addEventListener('click', () => {
    unlock();
    connect();
  });
  inputSel.addEventListener('change', () => {
    cfg.input = inputSel.value;
    save();
  });
  chanSel.addEventListener('change', () => {
    cfg.ch = Number(chanSel.value);
    save();
  });
  if (!navigator.requestMIDIAccess) {
    midiState.status = 'unsupported';
    drawMidi();
  } else {
    // доступ уже давали — подключаемся сами
    navigator.permissions
      ?.query({ name: 'midi' })
      .then((p) => p.state === 'granted' && connect(true))
      .catch(() => {});
  }

  let ledT = 0;
  on('msg', ({ type, ch, d1, d2 }) => {
    led.classList.add('hit');
    clearTimeout(ledT);
    ledT = setTimeout(() => led.classList.remove('hit'), 90);
    const c = `кан. ${ch + 1}`;
    lastMsg.textContent =
      type === 0x90 && d2 ? `${pianoLatin(d1)} (${d1}) · сила ${d2} · ${c}` : type === 0x80 || type === 0x90 ? `${pianoLatin(d1)} отпущена · ${c}` : type === 0xb0 ? (d1 === 64 ? `педаль ${d2 >= 64 ? 'нажата' : 'отпущена'}` : `ручка CC${d1} = ${d2} · ${c}`) : type === 0xe0 ? `колесо высоты ${(((d2 << 7) | d1) - 8192) > 0 ? '+' : ''}${Math.round(((((d2 << 7) | d1) - 8192) / 8192) * 100)} %` : type === 0xc0 ? `программа ${d1 + 1}` : `сообщение ${type.toString(16)}`;
    if (ctx && ctx.state !== 'running') sound.hidden = false;
  });

  // звуки
  const drawSounds = () => {
    for (const [id, b] of sndBtns) {
      const s = byId[id];
      b.setAttribute('aria-pressed', String(id === cfg.a));
      b.classList.toggle('mk-b', cfg.mode !== 'one' && id === cfg.b && id !== cfg.a);
      const loading = s.loading && !s.list;
      b.classList.toggle('loading', !!loading);
      b.querySelector('.mk-load').style.width = loading ? `${Math.round((s.prog || 0) * 100)}%` : '0';
    }
    customBox.hidden = cfg.a !== 'custom' && !(cfg.mode !== 'one' && cfg.b === 'custom');
    const A = byId[cfg.a];
    nowSnd.textContent = cfg.mode === 'one' ? A.name : cfg.mode === 'layer' ? `${A.name} + ${byId[cfg.b].name}` : `${byId[cfg.b].name} | ${A.name}`;
  };
  const pick = (id) => {
    cfg.a = id;
    save();
    engine();
    loadSound(byId[id]);
    drawSounds();
  };
  for (const [id, b] of sndBtns) b.addEventListener('click', () => pick(id));
  on('load', drawSounds);
  on('program', pick);

  // свой сэмпл
  const drawCustom = () => {
    const s = byId.custom;
    if (!s.list) return;
    customOpts.hidden = false;
    rootSel.value = String(s.list[0].midi);
    loopTg.setAttribute('aria-pressed', String(!!s.loopOn));
    customInfo.textContent = `Сэмпл: ${s.label} · ${s.dur.toFixed(1).replace('.', ',')} с · звучит как ${noteLabel(s.list[0].midi)}. Хранится только в этом браузере.`;
    sndBtns.get('custom').querySelector('.mk-snd-sub').textContent = s.label;
  };
  on('custom', drawCustom);
  fileBtn.addEventListener('click', () => fileIn.click());
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files[0];
    fileIn.value = '';
    if (!f) return;
    if (f.size > 30e6) return (customInfo.textContent = 'Файл больше 30 МБ — возьмите короткий звук, до полуминуты.');
    customInfo.textContent = 'Открываю файл…';
    try {
      engine();
      const buf = await ctx.decodeAudioData(await f.arrayBuffer());
      const max = Math.min(buf.length, buf.sampleRate * 20);
      const cut = ctx.createBuffer(buf.numberOfChannels, max, buf.sampleRate);
      for (let c = 0; c < buf.numberOfChannels; c++) cut.copyToChannel(buf.getChannelData(c).subarray(0, max), c);
      await setCustom(cut, f.name.replace(/\.[^.]+$/, '').slice(0, 40), null, false);
      if (cfg.a !== 'custom' && cfg.b !== 'custom') pick('custom');
    } catch {
      customInfo.textContent = 'Этот файл браузер открыть не смог. Подойдут WAV, MP3, OGG, FLAC или M4A.';
    }
  });
  let micRec = null;
  micBtn.addEventListener('click', async () => {
    if (micRec) return micRec.stop();
    try {
      engine();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const chunks = [];
      micRec = new MediaRecorder(stream);
      micRec.ondataavailable = (e) => chunks.push(e.data);
      micRec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        micRec = null;
        micBtn.innerHTML = `${I('mic')}<span>Записать с микрофона</span>`;
        try {
          const buf = await ctx.decodeAudioData(await new Blob(chunks).arrayBuffer());
          await setCustom(buf, 'Запись с микрофона', null, false);
          if (cfg.a !== 'custom' && cfg.b !== 'custom') pick('custom');
        } catch {
          customInfo.textContent = 'Запись не получилась — попробуйте ещё раз.';
        }
      };
      micRec.start();
      micBtn.innerHTML = `${I('square')}<span>Стоп</span>`;
      customInfo.textContent = 'Пишу… Спойте или сыграйте одну ноту (до 5 секунд).';
      setTimeout(() => micRec?.state === 'recording' && micRec.stop(), 5000);
    } catch {
      customInfo.textContent = 'Нет доступа к микрофону — разрешите его для сайта.';
    }
  });
  rootSel.addEventListener('change', () => {
    const s = byId.custom;
    if (!s.list) return;
    s.list[0].midi = Number(rootSel.value);
    drawCustom();
    saveCustomMeta();
  });
  loopTg.addEventListener('click', () => {
    const s = byId.custom;
    s.loopOn = !s.loopOn;
    drawCustom();
    saveCustomMeta();
  });

  // второй звук
  const drawLayer = () => {
    for (const b of modeBtns) b.setAttribute('aria-pressed', String(b.dataset.mode === cfg.mode));
    layerOpts.hidden = cfg.mode === 'one';
    layerOpts.querySelector('.mk-split-w').hidden = cfg.mode !== 'split';
    splitOut.textContent = noteLabel(cfg.split);
    for (const [m, r] of keyEl) r.classList.toggle('mk-left', cfg.mode === 'split' && m < cfg.split);
    drawSounds();
  };
  for (const b of modeBtns)
    b.addEventListener('click', () => {
      cfg.mode = b.dataset.mode;
      save();
      if (cfg.mode !== 'one') loadSound(byId[cfg.b]);
      drawLayer();
    });
  bSel.addEventListener('change', () => {
    cfg.b = bSel.value;
    save();
    loadSound(byId[cfg.b]);
    drawLayer();
  });
  oct2.addEventListener('change', () => {
    cfg.oct2 = Number(oct2.value);
    save();
  });
  splitBtn.addEventListener('click', () => {
    engine();
    if (learnSplit) {
      learnSplit = null;
      splitBtn.textContent = 'Указать клавишей';
      return;
    }
    splitBtn.textContent = 'Нажмите клавишу…';
    learnSplit = () => {
      splitBtn.textContent = 'Указать клавишей';
      drawLayer();
    };
  });

  // октава, педаль, тишина
  const drawOct = () => (octOut.textContent = cfg.oct > 0 ? `+${cfg.oct}` : String(cfg.oct));
  const shiftOct = (d) => {
    cfg.oct = Math.max(-3, Math.min(3, cfg.oct + d));
    save();
    drawOct();
  };
  octDown.addEventListener('click', () => shiftOct(-1));
  octUp.addEventListener('click', () => shiftOct(1));
  pedalBtn.addEventListener('click', () => {
    engine();
    setPedal(!pedal);
  });
  on('pedal', (d) => pedalBtn.setAttribute('aria-pressed', String(d)));
  panicBtn.addEventListener('click', panic);

  // настройки
  on('param', (p) => {
    const s = sliders[p];
    if (!s) return;
    s.input.value = cfg[p];
    s.out.textContent = PARAMS[p].fmt(cfg[p]);
  });
  curveSel.addEventListener('change', () => {
    cfg.curve = curveSel.value;
    save();
  });
  trSel.addEventListener('change', () => {
    cfg.tr = Number(trSel.value);
    save();
  });
  bendSel.addEventListener('change', () => {
    cfg.bend = Number(bendSel.value);
    save();
  });
  padsTg.addEventListener('click', () => {
    cfg.pads = !cfg.pads;
    padsTg.setAttribute('aria-pressed', String(cfg.pads));
    if (cfg.pads) loadSound(byId.kit);
    save();
  });
  resetBtn.addEventListener('click', () => {
    Object.assign(cfg, { ...DEF, a: cfg.a, b: cfg.b, input: cfg.input, cc: { ...DEF.cc } });
    save();
    for (const p of Object.keys(sliders)) emit('param', p);
    curveSel.value = cfg.curve;
    trSel.value = String(cfg.tr);
    bendSel.value = String(cfg.bend);
    chanSel.value = String(cfg.ch);
    oct2.value = String(cfg.oct2);
    padsTg.setAttribute('aria-pressed', String(cfg.pads));
    applyMix();
    drawOct();
    drawLayer();
    drawCC();
  });

  // регуляторы
  const drawCC = () => {
    for (const [p, { val, btn }] of ccRows) {
      val.textContent = cfg.cc[p] != null ? `CC${cfg.cc[p]}` : '—';
      btn.setAttribute('aria-pressed', String(learnCC === p));
      btn.textContent = learnCC === p ? 'Крутите ручку…' : 'Назначить';
    }
  };
  on('learned', drawCC);
  ccMpk.addEventListener('click', () => {
    cfg.cc = { ...DEF.cc };
    learnCC = null;
    save();
    drawCC();
  });

  // экранная клавиатура
  const lit = new Map(); // нота → сколько раз нажата (MIDI, мышь, запись)
  const light = (m, d) => {
    const n = Math.max(0, (lit.get(m) || 0) + d);
    lit.set(m, n);
    keyEl.get(m)?.classList.toggle('kb-on', n > 0);
  };
  const sounding = new Map(); // сырая нота → высоты, которые звучат (для названия)
  let drumName = '';
  const drawName = () => {
    const ps = [...sounding.values()].flat();
    const d = ps.length ? describe(ps) : null;
    if (drumName && !ps.length) {
      big.textContent = drumName;
      big.classList.add('small');
      return;
    }
    if (!d) return;
    big.classList.remove('idle');
    big.textContent = d.big;
    big.classList.toggle('small', !!d.small);
    sub.textContent = d.sub;
  };
  on('keys', (e) => {
    if (e.all) {
      for (const [m, r] of keyEl) r.classList.remove('kb-on');
      lit.clear();
      sounding.clear();
      return;
    }
    if (e.on) {
      light(e.raw, 1);
      const pit = e.parts.filter((p) => !p.kit).map((p) => p.p);
      const drum = e.parts.find((p) => p.drum)?.drum;
      if (drum) {
        big.classList.remove('idle');
        drumName = KIT_RU[drum];
        sub.textContent = `нота ${e.raw} · сила ${e.vel}`;
      }
      if (pit.length) {
        drumName = '';
        sounding.set(e.raw, pit);
      }
      drawName();
    } else {
      light(e.raw, -1);
      sounding.delete(e.raw);
    }
  });
  // запись хранит звучащие высоты — при прослушивании они подсвечиваются своим цветом
  const pbLit = new Map();
  on('pbkey', (e) => {
    if (e.all) {
      pbLit.clear();
      for (const r of keyEl.values()) r.classList.remove('kb-next');
      return;
    }
    if (e.L === 'D' || (e.L === 'A' ? byId[cfg.a] : byId[cfg.b]).kit) return;
    const n = Math.max(0, (pbLit.get(e.p) || 0) + (e.on ? 1 : -1));
    pbLit.set(e.p, n);
    keyEl.get(e.p)?.classList.toggle('kb-next', n > 0);
  });

  const touches = new Map();
  const keyAt = (x, y) => {
    const r = document.elementFromPoint(x, y)?.closest?.('[data-m]');
    return r && svg.contains(r) ? Number(r.dataset.m) : null;
  };
  const velAt = (m, y) => {
    const r = keyEl.get(m).getBoundingClientRect();
    return Math.round(45 + 82 * Math.max(0, Math.min(1, (y - r.top) / r.height)));
  };
  svg.addEventListener('pointerdown', (e) => {
    const m = keyAt(e.clientX, e.clientY);
    if (m == null) return;
    e.preventDefault();
    unlock();
    try {
      svg.setPointerCapture(e.pointerId);
    } catch {
      /* без захвата тоже работает */
    }
    touches.set(e.pointerId, m);
    noteOn(m, velAt(m, e.clientY), 15, 'screen');
  });
  svg.addEventListener('pointermove', (e) => {
    if (!touches.has(e.pointerId)) return;
    const m = keyAt(e.clientX, e.clientY);
    const was = touches.get(e.pointerId);
    if (m === was) return;
    if (was != null) noteOff(was, 15);
    if (m != null) noteOn(m, velAt(m, e.clientY), 15, 'screen');
    touches.set(e.pointerId, m);
  });
  const up = (e) => {
    if (!touches.has(e.pointerId)) return;
    const was = touches.get(e.pointerId);
    touches.delete(e.pointerId);
    if (was != null) noteOff(was, 15);
  };
  svg.addEventListener('pointerup', up);
  svg.addEventListener('pointercancel', up);
  svg.addEventListener('lostpointercapture', up);

  const typing = (t) => t.closest('input, textarea, select, [contenteditable]');
  addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
    const k = PC_KEYS[e.code];
    if (k == null) return;
    e.preventDefault();
    if (e.repeat) return;
    noteOn(48 + k, 96, 14, 'pc');
  });
  addEventListener('keyup', (e) => {
    const k = PC_KEYS[e.code];
    if (k != null) noteOff(48 + k, 14);
  });
  addEventListener('blur', () => {
    for (const k of Object.values(PC_KEYS)) noteOff(48 + k, 14);
  });

  // запись
  let recRaf = 0;
  const fmtT = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
  const drawRec = () => {
    recBtn.classList.toggle('on', rec.on);
    recBtn.innerHTML = rec.on ? `${I('square')}<span>Стоп</span>` : `${I('circle-dot')}<span>Запись</span>`;
    const notes = rec.ev.filter((e) => e.on).length;
    playBtn.disabled = rec.on || !notes;
    midBtn.disabled = rec.on || !notes;
    wavBtn.disabled = rec.on || !rec.blob;
    playBtn.innerHTML = pb.on ? `${I('square')}<span>Стоп</span>` : `${I('play')}<span>Слушать</span>`;
    cancelAnimationFrame(recRaf);
    if (rec.on) {
      const loop = () => {
        recTime.textContent = `● ${fmtT(performance.now() - rec.t0)}`;
        recRaf = requestAnimationFrame(loop);
      };
      loop();
    } else recTime.textContent = notes ? `${fmtT(rec.dur)} · ${notes} ${plural(notes, 'нота', 'ноты', 'нот')}` : '';
  };
  on('rec', drawRec);
  on('play', drawRec);
  recBtn.addEventListener('click', () => {
    playStop();
    rec.on ? recStop() : recStart();
  });
  playBtn.addEventListener('click', () => (pb.on ? playStop() : playStart()));
  midBtn.addEventListener('click', () => download(toMidi(rec.ev), `Моя игра ${new Date().toLocaleDateString('ru-RU')}.mid`));
  wavBtn.addEventListener('click', () => rec.blob && download(rec.blob, `Моя игра ${new Date().toLocaleDateString('ru-RU')}.${/mp4/.test(rec.blob.type) ? 'm4a' : /ogg/.test(rec.blob.type) ? 'ogg' : 'webm'}`));

  // начальный вид
  drawMidi();
  drawSounds();
  drawLayer();
  drawOct();
  drawCC();
  drawRec();
  // экранную клавиатуру — к первой октаве
  requestAnimationFrame(() => {
    const c4 = keyEl.get(60);
    if (c4 && kbBox.scrollWidth > kbBox.clientWidth) kbBox.scrollLeft = c4.getBoundingClientRect().left - kbBox.getBoundingClientRect().left - kbBox.clientWidth / 2 + 60;
  });
  // записи текущего звука — заранее, пока человек читает страницу
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 800));
  idle(() => {
    fetchFiles(byId[cfg.a]).catch(() => {});
    if (cfg.pads) fetchFiles(byId.kit).catch(() => {});
    if (cfg.mode !== 'one' && !byId[cfg.b].custom) fetchFiles(byId[cfg.b]).catch(() => {});
  });
  // свой сэмпл из прошлого раза
  idb('readonly', (st) => st.count())
    .then((n) => n && restoreCustom())
    .catch(() => {});
  // проверка на странице: window.__midi
  window.__midi = { noteOn, noteOff, controlChange, setPedal, cfg, byId, rec, toMidi, describe, voices, loadSound, panic, state: midiState, out: () => sum, onMessage };
}

const plural = (n, one, few, many) => (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many);
