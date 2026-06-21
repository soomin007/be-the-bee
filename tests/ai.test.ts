import { describe, it, expect } from 'vitest'
import { hex, hexKey, hexEquals } from '../src/engine/hex'
import { createInitialState, pieceAt } from '../src/engine/state'
import { allowedMoveTypes, applyMove, validateMove, frontierCells } from '../src/engine/moves'
import { withTile } from '../src/engine/state'
import { createAi } from '../src/engine/ai'
import type { Board, GameState, Move, Player, PlayerSupply } from '../src/engine/types'

const fullSupply: PlayerSupply = { tiles: 30, pieces: 30, queenUsed: false }

function makeState(board: Board, turn: Player, over: Partial<GameState> = {}): GameState {
  return {
    board,
    turn,
    supplies: { yellow: { ...fullSupply }, brown: { ...fullSupply } },
    moveNumber: 5,
    phase: 'playing',
    ...over,
  }
}

// 타일/말을 좌표·소유자 튜플로 깐다.
function build(
  tiles: Array<[ReturnType<typeof hex>, Player]>,
  pieces: Array<[ReturnType<typeof hex>, Player]> = [],
): Board {
  const board: Board = {}
  for (const [h, owner] of tiles) board[hexKey(h)] = { tile: { owner } }
  for (const [h, owner] of pieces) {
    const cell = board[hexKey(h)]
    if (!cell) throw new Error('말은 타일 위에만')
    board[hexKey(h)] = { tile: cell.tile, piece: { owner, kind: 'normal' } }
  }
  return board
}

// 색을 번갈아 깐 타일선(같은 색 5목 → 벌집 잠금 방지용)
function mixedRow(qFrom: number, qTo: number, r: number): Array<[ReturnType<typeof hex>, Player]> {
  const out: Array<[ReturnType<typeof hex>, Player]> = []
  for (let q = qFrom; q <= qTo; q++) out.push([hex(q, r), q % 2 === 0 ? 'yellow' : 'brown'])
  return out
}

function pieceOwnerAt(applied: GameState, h: ReturnType<typeof hex>): Player | undefined {
  return pieceAt(applied.board, h)?.owner
}

describe('AI: 즉시 승리', () => {
  it('기존 타일 위 5번째 말로 즉시 승리한다', () => {
    const board = build(
      [
        [hex(0, 0), 'brown'],
        [hex(1, 0), 'brown'],
        [hex(2, 0), 'brown'],
        [hex(3, 0), 'brown'],
        [hex(4, 0), 'brown'],
      ],
      [
        [hex(0, 0), 'brown'],
        [hex(1, 0), 'brown'],
        [hex(2, 0), 'brown'],
        [hex(3, 0), 'brown'],
      ],
    )
    const state = makeState(board, 'brown')
    const move = createAi({ seed: 1 }).chooseMove(state)
    const applied = applyMove(state, move)
    expect(applied.phase).toBe('finished')
    expect(applied.result).toEqual({ kind: 'win', winner: 'brown' })
  })

  it('프론티어 칸에 타일+말로 즉시 승리한다', () => {
    const board = build(
      mixedRow(0, 3, 0), // 0..3 타일(혼합색, 벌집 아님)
      [
        [hex(0, 0), 'brown'],
        [hex(1, 0), 'brown'],
        [hex(2, 0), 'brown'],
        [hex(3, 0), 'brown'],
      ],
    )
    const state = makeState(board, 'brown')
    const move = createAi({ seed: 1 }).chooseMove(state)
    expect(move.type).toBe('tileAndPiece')
    // 4목의 양끝(4,0)/(-1,0) 모두 빈 프론티어 칸이므로 어느 쪽이든 승리다
    if (move.type === 'tileAndPiece') {
      const at = move.piece.at
      expect(hexEquals(at, hex(4, 0)) || hexEquals(at, hex(-1, 0))).toBe(true)
    }
    const applied = applyMove(state, move)
    expect(applied.result).toEqual({ kind: 'win', winner: 'brown' })
  })
})

describe('AI: 상대 즉시 승리 차단', () => {
  it('기존 타일 끝을 막는다', () => {
    // 노랑 말 0..3, 왼쪽 끝(-1,0)은 갈색 말로 이미 막힘 → 위협은 (4,0) 하나
    const board = build(
      [...mixedRow(-1, 4, 0)],
      [
        [hex(0, 0), 'yellow'],
        [hex(1, 0), 'yellow'],
        [hex(2, 0), 'yellow'],
        [hex(3, 0), 'yellow'],
        [hex(-1, 0), 'brown'],
      ],
    )
    const state = makeState(board, 'brown')
    const move = createAi({ seed: 2 }).chooseMove(state)
    const applied = applyMove(state, move)
    expect(pieceOwnerAt(applied, hex(4, 0))).toBe('brown')
  })

  it('프론티어 완성 위협을 막는다 (타일이 아직 없는 끝)', () => {
    // (4,0)에는 타일 없음(프론티어). 상대는 타일+말 한 수로 5목 가능 → 막아야 함
    const board = build(
      [...mixedRow(-1, 3, 0)],
      [
        [hex(0, 0), 'yellow'],
        [hex(1, 0), 'yellow'],
        [hex(2, 0), 'yellow'],
        [hex(3, 0), 'yellow'],
        [hex(-1, 0), 'brown'],
      ],
    )
    const state = makeState(board, 'brown')
    const move = createAi({ seed: 2 }).chooseMove(state)
    expect(move.type).toBe('tileAndPiece')
    const applied = applyMove(state, move)
    expect(pieceOwnerAt(applied, hex(4, 0))).toBe('brown')
  })

  it('끊긴 4(P P _ P P)의 빈틈을 막는다', () => {
    const board = build(
      [...mixedRow(0, 4, 0)],
      [
        [hex(0, 0), 'yellow'],
        [hex(1, 0), 'yellow'],
        [hex(3, 0), 'yellow'],
        [hex(4, 0), 'yellow'],
      ],
    )
    const state = makeState(board, 'brown')
    const move = createAi({ seed: 2 }).chooseMove(state)
    const applied = applyMove(state, move)
    expect(pieceOwnerAt(applied, hex(2, 0))).toBe('brown')
  })

  it('이중 위협이면 throw 없이 합법수를 반환한다', () => {
    // 노랑 열린 4 (양끝 (-1,0),(4,0) 모두 타일 있고 비어 위협) → 둘 다 못 막음
    const board = build(
      [...mixedRow(-1, 4, 0)],
      [
        [hex(0, 0), 'yellow'],
        [hex(1, 0), 'yellow'],
        [hex(2, 0), 'yellow'],
        [hex(3, 0), 'yellow'],
      ],
    )
    const state = makeState(board, 'brown')
    const move = createAi({ seed: 3 }).chooseMove(state)
    expect(validateMove(state, move).ok).toBe(true)
  })
})

describe('AI: 합법성 / allowedMoveTypes', () => {
  it('타일이 0개면 pieceOnly 를 둔다', () => {
    const board = build([
      [hex(0, 0), 'brown'],
      [hex(1, 0), 'brown'],
    ])
    const state = makeState(board, 'brown', {
      supplies: { yellow: { ...fullSupply }, brown: { tiles: 0, pieces: 30, queenUsed: false } },
    })
    expect(allowedMoveTypes(state)).toEqual(['pieceOnly'])
    const move = createAi({ seed: 4 }).chooseMove(state)
    expect(move.type).toBe('pieceOnly')
    expect(validateMove(state, move).ok).toBe(true)
  })

  it('선플레이어 첫 턴(moveNumber 0)은 tileAndPiece 를 둔다', () => {
    const state = createInitialState() // turn yellow, moveNumber 0
    const move = createAi({ seed: 4 }).chooseMove(state)
    expect(move.type).toBe('tileAndPiece')
    expect(validateMove(state, move).ok).toBe(true)
  })

  it('무작위로 도달한 상태들에서 항상 합법수를 낸다 (퍼즈)', () => {
    // 합법성은 수 생성/폴백 문제라 탐색 깊이와 무관 → 빠른 easy(1수)로 검증.
    const rng = mulberry(99)
    const ai = createAi({ difficulty: 'easy', seed: 5 })
    let state = createInitialState()
    for (let i = 0; i < 120 && state.phase === 'playing'; i++) {
      const aiMove = ai.chooseMove(state)
      expect(validateMove(state, aiMove).ok).toBe(true)
      const rnd = randomLegalMove(state, rng)
      if (rnd === null) break
      state = applyMove(state, rnd)
    }
  })
})

describe('AI: self-play (엔진 통합)', () => {
  it('AI vs AI 가 합법수만으로 게임을 종료까지 진행한다', () => {
    const ai = createAi({ seed: 7 })
    let state = createInitialState()
    let plies = 0
    while (state.phase === 'playing' && plies < 2000) {
      const move = ai.chooseMove(state)
      expect(validateMove(state, move).ok).toBe(true)
      state = applyMove(state, move)
      plies++
    }
    expect(state.phase).toBe('finished')
    expect(state.result).toBeDefined()
  })

  it('medium(빔 서치)가 easy(1수)보다 강하다', () => {
    const games = 6
    let mediumWins = 0
    let easyWins = 0
    for (let i = 0; i < games; i++) {
      const med = createAi({ difficulty: 'medium', seed: 100 + i })
      const esy = createAi({ difficulty: 'easy', seed: 200 + i })
      const medIsYellow = i % 2 === 0
      const winner = medIsYellow ? playGame(med, esy) : playGame(esy, med)
      const medSide: Player = medIsYellow ? 'yellow' : 'brown'
      if (winner === medSide) mediumWins++
      else if (winner !== 'draw') easyWins++
    }
    // eslint-disable-next-line no-console
    console.log(`medium ${mediumWins} : ${easyWins} easy (무 ${games - mediumWins - easyWins})`)
    expect(mediumWins).toBeGreaterThan(easyWins)
  }, 30000)

  it('hard(깊은 서치+허리끊기)가 medium 보다 강하다', () => {
    const games = 6
    let hardWins = 0
    let medWins = 0
    for (let i = 0; i < games; i++) {
      const hard = createAi({ difficulty: 'hard', seed: 300 + i })
      const med = createAi({ difficulty: 'medium', seed: 400 + i })
      const hardIsYellow = i % 2 === 0
      const winner = hardIsYellow ? playGame(hard, med) : playGame(med, hard)
      const hardSide: Player = hardIsYellow ? 'yellow' : 'brown'
      if (winner === hardSide) hardWins++
      else if (winner !== 'draw') medWins++
    }
    // eslint-disable-next-line no-console
    console.log(`hard ${hardWins} : ${medWins} medium (무 ${games - hardWins - medWins})`)
    expect(hardWins).toBeGreaterThan(medWins)
  }, 60000)

  it('같은 seed·상태면 같은 수를 낸다 (결정성)', () => {
    const board = build(
      [...mixedRow(0, 3, 0)],
      [
        [hex(0, 0), 'brown'],
        [hex(1, 0), 'brown'],
      ],
    )
    const state = makeState(board, 'brown')
    const a = createAi({ seed: 42 }).chooseMove(state)
    const b = createAi({ seed: 42 }).chooseMove(state)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})

// 한 판을 끝까지 두고 승자를 반환.
function playGame(yellowAi: ReturnType<typeof createAi>, brownAi: ReturnType<typeof createAi>): Player | 'draw' {
  let state = createInitialState()
  let plies = 0
  while (state.phase === 'playing' && plies < 400) {
    const ai = state.turn === 'yellow' ? yellowAi : brownAi
    state = applyMove(state, ai.chooseMove(state))
    plies++
  }
  if (state.result?.kind === 'win') return state.result.winner
  if (state.result?.kind === 'score') return state.result.winner
  return 'draw'
}

// ---- 테스트용 무작위 합법수 생성 -------------------------------------------

function mulberry(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(arr: T[], rng: () => number): T | undefined {
  if (arr.length === 0) return undefined
  return arr[Math.floor(rng() * arr.length)]
}

function emptyTiles(board: Board): ReturnType<typeof hex>[] {
  const out: ReturnType<typeof hex>[] = []
  for (const key of Object.keys(board)) {
    if (!board[key]!.piece) {
      const [q, r] = key.split(',').map(Number)
      out.push(hex(q!, r!))
    }
  }
  return out
}

function randomLegalMove(state: GameState, rng: () => number): Move | null {
  const allowed = allowedMoveTypes(state)
  if (allowed.length === 0) return null
  const board = state.board
  const frontier = frontierCells(board)
  for (let i = 0; i < 80; i++) {
    const t = pick(allowed, rng)
    let m: Move | null = null
    if (t === 'tileAndPiece' && frontier.length > 0) {
      const tile = pick(frontier, rng)!
      const board1 = withTile(board, tile, state.turn)
      const at = pick(emptyTiles(board1), rng)
      if (at) m = { type: 'tileAndPiece', tile, piece: { at, kind: 'normal' } }
    } else if (t === 'twoTiles' && frontier.length > 0) {
      const first = pick(frontier, rng)!
      const second = pick(frontierCells(withTile(board, first, state.turn)), rng)
      if (second) m = { type: 'twoTiles', first, second }
    } else if (t === 'pieceOnly') {
      const at = pick(emptyTiles(board), rng)
      if (at) m = { type: 'pieceOnly', piece: { at, kind: 'normal' } }
    }
    if (m && validateMove(state, m).ok) return m
  }
  return null
}
