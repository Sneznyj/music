// Мелодия на фортепиано: клавиатура подсвечивает, какую клавишу нажать сейчас и какую следом.
import { Seq, audio, click } from '../audio.js';
import { keyboardSVG, pianoName } from '../lib/keyboard.js';
import { parseNotes } from '../lib/pnotes.js';
import { loadPiano, pianoHush, pianoNote } from '../piano.js';
import { claim, el, playButton, release, select, slider, store, toggle } from './util.js';

export function init() {
  document.querySelectorAll('.pmelody').forEach(setup);
}

function setup(root) {
  const data = JSON.parse(root.querySelector('script[type="application/json"]').textContent);
  const mel = parseNotes(data.notes, { grid: data.grid, meter: data.meter });
  const tpb = data.meter[1] === 8 ? data.grid * 3 : data.grid;
  const evAt = new Map(mel.events.map((e, i) => [e.t, i]));
  const from = 12 * Math.floor(mel.min / 12);
  const to = Math.max(from + 23, 12 * Math.ceil((mel.max + 1) / 12) - 1);
  const kb = root.querySelector('.pm-kb');
  const row = root.querySelector('.pm-notes');
  const st = { speed: store.get('pmSpeed', 0.8), loop: true, metro: false, playing: false, pos: -1, from: 0 };
  root.classList.add('ready');

  row.innerHTML = mel.events.map((e, i) => `<button type="button" class="pm-n" data-i="${i}">${e.chord ? `<i>${e.chord}</i>` : ''}${e.notes.map(pianoName).join('+')}</button>`).join('');
  const chips = [...row.children];
  chips.forEach((c, i) => c.addEventListener('click', () => pick(i)));

  const show = (i) => {
    const cur = mel.events[i];
    const nxt = mel.events[i + 1];
    const notes = [...(nxt ? nxt.notes.map((m) => ({ midi: m, role: 'next' })) : []), ...(cur ? cur.notes.map((m) => ({ midi: m, role: 'rh' })) : [])];
    kb.innerHTML = keyboardSVG({ from, to, notes, labels: 'name' });
    chips.forEach((c, k) => c.classList.toggle('on', k === i));
    const chip = chips[i];
    if (chip) row.scrollLeft = chip.offsetLeft - row.clientWidth / 2;
  };
  show(-1);
  loadPiano();

  const play = (ev, when) => {
    const dur = (ev.d * 60) / (data.bpm * st.speed * tpb);
    ev.notes.forEach((m) => pianoNote(m, when, dur * 0.95, 0.8));
  };
  const seq = new Seq({
    total: mel.total,
    ticksPerBeat: tpb,
    bpm: () => data.bpm * st.speed,
    onTick: (t, time) => {
      const i = evAt.get(t);
      if (i != null) play(mel.events[i], time);
      if (st.metro) {
        const bar = mel.bars.find((b) => t >= b.start && t < b.start + b.len);
        if (bar && (t - bar.start) % tpb === 0) click(time, t === bar.start, 0.6);
      }
    },
    onVisual: (t) => {
      st.t = t;
      const i = evAt.get(t);
      if (i != null) {
        st.pos = i;
        show(i);
      }
    },
    onEnd: () => stop(false),
  });

  function start() {
    claim(api);
    audio();
    seq.loop = st.loop ? { start: 0, end: mel.total } : null;
    st.playing = true;
    btn.setPlaying(true);
    seq.start(st.from);
  }
  function stop(silence = true) {
    if (!st.playing) return;
    st.playing = false;
    seq.stop(!silence);
    if (silence) pianoHush();
    btn.setPlaying(false);
    st.from = silence && st.pos >= 0 ? mel.events[st.pos].t : 0;
    release(api);
  }
  function step(d) {
    if (st.playing) stop();
    select(api);
    const i = Math.max(0, Math.min(mel.events.length - 1, st.pos + d));
    st.pos = i;
    st.from = mel.events[i].t;
    play(mel.events[i], audio().currentTime + 0.01);
    show(i);
  }
  function pick(i) {
    st.pos = i - 1;
    step(1);
  }
  const api = {
    title: data.title,
    sub: 'Фортепиано · мелодия',
    slug: 'pianino-' + data.title,
    el: root,
    stop: () => stop(),
    resume: () => start(),
    prev: () => step(-1),
    next: () => step(1),
    progress: () => (st.t ?? 0) / mel.total,
  };
  const btn = playButton(() => (st.playing ? stop() : start()));
  const prev = el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Предыдущая нота', html: '<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>' });
  const next = el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Следующая нота', html: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>' });
  prev.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));
  const speed = slider({ label: 'Скорость', min: 30, max: 120, step: 5, value: Math.round(st.speed * 100), fmt: (v) => `${v}%`, oninput: (v) => { st.speed = v / 100; store.set('pmSpeed', st.speed); } });
  root.querySelector('.pm-ctl').append(btn, el('div', { class: 'tp-steps' }, prev, next), speed.node, el('div', { class: 'tg-group' }, toggle('Повтор', true, (v) => (st.loop = v)), toggle('Метроном', false, (v) => (st.metro = v))));
}
