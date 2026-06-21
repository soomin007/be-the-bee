# 백로그 — 다음 작업 (진행 단일 소스)

> 합의됐으나 미착수/진행 중인 작업의 단일 소스. 다음에 뭘 할지는 여기서 본다.
> 단계 큰 그림은 [`../ROADMAP.md`](../ROADMAP.md). 완료 항목은 세션 로그로 내려보낸다.
>
> 최종 갱신: 2026-06-21 (세션 5)

## ✅ 마일스톤 달성: 브라우저에서 핫시트 플레이 가능

- Phase 0 셋업(Vite+TS+Vitest, GitHub private 레포).
- `design/rules.md` v0.3 — §8 6항목 확정, §9 진행 세부(잠정).
- Phase 1 엔진: `hex/types/state/lines/hive/victory/moves/index`. (커밋 `fe11411`)
- 문서·운영 구조(INDEX/ROADMAP/backlog/known_issues + CLAUDE.md 운영규칙). (`7eb30b0`)
- Phase 2 핫시트 UI: SVG 보드·클릭 입력·턴 상태머신·승리/점수 배너·무르기. (`092be30`)
- 테스트 38개 통과(엔진 34 + UI 4), build/check:engine 통과.

### UI 1차 다듬기 ✅ (2026-06-21 세션 3)
- 패널 왼쪽 배치. 옅은 점선 배경 그리드(반경 12). 휠 줌 + 드래그 팬 + 키보드(화살표/＋－/0).
- 벌집 금색 글로우 오버레이로 가시성 강화. "뷰 리셋" 버튼.

### Phase 3 vs AI ✅ (2026-06-21 세션 4)
- `engine/ai.ts`: 승리→차단→Gomoku식 1수 평가, 난이도 Cfg seam(현재 medium 1종). (`4167d7e`)
- UI 모드 순환(사람/vs AI/AI 관전) + setTimeout 스케줄러. (`92d549b`)
- self-play 테스트로 엔진 자동 검증. 전체 50개 통과.

### AI 강화 + 피드백 + 배포 ✅ (2026-06-21 세션 5)
- AI 빔 서치(negamax+알파-베타, medium 깊이3) — 1수→여러 수 앞. medium>easy(4:2). (`034441e`)
- 직전 수 강조 + 리치(위험/승리) 힌트. `completingCells`/`winningCells` 공유. (`d940a5e`)
- 승리 5목 라인 강조(`winningLine`). (`00fc455`)
- **GitHub Pages 배포** — Actions 자동 배포, 레포 public 전환. (`11c41d9`)
  ▶ https://soomin007.github.io/be-the-bee/

## 다음 마일스톤 후보 (우선순위 순)

| # | 작업 | 메모 |
|---|---|---|
| 1 | **AI 난이도 easy/hard UI** | Cfg seam은 완료 — 패널에 난이도 선택 추가, hard 빔 깊이4 튜닝 |
| 2 | 규칙 엣지케이스 테스트 보강 | 여왕벌 5목, 동시완성 우선, 분기/교차 벌집 점수, 타일소진 종료 |
| 3 | 결과 모달 + 사운드/애니메이션 | 승리 모달, 타일/말 놓기 모션, 잘못된 클릭 흔들림 |
| 4 | 모바일 터치 다듬기 | 핀치 줌, 터치 팬, 버튼 크기 |
| 5 | `rules.md §9` ⚠️ 확정 | 사용자 확인 후 잠정 제거 |

## 확정 필요 / 사용자 확인 대기
- **§9 진행 세부(⚠️ 잠정)** — 타일 소진 후 말만 두기, 양쪽 불가 시 점수 종료, 한쪽만 불가 시
  패스. `design/rules.md §9`에 명시됨. 핫시트엔 영향 작음. 사용자가 다르게 원하면 조정.
