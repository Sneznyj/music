// Табулатура в коротком текстовом виде.
//
//   6.0          6-я струна, открытая (1 — тонкая струна, 6 — толстая)
//   3.5*2        3-я струна, 5 лад, длится 2 шага сетки
//   4.0+3.0      две ноты вместе
//   ~6.2+5.4+…   аккорд «раскатом» (по очереди, быстро)
//   3.h7 3.p5 3.s7   легато вверх, легато вниз, глиссандо
//   6.x          глухой удар по струне
//   _  _*3       пауза в 1 и в 3 шага
//   [Am]         подпись аккорда над следующей нотой
//   |            тактовая черта
//
// Сетка (grid) — сколько шагов в одной доле: 2 — восьмые, 4 — шестнадцатые, 3 — триоли.

export function parseTab(src, { grid = 2, meter = [4, 4], strings = 6 } = {}) {
  const ticksPerBar = meter[0] * grid;
  const events = [];
  const bars = [];
  const warnings = [];
  let t = 0;
  let barStart = 0;
  let chord = null;
  let minFret = 99;
  let maxFret = 0;

  const closeBar = () => {
    if (t === barStart) return;
    const len = t - barStart;
    if (bars.length > 0 && len !== ticksPerBar) warnings.push(`такт ${bars.length + 1}: ${len} шагов вместо ${ticksPerBar}`);
    bars.push({ start: barStart, len });
    barStart = t;
  };

  for (const raw of src.trim().split(/\s+/)) {
    if (!raw) continue;
    if (raw === '|') { closeBar(); continue; }
    if (raw.startsWith('[') && raw.endsWith(']')) { chord = raw.slice(1, -1); continue; }
    let tok = raw;
    let dur = 1;
    const star = tok.lastIndexOf('*');
    if (star > 0) { dur = Number(tok.slice(star + 1)); tok = tok.slice(0, star); }
    if (!(dur > 0)) throw new Error(`Плохая длительность: ${raw}`);
    if (tok === '_') { t += dur; continue; }
    let roll = false;
    if (tok.startsWith('~')) { roll = true; tok = tok.slice(1); }
    const notes = tok.split('+').map((n) => {
      const m = /^([1-6])\.([hps]?)(x|\d{1,2})$/.exec(n);
      if (!m) throw new Error(`Не понял ноту «${n}» в «${raw}»`);
      const s = Number(m[1]);
      if (s > strings) throw new Error(`Струны ${s} нет: у инструмента ${strings} в «${raw}»`);
      const dead = m[3] === 'x';
      const f = dead ? 0 : Number(m[3]);
      if (!dead) { minFret = Math.min(minFret, f); maxFret = Math.max(maxFret, f); }
      return { s, f, tech: m[2] || '', dead };
    });
    events.push({ t, d: dur, notes, roll, chord });
    chord = null;
    t += dur;
  }
  closeBar();
  return { grid, meter, strings, ticksPerBar, events, bars, total: t, minFret: minFret === 99 ? 0 : minFret, maxFret, warnings };
}

// Обычная текстовая табулатура (для поисковиков и печати).
export function tabToText(tab, letters = ['e', 'B', 'G', 'D', 'A', 'E']) {
  const n = tab.strings || letters.length;
  const lines = letters.slice(0, n).map((x) => x + '|');
  for (const bar of tab.bars) {
    const cols = [];
    for (let k = 0; k < bar.len; k++) cols.push(Array.from({ length: n }, () => '-'));
    for (const ev of tab.events) {
      if (ev.t < bar.start || ev.t >= bar.start + bar.len) continue;
      for (const nt of ev.notes) cols[ev.t - bar.start][nt.s - 1] = nt.dead ? 'x' : (nt.tech || '') + nt.f;
    }
    for (let s = 0; s < n; s++) {
      let row = '';
      for (const c of cols) {
        const w = Math.max(...c.map((x) => x.length));
        row += c[s].padEnd(w, '-') + '-';
      }
      lines[s] += row + '|';
    }
  }
  return lines.join('\n');
}
