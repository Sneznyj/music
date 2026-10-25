// Страница песни: тональность и каподастр, «без баррэ», игра вместе с подсветкой аккордов.
import { Seq, audio, click, hush } from '../audio.js';
import { diagramSVG, fretsText } from '../lib/diagram.js';
import { METERS, PATTERNS, patternsFor } from '../lib/patterns.js';
import * as T from '../lib/theory.js';
import { claim, el, mayAutoScroll, playButton, playStep, playVoicing, release, slider, store, toggle } from './util.js';

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
    pattern: saved.pattern && PATTERNS[saved.pattern]?.meter === data.meter ? saved.pattern : data.pattern,
    speed: saved.speed || 0.7,
    guitar: true,
    metro: true,
    count: true,
    playing: false,
  };

  // ---------- тональность ----------
  const shift = () => data.capo + st.tr - st.capo;
  const soundKey = () => T.transposeKey(data.key, st.tr);
  const flats = () => T.keyUsesFlats(T.transposeKey(soundKey(), -st.capo));
  const nameOf = (orig) => (shift() === 0 ? orig : T.transposeChord(orig, shift(), flats()));
  const voicingOf = (orig) => {
    if (shift() === 0 && data.shapes[orig]) {
      const [f, fi] = data.shapes[orig].split(' ');
      return T.voicingFromString(f, fi);
    }
    return T.voicings(nameOf(orig))[0] || null;
  };

  const top = document.querySelector('.songsheet-chords');
  const keybar = top.querySelector('.keybar');
  const kbKey = top.querySelector('.kb-key');
  const kbCapo = top.querySelector('.kb-capo');
  const kbNote = top.querySelector('.kb-note');
  const kbReset = top.querySelector('.kb-reset');
  const cards = [...top.querySelectorAll('.song-chords .chord')];
  const capOrig = cards.map((c) => c.querySelector('.chord-cap').innerHTML);
  const chips = [...root.querySelectorAll('.sheet .ch')];
  chips.forEach((c) => (c.dataset.o = c.textContent));
  keybar.hidden = false;

  function update() {
    kbKey.textContent = soundKey();
    kbCapo.textContent = String(st.capo);
    const changed = st.tr !== 0 || st.capo !== data.capo;
    kbReset.hidden = !changed;
    kbNote.hidden = !changed;
    if (changed) {
      const parts = [`Звучит в ${soundKey()} (${T.keyRu(soundKey())})`];
      if (st.tr) parts.push(`на ${semis(Math.abs(st.tr))} ${st.tr > 0 ? 'выше' : 'ниже'} оригинала`);
      kbNote.textContent = `${parts.join(', ')}. ${st.capo ? `Каподастр на ${st.capo}-м ладу.` : 'Без каподастра.'}`;
    }
    data.chords.forEach((orig, i) => {
      const card = cards[i];
      if (!card) return;
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
    chips.forEach((c) => (c.textContent = nameOf(c.dataset.o)));
    store.set('song.' + data.slug, { tr: st.tr, capo: st.capo, pattern: st.pattern, speed: st.speed });
    if (curChord) showNow(curChord, nextChord);
  }

  keybar.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
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
        const v = sh === 0 && data.shapes[orig] ? voicingOf(orig) : T.voicings(T.transposeChord(orig, sh))[0];
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
  const timeline = [];
  const secStart = [];
  let chipIdx = 0;
  data.sections.forEach((s, si) => {
    const first = chipIdx;
    s.bars.forEach((b) => (chipIdx += b.length));
    for (let r = 0; r < s.repeat; r++) {
      if (r === 0) secStart[si] = timeline.length;
      let c = first;
      s.bars.forEach((b, bi) => {
        let pos = 0;
        timeline.push({
          si,
          bi,
          r,
          chords: b.map((ch) => {
            const o = { orig: ch.name, slots: ch.slots, start: pos, chip: c++ };
            pos += ch.slots;
            return o;
          }),
        });
      });
    }
  });
  const flat = timeline.flatMap((bar, k) => bar.chords.map((c) => ({ ...c, bar: k })));

  const pa = root.querySelector('.playalong');
  pa.hidden = false;
  const play = playButton(() => (st.playing ? stop() : start(0)));
  play.setPlaying(false, 'Играть вместе');
  const patSel = el(
    'select',
    { 'aria-label': 'Ритм' },
    patternsFor(data.meter).map((p) => el('option', { value: p.id, selected: p.id === st.pattern ? true : null }, p.name)),
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
      store.set('song.' + data.slug, { tr: st.tr, capo: st.capo, pattern: st.pattern, speed: st.speed });
    },
  });
  const status = el('div', { class: 'pa-pos muted', 'aria-live': 'polite' }, 'Нажмите «Играть вместе» — после отсчёта начнётся песня.');
  const now = el('div', { class: 'pa-card pa-cur' });
  const nxt = el('div', { class: 'pa-card pa-next' });
  pa.append(
    el(
      'div',
      { class: 'pa-ctl' },
      play,
      el('label', { class: 'ctl-select' }, el('span', { class: 'ctl-label' }, 'Ритм'), patSel),
      speed.node,
      el(
        'div',
        { class: 'tg-group' },
        toggle('Гитара', st.guitar, (v) => (st.guitar = v)),
        toggle('Метроном', st.metro, (v) => (st.metro = v)),
        toggle('Отсчёт', st.count, (v) => (st.count = v)),
      ),
    ),
    el('div', { class: 'pa-now' }, now, nxt, status),
  );

  let curChord = null;
  let nextChord = null;
  function showNow(c, n) {
    const card = (box, ch, label) => {
      if (!ch) {
        box.innerHTML = `<span class="pa-label">${label}</span><span class="pa-end">конец</span>`;
        return;
      }
      const name = nameOf(ch.orig);
      box.innerHTML = `<span class="pa-label">${label}</span><span class="pa-name">${name}</span>${diagramSVG(voicingOf(ch.orig), { name })}`;
    };
    card(now, c, 'Сейчас');
    card(nxt, n, 'Дальше');
  }
  showNow(flat[0], flat.find((c) => c.orig !== flat[0].orig));

  const seq = new Seq({
    total: timeline.length * M.slots,
    ticksPerBeat: M.slotsPerBeat,
    bpm: () => data.bpm * st.speed,
    onTick: (t, time) => {
      if (st.counting) {
        if (t >= st.from) st.counting = false;
        else {
          const k = t - (st.from - M.slots);
          if (k % M.slotsPerBeat === 0) click(time, k === 0);
          return;
        }
      }
      const bar = timeline[Math.floor(t / M.slots)];
      const pos = t % M.slots;
      const ch = bar.chords.find((c) => pos >= c.start && pos < c.start + c.slots);
      const p = PATTERNS[st.pattern];
      if (st.guitar && ch) playStep(p.steps[pos], voicingOf(ch.orig), nameOf(ch.orig), time, { kind: p.kind, vel: pos === 0 ? 0.95 : 0.78 });
      if (st.metro && pos % M.slotsPerBeat === 0) click(time, pos === 0, st.guitar ? 0.45 : 0.8);
    },
    onVisual: (t) => {
      if (t < st.from) {
        const k = Math.floor((t - (st.from - M.slots)) / M.slotsPerBeat) + 1;
        status.textContent = `Отсчёт: ${k}…`;
        return;
      }
      const bi = Math.floor(t / M.slots);
      const bar = timeline[bi];
      const pos = t % M.slots;
      const k = bar.chords.findIndex((c) => pos >= c.start && pos < c.start + c.slots);
      const ch = bar.chords[k];
      const sec = data.sections[bar.si];
      status.textContent = `${sec.name}${sec.repeat > 1 ? ` (${bar.r + 1}-й раз из ${sec.repeat})` : ''} · такт ${bar.bi + 1} из ${sec.bars.length}`;
      if (ch && ch !== curChord?.ref) {
        const fi = flat.findIndex((f) => f.bar === bi && f.start === ch.start);
        curChord = { ...flat[fi], ref: ch };
        nextChord = flat.slice(fi + 1).find((f) => f.orig !== ch.orig) || null;
        showNow(curChord, nextChord);
        chips.forEach((c) => c.classList.remove('on'));
        const chip = chips[ch.chip];
        chip.classList.add('on');
        const r = chip.getBoundingClientRect();
        const paBottom = pa.getBoundingClientRect().bottom;
        if ((r.top < paBottom + 8 || r.bottom > innerHeight - 8) && mayAutoScroll()) chip.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    },
    onEnd: () => stop(false),
  });

  const api = { stop: () => stop() };
  function start(fromBar) {
    claim(api);
    audio();
    st.from = fromBar * M.slots;
    st.counting = st.count;
    st.playing = true;
    curChord = null;
    play.setPlaying(true);
    root.classList.add('playing');
    seq.start(st.count ? st.from - M.slots : st.from);
  }
  function stop(silence = true) {
    if (!st.playing) return;
    st.playing = false;
    seq.stop(!silence);
    if (silence) hush();
    play.setPlaying(false, 'Играть вместе');
    root.classList.remove('playing');
    chips.forEach((c) => c.classList.remove('on'));
    status.textContent = silence ? 'Пауза. «Играть вместе» — сначала, ▶ у части — с неё.' : 'Готово! Ещё раз?';
    release(api);
  }

  // запуск с нужной части
  root.querySelectorAll('.sec h3').forEach((h, si) => {
    const b = el('button', { type: 'button', class: 'sec-play', 'aria-label': `Играть с части «${data.sections[si].name}»`, title: 'Играть с этого места', html: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>' });
    b.addEventListener('click', () => {
      if (st.playing) stop();
      start(secStart[si]);
    });
    h.append(b);
  });

  // аккорд в листе — по нажатию звучит
  root.querySelector('.sheet').addEventListener('click', (e) => {
    const chip = e.target.closest('.ch');
    if (!chip || st.playing) return;
    const v = voicingOf(chip.dataset.o);
    if (v) {
      audio();
      playVoicing(v);
    }
  });

  update();
}
