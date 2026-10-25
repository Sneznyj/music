// Обложка песни в SVG: цвета и узор выбираются по адресу песни, поэтому у каждой своя и всегда одна и та же.
// Один модуль и для сборки, и для браузера.

const PALETTES = [
  ['#0b1f4d', '#2f6bff'],
  ['#1b1550', '#6a5cff'],
  ['#071a33', '#1aa7ff'],
  ['#0a2a2e', '#16c4b8'],
  ['#25104a', '#8b5cf6'],
  ['#06223a', '#22c3f0'],
  ['#1a1240', '#e0569b'],
  ['#0b2240', '#ff8a33'],
  ['#0d1530', '#4f8cff'],
  ['#102044', '#38d6ff'],
  ['#15183d', '#5b7bff'],
  ['#062a35', '#3dd3a8'],
];

function hash(s) {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function wrap(text, max) {
  const words = text.split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > max) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? cur + ' ' + w : w;
  }
  if (cur) lines.push(cur);
  return lines;
}

export function coverColors(slug) {
  return PALETTES[hash(slug) % PALETTES.length];
}

// song: { slug, title, artist }; text: false — только картинка без надписей (для маленьких значков)
export function coverSVG(song, { text = true } = {}) {
  const h = hash(song.slug);
  const [a, b] = coverColors(song.slug);
  const id = `cv${h.toString(36)}`;
  const motif = (h >> 5) % 4;
  let art = '';
  if (motif === 0) {
    // струны наискосок
    for (let i = 0; i < 6; i++) {
      const y = 40 + i * 16;
      art += `<line x1="-20" y1="${y + 90}" x2="240" y2="${y - 40}" stroke="#fff" stroke-opacity="${0.1 + i * 0.03}" stroke-width="${2.6 - i * 0.3}"/>`;
    }
  } else if (motif === 1) {
    // розетка гитары — круги
    const cx = 130 + ((h >> 9) % 50);
    const cy = 60 + ((h >> 13) % 60);
    for (let i = 0; i < 5; i++) art += `<circle cx="${cx}" cy="${cy}" r="${26 + i * 22}" fill="none" stroke="#fff" stroke-opacity="${0.22 - i * 0.035}" stroke-width="${3 - i * 0.4}"/>`;
    art += `<circle cx="${cx}" cy="${cy}" r="20" fill="#000" fill-opacity=".25"/>`;
  } else if (motif === 2) {
    // гриф со «схемой аккорда»
    for (let i = 0; i < 6; i++) art += `<line x1="${110 + i * 15}" y1="18" x2="${110 + i * 15}" y2="128" stroke="#fff" stroke-opacity=".22" stroke-width="1.6"/>`;
    for (let r = 0; r < 5; r++) art += `<line x1="110" y1="${18 + r * 27}" x2="185" y2="${18 + r * 27}" stroke="#fff" stroke-opacity=".18" stroke-width="1.4"/>`;
    for (let k = 0; k < 3; k++) {
      const s = (h >> (k * 3 + 4)) % 6;
      const f = (h >> (k * 2 + 11)) % 4;
      art += `<circle cx="${110 + s * 15}" cy="${31 + f * 27}" r="6.5" fill="#fff" fill-opacity=".55"/>`;
    }
  } else {
    // звуковая волна
    let d = 'M-10 90';
    const k = 1 + ((h >> 7) % 3);
    for (let x = 0; x <= 220; x += 10) d += ` L${x} ${90 + Math.sin((x / 220) * Math.PI * 2 * k + (h % 7)) * (18 + ((x * 7 + h) % 23))}`;
    art += `<path d="${d}" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="3" stroke-linejoin="round"/>`;
    art += `<path d="${d} L230 210 L-10 210 Z" fill="#fff" fill-opacity=".06"/>`;
  }
  let txt = '';
  if (text) {
    const lines = wrap(song.title, 14).slice(0, 3);
    const longest = Math.max(...lines.map((l) => l.length));
    const fs = Math.max(15, Math.min(30, Math.floor(176 / (longest * 0.6))));
    const top = 200 - 30 - lines.length * fs * 1.08;
    txt = lines.map((l, i) => `<text x="16" y="${(top + (i + 1) * fs * 1.04).toFixed(1)}" font-size="${fs}" class="cv-t">${esc(l)}</text>`).join('');
    txt += `<text x="16" y="186" font-size="11.5" class="cv-a">${esc(song.artist.slice(0, 30))}</text>`;
  }
  return `<svg class="cover" viewBox="0 0 200 200" role="img" aria-label="${esc(song.title)}"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient><linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset=".45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></linearGradient></defs><rect width="200" height="200" fill="url(#${id})"/>${art}${text ? `<rect width="200" height="200" fill="url(#${id}s)"/>` : ''}${txt}</svg>`;
}
