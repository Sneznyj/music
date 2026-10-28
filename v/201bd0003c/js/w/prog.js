// Круг аккордов на любом инструменте: каждый аккорд — такт, ритм — бой или перебор, подсветка текущего.
import { Seq, audio, click, hush } from '../audio.js';
import { instChordCard } from '../lib/cards.js';
import { voicingFor } from '../lib/instruments.js';
import { METERS, PATTERNS } from '../lib/patterns.js';
import { voicings } from '../lib/theory.js';
import { pianoHush } from '../piano.js';
import { claim, el, playButton, playStepOn, release, slider, toggle } from './util.js';

export function init() {
  document.querySelectorAll('.prog').forEach(setup);
}

function setup(root) {
  const inst = root.dataset.inst || 'guitar';
  const p = PATTERNS[root.dataset.pattern];
  const M = METERS[p.meter];
  const chords = root.dataset.chords.split(' ');
  const vs = chords.map((c) => (inst === 'guitar' ? voicings(c)[0] : voicingFor(inst, c)));
  const st = { bpm: Number(root.dataset.bpm) || 76, metro: true, playing: false, bar: 0 };
  const chips = [...root.querySelectorAll('.pg-chip')];
  const big = root.querySelector('.pg-now');
  const show = (k) => {
    chips.forEach((c, i) => c.classList.toggle('on', i === k));
    big.innerHTML = instChordCard(inst, chords[k], vs[k]);
  };
  show(0);
  chips.forEach((c, k) => c.addEventListener('click', () => show(k)));

  const seq = new Seq({
    total: chords.length * M.slots,
    ticksPerBeat: M.slotsPerBeat,
    bpm: () => st.bpm,
    onTick: (t, time) => {
      const k = Math.floor(t / M.slots);
      const pos = t % M.slots;
      playStepOn(inst, p.steps[pos], vs[k], chords[k], time, { kind: p.kind, vel: pos === 0 ? 0.95 : 0.78, beat: pos % M.slotsPerBeat === 0 });
      if (st.metro && pos % M.slotsPerBeat === 0) click(time, pos === 0, 0.45);
    },
    onVisual: (t) => {
      const k = Math.floor(t / M.slots);
      st.t = t;
      if (k !== st.bar) {
        st.bar = k;
        show(k);
      }
    },
  });
  seq.loop = { start: 0, end: chords.length * M.slots };

  const api = {
    title: chords.join(' – '),
    sub: `${root.dataset.instName || ''} · ${p.name}`,
    slug: 'krug-' + chords.join('-'),
    el: root,
    resume: () => btn.click(),
    progress: () => ((st.t ?? 0) + 1) / (chords.length * M.slots),
    stop() {
      if (!st.playing) return;
      st.playing = false;
      seq.stop();
      hush();
      pianoHush();
      btn.setPlaying(false);
      release(api);
    },
  };
  const btn = playButton(() => {
    if (st.playing) return api.stop();
    claim(api);
    audio();
    st.playing = true;
    st.bar = -1;
    btn.setPlaying(true);
    seq.start(0);
  });
  const tempo = slider({ label: 'Темп', min: 40, max: 160, step: 2, value: st.bpm, fmt: (x) => `${x}`, oninput: (x) => (st.bpm = x) });
  root.querySelector('.pg-ctl').append(btn, tempo.node, toggle('Метроном', true, (on) => (st.metro = on)));
  root.classList.add('ready');
}

