# scripts/ — 개발용 도구 (Playwright)

빌드 산출물이 아니라 **수동 점검용** 스크립트. happy-dom 단위 테스트가 못 잡는
실브라우저 동작(클릭 히트테스트·오디오·영속화 등)을 진짜 Chromium 으로 확인한다.

## 실행 방법
1. 먼저 dev 서버: `npm run dev` (대개 http://localhost:5173/).
2. 다른 터미널에서: `node scripts/<파일>.mjs [URL]` (URL 생략 시 기본 포트 가정).
   - `verify-*` 는 통과/실패를 종료코드로 알림(자동 점검용).
   - `shot-*` 는 `docs/design/shots/` 에 PNG 미리보기를 저장(시각 확인용).

## verify-* (회귀 점검 — PASS/FAIL)
| 파일 | 무엇을 확인 |
|---|---|
| `verify-click.mjs` | 보드 헥스 클릭이 실제로 먹히는지(포인터 캡처 버그 회귀 방지) |
| `verify-bgm.mjs` | BGM 재생/트랙 전환 |
| `verify-persist.mjs` | 설정(모드·난이도·볼륨)이 새로고침 후 유지 |
| `verify-undo.mjs` | 무르기가 사람 차례로 돌아오는지(vs AI) |
| `verify-replay.mjs` | 복기 진입/되감기/종료 후 실시간 복귀 |

## shot-* (시각 미리보기 — PNG 저장)
| 파일 | 산출물 |
|---|---|
| `shot.mjs` | 보드 전체 |
| `shot-panel.mjs` | 좌측 패널 |
| `shot-replay.mjs` | 복기 패널 → `shots/replay-panel.png` |
| `shot-theme.mjs` | 밀랍 타일 보드 → `shots/theme-board.png` |
| `shot-mascot.mjs` | 결과 모달 벌 마스코트(단독, dev 불필요) → `shots/theme-modal.png` |
| `shot-action-pos.mjs` | 행동 바 상단/하단 전환 → `shots/action-top.png`·`action-bottom.png` (위치 전환·도움말 박스 PASS/FAIL 겸) |

> 주의: 앱의 `renderModal` 은 게임이 끝나지 않으면 modal-layer 를 비운다 — 모달 미리보기는
> dev 페이지에 주입하지 말고 `shot-mascot.mjs` 처럼 단독 페이지로 렌더할 것.
