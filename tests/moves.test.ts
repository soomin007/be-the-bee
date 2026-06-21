import { describe, it, expect } from 'vitest'
import { hex, hexKey } from '../src/engine/hex'
import { createInitialState } from '../src/engine/state'
import { allowedMoveTypes, applyMove, validateMove } from '../src/engine/moves'
import type { Board, GameState, Move, Player, PlayerSupply } from '../src/engine/types'

const fullSupply: PlayerSupply = { tiles: 30, pieces: 30, queenUsed: false }

function makeState(board: Board, turn: Player, over: Partial<GameState> = {}): GameState {
  return {
    board,
    turn,
    supplies: { yellow: { ...fullSupply }, brown: { ...fullSupply } },
    moveNumber: 5, // 첫 턴 제약을 피한 임의의 진행 중 상태
    phase: 'playing',
    ...over,
  }
}

function tiles(board: Board, owner: Player, ...coords: ReturnType<typeof hex>[]): void {
  for (const c of coords) board[hexKey(c)] = { tile: { owner } }
}

describe('초기 상태', () => {
  it('노랑 선턴, 시드 타일 2개, 자원 30/30, moveNumber 0', () => {
    const s = createInitialState()
    expect(s.turn).toBe('yellow')
    expect(s.moveNumber).toBe(0)
    expect(Object.keys(s.board)).toHaveLength(2)
    expect(s.supplies.yellow).toEqual(fullSupply)
  })
})

describe('턴 규칙', () => {
  it('선플레이어 첫 턴은 ②(타일+말)만 가능', () => {
    const s = createInitialState()
    expect(allowedMoveTypes(s)).toEqual(['tileAndPiece'])
    const two: Move = { type: 'twoTiles', first: hex(0, 1), second: hex(0, 2) }
    expect(validateMove(s, two).ok).toBe(false)
  })

  it('첫 수 적용: 새 상태 반환·원본 불변·턴 교대·자원 차감', () => {
    const s = createInitialState()
    const m: Move = { type: 'tileAndPiece', tile: hex(0, 1), piece: { at: hex(0, 0), kind: 'normal' } }
    const s1 = applyMove(s, m)
    expect(s1).not.toBe(s)
    expect(Object.keys(s.board)).toHaveLength(2) // 원본 불변
    expect(Object.keys(s1.board)).toHaveLength(3)
    expect(s1.turn).toBe('brown')
    expect(s1.moveNumber).toBe(1)
    expect(s1.supplies.yellow.tiles).toBe(29)
    expect(s1.supplies.yellow.pieces).toBe(29)
    expect(s1.board[hexKey(hex(0, 0))]!.piece).toEqual({ owner: 'yellow', kind: 'normal' })
  })
})

describe('타일 배치 규칙', () => {
  it('기존 타일에 인접하지 않으면 거부', () => {
    const s = createInitialState()
    const bad: Move = { type: 'tileAndPiece', tile: hex(5, 5), piece: { at: hex(0, 0), kind: 'normal' } }
    expect(validateMove(s, bad).ok).toBe(false)
  })

  it('twoTiles: 둘째 타일은 첫째를 포함한 보드에 인접해야 한다', () => {
    const s = applyMove(createInitialState(), {
      type: 'tileAndPiece',
      tile: hex(0, 1),
      piece: { at: hex(0, 0), kind: 'normal' },
    })
    // (3,0)은 기존 보드와 떨어져 있지만 (2,0)을 먼저 놓으면 인접해진다.
    const okMove: Move = { type: 'twoTiles', first: hex(2, 0), second: hex(3, 0) }
    expect(validateMove(s, okMove).ok).toBe(true)
    // 둘째가 첫째에도 보드에도 인접하지 않으면 거부
    const badMove: Move = { type: 'twoTiles', first: hex(2, 0), second: hex(9, 9) }
    expect(validateMove(s, badMove).ok).toBe(false)
  })
})

describe('말 배치 규칙', () => {
  it('이미 말이 있는 칸에는 못 놓는다', () => {
    const board: Board = {}
    tiles(board, 'brown', hex(0, 0), hex(1, 0))
    board[hexKey(hex(0, 0))] = { tile: { owner: 'brown' }, piece: { owner: 'brown', kind: 'normal' } }
    const s = makeState(board, 'yellow')
    const m: Move = { type: 'tileAndPiece', tile: hex(0, 1), piece: { at: hex(0, 0), kind: 'normal' } }
    expect(validateMove(s, m).ok).toBe(false)
  })

  it('벌집 잠금: 상대는 일반 말 불가, 여왕벌은 가능', () => {
    const board: Board = {}
    tiles(board, 'yellow', hex(0, 0), hex(1, 0), hex(2, 0), hex(3, 0), hex(4, 0)) // 노랑 벌집
    const s = makeState(board, 'brown')
    const tile = hex(0, 1) // (0,0)에 인접
    const normal: Move = { type: 'tileAndPiece', tile, piece: { at: hex(0, 0), kind: 'normal' } }
    expect(validateMove(s, normal).ok).toBe(false)
    const queen: Move = { type: 'tileAndPiece', tile, piece: { at: hex(0, 0), kind: 'queen' } }
    expect(validateMove(s, queen).ok).toBe(true)
  })

  it('벌집 잠금: 주인은 자기 벌집 타일에 놓을 수 있다', () => {
    const board: Board = {}
    tiles(board, 'yellow', hex(0, 0), hex(1, 0), hex(2, 0), hex(3, 0), hex(4, 0))
    const s = makeState(board, 'yellow')
    const m: Move = { type: 'tileAndPiece', tile: hex(0, 1), piece: { at: hex(2, 0), kind: 'normal' } }
    expect(validateMove(s, m).ok).toBe(true)
  })
})

describe('승리 판정 (말 5목 우선)', () => {
  it('말을 일렬 5번째로 놓으면 즉시 그 진영 승리로 종료', () => {
    const board: Board = {}
    tiles(board, 'brown', hex(0, 0), hex(1, 0), hex(2, 0), hex(3, 0), hex(4, 0))
    for (let q = 0; q <= 3; q++) {
      board[hexKey(hex(q, 0))] = { tile: { owner: 'brown' }, piece: { owner: 'brown', kind: 'normal' } }
    }
    const s = makeState(board, 'brown')
    const m: Move = { type: 'tileAndPiece', tile: hex(0, 1), piece: { at: hex(4, 0), kind: 'normal' } }
    const res = applyMove(s, m)
    expect(res.phase).toBe('finished')
    expect(res.result).toEqual({ kind: 'win', winner: 'brown' })
  })
})
