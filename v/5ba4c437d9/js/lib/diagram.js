// Схема аккорда в SVG: вертикальный гриф, слева 6-я струна, справа 1-я.
import { OPEN, parseChord } from './theory.js';

const W = 100;
const X0 = 18;
const DX = 13;
const Y0 = 30;
const DY = 18;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function diagramSVG(v, { name = '', label = true } = {}) {
  if (!v) return `<svg class="dg" viewBox="0 0 ${W} 130" role="img" aria-label="${esc(name)}"><text x="50" y="70" text-anchor="middle" class="dg-txt">?</text></svg>`;
  const rows = Math.max(4, Math.min(5, v.max - v.base + 1));
  const H = Y0 + rows * DY + 10;
  const c = parseChord(name);
  const root = c?.valid ? c.root : null;
  const xs = (i) => X0 + i * DX;
  const yMid = (fret) => Y0 + (fret - v.base + 0.5) * DY;
  let s = `<svg class="dg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Аккорд ${esc(name)}">`;
  if (name) s += `<title>Аккорд ${esc(name)}</title>`;
  // лады
  for (let r = 0; r <= rows; r++) {
    const y = Y0 + r * DY;
    s += `<line class="dg-fret" x1="${xs(0)}" x2="${xs(5)}" y1="${y}" y2="${y}"/>`;
  }
  if (v.base === 1) s += `<rect class="dg-nut" x="${xs(0) - 1}" y="${Y0 - 4}" width="${xs(5) - xs(0) + 2}" height="5" rx="1.5"/>`;
  else s += `<text class="dg-base" x="${xs(0) - 6}" y="${Y0 + DY / 2 + 4}" text-anchor="end">${v.base}</text>`;
  // струны: 6-я толще
  for (let i = 0; i < 6; i++) {
    s += `<line class="dg-str" x1="${xs(i)}" x2="${xs(i)}" y1="${Y0}" y2="${Y0 + rows * DY}" stroke-width="${(1.9 - i * 0.18).toFixed(2)}"/>`;
  }
  // открытые и заглушённые
  for (let i = 0; i < 6; i++) {
    const f = v.frets[i];
    const y = Y0 - 12;
    if (f < 0) s += `<path class="dg-mute" d="M${xs(i) - 4} ${y - 4}l8 8m0-8l-8 8"/>`;
    else if (f === 0) {
      const isRoot = root != null && (OPEN[i] % 12) === root;
      s += `<circle class="dg-open${isRoot ? ' dg-root' : ''}" cx="${xs(i)}" cy="${y}" r="4.2"/>`;
    }
  }
  // баррэ
  for (const b of v.barres) {
    const y = yMid(b.fret);
    s += `<rect class="dg-barre" x="${xs(b.from) - 6.5}" y="${y - 6.5}" width="${xs(b.to) - xs(b.from) + 13}" height="13" rx="6.5"/>`;
  }
  // пальцы
  for (let i = 0; i < 6; i++) {
    const f = v.frets[i];
    if (f <= 0) continue;
    const inBarre = v.barres.some((b) => b.fret === f && i >= b.from && i <= b.to && v.fingers[i] === b.finger);
    const isRoot = root != null && ((OPEN[i] + f) % 12) === root;
    const y = yMid(f);
    if (!inBarre) s += `<circle class="dg-dot${isRoot ? ' dg-root' : ''}" cx="${xs(i)}" cy="${y}" r="6.5"/>`;
    const fg = v.fingers[i];
    if (fg && label && (!inBarre || i === v.barres.find((b) => b.fret === f && b.finger === fg)?.from)) {
      s += `<text class="dg-fg" x="${xs(i)}" y="${y + 3.6}" text-anchor="middle">${fg === 'T' ? 'Б' : fg}</text>`;
    }
  }
  s += '</svg>';
  return s;
}

// Подпись аппликатуры для поисковиков: «x02210».
export function fretsText(v) {
  if (!v) return '';
  const big = v.frets.some((f) => f > 9);
  return v.frets.map((f) => (f < 0 ? 'x' : f)).join(big ? '-' : '');
}
