// Общие помощники для блоков страницы.
import { chk, hush, note, strum } from '../audio.js';
import { OPEN, bassString } from '../lib/theory.js';

export function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}

export const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem('gitara.' + key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem('gitara.' + key, JSON.stringify(value));
    } catch {
      /* хранилище недоступно — просто не запоминаем */
    }
  },
};

// Играет только один проигрыватель на странице. Последний запущенный помнится для нижнего плеера:
// у него есть title, sub, slug, el, stop(), resume(), progress() и по желанию prev()/next().
let current = null;
let playing = false;
const emit = () => dispatchEvent(new CustomEvent('np:change'));
export function claim(player) {
  if (current && current !== player && playing) current.stop();
  current = player;
  playing = true;
  emit();
}
export function release(player) {
  if (current === player && playing) {
    playing = false;
    emit();
  }
}
// Выбрать проигрыватель для нижнего плеера, не запуская его (например, шаг по одной ноте).
export function select(player) {
  if (current && current !== player && playing) current.stop();
  current = player;
  playing = false;
  emit();
}
export const nowPlaying = () => ({ current, playing });
export const touchNowPlaying = emit;

// Нота или аккорд таба: струны с 6-й к 1-й, «раскат» — по очереди.
export function playTabEvent(ev, when, vel = 0.85) {
  const list = ev.notes.slice().sort((a, b) => b.s - a.s);
  if (list.every((n) => n.dead)) {
    hush(when, 0.008);
    chk(when, 0.75);
    return;
  }
  list.forEach((n, k) => {
    if (n.dead) return;
    const s = 6 - n.s;
    note(OPEN[s] + n.f, when + (ev.roll ? k * 0.03 : k * 0.003), { string: s, vel: n.tech ? vel * 0.62 : vel, bright: n.tech ? 0 : 1 });
  });
}

export function notesOf(v) {
  const out = [];
  v.frets.forEach((f, i) => {
    if (f >= 0) out.push({ midi: OPEN[i] + f, string: i });
  });
  return out;
}

export function playVoicing(v, when, dir = 'D', vel = 0.85) {
  strum(notesOf(v), when, dir, { vel });
}

// Одна доля ритма: бой (D, U, X, B) или перебор (B, B2, 1–6, через +).
export function playStep(step, v, name, when, { vel = 0.8, kind = 'strum' } = {}) {
  if (!v || step === '.') return;
  if (kind === 'strum') {
    if (step === 'D' || step === 'U') playVoicing(v, when, step, vel);
    else if (step === 'X') {
      hush(when, 0.008);
      chk(when, vel * 0.9);
    } else if (step === 'B') {
      const s = bassString(v, name);
      if (s >= 0) note(OPEN[s] + v.frets[s], when, { string: s, vel: vel * 1.05 });
    }
    return;
  }
  const b1 = bassString(v, name);
  for (const part of step.split('+')) {
    let s;
    if (part === 'B') s = b1;
    else if (part === 'B2') {
      s = b1 + 1;
      while (s < 6 && v.frets[s] < 0) s++;
      if (s > 3) s = b1;
    } else {
      s = 6 - Number(part);
      while (s < 6 && v.frets[s] < 0) s++;
      if (s >= 6) continue;
    }
    if (s < 0 || v.frets[s] < 0) continue;
    note(OPEN[s] + v.frets[s], when, { string: s, vel: part.startsWith('B') ? vel : vel * 0.8 });
  }
}

export function voicingFromBtn(btn) {
  if (!btn.dataset.frets) return null;
  const frets = btn.dataset.frets.split(',').map(Number);
  const fingers = btn.dataset.fingers.split(',').map((f) => (f === 'T' ? 'T' : Number(f)));
  return { frets, fingers };
}

export function slider({ label, min, max, value, step = 1, fmt = (v) => v, oninput }) {
  const out = el('output', {}, fmt(value));
  const input = el('input', { type: 'range', min, max, step, value, 'aria-label': label });
  input.addEventListener('input', () => {
    out.textContent = fmt(Number(input.value));
    oninput(Number(input.value));
  });
  return { node: el('label', { class: 'ctl-slider' }, el('span', { class: 'ctl-label' }, label), input, out), input, out };
}

export function toggle(label, on, onchange) {
  const b = el('button', { type: 'button', class: 'tg', 'aria-pressed': String(!!on) }, label);
  b.addEventListener('click', () => {
    const v = b.getAttribute('aria-pressed') !== 'true';
    b.setAttribute('aria-pressed', String(v));
    onchange(v);
  });
  return b;
}

export const PLAY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>';
export const STOP_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="6" width="3.6" height="12" rx="1" fill="currentColor"/><rect x="13.4" y="6" width="3.6" height="12" rx="1" fill="currentColor"/></svg>';

export function playButton(onclick) {
  const b = el('button', { type: 'button', class: 'btn play-btn', html: `${PLAY_ICON}<span>Играть</span>` });
  b.addEventListener('click', onclick);
  b.setPlaying = (on, label = 'Играть') => {
    b.innerHTML = on ? `${STOP_ICON}<span>Стоп</span>` : `${PLAY_ICON}<span>${label}</span>`;
    b.classList.toggle('on', on);
  };
  return b;
}

let lastUserScroll = 0;
for (const ev of ['wheel', 'touchmove', 'keydown', 'mousedown']) {
  addEventListener(ev, (e) => {
    if (ev === 'keydown' && !['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key)) return;
    if (ev === 'mousedown' && e.target !== document.documentElement) return;
    lastUserScroll = Date.now();
  }, { passive: true });
}
// Автопрокрутка не спорит с человеком: если он сам крутил страницу последние 3 секунды — не трогаем.
export const mayAutoScroll = () => Date.now() - lastUserScroll > 3000;

export function inView(node) {
  const r = node.getBoundingClientRect();
  return r.bottom > 0 && r.top < innerHeight;
}
