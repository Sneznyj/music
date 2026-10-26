// Тюнер: высота звука с микрофона (алгоритм YIN) и эталонные струны.
// Инструмент и строй выбираются (lib/tunings.js); «Любой инструмент» — хроматический режим без струн.
import { audio, note } from '../audio.js';
import { TUNERS, tuningOf } from '../lib/tunings.js';
import { NOTE_RU, noteName } from '../lib/theory.js';
import { pianoNote } from '../piano.js';
import { el, store } from './util.js';

export function init() {
  document.querySelectorAll('.tuner').forEach(setup);
}

// out (по желанию) получает ap — непериодичность кадра: 0 у чистого тона, ближе к 0.12 у звука с воздухом;
// fmin — нижняя граница частоты (у баса 28 Гц: такой сигнал сначала прореживают, иначе долго считать)
export function yin(buf, sr, out, fmin = 60) {
  const half = Math.floor(buf.length / 2);
  let rms = 0;
  for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / buf.length);
  if (rms < 0.008) return null;
  const minTau = Math.floor(sr / 1100);
  const maxTau = Math.min(half - 1, Math.floor(sr / fmin));
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
  if (out) out.ap = b;
  return sr / (tau + (Number.isFinite(shift) ? shift : 0));
}

const OCT_RU = ['субконтроктавы', 'контроктавы', 'большой октавы', 'малой октавы', 'первой октавы', 'второй октавы', 'третьей октавы', 'четвёртой октавы'];

function setup(root) {
  const noteEl = root.querySelector('.tn-note');
  const needle = root.querySelector('.tn-needle');
  const cents = root.querySelector('.tn-cents');
  const mic = root.querySelector('.tn-mic');
  const strBox = root.querySelector('.tn-strings');
  const instSel = root.querySelector('.tn-inst');
  const tunSel = root.querySelector('.tn-tuning');
  let stream = null;
  let srcNode = null;
  let raf = 0;
  let hist = [];
  let ref = null;
  let strBtns = [];

  // ---------- инструмент и строй ----------
  const saved = store.get('tuner', {});
  const urlInst = new URLSearchParams(location.search).get('inst');
  const cur = {
    inst: instSel ? (TUNERS[urlInst] ? urlInst : TUNERS[saved.inst] ? saved.inst : 'guitar') : root.dataset.inst || 'guitar',
    tuning: instSel && !TUNERS[urlInst] ? saved.tuning : null,
  };
  let strings = [];
  function applyInst() {
    const [id, title, notes] = tuningOf(cur.inst, cur.tuning);
    cur.tuning = id;
    const flats = title.includes('♭');
    const n = notes.length;
    strings = notes.map((m, i) => ({ midi: m, i, num: n - i }));
    // струны в одинаковый тон (балалайка) — одной подписью
    for (const s of strings) s.label = strings.filter((x) => x.midi === s.midi).map((x) => x.num).join(' и ');
    strBox.replaceChildren(...strings.map((s) => el('button', { class: 'tn-str', type: 'button', 'data-i': s.i, 'aria-pressed': 'false' }, el('b', {}, noteName(s.midi, flats)), el('span', {}, `${s.num}-я`))));
    strBox.hidden = !n;
    strBtns = [...strBox.querySelectorAll('.tn-str')];
    root.classList.toggle('tn-chromatic', !n);
    stopRef();
    if (!stream) cents.textContent = n ? 'Нажмите «Включить микрофон» и сыграйте открытую струну' : 'Нажмите «Включить микрофон» и сыграйте или спойте любую ноту';
    if (instSel) {
      instSel.value = cur.inst;
      tunSel.replaceChildren(...TUNERS[cur.inst].tunings.map(([tid, name]) => el('option', { value: tid, selected: tid === cur.tuning ? true : null }, name)));
      tunSel.closest('label').hidden = TUNERS[cur.inst].tunings.length < 2;
      store.set('tuner', { inst: cur.inst, tuning: cur.tuning });
    }
    if (stream) restart();
  }
  instSel?.addEventListener('change', () => {
    cur.inst = instSel.value;
    cur.tuning = null;
    applyInst();
  });
  tunSel?.addEventListener('change', () => {
    cur.tuning = tunSel.value;
    applyInst();
  });

  // ---------- микрофон ----------
  // самая низкая нота строя: ниже 60 Гц (бас) сигнал прореживаем вчетверо и ищем частоту от 26 Гц
  const lowHz = () => (strings.length ? Math.min(...strings.map((s) => 440 * 2 ** ((s.midi - 69) / 12))) : 65);
  async function on() {
    const ctx = audio();
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch {
      cents.textContent = 'Нет доступа к микрофону. Разрешите его в адресной строке браузера — или настройтесь по эталонным струнам ниже.';
      return;
    }
    mic.textContent = 'Выключить микрофон';
    root.classList.add('live');
    cents.textContent = strings.length ? 'Сыграйте открытую струну…' : 'Сыграйте или спойте ноту…';
    listen(ctx);
  }
  function listen(ctx) {
    const low = lowHz() < 60;
    srcNode?.disconnect();
    const src = (srcNode = ctx.createMediaStreamSource(stream));
    const an = ctx.createAnalyser();
    an.fftSize = low ? 8192 : ctx.sampleRate > 50000 ? 4096 : 2048;
    src.connect(an);
    const buf = new Float32Array(an.fftSize);
    const dec = low ? 4 : 1;
    const small = new Float32Array(an.fftSize / dec);
    const loop = () => {
      an.getFloatTimeDomainData(buf);
      let f;
      if (dec > 1) {
        for (let i = 0; i < small.length; i++) small[i] = (buf[i * 4] + buf[i * 4 + 1] + buf[i * 4 + 2] + buf[i * 4 + 3]) / 4;
        f = yin(small, ctx.sampleRate / dec, null, 26);
      } else f = yin(buf, ctx.sampleRate);
      if (f && f > (low ? 26 : 60) && f < 1100) {
        hist.push(f);
        if (hist.length > 5) hist.shift();
        const sorted = hist.slice().sort((x, y) => x - y);
        show(sorted[Math.floor(sorted.length / 2)]);
      } else if (hist.length) {
        hist = [];
      }
      raf = requestAnimationFrame(loop);
    };
    cancelAnimationFrame(raf);
    loop();
  }
  // строй сменили при включённом микрофоне: перенастроить разбор под новый диапазон
  function restart() {
    cancelAnimationFrame(raf);
    hist = [];
    listen(audio());
  }

  function off() {
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    srcNode?.disconnect();
    srcNode = null;
    mic.textContent = 'Включить микрофон';
    root.classList.remove('live', 'good');
    noteEl.textContent = '—';
    needle.style.transform = 'rotate(0deg)';
  }

  function show(f) {
    const midi = 69 + 12 * Math.log2(f / 440);
    let target = strings.length ? strings.reduce((best, s) => (Math.abs(midi - s.midi) < Math.abs(midi - best.midi) ? s : best)) : null;
    let c;
    let label;
    if (!target || Math.abs(midi - target.midi) > 3) {
      // хроматически: ближайшая нота с октавой
      const m = Math.round(midi);
      c = Math.round((midi - m) * 100);
      label = `${noteName(m)}${Math.floor(m / 12) - 1}<small>${NOTE_RU[((m % 12) + 12) % 12]} ${OCT_RU[Math.floor(m / 12) - 1] || ''}${target ? ' · не открытая струна' : ''}</small>`;
      target = null;
    } else {
      c = Math.round((midi - target.midi) * 100);
      label = `${noteName(target.midi)}<small>${target.label}-я струна</small>`;
    }
    noteEl.innerHTML = label;
    const clamped = Math.max(-50, Math.min(50, c));
    needle.style.transform = `rotate(${clamped * 0.9}deg)`;
    const good = Math.abs(c) <= 5;
    root.classList.toggle('good', good);
    const what = strings.length ? 'струну' : 'ноту';
    if (good) cents.textContent = `В строю ✓ ${NOTE_RU[target ? target.midi % 12 : ((Math.round(midi) % 12) + 12) % 12]}`;
    else if (c < 0) cents.textContent = `Ниже на ${-c} ц — ${strings.length ? `подтяните ${what}` : 'чуть выше'}`;
    else cents.textContent = `Выше на ${c} ц — ${strings.length ? `ослабьте ${what}` : 'чуть ниже'}`;
    strBtns.forEach((b) => b.classList.toggle('on', !!target && strings[Number(b.dataset.i)].midi === target.midi));
  }

  mic.addEventListener('click', () => (stream ? off() : on()));

  // ---------- эталонный звук ----------
  function stopRef() {
    clearInterval(ref?.timer);
    ref = null;
    strBtns.forEach((x) => x.setAttribute('aria-pressed', 'false'));
  }
  function pluck(s) {
    const t = audio().currentTime + 0.02;
    const voice = TUNERS[cur.inst].voice;
    if (voice === 'piano') pianoNote(s.midi, t, 2, 0.8);
    else note(s.midi, t, { string: s.i, vel: 0.9, voice, bright: voice === 'guitar' ? 1 : 0 });
  }
  strBox.addEventListener('click', (e) => {
    const b = e.target.closest('.tn-str');
    if (!b) return;
    const i = Number(b.dataset.i);
    if (ref?.i === i) return stopRef();
    stopRef();
    b.setAttribute('aria-pressed', 'true');
    pluck(strings[i]);
    ref = { i, timer: setInterval(() => pluck(strings[i]), 2200) };
    setTimeout(() => ref?.i === i && stopRef(), 13000);
  });

  applyInst();
}
