// В каком порядке и сколько играет песня.
// fullForm — форма песни целиком из её частей: в данных лежат куплет и припев по разу, а песня длится минуты.
// textOrder — порядок из текста с аккордами: аккорды идут так, как стоят над словами, строка за строкой.
// У текста нет нот, поэтому длину строки считаем по слогам и темпу песни (как placeChords в chordpro.js), а доля аккорда —
// по слогу, над которым он стоит. Ответ совместим с data.sections: { sections, lines }, где lines — время каждой строки
// в шагах (восьмых) для подсветки слов.
import { kindOf, syllables } from './chordpro.js';
import { METERS } from './patterns.js';

const norm = (s) => String(s || '').toLowerCase().replace(/×\s*\d+\s*$/, '').replace(/[^a-zа-яё0-9]+/g, ' ').trim();
const fixName = (c) => c.replace(/^H/, 'B');

// длина части с повторами в секундах
const secSeconds = (s, { bpm, meter }) => (s.bars.length * (s.repeat || 1) * METERS[meter].beats * 60) / bpm;

// Порядок частей (номера в sections) на всю песню, target — примерная длина в секундах.
// Вступление — один раз; круг от первой поющейся части до последней — сколько поместится; бридж — один раз, перед последним
// припевом; кода — в конце. «Вся песня» и мелодии без повторов не трогаем: они уже целые. Круг (×4, ×8) и рифф — по кругу.
// data.form — порядок, сверенный с записью песни (src/forms.json, tools/structure.mjs): если есть, он и есть ответ.
export function fullForm(sections, { bpm, meter, form }, target = 210) {
  if (form) return form;
  const all = sections.map((_, i) => i);
  const kinds = sections.map((s) => kindOf(s.name));
  if (kinds.every((k) => k === 'other') && sections.every((s) => (s.repeat || 1) === 1)) return all;
  const len = (list) => list.reduce((n, i) => n + secSeconds(sections[i], { bpm, meter }), 0);
  const rounds = (body, rest = 0) => Math.max(1, Math.min(12, Math.round((target - rest) / Math.max(1, len(body)))));
  const sung = all.filter((i) => kinds[i] !== 'inst');
  if (!sung.length) return Array.from({ length: rounds(all) }, () => all).flat();
  const intro = all.filter((i) => i < sung[0]);
  const outro = all.filter((i) => i > sung.at(-1));
  const body = all.filter((i) => i >= sung[0] && i <= sung.at(-1));
  const main = body.filter((i) => kinds[i] !== 'bridge');
  const bridge = body.filter((i) => kinds[i] === 'bridge');
  const chorus = main.filter((i) => kinds[i] === 'chorus');
  const n = rounds(main.length ? main : body, len(intro) + len(outro) + len(bridge));
  const out = [...intro];
  for (let r = 0; r < n; r++) out.push(...(main.length ? main : body));
  // бридж, а за ним ещё раз припев (нет припева — ещё раз куплет)
  if (bridge.length && main.length) out.push(...bridge, ...(chorus.length ? chorus : main));
  return [...out, ...outro];
}

// сколько тактов на строку: так, чтобы строфа заняла часть песни, а слоги легли как обычно поют при этом темпе
function pickBarsPerLine(lines, sec, { bpm, beats, slots, chordSlots }) {
  const want = bpm >= 140 ? 1 : bpm >= 105 ? 1.4 : bpm >= 80 ? 1.8 : 2.2;
  const sung = lines.filter((l) => l.text.trim());
  const syl = sung.map((l) => syllables(l.text).length);
  const avg = syl.reduce((a, b) => a + b, 0) / Math.max(1, sung.length);
  const withChords = sung.filter((l) => l.chords.length);
  const avgChords = withChords.reduce((n, l) => n + l.chords.length, 0) / Math.max(1, withChords.length);
  let best = 1;
  let bestPen = Infinity;
  for (const bpl of [1, 2, 4, 8]) {
    const dens = avg / (bpl * beats);
    let pen = Math.abs(Math.log2((dens || want) / want)) * 0.5;
    if (sec) {
      const covered = lines.length * bpl;
      const total = sec.bars.length * (sec.repeat || 1);
      pen += covered === sec.bars.length ? 0 : covered === total ? 0.3 : covered % sec.bars.length === 0 || sec.bars.length % covered === 0 ? 2 : 4;
    } else if (withChords.length) pen += Math.abs(Math.log2((avgChords * chordSlots) / slots / bpl)) * 0.5;
    if (pen < bestPen - 1e-9) {
      bestPen = pen;
      best = bpl;
    }
  }
  return best;
}

// аккорды строки на шаги: первый — с начала строки (если до него только затакт), остальные — по слогам
function timeLine(line, bars, M) {
  const total = bars * M.slots;
  const text = line.text;
  const sy = syllables(text);
  const before = (at) => (sy.length ? sy.filter((s) => s.vowel < at).length : at);
  const whole = sy.length || text.length || 1;
  const first = line.chords[0];
  // до первого аккорда одно-два слова затакта — их поют до сильной доли; больше — аккорд стоит в середине строки
  const pickup = first && before(first.at) <= 2;
  const base = pickup ? before(first.at) : 0;
  const span = Math.max(1, whole - base);
  const step = M.slotsPerBeat;
  const grid = (M.beats >= 4 ? 2 : 1) * step;
  const out = [];
  let prev = -step;
  line.chords.forEach((c, k) => {
    const left = line.chords.length - k - 1;
    let t = k === 0 && pickup ? 0 : Math.round((((before(c.at) - base) / span) * total) / grid) * grid;
    t = Math.max(t, prev + step);
    t = Math.min(t, total - (left + 1) * step);
    t = Math.max(t, prev + step);
    out.push({ ...c, t });
    prev = t;
  });
  return out;
}

// Текст с аккордами → порядок игры. model — строки parseLines; barsPerLine — выбор человека (0 — считаем сами).
// cycles — повторить весь текст (тексты с сайта: там куплет и припев по разу). Без аккордов в тексте — null.
export function textOrder(model, data, { barsPerLine = 0, cycles = 1 } = {}) {
  if (!model?.some((l) => l.chords?.length)) return null;
  const M = METERS[data.meter];
  const allChords = data.sections.flatMap((s) => s.bars.flat());
  const chordSlots = allChords.reduce((n, c) => n + (c.slots || 1), 0) / Math.max(1, allChords.length);
  const secByName = (name) => {
    const n = norm(name);
    if (!n) return null;
    const kind = kindOf(name);
    return data.sections.find((s) => norm(s.name) === n) || (kind === 'other' ? null : data.sections.find((s) => kindOf(s.name) === kind)) || null;
  };

  // строфы: подпись и строки до пустой строки
  const stanzas = [];
  let cur = null;
  model.forEach((l, li) => {
    if (l.head != null) {
      cur = { head: l.head, headAt: li, lines: [] };
      stanzas.push(cur);
    } else if (!l.text.trim() && !l.chords.length) cur = null;
    else {
      if (!cur) {
        cur = { head: '', headAt: li, lines: [] };
        stanzas.push(cur);
      }
      cur.lines.push({ ...l, li });
    }
  });

  const firstChord = model.find((l) => l.chords?.length).chords[0].c;
  let held = fixName(firstChord);

  // Строфа, у которой аккорды идут кругами какой-то части песни: длины аккордов берём из самой части, а не по слогам.
  // Так 6 строк на два круга Em G D Em звучат ровно 8 тактами, а не 12. Не сошлось — null.
  function alignStanza(st, sec) {
    const cycle = sec.bars.flat();
    const tokens = st.lines.flatMap((line) => line.chords.map((c) => ({ line, c, name: fixName(c.c) })));
    if (!tokens.length) return null;
    const period = cycle.reduce((n, c) => n + c.slots, 0);
    let idx = 0;
    let at = 0;
    for (let j = 0; j < tokens.length; j++) {
      if (cycle[idx % cycle.length].name !== tokens[j].name) return null;
      tokens[j].t = at;
      at += cycle[idx % cycle.length].slots;
      idx++;
      // подряд одинаковые такты в тексте записаны одним аккордом: дотягиваем его, пока в части не сменится
      const nextName = tokens[j + 1]?.name;
      if (nextName !== tokens[j].name) {
        while (cycle[idx % cycle.length].name === tokens[j].name && !(idx % cycle.length === 0 && j === tokens.length - 1) && cycle.some((c) => c.name !== tokens[j].name)) {
          at += cycle[idx % cycle.length].slots;
          idx++;
        }
      }
      tokens[j].end = at;
    }
    // строфа заканчивается концом круга
    if (at % period !== 0 || at % M.slots !== 0) return null;
    const stream = tokens.map((x) => ({ name: x.name, slots: x.end - x.t, l: x.line.li, k: x.c.k }));
    const lines = [];
    const beat = M.slotsPerBeat;
    st.lines.forEach((line, n) => {
      const own = tokens.filter((x) => x.line === line);
      const nextOwn = st.lines.slice(n + 1).map((ln) => tokens.find((x) => x.line === ln)).find(Boolean);
      const lastT = lines.at(-1);
      const lineEnd = nextOwn ? nextOwn.t : at;
      const start = own.length ? own[0].t : lastT ? lastT.to : 0;
      if (lastT && lastT.to > start) lastT.to = start;
      if (!line.text.trim()) {
        lines.push({ l: line.li, start, from: start, to: lineEnd, anchors: [] });
        return;
      }
      const lead = line.text.search(/\S/);
      const anchors = [];
      if (own.length && own[0].c.at > lead) anchors.push({ at: lead, t: start - beat });
      else if (!own.length) anchors.push({ at: lead, t: start });
      for (const x of own) anchors.push({ at: x.c.at, t: x.t });
      anchors.push({ at: line.text.length, t: Math.max(anchors.at(-1).t + beat, lineEnd - beat) });
      lines.push({ l: line.li, start, from: anchors[0].t, to: lineEnd, anchors });
    });
    held = tokens.at(-1).name;
    return { stream, lines };
  }

  // одна строфа на поток аккордов: { name, slots, l, k } и строки со временем от начала строфы
  function timeStanza(st) {
    if (!barsPerLine) {
      const named = secByName(st.head);
      for (const sec of [named, ...data.sections].filter(Boolean)) {
        const done = alignStanza(st, sec);
        if (done) return done;
      }
    }
    const stream = [];
    const lines = [];
    let pos = 0;
    const put = (name, slots, l, k) => {
      if (slots > 0) stream.push({ name, slots, l, k });
    };
    const sec = secByName(st.head);
    const sung = st.lines.filter((l) => l.text.trim());
    const bpl = barsPerLine || (sung.length ? pickBarsPerLine(st.lines, sec, { bpm: data.bpm, beats: M.beats, slots: M.slots, chordSlots }) : 1);
    for (const line of st.lines) {
      if (!line.text.trim()) {
        // строка из одних аккордов: часть песни с такими же аккордами — её такты, иначе обычная длина аккорда
        const names = line.chords.map((c) => fixName(c.c));
        const same = sec && sec.bars.flat().map((c) => c.name).join(' ') === names.join(' ');
        const start = pos;
        const sizes = same ? sec.bars.flat().map((c) => c.slots) : names.map(() => Math.max(M.slotsPerBeat, Math.round(chordSlots / M.slotsPerBeat) * M.slotsPerBeat));
        names.forEach((n, i) => {
          put(n, sizes[i], line.li, line.chords[i].k);
          pos += sizes[i];
        });
        // добираем до конца такта последним аккордом
        const pad = (M.slots - (pos % M.slots)) % M.slots;
        if (pad && stream.length) {
          stream.at(-1).slots += pad;
          pos += pad;
        }
        held = names.at(-1) || held;
        lines.push({ l: line.li, start, from: start, to: pos, anchors: [] });
        continue;
      }
      const need = Math.ceil((line.chords.length * M.slotsPerBeat) / M.slots);
      const bars = Math.max(bpl, need, 1);
      const total = bars * M.slots;
      const timed = timeLine(line, bars, M);
      if (timed.length && timed[0].t > 0) put(held, timed[0].t, null, null);
      timed.forEach((c, i) => {
        const end = i + 1 < timed.length ? timed[i + 1].t : total;
        put(fixName(c.c), end - c.t, line.li, c.k);
        held = fixName(c.c);
      });
      if (!timed.length) put(held, total, null, null);
      const start = pos;
      const beat = M.slotsPerBeat;
      const anchors = [];
      const len = line.text.length;
      const lead = line.text.search(/\S/);
      if (timed.length && timed[0].at > lead && timed[0].t === 0) anchors.push({ at: lead, t: start - beat });
      else if (!timed.length || timed[0].at > lead) anchors.push({ at: lead, t: start });
      for (const c of timed) anchors.push({ at: c.at, t: start + c.t });
      const lastT = anchors.at(-1).t;
      anchors.push({ at: len, t: Math.max(lastT + beat, start + total - beat) });
      lines.push({ l: line.li, start, from: anchors[0].t, to: start + total, anchors });
      pos += total;
    }
    return { stream, lines };
  }

  // chord.k — номер аккорда в строке модели (для подсветки над словами)
  for (const st of stanzas) for (const line of st.lines) line.chords = line.chords.map((c, k) => ({ ...c, k }));

  const sections = [];
  const lines = [];
  const known = new Map();
  let clock = 0;
  const emit = (st, done) => {
    if (!done.stream.length) return;
    const bars = [];
    let bar = [];
    let room = M.slots;
    for (const c of done.stream) {
      let left = c.slots;
      while (left > 0) {
        const piece = Math.min(left, room);
        bar.push({ name: c.name, slots: piece, l: c.l, k: c.k });
        left -= piece;
        room -= piece;
        if (!room) {
          bars.push(bar);
          bar = [];
          room = M.slots;
        }
      }
    }
    if (bar.length) {
      bar.at(-1).slots += room;
      bars.push(bar);
    }
    sections.push({ name: st.head || 'Без подписи', repeat: 1, bars, l: st.headAt });
    for (const ln of done.lines) lines.push({ ...ln, start: ln.start + clock, from: ln.from + clock, to: ln.to + clock, anchors: ln.anchors.map((a) => ({ at: a.at, t: a.t + clock })) });
    clock += bars.length * M.slots;
  };
  for (let c = 0; c < cycles; c++) {
    for (const st of stanzas) {
      const times = Number(/×\s*(\d+)\s*$/.exec(st.head)?.[1]) || 1;
      let done;
      if (st.lines.length) {
        done = timeStanza(st);
        if (st.head) known.set(norm(st.head), done);
      } else if (known.has(norm(st.head))) {
        // одна подпись «Припев:» — спеть припев ещё раз
        done = known.get(norm(st.head));
      } else {
        // подпись части без строк: играем её такты, если такая часть у песни есть
        const sec = secByName(st.head);
        if (!sec) continue;
        done = { stream: sec.bars.flat().map((x) => ({ name: x.name, slots: x.slots, l: null, k: null })), lines: [] };
      }
      for (let t = 0; t < times; t++) emit(st, done);
    }
  }
  return sections.length ? { sections, lines } : null;
}

// сколько тактов в порядке
export const orderBars = (sections, form = sections.map((_, i) => i)) =>
  form.reduce((n, f) => {
    const s = sections[Array.isArray(f) ? f[0] : f];
    return n + s.bars.length * (Array.isArray(f) ? f[1] : s.repeat || 1);
  }, 0);

const plural = (n, [one, few, many]) => (n % 10 === 1 && n % 100 !== 11 ? one : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? few : many);

// Из каких частей состоит порядок: «вступление, 3 куплета, 3 припева, бридж». «Конец припева» — не отдельный припев.
export function partsSummary(sections, form = sections.map((_, i) => i)) {
  const NAMES = {
    verse: ['куплет', 'куплета', 'куплетов'],
    chorus: ['припев', 'припева', 'припевов'],
    pre: ['предприпев', 'предприпева', 'предприпевов'],
    bridge: ['бридж', 'бриджа', 'бриджей'],
  };
  const count = { verse: 0, pre: 0, chorus: 0, bridge: 0 };
  let inst = 0;
  let intro = false;
  let coda = false;
  for (const f of form) {
    const name = sections[Array.isArray(f) ? f[0] : f].name;
    const kind = /конец|оконч/i.test(name) ? '' : kindOf(name);
    if (kind === 'inst') {
      if (/вступ|intro/i.test(name)) intro = true;
      else if (/кода|coda|outro|финал/i.test(name)) coda = true;
      else inst++;
    } else if (count[kind] != null) count[kind]++;
  }
  const out = intro ? ['вступление'] : [];
  for (const k of ['verse', 'pre', 'chorus', 'bridge']) if (count[k]) out.push(`${count[k]} ${plural(count[k], NAMES[k])}`);
  if (inst) out.push(`${inst} ${plural(inst, ['проигрыш', 'проигрыша', 'проигрышей'])}`);
  if (coda) out.push('кода');
  return out.join(', ');
}

// сколько кругов в строфе: минимальный повторяющийся кусок тактов (для подписи ×N в листе аккордов)
export function barsPasses(bars) {
  const sig = bars.map((b) => b.map((c) => `${c.name}.${c.slots}`).join(' '));
  for (let p = 1; p <= sig.length / 2; p++) {
    if (sig.length % p === 0 && sig.every((x, i) => x === sig[i % p])) return sig.length / p;
  }
  return 1;
}
