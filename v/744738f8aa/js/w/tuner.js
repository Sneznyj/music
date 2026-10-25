// Тюнер: высота звука с микрофона (алгоритм YIN) и эталонные струны.
import { audio, note } from '../audio.js';
import { NOTE_RU, OPEN, noteName } from '../lib/theory.js';

export function init() {
  document.querySelectorAll('.tuner').forEach(setup);
}

const STRINGS = OPEN.map((m, i) => ({ midi: m, i, f: 440 * 2 ** ((m - 69) / 12) }));

function yin(buf, sr) {
  const half = Math.floor(buf.length / 2);
  let rms = 0;
  for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / buf.length);
  if (rms < 0.008) return null;
  const minTau = Math.floor(sr / 1100);
  const maxTau = Math.min(half - 1, Math.floor(sr / 60));
  const d = new Float32Array(maxTau + 1);
  for (let tau = 1; tau <= maxTau; tau++) {
    let s = 0;
    for (let i = 0; i < half; i++) {
      const x = buf[i] - buf[i + tau];
      s += x * x;
    }
    d[tau] = s;
  }
  let run = 0;
  d[0] = 1;
  for (let tau = 1; tau <= maxTau; tau++) {
    run += d[tau];
    d[tau] = run ? (d[tau] * tau) / run : 1;
  }
  let tau = -1;
  for (let t = minTau; t <= maxTau; t++) {
    if (d[t] < 0.12) {
      while (t + 1 <= maxTau && d[t + 1] < d[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) return null;
  const a = d[tau - 1] ?? d[tau];
  const b = d[tau];
  const c = d[tau + 1] ?? d[tau];
  const shift = (a - c) / (2 * (a - 2 * b + c) || 1);
  return sr / (tau + (Number.isFinite(shift) ? shift : 0));
}

function setup(root) {
  const noteEl = root.querySelector('.tn-note');
  const needle = root.querySelector('.tn-needle');
  const cents = root.querySelector('.tn-cents');
  const mic = root.querySelector('.tn-mic');
  const strBtns = [...root.querySelectorAll('.tn-str')];
  let stream = null;
  let raf = 0;
  let hist = [];
  let ref = null;

  async function on() {
    const ctx = audio();
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch {
      cents.textContent = 'Нет доступа к микрофону. Разрешите его в адресной строке браузера — или настройтесь по эталонным струнам ниже.';
      return;
    }
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = ctx.sampleRate > 50000 ? 4096 : 2048;
    src.connect(an);
    const buf = new Float32Array(an.fftSize);
    mic.textContent = 'Выключить микрофон';
    root.classList.add('live');
    cents.textContent = 'Сыграйте открытую струну…';
    const loop = () => {
      an.getFloatTimeDomainData(buf);
      const f = yin(buf, ctx.sampleRate);
      if (f && f > 60 && f < 1100) {
        hist.push(f);
        if (hist.length > 5) hist.shift();
        const sorted = hist.slice().sort((x, y) => x - y);
        show(sorted[Math.floor(sorted.length / 2)]);
      } else if (hist.length) {
        hist = [];
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
  }

  function off() {
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    mic.textContent = 'Включить микрофон';
    root.classList.remove('live', 'good');
    noteEl.textContent = '—';
    needle.style.transform = 'rotate(0deg)';
  }

  function show(f) {
    const midi = 69 + 12 * Math.log2(f / 440);
    let target = STRINGS.reduce((best, s) => (Math.abs(midi - s.midi) < Math.abs(midi - best.midi) ? s : best));
    let c = Math.round((midi - target.midi) * 100);
    let label;
    if (Math.abs(c) > 300) {
      const m = Math.round(midi);
      c = Math.round((midi - m) * 100);
      label = `${noteName(m)}`;
      target = null;
    } else label = `${noteName(target.midi)}`;
    noteEl.innerHTML = target ? `${label}<small>${6 - target.i}-я струна</small>` : `${label}<small>не струна</small>`;
    const clamped = Math.max(-50, Math.min(50, c));
    needle.style.transform = `rotate(${clamped * 0.9}deg)`;
    const good = Math.abs(c) <= 5;
    root.classList.toggle('good', good);
    if (good) cents.textContent = `В строю ✓ ${NOTE_RU[target ? target.midi % 12 : Math.round(midi) % 12]}`;
    else if (c < 0) cents.textContent = `Ниже на ${-c} ц — подтяните струну`;
    else cents.textContent = `Выше на ${c} ц — ослабьте струну`;
    strBtns.forEach((b) => b.classList.toggle('on', target && Number(b.dataset.i) === target.i));
  }

  mic.addEventListener('click', () => (stream ? off() : on()));

  strBtns.forEach((b) => {
    b.addEventListener('click', () => {
      const i = Number(b.dataset.i);
      clearInterval(ref?.timer);
      if (ref?.i === i) {
        ref = null;
        b.setAttribute('aria-pressed', 'false');
        return;
      }
      strBtns.forEach((x) => x.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true');
      const pluck = () => note(OPEN[i], audio().currentTime + 0.02, { string: i, vel: 0.9 });
      pluck();
      ref = { i, timer: setInterval(pluck, 2200) };
      setTimeout(() => {
        if (ref?.i === i) {
          clearInterval(ref.timer);
          ref = null;
          b.setAttribute('aria-pressed', 'false');
        }
      }, 13000);
    });
  });
}
