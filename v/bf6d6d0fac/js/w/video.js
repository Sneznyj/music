// Видео на страницах: сначала превью, плеер встаёт на его место по нажатию.
// Источник — YouTube или VK Видео (запасной для России). Выбор человека помнится; пока он не выбрал сам,
// сайт проверяет, открывается ли YouTube, и если нет — показывает ролики VK.
// Пока видео играет, остальные плееры сайта молчат (и наоборот).
import { claim, release, store } from './util.js';

export function init() {
  setSource(store.get('vsrc', null) || 'yt', false);
  if (!store.get('vsrc', null) && document.querySelector('.src-vk, .vids[data-lang="vk"]')) probeYouTube();

  document.addEventListener('click', (e) => {
    const sw = e.target.closest('.vsrc [data-vsrc]');
    if (sw) {
      setSource(sw.dataset.vsrc, true);
      return;
    }
    const btn = e.target.closest('.yt-btn');
    if (btn) play(btn);
  });
}

function setSource(src, chosen) {
  document.body.dataset.vsrc = src;
  document.querySelectorAll('.vsrc [data-vsrc]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.vsrc === src)));
  if (chosen) store.set('vsrc', src);
  dispatchEvent(new CustomEvent('vsrc:change', { detail: src }));
}

// YouTube открывается, если за 4 секунды загрузилась его картинка
function probeYouTube() {
  const id = document.querySelector('[data-yt]')?.dataset.yt || 'dQw4w9WgXcQ';
  const img = new Image();
  let done = false;
  const fail = () => {
    if (done) return;
    done = true;
    if (!store.get('vsrc', null)) setSource('vk', false);
  };
  const t = setTimeout(fail, 4000);
  img.onload = () => {
    done = true;
    clearTimeout(t);
  };
  img.onerror = () => {
    clearTimeout(t);
    fail();
  };
  img.referrerPolicy = 'no-referrer';
  img.src = `https://i.ytimg.com/vi/${id}/default.jpg?probe=${Date.now()}`;
}

function play(btn) {
  const fig = btn.closest('.yt');
  const frame = document.createElement('iframe');
  frame.src = btn.dataset.vk ? `https://vkvideo.ru/video_ext.php?${btn.dataset.vk}&hd=2&autoplay=1` : `https://www.youtube-nocookie.com/embed/${btn.dataset.yt}?autoplay=1&rel=0&playsinline=1`;
  frame.title = btn.dataset.title || 'Видео';
  frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen; screen-wake-lock';
  frame.allowFullscreen = true;
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  const box = document.createElement('div');
  box.className = 'yt-frame';
  box.append(frame);
  btn.replaceWith(box);
  fig.classList.add('playing');
  const api = {
    title: btn.dataset.title || 'Видео',
    sub: btn.dataset.vk ? 'VK Видео' : 'YouTube',
    slug: document.querySelector('.song')?.dataset.slug || '',
    el: fig,
    // другой плеер начал играть — возвращаем превью (видео останавливается)
    stop() {
      if (box.isConnected) box.replaceWith(btn);
      fig.classList.remove('playing');
      release(api);
    },
    resume() {
      if (btn.isConnected) btn.click();
    },
    progress: () => 0,
    video: true,
  };
  claim(api);
}
