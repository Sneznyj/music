// Тренажёр «падающие ноты» для фортепиано: ноты падают на клавиатуру — нажимайте их, когда они доходят до линии.
// Играть можно на MIDI-клавиатуре (подключение и звуки — общие со страницей /midi/), мышью или клавишами компьютера.
// Режимы: «Ждёт меня» (время стоит, пока не нажаты нужные клавиши), «В темпе» (со счётом попаданий), «Смотреть».
// Руку, которую человек не играет, играет сайт: на маленькой клавиатуре — обычно бас левой руки.
// Ноты своей руки, которые не помещаются на клавиатуру, переносятся на октаву («Уложить в мою клавиатуру»).
// На странице песни (.fall[data-slug]) партия строится из аккордов песни (lib/pianopart.js),
// на /piano/play/ (.fall-picker) — выбор песни и свои MIDI-файлы (хранятся в браузере, IndexedDB snezh-midi).
import { click } from '../audio.js';
import { icon } from '../lib/icons.js';
import { midiPart, parseMidi } from '../lib/midifile.js';
import { pianoPart } from '../lib/pianopart.js';
import { midiKit as K } from './midi.js';
import { el, store } from './util.js';

const LAT = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
const RU = ['до', 'до♯', 'ре', 'ми♭', 'ми', 'фа', 'фа♯', 'соль', 'соль♯', 'ля', 'си♭', 'си'];
const mod12 = (m) => ((m % 12) + 12) % 12;
const isBlack = (m) => [1, 3, 6, 8, 10].includes(mod12(m));
const oct = (m) => Math.floor(m / 12) - 1;
// размер клавиатуры → её первая клавиша по умолчанию (MPK mini и другие 25-клавишные — от C3)
const KEYBOARDS = { 25: 48, 32: 53, 37: 48, 49: 36, 61: 36, 76: 28, 88: 21 };
const DEF = { hand: 'R', auto: true, mode: 'wait', speed: 70, kb: 25, lo: 48, fit: true, labels: 'lat', snd: 'piano', guide: false, metro: false, ramp: false };
const COL = { R: '#4f8cff', L: '#8b6cff', ok: '#3ccf91', bad: '#ff5d5d', press: '#38d6ff' };
const LOOK = 6; // сколько долей видно над клавиатурой
// клавиши компьютера (по положению, раскладка не важна): нижний ряд — от первой «до» клавиатуры, верхний — октавой выше
const PC_KEYS = {
  KeyZ: 0, KeyS: 1, KeyX: 2, KeyD: 3, KeyC: 4, KeyV: 5, KeyG: 6, KeyB: 7, KeyH: 8, KeyN: 9, KeyJ: 10, KeyM: 11, Comma: 12, KeyL: 13, Period: 14, Semicolon: 15, Slash: 16,
  KeyQ: 12, Digit2: 13, KeyW: 14, Digit3: 15, KeyE: 16, KeyR: 17, Digit5: 18, KeyT: 19, Digit6: 20, KeyY: 21, Digit7: 22, KeyU: 23, KeyI: 24, Digit9: 25, KeyO: 26, Digit0: 27, KeyP: 28, BracketLeft: 29, Equal: 30, BracketRight: 31,
};
const I = (n, fill = false) => icon(n, { fill });

export function init() {
  document.querySelectorAll('.fall-picker').forEach(picker);
  document.querySelectorAll('.fall[data-slug]').forEach((root) => {
    const api = mount(root);
    // риффы частей и мелодия есть только в /data/play/<слаг>.json
    fetch(`/data/play/${root.dataset.slug}.json`)
      .then((r) => r.json())
      .then((d) => api.setPart(pianoPart(d)))
      .catch((err) => api.fail(err));
  });
}

// ---------- сам тренажёр ----------
function mount(root) {
  const cfg = { ...DEF, ...store.get('fall', {}) };
  const save = () => store.set('fall', cfg);
  let part = null;
  let notes = [];
  let groups = [];
  let mineCount = 0;
  let st = 0;
  let playing = false;
  let waiting = false;
  let gi = 0;
  let ai = 0;
  let mi = 0;
  let loop = null; // отрывок для повтора: { from, to } в долях
  let loopOn = false;
  let listening = null; // «Послушать»: сайт играет отрывок сам — { to, back }
  let pass = null; // счёт на начале круга отрывка
  const passes = []; // точность прошлых кругов, %
  let lastNow = 0;
  let raf = 0;
  let pedal = false;
  let learnLo = false;
  let shift = 0;
  const score = { hit: 0, miss: 0, wrong: 0, streak: 0, best: 0 };
  const down = new Set();
  const sounding = new Map();
  const sustained = new Set();
  const flashes = new Map();

  // --- разметка ---
  root.textContent = '';
  const playBtn = el('button', { type: 'button', class: 'btn btn-play fl-play', html: `${I('play', true)}<span>Играть</span>` });
  const backBtn = el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Сначала', title: 'Сначала', html: I('undo-2') });
  const barBack = el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Такт назад', title: 'Такт назад (←)', html: I('skip-back', true) });
  const barFwd = el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Такт вперёд', title: 'Такт вперёд (→)', html: I('skip-forward', true) });
  const aBtn = el('button', { type: 'button', class: 'btn btn-small btn-ghost', title: 'Отрывок начнётся с такта, где сейчас ноты' }, 'Начало отрывка');
  const bBtn = el('button', { type: 'button', class: 'btn btn-small btn-ghost', title: 'Отрывок закончится этим тактом' }, 'Конец отрывка');
  const clearBtn = el('button', { type: 'button', class: 'btn btn-small btn-ghost', hidden: true }, 'Убрать отрывок');
  const listenBtn = el('button', { type: 'button', class: 'btn btn-small btn-ghost', title: 'Сайт сыграет отрывок (или часть) целиком — потом ваша очередь', html: `${I('headphones')}<span>Послушать</span>` });
  const guideTg = el('button', { type: 'button', class: 'tg', title: 'Ваши ноты тоже звучат — тихо, как подсказка на слух' }, 'Подсказка звуком');
  const metroTg = el('button', { type: 'button', class: 'tg', title: 'Щелчок на каждую долю, на первую — громче' }, 'Метроном');
  const rampTg = el('button', { type: 'button', class: 'tg', title: 'После круга отрывка без ошибок (от 90 %) скорость +5 %, пока не дойдёт до 100 %' }, 'Темп растёт');
  const tlLoop = el('i', { class: 'fl-tl-loop', hidden: true });
  const tlHead = el('i', { class: 'fl-tl-head' });
  const tl = el('div', { class: 'fl-tl', title: 'Нажмите — перейти к такту; протяните — выбрать отрывок для повтора' }, tlLoop, tlHead);
  const tlInfo = el('div', { class: 'fl-tl-info muted small' });
  const seg = (name, items, key) => {
    const box = el('div', { class: 'seg', role: 'group', 'aria-label': name });
    for (const [v, label] of items) {
      const b = el('button', { type: 'button', 'data-v': v }, label);
      b.addEventListener('click', () => {
        cfg[key] = v;
        save();
        drawSeg();
        prepare(true);
      });
      box.append(b);
    }
    return box;
  };
  const modeSeg = seg('Режим', [['wait', 'Ждёт меня'], ['tempo', 'В темпе'], ['watch', 'Смотреть']], 'mode');
  const handSeg = seg('Рука', [['R', 'Правая'], ['L', 'Левая'], ['both', 'Обе']], 'hand');
  const autoTg = el('button', { type: 'button', class: 'tg', title: 'Ноты другой руки играет сайт — на маленькой клавиатуре это бас' }, 'Вторую руку играет сайт');
  const speedIn = el('input', { type: 'range', min: 25, max: 120, step: 5, value: cfg.speed, 'aria-label': 'Скорость' });
  const speedOut = el('output', {}, `${cfg.speed} %`);
  const kbSel = el('select', { 'aria-label': 'Моя клавиатура' }, Object.keys(KEYBOARDS).map((k) => el('option', { value: k }, `${k} клавиш${k === '25' ? ' — 2 октавы' : k === '37' ? ' — 3 октавы' : k === '88' ? ' — полная' : ''}`)));
  const loBtn = el('button', { type: 'button', class: 'btn btn-small btn-ghost', title: 'Нажмите, потом самую левую клавишу на своей клавиатуре' });
  const fitTg = el('button', { type: 'button', class: 'tg', title: 'Ноты, которых нет на вашей клавиатуре, переносятся на октаву' }, 'Уложить в мою клавиатуру');
  const labelSel = el('select', { 'aria-label': 'Подписи нот' }, el('option', { value: 'lat' }, 'C D E'), el('option', { value: 'ru' }, 'до ре ми'), el('option', { value: 'off' }, 'без подписей'));
  const sndSel = el('select', { 'aria-label': 'Звук' }, K.SOUNDS.filter((s) => !s.kit && !s.custom).map((s) => el('option', { value: s.id }, s.name)));
  const secSel = el('select', { 'aria-label': 'Часть песни' });
  const loopTg = el('button', { type: 'button', class: 'tg', title: 'Повторять отрывок по кругу; если отрывка нет — часть, где сейчас ноты' }, 'Повторять');
  const led = el('i', { class: 'mk-led' });
  const midiTxt = el('span', { class: 'fl-midi-t' }, 'MIDI-клавиатура не подключена');
  const midiBtn = el('button', { type: 'button', class: 'btn btn-small btn-ghost', html: `${I('usb')}<span>Подключить</span>` });
  const now = el('div', { class: 'fl-now' });
  const stat = el('div', { class: 'fl-stat', 'aria-live': 'polite' });
  const cv = el('canvas', { class: 'fl-cv' });
  const stage = el('div', { class: 'fl-stage' }, cv);
  const off = el('div', { class: 'mk-off', hidden: true }, 'Браузер выключил звук до первого нажатия — нажмите в любом месте страницы.');
  const lbl = (t, ...kids) => el('label', { class: 'ctl-select' }, el('span', { class: 'ctl-label' }, t), ...kids);
  root.append(
    el('div', { class: 'fl-midi' }, led, midiTxt, midiBtn),
    el('div', { class: 'fl-bar' }, playBtn, backBtn, barBack, barFwd, modeSeg, handSeg, autoTg),
    el('div', { class: 'fl-bar fl-learn' }, el('span', { class: 'ctl-label' }, 'Учить'), aBtn, bBtn, loopTg, clearBtn, listenBtn, guideTg, metroTg, rampTg),
    el(
      'div',
      { class: 'fl-bar fl-bar2' },
      el('label', { class: 'ctl-slider' }, el('span', { class: 'ctl-label' }, 'Скорость'), speedIn, speedOut),
      lbl('Часть', secSel),
      lbl('Клавиатура', kbSel),
      loBtn,
      fitTg,
      lbl('Подписи', labelSel),
      lbl('Звук', sndSel),
    ),
    off,
    el('div', { class: 'fl-info' }, now, stat),
    tl,
    tlInfo,
    stage,
    el('p', { class: 'muted small fl-hint' }, 'Синие ноты — правая рука, фиолетовые — левая; бледные играет сайт. Перемотка: ← → по тактам, колесо мыши или протяжка по нотам; пробел — пауза. Отрывок для повтора — протяните по полоске над нотами или «Начало / Конец отрывка». Без MIDI — мышью по клавишам или клавишами компьютера: Z S X D C V… — нижняя октава, Q 2 W 3 E… — верхняя. Пэды 1–4 MPK mini: старт/пауза, сначала, медленнее, быстрее.'),
  );

  const g = cv.getContext('2d');
  let W = 0;
  let fallH = 0;
  let kbH = 0;
  let dpr = 1;
  let rangeLo = 48;
  let rangeHi = 72;
  let keys = new Map();
  let theme = {};

  // --- настройки на экране ---
  function drawSeg() {
    for (const [box, key] of [[modeSeg, 'mode'], [handSeg, 'hand']]) for (const b of box.children) b.classList.toggle('on', b.dataset.v === cfg[key]);
    autoTg.setAttribute('aria-pressed', String(cfg.auto));
    autoTg.disabled = mode() === 'watch' || cfg.hand === 'both';
    fitTg.setAttribute('aria-pressed', String(cfg.fit));
    loopTg.setAttribute('aria-pressed', String(loopOn));
    clearBtn.hidden = !loop;
    for (const [b, k] of [[guideTg, 'guide'], [metroTg, 'metro'], [rampTg, 'ramp']]) b.setAttribute('aria-pressed', String(!!cfg[k]));
    listenBtn.innerHTML = listening ? `${I('square', true)}<span>Хватит слушать</span>` : `${I('headphones')}<span>Послушать</span>`;
    kbSel.value = String(cfg.kb);
    labelSel.value = cfg.labels;
    sndSel.value = cfg.snd;
    loBtn.textContent = learnLo ? 'Нажмите самую левую клавишу…' : `Первая клавиша: ${LAT[mod12(cfg.lo)]}${oct(cfg.lo)}`;
  }
  autoTg.addEventListener('click', () => {
    cfg.auto = !cfg.auto;
    save();
    drawSeg();
    prepare(true);
  });
  fitTg.addEventListener('click', () => {
    cfg.fit = !cfg.fit;
    save();
    drawSeg();
    prepare(true);
  });
  speedIn.addEventListener('input', () => {
    cfg.speed = Number(speedIn.value);
    speedOut.textContent = `${cfg.speed} %`;
    save();
  });
  kbSel.addEventListener('change', () => {
    cfg.kb = Number(kbSel.value);
    cfg.lo = KEYBOARDS[cfg.kb];
    save();
    drawSeg();
    prepare(true);
  });
  loBtn.addEventListener('click', () => {
    learnLo = !learnLo;
    drawSeg();
  });
  labelSel.addEventListener('change', () => {
    cfg.labels = labelSel.value;
    save();
    draw();
  });
  sndSel.addEventListener('change', () => {
    cfg.snd = sndSel.value;
    save();
    K.load(cfg.snd);
  });
  // --- отрывок для повтора, перемотка по тактам ---
  const barIdx = (t) => {
    let i = 0;
    for (let k = 0; k < part.bars.length; k++) if (part.bars[k].t <= t + 1e-6) i = k;
    return i;
  };
  const barT = (i) => (i >= part.bars.length ? part.total : part.bars[Math.max(0, i)].t);
  const sectionRange = (t) => {
    const secs = part.sections;
    let i = 0;
    secs.forEach((x, k) => x.t <= t + 1e-6 && (i = k));
    return { from: secs[i].t, to: secs.slice(i + 1).find((x) => x.t > secs[i].t)?.t ?? part.total };
  };
  function setRegion(from, to, on = true) {
    if (to < from) [from, to] = [to, from];
    if (to - from < 0.5) to = barT(barIdx(from) + 1);
    loop = { from, to };
    loopOn = on;
    passes.length = 0;
    drawSeg();
    drawTimeline();
  }
  function setSpeed(v) {
    cfg.speed = Math.max(25, Math.min(120, v));
    speedIn.value = cfg.speed;
    speedOut.textContent = `${cfg.speed} %`;
    save();
  }
  secSel.addEventListener('change', () => {
    if (secSel.value !== '' && loop) {
      const r = sectionRange(part.sections[Number(secSel.value)].t);
      setRegion(r.from, r.to, loopOn);
    }
    drawSeg();
    restart();
  });
  loopTg.addEventListener('click', () => {
    if (!part) return;
    if (!loop) {
      const r = sectionRange(secSel.value !== '' ? part.sections[Number(secSel.value)].t : Math.max(0, st));
      setRegion(r.from, r.to, true);
    } else {
      loopOn = !loopOn;
      passes.length = 0;
      drawSeg();
      drawTimeline();
    }
  });
  aBtn.addEventListener('click', () => {
    if (!part) return;
    const from = barT(barIdx(Math.max(0, st)));
    setRegion(from, loop && loop.to > from + 0.5 ? loop.to : Math.min(part.total, barT(barIdx(from) + 4)));
  });
  bBtn.addEventListener('click', () => {
    if (!part) return;
    const to = barT(barIdx(Math.max(0, st - 0.01)) + 1);
    setRegion(loop && loop.from < to - 0.5 ? loop.from : barT(Math.max(0, barIdx(to - 0.01) - 3)), to);
  });
  clearBtn.addEventListener('click', () => {
    loop = null;
    loopOn = false;
    passes.length = 0;
    drawSeg();
    drawTimeline();
  });
  for (const [b, k] of [[guideTg, 'guide'], [metroTg, 'metro'], [rampTg, 'ramp']])
    b.addEventListener('click', () => {
      cfg[k] = !cfg[k];
      save();
      drawSeg();
    });
  // «Послушать»: сайт играет отрывок (или часть) всеми нотами, потом возвращает к его началу
  listenBtn.addEventListener('click', () => {
    if (!part) return;
    unlock();
    if (listening) return endListen();
    const r = loop || (secSel.value !== '' ? sectionRange(part.sections[Number(secSel.value)].t) : sectionRange(Math.max(0, st)));
    listening = { to: r.to, back: r.from };
    prepare(true);
    seek(r.from - lead(), false);
    playing = true;
    drawSeg();
    drawPlay();
    kick();
  });
  function endListen() {
    const back = listening.back;
    listening = null;
    playing = false;
    silence(false);
    prepare(true);
    seek(back - lead(), false);
    drawSeg();
    drawPlay();
  }
  function stepBar(d) {
    if (!part) return;
    unlock();
    const i = barIdx(Math.max(0, st + 0.01));
    // назад: если такт уже начался — к его началу, иначе к предыдущему
    const target = d < 0 && st - barT(i) > 0.75 ? barT(i) : barT(Math.max(0, i + d));
    seek(Math.min(target, part.total), false);
    drawPlay();
  }
  barBack.addEventListener('click', () => stepBar(-1));
  barFwd.addEventListener('click', () => stepBar(1));

  // полоска времени над нотами: части, отрывок, где сейчас
  function drawTimeline() {
    if (!part) return;
    tl.querySelectorAll('.fl-tl-sec').forEach((e) => e.remove());
    const T = part.total || 1;
    part.sections.forEach((x, i) => {
      const end = part.sections[i + 1]?.t ?? T;
      tl.insertBefore(el('span', { class: 'fl-tl-sec', style: `left:${(x.t / T) * 100}%;width:${((end - x.t) / T) * 100}%`, title: x.name }, x.name), tlLoop);
    });
    tlLoop.hidden = !loop;
    if (loop) {
      tlLoop.style.left = `${(loop.from / T) * 100}%`;
      tlLoop.style.width = `${((loop.to - loop.from) / T) * 100}%`;
      tlLoop.classList.toggle('off', !loopOn);
    }
    drawHead(true);
  }
  let headText = '';
  function drawHead(force = false) {
    if (!part) return;
    tlHead.style.left = `${Math.max(0, Math.min(1, st / (part.total || 1))) * 100}%`;
    const bi = barIdx(Math.max(0, st));
    const txt = [`Такт ${bi + 1} из ${part.bars.length}`, loop ? `отрывок: такты ${barIdx(loop.from) + 1}–${barIdx(loop.to - 0.01) + 1}${loopOn ? ', по кругу' : ''}` : '', passes.length ? `кругов ${passes.length}, последний ${passes[passes.length - 1]} %` : '', listening ? 'слушаем' : ''].filter(Boolean).join(' · ');
    if (force || txt !== headText) tlInfo.textContent = headText = txt;
  }
  let tlDrag = null;
  const tAt = (x) => {
    const r = tl.getBoundingClientRect();
    return Math.max(0, Math.min(1, (x - r.left) / r.width)) * part.total;
  };
  tl.addEventListener('pointerdown', (e) => {
    if (!part) return;
    tl.setPointerCapture?.(e.pointerId);
    tlDrag = { x: e.clientX, t0: tAt(e.clientX), moved: false };
  });
  tl.addEventListener('pointermove', (e) => {
    if (!tlDrag) return;
    if (!tlDrag.moved && Math.abs(e.clientX - tlDrag.x) < 6) return;
    tlDrag.moved = true;
    const t1 = tAt(e.clientX);
    loop = { from: barT(barIdx(Math.min(tlDrag.t0, t1))), to: barT(barIdx(Math.max(tlDrag.t0, t1)) + 1) };
    loopOn = true;
    drawTimeline();
  });
  tl.addEventListener('pointerup', (e) => {
    if (!tlDrag) return;
    const d = tlDrag;
    tlDrag = null;
    unlock();
    if (d.moved) {
      passes.length = 0;
      drawSeg();
      seek(loop.from - lead(), false);
    } else seek(barT(barIdx(tAt(e.clientX))), false);
    drawPlay();
  });

  // --- MIDI ---
  const drawMidi = () => {
    const s = K.state;
    led.className = 'mk-led' + (s.status === 'ok' ? ' ok' : s.status === 'none' ? ' wait' : '');
    midiBtn.hidden = s.status === 'ok' || s.status === 'none' || s.status === 'unsupported';
    midiTxt.textContent =
      s.status === 'ok' ? `MIDI: ${s.inputs.map((i) => i.name).join(', ')}` : s.status === 'none' ? 'Доступ к MIDI есть, клавиатура не найдена — подключите её кабелем' : s.status === 'denied' ? 'Доступ к MIDI не разрешён — разрешите «MIDI-устройства» в настройках сайта' : s.status === 'unsupported' ? 'Браузер не умеет MIDI (Safari, iPhone) — играйте мышью или с клавиатуры компьютера' : 'MIDI-клавиатура не подключена';
  };
  K.on('midi', drawMidi);
  let ledT = 0;
  K.on('msg', () => {
    led.classList.add('hit');
    clearTimeout(ledT);
    ledT = setTimeout(() => led.classList.remove('hit'), 90);
  });
  midiBtn.addEventListener('click', () => {
    unlock();
    K.connect();
  });
  if (!navigator.requestMIDIAccess) K.state.status = 'unsupported';
  else navigator.permissions?.query({ name: 'midi' }).then((p) => p.state === 'granted' && K.connect(true)).catch(() => {});
  drawMidi();
  K.take((e) => {
    if (!root.isConnected || !visible()) return;
    if (e.on != null && e.ch === 9) {
      // пэды MPK mini (10-й канал): 1 — старт/пауза, 2 — сначала, 3 — медленнее, 4 — быстрее
      if (!e.on) return;
      const pad = e.note - 36;
      if (pad === 0) toggle();
      else if (pad === 1) restart();
      else if (pad === 2 || pad === 3) setSpeed(cfg.speed + (pad === 2 ? -5 : 5));
      return;
    }
    if (e.on && learnLo) {
      learnLo = false;
      cfg.lo = e.note;
      save();
      drawSeg();
      prepare(true);
      return;
    }
    if (e.on != null) return e.on ? press(e.note, e.vel) : lift(e.note);
    if (e.cc === 64) setPedal(e.val >= 64);
    else if (e.cc === 120 || e.cc === 123) silence();
  });

  const unlock = () => {
    const c = K.engine();
    if (c.state !== 'running') c.resume().then(() => (off.hidden = true));
    K.load(cfg.snd);
  };
  root.addEventListener('pointerdown', unlock);

  // режим сейчас: во время «Послушать» всё играет сайт
  const mode = () => (listening ? 'watch' : cfg.mode);

  // --- партия ---
  function prepare(keepPos = false) {
    if (!part) return;
    const mine = mode() === 'watch' ? [] : cfg.hand === 'both' ? ['R', 'L'] : [cfg.hand];
    const lo = cfg.lo;
    const hi = cfg.lo + cfg.kb - 1;
    const seen = new Set();
    // сначала вся партия своей руки сдвигается на октаву-другую, чтобы влезло больше нот (мелодия не ломается),
    // и только то, что всё равно не влезло, переносится по одной ноте
    shift = 0;
    if (mine.length && cfg.fit) {
      let best = -1;
      for (const k of [0, -12, 12, -24, 24, -36, 36]) {
        const c = part.notes.filter((n) => mine.includes(n.h) && n.m + k >= lo && n.m + k <= hi).length;
        if (c > best) [best, shift] = [c, k];
      }
    }
    notes = [];
    for (const n of part.notes) {
      const my = mine.includes(n.h);
      let m = my ? n.m + shift : n.m;
      if (my && cfg.fit) {
        while (m < lo) m += 12;
        while (m > hi) m -= 12;
      }
      // после переноса на октаву одна и та же клавиша в один момент — одна нота
      const key = `${my ? 'y' : 'n'}${Math.round(n.t * 64)}:${m}`;
      if (seen.has(key)) continue;
      seen.add(key);
      notes.push({ t: n.t, d: n.d, m, m0: n.m, h: n.h, mine: my, auto: !my && (mode() === 'watch' || cfg.auto || cfg.hand === 'both'), state: 0 });
    }
    notes.sort((a, b) => a.t - b.t || a.m - b.m);
    groups = [];
    for (const n of notes) {
      if (!n.mine) continue;
      const last = groups[groups.length - 1];
      if (last && n.t - last.t < 0.06) last.notes.push(n);
      else groups.push({ t: n.t, notes: [n] });
    }
    mineCount = groups.reduce((s, x) => s + x.notes.length, 0);
    let a = 127;
    let z = 0;
    for (const n of notes) {
      a = Math.min(a, n.m);
      z = Math.max(z, n.m);
    }
    if (mine.length && cfg.fit) {
      a = Math.min(a, lo);
      z = Math.max(z, Math.min(hi, a + 36));
    }
    rangeLo = a - mod12(a);
    rangeHi = z + (11 - mod12(z));
    if (rangeHi - rangeLo < 23) rangeHi = rangeLo + 23;
    layout();
    seek(keepPos ? Math.max(st, startOf()) : startOf() - lead(), !keepPos);
  }

  const lead = () => Math.min(part?.beatsPerBar || 4, 4);
  const startOf = () => (loop && loopOn ? loop.from : secSel.value === '' ? 0 : part.sections[Number(secSel.value)]?.t ?? 0);
  const bps = () => ((part?.bpm || 80) / 60) * (cfg.speed / 100);
  const firstAt = (t) => {
    let a = 0;
    let z = notes.length;
    while (a < z) {
      const c = (a + z) >> 1;
      if (notes[c].t < t) a = c + 1;
      else z = c;
    }
    return a;
  };

  // перейти на долю t: всё, что дальше, — снова не сыграно
  function seek(t, resetScore) {
    silence();
    st = t;
    waiting = false;
    for (const n of notes) if (n.t >= t - 1e-6) n.state = 0;
    gi = groups.findIndex((x) => x.t >= t - 1e-6);
    if (gi < 0) gi = groups.length;
    ai = firstAt(t);
    mi = ai;
    if (resetScore) Object.assign(score, { hit: 0, miss: 0, wrong: 0, streak: 0, best: 0 });
    pass = { hit: score.hit, miss: score.miss, wrong: score.wrong };
    drawStat();
    drawHead();
    draw();
  }

  function restart() {
    if (!part) return;
    seek(startOf() - lead(), true);
  }

  function toggle() {
    if (!part) return;
    unlock();
    if (playing) return pause();
    if (st >= part.total) seek(startOf() - lead(), true);
    // отрывок включён, а ноты не в нём — начинаем с его начала
    else if (loop && loopOn && (st < loop.from - lead() - 0.01 || st >= loop.to)) seek(loop.from - lead(), false);
    playing = true;
    lastNow = performance.now();
    drawPlay();
    kick();
  }
  function pause() {
    playing = false;
    silence(false);
    drawPlay();
    draw();
  }
  const drawPlay = () => {
    playBtn.innerHTML = playing ? `${I('pause', true)}<span>Пауза</span>` : `${I('play', true)}<span>${st > startOf() && part && st < part.total ? 'Дальше' : 'Играть'}</span>`;
  };
  playBtn.addEventListener('click', toggle);
  backBtn.addEventListener('click', () => {
    unlock();
    restart();
    drawPlay();
  });

  // --- ход времени ---
  function kick() {
    if (!raf) {
      lastNow = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }
  function frame(t) {
    raf = 0;
    const dt = Math.min(0.1, (t - lastNow) / 1000);
    lastNow = t;
    if (playing) advance(dt);
    draw();
    drawHead();
    if (playing || flashes.size) raf = requestAnimationFrame(frame);
  }

  function pending() {
    while (gi < groups.length && groups[gi].notes.every((n) => n.state === 1)) gi++;
    return groups[gi];
  }

  function advance(dt) {
    if (!part) return;
    const speed = bps();
    if (waiting) {
      if (!pending() || pending().t > st + 1e-6) waiting = false;
      else return;
    }
    let to = st + dt * speed;
    if (mode() === 'wait') {
      const gr = pending();
      if (gr && to >= gr.t) {
        to = gr.t;
        waiting = true;
        if (cfg.guide) for (const n of gr.notes) if (n.state === 0) hint(n, speed);
      }
    }
    autoPlay(st, to, speed);
    if (cfg.metro) metronome(st, to, speed);
    st = to;
    if (mode() === 'tempo') misses(speed);
    if (listening && st >= listening.to) return endListen();
    if (loop && loopOn && st >= loop.to) return loopEnd();
    if (st >= part.total + 0.5) finish();
  }

  // круг отрывка закончился: точность круга, «Темп растёт», снова с начала отрывка
  function loopEnd() {
    const p = pass || { hit: 0, miss: 0, wrong: 0 };
    const hit = score.hit - p.hit;
    const tot = hit + (score.miss - p.miss) + (score.wrong - p.wrong);
    if (mode() !== 'watch' && tot) {
      const acc = Math.round((100 * hit) / tot);
      passes.push(acc);
      if (cfg.ramp && acc >= 90 && cfg.speed < 100) setSpeed(Math.min(100, cfg.speed + 5));
    }
    seek(loop.from - lead(), false);
    drawHead(true);
  }

  // своя нота тихо — подсказка на слух
  function hint(n, speed) {
    const vc = K.play(cfg.snd, n.m, 42, null, 'B');
    K.stop(vc, K.now() + Math.min(0.7, Math.max(0.15, n.d / speed)));
  }

  // метроном: щелчок на каждую долю в [from, to), на начало такта — громче
  function metronome(from, to, speed) {
    const bpb = part.beatsPerBar || 4;
    const base = K.now() + 0.03;
    for (let b = Math.ceil(from - 1e-9); b < to; b++) {
      if (b < -lead()) continue;
      const inBar = ((b % bpb) + bpb) % bpb;
      click(base + (b - from) / speed, inBar < 1e-6, 0.8);
    }
  }

  // ноты, которые играет сайт: те, что начинаются в [from, to)
  function autoPlay(from, to, speed) {
    const base = K.now() + 0.03;
    while (ai < notes.length && notes[ai].t < to) {
      const n = notes[ai++];
      if (n.t < from - 1e-6) continue;
      if (!n.auto) {
        if (cfg.guide && n.mine && mode() === 'tempo') {
          const w = base + (n.t - from) / speed;
          const vc = K.play(cfg.snd, n.m, 42, w, 'B');
          K.stop(vc, w + Math.min(0.7, Math.max(0.15, n.d / speed)));
        }
        continue;
      }
      const when = base + (n.t - from) / speed;
      const vc = K.play(cfg.snd, n.m0, n.h === 'L' ? 62 : 74, when, 'B');
      K.stop(vc, when + Math.max(0.08, n.d / speed));
      flashOn(n.m, 'auto', (n.t - from) / speed, n.d / speed);
    }
  }

  function misses(speed) {
    const tol = 0.2 * speed;
    while (mi < notes.length && notes[mi].t < st - tol) {
      const n = notes[mi++];
      if (n.mine && n.state === 0) {
        n.state = 2;
        score.miss++;
        score.streak = 0;
      }
    }
    drawStat();
  }

  function finish() {
    playing = false;
    silence(false);
    drawPlay();
    const tot = score.hit + score.miss;
    stat.textContent = mode() === 'watch' || !mineCount ? 'Готово!' : `Готово! Попаданий ${score.hit} из ${mineCount}${tot ? ` (${Math.round((score.hit / Math.max(1, mode() === 'wait' ? mineCount : tot)) * 100)} %)` : ''} · лучшая серия ${score.best}${score.wrong ? ` · мимо ${score.wrong}` : ''}`;
  }

  // --- игра человека ---
  function press(m, vel = 96) {
    unlock();
    const prev = sounding.get(m);
    if (prev) K.stop(prev, null, true);
    sounding.set(m, K.play(cfg.snd, m, vel, null, 'A'));
    down.add(m);
    judge(m);
    kick();
  }
  function lift(m) {
    down.delete(m);
    const vc = sounding.get(m);
    sounding.delete(m);
    if (vc) pedal ? sustained.add(vc) : K.stop(vc);
    kick();
  }
  function setPedal(on) {
    pedal = on;
    if (!on) {
      for (const v of sustained) K.stop(v);
      sustained.clear();
    }
  }
  function silence(all = true) {
    if (all) {
      for (const v of sounding.values()) K.stop(v, null, true);
      sounding.clear();
    }
    for (const v of sustained) K.stop(v, null, true);
    sustained.clear();
    K.hush();
  }

  function judge(m) {
    if (!part || !playing || mode() === 'watch' || !mineCount) return;
    const speed = bps();
    let best = null;
    if (mode() === 'wait') {
      const gr = pending();
      // можно чуть раньше: за долю до линии
      if (gr && (waiting || gr.t - st <= 1)) best = gr.notes.find((n) => n.state === 0 && n.m === m);
    } else {
      const tol = 0.2 * speed;
      for (let i = firstAt(st - tol); i < notes.length && notes[i].t <= st + tol; i++) {
        const n = notes[i];
        if (n.mine && n.state === 0 && n.m === m && (!best || Math.abs(n.t - st) < Math.abs(best.t - st))) best = n;
      }
    }
    if (best) {
      best.state = 1;
      score.hit++;
      score.streak++;
      score.best = Math.max(score.best, score.streak);
      flashOn(m, 'ok', 0, 0.22);
      if (waiting && pending() !== groups[gi]) waiting = false;
      if (waiting && groups[gi].notes.every((n) => n.state === 1)) waiting = false;
    } else {
      score.wrong++;
      score.streak = 0;
      flashOn(m, 'bad', 0, 0.25);
    }
    drawStat();
  }

  function flashOn(m, kind, delay, dur) {
    const t0 = performance.now() + delay * 1000;
    const list = flashes.get(m) || [];
    list.push({ kind, from: t0, to: t0 + Math.max(0.08, dur) * 1000 });
    flashes.set(m, list);
    kick();
  }

  function drawStat() {
    if (!part) return;
    const ch = [...part.chords].reverse().find((c) => c.t <= st + 0.01);
    const sec = [...part.sections].reverse().find((s) => s.t <= Math.max(0, st) + 0.01);
    now.textContent = [sec?.name, ch?.name, shift ? `ваша рука ${Math.abs(shift) / 12 > 1 ? `на ${Math.abs(shift) / 12} октавы` : 'на октаву'} ${shift < 0 ? 'ниже' : 'выше'}` : ''].filter(Boolean).join(' · ');
    if (mode() === 'watch' || !mineCount) {
      stat.textContent = 'Слушайте и смотрите — играет сайт';
      return;
    }
    const tot = score.hit + score.miss;
    stat.textContent = `Попаданий ${score.hit}${tot && mode() === 'tempo' ? ` из ${tot} · ${Math.round((score.hit / tot) * 100)} %` : ''} · серия ${score.streak}${score.wrong ? ` · мимо ${score.wrong}` : ''}`;
  }

  // --- мышь и клавиатура компьютера ---
  const visible = () => root.offsetParent !== null;
  const keyAt = (x, y) => {
    if (y < fallH) return null;
    const ky = y - fallH;
    if (ky < kbH * 0.62) for (const [m, k] of keys) if (k.black && x >= k.x && x < k.x + k.w) return m;
    for (const [m, k] of keys) if (!k.black && x >= k.x && x < k.x + k.w) return m;
    return null;
  };
  const touches = new Map();
  // по нотам: нажатие — пауза/дальше, протяжка вверх-вниз — перемотка (вниз — вперёд, как падают ноты)
  let scrub = null;
  cv.addEventListener('pointerdown', (e) => {
    const r = cv.getBoundingClientRect();
    const m = keyAt(e.clientX - r.left, e.clientY - r.top);
    if (m == null) {
      if (e.clientY - r.top < fallH && part) {
        cv.setPointerCapture?.(e.pointerId);
        scrub = { id: e.pointerId, y: e.clientY, st0: st, moved: false };
      }
      return;
    }
    e.preventDefault();
    cv.setPointerCapture?.(e.pointerId);
    touches.set(e.pointerId, m);
    press(m, Math.round(50 + 70 * Math.min(1, (e.clientY - r.top - fallH) / kbH)));
  });
  cv.addEventListener('pointermove', (e) => {
    if (scrub?.id === e.pointerId) {
      const dy = e.clientY - scrub.y;
      if (!scrub.moved && Math.abs(dy) < 5) return;
      if (!scrub.moved && playing) pause();
      scrub.moved = true;
      st = Math.max(-lead(), Math.min(part.total, scrub.st0 + dy / (fallH / LOOK)));
      draw();
      drawHead();
      return;
    }
    if (!touches.has(e.pointerId)) return;
    const r = cv.getBoundingClientRect();
    const m = keyAt(e.clientX - r.left, e.clientY - r.top);
    const was = touches.get(e.pointerId);
    if (m === was) return;
    if (was != null) lift(was);
    if (m != null) press(m, 90);
    touches.set(e.pointerId, m);
  });
  const up = (e) => {
    if (scrub?.id === e.pointerId) {
      const s0 = scrub;
      scrub = null;
      if (s0.moved) {
        seek(st, false);
        drawPlay();
      } else toggle();
      return;
    }
    if (!touches.has(e.pointerId)) return;
    const was = touches.get(e.pointerId);
    touches.delete(e.pointerId);
    if (was != null) lift(was);
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  // колесо мыши над нотами — перемотка (ставит на паузу): вниз — назад, вверх — вперёд
  cv.addEventListener(
    'wheel',
    (e) => {
      const r = cv.getBoundingClientRect();
      if (!part || e.clientY - r.top > fallH) return;
      e.preventDefault();
      if (playing) pause();
      seek(Math.max(-lead(), Math.min(part.total, st - (e.deltaY / (fallH / LOOK)) * 0.6)), false);
      drawPlay();
    },
    { passive: false },
  );
  const typing = (t) => t.closest?.('input, textarea, select, [contenteditable]');
  addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target) || !visible()) return;
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      e.preventDefault();
      stepBar(e.code === 'ArrowLeft' ? -1 : 1);
      return;
    }
    if (e.code === 'Space' && !e.target.closest?.('button, a, summary')) {
      e.preventDefault();
      if (!e.repeat) toggle();
      return;
    }
    const k = PC_KEYS[e.code];
    if (k == null) return;
    e.preventDefault();
    if (!e.repeat) press(cfg.lo - mod12(cfg.lo) + k, 96);
  });
  addEventListener('keyup', (e) => {
    const k = PC_KEYS[e.code];
    if (k != null && down.has(cfg.lo - mod12(cfg.lo) + k)) lift(cfg.lo - mod12(cfg.lo) + k);
  });

  // --- рисование ---
  function readTheme() {
    const cs = getComputedStyle(root);
    const v = (n, d) => cs.getPropertyValue(n).trim() || d;
    theme = { bg: v('--bg', '#070b13'), lane: v('--surface', '#0f1624'), line: v('--line-strong', '#2a3852'), ink: v('--ink-2', '#b3bfd3'), ink3: v('--ink-3', '#7a879e') };
  }
  new MutationObserver(() => {
    readTheme();
    draw();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  function layout() {
    const w = stage.clientWidth;
    if (!w) return;
    readTheme();
    dpr = window.devicePixelRatio || 1;
    const whites = [];
    for (let m = rangeLo; m <= rangeHi; m++) if (!isBlack(m)) whites.push(m);
    const ww = w / whites.length;
    kbH = Math.round(Math.max(64, Math.min(130, ww * 4.4)));
    fallH = Math.round(Math.max(230, Math.min(460, w * 0.4)));
    W = w;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round((fallH + kbH) * dpr);
    cv.style.height = `${fallH + kbH}px`;
    keys = new Map();
    whites.forEach((m, i) => keys.set(m, { x: i * ww, w: ww, black: false }));
    const bw = ww * 0.62;
    for (let m = rangeLo; m <= rangeHi; m++) if (isBlack(m) && keys.has(m - 1)) keys.set(m, { x: keys.get(m - 1).x + ww - bw / 2, w: bw, black: true });
    draw();
  }
  new ResizeObserver(() => layout()).observe(stage);

  const rr = (x, y, w, h, r) => {
    g.beginPath();
    g.roundRect ? g.roundRect(x, y, w, h, Math.min(r, h / 2, w / 2)) : g.rect(x, y, w, h);
  };
  const nameOf = (m) => (cfg.labels === 'ru' ? RU[mod12(m)] : LAT[mod12(m)]);

  function draw() {
    if (!W) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = theme.bg;
    g.fillRect(0, 0, W, fallH);
    // дорожки чёрных клавиш и границы октав
    g.fillStyle = theme.lane;
    for (const k of keys.values()) if (k.black) g.fillRect(k.x, 0, k.w, fallH);
    g.fillStyle = theme.line;
    for (const [m, k] of keys) if (mod12(m) === 0) g.fillRect(k.x, 0, 1, fallH);
    if (!part) return drawKeys();
    const ppb = fallH / LOOK;
    const yOf = (t) => fallH - (t - st) * ppb;
    // такты, аккорды, части
    g.font = `600 12px ${getComputedStyle(root).fontFamily}`;
    g.textBaseline = 'bottom';
    for (const b of part.bars) {
      if (b.t < st - 1 || b.t > st + LOOK) continue;
      g.fillStyle = theme.line;
      g.fillRect(0, Math.round(yOf(b.t)), W, 1);
    }
    g.textAlign = 'left';
    g.fillStyle = theme.ink;
    for (const c of part.chords) if (c.t >= st - 0.5 && c.t <= st + LOOK) g.fillText(c.name, 6, yOf(c.t) - 3);
    g.textAlign = 'right';
    g.fillStyle = theme.ink3;
    for (const s of part.sections) if (s.t >= st - 0.5 && s.t <= st + LOOK) g.fillText(s.name, W - 6, yOf(s.t) - 3);
    g.textAlign = 'center';
    // границы отрывка
    if (loop) {
      g.fillStyle = loopOn ? COL.ok : theme.ink3;
      for (const [t, label] of [[loop.from, 'начало отрывка'], [loop.to, 'конец отрывка']])
        if (t >= st - 0.5 && t <= st + LOOK) {
          g.fillRect(0, Math.round(yOf(t)) - 1, W, 2);
          g.fillText(label, W / 2, yOf(t) - 4);
        }
    }
    // ноты
    g.font = `700 11px ${getComputedStyle(root).fontFamily}`;
    for (let i = firstAt(st - 8); i < notes.length && notes[i].t <= st + LOOK; i++) {
      const n = notes[i];
      if (n.t + n.d < st - 0.3) continue;
      const k = keys.get(n.m);
      if (!k) continue;
      const y1 = yOf(n.t);
      const y0 = yOf(n.t + n.d);
      const h = Math.max(5, y1 - y0 - 1);
      const x = k.x + (k.black ? 0.5 : 1.5);
      const w = k.w - (k.black ? 1 : 3);
      g.globalAlpha = n.mine ? 1 : 0.32;
      g.fillStyle = n.state === 1 ? COL.ok : n.state === 2 ? COL.bad : COL[n.h];
      rr(x, y0, w, h, 3);
      g.fill();
      if (!n.mine && n.auto) {
        g.globalAlpha = 0.7;
        g.strokeStyle = COL[n.h];
        g.lineWidth = 1;
        g.stroke();
      }
      g.globalAlpha = 1;
      if (n.mine && cfg.labels !== 'off' && h > 15 && w > 13) {
        g.fillStyle = '#fff';
        g.fillText(nameOf(n.m), x + w / 2, y1 - 3);
      }
    }
    // ожидание: подсветить линию
    g.fillStyle = waiting ? COL.ok : 'rgba(56, 214, 255, 0.55)';
    g.fillRect(0, fallH - 2, W, 2);
    drawKeys();
  }

  function keyColor(m) {
    const t = performance.now();
    const list = flashes.get(m);
    let fl = null;
    if (list) {
      const live = list.filter((f) => f.to > t);
      if (live.length) flashes.set(m, live);
      else flashes.delete(m);
      fl = live.find((f) => f.from <= t && f.kind !== 'auto') || live.find((f) => f.from <= t);
    }
    if (fl?.kind === 'bad') return COL.bad;
    if (fl?.kind === 'ok') return COL.ok;
    if (down.has(m)) return COL.press;
    // что пора нажать
    if (part)
      for (let i = firstAt(st - 8); i < notes.length && notes[i].t <= st + 0.02; i++) {
        const n = notes[i];
        if (n.m === m && n.mine && n.state !== 2 && st < n.t + n.d && n.t <= st + 0.02) return n.state === 1 ? null : COL[n.h];
      }
    if (fl?.kind === 'auto') return 'auto';
    return null;
  }

  function drawKeys() {
    const y = fallH;
    g.textBaseline = 'alphabetic';
    g.font = `600 10px ${getComputedStyle(root).fontFamily}`;
    const lo = cfg.lo;
    const hi = cfg.lo + cfg.kb - 1;
    for (const [m, k] of keys) {
      if (k.black) continue;
      const c = keyColor(m);
      g.fillStyle = c === 'auto' ? '#d9d1ff' : c || '#e9eef7';
      g.fillRect(k.x + 0.5, y, k.w - 1, kbH - 2);
      if (mod12(m) === 0) {
        g.fillStyle = c && c !== 'auto' ? '#fff' : '#7a879e';
        g.textAlign = 'center';
        g.fillText(`C${oct(m)}`, k.x + k.w / 2, y + kbH - 9);
      }
    }
    for (const [m, k] of keys) {
      if (!k.black) continue;
      const c = keyColor(m);
      g.fillStyle = c === 'auto' ? '#5b4a9e' : c || '#121a29';
      rr(k.x, y, k.w, kbH * 0.62, 2);
      g.fill();
    }
    // ваша клавиатура — полоска снизу
    const a = keys.get(lo) || keys.get(lo + 1);
    const z = keys.get(hi) || keys.get(hi - 1);
    if (a && z && cfg.mode !== 'watch') {
      g.fillStyle = COL.R;
      g.globalAlpha = 0.8;
      g.fillRect(a.x, y + kbH - 3, z.x + z.w - a.x, 3);
      g.globalAlpha = 1;
    }
  }

  // проверка на странице: document.querySelector('.fall').__fall
  root.__fall = { press, lift, toggle, restart, stepBar, setRegion, score, cfg, passes, get st() { return st; }, get notes() { return notes; }, get waiting() { return waiting; }, get playing() { return playing; }, get loop() { return loopOn && loop; }, get part() { return part; } };

  // --- снаружи ---
  drawSeg();
  return {
    setPart(p) {
      listening = null;
      pause();
      part = p;
      loop = null;
      loopOn = false;
      passes.length = 0;
      secSel.textContent = '';
      secSel.append(el('option', { value: '' }, 'Вся песня'), ...p.sections.map((s, i) => el('option', { value: i }, `${i + 1}. ${s.name}`)));
      secSel.value = '';
      drawSeg();
      prepare(false);
      drawTimeline();
      drawPlay();
      drawStat();
      K.load(cfg.snd);
    },
    fail(err) {
      stat.textContent = `Не получилось загрузить партию: ${err?.message || err}`;
    },
  };
}

// ---------- /piano/play/: выбор песни и свои MIDI-файлы ----------
const DB = 'snezh-midi';
function idb(mode, fn) {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('s');
    r.onerror = () => rej(r.error);
    r.onsuccess = () => {
      const tx = r.result.transaction('s', mode);
      const q = fn(tx.objectStore('s'));
      tx.oncomplete = () => res(q?.result);
      tx.onerror = () => rej(tx.error);
    };
  });
}

function picker(root) {
  const songs = JSON.parse(root.querySelector('.fall-songs')?.textContent || '[]');
  root.textContent = '';
  const sel = el('select', { class: 'fl-song', 'aria-label': 'Что играть' });
  const fileIn = el('input', { type: 'file', accept: '.mid,.midi,audio/midi', hidden: true });
  const upBtn = el('button', { type: 'button', class: 'btn btn-small btn-ghost', html: `${I('upload')}<span>Свой MIDI-файл</span>` });
  const delBtn = el('button', { type: 'button', class: 'btn btn-small btn-ghost', hidden: true }, 'Убрать этот файл');
  const songLink = el('a', { class: 'btn btn-small btn-ghost', hidden: true }, 'Страница песни');
  const msg = el('p', { class: 'muted small fl-pick-msg' }, 'Можно перетащить .mid прямо сюда. Свои файлы хранятся только в этом браузере.');
  const host = el('div', { class: 'fall' });
  root.append(el('div', { class: 'fl-pick' }, el('label', { class: 'ctl-select' }, el('span', { class: 'ctl-label' }, 'Что играть'), sel), upBtn, delBtn, songLink, fileIn), msg, host);
  const api = mount(host);
  let mine = [];

  const fill = (selected) => {
    sel.textContent = '';
    const og = (label, items) => el('optgroup', { label }, items.map(([v, t]) => el('option', { value: v }, t)));
    const mel = songs.filter((s) => s.melody);
    sel.append(
      ...(mine.length ? [og('Мои MIDI', mine.map((k) => [k, k.slice(4)]))] : []),
      og('Песни: аккомпанемент двумя руками', songs.filter((s) => !s.melody).map((s) => [s.slug, `${s.title} — ${s.artist}`])),
      og('Мелодии', mel.map((s) => [s.slug, s.title])),
    );
    sel.value = selected;
  };
  const choose = async (v) => {
    store.set('fallSong', v);
    delBtn.hidden = !v.startsWith('mid:');
    songLink.hidden = v.startsWith('mid:');
    if (!v.startsWith('mid:')) songLink.href = `/songs/${v}/#piano`;
    try {
      if (v.startsWith('mid:')) {
        const rec = await idb('readonly', (s) => s.get(v));
        api.setPart(midiPart(parseMidi(rec.data), v.slice(4)));
      } else {
        const d = await fetch(`/data/play/${v}.json`).then((r) => r.json());
        api.setPart(pianoPart(d));
      }
    } catch (err) {
      api.fail(err);
    }
  };
  const addFile = async (f) => {
    if (!f) return;
    try {
      const buf = await f.arrayBuffer();
      const part = midiPart(parseMidi(buf), f.name.replace(/\.midi?$/i, ''));
      const key = `mid:${f.name.replace(/\.midi?$/i, '').slice(0, 60)}`;
      await idb('readwrite', (s) => s.put({ data: buf, added: Date.now() }, key));
      if (!mine.includes(key)) mine.unshift(key);
      fill(key);
      store.set('fallSong', key);
      delBtn.hidden = false;
      songLink.hidden = true;
      api.setPart(part);
      msg.textContent = `«${key.slice(4)}»: ${part.notes.length} нот, темп ${part.bpm}. Правая рука — верхняя дорожка, левая — нижняя.`;
    } catch (err) {
      msg.textContent = `Этот файл не открылся: ${err.message}`;
    }
  };
  upBtn.addEventListener('click', () => fileIn.click());
  fileIn.addEventListener('change', () => {
    addFile(fileIn.files[0]);
    fileIn.value = '';
  });
  root.addEventListener('dragover', (e) => e.preventDefault());
  root.addEventListener('drop', (e) => {
    e.preventDefault();
    addFile([...e.dataTransfer.files].find((f) => /\.midi?$/i.test(f.name)));
  });
  delBtn.addEventListener('click', async () => {
    const v = sel.value;
    if (!v.startsWith('mid:')) return;
    await idb('readwrite', (s) => s.delete(v)).catch(() => {});
    mine = mine.filter((k) => k !== v);
    fill('shape-of-my-heart');
    choose(sel.value);
  });
  sel.addEventListener('change', () => choose(sel.value));
  document.querySelectorAll('[data-fall-pick]').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      if (a.dataset.fallPick === 'upload') return fileIn.click();
      sel.value = a.dataset.fallPick;
      choose(sel.value);
      root.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }),
  );

  idb('readonly', (s) => s.getAllKeys())
    .then((keys) => (mine = (keys || []).filter((k) => String(k).startsWith('mid:'))))
    .catch(() => {})
    .finally(() => {
      const want = new URLSearchParams(location.search).get('song') || store.get('fallSong', 'shape-of-my-heart');
      const ok = want.startsWith('mid:') ? mine.includes(want) : songs.some((s) => s.slug === want);
      const v = ok ? want : 'shape-of-my-heart';
      fill(v);
      choose(v);
    });
}
