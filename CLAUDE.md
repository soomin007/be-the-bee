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

## UI 문구 규칙 (한국어, 사용자에게 보이는 모든 멘트)

해설·코칭·안내 등 사용자에게 보이는 한국어 문구는 다음을 지킨다(코칭 멘트 `NOTE_TEXT` 포함).

- **한글 사이 em dash(—) 금지.** 마침표·쉼표·줄바꿈으로 대신한다.
- **쉬운 말만 쓴다.** 전문 용어(오목 "리치", 자작어 "회랑", 체스 "포크")는 금지하고 뜻을 풀어 쓴다:
  - 리치 → "다음 한 수로 5목"
  - 회랑 → "벌집을 만들려던 줄"
  - 포크 → "두 곳을 동시에 노림"

  게임 기본 용어 "5목"·"벌집"은 그대로 쓴다(튜토리얼에서 가르침).
- **"이겨요/이겼어요" 대신 "승리"** 를 쓴다.

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
0. **`ACTIVE_WORK.md`(작업 조율판) — 가장 먼저.** 다른 세션이 claim 한 범위를 피해 내 작업 범위를
   정하고, 내 블록을 추가한 뒤 시작한다(아래 "동시 세션 루틴 → 작업 조율판" 참고).
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

### 동시 세션 루틴 (여러 세션 병행 시)
사용자는 여러 터미널(PowerShell)에서 **여러 세션을 동시에** 돌릴 수 있다. 각 세션은 자기 작업
파일에만 손대고, 다른 세션 작업을 절대 휩쓸지 않는다.

**작업 조율판 `ACTIVE_WORK.md` (겹침 방지의 단일 진실, git 미추적·로컬 실시간 공유):**
- **작업 시작 전 반드시 읽는다.** 다른 세션이 claim 한 범위(파일/디렉터리)는 **편집 금지**(읽기 OK).
  겹치지 않는 곳으로 내 작업 범위를 정한다.
- 내 작업을 **내 블록으로 추가**한다 — 시작 시각·예상 종료(ETA)·범위(파일/디렉터리)·작업 내용 명시.
  형식은 파일 안 템플릿. **자기 블록만 편집**(고유 id 의 `<!-- BEGIN/END session: <id> -->` 마커).
- 범위가 바뀌면 내 블록을 갱신하고, **작업이 끝나면 내 블록을 삭제**한다(커밋·푸시 직후 정리).
- 파일이 없으면 템플릿대로 새로 만든다. ETA 가 한참 지났는데 그 세션 흔적이 없으면(중단 추정)
  사용자에게 확인 후 그 블록을 정리한다 — 임의로 지우지 않는다.
- 이 파일 자체는 절대 커밋하지 않는다(`.gitignore` 에 있음). 같은 머신의 여러 터미널이 같은 워킹
  트리를 보므로 git 없이 즉시 공유된다.

- **`git add -A`/`git add .` 금지.** 다른 세션의 진행 중 변경까지 스테이징·커밋한다. 내가 바꾼
  파일만 **경로로 명시 스테이징**한다(`git add <내 파일> ...`).
- 커밋 전 `git status` 확인: **내가 안 바꾼 파일이 modified로 떠 있으면 다른 세션 작업**이다.
  그 파일은 스테이징·수정·`reset`·`checkout`·revert 하지 않는다(읽기는 OK, 편집은 금지).
- push 거부(non-fast-forward) 시: `git pull --rebase --autostash origin main` 후 다시 push.
- 공유 문서(`session_logs/`·`backlog.md`·`known_issues.md`)는 **끝에 append**만 한다 — 동시
  편집 시 rebase 가 분리된 append 를 합쳐준다. 같은 줄을 동시에 고치지 않는다.
- **공유 dev 서버 주의**: `pkill -f vite`(포트 무관 모든 vite 종료)는 다른 세션의 dev 서버까지
  죽인다 → 사용자가 보던 화면이 끊긴다. 블랭킷 kill 금지. 내 서버만 정리하려면 그 PID 만 끄고,
  꼭 필요하면 사용자에게 알린 뒤 한다. 서버가 죽었으면 다시 띄워 사용자 화면을 복구한다.

### 오류 기록 루틴 (반복 방지)
세션 중 버그·설계 함정·작업 실수를 발견하면 `docs/design/known_issues.md`에
"증상 → 원인 → 재발 방지책"으로 기록한다. 게임 버그뿐 아니라 프로세스 실수(도구
오용, 커밋 누락 등)도 포함. 세션 시작 루틴에서 이 파일을 먼저 읽어 예방한다.

### 세션 로그
매 세션 종료 시 `session_logs/YYYY-MM-DD.md`(날짜별 새 문서)에 요약·주요 변경·결정·
미해결을 기록한다. 같은 날짜면 이어서 추가.

### 구현 계획 문서는 "앞으로 할 일"만 남긴다 (중요)
`docs/design/backlog.md`·`docs/ROADMAP.md` 같은 **구현 계획 문서에는 앞으로 할 일·필요한
일만** 남긴다. 이미 구현 완료됐거나 계획이 바뀐 항목은 **지운다**(✅ 달성 목록을 쌓지 않는다).
무엇을 왜 했는지의 기록은 `session_logs/`(+ 필요 시 `known_issues.md`)에만 남기면 된다.
작업을 끝낼 때마다 해당 항목을 계획 문서에서 삭제한다.

## Scope

In scope and built: local hotseat, vs AI, AI 관전, and **online 1:1 via invite-link
rooms** (Supabase: 방 생성/입장·선공후공 협상·코인토스·이탈/재접속·재대국·온라인 무르기).
The engine stays JSON-serializable/snapshot-based so the netcode layer is thin (BTB1).

Still out of scope: matchmaking/lobby, accounts/nicknames, spectator links, store
packaging, native wrapping (Capacitor comes later, no engine rewrite). Don't build
these unless asked.
