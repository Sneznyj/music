// Оригинал песни по кнопке «Играть» и ▶ на обложках: звучит сама запись — клип с YouTube, а если YouTube не открывается
// (или человек выбрал «VK Видео» у ролика) — с VK Видео. Управляется нижним плеером сайта: пауза, перемотка, время, ±10 с.
// MP3 чужих песен сайт не выкладывает (CLAUDE.md), поэтому звук берётся из встроенного плеера — и плеер всегда на виду,
// как требуют правила YouTube: на странице песни — в шапке на месте превью, а когда шапка уехала с экрана или песню
// включили с обложки — окном в углу над нижним плеером. Поверх видео ничего не кладём: заголовок и «закрыть» — над ним.
import { icon } from '../lib/icons.js';
import { claim, release, store } from './util.js';

const PLAY = icon('play', { fill: true });
const PAUSE = icon('pause', { fill: true });
const players = new Map();

// meta: { slug, title, artist, cover?, yt?: { id, sec }, vk?: { oid, vid, hash, sec } }; host — блок ролика в шапке песни
export function original(meta, host = null) {
  let p = players.get(meta.slug);
  if (!p) {
    p = make(meta, host);
    players.set(meta.slug, p);
  }
  return p;
}

// ---------- страница песни: «Играть» и превью клипа в шапке — один плеер ----------
export function init() {
  const dataEl = document.querySelector('.songsheet .sheet-data');
  if (!dataEl) return;
  const d = JSON.parse(dataEl.textContent);
  if (!d.orig) return;
  const host = document.querySelector('.album-video');
  const p = original({ slug: d.slug, title: d.title, artist: d.artist, ...d.orig }, host);
  const btn = document.querySelector('.song-play');
  if (btn) {
    const paint = () => {
      btn.innerHTML = `${p.playing ? PAUSE : PLAY}<span>${p.playing ? 'Пауза' : 'Играть'}</span>`;
      btn.classList.toggle('on', p.playing);
      btn.setAttribute('aria-label', p.playing ? 'Пауза' : 'Играть оригинал');
    };
    p.onChange(paint);
    paint();
    btn.addEventListener('click', () => (p.playing ? p.stop() : p.resume()));
  }
  // превью клипа в шапке запускает тот же плеер (раньше — отдельное видео без связи с нижним плеером)
  if (host)
    document.addEventListener(
      'click',
      (e) => {
        if (!e.target.closest('.album-video .yt-btn')) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        p.playing ? p.stop() : p.resume();
      },
      true,
    );
}

// ---------- плееры YouTube и VK Видео ----------
const script = (src) =>
  new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = resolve;
    s.onerror = reject;
    document.head.append(s);
  });

let ytLoad = null;
function loadYT() {
  ytLoad ??= new Promise((resolve, reject) => {
    if (window.YT?.Player) return resolve(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT);
    };
    script('https://www.youtube.com/iframe_api').catch(reject);
    setTimeout(() => reject(new Error('YouTube не отвечает')), 8000);
  }).catch((e) => {
    ytLoad = null;
    throw e;
  });
  return ytLoad;
}

// движок: play, pause, seek(сек), time(), duration(), destroy(); on.state('play' | 'pause' | 'end'), on.want() — играть ли сразу
async function ytEngine(slot, v, start, on) {
  const YT = await loadYT();
  const div = document.createElement('div');
  slot.replaceChildren(div);
  return new Promise((resolve, reject) => {
    let ready = false;
    const p = new YT.Player(div, {
      videoId: v.id,
      host: 'https://www.youtube-nocookie.com',
      width: '100%',
      height: '100%',
      playerVars: { autoplay: on.want() ? 1 : 0, playsinline: 1, rel: 0, start: Math.floor(start) },
      events: {
        onReady: () => {
          ready = true;
          if (on.want()) p.playVideo();
          resolve(eng);
        },
        // 1 — играет, 3 — грузится (тоже играет), 2 — пауза, 0 — конец
        onStateChange: (e) => on.state(e.data === 1 || e.data === 3 ? 'play' : e.data === 2 ? 'pause' : e.data === 0 ? 'end' : null),
        // 101 и 150 — владелец запретил встраивание: тогда пробуем VK
        onError: (e) => (ready ? on.error(e.data) : reject(new Error(`YouTube: ${e.data}`))),
      },
    });
    const eng = {
      play: () => p.playVideo(),
      pause: () => p.pauseVideo(),
      seek: (s) => p.seekTo(s, true),
      time: () => p.getCurrentTime?.() || 0,
      duration: () => p.getDuration?.() || v.sec || 0,
      destroy: () => p.destroy(),
    };
    setTimeout(() => !ready && reject(new Error('YouTube не загрузился')), 12000);
  });
}

let vkLoad = null;
const loadVK = () =>
  (vkLoad ??= window.VK?.VideoPlayer
    ? Promise.resolve()
    : script('https://vk.com/js/api/videoplayer.js').catch((e) => {
        vkLoad = null;
        throw e;
      }));

async function vkEngine(slot, v, start, on) {
  await loadVK();
  const f = document.createElement('iframe');
  f.src = `https://vkvideo.ru/video_ext.php?oid=${v.oid}&id=${v.vid}&hash=${v.hash}&hd=2&js_api=1${on.want() ? '&autoplay=1' : ''}`;
  f.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture; screen-wake-lock';
  f.allowFullscreen = true;
  f.title = 'VK Видео';
  slot.replaceChildren(f);
  await new Promise((resolve, reject) => {
    f.addEventListener('load', resolve, { once: true });
    setTimeout(() => reject(new Error('VK Видео не загрузилось')), 12000);
  });
  const p = window.VK.VideoPlayer(f);
  // время приходит событиями несколько раз в секунду — между ними досчитываем по часам
  let time = start;
  let at = performance.now();
  let live = false;
  p.on('inited', () => {
    if (start > 1) p.seek(start);
    if (on.want()) p.play();
  });
  const go = () => {
    live = true;
    at = performance.now();
    on.state('play');
  };
  p.on('started', go);
  p.on('resumed', go);
  p.on('paused', () => {
    live = false;
    on.state('pause');
  });
  p.on('ended', () => {
    live = false;
    on.state('end');
  });
  p.on('timeupdate', (s) => {
    time = s.time;
    at = performance.now();
  });
  p.on('error', () => on.error());
  return {
    play: () => p.play(),
    pause: () => p.pause(),
    seek: (s) => {
      p.seek(s);
      time = s;
      at = performance.now();
    },
    time: () => time + (live ? (performance.now() - at) / 1000 : 0),
    duration: () => p.getDuration() || v.sec || 0,
    destroy: () => {
      p.destroy();
      f.remove();
    },
  };
}

// ---------- один оригинал: окно с видео и проигрыватель для нижнего плеера ----------
function make(meta, host) {
  const box = document.createElement('div');
  box.className = 'orig-box';
  box.hidden = true;
  box.innerHTML = `<div class="orig-head"><span class="orig-t"></span><button type="button" class="orig-close" aria-label="Закрыть видео" title="Закрыть">${icon('x')}</button></div><div class="orig-frame"></div>`;
  const slot = box.querySelector('.orig-frame');
  const titleEl = box.querySelector('.orig-t');
  const name = `${meta.title} — ${meta.artist}`;
  titleEl.textContent = name;
  // подсказка не ложится на видео: в шапке — строкой под роликом, в окне в углу — вместо названия
  const hint = document.createElement('p');
  hint.className = 'orig-hint';
  hint.hidden = true;
  (host || document.body).append(box);
  if (host) {
    host.classList.add('orig-host');
    host.append(hint);
  } else box.classList.add('float');

  const listeners = new Set();
  let eng = null;
  let src = null;
  let loading = null;
  let want = false;
  let lastT = 0;
  const dur = () => eng?.duration() || (src === 'vk' ? meta.vk?.sec : meta.yt?.sec) || meta.yt?.sec || meta.vk?.sec || 0;
  const cur = () => (eng ? eng.time() : lastT);
  const notify = () => listeners.forEach((fn) => fn(api));
  const setPlaying = (on) => {
    if (api.playing === on) return;
    api.playing = on;
    on ? claim(api) : release(api);
    notify();
  };
  const say = (text) => {
    hint.hidden = !text || !host;
    hint.textContent = text || '';
    titleEl.textContent = text || name;
    titleEl.classList.toggle('warn', !!text);
  };

  // откуда играть: выбор человека у ролика (YouTube / VK Видео), без него — YouTube, не открылся — VK
  const order = () => {
    const pick = document.body.dataset.vsrc || store.get('vsrc', null) || 'yt';
    return (pick === 'vk' ? ['vk', 'yt'] : ['yt', 'vk']).filter((s) => meta[s]);
  };
  let heard = false;
  const on = {
    want: () => want,
    state(s) {
      if (s === 'play') {
        heard = true;
        say('');
        want = true;
        setPlaying(true);
      } else if (s === 'pause') {
        want = false;
        setPlaying(false);
      } else if (s === 'end') {
        want = false;
        lastT = 0;
        setPlaying(false);
      }
    },
    // видео не играет (запрещено встраивание, нет в стране) — пробуем другой источник
    error() {
      const other = order().find((s) => s !== src);
      if (other) start(lastT, [other]);
      else say('Видео не открылось. Попробуйте позже или откройте клип на YouTube.');
    },
  };
  async function start(from = 0, list = order()) {
    eng?.destroy();
    eng = null;
    heard = false;
    for (const s of list) {
      try {
        say('');
        eng = await (s === 'yt' ? ytEngine : vkEngine)(slot, meta[s], from, on);
        src = s;
        break;
      } catch {
        eng = null;
      }
    }
    if (!eng) {
      want = false;
      setPlaying(false);
      say('Видео не открылось: похоже, YouTube и VK Видео недоступны.');
      return;
    }
    // браузер может не дать звуку начаться сам (так бывает на iPhone) — тогда кнопки снова «играть»,
    // а на видео подсказка: достаточно нажать ▶ на самом видео, дальше всё управляется как обычно
    const mine = eng;
    setTimeout(() => {
      if (eng !== mine || heard || !want) return;
      want = false;
      setPlaying(false);
      say('Нажмите ▶ на видео — браузер не дал звуку начаться сам.');
    }, 3500);
  }
  const load = (from) => (loading ??= start(from).finally(() => (loading = null)));

  // шапка уехала с экрана — видео переезжает в угол (без перезагрузки: меняется только положение окна)
  let away = false;
  const place = () => box.classList.toggle('float', !host || (away && !box.hidden));
  if (host && 'IntersectionObserver' in window) new IntersectionObserver(([e]) => ((away = !e.isIntersecting), place()), { threshold: 0.2 }).observe(host);

  // другой источник у ролика выбран, пока играет, — продолжаем там же с того же места
  addEventListener('vsrc:change', (e) => {
    if (!eng || e.detail === src || !meta[e.detail]) return;
    lastT = cur();
    start(lastT, [e.detail, src]);
  });

  box.querySelector('.orig-close').addEventListener('click', () => {
    api.stop();
    lastT = cur();
    eng?.destroy();
    eng = null;
    box.hidden = true;
    place();
  });

  const api = {
    title: meta.title,
    sub: `${meta.artist} · оригинал`,
    slug: meta.slug,
    href: `/songs/${meta.slug}/`,
    cover: meta.cover,
    el: host,
    playing: false,
    original: true,
    progress: () => {
      const d = dur();
      return d ? Math.max(0, Math.min(1, cur() / d)) : 0;
    },
    duration: dur,
    seek(p) {
      lastT = p * dur();
      eng?.seek(lastT);
    },
    prev: () => api.seek(Math.max(0, cur() - 10) / (dur() || 1)),
    next: () => api.seek(Math.min(dur(), cur() + 10) / (dur() || 1)),
    stop() {
      want = false;
      eng?.pause();
      setPlaying(false);
    },
    resume() {
      want = true;
      box.hidden = false;
      place();
      setPlaying(true);
      if (eng) eng.play();
      else load(lastT);
    },
    onChange: (fn) => listeners.add(fn),
  };
  return api;
}
