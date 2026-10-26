// Метроном: темп 30–240, размер, дробление доли, «тап».
import { Seq, audio, click } from '../audio.js';
import { claim, el, release, store } from './util.js';

const METERS = { '2/4': [2, 1], '3/4': [3, 1], '4/4': [4, 1], '6/8': [6, 1] };

export function init() {
  document.querySelectorAll('.metronome').forEach(setup);
}

function setup(root) {
  const st = { bpm: store.get('metroBpm', 80), meter: store.get('metroMeter', '4/4'), sub: false, playing: false, taps: [] };
  const beats = () => METERS[st.meter][0];
  const bpmOut = el('div', { class: 'mt-bpm', 'aria-live': 'polite' }, String(st.bpm));
  const range = el('input', { type: 'range', min: 30, max: 240, value: st.bpm, 'aria-label': 'Темп' });
  const minus = el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Медленнее' }, '−');
  const plus = el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Быстрее' }, '+');
  const go = el('button', { type: 'button', class: 'btn mt-go' }, 'Старт');
  const tap = el('button', { type: 'button', class: 'btn btn-ghost' }, 'Тап');
  const meter = el('select', { 'aria-label': 'Размер' }, Object.keys(METERS).map((m) => el('option', { value: m, selected: m === st.meter ? true : null }, m)));
  const sub = el('button', { type: 'button', class: 'tg', 'aria-pressed': 'false' }, 'Восьмые');
  const dots = el('div', { class: 'mt-dots' });
  const drawDots = () => {
    dots.textContent = '';
    for (let i = 0; i < beats(); i++) dots.append(el('i', { class: i === 0 ? 'acc' : '' }));
  };
  drawDots();
  root.append(
    el('div', { class: 'mt-top' }, minus, bpmOut, plus),
    el('div', { class: 'mt-unit muted' }, 'ударов в минуту'),
    range,
    dots,
    el('div', { class: 'mt-ctl' }, go, tap, el('label', { class: 'ctl-select' }, el('span', { class: 'ctl-label' }, 'Размер'), meter), sub),
  );

  const set = (v) => {
    st.bpm = Math.max(30, Math.min(240, Math.round(v)));
    bpmOut.textContent = String(st.bpm);
    if (typeof api !== 'undefined') api.sub = `${st.meter} · ${st.bpm} уд/мин`;
    range.value = st.bpm;
    store.set('metroBpm', st.bpm);
  };
  range.addEventListener('input', () => set(Number(range.value)));
  minus.addEventListener('click', () => set(st.bpm - 1));
  plus.addEventListener('click', () => set(st.bpm + 1));
  meter.addEventListener('change', () => {
    st.meter = meter.value;
    store.set('metroMeter', st.meter);
    drawDots();
    if (st.playing) restart();
  });
  sub.addEventListener('click', () => {
    st.sub = sub.getAttribute('aria-pressed') !== 'true';
    sub.setAttribute('aria-pressed', String(st.sub));
    if (st.playing) restart();
  });
  tap.addEventListener('click', () => {
    const t = performance.now();
    st.taps = st.taps.filter((x) => t - x < 2500);
    st.taps.push(t);
    if (st.taps.length >= 2) {
      const gaps = st.taps.slice(1).map((x, i) => x - st.taps[i]);
      set(60000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length));
    }
  });

  let seq = null;
  const api = {
    title: 'Метроном',
    sub: `${st.meter} · ${st.bpm} уд/мин`,
    slug: 'metronome',
    el: root,
    stop: () => stopIt(),
    resume: () => go.click(),
    progress: () => 0,
  };
  function restart() {
    seq?.stop(true);
    const per = st.sub ? 2 : 1;
    seq = new Seq({
      total: beats() * per,
      ticksPerBeat: per,
      bpm: () => st.bpm,
      onTick: (t, time) => {
        const beat = Math.floor(t / per);
        const off = t % per;
        if (off) click(time, false, 0.35);
        else click(time, beat === 0 || (st.meter === '6/8' && beat === 3), beat === 0 ? 1 : 0.8);
      },
      onVisual: (t) => {
        if (t % per) return;
        const beat = Math.floor(t / per);
        [...dots.children].forEach((d, i) => d.classList.toggle('on', i === beat));
      },
    });
    seq.loop = { start: 0, end: beats() * per };
    seq.start(0);
  }
  function stopIt() {
    if (!st.playing) return;
    st.playing = false;
    seq?.stop(true);
    go.textContent = 'Старт';
    [...dots.children].forEach((d) => d.classList.remove('on'));
    release(api);
  }
  go.addEventListener('click', () => {
    if (st.playing) return stopIt();
    claim(api);
    audio();
    st.playing = true;
    go.textContent = 'Стоп';
    restart();
  });
  if (root.classList.contains('metronome-big')) {
    document.addEventListener('keydown', (e) => {
      if (e.key !== ' ' || e.target.closest('input, select, textarea, button')) return;
      e.preventDefault();
      go.click();
    });
  }
}
