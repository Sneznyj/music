// Звук струнных: записи настоящих инструментов (static/audio, авторы — в CREDITS.txt) —
// акустика со стальными струнами, классическая гитара (нейлон, ею же звучит укулеле) и бас.
// Пока записи не загрузились, звучит синтез: щипковая струна по методу Карплуса — Стронга.

let ctx = null;
let body = null;
let master = null;
let clickBus = null;
let sampleBus = null;
let limiter = null;
const bufs = new Map();
const ringing = new Map();
let volume = 0.75;

const SETS = {
  steel: { dir: 'guitar-steel', notes: 'E2 G2 As2 Cs3 E3 G3 As3 Cs4 E4 G4 As4 Cs5 D5' },
  nylon: { dir: 'guitar-nylon', notes: 'E2 Fs2 Gs2 A2 B2 Cs3 D3 E3 Fs3 G3 A3 B3 Cs4 Ds4 E4 Fs4 Gs4 A4 B4 Cs5 E5 Fs5 Gs5 A5' },
  bass: { dir: 'bass', notes: 'E1 G1 As1 Cs2 E2 G2 As2 Cs3 E3 G3 As3 Cs4' },
};
export const VOICES = { steel: 'Акустика', nylon: 'Классика' };
const PC = { C: 0, Cs: 1, D: 2, Ds: 3, E: 4, F: 5, Fs: 6, G: 7, Gs: 8, A: 9, As: 10, B: 11 };
const midiOf = (n) => {
  const m = /^([A-G]s?)(\d)$/.exec(n);
  return 12 * (Number(m[2]) + 1) + PC[m[1]];
};
const raw = {};
const sets = {};

let guitarVoice = 'steel';
try {
  guitarVoice = JSON.parse(localStorage.getItem('gitara.voice')) || 'steel';
} catch {
  /* нет хранилища */
}
export const voiceOf = () => guitarVoice;
export function setGuitarVoice(v, save = true) {
  guitarVoice = SETS[v] ? v : 'steel';
  try {
    if (save) localStorage.setItem('gitara.voice', JSON.stringify(guitarVoice));
  } catch {
    /* нет хранилища */
  }
  if (ctx) loadSet(guitarVoice);
  dispatchEvent(new CustomEvent('voice:change', { detail: guitarVoice }));
}

// Скачать файлы заранее (пока человек читает страницу); расшифровка — при первом звуке.
export function prefetch(name = guitarVoice) {
  const set = SETS[name];
  if (!set || raw[name]) return raw[name];
  raw[name] = Promise.all(
    set.notes.split(' ').map((n) =>
      fetch(`/audio/${set.dir}/${n}.mp3`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(n))))
        .then((b) => [midiOf(n), b]),
    ),
  );
  raw[name].catch(() => delete raw[name]);
  return raw[name];
}

export function loadSet(name) {
  if (!SETS[name]) return null;
  if (sets[name]) return sets[name].ready;
  const st = (sets[name] = { list: null });
  st.ready = (async () => {
    try {
      const files = await prefetch(name);
      st.list = (await Promise.all(files.map(async ([midi, b]) => ({ midi, buf: await ctx.decodeAudioData(b.slice(0)) })))).sort((a, b) => a.midi - b.midi);
      return true;
    } catch {
      delete sets[name];
      return false;
    }
  })();
  return st.ready;
}

// ---------- ударные: записи VCSL (CC0), static/audio/drums ----------
const DRUM_FILES = ['kick1', 'kick2', 'snare1', 'snare2', 'stick', 'hat1', 'hat2', 'hatopen', 'shake1', 'shake2'];
const DRUM_GAIN = { k: 0.5, s: 0.4, st: 0.34, h: 0.17, o: 0.16, sh: 0.2 };
let drumBufs = null;
let drumLoading = null;
let openHat = null;
let shakeTurn = 0;
export function loadDrums() {
  if (drumBufs || drumLoading) return drumLoading;
  audio();
  drumLoading = Promise.all(DRUM_FILES.map((n) => fetch(`/audio/drums/${n}.mp3`).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b)).then((buf) => [n, buf])))
    .then((list) => (drumBufs = Object.fromEntries(list)))
    .catch(() => (drumLoading = null));
  return drumLoading;
}

// Удар: k бочка, s малый, st обод, h хай-хэт, o открытый хай-хэт, sh шейкер; vel 0…1.
export function drum(name, when, vel = 0.8) {
  audio();
  if (!drumBufs) return loadDrums();
  const t = Math.max(when ?? ctx.currentTime, ctx.currentTime);
  const file = { k: vel > 0.85 ? 'kick2' : 'kick1', s: vel > 0.85 ? 'snare2' : 'snare1', st: 'stick', h: Math.random() < 0.5 ? 'hat1' : 'hat2', o: 'hatopen', sh: (shakeTurn++ % 2 ? 'shake2' : 'shake1') }[name];
  if (!file) return;
  // закрытый хай-хэт глушит открытый
  if ((name === 'h' || name === 'o') && openHat && openHat.end > t) openHat.g.gain.setTargetAtTime(0, t, 0.02);
  const src = ctx.createBufferSource();
  src.buffer = drumBufs[file];
  src.playbackRate.value = 0.98 + Math.random() * 0.04;
  const g = ctx.createGain();
  g.gain.value = DRUM_GAIN[name] * (0.55 + 0.45 * vel);
  src.connect(g).connect(sampleBus);
  src.start(t);
  if (name === 'o') openHat = { g, end: t + src.buffer.duration };
}

// Короткая «комната»: без неё запись звучит слишком сухо и близко.
function roomIR() {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * 1.4);
  const ir = ctx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      lp += (Math.random() * 2 - 1 - lp) * 0.35;
      d[i] = i < sr * 0.012 ? 0 : lp * Math.exp((-6.5 * i) / len);
    }
  }
  return ir;
}

export function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });
    master = ctx.createGain();
    master.gain.value = volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.004;
    comp.release.value = 0.25;
    const lo = peak(110, 1.1, 4.5);
    const mid = peak(240, 1.3, 2);
    const box = peak(520, 1.6, -2.5);
    const pres = peak(2900, 0.8, 2.5);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 8000;
    lp.Q.value = 0.4;
    // на выходе — мягкий срез пиков: до 0,7 звук не трогаем, выше плавно упираемся в 1 —
    // гитара, бас и барабаны вместе не хрипят (компрессор браузера сам добавляет громкости, он тут не годится)
    limiter = ctx.createWaveShaper();
    const curve = new Float32Array(4097);
    for (let i = 0; i < curve.length; i++) {
      const x = i / 2048 - 1;
      const a = Math.abs(x);
      curve[i] = Math.sign(x) * (a < 0.7 ? a : 0.7 + 0.3 * Math.tanh((a - 0.7) / 0.3));
    }
    limiter.curve = curve;
    lo.connect(mid).connect(box).connect(pres).connect(lp).connect(comp).connect(master).connect(limiter).connect(ctx.destination);
    body = lo;
    // записи: чуть приглушённый верх (мягче) и немного комнаты
    sampleBus = ctx.createGain();
    const shelf = ctx.createBiquadFilter();
    shelf.type = 'highshelf';
    shelf.frequency.value = 4200;
    shelf.gain.value = -3.5;
    const warm = peak(180, 0.9, 1.5);
    sampleBus.connect(warm).connect(shelf).connect(comp);
    const rev = ctx.createConvolver();
    rev.buffer = roomIR();
    const wet = ctx.createGain();
    wet.gain.value = 0.16;
    shelf.connect(rev).connect(wet).connect(comp);
    loadSet(guitarVoice);
    clickBus = ctx.createGain();
    clickBus.gain.value = 0.55;
    clickBus.connect(master);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function peak(f, q, g) {
  const b = ctx.createBiquadFilter();
  b.type = 'peaking';
  b.frequency.value = f;
  b.Q.value = q;
  b.gain.value = g;
  return b;
}

export function setVolume(v) {
  volume = v;
  if (master) master.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
}

export const now = () => audio().currentTime;

// Всё, что звучит на сайте, ещё и потоком: запись голоса берёт минус ровно таким, каким его слышно.
let outDest = null;
export function outStream() {
  audio();
  if (!outDest) {
    outDest = ctx.createMediaStreamDestination();
    limiter.connect(outDest);
  }
  return outDest.stream;
}

// Выход мимо «корпуса гитары» — для рояля.
export function dryOut() {
  audio();
  return master;
}

function freqOf(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

// Волна одной струны. bright: 0 мягко, 1 обычно, 2 ярко.
function pluck(midi, bright) {
  const key = midi * 4 + bright;
  if (bufs.has(key)) return bufs.get(key);
  const sr = ctx.sampleRate;
  const freq = freqOf(midi);
  const S = 0.5 - 0.06 * (bright - 1);
  // Петля задержки длиной N с фильтром (1−S, S) даёт период N − S отсчётов.
  const N = Math.max(4, Math.round(sr / freq + S));
  const t60 = 1.6 + 5 * Math.pow(82.4 / freq, 0.7);
  const dur = Math.min(6.5, t60 + 0.4);
  const len = Math.floor(sr * dur);
  const buf = ctx.createBuffer(1, len, sr);
  const out = buf.getChannelData(0);
  const ring = new Float32Array(N);
  const smooth = [0.3, 0.5, 0.78][bright];
  let lp = 0;
  for (let i = 0; i < N; i++) {
    lp += (Math.random() * 2 - 1 - lp) * smooth;
    ring[i] = lp;
  }
  // щипок ближе к подставке: гасит часть гармоник, как у настоящей струны
  const P = Math.max(1, Math.round(N * 0.13));
  const src = ring.slice();
  let mean = 0;
  for (let i = 0; i < N; i++) {
    ring[i] = src[i] - 0.8 * src[(i - P + N) % N];
    mean += ring[i];
  }
  mean /= N;
  let pk = 0;
  for (let i = 0; i < N; i++) {
    ring[i] -= mean;
    pk = Math.max(pk, Math.abs(ring[i]));
  }
  for (let i = 0; i < N; i++) ring[i] /= pk || 1;
  const g = Math.pow(10, -3 / (freq * t60));
  let idx = 0;
  for (let n = 0; n < len; n++) {
    const a = ring[idx];
    const nx = idx + 1 === N ? 0 : idx + 1;
    out[n] = a;
    ring[idx] = g * (a * (1 - S) + ring[nx] * S);
    idx = nx;
  }
  const fade = Math.floor(sr * 0.25);
  for (let n = 0; n < fade; n++) out[len - 1 - n] *= n / fade;
  const item = { buf, rate: (freq * (N - S)) / sr };
  bufs.set(key, item);
  return item;
}

// Сыграть ноту. string — индекс струны (0 = самая толстая), чтобы новая нота гасила старую на той же струне.
// voice: 'guitar' (акустика или классика — как выбрано), 'uke', 'bass'. legato — нота без щипка (h, p, s в табе).
export function note(midi, when, { string = null, vel = 0.8, bright = 1, dur = 0, voice = 'guitar', legato = false } = {}) {
  audio();
  const t = Math.max(when ?? ctx.currentTime, ctx.currentTime);
  const setName = voice === 'guitar' ? guitarVoice : voice === 'uke' ? 'nylon' : voice;
  const key = string == null ? null : `${voice}${string}`;
  const set = sets[setName];
  if (set?.list) return sampleNote(set.list, midi, t, { key, string, vel, bright, dur, legato });
  loadSet(setName);
  return ksNote(midi, t, { key, string, vel, bright, dur });
}

function sampleNote(list, midi, t, { key, string, vel, bright, dur, legato }) {
  let s = list[0];
  for (const c of list) if (Math.abs(c.midi - midi) < Math.abs(s.midi - midi)) s = c;
  const src = ctx.createBufferSource();
  src.buffer = s.buf;
  const rate = 2 ** ((midi - s.midi) / 12);
  src.playbackRate.value = rate;
  const v = Math.max(0.05, Math.min(1.2, vel));
  // тихо — темнее, сильно — ярче, как у живой струны
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.5;
  lp.frequency.value = (1400 + 9000 * Math.min(1, v) ** 1.5) * [0.7, 1, 1.25][bright];
  const g = ctx.createGain();
  const amp = 0.62 * v ** 1.15;
  if (legato) {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp, t + 0.012);
  } else g.gain.setValueAtTime(amp, t);
  let out = g;
  if (ctx.createStereoPanner && string != null) {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-0.3, Math.min(0.3, (string - 2.5) * 0.08));
    g.connect(p);
    out = p;
  }
  src.connect(lp).connect(g);
  out.connect(sampleBus);
  const offset = legato ? 0.04 : 0;
  src.start(t, offset);
  const end = t + (s.buf.duration - offset) / rate;
  const rec = { src, g, end };
  if (key != null) {
    const prev = ringing.get(key);
    if (prev && prev.end > t) damp(prev, t, legato ? 0.006 : 0.012);
    ringing.set(key, rec);
  }
  if (dur > 0) {
    g.gain.setTargetAtTime(0, t + dur, 0.06);
    src.stop(t + dur + 0.5);
  }
  return rec;
}

function ksNote(midi, t, { key, string, vel, bright, dur }) {
  const { buf, rate } = pluck(midi, bright);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.42 * vel, t);
  let out = g;
  if (ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = string == null ? 0 : (string - 2.5) * 0.1;
    g.connect(p);
    out = p;
  }
  src.connect(g);
  out.connect(body);
  src.start(t);
  const end = t + buf.duration / rate;
  if (key != null) {
    const prev = ringing.get(key);
    if (prev && prev.end > t) damp(prev, t);
    ringing.set(key, { src, g, end });
  }
  if (dur > 0) {
    g.gain.setTargetAtTime(0, t + dur, 0.05);
    src.stop(t + dur + 0.4);
  }
  return { src, g, end };
}

function damp(v, t, tc = 0.012) {
  try {
    v.g.gain.cancelScheduledValues(t);
    v.g.gain.setTargetAtTime(0, t, tc);
    v.src.stop(t + 0.2);
  } catch {
    /* источник уже остановлен */
  }
}

// Заглушить все струны (ладонью).
export function hush(when, tc = 0.015) {
  if (!ctx) return;
  const t = Math.max(when ?? ctx.currentTime, ctx.currentTime);
  for (const v of ringing.values()) if (v.end > t) damp(v, t, tc);
  ringing.clear();
}

let noiseBuf = null;
function noise() {
  if (noiseBuf) return noiseBuf;
  const len = Math.floor(ctx.sampleRate * 0.12);
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  return noiseBuf;
}

// Глухой щелчок: удар по заглушённым струнам.
export function chk(when, vel = 0.7) {
  audio();
  const t = Math.max(when ?? ctx.currentTime, ctx.currentTime);
  const src = ctx.createBufferSource();
  src.buffer = noise();
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1700;
  bp.Q.value = 0.9;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.9 * vel, t);
  g.gain.setTargetAtTime(0, t + 0.01, 0.025);
  src.connect(bp).connect(g).connect(sampleBus || body);
  src.start(t);
  src.stop(t + 0.15);
}

// Удар по струнам. notes — [{midi, string}] от 6-й к 1-й; dir: 'D' вниз, 'U' вверх.
export function strum(notes, when, dir = 'D', { vel = 0.8, spread = 0.012, voice = 'guitar' } = {}) {
  audio();
  const t0 = Math.max(when ?? ctx.currentTime, ctx.currentTime);
  let list = notes.slice().sort((a, b) => a.string - b.string);
  if (dir === 'U') list = list.filter((n) => n.string >= 2).reverse();
  const step = dir === 'U' ? spread * 0.75 : spread;
  list.forEach((n, i) => {
    const v = vel * (dir === 'U' ? 0.62 : 1) * (1 - i * 0.03) * (0.92 + Math.random() * 0.12);
    note(n.midi, t0 + i * step + Math.random() * 0.002, { string: n.string, vel: v, bright: dir === 'U' ? 2 : 1, voice });
  });
}

// Щелчок метронома.
export function click(when, accent = false, vel = 1) {
  audio();
  const t = Math.max(when ?? ctx.currentTime, ctx.currentTime);
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.value = accent ? 1760 : 1180;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime((accent ? 0.9 : 0.55) * vel, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
  o.connect(g).connect(clickBus);
  o.start(t);
  o.stop(t + 0.08);
}

// Последовательность событий с точным временем: звук планируется заранее,
// подсветка на экране догоняет его по часам звука.
export class Seq {
  constructor({ total, ticksPerBeat, bpm, onTick, onVisual, onEnd }) {
    this.total = total;
    this.ticksPerBeat = ticksPerBeat;
    this.bpm = bpm;
    this.onTick = onTick;
    this.onVisual = onVisual;
    this.onEnd = onEnd;
    this.loop = null;
    this.running = false;
  }

  tickDur() {
    return 60 / (this.bpm() * this.ticksPerBeat);
  }

  start(from = 0) {
    audio();
    this.stop(true);
    this.tick = from;
    this.next = ctx.currentTime + 0.1;
    this.queue = [];
    this.running = true;
    this.timer = setInterval(() => this.pump(), 20);
    this.pump();
    const frame = () => {
      if (!this.running && !this.queue.length) return;
      const t = ctx.currentTime;
      while (this.queue.length && this.queue[0].time <= t) {
        const e = this.queue.shift();
        if (e.end) {
          this.finish();
          return;
        }
        this.onVisual?.(e.tick, e.time);
      }
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  pump() {
    if (!this.running) return;
    const ahead = ctx.currentTime + 0.16;
    while (this.next < ahead) {
      const end = this.loop ? this.loop.end : this.total;
      if (this.tick >= end) {
        if (this.loop) this.tick = this.loop.start;
        else {
          this.queue.push({ end: true, time: this.next });
          this.running = false;
          clearInterval(this.timer);
          return;
        }
      }
      this.onTick(this.tick, this.next);
      this.queue.push({ tick: this.tick, time: this.next });
      this.next += this.tickDur();
      this.tick++;
    }
  }

  finish() {
    this.stop(true);
    this.onEnd?.();
  }

  stop(silent = false) {
    this.running = false;
    clearInterval(this.timer);
    cancelAnimationFrame(this.raf);
    this.queue = [];
    if (!silent) hush();
  }
}
