// Вкладка «Текст и аккорды»: аккорды над словами (или по строкам), шрифт крупнее/мельче, автопрокрутка с
// регулируемой скоростью, тональность и каподастр (общие со вкладкой «Аккорды»), схемы аккордов выбранного
// инструмента и «Свой текст» — его человек вставляет сам, хранится только в его браузере. На привязанных
// устройствах Павла (ключ из ссылки #mytexts=…) текст ещё и уходит в «Мои тексты» (worker/mytexts) и виден везде.
import { instChordCard } from '../lib/cards.js';
import { hasChords, placeChords, textHTML } from '../lib/chordpro.js';
import { icon } from '../lib/icons.js';
import { voicingFor } from '../lib/instruments.js';
import * as T from '../lib/theory.js';
import { store } from './util.js';

export function init() {
  const root = document.querySelector('.songbook');
  if (root) setup(root);
}

function setup(root) {
  const slug = root.dataset.slug;
  const data = JSON.parse(document.querySelector('.sheet-data')?.textContent || '{}');
  const body = root.querySelector('.sb-body');
  const ownView = root.querySelector('.sb-own-view');
  const diag = root.querySelector('.sb-diagrams');
  let key = window.__songKey || { shift: 0, flats: false, capo: data.capo || 0, key: data.key, inst: 'guitar', fretted: true };

  // ---------- шрифт ----------
  let size = store.get('sbSize', 20);
  const applySize = () => root.style.setProperty('--sb-size', `${size}px`);
  applySize();

  // ---------- аккорды под тональность ----------
  const nameOf = (orig) => (key.shift ? T.transposeChord(orig, key.shift, key.flats) : orig);
  const voicingOf = (orig) => {
    if (key.inst !== 'guitar') return voicingFor(key.inst, nameOf(orig));
    if (!key.shift && data.shapes?.[orig]) {
      const [f, fi] = data.shapes[orig].split(' ');
      return T.voicingFromString(f, fi);
    }
    return T.voicings(nameOf(orig))[0] || null;
  };
  const paint = () => {
    root.querySelectorAll('.sb-c[data-c]').forEach((b) => (b.textContent = nameOf(b.dataset.c)));
    root.querySelector('.sb-key').textContent = key.key;
    root.querySelector('.sb-capo').textContent = String(key.capoSet ?? key.capo);
    root.querySelector('.sb-capo-g').hidden = !key.fretted;
    const names = [...new Set([...root.querySelectorAll('.sb-c[data-c]')].filter((b) => !b.closest('.sb-body[hidden], .sb-own-view[hidden]')).map((b) => b.dataset.c))];
    diag.innerHTML = names.map((o) => instChordCard(key.inst, nameOf(o), voicingOf(o))).join('');
  };
  addEventListener('song:key', (e) => {
    key = e.detail;
    paint();
  });
  root.querySelector('.sb-ctl').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.zoom) {
      size = Math.max(13, Math.min(40, size + Number(b.dataset.zoom) * 2));
      store.set('sbSize', size);
      applySize();
    } else if (b.dataset.sbtr) dispatchEvent(new CustomEvent('song:set', { detail: { tr: Number(b.dataset.sbtr) } }));
    else if (b.dataset.sbcapo) dispatchEvent(new CustomEvent('song:set', { detail: { capo: Number(b.dataset.sbcapo) } }));
    else if (b.dataset.speed) setSpeed(speed + Number(b.dataset.speed));
    else if (b.classList.contains('sb-scroll')) (scrolling ? stopScroll() : startScroll());
    else if (b.classList.contains('sb-full')) full();
  });

  // ---------- автопрокрутка ----------
  // скорость 1…10: от очень медленной баллады до быстрой песни; пиксели в секунду растут с размером шрифта
  let speed = store.get('sbSpeed', 3);
  let scrolling = false;
  let raf = 0;
  let last = 0;
  let acc = 0;
  const scrollBtn = root.querySelector('.sb-scroll');
  const speedOut = root.querySelector('.sb-speed');
  const setSpeed = (v) => {
    speed = Math.max(1, Math.min(10, v));
    speedOut.textContent = String(speed);
    store.set('sbSpeed', speed);
  };
  setSpeed(speed);
  const scroller = () => (document.fullscreenElement === root ? root : document.scrollingElement);
  const step = (t) => {
    if (!scrolling) return;
    const dt = last ? Math.min(0.1, (t - last) / 1000) : 0;
    last = t;
    acc += dt * speed * size * 0.42;
    const px = Math.floor(acc);
    if (px >= 1) {
      acc -= px;
      const el = scroller();
      const before = el.scrollTop;
      el.scrollTop = before + px;
      const end = body.getBoundingClientRect().bottom < innerHeight - 40 && document.fullscreenElement !== root;
      if (el.scrollTop === before || end) return stopScroll();
    }
    raf = requestAnimationFrame(step);
  };
  function startScroll() {
    scrolling = true;
    last = 0;
    acc = 0;
    scrollBtn.innerHTML = `${icon('pause', { fill: true })}<span>Стоп</span>`;
    scrollBtn.classList.add('on');
    if (root.getBoundingClientRect().top > innerHeight * 0.3 && document.fullscreenElement !== root) root.scrollIntoView({ block: 'start' });
    raf = requestAnimationFrame(step);
  }
  function stopScroll() {
    scrolling = false;
    cancelAnimationFrame(raf);
    scrollBtn.innerHTML = `${icon('play', { fill: true })}<span>Прокрутка</span>`;
    scrollBtn.classList.remove('on');
  }
  addEventListener('song:tab', (e) => e.detail !== 'text' && stopScroll());
  addEventListener('keydown', (e) => {
    if (root.closest('[hidden]') || /input|textarea/i.test(e.target.tagName)) return;
    if (e.key === ' ' && document.fullscreenElement === root) {
      e.preventDefault();
      scrolling ? stopScroll() : startScroll();
    }
  });

  // ---------- на весь экран ----------
  const fullBtn = root.querySelector('.sb-full');
  function full() {
    if (document.fullscreenElement === root) document.exitFullscreen?.();
    else if (root.requestFullscreen) root.requestFullscreen().catch(() => root.classList.toggle('sb-max'));
    else root.classList.toggle('sb-max');
  }
  document.addEventListener('fullscreenchange', () => (fullBtn.textContent = document.fullscreenElement === root ? 'Свернуть' : 'На весь экран'));

  // ---------- свой текст ----------
  const own = root.querySelector('.sb-own');
  if (own) {
    const input = own.querySelector('.sb-own-in');
    const keyName = 'text.' + slug;
    const dirtyName = 'textDirty.' + slug;
    const cloud = myTexts(slug);
    let sync = '';
    const show = (text) => {
      const has = !!text.trim();
      const note = sync ? `<span class="sb-sync${sync === 'off' ? ' off' : ''}">${SYNC[sync]}</span>` : '';
      ownView.innerHTML = has ? `<div class="sb-h">Ваш текст${note}</div>${textHTML(text)}` : '';
      ownView.hidden = !has;
      body.hidden = has;
      own.querySelector('.sb-own-del').hidden = !has;
      paint();
    };
    const setSync = (s) => {
      sync = s;
      show(input.value);
    };
    // в «Мои тексты»: не вышло (нет сети) — помним и отправим при следующем открытии песни
    const push = (text) => {
      if (!cloud) return;
      store.set(dirtyName, true);
      setSync('saving');
      cloud
        .put(text)
        .then(() => {
          store.set(dirtyName, false);
          setSync('ok');
        })
        .catch(() => setSync('off'));
    };
    const saved = store.get(keyName, '');
    input.value = saved;
    show(saved);
    if (saved) own.open = false;
    if (cloud) {
      own.querySelector('.sb-own-where').textContent = 'Текст сохраняется в ваших «Моих текстах» и виден на всех ваших устройствах';
      if (store.get(dirtyName, false)) push(input.value); // прошлая правка не дошла — отправляем её
      else
        cloud
          .get()
          .then((r) => {
            if (r.text && r.text !== input.value) {
              // поменяли на другом устройстве — берём оттуда
              store.set(keyName, r.text);
              input.value = r.text;
              own.open = false;
              setSync('ok');
            } else if (!r.text && input.value.trim()) push(input.value); // вставили до привязки устройства
            else if (r.text) setSync('ok');
          })
          .catch(() => setSync('off'));
    }
    const hint = own.querySelector('.sb-own-hint');
    const save = () => {
      // вставили только слова — расставляем аккорды песни по частям (примерно; можно поправить в тексте)
      if (input.value.trim() && !hasChords(input.value)) {
        const blocks = [];
        for (const sec of data.sections) for (let r = 0; r < (sec.repeat || 1); r++) blocks.push({ name: sec.name, bars: sec.bars.map((b) => b.map((c) => c.name)) });
        input.value = placeChords(input.value, blocks);
        if (hint) hint.hidden = false;
      }
      store.set(keyName, input.value);
      show(input.value);
      push(input.value);
      own.open = false;
      ownView.scrollIntoView({ block: 'start', behavior: 'smooth' });
    };
    own.querySelector('.sb-own-save').addEventListener('click', save);
    // «Вставить из буфера»: скопировали слова на другом сайте — одно нажатие, и они уже с аккордами
    const pasteBtn = own.querySelector('.sb-own-paste');
    if (pasteBtn && navigator.clipboard?.readText) {
      pasteBtn.hidden = false;
      pasteBtn.addEventListener('click', async () => {
        try {
          const text = await navigator.clipboard.readText();
          if (!text.trim()) return input.focus();
          input.value = text;
          save();
        } catch {
          input.focus();
        }
      });
    }
    own.querySelector('.sb-own-del').addEventListener('click', () => {
      store.set(keyName, '');
      input.value = '';
      show('');
      push('');
    });
  }
  paint();
}

const SYNC = {
  saving: ' · сохраняю в «Мои тексты»…',
  ok: ' · в «Моих текстах», виден на всех ваших устройствах',
  off: ' · нет связи с «Моими текстами», сохранён только здесь',
};

// личное хранилище слов песен; есть только на устройствах, привязанных ссылкой #mytexts=…
function myTexts(slug) {
  const key = store.get('mytexts', '');
  if (!key) return null;
  const url = `https://mytexts.sneznyj.com/texts/${slug}`;
  const call = async (opts = {}) => {
    const r = await fetch(url, { ...opts, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } });
    if (!r.ok) throw new Error(`mytexts ${r.status}`);
    return r.json();
  };
  return { get: () => call(), put: (text) => call({ method: 'PUT', body: JSON.stringify({ text }) }) };
}
