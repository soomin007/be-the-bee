# scripts/ — 개발용 도구 (Playwright)

빌드 산출물이 아니라 **수동 점검용** 스크립트. happy-dom 단위 테스트가 못 잡는
실브라우저 동작(클릭 히트테스트·오디오·영속화 등)을 진짜 Chromium 으로 확인한다.

## 실행 방법
1. 먼저 dev 서버: `npm run dev` (대개 http://localhost:5173/).
2. 다른 터미널에서: `node scripts/<파일>.mjs [URL]` (URL 생략 시 기본 포트 가정).
   - `verify-*` 는 통과/실패를 종료코드로 알림(자동 점검용).
   - `shot-*` 는 `docs/design/shots/` 에 PNG 미리보기를 저장(시각 확인용).

> `docs/design/shots/` 는 **재생성 가능한 로컬 미리보기**라 git 추적에서 제외(.gitignore)했다.
> 필요하면 해당 `shot-*` 를 다시 돌려 만든다.

## verify-* (회귀 점검 — PASS/FAIL)
| 파일 | 무엇을 확인 |
|---|---|
| `verify-click.mjs` | 보드 헥스 클릭이 실제로 먹히는지(포인터 캡처 버그 회귀 방지) |
| `verify-bgm.mjs` | BGM 재생/트랙 전환 |
| `verify-persist.mjs` | 설정(모드·난이도·볼륨)이 새로고침 후 유지 |
| `verify-undo.mjs` | 무르기가 사람 차례로 돌아오는지(vs AI) |
| `verify-replay.mjs` | 복기 진입/되감기/종료 후 실시간 복귀 |
| `verify-queen-popup.mjs` | 여왕벌 토글 → 설명 팝업 → 취소(안 켜짐)/확인(켜짐)/끄기 즉시 (+ `shots/queen-popup.png`) |
| `verify-fx-smoke.mjs` | 벌 테마 2단계 연출(꿀 차오름·붕붕) — 여러 수 둬도 에러 없음 + 모션 키프레임 존재 |
| `verify-save-load.mjs` | 자동 이어하기 + 보관함 슬롯(저장·불러오기·삭제) + 공유 코드 내보내기/가져오기 |
| `verify-watch-control.mjs` | 관전 자동시작 안 함 + ▶시작/⏸멈춤 동작 + 양쪽 성향 셀렉트 |
| `verify-tutorial.mjs` | 첫 접속 튜토리얼 자동표시·페이지 넘김·완료 기억·재열기 (+ `shots/tutorial-1·3.png`) |
| `verify-watch-persona.mjs` | 관전 색깔별 난이도 + 성향 설명 + 종료 시 자동 멈춤 (+ `shots/panel-watch2.png`) |
| `verify-infinite.mjs` | 무한 모드 토글 → 자원 타일 ∞ 표시 + 설정 영속 |

## shot-* (시각 미리보기 — PNG 저장)
| 파일 | 산출물 |
|---|---|
| `shot.mjs` | 보드 전체 |
| `shot-panel.mjs` | 좌측 패널 |
| `shot-replay.mjs` | 복기 패널 → `shots/replay-panel.png` |
| `shot-theme.mjs` | 밀랍 타일 보드 → `shots/theme-board.png` |
| `shot-mascot.mjs` | 결과 모달 벌 마스코트(단독, dev 불필요) → `shots/theme-modal.png` |
| `shot-action-pos.mjs` | 행동 바 상단/하단 전환 → `shots/action-top.png`·`action-bottom.png` (위치 전환·도움말 박스 PASS/FAIL 겸) |
| `shot-themes.mjs` | 컬러 테마 3종(꿀/고대비/벽돌) → `shots/theme-honey.png`·`theme-contrast.png`·`theme-terracotta.png` |
| `shot-queen-card.mjs` | 여왕벌 설명 팝업 카드 확대 → `shots/queen-card.png` |
| `shot-bee.mjs` | 말=벌 2.5D(그림자·구형 음영·하이라이트) 확대 → `shots/bee-2_5d.png` |
| `shot-settings.mjs` | 설정 패널(아코디언, 모드/난이도 현재값 버튼) → `shots/panel-hotseat.png`·`panel-vsai.png` |
| `shot-watch.mjs` | 관전 패널(▶시작/⏸멈춤·양쪽 성향·속도) → `shots/panel-watch.png` |
| `shot-accordion.mjs` | 설정 아코디언 접힘/펼침 → `shots/panel-accordion.png`·`panel-accordion-view.png` |
| `shot-tutorial.mjs` | 튜토리얼 표지/진행/TIP → `shots/tutorial-cover.png`·`tutorial-play.png`·`tutorial-tip.png` |
| `shot-og.mjs` | 공유 미리보기·아이콘 생성(dev 불필요) → `public/og-cover.png`(1200×630)·`public/apple-touch-icon.png` |

## 분석 도구 (Playwright 아님)
| 파일 | 무엇 |
|---|---|
| `sim.test.ts` | AI 난이도/성향 상성 self-play 시뮬레이션. `npm run sim`(느림, `SIM_N` 으로 판수 조절). 결과 → `docs/design/ai_strategy.md` |
| `decode-game.mjs` | 공유 코드(BTB1:) 디코딩. `scripts/code.txt` 에 코드 붙여넣고 `node scripts/decode-game.mjs` → 수 기록 출력(compact/전체 둘 다). `code.txt` 는 .gitignore. |

> 주의: 앱의 `renderModal` 은 게임이 끝나지 않으면 modal-layer 를 비운다 — 모달 미리보기는
> dev 페이지에 주입하지 말고 `shot-mascot.mjs` 처럼 단독 페이지로 렌더할 것.
