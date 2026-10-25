// Упражнение «смена за минуту»: считаем смены двух аккордов за 60 секунд и помним рекорд.
import { audio } from '../audio.js';
import { el, store, voicingFromBtn, playVoicing } from './util.js';

export function init() {
  document.querySelectorAll('.drill').forEach(setup);
}

function setup(root) {
  const key = `drill.${root.dataset.a}-${root.dataset.b}`;
  const time = root.querySelector('.drill-time');
  const count = root.querySelector('.drill-count');
  const best = root.querySelector('.drill-best');
  const hint = root.querySelector('.drill-hint');
  const btns = [...root.querySelectorAll('.chord-btn')];
  const st = { n: 0, left: 60, timer: null, running: false, side: 0 };
  const showBest = () => {
    const b = store.get(key, 0);
    best.textContent = b ? `Рекорд: ${b}` : 'Рекорда пока нет';
  };
  showBest();

  const startBtn = el('button', { type: 'button', class: 'btn' }, 'Старт');
  const plus = el('button', { type: 'button', class: 'btn btn-big drill-plus', disabled: true }, '+1');
  root.querySelector('.drill-ctl').append(startBtn, plus);

  const tick = () => {
    st.left--;
    time.textContent = `0:${String(st.left).padStart(2, '0')}`;
    if (st.left <= 0) finish();
  };
  function finish() {
    clearInterval(st.timer);
    st.running = false;
    plus.disabled = true;
    startBtn.textContent = 'Ещё раз';
    const prev = store.get(key, 0);
    if (st.n > prev) {
      store.set(key, st.n);
      hint.textContent = prev ? `Новый рекорд! Было ${prev}, стало ${st.n}.` : `Первый результат: ${st.n}. Завтра попробуйте побить.`;
    } else hint.textContent = `${st.n} смен. Рекорд — ${prev}. Главное — чисто, а не быстро.`;
    showBest();
    root.classList.remove('running');
  }
  startBtn.addEventListener('click', () => {
    if (st.running) return finish();
    audio();
    st.n = 0;
    st.left = 60;
    st.side = 0;
    count.textContent = '0';
    time.textContent = '1:00';
    st.running = true;
    plus.disabled = false;
    startBtn.textContent = 'Стоп';
    hint.textContent = `Ставьте ${root.dataset.b}, потом ${root.dataset.a}… На каждой смене — «+1» или пробел.`;
    root.classList.add('running');
    st.timer = setInterval(tick, 1000);
    plus.focus();
  });
  const add = () => {
    if (!st.running) return;
    st.n++;
    count.textContent = String(st.n);
    st.side = 1 - st.side;
    const v = voicingFromBtn(btns[st.side]);
    if (v) playVoicing(v, undefined, 'D', 0.55);
    btns.forEach((b, i) => b.classList.toggle('on', i === st.side));
  };
  plus.addEventListener('click', add);
  root.addEventListener('keydown', (e) => {
    if (e.key === ' ' && st.running) {
      e.preventDefault();
      add();
    }
  });
}
