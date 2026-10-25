// Бой и перебор: проигрывание по кругу с подсветкой текущего удара.
import { Seq, audio, click, hush } from '../audio.js';
import { METERS, PATTERNS } from '../lib/patterns.js';
import { voicings } from '../lib/theory.js';
import { claim, playButton, playStep, release, slider, toggle } from './util.js';

export function init() {
  document.querySelectorAll('.pattern').forEach(setup);
}

function setup(root) {
  const id = root.dataset.pattern;
  const p = PATTERNS[id];
  const M = METERS[p.meter];
  const chord = root.dataset.chord;
  const frets = root.dataset.frets ? root.dataset.frets.split(',').map(Number) : null;
  const v = frets ? { frets, fingers: frets.map(() => 0) } : voicings(chord)[0];
  const cells = [...root.querySelectorAll('.st')];
  const st = { bpm: p.kind === 'pick' ? 70 : 76, metro: false, playing: false };

  const seq = new Seq({
    total: M.slots,
    ticksPerBeat: M.slotsPerBeat,
    bpm: () => st.bpm,
    onTick: (i, time) => {
      playStep(p.steps[i], v, chord, time, { kind: p.kind, vel: i === 0 ? 0.95 : 0.78 });
      if (st.metro && i % M.slotsPerBeat === 0) click(time, i === 0, 0.6);
    },
    onVisual: (i) => {
      st.i = i;
      cells.forEach((c, k) => c.classList.toggle('on', k === i));
    },
  });
  seq.loop = { start: 0, end: M.slots };

  const api = {
    title: p.name,
    sub: `${p.kind === 'pick' ? 'Перебор' : 'Бой'} на ${chord}`,
    slug: 'ritm-' + id,
    el: root,
    resume: () => btn.click(),
    progress: () => ((st.i ?? 0) + 1) / M.slots,
    stop() {
      if (!st.playing) return;
      st.playing = false;
      seq.stop();
      hush();
      btn.setPlaying(false);
      cells.forEach((c) => c.classList.remove('on'));
      release(api);
    },
  };
  const btn = playButton(() => {
    if (st.playing) return api.stop();
    claim(api);
    audio();
    st.playing = true;
    btn.setPlaying(true);
    seq.start(0);
  });
  const tempo = slider({ label: 'Темп', min: 40, max: 160, step: 2, value: st.bpm, fmt: (x) => `${x}`, oninput: (x) => (st.bpm = x) });
  const metro = toggle('Метроном', false, (on) => (st.metro = on));
  root.querySelector('.pattern-ctl').append(btn, tempo.node, metro);
  root.classList.add('ready');
}
