// Разбор стандартного MIDI-файла (.mid) для тренажёра «падающие ноты»: ноты всех дорожек, кроме ударных
// (10-й канал), время — в четвертях при первом темпе файла (смены темпа учтены).
// midiPart() раскладывает ноты по рукам: дорожка с самыми высокими нотами — правая рука, с самыми низкими — левая;
// если дорожка одна — всё ниже до первой октавы (C4) играет левая.

export function parseMidi(buf) {
  const d = new DataView(buf);
  const txt = (at, n) => String.fromCharCode(...new Uint8Array(buf, at, n));
  if (buf.byteLength < 14 || txt(0, 4) !== 'MThd') throw new Error('Это не MIDI-файл');
  const ntr = d.getUint16(10);
  const div = d.getUint16(12);
  if (div & 0x8000) throw new Error('В файле время SMPTE — такие не поддерживаются');
  let p = 8 + d.getUint32(4);
  const vlq = () => {
    let v = 0;
    let b;
    do {
      b = d.getUint8(p++);
      v = (v << 7) | (b & 0x7f);
    } while (b & 0x80);
    return v;
  };
  const tempos = [];
  let ts = null;
  const tracks = [];
  for (let k = 0; k < ntr && p + 8 <= buf.byteLength; k++) {
    const id = txt(p, 4);
    const end = Math.min(buf.byteLength, p + 8 + d.getUint32(p + 4));
    p += 8;
    if (id !== 'MTrk') {
      p = end;
      continue;
    }
    let tick = 0;
    let run = 0;
    let name = '';
    const open = new Map();
    const notes = [];
    while (p < end) {
      tick += vlq();
      let st = d.getUint8(p);
      if (st & 0x80) p++;
      else st = run;
      if (st === 0xff) {
        const type = d.getUint8(p++);
        const len = vlq();
        if (type === 0x51 && len >= 3) tempos.push([tick, (d.getUint8(p) << 16) | (d.getUint8(p + 1) << 8) | d.getUint8(p + 2)]);
        else if (type === 0x58 && len >= 2 && !ts) ts = [d.getUint8(p), 2 ** d.getUint8(p + 1)];
        else if (type === 0x03 && !name) name = new TextDecoder().decode(new Uint8Array(buf, p, len)).trim();
        p += len;
        continue;
      }
      if (st === 0xf0 || st === 0xf7) {
        p += vlq();
        continue;
      }
      if (!(st & 0x80)) break; // испорченная дорожка
      run = st;
      const type = st & 0xf0;
      const ch = st & 15;
      const a = d.getUint8(p++);
      const b = type === 0xc0 || type === 0xd0 ? 0 : d.getUint8(p++);
      const key = ch * 128 + a;
      if (type === 0x90 && b > 0) {
        if (!open.has(key)) open.set(key, []);
        open.get(key).push([tick, b]);
      } else if (type === 0x80 || type === 0x90) {
        const q = open.get(key);
        if (q?.length) {
          const [t0, v] = q.shift();
          notes.push({ t0, t1: tick, m: a, v, ch });
        }
      }
    }
    p = end;
    tracks.push({ name, notes });
  }
  tempos.sort((a, b) => a[0] - b[0]);
  if (!tempos.length || tempos[0][0] > 0) tempos.unshift([0, 500000]);
  const sec = (tick) => {
    let s = 0;
    let last = 0;
    let us = tempos[0][1];
    for (const [tk, u] of tempos) {
      if (tk >= tick) break;
      s += ((tk - last) * us) / div / 1e6;
      last = tk;
      us = u;
    }
    return s + ((tick - last) * us) / div / 1e6;
  };
  const bpm = Math.round(60e6 / tempos[0][1]);
  const beats = (tick) => (sec(tick) * bpm) / 60;
  return {
    bpm,
    ts: ts || [4, 4],
    tracks: tracks
      .map((tr) => ({ name: tr.name, notes: tr.notes.filter((n) => n.ch !== 9).map((n) => ({ t: beats(n.t0), d: Math.max(0.05, beats(n.t1) - beats(n.t0)), m: n.m, v: n.v })) }))
      .filter((tr) => tr.notes.length),
  };
}

export function midiPart(mid, title) {
  if (!mid.tracks.length) throw new Error('В файле нет нот');
  const avg = (tr) => tr.notes.reduce((s, n) => s + n.m, 0) / tr.notes.length;
  const sorted = [...mid.tracks].sort((a, b) => avg(b) - avg(a));
  const notes = [];
  if (sorted.length === 1) for (const n of sorted[0].notes) notes.push({ ...n, h: n.m < 60 ? 'L' : 'R' });
  else
    sorted.forEach((tr, i) => {
      const h = i === 0 ? 'R' : i === sorted.length - 1 ? 'L' : avg(tr) >= 60 ? 'R' : 'L';
      for (const n of tr.notes) notes.push({ ...n, h });
    });
  const beatsPerBar = (mid.ts[0] * 4) / mid.ts[1];
  // тишину в начале убираем целыми тактами
  const first = Math.min(...notes.map((n) => n.t));
  const shift = Math.floor(first / beatsPerBar) * beatsPerBar;
  for (const n of notes) n.t -= shift;
  notes.sort((a, b) => a.t - b.t || a.m - b.m);
  const total = Math.ceil(Math.max(...notes.map((n) => n.t + n.d)) / beatsPerBar) * beatsPerBar;
  const bars = [];
  for (let t = 0; t < total; t += beatsPerBar) bars.push({ t });
  return { notes, bars, chords: [], sections: [{ t: 0, name: title }], bpm: mid.bpm, beatsPerBar, total, title, artist: 'свой MIDI' };
}
