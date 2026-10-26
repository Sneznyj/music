// Барабанные партии под рисунок песни. Ячейка — восьмая (в 6/8 — одна из шести).
// Две установки: rock — бочка, малый барабан, хай-хэт (песни с боем); soft — бочка, удар по ободу, шейкер (перебор).
// k — бочка, s — малый, h — закрытый хай-хэт, o — открытый, st — удар по ободу, sh — шейкер.

export const GROOVES = {
  rock: {
    '4/4': ['k+h', 'h', 's+h', 'h', 'k+h', 'k+h', 's+h', 'h'],
    '3/4': ['k+h', 'h', 's+h', 'h', 's+h', 'h'],
    '6/8': ['k+h', 'h', 'h', 's+h', 'h', 'h'],
  },
  soft: {
    '4/4': ['k+sh', 'sh', 'st+sh', 'sh', 'k+sh', 'sh', 'st+sh', 'sh'],
    '3/4': ['k+sh', 'sh', 'st+sh', 'sh', 'st+sh', 'sh'],
    '6/8': ['k+sh', 'sh', 'sh', 'st+sh', 'sh', 'sh'],
  },
};

export const STYLES = { rock: 'Ударные', soft: 'Мягко' };

// стиль по рисунку песни: перебор — мягко, бой — ударные
export const styleFor = (patternKind) => (patternKind === 'pick' ? 'soft' : 'rock');

// Что звучит в ячейке pos. first — первый такт части песни (там тарелка), last — последний такт части (сбивка).
export function drumHits(style, meter, pos, slots, { first = false, last = false } = {}) {
  const g = GROOVES[style][meter];
  let sym = g[pos % g.length];
  if (last && pos >= slots - 2) sym = style === 'rock' ? 's' : 'st+sh';
  const hits = sym.split('+');
  if (first && pos === 0 && style === 'rock') hits.splice(hits.indexOf('h'), 1, 'o');
  return hits;
}
