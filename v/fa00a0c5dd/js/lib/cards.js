// Карточка аккорда для любого инструмента: схема со звуком по нажатию. Одна разметка и в сборке, и в браузере.
import { diagramSVG, fretsText } from './diagram.js';
import { INSTRUMENTS, PIANO_NOTE_RU } from './instruments.js';
import { keyboardSVG, pianoLatin } from './keyboard.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function pianoCaption(v) {
  return v ? `бас ${PIANO_NOTE_RU[v.bass % 12]} · ${v.rh.map((m) => PIANO_NOTE_RU[m % 12]).join(' ')}` : '';
}

export function instChordCard(inst, name, v, { href = '', caption = '' } = {}) {
  if (inst === 'piano') {
    const notes = v ? [{ midi: v.bass + 12, role: 'lh' }, ...v.rh.map((m) => ({ midi: m, role: 'rh' }))] : [];
    const data = v ? ` data-inst="piano" data-midi="${[v.bass, ...v.rh].join(',')}"` : '';
    const cap = caption || pianoCaption(v);
    return `<div class="chord chord-piano">
<button class="chord-btn" type="button" data-chord="${esc(name)}"${data} aria-label="Сыграть аккорд ${esc(name)} на фортепиано">
<span class="chord-name">${esc(name)}</span>${keyboardSVG({ from: 48, to: 71, notes, labels: 'name', name })}</button>
<span class="chord-cap">${href ? `<a href="${href}">${esc(cap)}</a>` : esc(cap)}</span>
</div>`;
  }
  const open = INSTRUMENTS[inst]?.open;
  const data = v ? ` data-inst="${inst}" data-frets="${v.frets.join(',')}" data-fingers="${v.fingers.join(',')}"` : '';
  const cap = caption || fretsText(v);
  return `<div class="chord chord-${inst}">
<button class="chord-btn" type="button" data-chord="${esc(name)}"${data} aria-label="Сыграть аккорд ${esc(name)}">
<span class="chord-name">${esc(name)}</span>${diagramSVG(v, { name, open })}</button>
<span class="chord-cap">${href ? `<a href="${href}">${esc(cap)}</a>` : esc(cap)}</span>
</div>`;
}

export { pianoLatin };
