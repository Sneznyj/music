// Точка входа: оживляет блоки, которые есть на странице. Каждый блок грузится, только если он нужен.
import { audio } from './audio.js';
import { playVoicing, voicingFromBtn } from './w/util.js';

// тема: системная, светлая или тёмная
const themeBtn = document.querySelector('.theme-btn');
themeBtn?.addEventListener('click', () => {
  const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem('gitara.theme', next);
  } catch {
    /* не запоминаем */
  }
});

// любая схема аккорда звучит по нажатию
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.chord-btn');
  if (!btn || btn.closest('.drill.running')) return;
  const v = voicingFromBtn(btn);
  if (!v) return;
  audio();
  playVoicing(v);
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
];
for (const [sel, load] of blocks) {
  if (document.querySelector(sel)) load().then((m) => m.init()).catch((err) => console.error(sel, err));
}

import('./w/misc.js').then((m) => {
  m.catalog();
  m.favorites();
  m.progress();
  m.fretboard();
  m.capo();
});
