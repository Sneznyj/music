// Страница песни: вкладки (аккорды, текст, разбор, табы, вокал), уровни перебора, язык видеоразборов.
import { store } from './util.js';

export function init() {
  const nav = document.querySelector('.song-tabs');
  if (!nav) return;
  const links = [...nav.querySelectorAll('[data-tab]')];
  const panels = [...document.querySelectorAll('[data-panel]')];
  const ids = links.map((a) => a.dataset.tab);

  const show = (id, scroll = false) => {
    if (!ids.includes(id)) id = ids[0];
    links.forEach((a) => a.setAttribute('aria-selected', String(a.dataset.tab === id)));
    panels.forEach((p) => (p.hidden = p.dataset.panel !== id));
    document.body.dataset.songTab = id;
    // блоки на скрытых вкладках меряют себя заново, когда их показали
    dispatchEvent(new Event('resize'));
    dispatchEvent(new CustomEvent('song:tab', { detail: id }));
    if (scroll) nav.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };
  links.forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      history.replaceState(null, '', '#' + a.dataset.tab);
      show(a.dataset.tab, nav.getBoundingClientRect().top < 0);
    }),
  );
  // ссылки на #tabs и т. п. внутри страницы (кнопки риффов, шаги разбора)
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || a.closest('.song-tabs')) return;
    const id = a.getAttribute('href').slice(1);
    if (ids.includes(id)) {
      e.preventDefault();
      history.replaceState(null, '', '#' + id);
      show(id, true);
    }
  });
  addEventListener('hashchange', () => show(location.hash.slice(1)));
  // «Играть вместе» в шапке работает на вкладке аккордов
  document.querySelector('.playalong-go')?.addEventListener('click', () => show('chords'), true);
  show(location.hash.slice(1) || ids[0]);

  // обычный / продвинутый перебор
  document.querySelectorAll('.variants').forEach((box) => {
    const btns = [...box.querySelectorAll('.seg button')];
    const vars = [...box.querySelectorAll('.var')];
    const pick = (v) => {
      btns.forEach((b) => {
        b.classList.toggle('on', b.dataset.v === v);
        b.setAttribute('aria-selected', String(b.dataset.v === v));
      });
      vars.forEach((x) => (x.hidden = x.dataset.v !== v));
      store.set('arrLevel', v);
      dispatchEvent(new Event('resize'));
    };
    btns.forEach((b) => b.addEventListener('click', () => pick(b.dataset.v)));
    pick(store.get('arrLevel', '0'));
  });

  // язык видеоразборов
  const langBtns = [...document.querySelectorAll('.vid-lang button')];
  const vids = [...document.querySelectorAll('.vids')];
  const lang = (l, save = true) => {
    if (!vids.some((v) => v.dataset.lang === l)) return;
    langBtns.forEach((b) => b.classList.toggle('on', b.dataset.lang === l));
    vids.forEach((v) => (v.hidden = v.dataset.lang !== l));
    if (save) store.set('vidLang', l);
  };
  langBtns.forEach((b) => b.addEventListener('click', () => lang(b.dataset.lang)));
  const saved = store.get('vidLang', langBtns[0]?.dataset.lang);
  lang(saved === 'vk' && document.body.dataset.vsrc !== 'vk' ? langBtns[0]?.dataset.lang : saved, false);
  // смотрим VK (YouTube не открывается или так выбрали) — разборы тоже с VK
  addEventListener('vsrc:change', (e) => {
    if (e.detail === 'vk') lang('vk', false);
    else if (vids.find((v) => !v.hidden)?.dataset.lang === 'vk') lang(langBtns[0]?.dataset.lang, false);
  });
  if (document.body.dataset.vsrc === 'vk') lang('vk', false);
}
