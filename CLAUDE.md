# Be the Bee — Project Context

Digital adaptation of "Be the Bee," a 2-player abstract strategy board game on a
hexagonal grid. Web-first (TypeScript). The goal is a **portable rule engine**
that can later be wrapped for native (e.g. Capacitor) without a rewrite.

## Architecture — non-negotiable

The game is split into two layers that must NOT bleed into each other:

- `src/engine/` — **pure TypeScript.** No DOM, no browser globals, no rendering,
  no `window` / `document`. Deterministic and fully unit-testable. This is the
  portable asset; treat it as if it will be reused in a different runtime later.
- `src/ui/` — rendering (SVG) + input handling. Depends on the engine; the
  engine must NEVER import from `ui/`.

If anything in `engine/` touches the DOM or imports from `ui/`, that is a bug.

## Tech stack

- Vite + TypeScript (strict mode ON)
- Vitest for tests
- SVG for board rendering (crisp hexes, easy hit-testing)
- No state-management library. Engine state is plain, JSON-serializable objects.

## Source of truth

`design/rules.md` is the authoritative game spec. Implement from it.
- If gameplay behavior is unclear or underspecified, **STOP and ask** — do not
  invent rules.
- If a rule changes during implementation, update `design/rules.md` in the same
  change. Code and spec must never silently diverge; the spec wins.
- Items marked ⚠️ in the spec are unconfirmed — do not implement them until they
  are resolved.

## Hex coordinates

Use **cube coordinates** (q, r, s with q + r + s = 0) internally. The board is
sparse (tiles are placed dynamically, the board grows during play), so store it
as a coordinate-keyed sparse map — never a fixed 2D array. Follow the conventions
in the Red Blob Games hex guide.

> 구현 메모: 보드는 JSON 직렬화 가능한 `Record<string, Cell>`(키 = `hexKey`)로
> 저장한다. "좌표 키 희소 맵 / 2D 배열 금지" 의도는 그대로 지키면서 직렬화가
> 공짜다(JS `Map`은 직렬화가 안 돼 채택하지 않음). 2026-06-21 결정.

## "Five in a row" — one scan, two uses

There are two INDEPENDENT line detections, both along the 3 hex axes, both
requiring ≥5 contiguous cells:

- **Tile line** (same tile color, ≥5 contiguous) → forms a "hive" (벌집).
- **Piece line** (same piece owner, ≥5 contiguous) → a win.

Write the line-scanning function once and reuse it for both. Do not duplicate it.

## Conventions

- Engine state must stay JSON-serializable (enables undo, replay, save, and
  future netcode).
- Prefer pure functions of the shape `(state, move) => newState`. Never mutate
  inputs.
- Every rule edge case listed in `design/rules.md` gets a corresponding unit test.
- Keep the AI in `engine/ai.ts` behind a small interface so difficulty and
  strategy can be swapped without touching the rest of the engine.

## Commands

- `npm run dev`        — local dev server
- `npm test`          — run engine + UI tests (vitest, tests/ + src/)
- `npm run typecheck` — full TS typecheck (tsc --noEmit)
- `npm run check:engine` — engine-only typecheck (run FIRST after AI/engine edits — see known_issues)
- `npm run build`     — production build (tsc + vite build)
- `npm run sim`       — AI 난이도/성향 상성 self-play 시뮬레이션(분석, 느림). 결과: docs/design/ai_strategy.md
- `npm run verify:click` — Playwright 보드 클릭 회귀(그 외 verify-*/shot-* 는 scripts/README.md)

## 운영 규칙 (세션 루틴·커밋·문서)

문서 지도(무엇이 어디서 단일 진실인지)는 [`docs/INDEX.md`](docs/INDEX.md).

### 세션 시작 루틴 (본격 작업 전 가장 먼저)
다음을 읽고 "직전까지 한 것 / 다음 후보 / 추천 한 가지"를 정리해 사용자에게 제안한 뒤 시작한다:
1. [`docs/design/backlog.md`](docs/design/backlog.md) — 다음 작업의 단일 소스
2. 최신 [`session_logs/YYYY-MM-DD.md`](session_logs/) — 직전 세션 상태·결정·미해결
3. [`docs/design/known_issues.md`](docs/design/known_issues.md) — 반복 금지 함정/오류
4. `git log --oneline -10` + `git status` — 누적 변경
사용자가 곧장 작업을 지시하면 그것부터 하되, 위 파일로 맥락을 먼저 맞춘다.

### Git push 루틴
의미 있는 작업 단위(기능·시스템 변경·문서 대량 갱신·세션 로그 등)가 끝나면 **즉시
commit + push origin main** (사용자 지시 없어도 자동). 작은 단위로 자주 끊는다.
- 커밋 메시지: 한국어, `prefix(scope): 설명`(feat/fix/refactor/docs/chore), 이모지 없음,
  본문은 변경 항목 bullet.
- `main`에 직접 push (이 프로젝트는 branch/PR 안 씀).
- destructive 작업(force push, reset --hard 등)은 먼저 확인.

### 오류 기록 루틴 (반복 방지)
세션 중 버그·설계 함정·작업 실수를 발견하면 `docs/design/known_issues.md`에
"증상 → 원인 → 재발 방지책"으로 기록한다. 게임 버그뿐 아니라 프로세스 실수(도구
오용, 커밋 누락 등)도 포함. 세션 시작 루틴에서 이 파일을 먼저 읽어 예방한다.

### 세션 로그
매 세션 종료 시 `session_logs/YYYY-MM-DD.md`(날짜별 새 문서)에 요약·주요 변경·결정·
미해결을 기록한다. 같은 날짜면 이어서 추가.

## Out of scope (for now)

Online matchmaking, accounts, store packaging, real-time multiplayer. Build
**local hotseat + vs AI only**. Invite-link rooms may come later, so keep the
engine serializable and netcode-friendly, but do NOT build any networking yet.
