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
as a `Map` keyed by coordinate — never a fixed 2D array. Follow the conventions
in the Red Blob Games hex guide.

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

- `npm run dev`   — local dev server
- `npm test`      — run engine tests
- `npm run build` — production build

## Out of scope (for now)

Online matchmaking, accounts, store packaging, real-time multiplayer. Build
**local hotseat + vs AI only**. Invite-link rooms may come later, so keep the
engine serializable and netcode-friendly, but do NOT build any networking yet.
