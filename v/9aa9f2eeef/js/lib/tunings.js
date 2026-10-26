// Инструменты и строи для тюнера. Ноты открытых струн — MIDI, от самой толстой (нижней) струны к тонкой,
// как струны идут на грифе сверху вниз; у укулеле и банджо первая в списке — «высокая» 4-я или 5-я.
// voice — чем играть эталонный звук: guitar, bass, uke или piano.

export const TUNERS = {
  guitar: {
    name: 'Гитара', voice: 'guitar',
    tunings: [
      ['standard', 'Стандартный: E A D G B E', [40, 45, 50, 55, 59, 64]],
      ['half-down', 'На полтона ниже: E♭ A♭ D♭ G♭ B♭ E♭', [39, 44, 49, 54, 58, 63]],
      ['drop-d', 'Drop D: D A D G B E', [38, 45, 50, 55, 59, 64]],
      ['d-standard', 'На тон ниже: D G C F A D', [38, 43, 48, 53, 57, 62]],
      ['open-g', 'Open G: D G D G B D', [38, 43, 50, 55, 59, 62]],
      ['open-d', 'Open D: D A D F♯ A D', [38, 45, 50, 54, 57, 62]],
      ['dadgad', 'DADGAD', [38, 45, 50, 55, 57, 62]],
      ['seven', 'Семиструнная (русская): D G B D G B D', [38, 43, 47, 50, 55, 59, 62]],
    ],
  },
  bass: {
    name: 'Бас-гитара', voice: 'bass',
    tunings: [
      ['standard', '4 струны: E A D G', [28, 33, 38, 43]],
      ['five', '5 струн: B E A D G', [23, 28, 33, 38, 43]],
      ['drop-d', 'Drop D: D A D G', [26, 33, 38, 43]],
    ],
  },
  ukulele: {
    name: 'Укулеле', voice: 'uke',
    tunings: [
      ['standard', 'Стандартный: G C E A', [67, 60, 64, 69]],
      ['low-g', 'Low G: G C E A (низкая G)', [55, 60, 64, 69]],
      ['baritone', 'Баритон: D G B E', [50, 55, 59, 64]],
    ],
  },
  violin: { name: 'Скрипка', voice: 'piano', tunings: [['standard', 'G D A E', [55, 62, 69, 76]]] },
  viola: { name: 'Альт', voice: 'piano', tunings: [['standard', 'C G D A', [48, 55, 62, 69]]] },
  cello: { name: 'Виолончель', voice: 'piano', tunings: [['standard', 'C G D A', [36, 43, 50, 57]]] },
  mandolin: { name: 'Мандолина', voice: 'guitar', tunings: [['standard', 'G D A E (пары струн)', [55, 62, 69, 76]]] },
  balalaika: { name: 'Балалайка', voice: 'guitar', tunings: [['prima', 'Прима: E E A', [64, 64, 69]]] },
  domra: {
    name: 'Домра', voice: 'guitar',
    tunings: [
      ['three', 'Трёхструнная: E A D', [64, 69, 74]],
      ['four', 'Четырёхструнная: G D A E', [55, 62, 69, 76]],
    ],
  },
  banjo: { name: 'Банджо', voice: 'guitar', tunings: [['open-g', '5 струн, Open G: g D G B D', [67, 50, 55, 59, 62]]] },
  chromatic: { name: 'Любой инструмент', voice: 'piano', tunings: [['any', 'Любая нота (хроматический)', []]] },
};

export const tuningOf = (inst, id) => {
  const t = TUNERS[inst] || TUNERS.guitar;
  return t.tunings.find((x) => x[0] === id) || t.tunings[0];
};
