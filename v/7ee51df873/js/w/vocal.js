// Вкладка «Вокал» на странице песни: минус из аккордов песни (гитара и бас в выбранной тональности и темпе),
// запись голоса под него, «ваша нота» во время пения, прослушивание с минусом, скачивание WAV
// и передача записи в Студию (/vocal/studio/), где «Сделать красиво» подтянет ноты и добавит обработку.
// После записи — разбор голоса (voicereport.js): тембр, диапазон, точность по аккордам песни.
import { Seq, audio, click, drum, hush, loadDrums, note, outStream } from '../audio.js';
import { drumHits, styleFor } from '../lib/drums.js';
import { icon } from '../lib/icons.js';
import { METERS, PATTERNS } from '../lib/patterns.js';
import * as T from '../lib/theory.js';
import { yin } from './tuner.js';
import { voiceReport } from './voicereport.js';
import { claim, el, playStepOn, release, slider, store, toggle } from './util.js';

export function init() {
  const root = document.querySelector('.vocal-tools');
  if (root) setup(root);
}

const mod12 = (n) => ((n % 12) + 12) % 12;
const PLAY = icon('play', { fill: true });
const STOP = icon('square', { fill: true });

function setup(root) {
  const data = JSON.parse(document.querySelector('.sheet-data').textContent);
  const M = METERS[data.meter];
  const pat = PATTERNS[data.pattern];
  const title = root.dataset.title;
  let key = window.__songKey || { tr: 0, key: data.key };
  addEventListener('song:key', (e) => {
    key = e.detail;
    keyOut.textContent = key.key;
    if (!seq?.running) showChord(0);
  });

  // ---------- песня по восьмым ----------
  const flat = [];
  data.sections.forEach((s, si) => {
    for (let r = 0; r < s.repeat; r++)
      s.bars.forEach((bar, bi) => {
        let pos = 0;
        // начало части (тарелка) и её последний такт (сбивка) — для барабанов
        const secFirst = bi === 0 && r === 0 && si > 0;
        const secLast = bi === s.bars.length - 1 && r === s.repeat - 1;
        for (const c of bar)
          for (let k = 0; k < c.slots; k++) {
            flat.push({ orig: c.name, sec: si, pos, first: k === 0, secFirst, secLast });
            pos++;
          }
      });
  });
  const countIn = M.slots;
  const shiftNow = () => (data.capo || 0) + (key.tr || 0);
  const flatsNow = () => T.keyUsesFlats(key.key || data.key);
  const soundName = (orig) => (shiftNow() ? T.transposeChord(orig, shiftNow(), flatsNow()) : orig);
  // свои формы песни (например, «врозь» у Shape of My Heart) — пока тональность не сдвинута
  const voicingOf = (orig) => {
    if (!shiftNow() && data.shapes?.[orig]) {
      const [f, fi] = data.shapes[orig].split(' ');
      return T.voicingFromString(f, fi);
    }
    return T.voicings(soundName(orig))[0];
  };
  const altPos = data.meter === '6/8' ? 3 : 4;
  const st = { speed: store.get('vocalSpeed', 1), guitar: true, bass: true, drums: true, metro: false };
  const style = styleFor(pat.kind);

  // ---------- интерфейс минуса ----------
  const minusBox = root.querySelector('.vt-minus-ui');
  const keyOut = el('b', { class: 'vt-key' }, key.key || data.key);
  const now = el('div', { class: 'vt-now' });
  const secOut = el('div', { class: 'vt-sec muted' });
  const prog = el('div', { class: 'vt-prog' }, el('i'));
  const playBtn = el('button', { type: 'button', class: 'btn btn-play vt-play', html: `${PLAY}<span>Минус</span>` });
  const speed = slider({ label: 'Темп', min: 60, max: 120, step: 5, value: Math.round(st.speed * 100), fmt: (v) => `${v} %`, oninput: (v) => store.set('vocalSpeed', (st.speed = v / 100)) });
  const tone = el('div', { class: 'kb-group' }, el('span', { class: 'kb-label' }, 'Тональность'), el('button', { type: 'button', class: 'kb-btn', 'data-t': '-1', 'aria-label': 'Ниже' }, '−'), keyOut, el('button', { type: 'button', class: 'kb-btn', 'data-t': '1', 'aria-label': 'Выше' }, '+'));
  tone.addEventListener('click', (e) => {
    const b = e.target.closest('[data-t]');
    if (b) dispatchEvent(new CustomEvent('song:set', { detail: { tr: Number(b.dataset.t) } }));
  });
  const parts = el('div', { class: 'vt-parts' }, toggle('Гитара', st.guitar, (v) => (st.guitar = v)), toggle('Бас', st.bass, (v) => (st.bass = v)), toggle('Барабаны', st.drums, (v) => (st.drums = v)), toggle('Метроном', st.metro, (v) => (st.metro = v)));
  minusBox.replaceChildren(el('div', { class: 'vt-row' }, playBtn, tone), now, secOut, prog, el('div', { class: 'vt-row' }, speed.node), parts);

  const showChord = (i) => {
    const item = flat[Math.max(0, Math.min(flat.length - 1, i))];
    let j = i;
    while (j < flat.length && flat[j].orig === item.orig) j++;
    const next = flat[j];
    now.innerHTML = `<span class="vt-ch">${soundName(item.orig)}</span>${next ? `<span class="vt-next">дальше ${soundName(next.orig)}</span>` : ''}`;
    secOut.textContent = data.sections[item.sec].name;
    prog.firstChild.style.width = `${((i / flat.length) * 100).toFixed(1)}%`;
  };
  showChord(0);

  // ---------- звук минуса ----------
  let seq = null;
  let curIdx = 0;
  const api = {
    title,
    sub: 'Минус для вокала',
    slug: data.slug,
    el: root,
    stop: () => stopAll(),
    resume: () => start(false),
    progress: () => curIdx / flat.length,
  };
  function playTick(tick, time) {
    if (tick < countIn) {
      if (tick % M.slotsPerBeat === 0) click(time, tick === 0, 0.8);
      return;
    }
    const it = flat[tick - countIn];
    if (!it) return;
    // для разбора голоса: когда какой аккорд звучал (по часам записи)
    if (rec) rec.tl.push({ t: time - rec.t0, i: tick - countIn });
    const name = soundName(it.orig);
    if (st.guitar) {
      const v = voicingOf(it.orig);
      const nx = flat[tick - countIn + 1];
      const next = nx ? { v: voicingOf(nx.orig), name: soundName(nx.orig) } : null;
      const half = 30 / (data.bpm * st.speed) / M.slotsPerBeat;
      playStepOn('guitar', pat.steps[it.pos % pat.steps.length], v, name, time, { kind: pat.kind, vel: it.pos === 0 ? 0.8 : 0.66, beat: it.pos % M.slotsPerBeat === 0, half, next });
    }
    if (st.bass && (it.pos === 0 || it.first || it.pos === altPos)) {
      const c = T.parseChord(name);
      const root = 28 + mod12((c.bassPc ?? c.root) - 4);
      const fifthOk = T.QUALITIES[c.quality]?.iv.includes(7);
      const m = it.pos === altPos && !it.first && fifthOk ? root + 7 : root;
      note(m, time, { string: 0, voice: 'bass', vel: it.pos === 0 ? 0.95 : 0.8, bright: 0 });
    }
    if (st.drums) for (const h of drumHits(style, data.meter, it.pos, M.slots, { first: it.secFirst, last: it.secLast })) drum(h, time, it.pos % M.slotsPerBeat === 0 ? 0.9 : 0.62);
    if (st.metro && it.pos % M.slotsPerBeat === 0) click(time, it.pos === 0, 0.5);
  }
  function start(withCount = true) {
    audio();
    loadDrums();
    seq?.stop(true);
    seq = new Seq({
      total: flat.length + countIn,
      ticksPerBeat: M.slotsPerBeat,
      bpm: () => data.bpm * st.speed,
      onTick: playTick,
      onVisual: (tick) => {
        if (tick >= countIn) {
          curIdx = tick - countIn;
          showChord(curIdx);
          pitchChord = soundName(flat[curIdx].orig);
        } else now.innerHTML = `<span class="vt-ch vt-count">${Math.floor(tick / M.slotsPerBeat) + 1}</span>`;
      },
      onEnd: () => finish(),
    });
    seq.start(withCount ? 0 : countIn + curIdx);
    playBtn.innerHTML = `${STOP}<span>Стоп</span>`;
    playBtn.classList.add('on');
    claim(api);
  }
  function stopAll() {
    seq?.stop(true);
    hush();
    playBtn.innerHTML = `${PLAY}<span>Минус</span>`;
    playBtn.classList.remove('on');
    release(api);
    if (rec) stopRec();
  }
  function finish() {
    curIdx = 0;
    stopAll();
    showChord(0);
  }
  playBtn.addEventListener('click', () => (seq?.running || playBtn.classList.contains('on') ? stopAll() : start()));

  // ---------- запись голоса ----------
  const recBox = root.querySelector('.vt-rec-ui');
  const recBtn = el('button', { type: 'button', class: 'btn vt-recbtn', html: `<i class="vt-dot"></i><span>Записать под минус</span>` });
  const meter = el('div', { class: 'vt-meter' }, el('i'));
  const pitchOut = el('div', { class: 'vt-pitch muted' }, 'Здесь будет ваша нота: в аккорде она или нет.');
  const result = el('div', { class: 'vt-result', hidden: true });
  const report = el('section', { class: 'vt-report', hidden: true });
  root.querySelector('.vt-grid').after(report);
  const hint = el('p', { class: 'muted small' }, 'Наденьте наушники: тогда в запись попадёт только голос. Запись остаётся у вас — на сервер она не уходит.');
  recBox.replaceChildren(recBtn, meter, pitchOut, result, hint);

  let rec = null;
  let pitchChord = soundName(flat[0].orig);
  async function startRec() {
    const ctx = audio();
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch {
      pitchOut.textContent = 'Нет доступа к микрофону. Разрешите его в адресной строке браузера и нажмите ещё раз.';
      return;
    }
    const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || '';
    const voiceRec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const backRec = new MediaRecorder(outStream(), type ? { mimeType: type } : undefined);
    const chunks = { v: [], b: [] };
    voiceRec.ondataavailable = (e) => e.data.size && chunks.v.push(e.data);
    backRec.ondataavailable = (e) => e.data.size && chunks.b.push(e.data);
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 2048;
    src.connect(an);
    rec = { stream, voiceRec, backRec, chunks, an, type, raf: 0, t0: 0, tl: [] };
    voiceRec.start();
    backRec.start();
    rec.t0 = ctx.currentTime;
    curIdx = 0;
    start(true);
    recBtn.innerHTML = `${STOP}<span>Остановить запись</span>`;
    recBtn.classList.add('on');
    result.hidden = true;
    report.hidden = true;
    const buf = new Float32Array(an.fftSize);
    const loop = () => {
      if (!rec) return;
      an.getFloatTimeDomainData(buf);
      let pk = 0;
      for (const x of buf) pk = Math.max(pk, Math.abs(x));
      meter.firstChild.style.width = `${Math.min(100, pk * 140).toFixed(0)}%`;
      meter.classList.toggle('hot', pk > 0.9);
      const f = yin(buf, ctx.sampleRate);
      if (f && f > 70 && f < 1200) {
        const midi = Math.round(69 + 12 * Math.log2(f / 440));
        const tones = T.chordTones(pitchChord);
        const inChord = tones.includes(mod12(midi));
        pitchOut.className = `vt-pitch ${inChord ? 'good' : ''}`;
        pitchOut.innerHTML = `<b>${T.NOTE_RU[mod12(midi)]}</b> <span>${inChord ? `— нота аккорда ${pitchChord}` : `— проходящая, аккорд ${pitchChord}`}</span>`;
      }
      rec.raf = requestAnimationFrame(loop);
    };
    loop();
  }
  async function stopRec() {
    const r = rec;
    rec = null;
    if (!r) return;
    cancelAnimationFrame(r.raf);
    recBtn.innerHTML = `<i class="vt-dot"></i><span>Записать ещё раз</span>`;
    recBtn.classList.remove('on');
    meter.firstChild.style.width = '0';
    const done = (mr) => new Promise((res) => (mr.state === 'inactive' ? res() : ((mr.onstop = res), mr.stop())));
    await new Promise((res) => setTimeout(res, 250));
    await Promise.all([done(r.voiceRec), done(r.backRec)]);
    r.stream.getTracks().forEach((t) => t.stop());
    if (seq?.running) stopAll();
    const ctx = audio();
    const lat = latency();
    const take = {
      key: key.key || data.key,
      flats: flatsNow(),
      slug: data.slug,
      lat,
      // время аккорда — по часам голоса: голос приходит позже минуса на задержку звуковой карты
      timeline: r.tl.map(({ t, i }) => ({ t: t + lat / 1000, chord: soundName(flat[i].orig), sec: data.sections[flat[i].sec].name })),
    };
    try {
      const [voice, back] = await Promise.all([new Blob(r.chunks.v, { type: r.type }), new Blob(r.chunks.b, { type: r.type })].map(async (b) => ctx.decodeAudioData(await b.arrayBuffer())));
      showResult(voice, back, take);
    } catch {
      pitchOut.textContent = 'Не получилось прочитать запись. Попробуйте ещё раз или в другом браузере.';
    }
  }
  recBtn.addEventListener('click', () => (rec ? stopRec() : startRec()));

  // голос приходит позже минуса на задержку звуковой карты: туда и обратно
  function latency() {
    const ctx = audio();
    return Math.round(((ctx.outputLatency || 0.03) + (ctx.baseLatency || 0.01) + 0.015) * 1000);
  }

  // ---------- прослушать, скачать, в Студию, разбор голоса ----------
  let stopPrev = null;
  function showResult(voice, back, take) {
    const ctx = audio();
    stopPrev?.();
    const mix = { voice: 1, back: 0.7, shift: take.lat };
    let srcs = [];
    let raf = 0;
    let rep = null;
    const playBtn2 = el('button', { type: 'button', class: 'btn btn-play', html: `${PLAY}<span>Послушать</span>` });
    const stopPlay = () => {
      srcs.forEach((s) => s.stop());
      srcs = [];
      cancelAnimationFrame(raf);
      rep?.head(null);
      playBtn2.innerHTML = `${PLAY}<span>Послушать</span>`;
    };
    stopPrev = stopPlay;
    // from — секунда записи голоса; минус идёт раньше голоса на shift
    const play = (from = 0) => {
      stopPlay();
      const t = ctx.currentTime + 0.05;
      const g1 = ctx.createGain();
      g1.gain.value = mix.voice;
      const g2 = ctx.createGain();
      g2.gain.value = mix.back;
      const a = ctx.createBufferSource();
      a.buffer = voice;
      a.connect(g1).connect(ctx.destination);
      const b = ctx.createBufferSource();
      b.buffer = back;
      b.connect(g2).connect(ctx.destination);
      const bOff = from - mix.shift / 1000;
      a.start(t, from);
      if (bOff >= 0) b.start(t, bOff);
      else b.start(t - bOff, 0);
      a.onended = () => srcs[0] === a && stopPlay();
      srcs = [a, b];
      playBtn2.innerHTML = `${STOP}<span>Стоп</span>`;
      const frame = () => {
        rep?.head(from + ctx.currentTime - t);
        raf = requestAnimationFrame(frame);
      };
      frame();
    };
    playBtn2.addEventListener('click', () => (srcs.length ? stopPlay() : play(Math.max(0, mix.shift / 1000))));
    const sv = slider({ label: 'Голос', min: 0, max: 150, value: 100, fmt: (v) => `${v} %`, oninput: (v) => (mix.voice = v / 100) });
    const sb = slider({ label: 'Минус', min: 0, max: 100, value: 70, fmt: (v) => `${v} %`, oninput: (v) => (mix.back = v / 100) });
    const ss = slider({ label: 'Голос раньше на', min: -200, max: 400, step: 5, value: take.lat, fmt: (v) => `${v} мс`, oninput: (v) => (mix.shift = v) });
    const dl = el('button', { type: 'button', class: 'btn btn-ghost', html: `${icon('download')}<span>Скачать WAV</span>` });
    dl.addEventListener('click', async () => {
      const blob = await renderMix(voice, back, mix);
      const a = el('a', { href: URL.createObjectURL(blob), download: `${title} — мой вокал.wav` });
      document.body.append(a);
      a.click();
      a.remove();
    });
    const toStudio = el('button', { type: 'button', class: 'btn', html: `${icon('wand-sparkles')}<span>Сделать красиво в Студии</span>` });
    toStudio.addEventListener('click', async () => {
      toStudio.disabled = true;
      const v = trim(voice, mix.shift / 1000);
      await putHandoff({ voice: wav([v], voice.sampleRate), backing: wav(chans(back), back.sampleRate), title, artist: root.dataset.artist, bpm: data.bpm, createdAt: Date.now() });
      location.href = '/vocal/studio/?from=song';
    });
    result.replaceChildren(el('h4', {}, 'Ваша запись'), el('div', { class: 'vt-row' }, playBtn2, dl, toStudio), sv.node, sb.node, ss.node);
    result.hidden = false;
    voiceReport(report, voice, take, { play })
      .then((x) => (rep = x))
      .catch(() => {
        report.hidden = true;
      });
  }
}

// ---------- звук в файлы ----------
const chans = (buf) => Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i));

function trim(buf, sec) {
  const x = buf.getChannelData(0);
  const n = Math.round(Math.abs(sec) * buf.sampleRate);
  if (sec >= 0) return x.slice(Math.min(n, x.length));
  const out = new Float32Array(x.length + n);
  out.set(x, n);
  return out;
}

async function renderMix(voice, back, mix) {
  const sr = 44100;
  const len = Math.ceil(Math.max(voice.duration, back.duration) * sr);
  const off = new OfflineAudioContext(2, len, sr);
  const a = off.createBufferSource();
  a.buffer = voice;
  const g1 = off.createGain();
  g1.gain.value = mix.voice;
  a.connect(g1).connect(off.destination);
  const b = off.createBufferSource();
  b.buffer = back;
  const g2 = off.createGain();
  g2.gain.value = mix.back;
  b.connect(g2).connect(off.destination);
  const sh = mix.shift / 1000;
  a.start(0, Math.max(0, sh));
  b.start(0, Math.max(0, -sh));
  const out = await off.startRendering();
  return wav(chans(out), sr);
}

function wav(channels, sr) {
  const n = channels[0].length;
  const ch = channels.length;
  const buf = new ArrayBuffer(44 + n * ch * 2);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + n * ch * 2, true);
  str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, ch, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * ch * 2, true);
  v.setUint16(32, ch * 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, n * ch * 2, true);
  let o = 44;
  for (let i = 0; i < n; i++)
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i] || 0));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  return new Blob([buf], { type: 'audio/wav' });
}

// передача записи в Студию: общий для music.sneznyj.com IndexedDB «snezh-handoff»
function putHandoff(item) {
  return new Promise((res, rej) => {
    const r = indexedDB.open('snezh-handoff', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('items');
    r.onerror = () => rej(r.error);
    r.onsuccess = () => {
      const tx = r.result.transaction('items', 'readwrite');
      tx.objectStore('items').put(item, 'song');
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    };
  });
}
