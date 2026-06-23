// 자체 제작 라인 아이콘(인라인 SVG, 외부 에셋 0). 이모지 대체용.
// 규격: 24x24 viewBox · fill=none · stroke=currentColor · 1.8px · 라운드 캡/조인.
//   → 한 가지 선 굵기/스타일로 통일해 "한 세트"로 보이게 한다(꿀빛은 CSS color 로 지정).
// 디자인: Claude Design 핸드오프(docs/design/settings_panel_handoff.md). 섹션 5 + 버튼 14 = 19종.

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
}
