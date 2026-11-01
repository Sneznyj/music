// Подсветка текста песни под звук: слова закрашиваются, как в караоке, аккорд над словами горит, строка видна.
// Времена строк считает lib/songtime.js (textOrder), сюда приходит только позиция песни в шагах.
// Страница едет за строкой, только если человек сейчас смотрит на текст: прошлая строка на экране и он сам не крутил.
// Ушёл читать другое место — страницу не трогаем.
import { inView, mayAutoScroll } from './util.js';

export function makeKaraoke(box, { follow = () => true } = {}) {
  let entries = [];
  let dom = new Map();
  let next = 0;
  let active = [];
  let lineEl = null;
  let chordEl = null;

  // следующий элемент у края экрана — подвигаем; прошлый уже не на экране — человек смотрит в другое место, не трогаем
  function keepInView(el, prev) {
    if (!el || !prev || !follow() || !inView(prev) || !mayAutoScroll()) return;
    const r = el.getBoundingClientRect();
    if (r.bottom > innerHeight * 0.72 || r.top < innerHeight * 0.2) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  // привязка к словам на экране: текст перерисовали — находим их заново
  function bind() {
    dom = new Map();
    box?.querySelectorAll('.sb-line[data-l]').forEach((line) => {
      const words = [...line.querySelectorAll('.sb-w')].map((el) => ({ el, o: Number(el.dataset.o), len: el.textContent.length, state: 0 }));
      dom.set(Number(line.dataset.l), { line, words });
    });
    lineEl = null;
    chordEl = null;
  }

  // в какой шаг поётся буква at: между соседними опорами — равномерно
  const timeAt = (e, at) => {
    const a = e.anchors;
    if (at <= a[0].at) return a[0].t;
    for (let i = 1; i < a.length; i++) {
      if (at <= a[i].at) {
        const span = a[i].at - a[i - 1].at;
        return span ? a[i - 1].t + ((at - a[i - 1].at) / span) * (a[i].t - a[i - 1].t) : a[i].t;
      }
    }
    return a.at(-1).t;
  };

  const setWord = (w, state, p) => {
    if (state === 1) w.el.style.setProperty('--p', `${(p * 100).toFixed(1)}%`);
    if (w.state === state) return;
    w.state = state;
    w.el.classList.toggle('kn', state === 1);
    w.el.classList.toggle('kd', state === 2);
    if (state !== 1) w.el.style.removeProperty('--p');
  };

  function paint(e, t) {
    const d = dom.get(e.l);
    if (!d) return;
    for (const w of d.words) {
      const t0 = timeAt(e, w.o);
      const t1 = timeAt(e, w.o + w.len);
      if (t >= t1) setWord(w, 2);
      else if (t <= t0) setWord(w, 0);
      else setWord(w, 1, (t - t0) / (t1 - t0));
    }
  }
  const wipe = (e) => dom.get(e.l)?.words.forEach((w) => setWord(w, 0));

  function setLine(l) {
    const el = dom.get(l)?.line || null;
    if (el === lineEl) return;
    const prev = lineEl;
    prev?.classList.remove('on');
    el?.classList.add('on');
    lineEl = el;
    keepInView(el, prev);
  }

  // кадр: t — позиция песни в шагах, с дробью
  function frame(t) {
    while (next < entries.length && entries[next].from <= t) {
      const e = entries[next++];
      if (!e.anchors.length) setLine(e.l);
      else {
        // та же строка второй раз («Припев:» без слов, повтор текста) — закрашиваем заново
        wipe(e);
        active.push(e);
      }
    }
    let cur = null;
    for (const e of active) {
      paint(e, t);
      if (t >= e.start) cur = e;
    }
    active = active.filter((e) => t < e.to);
    if (cur) setLine(cur.l);
  }

  // перемотка: то, что уже спето, закрашено, остальное чистое
  function seek(t) {
    active = [];
    next = 0;
    dom.forEach((d) => d.words.forEach((w) => setWord(w, 0)));
    lineEl?.classList.remove('on');
    lineEl = null;
    while (next < entries.length && entries[next].to <= t) {
      if (entries[next].anchors.length) paint(entries[next], Infinity);
      next++;
    }
  }

  function setChord(l, k) {
    const el = l == null ? null : box?.querySelector(`.sb-c[data-l="${l}"][data-k="${k}"]`);
    if (el === chordEl || (l == null && chordEl)) return;
    chordEl?.classList.remove('on');
    el?.classList.add('on');
    chordEl = el;
  }

  function clear() {
    seek(-Infinity);
    active = [];
    next = 0;
    chordEl?.classList.remove('on');
    chordEl = null;
  }

  return {
    bind,
    frame,
    seek,
    setChord,
    clear,
    load(list) {
      entries = list.slice().sort((a, b) => a.from - b.from);
      bind();
      clear();
    },
    keepInView,
  };
}
