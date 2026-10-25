// Мелкие блоки: поиск по каталогу, «Мои песни», пройденные уроки, гриф с нотами, каподастр.
import { audio, note } from '../audio.js';
import { NOTE_RU, OPEN, noteName, transposeChord } from '../lib/theory.js';
import { el, store } from './util.js';

// ---------- каталог ----------
const LAT = 'qwertyuiop[]asdfghjkl;\'zxcvbnm,.`';
const CYR = 'йцукенгшщзхъфывапролджэячсмитьбюё';
const swap = (s) => [...s].map((c) => {
  const i = LAT.indexOf(c);
  if (i >= 0) return CYR[i];
  const j = CYR.indexOf(c);
  return j >= 0 ? LAT[j] : c;
}).join('');
const norm = (s) => s.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();

export function catalog() {
  const grid = document.querySelector('.catalog');
  if (!grid) return;
  const cards = [...grid.querySelectorAll('.cover-card')];
  const input = document.querySelector('#q');
  const found = document.querySelector('.found');
  const empty = document.querySelector('.empty');
  const f = { lang: 'all', level: 'all', tab: false };
  const params = new URLSearchParams(location.search);
  if (params.get('q')) input.value = params.get('q');
  if (params.get('lang')) f.lang = params.get('lang');
  if (params.get('level')) f.level = params.get('level');
  const chips = [...document.querySelectorAll('.filters .chip')];
  const paint = () => chips.forEach((c) => {
    const k = c.dataset.f;
    c.classList.toggle('on', k === 'tab' ? f.tab : f[k] === c.dataset.v);
  });
  const apply = () => {
    const q = norm(input.value);
    const alt = norm(swap(input.value.toLowerCase()));
    let n = 0;
    for (const c of cards) {
      const text = norm(c.dataset.q);
      const lang = c.dataset.lang === 'es' ? 'en' : c.dataset.lang;
      const ok =
        (!q || text.includes(q) || (alt && text.includes(alt))) &&
        (f.lang === 'all' || lang === f.lang) &&
        (f.level === 'all' || c.dataset.level === f.level) &&
        (!f.tab || c.dataset.tab === '1');
      c.hidden = !ok;
      if (ok) n++;
    }
    found.textContent = q || f.lang !== 'all' || f.level !== 'all' || f.tab ? `Найдено: ${n}` : '';
    empty.hidden = n > 0;
  };
  chips.forEach((c) =>
    c.addEventListener('click', () => {
      const k = c.dataset.f;
      if (k === 'tab') f.tab = !f.tab;
      else f[k] = c.dataset.v;
      paint();
      apply();
    }),
  );
  input.addEventListener('input', apply);
  document.querySelector('.search')?.addEventListener('submit', (e) => {
    e.preventDefault();
    apply();
  });
  paint();
  apply();
  if (location.hash === '#poisk') input.focus();
}

// ---------- мои песни ----------
export function favorites() {
  const favs = new Set(store.get('fav', []));
  document.querySelectorAll('.fav-btn').forEach((b) => {
    const slug = b.dataset.slug;
    const paint = () => {
      const on = favs.has(slug);
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
      b.querySelector('span').textContent = on ? 'В моих песнях' : 'В мои песни';
    };
    paint();
    b.addEventListener('click', () => {
      favs.has(slug) ? favs.delete(slug) : favs.add(slug);
      store.set('fav', [...favs]);
      paint();
    });
  });
}

// ---------- пройденные уроки ----------
export function progress() {
  const done = new Set(store.get('done', []));
  const paint = () => {
    document.querySelectorAll('.course-item').forEach((a) => a.classList.toggle('done', done.has(a.dataset.lesson)));
    const items = document.querySelectorAll('.course-item');
    const bar = document.querySelector('.progress');
    if (bar && items.length) {
      const n = [...items].filter((a) => done.has(a.dataset.lesson)).length;
      bar.querySelector('i').style.width = `${(n / items.length) * 100}%`;
      bar.querySelector('.progress-txt').textContent = n ? `Пройдено ${n} из ${items.length}` : 'Начните с первого урока';
    }
    document.querySelectorAll('.done-btn').forEach((b) => {
      const on = done.has(b.dataset.lesson);
      b.classList.toggle('on', on);
      b.textContent = on ? 'Урок пройден ✓' : 'Отметить урок пройденным';
    });
  };
  document.querySelectorAll('.done-btn').forEach((b) =>
    b.addEventListener('click', () => {
      const s = b.dataset.lesson;
      done.has(s) ? done.delete(s) : done.add(s);
      store.set('done', [...done]);
      paint();
    }),
  );
  paint();
}

// ---------- гриф с нотами ----------
export function fretboard() {
  document.querySelectorAll('.fb-explorer').forEach((root) => {
    const FR = 12;
    const info = el('p', { class: 'fbx-info' }, 'Нажмите на струну или лад');
    const showAll = el('button', { type: 'button', class: 'tg', 'aria-pressed': 'false' }, 'Показать все ноты');
    const grid = el('div', { class: 'fbx', role: 'group', 'aria-label': 'Гриф гитары' });
    grid.style.setProperty('--frets', FR + 1);
    for (let s = 1; s <= 6; s++) {
      const idx = 6 - s;
      for (let f = 0; f <= FR; f++) {
        const midi = OPEN[idx] + f;
        const b = el('button', { type: 'button', class: `fbx-c${f === 0 ? ' open' : ''}`, 'data-s': s, 'aria-label': `${s}-я струна, ${f ? f + '-й лад' : 'открытая'}` }, el('span', {}, noteName(midi)));
        b.addEventListener('click', () => {
          audio();
          note(midi, undefined, { string: idx });
          grid.querySelectorAll('.on').forEach((x) => x.classList.remove('on'));
          b.classList.add('on');
          info.innerHTML = `<b>${s}-я струна, ${f ? f + '-й лад' : 'открытая'}</b> — нота ${noteName(midi)} (${NOTE_RU[midi % 12]})`;
        });
        grid.append(b);
      }
    }
    const nums = el('div', { class: 'fbx nums' });
    nums.style.setProperty('--frets', FR + 1);
    for (let f = 0; f <= FR; f++) nums.append(el('span', {}, f ? String(f) : ''));
    showAll.addEventListener('click', () => {
      const on = showAll.getAttribute('aria-pressed') !== 'true';
      showAll.setAttribute('aria-pressed', String(on));
      grid.classList.toggle('all', on);
    });
    root.append(el('div', { class: 'fbx-wrap' }, grid, nums), el('div', { class: 'fbx-bar' }, info, showAll));
  });
}

// ---------- каподастр ----------
export function capo() {
  document.querySelectorAll('.capo-demo').forEach((root) => {
    const shapes = root.dataset.chords.split(' ');
    const range = root.querySelector('input');
    const val = root.querySelector('.capo-val');
    const out = root.querySelector('.capo-sound');
    const upd = () => {
      const c = Number(range.value);
      val.textContent = c ? `${c}-й лад` : 'нет';
      out.innerHTML = shapes.map((s) => `<i>${transposeChord(s, c, false)}</i>`).join('');
    };
    range.addEventListener('input', upd);
    upd();
  });
}
