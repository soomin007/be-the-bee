# Be the Bee — 로드맵

> 프로젝트 전체 진행 계획. 단계(Phase) 단위의 큰 그림을 본다.
> 당장의 "다음에 뭘 할지"는 [`design/backlog.md`](./design/backlog.md)를, 지난 작업 기록은
> [`../session_logs/`](../session_logs/)를 본다.
>
> 최종 갱신: 2026-06-22

## 큰 그림

종이 보드게임 "Be the Bee"를 웹으로 완벽 이식. 핵심은 **이식 가능한 순수 규칙 엔진**
(`src/engine`)이고, UI(`src/ui`)는 그 위에 얹는다. 규칙의 최종 권위는
`Be the Bee_게임 설명서.pdf`, 구현 기준은 `design/rules.md`(v0.3).

## 단계

### Phase 0 — 셋업 ✅
- Node/gh 설치, Vite+TS(strict)+Vitest, 디렉터리 구조, GitHub 레포(현재 public, Pages 배포).
- `design/rules.md` v0.3 (§8 6항목 확정, §9 진행 세부는 ⚠️ 잠정).

### Phase 1 — 규칙 엔진 ✅
순수 TS, DOM 의존 0, 단위 테스트 동반. `hex → types → state → lines → {hive, victory} → moves → index`.
- "한 스캔 두 용도"(`lines.findLines`)를 벌집·승리 양쪽에서 재사용.
- 상태는 JSON 직렬화 가능(undo/replay/save/netcode 대비).

### Phase 2 — 핫시트 UI ✅
SVG 보드 + 클릭 입력으로 로컬 2인 번갈아 플레이. 턴/액션 상태머신, 타일·말·벌집 시각화,
승리/점수 종료 배너·결과 모달, 새 게임/무르기, 줌·팬·핀치 카메라.

### Phase 3 — vs AI ✅
`engine/ai.ts`의 작은 인터페이스 뒤에 교체 가능한 AI. 현재 negamax + 알파-베타 **빔 서치**
(난이도 = 탐색 깊이 easy/medium/hard) + **성향(persona)** 4종(균형/공격형/수비형/벌집형).
모드: 사람 vs 사람 / vs AI / AI 관전(시작·멈춤, 색깔별 난이도·성향). 분석: [`design/ai_strategy.md`](./design/ai_strategy.md).

### Phase 4 — 다듬기 ✅ (지속)
규칙 엣지케이스 테스트, 벌 테마(말=벌 2.5D, 착지/벌집/승리 연출, 효과음·BGM), 모바일 핀치,
무르기/복기, 저장·이어하기, 컬러 테마(가시성·색약), 설정 아코디언, 첫 접속 튜토리얼.
- 잔여(지속): AI 추가 튜닝(실플레이 피드백), 말 3D 모드 옵션, 설정창 비주얼 추가 개선.

### Phase 5 — 이식/배포 ✅ 부분
- **배포 완료**: GitHub Pages 자동 배포 ▶ https://soomin007.github.io/be-the-bee/
- 이후 Capacitor 등 네이티브 래핑은 엔진 재작성 없이(직렬화/네트코드 친화 유지). 네트워킹은 아직 안 만듦.

## 비목표 (현재)

온라인 매치메이킹, 계정, 스토어 패키징, 실시간 멀티플레이. 지금은 로컬 핫시트 + vs AI(+ 관전)만.
초대링크 룸/로비는 미래 후보(엔진 직렬화는 준비됨). 자세한 다음 작업은 [`design/backlog.md`](./design/backlog.md).
