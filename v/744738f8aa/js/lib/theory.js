// Ноты, аккорды, транспонирование и аппликатуры гитары.
// Один модуль и для сборки сайта (Node), и для браузера.
// Струны в массивах идут от 6-й (толстой, низкое E) к 1-й (тонкой): индекс 0 = 6-я струна.

export const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
export const NOTE_RU = ['до', 'до-диез', 'ре', 'ми-бемоль', 'ми', 'фа', 'фа-диез', 'соль', 'соль-диез', 'ля', 'си-бемоль', 'си'];
export const OPEN = [40, 45, 50, 55, 59, 64]; // E2 A2 D3 G3 B3 E4
export const STRING_LETTERS = ['E', 'A', 'D', 'G', 'B', 'e'];

const LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11, H: 11 };
const mod12 = (v) => ((v % 12) + 12) % 12;

export function pc(name) {
  const m = /^([A-H])([#b]*)$/.exec(name || '');
  if (!m) return null;
  let v = LETTER[m[1]];
  for (const ch of m[2]) v += ch === '#' ? 1 : -1;
  return mod12(v);
}

export function noteName(p, flats = false) {
  return (flats ? FLAT : SHARP)[mod12(p)];
}

export function midiName(m, flats = false) {
  return noteName(m, flats) + (Math.floor(m / 12) - 1);
}

export const QUALITIES = {
  '': { iv: [0, 4, 7], ru: 'мажорный аккорд' },
  m: { iv: [0, 3, 7], ru: 'минорный аккорд' },
  '7': { iv: [0, 4, 7, 10], ru: 'доминантсептаккорд' },
  m7: { iv: [0, 3, 7, 10], ru: 'минорный септаккорд' },
  maj7: { iv: [0, 4, 7, 11], ru: 'большой мажорный септаккорд' },
  '6': { iv: [0, 4, 7, 9], ru: 'мажор с секстой' },
  m6: { iv: [0, 3, 7, 9], ru: 'минор с секстой' },
  sus2: { iv: [0, 2, 7], ru: 'аккорд с задержанием (секунда вместо терции)' },
  sus4: { iv: [0, 5, 7], ru: 'аккорд с задержанием (кварта вместо терции)' },
  '7sus4': { iv: [0, 5, 7, 10], ru: 'септаккорд с квартой' },
  add9: { iv: [0, 4, 7, 2], ru: 'мажор с добавленной ноной' },
  madd9: { iv: [0, 3, 7, 2], ru: 'минор с добавленной ноной' },
  '9': { iv: [0, 4, 7, 10, 2], ru: 'нонаккорд' },
  '6/9': { iv: [0, 4, 7, 9, 2], ru: 'мажор с секстой и ноной' },
  '5': { iv: [0, 7], ru: 'квинта, «пауэр-аккорд»' },
  dim: { iv: [0, 3, 6], ru: 'уменьшённый аккорд' },
  dim7: { iv: [0, 3, 6, 9], ru: 'уменьшённый септаккорд' },
  m7b5: { iv: [0, 3, 6, 10], ru: 'полууменьшённый септаккорд' },
  aug: { iv: [0, 4, 8], ru: 'увеличенный аккорд' },
  mmaj7: { iv: [0, 3, 7, 11], ru: 'минор с большой септимой' },
};

const ALIAS = {
  min: 'm', mi: 'm', M: '', maj: '', M7: 'maj7', Maj7: 'maj7', ma7: 'maj7', sus: 'sus4',
  '7(4)': '7sus4', '+': 'aug', o: 'dim', '°': 'dim', 'm7-5': 'm7b5', ø: 'm7b5',
  '2': 'sus2', add2: 'add9', '69': '6/9', 'm(maj7)': 'mmaj7', mM7: 'mmaj7',
};

export function parseChord(name) {
  const m = /^([A-H][#b]?)(.*)$/.exec(String(name || '').trim());
  if (!m) return null;
  let rest = m[2];
  let bass = null;
  const head = rest.startsWith('6/9') ? '6/9' : '';
  const tail = rest.slice(head.length);
  const slash = tail.lastIndexOf('/');
  if (slash >= 0) {
    bass = tail.slice(slash + 1);
    rest = head + tail.slice(0, slash);
  }
  const quality = rest in QUALITIES ? rest : ALIAS[rest] ?? null;
  const root = pc(m[1]);
  const bassPc = bass ? pc(bass) : null;
  const valid = root != null && quality != null && (!bass || bassPc != null);
  return { name: m[0], rootName: m[1], root, suffix: rest, quality, bass, bassPc, valid };
}

// Тональности, в которых аккорды принято писать через бемоли.
const FLAT_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm']);

export function keyUsesFlats(key) {
  return FLAT_KEYS.has(key);
}

export function transposeChord(name, semi, flats) {
  const c = parseChord(name);
  if (!c || c.root == null) return name;
  if (!semi && flats == null) return name;
  const useFlats = flats ?? c.rootName.includes('b');
  let out = noteName(c.root + semi, useFlats) + c.suffix;
  if (c.bass) out += '/' + noteName(c.bassPc + semi, useFlats);
  return out;
}

export function transposeKey(key, semi) {
  const minor = key.endsWith('m');
  const root = pc(minor ? key.slice(0, -1) : key);
  for (const flats of [false, true]) {
    const k = noteName(root + semi, flats) + (minor ? 'm' : '');
    if (flats === keyUsesFlats(k)) return k;
  }
  return noteName(root + semi) + (minor ? 'm' : '');
}

export function chordTones(name) {
  const c = parseChord(name);
  if (!c?.valid) return [];
  const tones = QUALITIES[c.quality].iv.map((i) => mod12(c.root + i));
  if (c.bassPc != null && !tones.includes(c.bassPc)) tones.unshift(c.bassPc);
  return tones;
}

export function keyRu(key) {
  const minor = key.endsWith('m');
  const p = pc(minor ? key.slice(0, -1) : key);
  return `${NOTE_RU[p]} ${minor ? 'минор' : 'мажор'}`;
}

// ---------- Аппликатуры ----------
// Лады: строка по одному символу на струну ("x32010") или через дефис для ладов от 10 ("x-10-12-12-12-10").
// Пальцы: 1 указательный … 4 мизинец, T большой, 0 без пальца.

const SHAPES = [
  // мажор
  ['C', 'x32010', '032010'], ['C', 'x35553', '013331'],
  ['C#', 'x46664', '013331'], ['D', 'xx0232', '000132'], ['D', 'x57775', '013331'],
  ['Eb', 'x68886', '013331'], ['E', '022100', '023100'], ['F', '133211', '134211'], ['F', 'xx3211', '003211'],
  ['F#', '244322', '134211'], ['G', '320003', '210003'], ['G', '320033', '210034'], ['G', '355433', '134211'],
  ['Ab', '466544', '134211'], ['A', 'x02220', '001230'], ['Bb', 'x13331', '013331'],
  ['B', 'x24442', '013331'],
  // минор
  ['Cm', 'x35543', '013421'], ['C#m', 'x46654', '013421'], ['Dm', 'xx0231', '000231'], ['Dm', 'x57765', '013421'],
  ['Ebm', 'x68876', '013421'], ['Em', '022000', '023000'], ['Fm', '133111', '134111'], ['F#m', '244222', '134111'],
  ['Gm', '355333', '134111'], ['G#m', '466444', '134111'], ['Am', 'x02210', '002310'], ['Am', '577555', '134111'],
  ['Bbm', 'x13321', '013421'], ['Bm', 'x24432', '013421'],
  // септаккорды
  ['C7', 'x32310', '032410'], ['D7', 'xx0212', '000213'], ['E7', '020100', '020100'], ['E7', '022130', '023140'],
  ['F7', '131211', '131211'], ['F#7', '242322', '131211'], ['G7', '320001', '320001'], ['A7', 'x02020', '002030'],
  ['B7', 'x21202', '021304'], ['C#7', 'x46464', '013141'],
  // минорные септаккорды
  ['Am7', 'x02010', '002010'], ['Em7', '020000', '020000'], ['Em7', '022030', '023040'], ['Em7', '022033', '012034'],
  ['Dm7', 'xx0211', '000211'], ['Bm7', 'x24232', '013121'], ['F#m7', '242222', '131111'], ['C#m7', 'x46454', '013121'],
  ['Gm7', '353333', '131111'], ['Cm7', 'x35343', '013121'], ['G#m7', '464444', '131111'],
  // большие септаккорды
  ['Cmaj7', 'x32000', '032000'], ['Dmaj7', 'xx0222', '000111'], ['Emaj7', '021100', '031200'], ['Fmaj7', 'xx3210', '003210'],
  ['Gmaj7', '320002', '320001'], ['Amaj7', 'x02120', '002130'],
  // sus, add, 6
  ['Dsus2', 'xx0230', '000130'], ['Dsus4', 'xx0233', '000134'], ['Asus2', 'x02200', '001200'], ['Asus4', 'x02230', '001230'],
  ['Esus4', '022200', '023400'], ['Gsus4', '330013', '230014'], ['Csus2', 'x30033', '020034'], ['Csus4', 'x33011', '034011'],
  ['A7sus4', 'x02030', '002030'], ['A7sus4', 'x02033', '001034'], ['D7sus4', 'xx0213', '000214'], ['E7sus4', '020200', '020300'],
  ['Cadd9', 'x32033', '021034'], ['Gadd9', '320203', '210304'], ['Amadd9', 'x02410', '002410'], ['Emadd9', '024000', '013000'],
  ['G6', '320000', '210000'], ['C6', 'x32210', '042310'], ['D6', 'xx0202', '000102'], ['E6', '022120', '023140'], ['A6', 'x02222', '001111'],
  ['Am6', 'x02212', '002314'], ['Dm6', 'xx0201', '000201'], ['Em6', '022020', '023040'],
  ['D6/9', 'x54455', '021134'], ['E5', '022xxx', '011000'], ['A5', 'x022xx', '001100'], ['D5', 'xx023x', '000130'],
  ['Bdim', 'x2343x', '012430'], ['Cdim7', 'x3424x', '023140'], ['Caug', 'x32110', '043120'], ['Eaug', '032110', '042310'],
  ['Am(maj7)', 'x02110', '003120'], ['Em(maj7)', '021000', '031000'],
  // аккорды с басом
  ['D/F#', '2x0232', 'T00132'], ['G/B', 'x20003', '010003'], ['G/F#', '2x0003', '100004'], ['C/G', '332010', '342010'],
  ['C/E', '032010', '032010'], ['C/B', 'x22010', '023010'], ['Am/G', '3x2210', '402310'], ['Am/F#', '2x2210', '102310'],
  ['A/E', '002220', '001230'], ['A/C#', 'x42220', '041230'], ['D/A', 'x00232', '000132'], ['E/G#', '4x2100', '402100'],
  ['F/C', 'x33211', '034211'], ['F/A', 'x03211', '003211'], ['Em/D', 'xx0000', '000000'], ['Em/B', 'x22000', '023000'],
  ['D6/9/F#', '2x0200', '100200'], ['Dsus2/F#', '2x0230', '100230'], ['Cmaj7/G', '332000', '342000'], ['Em7/D', 'xx0030', '000030'],
  ['G6/B', 'x20000', '010000'], ['Bm/A', 'x04432', '003421'], ['Bm7/D', 'xx0202', '000102'],
];

// Подвижные формы баррэ: сдвиг от лада баррэ b (лад основного тона на 6-й или 5-й струне), x — струна молчит.
const x = 'x';
const E_SHAPE = {
  '': [[0, 2, 2, 1, 0, 0], [1, 3, 4, 2, 1, 1]],
  m: [[0, 2, 2, 0, 0, 0], [1, 3, 4, 1, 1, 1]],
  '7': [[0, 2, 0, 1, 0, 0], [1, 3, 1, 2, 1, 1]],
  m7: [[0, 2, 0, 0, 0, 0], [1, 3, 1, 1, 1, 1]],
  maj7: [[0, x, 1, 1, 0, x], [1, 0, 3, 4, 2, 0]],
  sus4: [[0, 2, 2, 2, 0, 0], [1, 2, 3, 4, 1, 1]],
  '7sus4': [[0, 2, 0, 2, 0, 0], [1, 3, 1, 4, 1, 1]],
  m6: [[0, 2, 2, 0, 2, 0], [1, 2, 3, 1, 4, 1]],
  '5': [[0, 2, 2, x, x, x], [1, 3, 4, 0, 0, 0]],
};
const A_SHAPE = {
  '': [[x, 0, 2, 2, 2, 0], [0, 1, 3, 3, 3, 1]],
  m: [[x, 0, 2, 2, 1, 0], [0, 1, 3, 4, 2, 1]],
  '7': [[x, 0, 2, 0, 2, 0], [0, 1, 3, 1, 4, 1]],
  m7: [[x, 0, 2, 0, 1, 0], [0, 1, 3, 1, 2, 1]],
  maj7: [[x, 0, 2, 1, 2, 0], [0, 1, 3, 2, 4, 1]],
  sus2: [[x, 0, 2, 2, 0, 0], [0, 1, 3, 4, 1, 1]],
  sus4: [[x, 0, 2, 2, 3, 0], [0, 1, 2, 3, 4, 1]],
  '7sus4': [[x, 0, 2, 0, 3, 0], [0, 1, 3, 1, 4, 1]],
  '6': [[x, 0, 2, 2, 2, 2], [0, 1, 3, 3, 3, 3]],
  add9: [[x, 0, 2, 4, 2, 0], [0, 1, 2, 4, 3, 1]],
  madd9: [[x, 0, 2, 4, 1, 0], [0, 1, 3, 4, 2, 1]],
  '9': [[x, 0, -1, 0, 0, 0], [0, 2, 1, 3, 3, 3]],
  '6/9': [[x, 0, -1, -1, 0, 0], [0, 2, 1, 1, 3, 4]],
  '5': [[x, 0, 2, 2, x, x], [0, 1, 3, 4, 0, 0]],
  dim: [[x, 0, 1, 2, 1, x], [0, 1, 2, 4, 3, 0]],
  dim7: [[x, 0, 1, -1, 1, x], [0, 2, 3, 1, 4, 0]],
  m7b5: [[x, 0, 1, 0, 1, x], [0, 1, 3, 2, 4, 0]],
  aug: [[x, 0, 3, 2, 2, 1], [0, 1, 4, 2, 3, 1]],
  mmaj7: [[x, 0, 2, 1, 1, 0], [0, 1, 4, 2, 3, 1]],
};

function parseFrets(s) {
  const parts = /[-,]/.test(s) ? s.split(/[-,]/) : [...s];
  return parts.map((p) => (p === 'x' || p === 'X' ? -1 : Number(p)));
}

function parseFingers(s) {
  return [...(s || '000000')].map((p) => (p === 'T' ? 'T' : Number(p)));
}

export function makeVoicing(frets, fingers, extra = {}) {
  const fr = typeof frets === 'string' ? parseFrets(frets) : frets.slice();
  const fi = typeof fingers === 'string' ? parseFingers(fingers) : (fingers || fr.map(() => 0)).slice();
  const pressed = fr.filter((f) => f > 0);
  const min = pressed.length ? Math.min(...pressed) : 0;
  const max = pressed.length ? Math.max(...pressed) : 0;
  const base = max > 5 ? min : 1;
  const barres = [];
  for (let finger = 1; finger <= 4; finger++) {
    const idx = fi.map((f, i) => (f === finger ? i : -1)).filter((i) => i >= 0);
    if (idx.length < 2) continue;
    const fret = fr[idx[0]];
    if (fret <= 0 || !idx.every((i) => fr[i] === fret)) continue;
    barres.push({ fret, finger, from: Math.min(...idx), to: Math.max(...idx) });
  }
  return { frets: fr, fingers: fi, base, min, max, barres, ...extra };
}

const LIB = new Map();
const keyOf = (c) => `${c.root}:${c.quality}:${c.bassPc ?? ''}`;
for (const [name, frets, fingers] of SHAPES) {
  const c = parseChord(name);
  if (!c?.valid) throw new Error('Bad chord in SHAPES: ' + name);
  const k = keyOf(c);
  if (!LIB.has(k)) LIB.set(k, []);
  LIB.get(k).push(makeVoicing(frets, fingers, { source: 'lib' }));
}

function fromTemplate(tpl, b) {
  const [off, fing] = tpl;
  const frets = off.map((o) => (o === x ? -1 : o + b));
  if (frets.some((f) => f > 17 || f < -1)) return null;
  return makeVoicing(frets, fing, { source: 'gen' });
}

function generated(c) {
  const out = [];
  const add = (tpl, openPc) => {
    if (!tpl) return;
    const b = mod12(c.root - openPc);
    for (const fret of [b, b + 12]) {
      if (fret > 12 || fret === 0) continue;
      const v = fromTemplate(tpl, fret);
      if (v) out.push(v);
    }
  };
  add(E_SHAPE[c.quality], 4);
  add(A_SHAPE[c.quality], 9);
  return out.sort((a, b) => a.min - b.min);
}

function withBass(v, bassPc) {
  const sounding = v.frets.map((f, i) => (f >= 0 ? i : -1)).filter((i) => i >= 0);
  const lowest = sounding[0];
  for (const s of [0, 1]) {
    if (s > lowest) break;
    for (let f = 0; f <= 7; f++) {
      if (mod12(OPEN[s] + f) !== bassPc) continue;
      const reach = v.min === 0 ? f <= 4 : f === 0 || Math.abs(f - v.min) <= 3;
      if (!reach) continue;
      const frets = v.frets.slice();
      const fingers = v.fingers.slice();
      for (let i = 0; i < s; i++) { frets[i] = -1; fingers[i] = 0; }
      if (s === 0 && frets[1] >= 0 && lowest === 1 && f > 0 && fingers.includes(4) && fingers.includes(3)) continue;
      frets[s] = f;
      fingers[s] = f === 0 ? 0 : s === 0 && f <= 3 ? 'T' : 0;
      if (s === 0 && lowest > 1) frets[1] = -1;
      return makeVoicing(frets, fingers, { source: 'bass' });
    }
  }
  return null;
}

const cache = new Map();

export function voicings(name) {
  if (cache.has(name)) return cache.get(name);
  const c = parseChord(name);
  let out = [];
  if (c?.valid) {
    out.push(...(LIB.get(keyOf(c)) || []));
    if (c.bassPc == null || c.bassPc === c.root) {
      if (c.bassPc === c.root) out.push(...(LIB.get(`${c.root}:${c.quality}:`) || []));
      out.push(...generated(c));
    } else {
      for (const v of voicings(noteName(c.root) + c.suffix)) {
        const b = withBass(v, c.bassPc);
        if (b) out.push(b);
      }
      if (!out.length) out.push(...voicings(noteName(c.root) + c.suffix).map((v) => ({ ...v, bassMissing: true })));
    }
  }
  const seen = new Set();
  out = out.filter((v) => {
    const k = v.frets.join(',');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  cache.set(name, out);
  return out;
}

export function voicingFromString(frets, fingers) {
  return makeVoicing(frets, fingers, { source: 'custom' });
}

export function midiNotes(v) {
  return v.frets.map((f, i) => (f < 0 ? null : OPEN[i] + f)).filter((n) => n != null);
}

export function voicingPcs(v) {
  return [...new Set(midiNotes(v).map(mod12))];
}

export function difficulty(v) {
  if (!v) return 5;
  const used = v.fingers.filter((f) => f && f !== 'T').length;
  const bigBarre = v.barres.some((b) => b.finger === 1 && b.to - b.from >= 3);
  let d = bigBarre ? 3 : v.barres.length ? 2 : used >= 4 ? 1.6 : 1;
  if (v.min > 5) d += 0.5;
  return d;
}

// Самая удобная аппликатура аккорда для песни.
export function bestVoicing(name, overrides) {
  if (overrides && overrides[name]) {
    const [f, fi] = overrides[name].split(' ');
    return voicingFromString(f, fi);
  }
  return voicings(name)[0] || null;
}

export function isBarre(v) {
  return !!v && v.barres.some((b) => b.finger === 1 && b.to - b.from >= 3);
}

// Струна баса: самая низкая струна, где звучит тоника (или самая низкая звучащая).
export function bassString(v, name) {
  const c = parseChord(name);
  const want = c?.bassPc ?? c?.root;
  let lowest = -1;
  for (let i = 0; i < 6; i++) {
    if (v.frets[i] < 0) continue;
    if (lowest < 0) lowest = i;
    if (want != null && mod12(OPEN[i] + v.frets[i]) === want) return i;
  }
  return lowest;
}

// Адрес страницы аккорда: Am → am, F#m → f-diez-m, Bb7 → b-bemol-7, Cmaj7 → cmaj7.
export function chordSlug(name) {
  return name
    .replace(/#/g, '-diez-')
    .replace(/^([A-G])b/, '$1-bemol-')
    .replace(/\//g, '-na-')
    .toLowerCase()
    .replace(/-+$/, '')
    .replace(/-+/g, '-');
}

export function chordRu(name) {
  const c = parseChord(name);
  if (!c?.valid) return name;
  const q = QUALITIES[c.quality];
  let s = `${NOTE_RU[c.root]}, ${q.ru}`;
  if (c.bass) s += `, бас ${NOTE_RU[c.bassPc]}`;
  return s;
}
