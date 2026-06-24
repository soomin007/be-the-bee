# 모바일 쾌적화 구현 계획

> 모바일(특히 폰)에서 쾌적하게 플레이하기 위한 변경 계획. 구현 완료 후 이 문서는 삭제하고
> 기록은 `session_logs/` 에 남긴다(plan-docs-future-only). 감사일: 2026-06-24.

## 현황 감사 (코드 읽기)

**이미 되어 있는 것 — 손댈 필요 없음:**
- 터치 제스처 완비(`src/ui/game-ui.ts`): 한 손가락 드래그=팬, **두 손가락 핀치=줌**, 휠 줌,
  키보드 팬/줌. 보드 `touch-action: none` 으로 브라우저 기본 제스처 가로채기 차단.
- `setPointerCapture` 는 실제 드래그 시작에만(보드 탭 클릭이 죽지 않게 — known_issues 기록).
- 반응형 진입점 존재: `@media (max-width: 720px)` 에서 세로 스택(보드 위 / 패널 아래) + 버튼 42px.

**부족한 것 — 이번 작업 대상(거의 전부 `src/style.css`):**
| 문제 | 위치 | 영향 |
|---|---|---|
| `height: 100vh` (×3: `#app`·`.game`, 그리고 `@media` 의 `58vh`) | style.css | 모바일 주소창 높이만큼 화면이 잘리거나 스크롤 생김 |
| safe-area(노치/홈바) 미처리 | index.html + style.css | 아이폰 노치·하단 홈 인디케이터에 UI 가 가림 |
| 모달 `max-height: 92vh / 46vh` | style.css | 같은 vh 문제(키보드/주소창 뜨면 잘림) |
| 브레이크포인트가 720px 하나 | style.css | 좁은 폰(≤430px)·가로모드 별도 처리 없음 |
| 버튼/토글 터치 타깃 42px·간격 | style.css | 권장 44px+ 살짝 미달, 인접 오탭 여지 |
| 폼 입력 font-size | style.css | iOS 는 16px 미만 입력창 포커스 시 자동 줌(원치 않는 확대) |

## 구현 순서 (※ `style.css`·`game-ui.ts` 가 풀린 뒤 = mp-phase3 release 후)

### P0 — 뷰포트 기반 (반드시 한 세트로)
1. `index.html`: viewport meta 를 `width=device-width, initial-scale=1.0, viewport-fit=cover` 로.
   - ⚠️ `viewport-fit=cover` 는 **2번 safe-area 패딩과 세트**로만 적용(따로 켜면 노치에 콘텐츠가 가림).
2. `style.css`: 화면 높이 `100vh` → `100dvh`(폴백 병기). 예:
   ```css
   #app, .game { height: 100vh; height: 100dvh; }
   ```
3. safe-area 패딩: 최상위 레이아웃에 `env(safe-area-inset-*)` 적용(상단 노치·하단 홈바·가로 좌우).
   `padding: env(safe-area-inset-top) env(safe-area-inset-right) ...` (또는 `max()` 로 기존 패딩과 합성).
4. 모달 `max-height` 의 `vh` → `dvh`.

### P1 — 반응형 레이아웃
5. `@media (max-width: 720px)` 의 `.board-wrap { height: 58vh }` 재검토: `dvh` 기반 + 패널이 아래로
   갈 때 세로 스크롤 허용(`.panel { overflow-y: auto }`), 보드 최소 높이 확보(`min-height`).
6. 좁은 폰 브레이크포인트 추가(예: `max-width: 430px`): 패널/HUD/액션바 폰트·간격 축소, 버튼 풀폭,
   설정 그리드 1열.
7. 가로모드(낮은 height) 대응: `@media (orientation: landscape) and (max-height: 480px)` — 보드 옆에
   패널(데스크탑형 가로 배치 유지)로 세로 공간을 아끼고, 컨트롤 컴팩트.

### P2 — 터치 타깃·폴리시
8. 버튼·토글 `min-height: 44px`, 인접 간격 넉넉히(오탭 방지).
9. 보드 헥스 탭 타깃: 작은 화면에서 헥스가 너무 작아지지 않게 기본 줌/`HEX_SIZE` 확인(필요 시
   초기 카메라 폭을 화면 폭에 맞춰 조정 — `game-ui.ts` 카메라 초기값).
10. iOS 입력 줌 방지: 텍스트 입력(공유 코드 붙여넣기 등) `font-size: 16px` 이상.
11. (선택) 당겨서 새로고침/바운스 스크롤 억제 — 보드는 `touch-action: none` 으로 OK, 페이지 루트도
    필요 시 `overscroll-behavior: none`.

## 검증
- `scripts/shot-mobile.mjs`(신규): Playwright 로 폰 세로(예: 390×844)·가로(844×390)·작은 폰(360×640)
  스크린샷. dev 서버 필요(공유 서버 주의 — 블랭킷 kill 금지, 내 포트만).
- before/after 비교 + 실기기(사용자) 확인.

## 주의 / 조율
- 구현은 `src/style.css`·`src/ui/game-ui.ts`·`index.html` 을 건드린다 → **시작 전 `ACTIVE_WORK.md`
  확인**, mp-phase3(또는 다른 UI 세션)가 그 파일을 claim 중이면 풀릴 때까지 대기.
- `100dvh` 미지원 구형 브라우저용으로 `100vh` 폴백을 항상 병기.
