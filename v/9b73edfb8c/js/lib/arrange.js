// Перебор по аккордам песни для гитары — два уровня.
//   Обычный: бас и струны по очереди, как в рисунке песни (Б-3-2-3-1-3-2-3 и т. п.).
//   Продвинутый: бас вместе с 1-й струной («щипок»), чередующийся бас, восходящее легато с открытой струны (h),
//   нисходящее легато на открытую струну (p) и скольжение в бас нового аккорда (s).
// Легато берётся только с открытых струн, ноты которых есть в гамме песни, — так украшения не «режут» слух.
// Ответ — таб в формате lib/tab.js.

import { METERS } from './patterns.js';
import { OPEN, bassString, parseChord } from './theory.js';

const mod12 = (n) => ((n % 12) + 12) % 12;
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10, 11]; // натуральный минор + вводный тон (гармонический)

function scaleOf(key) {
  const minor = key.endsWith('m');
  const root = parseChord(minor ? key.slice(0, -1) : key).root;
  return new Set((minor ? MINOR : MAJOR).map((x) => mod12(root + x)));
}

// рисунки по размерам: ячейка — одна восьмая (в 6/8 — одна восьмая из шести)
const NORMAL = { '4/4': ['B', '3', '2', '3', '1', '3', '2', '3'], '3/4': ['B', '3', '2', '1', '2', '3'], '6/8': ['B', '3', '2', '1', '2', '3'] };
const ADVANCED = { '4/4': ['B+1', '3', 'H', 'h', 'A+2', '3', 'Q', 'q'], '3/4': ['B+1', '3', 'H', 'h', '2', 'Q'], '6/8': ['B+1', 'H', 'h', 'A+1', '3', '2'] };
const FALLBACK = { H: '2', h: '3', Q: '1', q: '2' };

// arrange({ bars: [[{ name, slots }]], meter: '4/4', key: 'Am', voicingOf: (name) => v, advanced })
export function arrange({ bars, meter, key, voicingOf, advanced = false }) {
  const M = METERS[meter];
  const pat = (advanced ? ADVANCED : NORMAL)[meter];
  const scale = scaleOf(key);
  const openOk = (s) => scale.has(mod12(OPEN[s]));
  let prevName = null;
  const out = [];
  bars.forEach((bar, bi) => {
    const cells = [];
    let t = 0;
    for (const ch of bar) {
      const v = voicingOf(ch.name);
      const b = v ? bassString(v, ch.name) : -1;
      const has = (s) => s >= 0 && s < 6 && v && v.frets[s] >= 0;
      const up = (s) => {
        // струна s или ближайшая звучащая выше неё
        while (s < 6 && !has(s)) s++;
        return s < 6 ? s : -1;
      };
      const alt = has(b === 0 ? 2 : b + 1) ? (b === 0 ? 2 : b + 1) : b;
      // легато вверх: открытая струна → лад аккорда (1–3), на средних струнах над басом
      let hs = -1;
      for (const s of [b + 1, b + 2, 3]) if (has(s) && s > b && s <= 3 && v.frets[s] >= 1 && v.frets[s] <= 3 && openOk(s)) { hs = s; break; }
      // легато вниз: лад аккорда (1–3) → открытая струна, на тонких струнах, через такт
      let ps = -1;
      if (bi % 2 === 1) for (const s of [4, 5, 3]) if (has(s) && v.frets[s] >= 1 && v.frets[s] <= 3 && openOk(s)) { ps = s; break; }
      const changed = ch.name !== prevName;
      for (let k = 0; k < ch.slots; k++, t++) {
        let sym = pat[t % pat.length];
        if (k === 0 && t > 0 && sym !== 'B' && !sym.startsWith('B')) sym = advanced ? 'B+2' : 'B';
        if ((sym === 'H' || sym === 'h') && (hs < 0 || (sym === 'h' && k === 0))) sym = FALLBACK[sym];
        if (sym === 'H' && k === ch.slots - 1) sym = FALLBACK.H;
        if ((sym === 'Q' || sym === 'q') && (ps < 0 || (sym === 'q' && k === 0))) sym = FALLBACK[sym];
        if (sym === 'Q' && k === ch.slots - 1) sym = FALLBACK.Q;
        const notes = [];
        for (const part of sym.split('+')) {
          let s;
          let txt = null;
          if (part === 'B') {
            s = b;
            if (s < 0) continue;
            const f = v.frets[s];
            txt = `${6 - s}.${advanced && k === 0 && changed && prevName && f >= 2 ? 's' : ''}${f}`;
          } else if (part === 'A') {
            s = alt;
            if (s < 0) continue;
            txt = `${6 - s}.${v.frets[s]}`;
          } else if (part === 'H') {
            s = hs;
            txt = `${6 - s}.0`;
          } else if (part === 'h') {
            s = hs;
            txt = `${6 - s}.h${v.frets[s]}`;
          } else if (part === 'Q') {
            s = ps;
            txt = `${6 - s}.${v.frets[s]}`;
          } else if (part === 'q') {
            s = ps;
            txt = `${6 - s}.p0`;
          } else {
            s = up(6 - Number(part));
            if (s < 0 || s <= b) continue;
            txt = `${6 - s}.${v.frets[s]}`;
          }
          if (!notes.some((n) => n.startsWith(`${6 - s}.`))) notes.push(txt);
        }
        const label = k === 0 ? `[${ch.name}] ` : '';
        cells.push(label + (notes.length ? notes.join('+') : '_'));
      }
      prevName = ch.name;
    }
    out.push(cells.join(' '));
  });
  const lines = [];
  for (let i = 0; i < out.length; i += 4) lines.push(out.slice(i, i + 4).join(' | ') + ' |');
  const [n, d] = meter.split('/').map(Number);
  return { tab: lines.join('\n'), grid: meter === '6/8' ? 1 : 2, meter: [n, d] };
}

// Свой рисунок песни (PATTERNS[…].own, например рисунок Доминика Миллера в Shape of My Heart) — по шестнадцатым.
// Шаг рисунка — восьмая; «2,B» — вторая нота на шестнадцатую позже; N — бас аккорда, который звучит следующим.
// Номера струн берутся как в форме песни; если струна в форме молчит — ближайшая звучащая, верхние номера выше.
export function arrangeOwn({ bars, meter, steps, voicingOf }) {
  const M = METERS[meter];
  const flat = bars.flatMap((bar) => bar.flatMap((ch) => Array.from({ length: ch.slots }, (_, k) => ({ ch, k }))));
  const info = new Map();
  const infoOf = (name) => {
    if (info.has(name)) return info.get(name);
    const v = voicingOf(name);
    const b = v ? bassString(v, name) : -1;
    const up = v ? [5, 4, 3, 2, 1, 0].filter((s) => s > b && v.frets[s] >= 0) : [];
    const used = [...new Set(steps.flatMap((st) => st.split(/[,+]/)).filter((p) => /^\d$/.test(p)).map(Number))].sort((a, z) => a - z);
    const got = new Map();
    for (const n of used) if (up.includes(6 - n)) got.set(n, 6 - n);
    for (const n of used) if (!got.has(n)) got.set(n, up.find((s) => ![...got.values()].includes(s)) ?? up[0] ?? -1);
    // верхние номера — на верхних струнах
    const strs = [...new Set(got.values())].filter((s) => s >= 0).sort((a, z) => z - a);
    used.forEach((n, i) => got.set(n, strs[Math.min(i, strs.length - 1)] ?? -1));
    const o = { v, b, map: got };
    info.set(name, o);
    return o;
  };
  const cell = (part, i) => {
    const out = [];
    for (const p of part.split('+')) {
      if (p === '.' || !p) continue;
      const name = p === 'N' ? flat[(i + 1) % flat.length].ch.name : flat[i].ch.name;
      const { v, b, map } = infoOf(name);
      const s = p === 'B' || p === 'N' ? b : map.get(Number(p));
      if (!v || s == null || s < 0) continue;
      const txt = `${6 - s}.${v.frets[s]}`;
      if (!out.some((x) => x.startsWith(`${6 - s}.`))) out.push(txt);
    }
    return out.length ? out.join('+') : '_';
  };
  const out = [];
  let i = 0;
  for (const bar of bars) {
    const cells = [];
    for (const ch of bar)
      for (let k = 0; k < ch.slots; k++, i++) {
        const [a, z = '.'] = steps[(i % M.slots) % steps.length].split(',');
        cells.push((k === 0 ? `[${ch.name}] ` : '') + cell(a, i), cell(z, i));
      }
    out.push(cells.join(' '));
  }
  const lines = [];
  for (let j = 0; j < out.length; j += 4) lines.push(out.slice(j, j + 4).join(' | ') + ' |');
  const [n, d] = meter.split('/').map(Number);
  return { tab: lines.join('\n'), grid: M.slotsPerBeat * 2, meter: [n, d] };
}
