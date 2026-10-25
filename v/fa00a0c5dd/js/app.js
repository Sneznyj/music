// Точка входа: оживляет блоки, которые есть на странице. Каждый блок грузится, только если он нужен.
import { audio } from './audio.js';
import { playChordOn, voicingFromBtn } from './w/util.js';

// любая схема аккорда звучит по нажатию: гитара, укулеле, бас или фортепиано
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.chord-btn');
  if (!btn || btn.closest('.drill.running')) return;
  const inst = btn.dataset.inst || 'guitar';
  let v = null;
  if (inst === 'piano' && btn.dataset.midi) {
    const [bass, ...rh] = btn.dataset.midi.split(',').map(Number);
    v = { bass, rh };
  } else v = voicingFromBtn(btn);
  if (!v) return;
  audio();
  playChordOn(inst, v);
  btn.classList.remove('ring');
  void btn.offsetWidth;
  btn.classList.add('ring');
});

const blocks = [
  ['.tabplayer', () => import('./w/tabplayer.js')],
  ['.pattern', () => import('./w/pattern.js')],
  ['.songsheet', () => import('./w/sheet.js')],
  ['.drill', () => import('./w/drill.js')],
  ['.tuner', () => import('./w/tuner.js')],
  ['.metronome', () => import('./w/metronome.js')],
  ['.prog', () => import('./w/prog.js')],
  ['.pmelody', () => import('./w/pmelody.js')],
];
for (const [sel, load] of blocks) {
  if (document.querySelector(sel)) load().then((m) => m.init()).catch((err) => console.error(sel, err));
}

import('./w/player.js').then((m) => m.init());
import('./w/misc.js').then((m) => {
  m.catalog();
  m.favorites();
  m.progress();
  m.fretboard();
  m.capo();
  m.keyboard();
});
