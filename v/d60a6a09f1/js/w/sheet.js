// Страница песни: инструмент (гитара, укулеле, фортепиано, бас), тональность и каподастр, «без баррэ»,
// «Играть» — полная версия песни всеми инструментами (w/band.js) и «Играть вместе» — ритм на своём инструменте
// с отсчётом и подсветкой аккордов. Оба играют одним проигрывателем, видны в нижнем плеере и в панели справа от текста.
// Порядок игры: есть текст с аккордами — как в нём (lib/songtime.js textOrder, слова закрашивает w/karaoke.js), нет —
// вся песня, собранная из её частей (fullForm).
import { Seq, audio, click, drum, hush, loadDrums, setVolume } from '../audio.js';
import { drumHits, styleFor } from '../lib/drums.js';
import { instChordCard } from '../lib/cards.js';
import { diagramSVG, fretsText } from '../lib/diagram.js';
import { INSTRUMENTS, voicingFor } from '../lib/instruments.js';
import { keyboardSVG } from '../lib/keyboard.js';
import { METERS, PATTERNS, patternsFor } from '../lib/patterns.js';
import * as T from '../lib/theory.js';
import { barsPasses, fullForm, orderBars, partsSummary, textOrder } from '../lib/songtime.js';
import { pianoHush } from '../piano.js';
import { PART_ORDER, makeBand, partsFor, preload, saveParts, timeline } from './band.js';
import { makeKaraoke } from './karaoke.js';
import { PLAY_ICON, STOP_ICON, chordTip, claim, el, playButton, playChordOn, playStepOn, release, slider, store, toggle } from './util.js';

export function init() {
  const root = document.querySelector('.songsheet');
  if (root) setup(root);
}

const semis = (n) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'полутон' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'полутона' : 'полутонов'}`;

function setup(root) {
  const data = JSON.parse(root.querySelector('.sheet-data').textContent);
  const M = METERS[data.meter];
  const saved = store.get('song.' + data.slug, {});
  const st = {
    tr: saved.tr || 0,
    capo: saved.capo ?? data.capo,
    // выбор ритма помним с pv: 1 — старые сохранения (до своих рисунков песен) не перебивают ритм песни
    pattern: saved.pv && saved.pattern && PATTERNS[saved.pattern]?.meter === data.meter && (!PATTERNS[saved.pattern].own || PATTERNS[saved.pattern].own === data.slug) ? saved.pattern : data.pattern,
    speed: saved.sv === 2 && saved.speed ? saved.speed : 1,
    guitar: true,
    inst: INSTRUMENTS[new URLSearchParams(location.search).get('inst')] ? new URLSearchParams(location.search).get('inst') : store.get('instrument', 'guitar'),
    metro: false,
    drums: store.get('drums', true),
    count: true,
    playing: false,
    mode: 'along',
    parts: partsFor(data),
    minus: store.get('minusOn', true),
    minusVol: store.get('minusVol', 1),
  };

  // ---------- тональность ----------
  // у гитары и укулеле аккорды — формы при каподастре; у фортепиано и баса каподастра нет: аккорды как звучат
  const fretted = () => st.inst === 'guitar' || st.inst === 'ukulele';
  const capoNow = () => (fretted() ? st.capo : 0);
  const shift = () => data.capo + st.tr - capoNow();
  const soundKey = () => T.transposeKey(data.key, st.tr);
  const flats = () => T.keyUsesFlats(T.transposeKey(soundKey(), -capoNow()));
  const nameOf = (orig) => (shift() === 0 ? orig : T.transposeChord(orig, shift(), flats()));
  const voicingOf = (orig) => {
    if (st.inst !== 'guitar') return voicingFor(st.inst, nameOf(orig));
    if (shift() === 0 && data.shapes[orig]) {
      const [f, fi] = data.shapes[orig].split(' ');
      return T.voicingFromString(f, fi);
    }
    return T.voicings(nameOf(orig))[0] || null;
  };
  // каподастр поднимает всё, что звучит на грифе: форма та же, лады выше
  const sounding = (v) => (v?.frets && fretted() && st.capo ? { ...v, frets: v.frets.map((f) => (f < 0 ? f : f + st.capo)) } : v);
  const smallDiagram = (v, name) => (st.inst === 'piano' ? keyboardSVG({ from: 48, to: 71, notes: v ? v.rh.map((m) => ({ midi: m })) : [], labels: '', name }) : diagramSVG(v, { name, open: INSTRUMENTS[st.inst].open }));

  // вкладка «Текст и аккорды»: инструмент, панель тональности, схемы аккордов, текст, «Играть вместе»
  const panel = root.closest('[data-panel]') || document;
  const top = panel.querySelector('.songsheet-chords');
  const keybar = panel.querySelector('.keybar');
  const kbKey = panel.querySelector('.kb-key');
  const kbCapo = panel.querySelector('.kb-capo');
  const kbNote = panel.querySelector('.kb-note');
  const kbReset = panel.querySelector('.kb-reset');
  const box = top.querySelector('.song-chords');
  const guitarHTML = box.innerHTML;
  let cards = [...box.querySelectorAll('.chord')];
  const capOrig = cards.map((c) => c.querySelector('.chord-cap').innerHTML);
  const instTabs = [...panel.querySelectorAll('.inst-tab')];
  const capoGroup = panel.querySelector('.kb-capo')?.closest('.kb-group');
  const easyBtn = panel.querySelector('.kb-easy');
  instTabs.forEach((b) =>
    b.addEventListener('click', () => {
      if (st.playing && st.mode === 'along') stop();
      st.inst = b.dataset.inst;
      store.set('instrument', st.inst);
      update();
    }),
  );
  let chips = [...root.querySelectorAll('.sheet .ch')];
  chips.forEach((c) => (c.dataset.o = c.textContent));
  keybar.hidden = false;

  function update() {
    instTabs.forEach((b) => b.classList.toggle('on', b.dataset.inst === st.inst));
    instTabs.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.inst === st.inst)));
    if (capoGroup) capoGroup.hidden = !fretted();
    if (easyBtn) easyBtn.hidden = !fretted();
    top.classList.toggle('inst-piano', st.inst === 'piano');
    kbKey.textContent = soundKey();
    kbCapo.textContent = String(st.capo);
    const changed = st.tr !== 0 || (fretted() && st.capo !== data.capo) || (!fretted() && data.capo > 0);
    kbReset.hidden = !(st.tr !== 0 || st.capo !== data.capo);
    kbNote.hidden = !changed;
    if (changed) {
      const parts = [`Звучит в ${soundKey()} (${T.keyRu(soundKey())})`];
      if (st.tr) parts.push(`на ${semis(Math.abs(st.tr))} ${st.tr > 0 ? 'выше' : 'ниже'} оригинала`);
      const capoText = fretted() ? (st.capo ? `Каподастр на ${st.capo}-м ладу.` : 'Без каподастра.') : 'Аккорды записаны так, как звучат, — без каподастра.';
      kbNote.textContent = `${parts.join(', ')}. ${capoText}`;
    }
    if (st.inst !== 'guitar') {
      box.innerHTML = data.chords.map((orig) => instChordCard(st.inst, nameOf(orig), voicingOf(orig))).join('');
      cards = [];
    } else if (!cards.length) {
      box.innerHTML = guitarHTML;
      cards = [...box.querySelectorAll('.chord')];
    }
    data.chords.forEach((orig, i) => {
      const card = cards[i];
      if (!card || st.inst !== 'guitar') return;
      const name = nameOf(orig);
      const v = voicingOf(orig);
      const btn = card.querySelector('.chord-btn');
      btn.dataset.chord = name;
      if (v) {
        btn.dataset.frets = v.frets.join(',');
        btn.dataset.fingers = v.fingers.join(',');
      }
      btn.setAttribute('aria-label', `Сыграть аккорд ${name}`);
      btn.innerHTML = `<span class="chord-name">${name}</span>${diagramSVG(v, { name })}`;
      card.querySelector('.chord-cap').innerHTML = shift() === 0 ? capOrig[i] : fretsText(v);
    });
    // схемы звучат с каподастром, как гитара с ним
    box.querySelectorAll('.chord-btn').forEach((b) => (b.dataset.capo = fretted() ? st.capo : 0));
    chips.forEach((c) => (c.textContent = nameOf(c.dataset.o)));
    store.set('song.' + data.slug, { tr: st.tr, capo: st.capo, pattern: st.pattern, speed: st.speed, sv: 2, pv: 1 });
    // остальные вкладки песни (текст с аккордами, вокал) берут тональность отсюда
    window.__songKey = { shift: shift(), flats: flats(), tr: st.tr, capo: capoNow(), capoSet: st.capo, inst: st.inst, key: soundKey(), fretted: fretted() };
    dispatchEvent(new CustomEvent('song:key', { detail: window.__songKey }));
    instToggle.textContent = INSTRUMENTS[st.inst].name;
    showNow(curChord || order.flat[0], nextChord);
  }

  // кнопки тональности и каподастра на других вкладках
  addEventListener('song:set', (e) => {
    const d = e.detail || {};
    if (d.tr) st.tr = Math.max(-11, Math.min(11, st.tr + d.tr));
    if (d.capo) st.capo = Math.max(0, Math.min(9, st.capo + d.capo));
    update();
  });

  keybar.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !(b.dataset.tr || b.dataset.capo || b.classList.contains('kb-reset') || b.classList.contains('kb-easy'))) return;
    if (b.dataset.tr) st.tr = Math.max(-11, Math.min(11, st.tr + Number(b.dataset.tr)));
    else if (b.dataset.capo) st.capo = Math.max(0, Math.min(9, st.capo + Number(b.dataset.capo)));
    else if (b.classList.contains('kb-reset')) {
      st.tr = 0;
      st.capo = data.capo;
    } else if (b.classList.contains('kb-easy')) easiest();
    update();
  });

  function easiest() {
    let best = null;
    for (let c = 0; c <= 9; c++) {
      const sh = data.capo + st.tr - c;
      let sum = 0;
      for (const orig of data.chords) {
        const name = T.transposeChord(orig, sh);
        const v = st.inst === 'ukulele' ? voicingFor('ukulele', name) : sh === 0 && data.shapes[orig] ? voicingOf(orig) : T.voicings(name)[0];
        sum += T.difficulty(v);
      }
      sum += c * 0.06;
      if (!best || sum < best.sum - 0.01) best = { c, sum };
    }
    const was = st.capo;
    st.capo = best.c;
    if (best.c === was) {
      kbNote.hidden = false;
      kbNote.textContent = 'Проще уже некуда: это самый удобный вариант аккордов.';
    }
  }

  // ---------- игра вместе ----------
  const bandKey = () => ({ tr: st.tr, capo: st.capo });
  const bandPattern = () => st.pattern;
  // порядок игры: такты, аккорды подряд, начала частей, группа и время строк текста
  function makeOrder(text) {
    const src = text ? { ...data, sections: text.sections } : data;
    const form = text ? src.sections.map((_, i) => i) : fullForm(data.sections, data);
    const { tl, secStart, marks } = timeline(src, form);
    return {
      tl,
      secStart,
      marks,
      src,
      form,
      fromText: !!text,
      lines: text?.lines || [],
      flat: tl.flatMap((bar, k) => bar.chords.map((c) => ({ ...c, bar: k }))),
      band: makeBand(src, { key: bandKey, pattern: bandPattern, form }),
    };
  }
  let order = makeOrder(null);

  const pa = root.querySelector('.playalong');
  pa.hidden = false;
  // с того места, где остановились (после конца — сначала)
  const resumeBar = () => (st.lastBar && st.lastBar < order.tl.length - 1 ? st.lastBar : 0);
  const play = playButton(() => {
    if (st.playing && st.mode === 'along') return stop();
    const from = resumeBar();
    if (st.playing) stop();
    start(from, 'along');
  });
  play.setPlaying(false, 'Играть вместе');
  const patSel = el(
    'select',
    { 'aria-label': 'Ритм' },
    patternsFor(data.meter, data.slug).map((p) => el('option', { value: p.id, selected: p.id === st.pattern ? true : null }, p.name)),
  );
  patSel.addEventListener('change', () => {
    st.pattern = patSel.value;
    update();
  });
  const speed = slider({
    label: 'Скорость',
    min: 40,
    max: 120,
    step: 5,
    value: Math.round(st.speed * 100),
    fmt: (v) => `${v}% · ${Math.round((data.bpm * v) / 100)}`,
    oninput: (v) => {
      st.speed = v / 100;
      store.set('song.' + data.slug, { tr: st.tr, capo: st.capo, pattern: st.pattern, speed: st.speed, sv: 2, pv: 1 });
    },
  });
  const status = el('div', { class: 'pa-pos muted', 'aria-live': 'polite' });
  const instToggle = toggle(INSTRUMENTS[st.inst].name, st.guitar, (v) => (st.guitar = v));
  const now = el('div', { class: 'pa-card pa-cur' });
  const nxt = el('div', { class: 'pa-card pa-next' });
  const soon = el('div', { class: 'pa-soon' });
  const bandBtn = el('button', { type: 'button', class: 'btn btn-small btn-ghost pa-band', title: 'Гитара, клавишные, бас и барабаны — как кнопка «Играть» вверху страницы' });
  const againBtn = el('button', { type: 'button', class: 'btn btn-small btn-ghost pa-again' }, 'Сначала');
  const timeNow = el('span', { class: 'pa-t' }, '0:00');
  const timeAll = el('span', { class: 'pa-t' });
  const progFill = el('i');
  const progBar = el('div', { class: 'pa-prog', role: 'slider', 'aria-label': 'Место в песне', tabindex: '0', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' }, progFill);
  // сколько тактов на строку: сайт считает сам по слогам и темпу, но слух точнее
  const bplKey = 'bpl.' + data.slug;
  const bplSel = el(
    'select',
    { 'aria-label': 'Тактов на строку текста' },
    [[0, 'сам считает'], [1, '1'], [2, '2'], [4, '4'], [8, '8']].map(([v, name]) => el('option', { value: v, selected: store.get(bplKey, 0) === v ? true : null }, name)),
  );
  const bplBox = el('label', { class: 'ctl-select pa-bpl', title: 'Текст бежит быстрее или медленнее, чем вы поёте? Поменяйте здесь.' }, el('span', { class: 'ctl-label' }, 'Тактов на строку'), bplSel);
  const followOn = () => store.get('karaokeFollow', true);
  // звук минуса: выключить совсем (отсчёт и метроном остаются, слова бегут дальше) или сделать тише
  const minusVolume = () => (st.minus ? 0.75 * st.minusVol : 0.75);
  const onOff = (label, on) => `${label}: ${on ? 'вкл' : 'выкл'}`;
  const minusBtn = toggle(onOff('Звук минуса', st.minus), st.minus, (v) => {
    st.minus = v;
    store.set('minusOn', v);
    minusBtn.textContent = onOff('Звук минуса', v);
    minusVol.input.disabled = !v;
    if (!st.playing) return;
    if (!v) {
      hush();
      pianoHush();
    }
    setVolume(minusVolume());
  });
  const minusVol = slider({
    label: 'Громкость',
    min: 5,
    max: 100,
    step: 5,
    value: Math.round(st.minusVol * 100),
    fmt: (v) => `${v}%`,
    oninput: (v) => {
      st.minusVol = v / 100;
      store.set('minusVol', st.minusVol);
      if (st.playing) setVolume(minusVolume());
    },
  });
  minusVol.input.disabled = !st.minus;
  const followBtn = toggle(onOff('Автопрокрутка', followOn()), followOn(), (v) => {
    store.set('karaokeFollow', v);
    followBtn.textContent = onOff('Автопрокрутка', v);
  });
  followBtn.title = 'Страница едет за текущей строкой текста';
  // настройки: рядом с текстом открыты всегда, на узком экране свёрнуты — панель не должна отодвигать текст
  const wide = matchMedia('(min-width: 1101px)');
  const more = el('details', { class: 'pa-more', open: wide.matches ? true : null }, el('summary', {}, 'Ритм, скорость, барабаны'));
  wide.addEventListener('change', () => (more.open = wide.matches));
  pa.append(
    el('h2', { class: 'pa-title' }, 'Играть вместе'),
    el('div', { class: 'pa-btns' }, play, bandBtn, againBtn),
    el('div', { class: 'pa-now' }, now, nxt),
    soon,
    el('div', { class: 'pa-time' }, timeNow, progBar, timeAll),
    status,
    el('div', { class: 'pa-quick' }, el('div', { class: 'tg-group' }, minusBtn, followBtn), minusVol.node),
    more,
  );
  more.append(
    el(
      'div',
      { class: 'pa-ctl' },
      el('label', { class: 'ctl-select' }, el('span', { class: 'ctl-label' }, 'Ритм'), patSel),
      bplBox,
      speed.node,
      el(
        'div',
        { class: 'tg-group' },
        instToggle,
        toggle('Барабаны', st.drums, (v) => {
          st.drums = v;
          store.set('drums', v);
          if (v) loadDrums();
        }),
        toggle('Метроном', st.metro, (v) => (st.metro = v)),
        toggle('Отсчёт', st.count, (v) => (st.count = v)),
      ),
    ),
  );

  const karaoke = makeKaraoke(panel.querySelector('.songbook'), { follow: followOn });
  let curChord = null;
  let nextChord = null;
  let soonChords = [];
  // аккорды после этого места: только смены, подряд одинаковые — один
  const upcoming = (fi) => {
    const out = [];
    let last = order.flat[fi]?.orig;
    for (let i = fi + 1; i < order.flat.length && out.length < 7; i++) {
      if (order.flat[i].orig === last) continue;
      last = order.flat[i].orig;
      out.push(order.flat[i]);
    }
    return out;
  };
  function showNow(c, n) {
    const card = (box, ch, label) => {
      if (!ch) {
        box.innerHTML = `<span class="pa-label">${label}</span><span class="pa-end">конец</span>`;
        return;
      }
      const name = nameOf(ch.orig);
      box.innerHTML = `<span class="pa-label">${label}</span><span class="pa-name">${name}</span>${smallDiagram(voicingOf(ch.orig), name)}`;
    };
    card(now, c, 'Сейчас');
    card(nxt, n, 'Дальше');
    soon.innerHTML = soonChords.length ? `<span class="pa-label">Потом</span>${soonChords.map((x) => `<b>${nameOf(x.orig)}</b>`).join('')}` : '';
  }
  function showStart() {
    curChord = null;
    const list = upcoming(0);
    nextChord = list[0] || null;
    soonChords = list.slice(1);
    showNow(order.flat[0], nextChord);
  }
  const fmtTime = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
  const orderSeconds = () => order.tl.length * M.slots * seq.tickDur();
  function paintTime(t = st.lastTick || 0) {
    const p = Math.max(0, Math.min(1, t / (order.tl.length * M.slots)));
    progFill.style.width = `${(p * 100).toFixed(2)}%`;
    progBar.setAttribute('aria-valuenow', String(Math.round(p * 100)));
    timeNow.textContent = fmtTime(p * orderSeconds());
    timeAll.textContent = fmtTime(orderSeconds());
  }
  // из чего состоит песня: по тексту человека, по сверке с источником или по схеме частей
  const idleText = () => {
    const parts = partsSummary(order.src.sections, order.form);
    if (order.fromText) return `В вашем тексте: ${parts || 'части без подписей'}. Играет как в нём, слова закрашиваются.`;
    if (data.formLoop) return `Вся песня: один круг аккордов, длина сверена с ${data.formFrom}. Вставите текст с аккордами — заиграет как в нём.`;
    if (data.form) return `Вся песня${parts ? `: ${parts}` : ''}. Порядок сверен с ${data.formFrom}. Вставите текст с аккордами — заиграет как в нём.`;
    return 'Вся песня: части собраны в куплеты и припевы по кругу. Вставите текст с аккордами — заиграет как в нём.';
  };

  // полная версия: гитара, укулеле, клавишные, бас и барабаны в выбранной тональности
  const songPlay = document.querySelector('.song-play');
  const partBtns = [...document.querySelectorAll('.band-row [data-part]')];
  // порядок — как в оригинале (первый — ведущий), добавленные человеком — в конец
  const rank = (x) => ((data.band || '').includes(x) ? data.band.indexOf(x) : 10 + PART_ORDER.indexOf(x));
  const paintParts = () => partBtns.forEach((b) => b.setAttribute('aria-pressed', String(st.parts.includes(b.dataset.part))));
  partBtns.forEach((b) =>
    b.addEventListener('click', () => {
      const p = b.dataset.part;
      const on = st.parts.includes(p) ? st.parts.replace(p, '') : st.parts + p;
      st.parts = [...on].sort((x, y) => rank(x) - rank(y)).join('');
      saveParts(data, st.parts);
      paintParts();
      if (st.mode === 'full' && st.playing) preload(st.parts);
    }),
  );
  paintParts();

  const seq = new Seq({
    total: order.tl.length * M.slots,
    ticksPerBeat: M.slotsPerBeat,
    bpm: () => data.bpm * st.speed,
    onTick: (t, time) => {
      if (st.mode === 'full') return st.minus ? order.band.tick(t, time, st.parts, data.bpm * st.speed) : undefined;
      if (st.counting) {
        if (t >= st.from) st.counting = false;
        else {
          const k = t - (st.from - M.slots);
          if (k % M.slotsPerBeat === 0) click(time, k === 0);
          return;
        }
      }
      const timeline = order.tl;
      const bar = timeline[Math.floor(t / M.slots)];
      const pos = t % M.slots;
      const ch = bar.chords.find((c) => pos >= c.start && pos < c.start + c.slots);
      const p = PATTERNS[st.pattern];
      const step = p.steps[pos];
      let next = null;
      if (step.includes('N')) {
        const nb = timeline[Math.floor((t + 1) / M.slots)];
        const nc = nb?.chords.find((c) => (t + 1) % M.slots >= c.start && (t + 1) % M.slots < c.start + c.slots);
        if (nc) next = { v: sounding(voicingOf(nc.orig)), name: nameOf(nc.orig) };
      }
      const half = 30 / (data.bpm * st.speed) / M.slotsPerBeat;
      if (st.minus && st.guitar && ch) playStepOn(st.inst, step, sounding(voicingOf(ch.orig)), nameOf(ch.orig), time, { kind: p.kind, vel: pos === 0 ? 0.95 : 0.78, beat: pos % M.slotsPerBeat === 0, half, next });
      if (st.metro && pos % M.slotsPerBeat === 0) click(time, pos === 0, st.guitar ? 0.45 : 0.8);
      if (st.minus && st.drums) {
        const bi = Math.floor(t / M.slots);
        const next = timeline[bi + 1];
        const opts = { first: bar.bi === 0 && bar.r === 0 && bi > 0, last: !next || next.si !== bar.si };
        for (const h of drumHits(styleFor(p.kind), data.meter, pos, M.slots, opts)) drum(h, time, pos % M.slotsPerBeat === 0 ? 0.9 : 0.62);
      }
    },
    onVisual: (t, time) => {
      st.clock = { t, time };
      if (t < st.from) {
        const k = Math.floor((t - (st.from - M.slots)) / M.slotsPerBeat) + 1;
        status.textContent = `Отсчёт: ${k}…`;
        return;
      }
      const bi = Math.floor(t / M.slots);
      const bar = order.tl[bi];
      const pos = t % M.slots;
      st.lastTick = t;
      st.lastBar = bi;
      paintTime(t);
      // строка и аккорд над ней меняются в один кадр
      if (order.fromText) karaoke.frame(t);
      const k = bar.chords.findIndex((c) => pos >= c.start && pos < c.start + c.slots);
      const ch = bar.chords[k];
      const sec = order.src.sections[bar.si];
      status.textContent = `${sec.name}${bar.n > 1 ? ` (${bar.r + 1}-й раз из ${bar.n})` : ''} · такт ${bar.bi + 1} из ${sec.bars.length}`;
      if (ch && ch !== curChord?.ref) {
        const fi = order.flat.findIndex((f) => f.bar === bi && f.start === ch.start);
        curChord = { ...order.flat[fi], ref: ch };
        const list = upcoming(fi);
        nextChord = list[0] || null;
        soonChords = list.slice(1);
        showNow(curChord, nextChord);
        const was = chips.find((c) => c.classList.contains('on'));
        chips.forEach((c) => c.classList.remove('on'));
        const chip = chips[ch.chip];
        chip?.classList.add('on');
        if (order.fromText) karaoke.setChord(ch.l, ch.k);
        // нет текста: едем за аккордом в листе «по частям», только если человек на него смотрит
        else karaoke.keepInView(chip, was);
      }
    },
    onEnd: () => stop(false),
  });

  // слова закрашиваются плавно, между шагами: позиция песни по часам звука
  function karaokeLoop() {
    cancelAnimationFrame(st.raf);
    const frame = () => {
      if (!st.playing) return;
      if (st.clock && order.fromText) {
        const dt = (audio().currentTime - st.clock.time) / seq.tickDur();
        karaoke.frame(st.clock.t + Math.max(0, Math.min(dt, 1)));
      }
      st.raf = requestAnimationFrame(frame);
    };
    st.raf = requestAnimationFrame(frame);
  }

  // номер части, в которой этот такт (в порядке игры)
  const markOf = (bi) => {
    let k = 0;
    order.marks.forEach((b, i) => {
      if (b <= bi) k = i;
    });
    return k;
  };
  const api = {
    title: data.title,
    sub: `${data.artist} · играть вместе`,
    slug: data.slug,
    el: root,
    stop: () => stop(),
    resume: () => start(st.lastBar || 0, st.mode),
    prev: () => {
      const k = markOf(st.lastBar || 0);
      const mode = st.mode;
      if (st.playing) stop();
      start(order.marks[Math.max(0, k - 1)], mode);
    },
    next: () => {
      const k = markOf(st.lastBar || 0);
      const mode = st.mode;
      if (st.playing) stop();
      start(order.marks[Math.min(order.marks.length - 1, k + 1)], mode);
    },
    progress: () => Math.max(0, Math.min(1, (st.lastTick || 0) / (order.tl.length * M.slots))),
    duration: () => orderSeconds(),
    seek: (p) => seekTo(Math.floor(p * order.tl.length)),
  };
  // «Играть» в шапке: полная версия с того места, где остановились (после конца — сначала)
  const playFull = () => {
    if (st.playing && st.mode === 'full') return stop();
    const from = resumeBar();
    if (st.playing) stop();
    start(from, 'full');
  };
  songPlay?.addEventListener('click', playFull);
  bandBtn.addEventListener('click', playFull);
  againBtn.addEventListener('click', () => {
    const mode = st.mode;
    if (st.playing) stop();
    start(0, mode);
  });
  // полоска времени: нажатие — на это место песни
  const seekTo = (bar) => {
    const b = Math.max(0, Math.min(order.tl.length - 1, bar));
    if (st.playing) {
      const mode = st.mode;
      stop();
      start(b, mode, true);
    } else {
      st.lastBar = b;
      st.lastTick = b * M.slots;
      karaoke.seek(st.lastTick);
      paintTime();
    }
  };
  progBar.addEventListener('click', (e) => {
    const r = progBar.getBoundingClientRect();
    seekTo(Math.floor(((e.clientX - r.left) / r.width) * order.tl.length));
  });
  progBar.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    seekTo((st.lastBar || 0) + (e.key === 'ArrowLeft' ? -4 : 4));
  });
  const paintSongPlay = (on) => {
    bandBtn.innerHTML = `${on ? STOP_ICON : PLAY_ICON}<span>${on ? 'Пауза' : 'Вся группа'}</span>`;
    bandBtn.classList.toggle('on', on);
    if (!songPlay) return;
    songPlay.innerHTML = `${on ? STOP_ICON : PLAY_ICON}<span>${on ? 'Пауза' : 'Играть'}</span>`;
    songPlay.classList.toggle('on', on);
  };
  paintSongPlay(false);
  function start(fromBar, mode = 'along', noCount = false) {
    st.mode = mode;
    const full = mode === 'full';
    if (full) preload(st.parts);
    else if (st.drums) loadDrums();
    st.lastBar = fromBar;
    st.lastTick = fromBar * M.slots;
    api.sub = `${data.artist} · ${full ? 'полная версия' : 'играть вместе'}`;
    claim(api);
    audio();
    // громкость минуса — только пока играет песня: звук других блоков страницы не меняется
    setVolume(minusVolume());
    st.from = fromBar * M.slots;
    st.counting = !full && st.count && !noCount;
    st.playing = true;
    st.clock = null;
    curChord = null;
    karaoke.seek(st.from);
    karaokeLoop();
    play.setPlaying(!full, 'Играть вместе');
    paintSongPlay(full);
    root.classList.add('playing');
    seq.start(st.counting ? st.from - M.slots : st.from);
  }
  function stop(silence = true) {
    if (!st.playing) return;
    st.playing = false;
    cancelAnimationFrame(st.raf);
    seq.stop(!silence);
    setVolume(0.75);
    if (silence) {
      hush();
      pianoHush();
    }
    play.setPlaying(false, 'Играть вместе');
    paintSongPlay(false);
    root.classList.remove('playing');
    chips.forEach((c) => c.classList.remove('on'));
    status.textContent = silence ? 'Пауза. «Играть вместе» — дальше с этого места, «Сначала» — с начала.' : 'Готово! Ещё раз?';
    if (!silence) {
      st.lastBar = 0;
      st.lastTick = 0;
      karaoke.clear();
      paintTime();
    }
    release(api);
  }

  // лист «Аккорды по частям»: у текста — части и круги из самого текста, без текста — части песни с сайта
  const sheetBox = root.querySelector('.sheet');
  const sheetTitle = root.querySelector('.sheet-parts h2');
  const siteSheet = sheetBox.innerHTML;
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  function renderSheet() {
    let ci = 0;
    sheetBox.innerHTML = order.fromText
      ? order.src.sections
          .map((sec) => {
            const n = barsPasses(sec.bars);
            return `<div class="sec"><h3>${esc(sec.name)}${n > 1 ? ` <span class="rep">×${n}</span>` : ''}</h3><div class="bars">${sec.bars.map((b) => `<div class="bar">${b.map((c) => `<span class="ch" data-c="${ci++}" style="flex:${c.slots}">${esc(c.name)}</span>`).join('')}</div>`).join('')}</div></div>`;
          })
          .join('')
      : siteSheet;
    if (sheetTitle) sheetTitle.textContent = order.fromText ? 'Аккорды по вашему тексту' : 'Аккорды по частям';
    chips = [...sheetBox.querySelectorAll('.ch')];
    chips.forEach((c) => {
      c.dataset.o = c.textContent;
      c.textContent = nameOf(c.dataset.o);
    });
    // запуск с нужной части
    sheetBox.querySelectorAll('.sec h3').forEach((h, si) => {
      const label = h.firstChild?.textContent?.trim() || '';
      const b = el('button', { type: 'button', class: 'sec-play', 'aria-label': `Играть с части «${label}»`, title: 'Играть с этого места', html: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>' });
      b.addEventListener('click', () => {
        if (st.playing) stop();
        start(order.secStart[si] ?? 0, 'along');
      });
      h.append(b);
    });
  }

  // ---------- порядок из текста ----------
  const applyText = (force = false) => {
    const t = window.__songText;
    const barsPerLine = store.get(bplKey, 0);
    const id = JSON.stringify(t?.model || []);
    if (force || id !== st.textId) {
      st.textId = id;
      if (st.playing) stop();
      let text = textOrder(t?.model, data, { barsPerLine });
      // текст с сайта — обычно куплет и припев по разу: повторяем его, чтобы звучала вся песня
      if (text && t.site) {
        const cycles = Math.max(1, Math.round(orderBars(data.sections, fullForm(data.sections, data)) / Math.max(1, orderBars(text.sections))));
        if (cycles > 1) text = textOrder(t.model, data, { barsPerLine, cycles });
      }
      order = makeOrder(text);
      seq.total = order.tl.length * M.slots;
      st.lastBar = 0;
      st.lastTick = 0;
      karaoke.load(order.lines);
      bplBox.hidden = !order.fromText;
      renderSheet();
      showStart();
      paintTime();
      status.textContent = idleText();
    } else {
      // тот же текст перерисован (сохранение в «Мои тексты» и т. п.)
      karaoke.bind();
      if (st.lastTick) karaoke.seek(st.lastTick);
    }
    addHeadButtons();
  };
  addEventListener('song:text', () => applyText());
  bplSel.addEventListener('change', () => {
    store.set(bplKey, Number(bplSel.value));
    applyText(true);
  });

  // подпись части в тексте: ▶ — играть с неё; нажатие на строку, пока песня играет, — перейти на неё
  const textBarOf = (l) => {
    const line = order.lines.find((e) => e.l === l);
    if (line) return Math.floor(Math.max(0, line.start) / M.slots);
    const k = order.src.sections.findIndex((x) => x.l === l);
    return k >= 0 ? order.secStart[k] : null;
  };
  function addHeadButtons() {
    if (!order.fromText) return;
    panel.querySelectorAll('.songbook .sb-h[data-l]').forEach((h) => {
      if (h.querySelector('.sec-play') || textBarOf(Number(h.dataset.l)) == null) return;
      h.append(el('button', { type: 'button', class: 'sec-play', 'aria-label': `Играть с части «${h.textContent}»`, title: 'Играть с этого места', html: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>' }));
    });
  }
  panel.querySelector('.songbook')?.addEventListener('click', (e) => {
    const head = e.target.closest('.sec-play');
    const row = head ? head.closest('.sb-h[data-l]') : st.playing && !e.target.closest('.sb-c, a, button') && !String(getSelection()) ? e.target.closest('.sb-line[data-l]') : null;
    if (!row || !order.fromText) return;
    const bar = textBarOf(Number(row.dataset.l));
    if (bar == null) return;
    const mode = st.mode;
    if (st.playing) stop();
    start(bar, mode);
  });

  // аккорд в листе: при наведении — схема, по нажатию — звучит
  chordTip(root.querySelector('.sheet'), '.ch', (chip) => {
    const name = nameOf(chip.dataset.o);
    return `<b class="ct-name">${name}</b>${smallDiagram(voicingOf(chip.dataset.o), name)}`;
  });
  root.querySelector('.sheet').addEventListener('click', (e) => {
    const chip = e.target.closest('.ch');
    if (!chip || st.playing) return;
    const v = sounding(voicingOf(chip.dataset.o));
    if (v) {
      audio();
      playChordOn(st.inst, v);
    }
  });

  update();
  applyText(true);
}
