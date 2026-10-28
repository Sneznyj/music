// Клавиатура фортепиано в SVG: подсвеченные клавиши аккорда или мелодии.
// notes — [{ midi, role }]: role 'rh' — правая рука (голубой), 'lh' — левая (фиолетовый), 'next' — следующая нота.
const NAMES = ['до', 'до♯', 'ре', 'ми♭', 'ми', 'фа', 'фа♯', 'соль', 'соль♯', 'ля', 'си♭', 'си'];
const LATIN = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
const BLACK = new Set([1, 3, 6, 8, 10]);

export const isBlack = (m) => BLACK.has(((m % 12) + 12) % 12);
export const pianoName = (m) => NAMES[((m % 12) + 12) % 12];
export const pianoLatin = (m) => LATIN[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

// from/to — крайние ноты (MIDI), по умолчанию до большой октавы — си первой (C2…B4)
export function keyboardSVG({ from = 36, to = 71, notes = [], labels = 'name', name = '' } = {}) {
  while (isBlack(from)) from--;
  while (isBlack(to)) to++;
  const whites = [];
  for (let m = from; m <= to; m++) if (!isBlack(m)) whites.push(m);
  const ww = 20;
  const wh = 84;
  const bw = 12;
  const bh = 52;
  const W = whites.length * ww;
  const pos = new Map();
  whites.forEach((m, i) => pos.set(m, i * ww));
  const role = new Map(notes.map((n) => [n.midi, n.role || 'rh']));
  let s = `<svg class="kb" viewBox="0 0 ${W} ${wh + 2}" role="img" aria-label="${name ? `Аккорд ${name} на клавиатуре` : 'Клавиатура'}" data-from="${from}" data-to="${to}">`;
  for (const m of whites) {
    const r = role.get(m);
    const x = pos.get(m);
    s += `<rect class="kb-w${r ? ' kb-' + r : ''}" data-m="${m}" x="${x + 0.5}" y="0.5" width="${ww - 1}" height="${wh}" rx="3"/>`;
    if (r && r !== 'next' && labels) s += `<text class="kb-t" x="${x + ww / 2}" y="${wh - 8}" text-anchor="middle">${labels === 'latin' ? LATIN[m % 12] : NAMES[m % 12]}</text>`;
    else if (m % 12 === 0) s += `<text class="kb-c" x="${x + ww / 2}" y="${wh - 8}" text-anchor="middle">C${Math.floor(m / 12) - 1}</text>`;
  }
  for (let m = from; m <= to; m++) {
    if (!isBlack(m)) continue;
    const x = pos.get(m - 1) + ww - bw / 2;
    const r = role.get(m);
    s += `<rect class="kb-b${r ? ' kb-' + r : ''}" data-m="${m}" x="${x}" y="0.5" width="${bw}" height="${bh}" rx="2"/>`;
    if (r && r !== 'next' && labels) s += `<text class="kb-tb" x="${x + bw / 2}" y="${bh - 6}" text-anchor="middle">${(labels === 'latin' ? LATIN[m % 12] : NAMES[m % 12]).replace('♯', '#').replace('♭', 'b').slice(0, 4)}</text>`;
  }
  return s + '</svg>';
}
