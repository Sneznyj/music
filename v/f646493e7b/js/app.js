// Точка входа: оживляет блоки, которые есть на странице. Каждый блок грузится, только если он нужен.
import { audio, prefetch, setGuitarVoice, voiceOf } from './audio.js';
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
  ['.song-tabs', () => import('./w/songpage.js')],
  ['.yt-btn', () => import('./w/video.js')],
  ['.songbook', () => import('./w/songbook.js')],
  ['.vocal-tools', () => import('./w/vocal.js')],
];
for (const [sel, load] of blocks) {
  if (document.querySelector(sel)) load().then((m) => m.init()).catch((err) => console.error(sel, err));
}

// звук гитары: акустика или классика; у песни может быть свой (Shape of My Heart — классика), пока человек не выбрал сам
let chosen = null;
try {
  chosen = localStorage.getItem('gitara.voice');
} catch {
  /* нет хранилища */
}
const songVoice = document.querySelector('[data-voice]')?.dataset.voice;
if (!chosen && songVoice) setGuitarVoice(songVoice, false);
const showVoice = () => document.querySelectorAll('.voice-pick button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === voiceOf())));
addEventListener('voice:change', showVoice);
showVoice();
document.addEventListener('click', (e) => {
  const b = e.target.closest('.voice-pick button');
  if (!b) return;
  setGuitarVoice(b.dataset.v);
  audio();
});

// записи инструментов скачиваем заранее, пока человек читает страницу: первый же звук будет живым
if (document.querySelector('.chord-btn, .tabplayer, .songsheet, .pattern, .prog, .riff-play, .vocal-tools')) {
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1200));
  idle(() => {
    prefetch();
    if (document.querySelector('[data-inst="bass"], .vocal-tools')) prefetch('bass');
    if (document.querySelector('.songsheet, .vocal-tools')) for (const n of ['kick1', 'kick2', 'snare1', 'snare2', 'stick', 'hat1', 'hat2', 'hatopen', 'shake1', 'shake2']) fetch(`/audio/drums/${n}.mp3`);
    if (document.querySelector('[data-inst="ukulele"]')) prefetch('nylon');
  });
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
