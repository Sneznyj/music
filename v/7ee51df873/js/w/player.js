// «Приложение»: нижний плеер, кнопки ▶ у риффов, недавние и мои песни, кнопки «назад/вперёд».
import { Seq, audio, hush } from '../audio.js';
import { icon } from '../lib/icons.js';
import { parseTab } from '../lib/tab.js';
import { claim, nowPlaying, playTabEvent, release, store, touchNowPlaying } from './util.js';

const PLAY = icon('play', { fill: true });
const PAUSE = icon('pause', { fill: true });
// обложка: альбом, фото или кадр клипа (адрес — в data/songs.json)
const img = (src) => `<img src="${src || '/img/vinyl-s.webp'}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`;

export function init() {
  history_();
  bar();
  riffButtons();
  recent();
  panels();
  myPage();
  sideProgress();
}

function history_() {
  document.querySelectorAll('[data-hist]').forEach((b) => b.addEventListener('click', () => history.go(Number(b.dataset.hist))));
}

// ---------- нижний плеер ----------
function bar() {
  const box = document.querySelector('.player');
  if (!box) return;
  const cover = box.querySelector('.pl-cover');
  const title = box.querySelector('.pl-title');
  const sub = box.querySelector('.pl-sub');
  const toggle = box.querySelector('.pl-toggle');
  const prog = box.querySelector('.pl-bar i');
  const prev = box.querySelector('.pl-prev');
  const next = box.querySelector('.pl-next');
  const open = box.querySelector('.pl-open');
  const startBtn = box.querySelector('.pl-start');
  const barEl = box.querySelector('.pl-bar');
  const cur = box.querySelector('.pl-cur');
  const all = box.querySelector('.pl-all');
  let shownSlug = null;
  let raf = 0;
  let drag = null;
  const fmt = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
  // полоска и цифры: у проигрывателя с seek() её можно тащить, duration() — длина в секундах
  const showAt = (p) => {
    prog.style.width = `${(p * 100).toFixed(2)}%`;
    const d = nowPlaying().current?.duration?.() || 0;
    cur.hidden = all.hidden = !d;
    if (d) {
      cur.textContent = fmt(p * d);
      all.textContent = fmt(d);
    }
  };

  const paint = () => {
    const { current, playing } = nowPlaying();
    if (!current) return;
    box.hidden = false;
    document.body.classList.add('has-player');
    title.textContent = current.title;
    sub.textContent = current.sub || '';
    if (shownSlug !== current.slug) {
      shownSlug = current.slug;
      cover.innerHTML = img(current.cover);
      if (!current.cover && current.slug) songs().then((m) => m.get(current.slug)?.cover && shownSlug === current.slug && (cover.innerHTML = img(m.get(current.slug).cover)));
    }
    toggle.innerHTML = playing ? PAUSE : PLAY;
    toggle.setAttribute('aria-label', playing ? 'Пауза' : 'Играть');
    prev.disabled = !current.prev;
    next.disabled = !current.next;
    startBtn.hidden = !current.seek;
    barEl.classList.toggle('can-seek', !!current.seek);
    cancelAnimationFrame(raf);
    const loop = () => {
      if (!drag) showAt(current.progress ? current.progress() : 0);
      if (nowPlaying().playing) raf = requestAnimationFrame(loop);
    };
    loop();
  };
  addEventListener('np:change', paint);
  const seekTo = (p) => {
    nowPlaying().current?.seek?.(Math.max(0, Math.min(1, p)));
    paint();
  };
  startBtn.addEventListener('click', () => seekTo(0));
  const barAt = (e) => {
    const r = barEl.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  };
  barEl.addEventListener('pointerdown', (e) => {
    if (!nowPlaying().current?.seek) return;
    e.preventDefault();
    barEl.setPointerCapture(e.pointerId);
    drag = { p: barAt(e) };
    showAt(drag.p);
  });
  barEl.addEventListener('pointermove', (e) => {
    if (!drag) return;
    drag.p = barAt(e);
    showAt(drag.p);
  });
  const endDrag = () => {
    if (!drag) return;
    const { p } = drag;
    drag = null;
    seekTo(p);
  };
  barEl.addEventListener('pointerup', endDrag);
  barEl.addEventListener('pointercancel', () => (drag = null));
  barEl.addEventListener('keydown', (e) => {
    const c = nowPlaying().current;
    if (!c?.seek || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    seekTo((c.progress?.() || 0) + (e.key === 'ArrowLeft' ? -0.05 : 0.05));
  });
  toggle.addEventListener('click', () => {
    const { current, playing } = nowPlaying();
    if (!current) return;
    if (playing) current.stop();
    else current.resume?.();
  });
  prev.addEventListener('click', () => nowPlaying().current?.prev?.());
  next.addEventListener('click', () => nowPlaying().current?.next?.());
  open.addEventListener('click', () => {
    const c = nowPlaying().current;
    if (!c) return;
    if (c.el && document.contains(c.el) && !c.el.classList.contains('riff-play')) c.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    else if (c.href) location.href = c.href;
  });
  addEventListener('keydown', (e) => {
    if (e.key !== ' ' || e.target.closest('input, select, textarea, button, a, .tabplayer, .drill') || document.querySelector('.metronome-big')) return;
    const { current, playing } = nowPlaying();
    if (!current) return;
    e.preventDefault();
    playing ? current.stop() : current.resume?.();
  });
}

// ---------- кнопки ▶ у риффов (играют без таба на странице) ----------
function riffButtons() {
  const players = new Map();
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.riff-play');
    if (!b) return;
    e.preventDefault();
    let p = players.get(b);
    if (!p) {
      p = makeRiff(b);
      players.set(b, p);
    }
    p.playing ? p.stop() : p.resume();
  });
}

function makeRiff(btn) {
  const data = JSON.parse(document.getElementById(btn.dataset.riff).textContent);
  const tab = parseTab(data.tab, { grid: data.grid, meter: data.meter });
  const evAt = new Map(tab.events.map((e, i) => [e.t, i]));
  const tpb = data.meter[1] === 8 ? data.grid * 3 : data.grid;
  const label = btn.querySelector('span');
  const icon = () => btn.querySelector('svg');
  let lastT = 0;
  const api = {
    title: data.title,
    sub: data.sub,
    slug: data.slug,
    href: data.href,
    el: btn,
    playing: false,
    progress: () => lastT / tab.total,
    duration: () => tab.total * seq.tickDur(),
    seek(p) {
      lastT = Math.floor(p * tab.total);
      if (api.playing) seq.start(lastT);
    },
    stop() {
      if (!api.playing) return;
      api.playing = false;
      seq.stop();
      hush();
      paint();
      release(api);
    },
    resume() {
      claim(api);
      audio();
      api.playing = true;
      paint();
      seq.start(lastT > 0 && lastT < tab.total - 1 ? lastT : 0);
    },
  };
  const paint = () => {
    btn.classList.toggle('on', api.playing);
    icon().outerHTML = api.playing ? PAUSE : PLAY;
    if (label) label.textContent = api.playing ? 'Пауза' : 'Слушать рифф';
  };
  const seq = new Seq({
    total: tab.total,
    ticksPerBeat: tpb,
    bpm: () => data.bpm,
    onTick: (t, time) => {
      const i = evAt.get(t);
      if (i != null) playTabEvent(tab.events[i], time, 0.85, 'guitar', { shift: data.capo || 0 });
    },
    onVisual: (t) => {
      lastT = t;
    },
    onEnd: () => {
      api.playing = false;
      lastT = 0;
      paint();
      release(api);
      touchNowPlaying();
    },
  });
  return api;
}

// ---------- недавние ----------
function recent() {
  const song = document.querySelector('.song[data-slug]');
  if (!song) return;
  const slug = song.dataset.slug;
  const list = store.get('recent', []).filter((x) => x.slug !== slug);
  list.unshift({ slug, t: Date.now() });
  store.set('recent', list.slice(0, 16));
}

let songsPromise = null;
function songs() {
  songsPromise ??= fetch('/data/songs.json')
    .then((r) => r.json())
    .then((arr) => new Map(arr.map((s) => [s.slug, s])))
    .catch(() => new Map());
  return songsPromise;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function ago(t) {
  const d = Math.floor((Date.now() - t) / 86400000);
  if (d <= 0) return 'сегодня';
  if (d === 1) return 'вчера';
  return new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function miniItem(s, right = '') {
  return `<li><a href="/songs/${s.slug}/"><span class="mini-cover">${img(s.cover)}</span><span class="mini-t"><b>${esc(s.title)}</b><span>${esc(s.artist)}${right ? ' · ' + right : ''}</span></span></a></li>`;
}

function coverCard(s) {
  return `<a class="cover-card" href="/songs/${s.slug}/"><span class="cc-art">${img(s.cover)}<span class="cc-play">${PLAY}</span></span><span class="cc-title">${esc(s.title)}</span><span class="cc-sub">${esc(s.artist)}</span></a>`;
}

// ---------- панель справа на главной ----------
async function panels() {
  const side = document.querySelector('.home-side');
  if (!side) return;
  side.querySelectorAll('.ptab').forEach((t) =>
    t.addEventListener('click', () => {
      side.querySelectorAll('.ptab').forEach((x) => x.classList.toggle('on', x === t));
      side.querySelectorAll('.ptab-body').forEach((b) => (b.hidden = b.dataset.pb !== t.dataset.pt));
    }),
  );
  const map = await songs();
  const fav = store.get('fav', []).map((s) => map.get(s)).filter(Boolean);
  const rec = store.get('recent', []).map((r) => ({ ...map.get(r.slug), t: r.t })).filter((s) => s.slug);
  const fill = (key, items, right) => {
    const body = side.querySelector(`[data-pb="${key}"]`);
    if (!items.length) return;
    body.querySelector('.ptab-empty').hidden = true;
    body.querySelector('.mini-list').innerHTML = items.slice(0, 6).map((s) => miniItem(s, right(s))).join('');
  };
  fill('fav', fav, (s) => s.chords.slice(0, 3).join(' '));
  fill('recent', rec, (s) => ago(s.t));
  if (!fav.length && rec.length) side.querySelector('[data-pt="recent"]').click();
  const last = rec[0];
  if (last) {
    const card = side.querySelector('.now-card');
    card.querySelector('.now-link').href = `/songs/${last.slug}/`;
    card.querySelector('.now-cover').innerHTML = img(last.cover);
    card.querySelector('.now-t').innerHTML = `<b>${esc(last.title)}</b><span>${esc(last.artist)} · ${ago(last.t)}</span>`;
    card.querySelector('.now-open').href = `/songs/${last.slug}/`;
    card.querySelector('.now-go').href = `/songs/${last.slug}/#chords`;
  }
}

// ---------- страница «Мои песни» ----------
async function myPage() {
  const page = document.querySelector('.my-page');
  if (!page) return;
  const map = await songs();
  const fav = store.get('fav', []).map((s) => map.get(s)).filter(Boolean);
  const rec = store.get('recent', []).map((r) => map.get(r.slug)).filter(Boolean);
  page.querySelector('.my-fav').innerHTML = fav.map(coverCard).join('');
  page.querySelector('.my-fav-empty').hidden = fav.length > 0;
  page.querySelector('.my-recent').innerHTML = rec.map(coverCard).join('');
  page.querySelector('.my-recent-empty').hidden = rec.length > 0;
}

// ---------- прогресс школы в меню ----------
function sideProgress() {
  const card = document.querySelector('.side-card');
  if (!card) return;
  const done = store.get('done', []).length;
  const total = Number(card.dataset.total) || 13;
  if (!done) return;
  card.querySelector('.side-prog i').style.width = `${Math.min(100, (done / total) * 100)}%`;
  card.querySelector('.side-prog-t').textContent = `Пройдено ${done} из ${total}`;
}

