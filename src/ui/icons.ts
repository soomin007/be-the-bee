// 자체 제작 라인 아이콘(인라인 SVG, 외부 에셋 0). 이모지 대체용.
// 규격: 24x24 viewBox · fill=none · stroke=currentColor · 1.8px · 라운드 캡/조인.
//   → 한 가지 선 굵기/스타일로 통일해 "한 세트"로 보이게 한다(꿀빛은 CSS color 로 지정).
// 디자인: Claude Design 핸드오프(2026-06-23 통합). 섹션 헤더 5 + 버튼 14 = 19종.

const svg = (paths: string): string =>
  `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`

export const ICON: Record<string, string> = {
  // ── 섹션 헤더 (5)
  game: svg('<path d="M12 3.2 19.6 7.6V16.4L12 20.8 4.4 16.4V7.6Z"/><path d="M12 8.4 15.4 10.4V13.6L12 15.6 8.6 13.6V10.4Z"/>'),
  view: svg('<path d="M3 12c2.4-4.6 5.6-7 9-7s6.6 2.4 9 7c-2.4 4.6-5.6 7-9 7s-6.6-2.4-9-7Z"/><circle cx="12" cy="12" r="3.1"/>'),
  ai: svg('<rect x="5" y="8.5" width="14" height="10.5" rx="3"/><path d="M12 5.2V8.5"/><circle cx="12" cy="4" r="1.4"/><path d="M5 13H3.2"/><path d="M19 13h1.8"/><path d="M9.6 13h.01"/><path d="M14.4 13h.01"/><path d="M9.8 16h4.4"/>'),
  sound: svg('<path d="M4 9.5v5h3l4.5 3.5V6L7 9.5Z"/><path d="M15.5 9.5a4 4 0 0 1 0 5"/><path d="M18 7.5a7 7 0 0 1 0 9"/>'),
  help: svg('<circle cx="12" cy="12" r="9"/><path d="M9.4 9.4a2.7 2.7 0 0 1 5.2 1c0 1.8-2.4 2.3-2.6 3.9"/><path d="M12 17.4h.01"/>'),

  // ── 버튼 · 포인트 (14)
  share: svg('<path d="M12 14.5V4"/><path d="M8.2 7.8 12 4l3.8 3.8"/><path d="M6 12.5V18a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 18 18v-5.5"/>'),
  save: svg('<path d="M5.5 5h9.7L19 8.8V18a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/><path d="M8 5v4.5h6.5V5"/><path d="M8 19v-4.5h8V19"/>'),
  saves: svg('<path d="M3.5 8h17v10.5a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1Z"/><path d="M3 5h18v3H3Z"/><path d="M10 12h4"/>'),
  theme: svg('<circle cx="9.3" cy="10" r="4.4"/><circle cx="14.7" cy="10" r="4.4"/><circle cx="12" cy="14.8" r="4.4"/>'),
  bee: svg('<ellipse cx="12" cy="14" rx="4.3" ry="5.6"/><path d="M7.9 12.4h8.2"/><path d="M8.3 16h7.4"/><path d="M9.6 9.2C7 6.8 4.4 7.4 4.4 9.4c0 1.7 2.3 2.4 4.2 1.2"/><path d="M14.4 9.2c2.6-2.4 5.2-1.8 5.2.2 0 1.7-2.3 2.4-4.2 1.2"/><path d="M10.7 8.7 9.5 5.7"/><path d="M13.3 8.7 14.5 5.7"/>'),
  cube3d: svg('<path d="M12 3.5 19.5 7.75v8.5L12 20.5 4.5 16.25v-8.5Z"/><path d="M4.7 7.9 12 12l7.3-4.1"/><path d="M12 12v8.4"/>'),
  music: svg('<path d="M9 16.5V6l9-2v10.5"/><circle cx="6.6" cy="16.5" r="2.5"/><circle cx="15.6" cy="14.5" r="2.5"/>'),
  soundOn: svg('<path d="M4 9.5v5h3l4.5 3.5V6L7 9.5Z"/><path d="M15 10a3.5 3.5 0 0 1 0 4"/><path d="M17.5 8a6.5 6.5 0 0 1 0 8"/>'),
  soundOff: svg('<path d="M4 9.5v5h3l4.5 3.5V6L7 9.5Z"/><path d="M16 10l4 4"/><path d="M20 10l-4 4"/>'),
  tutorial: svg('<path d="M12 6.4C9.6 4.9 6.4 4.9 4 6v12.2c2.4-1.1 5.6-1.1 8 .4 2.4-1.5 5.6-1.5 8-.4V6c-2.4-1.1-5.6-1.1-8 .4Z"/><path d="M12 6.4V19"/>'),
  trophy: svg('<path d="M7.5 4.5h9V9a4.5 4.5 0 0 1-9 0Z"/><path d="M7.5 5.5H5V7a3 3 0 0 0 3 3"/><path d="M16.5 5.5H19V7a3 3 0 0 1-3 3"/><path d="M12 13.5v2.8"/><path d="M9 19.5h6"/><path d="M9.8 19.5 10.3 16.3h3.4l.5 3.2"/>'),
  honey: svg('<path d="M8 4.5h8"/><path d="M8.5 4.5v2.5h7V4.5"/><path d="M7 7h10l-.9 11a2 2 0 0 1-2 1.8H9.9a2 2 0 0 1-2-1.8Z"/><path d="M7.3 10.5c1.8 1.2 7.6 1.2 9.4 0"/>'),
  mouse: svg('<rect x="7" y="3.2" width="10" height="17.6" rx="5"/><path d="M12 3.5V9"/>'),
  keyboard: svg('<rect x="3" y="7" width="18" height="10.5" rx="2"/><path d="M6.5 10.5h.01"/><path d="M10 10.5h.01"/><path d="M13.5 10.5h.01"/><path d="M17 10.5h.01"/><path d="M8 14h8"/>'),

  // ── 액션/모달/온라인 버튼용 (2026-06-26 추가) — 모든 인게임 버튼에 아이콘
  check: svg('<path d="M5 12.5 10 17.5 19 6.5"/>'),
  close: svg('<path d="M6.5 6.5 17.5 17.5"/><path d="M17.5 6.5 6.5 17.5"/>'),
  crown: svg('<path d="M4 8 7.7 12.5 12 6 16.3 12.5 20 8 18.3 17.5H5.7Z"/><path d="M6 20h12"/>'),
  infinity: svg('<path d="M10.4 12c0 1.7-1.2 3-2.7 3S5 13.7 5 12s1.2-3 2.7-3 2.2 1.3 4.3 3 2.8 3 4.3 3S19 13.7 19 12s-1.2-3-2.7-3-2.2 1.3-4.3 3"/>'),
  undo: svg('<path d="M8 8 4.5 11.5 8 15"/><path d="M4.5 11.5H14a5.5 5.5 0 0 1 0 11h-3"/>'),
  refresh: svg('<path d="M5 12a7 7 0 1 1 2 4.9"/><path d="M4.4 17.4 5 13.4l4 .6"/>'),
  history: svg('<path d="M4.6 12a7.5 7.5 0 1 1 2.2 5.3"/><path d="M4.5 17.6V13h4.6"/><path d="M12 8.4V12l2.9 1.8"/>'),
  exit: svg('<path d="M13.5 4H7A1.5 1.5 0 0 0 5.5 5.5v13A1.5 1.5 0 0 0 7 20h6.5"/><path d="M16.3 8.3 20 12l-3.7 3.7"/><path d="M20 12H10"/>'),
  enter: svg('<path d="M10.5 4H17a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 17 20h-6.5"/><path d="M7.7 8.3 4 12l3.7 3.7"/><path d="M4 12h10"/>'),
  plus: svg('<circle cx="12" cy="12" r="8.3"/><path d="M12 8v8"/><path d="M8 12h8"/>'),
  download: svg('<path d="M12 4v9.5"/><path d="M8 9.6 12 13.6l4-4"/><path d="M5 16.5V18A1.5 1.5 0 0 0 6.5 19.5h11A1.5 1.5 0 0 0 19 18v-1.5"/>'),
  recenter: svg('<circle cx="12" cy="12" r="3.1"/><path d="M12 3.6v3"/><path d="M12 17.4v3"/><path d="M3.6 12h3"/><path d="M17.4 12h3"/>'),
  warning: svg('<path d="M12 4.6 20.5 19.4H3.5Z"/><path d="M12 10v4.2"/><path d="M12 17.4h.01"/>'),
  bulb: svg('<path d="M8.5 15.4a5 5 0 1 1 7 0c-.8.7-1.2 1.4-1.2 2.3H9.7c0-.9-.4-1.6-1.2-2.3Z"/><path d="M9.8 20.4h4.4"/>'),
  people: svg('<circle cx="9" cy="8.6" r="3"/><path d="M3.8 19c0-3 2.3-5 5.2-5s5.2 2 5.2 5"/><circle cx="16.6" cy="9.4" r="2.4"/><path d="M14.6 14.5c2.5-.4 5 1 5 4.5"/>'),
  trash: svg('<path d="M5 7h14"/><path d="M9 7V5.2h6V7"/><path d="M6.6 7l.9 11.4a1.4 1.4 0 0 0 1.4 1.3h6.2a1.4 1.4 0 0 0 1.4-1.3L17.4 7"/><path d="M10 10.5v6"/><path d="M14 10.5v6"/>'),
  clipboard: svg('<rect x="6" y="5" width="12" height="15" rx="1.6"/><path d="M9 5V3.8h6V5"/><path d="M9 11h6"/><path d="M9 14.5h4"/>'),
  upload: svg('<path d="M12 14.5V5"/><path d="M8 8.9 12 4.9l4 4"/><path d="M5 16.5V18A1.5 1.5 0 0 0 6.5 19.5h11A1.5 1.5 0 0 0 19 18v-1.5"/>'),
  coin: svg('<circle cx="12" cy="12" r="8"/><path d="M12 7.5v9"/><path d="M9.8 9.8a2.3 2.3 0 0 1 4.4.4c0 2.2-4.4 1.4-4.4 3.6a2.3 2.3 0 0 0 4.4.4"/>'),
}
