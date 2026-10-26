// Мелодия для фортепиано в коротком текстовом виде (как таб, только ноты по названиям).
//   E4*2        ми первой октавы, 2 шага сетки (4 — номер октавы: C4 — до первой октавы)
//   C4+E4+G4    аккорд
//   F#4  Bb3    диез и бемоль
//   _  _*2      пауза
//   [C]         подпись аккорда над следующей нотой
//   |           тактовая черта
const LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function noteMidi(s) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(s);
  if (!m) return null;
  return 12 * (Number(m[3]) + 1) + LETTER[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

export function parseNotes(src, { grid = 2, meter = [4, 4] } = {}) {
  const ticksPerBar = meter[0] * grid;
  const events = [];
  const bars = [];
  const warnings = [];
  let t = 0;
  let barStart = 0;
  let chord = null;
  let min = 127;
  let max = 0;
  const closeBar = () => {
    if (t === barStart) return;
    if (bars.length > 0 && t - barStart !== ticksPerBar) warnings.push(`такт ${bars.length + 1}: ${t - barStart} шагов вместо ${ticksPerBar}`);
    bars.push({ start: barStart, len: t - barStart });
    barStart = t;
  };
  for (const raw of src.trim().split(/\s+/)) {
    if (raw === '|') { closeBar(); continue; }
    if (raw.startsWith('[') && raw.endsWith(']')) { chord = raw.slice(1, -1); continue; }
    let tok = raw;
    let d = 1;
    const star = tok.lastIndexOf('*');
    if (star > 0) { d = Number(tok.slice(star + 1)); tok = tok.slice(0, star); }
    if (tok === '_') { t += d; continue; }
    const notes = tok.split('+').map((n) => {
      const m = noteMidi(n);
      if (m == null) throw new Error(`Не понял ноту «${n}» в «${raw}»`);
      min = Math.min(min, m);
      max = Math.max(max, m);
      return m;
    });
    events.push({ t, d, notes, chord });
    chord = null;
    t += d;
  }
  closeBar();
  return { events, bars, total: t, grid, meter, ticksPerBar, min, max, warnings };
}
