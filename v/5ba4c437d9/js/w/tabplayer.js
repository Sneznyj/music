// Проигрыватель табов: таб в SVG, подсветка нот, гриф-подсказка, замедление, повтор, шаги.
import { Seq, audio, click, hush } from '../audio.js';
import { parseTab } from '../lib/tab.js';
import { NOTE_RU, OPEN } from '../lib/theory.js';
import { claim, el, inView, mayAutoScroll, playButton, playTabEvent, release, select, slider, store, toggle } from './util.js';

const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, text) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
};

export function init() {
  document.querySelectorAll('.tabplayer').forEach(setup);
}

function setup(root) {
  const data = JSON.parse(root.querySelector('script[type="application/json"]').textContent);
  const tab = parseTab(data.tab, { grid: data.grid, meter: data.meter });
  const tpb = data.meter[1] === 8 ? data.grid * 3 : data.grid;
  const evAt = new Map(tab.events.map((e, i) => [e.t, i]));
  const view = root.querySelector('.tp-view');
  const boardBox = root.querySelector('.tp-board');
  const ctl = root.querySelector('.tp-ctl');
  root.classList.add('ready');
  root.tabIndex = -1;

  const st = {
    speed: store.get('tabSpeed', 0.75),
    loop: true,
    metro: false,
    count: false,
    pos: -1,
    from: 0,
    a: 0,
    b: tab.bars.length - 1,
    playing: false,
    counting: false,
  };

  // ---------- управление ----------
  const play = playButton(() => (st.playing ? stop() : start()));
  const prev = el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Предыдущая нота', title: 'Предыдущая нота (←)', html: '<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>' });
  const next = el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Следующая нота', title: 'По шагу: следующая нота (→)', html: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>' });
  prev.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));
  const speed = slider({
    label: 'Скорость',
    min: 30,
    max: 120,
    step: 5,
    value: Math.round(st.speed * 100),
    fmt: (v) => `${v}% · ${Math.round((data.bpm * v) / 100)}`,
    oninput: (v) => {
      st.speed = v / 100;
      store.set('tabSpeed', st.speed);
    },
  });
  const loopT = toggle('Повтор', st.loop, (v) => {
    st.loop = v;
    applyLoop();
  });
  const metroT = toggle('Метроном', st.metro, (v) => (st.metro = v));
  const countT = toggle('Отсчёт', st.count, (v) => (st.count = v));
  const status = el('span', { class: 'tp-status muted', 'aria-live': 'polite' });
  const row1 = el('div', { class: 'tp-row' }, play, el('div', { class: 'tp-steps' }, prev, next), status);
  const row2 = el('div', { class: 'tp-row tp-row2' }, speed.node, el('div', { class: 'tg-group' }, loopT, metroT, countT));
  ctl.append(row1, row2);
  if (tab.bars.length > 2) {
    const opts = (sel) => tab.bars.map((_, i) => el('option', { value: i, selected: i === sel ? true : null }, String(i + 1)));
    const selA = el('select', { 'aria-label': 'С такта' }, opts(st.a));
    const selB = el('select', { 'aria-label': 'По такт' }, opts(st.b));
    const onSel = () => {
      st.a = Math.min(Number(selA.value), Number(selB.value));
      st.b = Math.max(Number(selA.value), Number(selB.value));
      applyLoop();
      if (!st.playing) st.from = tab.bars[st.a].start;
    };
    selA.addEventListener('change', onSel);
    selB.addEventListener('change', onSel);
    row2.append(el('label', { class: 'tp-range' }, el('span', { class: 'ctl-label' }, 'Такты'), selA, '–', selB));
  }

  // ---------- таб ----------
  let lines = [];
  const evNodes = [];
  const evPos = [];
  let curEv = -1;
  let lastW = 0;

  function render() {
    const w = Math.max(280, view.clientWidth);
    if (Math.abs(w - lastW) < 8 && lines.length) return;
    lastW = w;
    view.textContent = '';
    lines = [];
    const tickMin = data.grid >= 4 ? 13 : data.grid === 3 ? 18 : 23;
    const per = Math.max(1, Math.min(4, Math.floor((w - 28) / (tab.ticksPerBar * tickMin + 18))));
    const LEFT = 22;
    const TOP = 26;
    const GAP = 15;
    const H = TOP + GAP * 5 + 24;
    for (let i = 0; i < tab.bars.length; i += per) {
      const bars = tab.bars.slice(i, i + per);
      const ticks = bars.reduce((a, b) => a + b.len, 0);
      const tickW = Math.min(44, (w - LEFT - 6 - bars.length * 14) / ticks);
      const s = svg('svg', { viewBox: `0 0 ${w} ${H}`, width: w, height: H, class: 'tp-svg', role: 'img', 'aria-label': `Такты ${i + 1}–${i + bars.length}` });
      ['e', 'B', 'G', 'D', 'A', 'E'].forEach((n, k) => {
        s.append(svg('text', { x: 6, y: TOP + k * GAP + 4, class: 'tp-sname' }, n));
        s.append(svg('line', { x1: LEFT, x2: w - 4, y1: TOP + k * GAP, y2: TOP + k * GAP, class: 'tp-line' }));
      });
      const cursor = svg('rect', { x: 0, y: TOP - 9, width: 22, height: GAP * 5 + 18, rx: 6, class: 'tp-cursor', visibility: 'hidden' });
      s.append(cursor);
      let x = LEFT;
      s.append(svg('line', { x1: x, x2: x, y1: TOP, y2: TOP + GAP * 5, class: 'tp-barline' }));
      bars.forEach((bar, bi) => {
        const bw = bar.len * tickW + 14;
        const barIdx = i + bi;
        s.append(svg('text', { x: x + 4, y: TOP + GAP * 5 + 17, class: 'tp-barno' }, String(barIdx + 1)));
        for (const [ei, ev] of tab.events.entries()) {
          if (ev.t < bar.start || ev.t >= bar.start + bar.len) continue;
          const cx = x + 8 + (ev.t - bar.start + 0.5) * tickW;
          evPos[ei] = { line: lines.length, x: cx };
          const g = svg('g', { class: 'tp-ev', 'data-e': ei });
          if (ev.chord) s.append(svg('text', { x: cx, y: 11, class: 'tp-chord', 'text-anchor': 'middle' }, ev.chord));
          if (ev.roll) {
            const ys = ev.notes.map((n) => TOP + (n.s - 1) * GAP);
            const y0 = Math.min(...ys) - 4;
            const y1 = Math.max(...ys) + 4;
            let d = `M${cx - 12} ${y0}`;
            for (let y = y0; y < y1; y += 6) d += ` q3 1.5 0 3 q-3 1.5 0 3`;
            g.append(svg('path', { d, class: 'tp-roll' }));
          }
          for (const n of ev.notes) {
            const label = n.dead ? 'x' : (n.tech || '') + n.f;
            const tw = label.length * 7.4 + 6;
            const y = TOP + (n.s - 1) * GAP;
            g.append(svg('rect', { x: cx - tw / 2, y: y - 7.5, width: tw, height: 15, rx: 4, class: 'tp-nbg' }));
            g.append(svg('text', { x: cx, y: y + 4.2, class: 'tp-n', 'text-anchor': 'middle' }, label));
          }
          g.addEventListener('click', () => pick(ei));
          s.append(g);
          evNodes[ei] = g;
        }
        x += bw;
        s.append(svg('line', { x1: x, x2: x, y1: TOP, y2: TOP + GAP * 5, class: 'tp-barline' }));
      });
      view.append(s);
      lines.push({ svg: s, cursor });
    }
    if (curEv >= 0) mark(curEv, false);
  }

  // ---------- гриф ----------
  let lo = 0;
  let hi = Math.max(5, tab.maxFret);
  if (tab.maxFret > 5) {
    lo = Math.max(0, tab.minFret - 1);
    hi = Math.max(lo + 5, tab.maxFret + 1);
  }
  if (tab.events.every((e) => e.notes.every((n) => n.f === 0 || n.dead))) hi = 4;
  // на узком экране гриф рисуем в меньшем масштабе, чтобы струны и цифры не мельчали
  const BW = Math.round(Math.max(360, Math.min(640, boardBox.clientWidth || 640)));
  const BH = 132;
  const bLeft = 36;
  const fw = (BW - bLeft - 10) / (hi - lo + (lo === 0 ? 0.6 : 1));
  const fx = (f) => (lo === 0 ? (f === 0 ? bLeft - 12 : bLeft + (f - 0.5) * fw) : bLeft + (f - lo + 0.5) * fw);
  const sy = (s) => 16 + (s - 1) * 19;
  const board = svg('svg', { viewBox: `0 0 ${BW} ${BH}`, class: 'tp-fb', role: 'img', 'aria-label': 'Гриф: где зажимать ноты' });
  board.append(svg('rect', { x: bLeft, y: sy(1) - 8, width: BW - bLeft - 10, height: sy(6) - sy(1) + 16, rx: 6, class: 'fb-wood' }));
  for (let f = lo === 0 ? 1 : lo; f <= hi; f++) {
    const xx = lo === 0 ? bLeft + f * fw : bLeft + (f - lo + 1) * fw;
    if (xx > BW - 10) break;
    board.append(svg('line', { x1: xx, x2: xx, y1: sy(1) - 8, y2: sy(6) + 8, class: 'fb-fret' }));
    const mid = lo === 0 ? bLeft + (f - 0.5) * fw : bLeft + (f - lo + 0.5) * fw;
    if ([3, 5, 7, 9, 15, 17].includes(f)) board.append(svg('circle', { cx: mid, cy: (sy(3) + sy(4)) / 2, r: 4, class: 'fb-inlay' }));
    if (f === 12) {
      board.append(svg('circle', { cx: mid, cy: sy(2) + 9, r: 4, class: 'fb-inlay' }));
      board.append(svg('circle', { cx: mid, cy: sy(4) + 9, r: 4, class: 'fb-inlay' }));
    }
    board.append(svg('text', { x: mid, y: BH - 4, class: 'fb-num', 'text-anchor': 'middle' }, String(f)));
  }
  if (lo === 0) board.append(svg('rect', { x: bLeft - 3, y: sy(1) - 8, width: 6, height: sy(6) - sy(1) + 16, rx: 2, class: 'fb-nut' }));
  for (let s = 1; s <= 6; s++) {
    board.append(svg('line', { x1: bLeft, x2: BW - 10, y1: sy(s), y2: sy(s), class: 'fb-str', 'stroke-width': (0.9 + s * 0.28).toFixed(2) }));
    board.append(svg('text', { x: 6, y: sy(s) + 4, class: 'fb-sn' }, String(s)));
  }
  const dots = svg('g');
  board.append(dots);
  const boardNote = el('p', { class: 'tp-hint muted' }, 'Здесь появится, какие лады зажимать. Цифры слева — номера струн, как в табе: 1-я сверху.');
  boardBox.append(board, boardNote);

  function showBoard(i) {
    dots.textContent = '';
    const draw = (ev, ghost) => {
      if (!ev) return;
      for (const n of ev.notes) {
        if (n.dead) continue;
        const cx = fx(n.f);
        const cy = sy(n.s);
        dots.append(svg('circle', { cx, cy, r: ghost ? 8 : 10, class: ghost ? 'fb-ghost' : 'fb-dot' }));
        if (!ghost) dots.append(svg('text', { x: cx, y: cy + 4, class: 'fb-dtxt', 'text-anchor': 'middle' }, String(n.f)));
      }
    };
    draw(tab.events[i + 1], true);
    draw(tab.events[i], false);
    const ev = tab.events[i];
    if (ev) {
      const names = ev.notes.filter((n) => !n.dead).map((n) => `${n.s}-я струна, ${n.f ? n.f + '-й лад' : 'открытая'} — ${NOTE_RU[(OPEN[6 - n.s] + n.f) % 12]}`);
      boardNote.textContent = names.length ? names.join(' · ') : 'Глухой удар по заглушённым струнам';
    }
  }

  function mark(i, scroll = true) {
    if (curEv >= 0 && evNodes[curEv]) evNodes[curEv].classList.remove('on');
    curEv = i;
    const g = evNodes[i];
    if (!g) return;
    g.classList.add('on');
    const p = evPos[i];
    lines.forEach((l, k) => l.cursor.setAttribute('visibility', k === p.line ? 'visible' : 'hidden'));
    lines[p.line].cursor.setAttribute('x', p.x - 11);
    showBoard(i);
    if (scroll && st.playing && inView(root) && mayAutoScroll()) {
      const r = lines[p.line].svg.getBoundingClientRect();
      if (r.top < 70 || r.bottom > innerHeight - 10) lines[p.line].svg.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  const playEvent = playTabEvent;

  // ---------- воспроизведение ----------
  const barOf = (t) => tab.bars.find((b) => t >= b.start && t < b.start + b.len) || tab.bars[0];
  const seq = new Seq({
    total: tab.total,
    ticksPerBeat: tpb,
    bpm: () => data.bpm * st.speed,
    onTick: (t, time) => {
      if (st.counting) {
        if (t >= st.from) st.counting = false;
        else {
          const k = t - (st.from - countTicks());
          if (k % tpb === 0) click(time, k === 0);
          return;
        }
      }
      const i = evAt.get(t);
      if (i != null) playEvent(tab.events[i], time);
      if (st.metro) {
        const off = t - barOf(t).start;
        if (off % tpb === 0) click(time, off === 0, 0.7);
      }
    },
    onVisual: (t) => {
      if (t < st.from && st.countShow) {
        const k = Math.floor((t - (st.from - countTicks())) / tpb) + 1;
        status.textContent = `Отсчёт: ${k}`;
        return;
      }
      st.countShow = false;
      status.textContent = '';
      st.lastT = t;
      const i = evAt.get(t);
      if (i != null) {
        st.pos = i;
        mark(i);
      }
    },
    onEnd: () => stop(false),
  });
  const countTicks = () => (data.meter[1] === 8 ? data.meter[0] / 3 : data.meter[0]) * tpb;

  function applyLoop() {
    seq.loop = st.loop ? { start: tab.bars[st.a].start, end: tab.bars[st.b].start + tab.bars[st.b].len } : null;
  }

  function start() {
    claim(api);
    audio();
    applyLoop();
    if (st.from < 0 || st.from >= tab.total) st.from = 0;
    if (st.loop && (st.from < seq.loop.start || st.from >= seq.loop.end)) st.from = seq.loop.start;
    st.playing = true;
    st.counting = st.count;
    st.countShow = st.count;
    play.setPlaying(true);
    seq.start(st.count ? st.from - countTicks() : st.from);
  }

  function stop(silence = true) {
    if (!st.playing) return;
    st.playing = false;
    seq.stop(!silence);
    if (silence) hush();
    play.setPlaying(false);
    status.textContent = '';
    st.from = curEv >= 0 ? tab.events[curEv].t : 0;
    if (!silence) st.from = 0;
    release(api);
  }

  function step(d) {
    if (st.playing) stop();
    select(api);
    const i = Math.max(0, Math.min(tab.events.length - 1, (st.pos < 0 ? -1 : st.pos) + d));
    st.pos = i;
    st.from = tab.events[i].t;
    playEvent(tab.events[i], audio().currentTime + 0.01);
    mark(i, false);
    status.textContent = `Нота ${i + 1} из ${tab.events.length}`;
  }

  function pick(i) {
    st.pos = i;
    st.from = tab.events[i].t;
    if (st.playing) {
      stop();
      start();
    } else {
      select(api);
      playEvent(tab.events[i], audio().currentTime + 0.01);
      mark(i, false);
      status.textContent = 'Начнём отсюда — нажмите «Играть»';
    }
  }

  const api = {
    title: data.title || 'Таб',
    sub: data.sub || 'Таб',
    slug: data.slug || data.title || 'tab',
    el: root,
    stop: () => stop(),
    resume: () => start(),
    prev: () => step(-1),
    next: () => step(1),
    progress: () => {
      const a = st.loop && seq.loop ? seq.loop.start : 0;
      const b = st.loop && seq.loop ? seq.loop.end : tab.total;
      return Math.max(0, Math.min(1, ((st.lastT ?? a) - a) / Math.max(1, b - a)));
    },
  };
  root.addEventListener('keydown', (e) => {
    if (e.target.closest('select, input')) return;
    if (e.key === ' ') {
      e.preventDefault();
      st.playing ? stop() : start();
    } else if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'ArrowLeft') step(-1);
  });

  render();
  if ('ResizeObserver' in window) new ResizeObserver(() => render()).observe(view);
}

