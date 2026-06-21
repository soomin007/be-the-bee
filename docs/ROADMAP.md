# Be the Bee — 로드맵

> 프로젝트 전체 진행 계획. 단계(Phase) 단위의 큰 그림을 본다.
> 당장의 "다음에 뭘 할지"는 [`NEXT.md`](./NEXT.md)를, 지난 작업 기록은
> [`../session_logs/`](../session_logs/)를 본다.
>
> 최종 갱신: 2026-06-21

## 큰 그림

종이 보드게임 "Be the Bee"를 웹으로 완벽 이식. 핵심은 **이식 가능한 순수 규칙 엔진**
(`src/engine`)이고, UI(`src/ui`)는 그 위에 얹는다. 규칙의 최종 권위는
`Be the Bee_게임 설명서.pdf`, 구현 기준은 `design/rules.md`.

## 단계

### Phase 0 — 셋업 ✅ (완료: 2026-06-21)
- Node/gh 설치, Vite+TS(strict)+Vitest, 디렉터리 구조, GitHub private 레포.
- `design/rules.md` v0.2 (세부 규칙 6항목 확정).

### Phase 1 — 규칙 엔진 (진행 중)
순수 TS, DOM 의존 0, 단위 테스트 동반. 모듈 의존 순서:
`hex → types → state → lines → {hive, victory} → moves → index`.
- "한 스캔 두 용도"(`lines.findLines`)를 벌집·승리 양쪽에서 재사용.
- 완료 기준: `npm test`/`check:engine` 통과 + 규칙 엣지케이스 테스트 커버.

### Phase 2 — 핫시트 UI (다음)
SVG 보드 렌더 + 클릭 입력으로 **로컬 2인 번갈아 플레이**. 턴/액션 상태머신,
타일·말·벌집 시각화, 승리 배너, 새 게임/무르기.
- 완료 기준: 브라우저에서 한 판을 끝까지 둘 수 있다(승리·점수 종료 포함).

### Phase 3 — vs AI
`engine/ai.ts`의 작은 인터페이스 뒤에 난이도 교체 가능한 AI. 우선 그리디
(승리수 우선 → 차단 → 전개). UI에 "AI와 대전(갈색)" 토글.

### Phase 4 — 다듬기
규칙 엣지케이스 보강, 애니메이션/사운드, 모바일 터치, 접근성, undo/replay.

### Phase 5 — 이식/배포 (나중)
정적 호스팅 배포. 이후 Capacitor 등으로 네이티브 래핑(엔진 재작성 없이).
초대링크 룸은 그 이후 고려(엔진 직렬화/네트코드 친화 유지, 단 지금 네트워킹은 안 만듦).

## 비목표 (현재)
온라인 매치메이킹, 계정, 스토어 패키징, 실시간 멀티플레이. 지금은 로컬
핫시트 + vs AI 만.
