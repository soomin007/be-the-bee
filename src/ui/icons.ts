// 자체 제작 라인 아이콘(인라인 SVG, 외부 에셋 0). 이모지 대체용.
// 규격: 24x24 viewBox · fill=none · stroke=currentColor · 1.8px · 라운드 캡/조인.
//   → 한 가지 선 굵기/스타일로 통일해 "한 세트"로 보이게 한다(꿀빛은 CSS color 로 지정).
// 섹션 헤더 5종으로 시작. 버튼용 추가 아이콘은 docs/design/settings_panel_handoff.md 의
// 인벤토리를 Claude Design 으로 만들어 이 맵에 같은 형식으로 끼워 넣으면 된다.

const svg = (paths: string): string =>
  `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`

export const ICON: Record<string, string> = {
  // 게임: 육각 보드 + 가운데 말
  game: svg('<path d="M12 3.3 19 7.4v8.2L12 19.7 5 15.6V7.4z"/><circle cx="12" cy="11.5" r="2.3"/>'),
  // 화면·설정: 눈(보기)
  view: svg('<path d="M2.6 12S6.1 5.8 12 5.8 21.4 12 21.4 12 17.9 18.2 12 18.2 2.6 12 2.6 12Z"/><circle cx="12" cy="12" r="2.5"/>'),
  // AI: 로봇 얼굴(안테나 + 두 눈 + 입)
  ai: svg('<rect x="5.3" y="8" width="13.4" height="9.6" rx="2.6"/><path d="M12 8V5M9.6 12.4h.01M14.4 12.4h.01M10 15h4"/><path d="M12 5a1 1 0 1 0 0-.01"/>'),
  // 사운드: 스피커 + 음파
  sound: svg('<path d="M4 9.6v4.8h3l4.4 3.4V6.2L7 9.6z"/><path d="M15.6 8.6a4.8 4.8 0 0 1 0 6.8M18.2 6a8 8 0 0 1 0 12"/>'),
  // 도움말: 물음표 뱃지
  help: svg('<circle cx="12" cy="12" r="8.4"/><path d="M9.7 9.5a2.4 2.4 0 0 1 4.6 1c0 1.7-2.3 2-2.3 3.3"/><path d="M12 16.8h.01"/>'),
}
