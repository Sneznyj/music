// Рояль: записи Salamander Grand Piano V3 (Yamaha C5, Alexander Holm, CC BY 3.0, static/audio/piano/CREDITS.txt).
// 22 ноты от A1 до C7 через малую терцию, промежуточные — сдвигом скорости не больше чем на полтора полутона.
// Пока записи грузятся, звучит простой синтез.
import { audio, dryOut } from './audio.js';

const SAMPLES = [];
for (let o = 1; o <= 7; o++) {
  const c = 12 * (o + 1);
  for (const [n, d] of [['C', 0], ['Ds', 3], ['Fs', 6], ['A', 9]]) {
    const m = c + d;
    if (m >= 33 && m <= 96) SAMPLES.push([`${n}${o}`, m]);
  }
}

let samples = [];
let loading = null;

export function loadPiano() {
  if (loading) return loading;
  loading = (async () => {
    try {
      const ctx = audio();
      samples = await Promise.all(
        SAMPLES.map(async ([name, midi]) => {
          const r = await fetch(`/audio/piano/${name}.mp3`);
          if (!r.ok) throw new Error(name);
          const buf = await ctx.decodeAudioData(await r.arrayBuffer());
          const x = buf.getChannelData(0);
          let peak = 0;
          for (let i = 0; i < Math.min(x.length, buf.sampleRate); i++) peak = Math.max(peak, Math.abs(x[i]));
          let i = 0;
          while (i < x.length && Math.abs(x[i]) < peak * 0.03) i++;
          return { midi, buf, onset: Math.max(0, i / buf.sampleRate - 0.002), norm: 1 / (peak || 1) };
        }),
      );
      return true;
    } catch {
      loading = null;
      return false;
    }
  })();
  return loading;
}

const held = new Map();

// Нажать клавишу: midi, время (с), длительность (с), сила 0…1.
export function pianoNote(midi, when, dur = 1.2, vel = 0.75) {
  const ctx = audio();
  const t = Math.max(when ?? ctx.currentTime, ctx.currentTime);
  if (!samples.length) {
    loadPiano();
    return synth(ctx, midi, t, dur, vel);
  }
  let s = samples[0];
  for (const c of samples) if (Math.abs(c.midi - midi) < Math.abs(s.midi - midi)) s = c;
  const prev = held.get(midi);
  if (prev && prev.end > t) prev.g.gain.setTargetAtTime(0, t, 0.03);
  const src = ctx.createBufferSource();
  src.buffer = s.buf;
  src.playbackRate.value = 2 ** ((midi - s.midi) / 12);
  const v = Math.max(0.05, Math.min(1, vel));
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.5;
  lp.frequency.value = 1800 + 14000 * v ** 1.6;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.5 * v ** 1.3 * s.norm, t);
  const end = t + Math.max(0.08, dur);
  g.gain.setTargetAtTime(0, end, 0.09);
  const pan = ctx.createStereoPanner();
  pan.pan.value = Math.max(-0.35, Math.min(0.35, (midi - 60) / 48));
  src.connect(lp).connect(g).connect(pan).connect(dryOut());
  src.start(t, s.onset);
  src.stop(end + 0.7);
  held.set(midi, { g, end });
}

function synth(ctx, midi, t, dur, vel) {
  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.value = 440 * 2 ** ((midi - 69) / 12);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.2 * vel, t + 0.01);
  g.gain.setTargetAtTime(0, t + 0.02, Math.min(0.6, dur / 2));
  o.connect(g).connect(dryOut());
  o.start(t);
  o.stop(t + dur + 1);
}

// Отпустить все клавиши (стоп).
export function pianoHush(when) {
  const ctx = audio();
  const t = Math.max(when ?? ctx.currentTime, ctx.currentTime);
  for (const h of held.values()) if (h.end > t) h.g.gain.setTargetAtTime(0, t, 0.05);
  held.clear();
}
