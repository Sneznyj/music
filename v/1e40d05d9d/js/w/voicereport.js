// Разбор голоса после записи на вкладке «Вокал»: точность, диапазон и тип голоса, тембр,
// график высоты поверх аккордов песни (нажмёте — послушаете это место) и советы со ссылками на уроки.
import { analyzeVoice } from '../lib/voice.js';
import * as T from '../lib/theory.js';
import { el, store } from './util.js';

const PX = 36; // пикселей на секунду графика
const H = 236;
const TOP = 32;
const BOTTOM = 18;
const OCT_RU = ['субконтроктавы', 'контроктавы', 'большой', 'малой', 'первой', 'второй', 'третьей', 'четвёртой'];

const mod12 = (n) => ((n % 12) + 12) % 12;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pct = (v) => `${Math.round(v * 100)} %`;
const signed = (v) => `${v < 0 ? '−' : '+'}${Math.abs(Math.round(v))}`;
const cents = (v, shown = v) => `${shown} ${plural(Math.abs(Math.round(v)), 'цент', 'цента', 'центов')}`;
const plural = (n, a, b, c) => (n % 10 === 1 && n % 100 !== 11 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? b : c);
const time = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const dur = (s) => (s >= 60 ? `${Math.floor(s / 60)} мин ${Math.round(s % 60)} с` : `${Math.round(s)} с`);
const noteRu = (m) => `${T.NOTE_RU[mod12(m)]} ${OCT_RU[Math.floor(m / 12) - 1] || ''}`.trim();

function span(semi) {
  if (semi < 12) return `${semi} ${plural(semi, 'полутон', 'полутона', 'полутонов')}`;
  const o = semi / 12;
  if (Math.abs(o - Math.round(o)) < 0.05) return `${Math.round(o)} ${plural(Math.round(o), 'октава', 'октавы', 'октав')}`;
  return `${o.toFixed(1).replace('.', ',')} октавы`;
}

// голос в моно 16 кГц: высота голоса выше 1 кГц не уходит, а считать вчетверо быстрее, чем на 48 кГц
async function toMono(buf) {
  for (const sr of [16000, 22050]) {
    try {
      const off = new OfflineAudioContext(1, Math.ceil(buf.duration * sr), sr);
      const s = off.createBufferSource();
      s.buffer = buf;
      s.connect(off.destination);
      s.start();
      const out = await off.startRendering();
      return { data: out.getChannelData(0), sr };
    } catch {
      /* такая частота не поддерживается — пробуем следующую */
    }
  }
  return { data: buf.getChannelData(0), sr: buf.sampleRate };
}

const words = {
  bright: (v) => (v < 0.25 ? 'тёмный' : v < 0.5 ? 'тёплый' : v < 0.75 ? 'светлый' : 'яркий'),
  air: (v) => (v < 0.3 ? 'плотный' : v < 0.6 ? 'с лёгким воздухом' : 'с придыханием'),
  ring: (v) => (v < 0.33 ? 'камерный' : v < 0.66 ? 'собранный' : 'звонкий, полётный'),
};

let themeWatch = null;

// box — пустой блок под карточками; voice — AudioBuffer голоса; take — { key, flats, slug, timeline }
// play(t) — включить запись с секунды t. Возвращает { head(t) } — бегунок на графике во время прослушивания.
export async function voiceReport(box, voice, take, { play } = {}) {
  box.hidden = false;
  const status = el('p', { class: 'muted' }, 'Разбираю голос…');
  box.replaceChildren(el('h3', {}, 'Разбор голоса'), status);
  const { data, sr } = await toMono(voice);
  const r = await analyzeVoice(data, sr, { key: take.key, timeline: take.timeline, onProgress: (p) => (status.textContent = `Разбираю голос… ${Math.round(p * 100)} %`) });
  const name = (m) => T.midiName(m, take.flats);

  if (!r.ok) {
    status.textContent = r.level.quiet
      ? 'Голоса почти не слышно: проверьте, тот ли микрофон выбран, придвиньтесь к нему и запишитесь ещё раз.'
      : 'В записи мало пения — спойте хотя бы куплет, и здесь появится разбор: тембр, диапазон и точность.';
    return { head() {} };
  }

  const prev = store.get(`vtake.${take.slug}`, null);
  store.set(`vtake.${take.slug}`, { acc: r.accuracy, lo: r.range.lo, hi: r.range.hi, at: Date.now() });
  const tb = r.timbre;
  const typeName = r.type.ru[0].toUpperCase() + r.type.ru.slice(1);

  const tiles = el('div', {
    class: 'vr-tiles',
    html: `
<div class="vr-tile"><span>Точность</span><b>${pct(r.accuracy)}</b><small>нот спето чисто${prev ? ` · в прошлый раз ${pct(prev.acc)}` : ''}</small></div>
<div class="vr-tile"><span>Диапазон</span><b>${name(r.range.lo)}–${name(r.range.hi)}</b><small>${esc(noteRu(r.range.lo))} — ${esc(noteRu(r.range.hi))} · ${span(r.range.hi - r.range.lo)}</small></div>
<div class="vr-tile"><span>Голос</span><b>${typeName}</b><small>по этой записи, ${name(r.type.lo)}–${name(r.type.hi)}</small></div>
<div class="vr-tile"><span>Тембр</span><b>${words.bright(tb.bright)[0].toUpperCase() + words.bright(tb.bright).slice(1)}</b><small>${words.air(tb.air)}, ${words.ring(tb.ringing)}</small></div>`,
  });

  // ---------- график высоты ----------
  const scroller = el('div', { class: 'vr-scroll' });
  const inner = el('div', { class: 'vr-inner' });
  const canvas = el('canvas', { class: 'vr-graph', 'aria-label': 'График высоты голоса по времени' });
  const head = el('i', { class: 'vr-head', hidden: true });
  inner.append(canvas, head);
  scroller.append(inner);
  const axis = el('canvas', { class: 'vr-axis', 'aria-hidden': 'true' });
  const graph = el('div', { class: 'vr-graph-box' }, axis, scroller);
  const legend = el('p', { class: 'vr-legend muted small', html: '<i class="ok"></i>чисто <i class="near"></i>чуть мимо ноты <i class="off"></i>мимо лада <i class="ch"></i>ноты аккорда · нажмите на график — послушаете это место' });

  const pitches = [];
  for (const v of r.track.pitch) if (!Number.isNaN(v)) pitches.push(v);
  pitches.sort((a, b) => a - b);
  let lo = Math.floor(pitches[Math.floor(pitches.length * 0.01)]) - 2;
  let hi = Math.ceil(pitches[Math.floor(pitches.length * 0.99)]) + 2;
  if (hi - lo < 14) {
    const mid = (hi + lo) >> 1;
    lo = mid - 7;
    hi = mid + 7;
  }
  const width = Math.min(9000, Math.ceil(r.duration * PX) + 20);
  const xOf = (t) => t * PX;

  function draw() {
    const css = getComputedStyle(document.documentElement);
    const C = (v, d) => css.getPropertyValue(v).trim() || d;
    const col = { ok: C('--good', '#1d9a66'), near: '#f0a020', off: '#ff4a5c', glide: C('--ink-3', '#888'), line: C('--line', '#333'), strong: C('--line-strong', '#555'), soft: C('--accent-soft', 'rgb(54 114 238 / 0.14)'), ink2: C('--ink-2', '#aaa'), ink3: C('--ink-3', '#888') };
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.max(width, scroller.clientWidth);
    inner.style.width = `${w}px`;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${H}px`;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(H * dpr);
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, H);
    const rowH = (H - TOP - BOTTOM) / (hi - lo + 1);
    const yOf = (m) => TOP + (hi + 0.5 - m) * rowH;

    // ноты аккорда — подсветка строк, пока звучит аккорд
    const tl = take.timeline;
    for (let i = 0; i < tl.length; ) {
      let j = i;
      while (j < tl.length && tl[j].chord === tl[i].chord) j++;
      const t1 = j < tl.length ? tl[j].t : tl[j - 1].t + 0.5;
      const tones = T.chordTones(tl[i].chord);
      g.fillStyle = col.soft;
      for (let m = lo; m <= hi; m++) if (tones.includes(mod12(m))) g.fillRect(xOf(tl[i].t), yOf(m + 0.5), xOf(t1) - xOf(tl[i].t), rowH);
      i = j;
    }
    // линии нот лада, «до» — ярче
    for (let m = lo; m <= hi; m++) {
      if (!r.scale.has(mod12(m)) && mod12(m) !== 0) continue;
      g.fillStyle = mod12(m) === 0 ? col.strong : col.line;
      g.fillRect(0, Math.round(yOf(m)), w, 1);
    }
    // части песни и аккорды сверху
    g.textBaseline = 'alphabetic';
    let lastSec = null;
    let lastChord = null;
    let lastX = -99;
    for (const e of tl) {
      const x = xOf(e.t);
      if (e.sec !== lastSec) {
        lastSec = e.sec;
        g.fillStyle = col.strong;
        g.fillRect(Math.round(x), TOP - 4, 1, H - TOP - BOTTOM + 4);
        g.fillStyle = col.ink2;
        g.font = '700 11px system-ui, sans-serif';
        g.fillText(e.sec, x + 4, 12);
      }
      if (e.chord !== lastChord) {
        lastChord = e.chord;
        if (x - lastX >= 28) {
          g.fillStyle = col.ink3;
          g.font = '600 10px ui-monospace, monospace';
          g.fillText(e.chord, x + 3, 26);
          lastX = x;
        }
      }
    }
    // время снизу
    g.fillStyle = col.ink3;
    g.font = '10px ui-monospace, monospace';
    for (let s = 10; s < r.duration; s += 10) g.fillText(time(s), xOf(s) - 12, H - 4);
    // высота голоса: цвет — как спета нота
    const { pitch, noteOf, hop, t0 } = r.track;
    const paths = { ok: new Path2D(), near: new Path2D(), off: new Path2D(), glide: new Path2D() };
    for (let i = 1; i < pitch.length; i++) {
      if (Number.isNaN(pitch[i]) || Number.isNaN(pitch[i - 1])) continue;
      const nt = noteOf[i] >= 0 ? r.notes[noteOf[i]] : null;
      const p = paths[!nt ? 'glide' : nt.ok ? 'ok' : nt.inKey ? 'near' : 'off'];
      p.moveTo(xOf(t0 + (i - 1) * hop), yOf(pitch[i - 1]));
      p.lineTo(xOf(t0 + i * hop), yOf(pitch[i]));
    }
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const k of ['glide', 'off', 'near', 'ok']) {
      g.strokeStyle = col[k];
      g.lineWidth = k === 'glide' ? 1.5 : 3;
      g.stroke(paths[k]);
    }

    // подписи нот слева — отдельный холст, чтобы не уезжали при прокрутке
    axis.style.height = `${H}px`;
    axis.width = Math.round(46 * dpr);
    axis.height = Math.round(H * dpr);
    const a = axis.getContext('2d');
    a.setTransform(dpr, 0, 0, dpr, 0, 0);
    a.clearRect(0, 0, 46, H);
    a.font = '600 10px ui-monospace, monospace';
    a.textAlign = 'right';
    a.textBaseline = 'middle';
    for (let m = lo; m <= hi; m++) {
      const show = rowH >= 9 ? r.scale.has(mod12(m)) : mod12(m) === 0 || mod12(m) === 7;
      if (!show) continue;
      a.fillStyle = mod12(m) === 0 ? col.ink2 : col.ink3;
      a.fillText(name(m), 40, yOf(m));
    }
  }

  canvas.addEventListener('click', (e) => play?.(Math.max(0, (e.offsetX - 4) / PX)));

  // ---------- тембр ----------
  const scaleRow = (title, left, right, v) => `<div class="vr-scale"><b>${title}</b><span>${left}</span><div class="vr-bar"><i style="left:${(v * 100).toFixed(0)}%"></i></div><span>${right}</span></div>`;
  const timbre = el('div', {
    class: 'vr-card',
    html: `<h4>Тембр</h4>
${scaleRow('Окраска', 'тёмный', 'светлый', tb.bright)}
${scaleRow('Подача', 'плотный', 'с воздухом', tb.air)}
${scaleRow('Полётность', 'мягкий', 'звонкий', tb.ringing)}
<p class="muted small">${timbreText(tb)} Тембр зависит и от микрофона — сравнивайте записи, сделанные на одном и том же.</p>`,
  });

  // ---------- подробности ----------
  const rows = [
    ['Средний уход от ноты', `${cents(Math.round(r.meanDev))}${Math.abs(r.bias) < 8 ? ', без перекоса' : r.bias < 0 ? `, чаще чуть ниже нот (${signed(r.bias)})` : `, чаще чуть выше нот (${signed(r.bias)})`} · 100 центов — полутон`],
    ['В ладу песни', `${pct(r.inKey)} нот`],
    ['Ноты аккорда', `${pct(r.inChord)} — остальные проходящие, так и должно быть`],
    ['Удобная зона', `${name(r.range.from)}–${name(r.range.to)}: здесь половина всех нот`],
  ];
  if (r.vibrato) {
    rows.push(['Длинные ноты', `${r.wobble < 15 ? 'держите ровно' : r.wobble < 30 ? 'немного плавают' : 'заметно плавают'} · ${r.vibrato.long} ${plural(r.vibrato.long, 'нота', 'ноты', 'нот')} длиннее 0,6 секунды`]);
    rows.push(['Вибрато', r.vibrato.share >= 0.15 ? `на ${pct(r.vibrato.share)} длинных нот, ${r.vibrato.rate.toFixed(1).replace('.', ',')} Гц (${r.vibrato.rate < 4.8 ? 'медленное' : r.vibrato.rate > 7 ? 'частое' : 'естественное'}), размах ±${cents(Math.round(r.vibrato.amp))}` : 'почти нет — звук прямой']);
  }
  rows.push(['Динамика', `${Math.round(r.dynamics)} дБ между тихими и громкими местами — ${r.dynamics < 6 ? 'очень ровно' : r.dynamics < 14 ? 'живо' : 'большие перепады'}`]);
  if (r.sections.length > 1) rows.push(['По частям песни', r.sections.map((s) => `${esc(s.name)} — ${pct(s.accuracy)}`).join(' · ')]);
  rows.push(['Спето', `${dur(r.sung)} голоса в записи ${dur(r.duration)} · ${r.notes.length} ${plural(r.notes.length, 'нота', 'ноты', 'нот')}`]);
  const details = el('div', { class: 'vr-card', html: `<h4>Как вы поёте</h4><dl class="vr-dl">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>` });

  const tips = el('div', { class: 'vr-card vr-tips', html: `<h4>Над чем поработать</h4><ul>${adviceFor(r).map((t) => `<li>${t.text}${t.href ? ` <a href="${t.href}">${t.link} →</a>` : ''}</li>`).join('')}</ul><p class="muted small">Ещё подробнее — интонация по нотам и ритм — в <a href="/vocal/analyze/">разборе вокала</a> Студии.</p>` });

  box.replaceChildren(el('h3', {}, 'Разбор голоса'), el('p', { class: 'muted' }, `${T.keyRu(take.key)[0].toUpperCase() + T.keyRu(take.key).slice(1)} · посчитано у вас в браузере, запись никуда не отправлялась.`), tiles, graph, legend, el('div', { class: 'vr-cols' }, details, el('div', {}, timbre, tips)));
  draw();
  themeWatch?.disconnect();
  themeWatch = new MutationObserver(draw);
  themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  return {
    head(t) {
      if (t == null) return void (head.hidden = true);
      head.hidden = false;
      const x = xOf(t);
      head.style.transform = `translateX(${x.toFixed(1)}px)`;
      if (x < scroller.scrollLeft + 20 || x > scroller.scrollLeft + scroller.clientWidth - 40) scroller.scrollLeft = x - 60;
    },
  };
}

function timbreText(tb) {
  const b = tb.bright < 0.25 ? 'Тёмный, бархатный голос: много низов, мало верхних обертонов.' : tb.bright < 0.5 ? 'Тёплый голос: мягкие низы и в меру верхов.' : tb.bright < 0.75 ? 'Светлый голос: верхние обертоны слышны хорошо.' : 'Яркий голос: много верхних обертонов.';
  const a = tb.air < 0.3 ? 'Связки смыкаются плотно — звук собранный.' : tb.air < 0.6 ? 'В звуке немного воздуха — мягко и интимно.' : 'Воздуха много — придыхание красиво в тихих местах, но съедает опору.';
  return `${b} ${a}`;
}

// 2–4 совета: сначала про запись, потом про главное в пении, в конце — похвала
function adviceFor(r) {
  const out = [];
  const add = (text, href, link) => out.push({ text, href, link });
  if (r.level.clip) add('Запись перегружена — звук трещит на громких местах. Отодвиньтесь от микрофона на ладонь или убавьте его чувствительность.');
  else if (r.level.quiet) add('Запись тихая: придвиньтесь к микрофону — тогда и звук, и разбор будут точнее.');
  if (r.bias < -12 && r.accuracy < 0.8) add(`Ноты чаще ниже, чем нужно (в среднем ${cents(r.bias, signed(r.bias))}). Обычно это вялый выдох в конце фраз: добавьте опоры и берите дыхание раньше.`, '/vocal/lessons/pitch/', 'Урок «Попадать в ноты»');
  else if (r.bias > 12 && r.accuracy < 0.8) add(`Ноты чаще выше, чем нужно (в среднем ${cents(r.bias, signed(r.bias))}). Так бывает от зажима и громкости — пойте тише и свободнее.`, '/vocal/lessons/pitch/', 'Урок «Попадать в ноты»');
  if (r.accuracy < 0.7) add('Чтобы попадать чаще, тренируйте слух и голос вместе: 5 минут в день «Попади в ноту».', '/vocal/exercises/match/', 'Тренажёр');
  const secs = [...r.sections].sort((a, b) => a.accuracy - b.accuracy);
  if (secs.length > 1 && secs.at(-1).accuracy - secs[0].accuracy > 0.15) {
    const weak = secs[0];
    const high = weak.pitch > r.range.mid + 1.5;
    add(`«${esc(weak.name)}» даётся труднее (${pct(weak.accuracy)} против ${pct(secs.at(-1).accuracy)}). ${high ? 'Там выше — опустите тональность на 1–2 полутона кнопкой «−».' : 'Пропойте эту часть отдельно в темпе 80 %, потом в полном.'}`);
  }
  if (r.inKey < 0.85) add('Есть ноты мимо лада песни. Послушайте оригинал ещё раз, подпевая тихо, — и запишитесь снова.');
  if (r.wobble != null && r.wobble >= 25) add('Длинные ноты плавают — их выравнивает ровный выдох.', '/vocal/exercises/long/', 'Упражнение «Длинная нота»');
  if (r.timbre.air >= 0.7) add('В звуке много воздуха. Для плотного звука помогают мычание «м-м-м» и долгий «с-с-с».', '/vocal/lessons/breathing/', 'Урок «Дыхание и опора»');
  if (r.range.hi >= r.type.hi - 1) add('Верхние ноты на краю диапазона — если там тяжело, опустите тональность: голос не должен напрягаться.', '/vocal/lessons/range/', 'Урок «Диапазон»');
  if (r.vibrato && r.vibrato.share < 0.15 && r.vibrato.long >= 4 && out.length < 3) add('Звук прямой, без вибрато — это тоже стиль. Хотите живее — попробуйте лёгкое вибрато на концах фраз.', '/vocal/lessons/sound/', 'Урок «Тембр»');
  if (r.accuracy < 0.85 && out.length < 3) add('Нажмите на оранжевые и красные места графика и послушайте их, а потом пропойте эти фразы отдельно и медленно.');
  if (r.accuracy >= 0.85 && out.length < 3) add('Отлично держите ноты! Попробуйте эту песню на полтона выше или спойте с оригиналом.');
  if (!out.length) add('Хорошая запись. Запишитесь ещё раз через неделю и сравните цифры — рост будет виден.');
  return out.slice(0, 4);
}
