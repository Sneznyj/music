// Текст песни на вкладке «Текст и аккорды»: аккорды над словами, шрифт, автопрокрутка, на весь экран (кнопки — в общей
// панели вкладки, тональность и каподастр там же: их ведёт sheet.js и шлёт событие song:key).
// «Свой текст»: человек вставляет слова — с аккордами или без. Без аккордов сайт расставляет аккорды песни по частям
// (lib/chordpro.js placeChords); с аккордами с другого сайта — оставляет их и, если там другая тональность, перекладывает
// под страницу (fitKey). Потом аккорды правятся мышью или пальцем: перетащить на другой слог, взять новый из палитры,
// унести в корзину; по нажатию — меню (заменить, сдвинуть на букву, убрать); стрелки на клавиатуре двигают аккорд.
// Текст хранится только в браузере человека. На привязанных устройствах Павла (ключ из ссылки #mytexts=…) он ещё и
// уходит в «Мои тексты» (worker/mytexts) и виден везде.
import { instChordCard } from '../lib/cards.js';
import { cleanPasted, fitKey, hasChords, isChord, modelHTML, parseLines, placeChords, serialize, textHTML, transposeText } from '../lib/chordpro.js';
import { icon } from '../lib/icons.js';
import { voicingFor } from '../lib/instruments.js';
import * as T from '../lib/theory.js';
import { chordTip, el, store } from './util.js';

export function init() {
  const root = document.querySelector('.songbook');
  if (root) setup(root);
}

function setup(root) {
  const slug = root.dataset.slug;
  const panel = root.closest('[data-panel]') || root;
  const ctl = panel.querySelector('.keybar') || root;
  const data = JSON.parse(document.querySelector('.sheet-data')?.textContent || '{}');
  const ownView = root.querySelector('.sb-own-view');
  const hint = root.querySelector('.sb-own-hint');
  let key = window.__songKey || { shift: 0, flats: false, capo: data.capo || 0, key: data.key, inst: 'guitar', fretted: true };

  // «Играть вместе» прилипает под панелью тональности: ей нужна высота панели
  if (ctl !== root && 'ResizeObserver' in window) new ResizeObserver(() => panel.style.setProperty('--kb-h', `${ctl.offsetHeight}px`)).observe(ctl);

  // ---------- шрифт ----------
  let size = store.get('sbSize', 20);
  const applySize = () => panel.style.setProperty('--sb-size', `${size}px`);
  applySize();

  // ---------- аккорды под тональность ----------
  const nameOf = (orig) => (key.shift ? T.transposeChord(orig, key.shift, key.flats) : orig);
  // аккорд, набранный человеком в текущей тональности, — обратно в запись песни
  const origOf = (shown) => (key.shift ? T.transposeChord(shown, -key.shift, /b/.test(data.chords.join(' '))) : shown);
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
    root.querySelectorAll('[data-pc]').forEach((b) => (b.textContent = nameOf(b.dataset.pc)));
  };
  addEventListener('song:key', (e) => {
    key = e.detail;
    paint();
  });
  // схема аккорда над словами — при наведении (и по нажатию на телефоне); при правке нажатие открывает меню
  chordTip(root, '.sb-c[data-c]', (b) => (editing ? '' : instChordCard(key.inst, nameOf(b.dataset.c), voicingOf(b.dataset.c))));

  ctl.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.zoom) {
      size = Math.max(13, Math.min(40, size + Number(b.dataset.zoom) * 2));
      store.set('sbSize', size);
      applySize();
    } else if (b.dataset.speed) setSpeed(speed + Number(b.dataset.speed));
    else if (b.classList.contains('sb-scroll')) scrolling ? stopScroll() : startScroll();
    else if (b.classList.contains('sb-full')) full();
  });

  // ---------- автопрокрутка ----------
  // скорость 1…10: от очень медленной баллады до быстрой песни; пиксели в секунду растут с размером шрифта
  let speed = store.get('sbSpeed', 3);
  let scrolling = false;
  let raf = 0;
  let last = 0;
  let acc = 0;
  const scrollBtn = ctl.querySelector('.sb-scroll');
  const speedOut = ctl.querySelector('.sb-speed');
  const setSpeed = (v) => {
    speed = Math.max(1, Math.min(10, v));
    if (speedOut) speedOut.textContent = String(speed);
    store.set('sbSpeed', speed);
  };
  setSpeed(speed);
  const isFull = () => document.fullscreenElement === panel || panel.classList.contains('sb-max');
  const scroller = () => (isFull() ? panel : document.scrollingElement);
  const step = (t) => {
    if (!scrolling) return;
    const dt = last ? Math.min(0.1, (t - last) / 1000) : 0;
    last = t;
    acc += dt * speed * size * 0.42;
    const px = Math.floor(acc);
    if (px >= 1) {
      acc -= px;
      const s = scroller();
      const before = s.scrollTop;
      s.scrollTop = before + px;
      const end = !isFull() && panel.getBoundingClientRect().bottom < innerHeight - 40;
      if (s.scrollTop === before || end) return stopScroll();
    }
    raf = requestAnimationFrame(step);
  };
  function startScroll() {
    if (!scrollBtn) return;
    scrolling = true;
    last = 0;
    acc = 0;
    scrollBtn.innerHTML = `${icon('pause', { fill: true })}<span>Стоп</span>`;
    scrollBtn.classList.add('on');
    const target = ownView.hidden ? root : ownView;
    if (target.getBoundingClientRect().top > innerHeight * 0.3 && !isFull()) target.scrollIntoView({ block: 'start' });
    raf = requestAnimationFrame(step);
  }
  function stopScroll() {
    scrolling = false;
    cancelAnimationFrame(raf);
    if (!scrollBtn) return;
    scrollBtn.innerHTML = `${icon('play', { fill: true })}<span>Прокрутка</span>`;
    scrollBtn.classList.remove('on');
  }
  addEventListener('song:tab', (e) => e.detail !== 'chords' && stopScroll());
  addEventListener('keydown', (e) => {
    if (root.closest('[hidden]') || /input|textarea|select/i.test(e.target.tagName)) return;
    if (e.key === ' ' && isFull()) {
      e.preventDefault();
      scrolling ? stopScroll() : startScroll();
    }
  });

  // ---------- на весь экран: вся вкладка — панель, схемы, текст ----------
  const fullBtn = ctl.querySelector('.sb-full');
  function full() {
    if (document.fullscreenElement === panel) document.exitFullscreen?.();
    else if (panel.classList.contains('sb-max')) panel.classList.remove('sb-max');
    else if (panel.requestFullscreen) panel.requestFullscreen().catch(() => panel.classList.add('sb-max'));
    else panel.classList.add('sb-max');
    setTimeout(paintFull, 50);
  }
  const paintFull = () => fullBtn && (fullBtn.textContent = isFull() ? 'Свернуть' : 'На весь экран');
  document.addEventListener('fullscreenchange', paintFull);

  // ---------- свой текст ----------
  const own = root.querySelector('.sb-own');
  const editBtn = root.querySelector('.sb-edit');
  let editing = false;
  if (!own) return paint();

  const input = own.querySelector('.sb-own-in');
  const summary = own.querySelector('summary');
  const delBtn = own.querySelector('.sb-own-del');
  const keyName = 'text.' + slug;
  const dirtyName = 'textDirty.' + slug;
  const cloud = myTexts(slug);
  const flatsSong = data.chords.some((c) => /^[A-G]b/.test(c));
  let sync = '';
  let model = [];
  let history = [];
  let original = '';

  const say = (html) => {
    hint.innerHTML = html;
    hint.hidden = !html;
  };
  // keep — модель уже та, что на экране (правка аккордов): не разбираем текст заново, чтобы меню держало свой аккорд
  const show = (text, keep = false) => {
    const has = !!text.trim();
    if (!keep) model = has ? parseLines(text) : [];
    const note = sync ? `<span class="sb-sync${sync === 'off' ? ' off' : ''}">${SYNC[sync]}</span>` : '';
    ownView.innerHTML = has ? `${note ? `<div class="sb-h">Ваш текст${note}</div>` : ''}${editing ? modelHTML(model, { edit: true }) : textHTML(text)}` : '';
    ownView.hidden = !has;
    ownView.classList.toggle('sb-editing', editing && has);
    delBtn.hidden = !has;
    editBtn.hidden = !has;
    summary.textContent = has ? 'Изменить или заменить текст' : 'Вставить текст песни';
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
  const commit = (text, keep = false) => {
    input.value = text;
    store.set(keyName, text);
    show(text, keep);
    push(text);
  };
  const saved = store.get(keyName, '');
  input.value = saved;
  show(saved);
  if (saved) own.open = false;
  if (cloud) {
    own.querySelector('.sb-own-where').textContent = 'Текст сохраняется в ваших «Моих текстах» и виден на всех ваших устройствах.';
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

  // вставили слова: без аккордов — расставляем аккорды песни, с аккордами — подгоняем тональность под страницу
  const sections = () => data.sections.map((s) => ({ name: s.name, repeat: s.repeat, bars: s.bars }));
  function save() {
    let text = cleanPasted(input.value);
    original = '';
    if (!text) {
      commit('');
      say('');
      return;
    }
    if (hasChords(text)) {
      const fit = fitKey(text, data.chords);
      if (fit.shift) {
        original = text;
        text = transposeText(text, fit.shift, flatsSong);
        say(`Аккорды во вставленном тексте были в другой тональности — переложил их на ${Math.abs(fit.shift)} ${semis(Math.abs(fit.shift))} ${fit.shift > 0 ? 'выше' : 'ниже'}, чтобы они совпали с аккордами песни на этой странице. <button class="linkbtn sb-undo-fit" type="button">Вернуть как было</button>`);
      } else say('Аккорды из вставленного текста оставлены как есть. Любой можно перетащить или заменить: «Править аккорды».');
    } else {
      text = placeChords(text, sections(), { bpm: data.bpm, meter: data.meter });
      say('Аккорды расставлены по частям песни автоматически. Если где-то аккорд стоит не над тем слогом — нажмите «Править аккорды» и перетащите его.');
    }
    history = [];
    commit(text);
    own.open = false;
    ownView.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  hint.addEventListener('click', (e) => {
    if (!e.target.closest('.sb-undo-fit') || !original) return;
    commit(original);
    original = '';
    say('Вернул аккорды как во вставленном тексте.');
  });
  own.querySelector('.sb-own-save').addEventListener('click', save);
  // вставили в пустое поле — сразу показываем с аккордами
  input.addEventListener('paste', () => {
    if (input.value.trim()) return;
    setTimeout(save, 0);
  });
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
  delBtn.addEventListener('click', () => {
    setEditing(false);
    commit('');
    say('');
    own.open = true;
  });

  // ---------- правка аккордов ----------
  const bar = el('div', { class: 'sb-editbar', hidden: true });
  const palette = el('div', { class: 'sb-palette', role: 'list', 'aria-label': 'Аккорды песни' });
  const trash = el('div', { class: 'sb-trash', html: `${icon('trash-2')}<span>Сюда — убрать</span>` });
  const undoBtn = el('button', { type: 'button', class: 'btn btn-small btn-ghost', html: `${icon('undo-2')}<span>Отменить</span>` });
  const redoAuto = el('button', { type: 'button', class: 'btn btn-small btn-ghost' }, 'Расставить заново');
  const doneBtn = el('button', { type: 'button', class: 'btn btn-small' }, 'Готово');
  bar.append(
    el('div', { class: 'sb-eb-row' }, el('span', { class: 'kb-label' }, 'Тащите аккорд на нужный слог:'), palette, trash),
    el('div', { class: 'sb-eb-row' }, undoBtn, redoAuto, doneBtn, el('span', { class: 'muted small sb-eb-tip' }, 'Нажмите на аккорд — заменить или сдвинуть; стрелки ← → двигают его по буквам.')),
  );
  ownView.before(bar);
  palette.innerHTML = data.chords.map((c) => `<button class="sb-pc" type="button" role="listitem" data-pc="${c}">${c}</button>`).join('');

  function setEditing(on) {
    editing = on && !!input.value.trim();
    bar.hidden = !editing;
    editBtn.classList.toggle('on', editing);
    editBtn.querySelector('span').textContent = editing ? 'Готово' : 'Править аккорды';
    closeMenu();
    show(input.value);
  }
  editBtn.addEventListener('click', () => setEditing(!editing));
  doneBtn.addEventListener('click', () => setEditing(false));
  const change = (fn) => {
    history.push(input.value);
    if (history.length > 60) history.shift();
    fn();
    for (const l of model) l.chords?.sort((a, b) => a.at - b.at);
    commit(serialize(model), true);
  };
  undoBtn.addEventListener('click', () => {
    if (!history.length) return;
    commit(history.pop());
  });
  redoAuto.addEventListener('click', () => {
    // голые строки текста (без наших строк аккордов) — и заново по частям песни
    const bare = model
      .filter((l) => l.head != null || l.text.trim() || !l.chords.length)
      .map((l) => (l.head != null ? `${l.head}:` : l.text))
      .join('\n');
    history.push(input.value);
    commit(placeChords(bare, sections(), { bpm: data.bpm, meter: data.meter }));
  });
  addEventListener('keydown', (e) => {
    if (!editing || /input|textarea/i.test(e.target.tagName)) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      undoBtn.click();
    }
  });

  // аккорд по номерам строки и аккорда
  const chordAt = (l, k) => model[l]?.chords?.[k];
  const moveBy = (l, k, d, word = false) => {
    const c = chordAt(l, k);
    if (!c) return;
    const text = model[l].text;
    let at = c.at + d;
    if (word) {
      const starts = [...text.matchAll(/\S+/g)].map((m) => m.index);
      at = d > 0 ? (starts.find((x) => x > c.at) ?? text.length) : (starts.filter((x) => x < c.at).at(-1) ?? 0);
    }
    at = Math.max(0, Math.min(Math.max(text.length, 0), at));
    if (at === c.at) return;
    change(() => (c.at = at));
    focusChord(l, c);
  };
  const focusChord = (l, c) => {
    const k = model[l].chords.indexOf(c);
    ownView.querySelector(`.sb-c[data-l="${l}"][data-k="${k}"]`)?.focus();
  };
  ownView.addEventListener('keydown', (e) => {
    const b = e.target.closest?.('.sb-c[data-k]');
    if (!editing || !b) return;
    const l = Number(b.dataset.l);
    const k = Number(b.dataset.k);
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      moveBy(l, k, e.key === 'ArrowLeft' ? -1 : 1, e.shiftKey || e.ctrlKey);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      change(() => model[l].chords.splice(k, 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      openMenu(b, l, k);
    }
  });

  // ---------- перетаскивание: мышь и палец (pointer events) ----------
  let drag = null;
  const ghost = el('div', { class: 'sb-ghost', hidden: true });
  const caret = el('div', { class: 'sb-caret', hidden: true });
  document.body.append(ghost, caret);

  ownView.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.sb-c[data-k]');
    if (!editing || !b || e.button > 0) return;
    e.preventDefault();
    beginDrag(e, { l: Number(b.dataset.l), k: Number(b.dataset.k), orig: b.dataset.c, el: b });
  });
  palette.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-pc]');
    if (!b || e.button > 0) return;
    e.preventDefault();
    beginDrag(e, { l: null, k: null, orig: b.dataset.pc, el: b });
  });

  function beginDrag(e, src) {
    closeMenu();
    drag = { ...src, x0: e.clientX, y0: e.clientY, moved: false, target: null, id: e.pointerId };
    addEventListener('pointermove', onMove, { passive: false });
    addEventListener('pointerup', onUp);
    addEventListener('pointercancel', onCancel);
  }
  function onMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    e.preventDefault();
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 5) return;
    if (!drag.moved) {
      drag.moved = true;
      ghost.textContent = nameOf(drag.orig);
      ghost.hidden = false;
      drag.el.classList.add('sb-dragging');
      document.body.classList.add('sb-drag-on');
    }
    // аккорд над пальцем, чтобы было видно, куда он встанет
    const lift = e.pointerType === 'touch' ? 46 : 18;
    ghost.style.transform = `translate(${Math.round(e.clientX - ghost.offsetWidth / 2)}px, ${Math.round(e.clientY - lift - ghost.offsetHeight)}px)`;
    drag.target = hitTest(e.clientX, e.clientY - (e.pointerType === 'touch' ? lift - 10 : 0));
    trash.classList.toggle('over', !!drag.target?.trash);
    showCaret(drag.target);
    edgeScroll(e.clientY);
  }
  function onUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    endDrag();
    if (!d.moved) {
      if (d.l != null) openMenu(d.el, d.l, d.k);
      return;
    }
    const t = d.target;
    if (!t) return;
    if (t.trash) {
      if (d.l != null) change(() => model[d.l].chords.splice(d.k, 1));
      return;
    }
    change(() => {
      let c;
      if (d.l != null) [c] = model[d.l].chords.splice(d.k, 1);
      else c = { at: 0, c: d.orig };
      c.at = t.at;
      // на этой букве уже был аккорд — новый встаёт вместо него
      model[t.l].chords = model[t.l].chords.filter((x) => x.at !== t.at);
      model[t.l].chords.push(c);
      model[t.l].chords.sort((a, b) => a.at - b.at);
    });
  }
  function onCancel(e) {
    if (drag && e.pointerId === drag.id) endDrag();
  }
  function endDrag() {
    removeEventListener('pointermove', onMove);
    removeEventListener('pointerup', onUp);
    removeEventListener('pointercancel', onCancel);
    drag?.el.classList.remove('sb-dragging');
    document.body.classList.remove('sb-drag-on');
    trash.classList.remove('over');
    ghost.hidden = true;
    caret.hidden = true;
    cancelAnimationFrame(edgeRaf);
    drag = null;
  }

  // куда встанет аккорд: строка и буква под пальцем (или корзина)
  function hitTest(x, y) {
    const under = document.elementFromPoint(x, y);
    if (under?.closest('.sb-trash')) return { trash: true };
    let line = under?.closest('.sb-line[data-l]');
    if (!line || !ownView.contains(line)) {
      // между строками — ближайшая строка по высоте (в пределах 30 px)
      let best = null;
      let bd = 31;
      for (const ln of ownView.querySelectorAll('.sb-line[data-l]')) {
        const r = ln.getBoundingClientRect();
        const dist = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
        if (dist < bd && x > r.left - 40 && x < r.right + 400) {
          bd = dist;
          best = ln;
        }
      }
      line = best;
    }
    if (!line) return null;
    const l = Number(line.dataset.l);
    const text = model[l].text;
    // буква: ищем по всем буквам строки ту, над которой палец (по горизонтали)
    let at = text.length;
    let bestDx = Infinity;
    for (const seg of line.querySelectorAll('.sb-seg')) {
      const node = seg.querySelector('.sb-t')?.firstChild;
      const o = Number(seg.dataset.o);
      if (!node || node.nodeType !== 3) continue;
      const len = Math.min(node.length, Math.max(0, text.length - o));
      for (let i = 0; i < len; i++) {
        const rg = document.createRange();
        rg.setStart(node, i);
        rg.setEnd(node, i + 1);
        const r = rg.getBoundingClientRect();
        if (!r.width) continue;
        const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
        if (dx < bestDx) {
          bestDx = dx;
          at = o + i + (dx > 0 && x > r.right && i === len - 1 && o + i + 1 === text.length ? 1 : 0);
        }
        if (dx === 0) break;
      }
      if (bestDx === 0) break;
    }
    if (!text.trim()) at = Math.max(0, Math.min(text.length, at));
    return { l, at, line };
  }
  function showCaret(t) {
    if (!t || t.trash) return (caret.hidden = true);
    const line = t.line;
    let r = null;
    for (const seg of line.querySelectorAll('.sb-seg')) {
      const node = seg.querySelector('.sb-t')?.firstChild;
      const o = Number(seg.dataset.o);
      if (!node || node.nodeType !== 3) continue;
      if (t.at >= o && t.at < o + node.length) {
        const rg = document.createRange();
        rg.setStart(node, t.at - o);
        rg.setEnd(node, t.at - o + 1);
        r = rg.getBoundingClientRect();
        break;
      }
    }
    const lr = line.getBoundingClientRect();
    const left = r ? r.left : lr.left + line.scrollWidth;
    caret.hidden = false;
    caret.style.transform = `translate(${Math.round(left - 1)}px, ${Math.round(lr.top)}px)`;
    caret.style.height = `${Math.round(lr.height)}px`;
  }
  // у края экрана страница сама едет, чтобы дотащить аккорд в другой куплет
  let edgeRaf = 0;
  function edgeScroll(y) {
    cancelAnimationFrame(edgeRaf);
    const zone = 70;
    const v = y < zone + 60 ? -(zone + 60 - y) / 6 : y > innerHeight - zone ? (y - innerHeight + zone) / 6 : 0;
    if (!v || !drag) return;
    const tick = () => {
      if (!drag) return;
      (isFull() ? panel : document.scrollingElement).scrollTop += v;
      edgeRaf = requestAnimationFrame(tick);
    };
    edgeRaf = requestAnimationFrame(tick);
  }

  // ---------- меню аккорда: заменить, сдвинуть, убрать ----------
  const menu = el('div', { class: 'sb-menu', role: 'dialog', 'aria-label': 'Аккорд', hidden: true });
  document.body.append(menu);
  let menuFor = null;
  function openMenu(anchor, l, k) {
    const c = chordAt(l, k);
    if (!c) return;
    menuFor = { l, c };
    menu.innerHTML = `<div class="sb-m-row">${data.chords.map((o) => `<button type="button" class="sb-pc${o === c.c ? ' on' : ''}" data-set="${o}">${nameOf(o)}</button>`).join('')}</div>
<div class="sb-m-row"><button type="button" class="kb-btn" data-mv="-1" aria-label="На букву левее">←</button><button type="button" class="kb-btn" data-mv="1" aria-label="На букву правее">→</button><input class="sb-m-in" type="text" maxlength="12" placeholder="Другой: Am7" aria-label="Другой аккорд"><button type="button" class="btn btn-small btn-ghost" data-del="1">${icon('trash-2')}<span>Убрать</span></button></div>`;
    menu.hidden = false;
    placeMenu(anchor);
  }
  // меню стоит под своим аккордом и едет вместе со страницей; аккорд ушёл с экрана — меню закрывается
  function placeMenu(anchor = menuFor && ownView.querySelector(`.sb-c[data-l="${menuFor.l}"][data-k="${model[menuFor.l].chords.indexOf(menuFor.c)}"]`)) {
    if (!anchor) return closeMenu();
    const r = anchor.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return closeMenu();
    const w = menu.offsetWidth;
    const x = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    const y = r.bottom + 8 + menu.offsetHeight < innerHeight ? r.bottom + 8 : Math.max(8, r.top - menu.offsetHeight - 8);
    menu.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }
  function closeMenu() {
    menu.hidden = true;
    menuFor = null;
  }
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !menuFor) return;
    const { l, c } = menuFor;
    if (b.dataset.set) change(() => (c.c = b.dataset.set));
    else if (b.dataset.mv) {
      const k = model[l].chords.indexOf(c);
      moveBy(l, k, Number(b.dataset.mv));
      const nb = ownView.querySelector(`.sb-c[data-l="${l}"][data-k="${model[l].chords.indexOf(c)}"]`);
      if (nb) return openMenu(nb, l, model[l].chords.indexOf(c));
    } else if (b.dataset.del) change(() => model[l].chords.splice(model[l].chords.indexOf(c), 1));
    closeMenu();
  });
  menu.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') return closeMenu();
    const inp = e.target.closest('.sb-m-in');
    if (!inp || e.key !== 'Enter' || !menuFor) return;
    const name = inp.value.trim().replace(/^h/i, 'B').replace(/^[a-g]/, (m) => m.toUpperCase());
    if (!isChord(name)) {
      inp.classList.add('bad');
      return;
    }
    const { c } = menuFor;
    change(() => (c.c = origOf(name)));
    closeMenu();
  });
  document.addEventListener('pointerdown', (e) => {
    if (!menu.hidden && !menu.contains(e.target) && !e.target.closest('.sb-c[data-k]')) closeMenu();
  });
  let menuRaf = 0;
  addEventListener(
    'scroll',
    () => {
      if (menu.hidden) return;
      cancelAnimationFrame(menuRaf);
      menuRaf = requestAnimationFrame(() => placeMenu());
    },
    { passive: true, capture: true },
  );
}

const semis = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'полутон' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'полутона' : 'полутонов');

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
