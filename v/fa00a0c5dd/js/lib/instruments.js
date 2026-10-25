// Другие инструменты: укулеле, бас-гитара и фортепиано. Аккорды для них считаются из той же теории (theory.js).
// Струны укулеле и баса в массивах — от самой низкой по положению (4-я) к 1-й, как у гитары.
import { OPEN, QUALITIES, makeVoicing, noteName, parseChord } from './theory.js';

export const INSTRUMENTS = {
  guitar: { id: 'guitar', name: 'Гитара', slug: 'gitara', strings: 6, open: OPEN, letters: ['E', 'A', 'D', 'G', 'B', 'e'] },
  ukulele: { id: 'ukulele', name: 'Укулеле', slug: 'ukulele', strings: 4, open: [67, 60, 64, 69], letters: ['G', 'C', 'E', 'A'] },
  piano: { id: 'piano', name: 'Фортепиано', slug: 'pianino', keys: true },
  bass: { id: 'bass', name: 'Бас-гитара', slug: 'bas', strings: 4, open: [28, 33, 38, 43], letters: ['E', 'A', 'D', 'G'] },
};

const mod12 = (v) => ((v % 12) + 12) % 12;

// ---------- укулеле (строй G C E A) ----------
// лады через пробел не нужны: на укулеле аккорды в первых ладах, а высокие пишем через дефис
const UKE = [
  ['C', '0003', '0003'], ['C#', '1114', '1114'], ['D', '2220', '1230'], ['Eb', '0331', '0341'], ['E', '1402', '1403'],
  ['F', '2010', '2010'], ['F#', '3121', '3121'], ['G', '0232', '0132'], ['G#', '1343', '1243'], ['A', '2100', '2100'],
  ['Bb', '3211', '3211'], ['B', '4322', '3211'],
  ['Cm', '0333', '0123'], ['C#m', '1104', '1104'], ['Dm', '2210', '2310'], ['Ebm', '3321', '3421'], ['Em', '0432', '0321'],
  ['Fm', '1013', '1024'], ['F#m', '2120', '2130'], ['Gm', '0231', '0231'], ['G#m', '1342', '1342'], ['Am', '2000', '2000'],
  ['Bbm', '3111', '3111'], ['Bm', '4222', '3111'],
  ['C7', '0001', '0001'], ['C#7', '1112', '1112'], ['D7', '2223', '1112'], ['Eb7', '3334', '1112'], ['E7', '1202', '1203'],
  ['F7', '2310', '2310'], ['F#7', '3424', '1324'], ['G7', '0212', '0213'], ['G#7', '1323', '1324'], ['A7', '0100', '0100'],
  ['Bb7', '1211', '1211'], ['B7', '2322', '1211'],
  ['Cm7', '3333', '1111'], ['C#m7', '1102', '1103'], ['Dm7', '2213', '2314'], ['Em7', '0202', '0102'], ['Fm7', '1313', '1324'],
  ['F#m7', '2424', '1324'], ['Gm7', '0211', '0211'], ['Am7', '0000', '0000'], ['Bm7', '2222', '1111'],
  ['Cmaj7', '0002', '0002'], ['Dmaj7', '2224', '1113'], ['Emaj7', '1302', '1302'], ['Fmaj7', '2410', '2410'], ['Gmaj7', '0222', '0123'],
  ['Amaj7', '1100', '1200'],
  ['Csus4', '0013', '0013'], ['Dsus4', '0230', '0230'], ['Gsus4', '0233', '0234'], ['Asus4', '2200', '1200'], ['Esus4', '4400', '3400'],
  ['Csus2', '0233', '0234'], ['Dsus2', '2200', '1200'], ['Gsus2', '0230', '0230'], ['Asus2', '2452', '1341'],
  ['Cadd9', '0203', '0203'], ['C6', '0000', '0000'], ['D6', '2222', '1111'], ['G6', '0202', '0102'], ['A6', '2424', '1324'], ['F6', '2213', '2314'],
  ['C7sus4', '3533', '1311'], ['D7sus4', '2233', '1123'], ['E7sus4', '2202', '1203'], ['G7sus4', '0213', '0213'], ['A7sus4', '0200', '0100'],
  ['C5', '0033', '0034'], ['D5', '2255', '1134'], ['E5', '4477', '1134'], ['G5', '0235', '0124'], ['A5', '2400', '1300'],
];

// подвижные формы: открытая форма сдвигается вверх, открытые струны прижимает указательный (баррэ)
const UKE_MOVE = {
  '': [['2100', '2100', 9], ['0003', '0003', 0]],
  m: [['2000', '2000', 9], ['0333', '0123', 0]],
  '7': [['0100', '0100', 9], ['0001', '0001', 0]],
  m7: [['0000', '0000', 9]],
  maj7: [['1100', '1200', 9], ['0002', '0002', 0]],
  sus4: [['2200', '1200', 9], ['0013', '0013', 0]],
  sus2: [['2200', '1200', 2], ['0233', '0234', 0]],
  '6': [['2424', '1324', 9], ['0000', '0000', 0]],
  add9: [['0203', '0203', 0], ['0010', '0010', 5]],
  '5': [['0033', '0034', 0], ['2400', '1300', 9]],
  '7sus4': [['0200', '0100', 9], ['0213', '0213', 7]],
};

// на четырёх струнах все пять нот 6/9 не взять — играют секстаккорд, он звучит почти так же
const UKE_NEAR = { '6/9': '6' };

const parseFr = (s) => (s.includes('-') ? s.split('-') : [...s]).map((c) => (c === 'x' ? -1 : Number(c)));
const parseFi = (s) => [...s].map(Number);

const UKE_LIB = new Map();
for (const [n, f, fi] of UKE) {
  const c = parseChord(n);
  const k = `${c.root}:${c.quality}`;
  if (!UKE_LIB.has(k)) UKE_LIB.set(k, []);
  UKE_LIB.get(k).push(makeVoicing(parseFr(f), parseFi(fi), { source: 'lib' }));
}

export function ukeVoicings(name) {
  const c = parseChord(name);
  if (!c?.valid) return [];
  const out = [...(UKE_LIB.get(`${c.root}:${c.quality}`) || [])];
  for (const [f, fi, root] of UKE_MOVE[c.quality] || []) {
    const shift = mod12(c.root - root);
    if (!shift) continue;
    const frets = parseFr(f).map((x) => x + shift);
    if (Math.max(...frets) > 12) continue;
    const fingers = parseFi(fi).map((x, i) => (parseFr(f)[i] === 0 ? 1 : Math.min(4, x + 1)));
    out.push(makeVoicing(frets, fingers, { source: 'gen' }));
  }
  // аккорд с басом (D/F#) на укулеле играют без баса
  if (!out.length && c.bass) return ukeVoicings(noteName(c.root) + c.suffix);
  if (!out.length && UKE_NEAR[c.quality]) return ukeVoicings(noteName(c.root) + UKE_NEAR[c.quality]);
  const seen = new Set();
  return out.filter((v) => {
    const k = v.frets.join(',');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ---------- бас-гитара: тоника, квинта и октава ----------
// Басист играет не аккорд, а его основу. Форма «корень — квинта — октава» одна для любого аккорда:
// корень на 4-й или 3-й струне (E или A), квинта — на соседней струне на два лада дальше, октава — через струну.
export function bassVoicing(name) {
  const c = parseChord(name);
  if (!c?.valid) return null;
  const root = c.bassPc ?? c.root;
  const fE = mod12(root - 4);
  const fA = mod12(root - 9);
  const fifth = QUALITIES[c.quality].iv.includes(7) || c.quality === '' || c.quality === 'm';
  let frets;
  if (fA <= 4 || fA < fE) frets = [-1, fA, fifth ? fA + 2 : -1, fA + 2];
  else frets = [fE, fifth ? fE + 2 : -1, fE + 2, -1];
  // корень — указательный (или открытая струна), квинта и октава — средний и безымянный / безымянный и мизинец
  const rootFret = frets.find((f) => f >= 0);
  let k = 0;
  const fingers = frets.map((f) => {
    if (f < 0) return 0;
    if (f === rootFret && k === 0) {
      k++;
      return f === 0 ? 0 : 1;
    }
    k++;
    return rootFret === 0 ? k : k + 1;
  });
  return makeVoicing(frets, fingers, { source: 'bass' });
}

// ---------- фортепиано ----------
// Правая рука — аккорд в тесном расположении около до первой октавы (F3–E4: там аккорд звучит чисто),
// левая — тоника (или бас из записи D/F#) в большой октаве (C2–B2).
export function pianoVoicing(name) {
  const c = parseChord(name);
  if (!c?.valid) return null;
  const iv = QUALITIES[c.quality].iv;
  const lo = 53;
  const rh = [...new Set(iv.map((st) => lo + mod12(c.root + st - lo)))].sort((a, b) => a - b);
  const bass = 36 + mod12(c.bassPc ?? c.root);
  return { bass, rh, root: c.root };
}

export function pianoNotes(name) {
  const v = pianoVoicing(name);
  return v ? [v.bass, ...v.rh] : [];
}

export const PIANO_NOTE_RU = ['до', 'до♯', 'ре', 'ми♭', 'ми', 'фа', 'фа♯', 'соль', 'соль♯', 'ля', 'си♭', 'си'];

export function voicingFor(instrument, name) {
  if (instrument === 'ukulele') return ukeVoicings(name)[0] || null;
  if (instrument === 'bass') return bassVoicing(name);
  if (instrument === 'piano') return pianoVoicing(name);
  return null;
}
