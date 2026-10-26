// Видео YouTube на страницах: сначала превью, плеер встаёт на его место по нажатию.
// Пока видео играет, остальные плееры сайта молчат (и наоборот).
import { claim, release } from './util.js';

export function init() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.yt-btn');
    if (!btn) return;
    const fig = btn.closest('.yt');
    const id = btn.dataset.yt;
    const frame = document.createElement('iframe');
    frame.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1`;
    frame.title = btn.dataset.title || 'Видео';
    frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    frame.allowFullscreen = true;
    frame.loading = 'lazy';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    const box = document.createElement('div');
    box.className = 'yt-frame';
    box.append(frame);
    btn.replaceWith(box);
    fig.classList.add('playing');
    const api = {
      title: btn.dataset.title || 'Видео',
      sub: 'YouTube',
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
  });
}
