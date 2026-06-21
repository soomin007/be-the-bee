// design/rules.md 의 까다로운 규칙 엣지케이스 단위 테스트.
import { describe, it, expect } from 'vitest'
import { hex, hexKey } from '../src/engine/hex'
import { detectWin } from '../src/engine/victory'
import { detectHives, totalHiveScores } from '../src/engine/hive'
import { applyMove } from '../src/engine/moves'
import type { Board, GameState, PieceKind, Player, PlayerSupply } from '../src/engine/types'

const full: PlayerSupply = { tiles: 30, pieces: 30, queenUsed: false }

function build(
  tiles: Array<[ReturnType<typeof hex>, Player]>,
  pieces: Array<[ReturnType<typeof hex>, Player, PieceKind?]> = [],
): Board {
  const b: Board = {}
  for (const [h, owner] of tiles) b[hexKey(h)] = { tile: { owner } }
  for (const [h, owner, kind] of pieces) {
    const cell = b[hexKey(h)]
    if (!cell) throw new Error('말은 타일 위에만')
    b[hexKey(h)] = { tile: cell.tile, piece: { owner, kind: kind ?? 'normal' } }
  }
  return b
}

function makeState(board: Board, turn: Player, over: Partial<GameState> = {}): GameState {
  return {
    board,
    turn,
    supplies: { yellow: { ...full }, brown: { ...full } },
    moveNumber: 5,
    phase: 'playing',
    ...over,
  }
}

function row(qFrom: number, qTo: number, r: number, owner: Player): Array<[ReturnType<typeof hex>, Player]> {
  const out: Array<[ReturnType<typeof hex>, Player]> = []
  for (let q = qFrom; q <= qTo; q++) out.push([hex(q, r), owner])
  return out
}

describe('§8.2 여왕벌 5목 인정', () => {
  it('여왕벌이 섞인 말 5개도 5목 승리', () => {
    const tiles = row(0, 4, 0, 'yellow')
    const pieces: Array<[ReturnType<typeof hex>, Player, PieceKind?]> = [
      [hex(0, 0), 'brown'],
      [hex(1, 0), 'brown'],
      [hex(2, 0), 'brown', 'queen'], // 가운데가 여왕벌
      [hex(3, 0), 'brown'],
      [hex(4, 0), 'brown'],
    ]
    expect(detectWin(build(tiles, pieces))).toBe('brown')
  })

  it('여왕벌을 5번째로 놓아 승리(applyMove)', () => {
    const board = build(row(0, 4, 0, 'brown'), [
      [hex(0, 0), 'brown'],
      [hex(1, 0), 'brown'],
      [hex(2, 0), 'brown'],
      [hex(3, 0), 'brown'],
    ])
    const state = makeState(board, 'brown')
    const res = applyMove(state, {
      type: 'tileAndPiece',
      tile: hex(0, 1),
      piece: { at: hex(4, 0), kind: 'queen' },
    })
    expect(res.result).toEqual({ kind: 'win', winner: 'brown' })
    expect(res.supplies.brown.queenUsed).toBe(true)
  })
})

describe('§8.3 한 수로 말 5목 + 벌집 동시 완성 → 승리 우선', () => {
  it('타일이 벌집을 완성하면서 말도 5목이면 결과는 승리', () => {
    // 노랑 타일 0..3 + 노랑 말 0..3. (4,0)에 타일+말을 놓으면
    // 타일 5목(벌집)과 말 5목이 동시 완성 → 승리가 우선.
    const board = build(row(0, 3, 0, 'yellow'), [
      [hex(0, 0), 'yellow'],
      [hex(1, 0), 'yellow'],
      [hex(2, 0), 'yellow'],
      [hex(3, 0), 'yellow'],
    ])
    const state = makeState(board, 'yellow')
    const res = applyMove(state, {
      type: 'tileAndPiece',
      tile: hex(4, 0),
      piece: { at: hex(4, 0), kind: 'normal' },
    })
    expect(res.phase).toBe('finished')
    expect(res.result).toEqual({ kind: 'win', winner: 'yellow' })
  })
})

describe('§8.4 분기/교차 벌집 점수', () => {
  it('교차(+자)하는 두 직선은 별개 벌집 2개로 점수를 각각 센다', () => {
    const tiles: Array<[ReturnType<typeof hex>, Player]> = []
    for (let q = -2; q <= 2; q++) tiles.push([hex(q, 0), 'yellow']) // q축 5개
    for (let t = -2; t <= 2; t++) if (t !== 0) tiles.push([hex(t, -t), 'yellow']) // r축 5개(중심 공유)
    const board = build(tiles)
    expect(detectHives(board)).toHaveLength(2)
    expect(totalHiveScores(board).yellow).toBe(2) // 5개=1점 × 2
  })
})

describe('§7 타일 소진 → 벌집 점수로 종료', () => {
  it('마지막 수 뒤 양쪽 모두 둘 수 없으면 점수로 종료(무승부)', () => {
    // 타일 2개: (0,0) 빈 노랑, (1,0)엔 이미 말. 양쪽 타일 0개.
    const board = build(
      [
        [hex(0, 0), 'yellow'],
        [hex(1, 0), 'brown'],
      ],
      [[hex(1, 0), 'yellow']],
    )
    const state = makeState(board, 'yellow', {
      supplies: { yellow: { tiles: 0, pieces: 1, queenUsed: false }, brown: { tiles: 0, pieces: 0, queenUsed: false } },
    })
    // 노랑이 마지막 말을 (0,0)에 → 보드 가득 + 양쪽 자원 0 → 종료
    const res = applyMove(state, { type: 'pieceOnly', piece: { at: hex(0, 0), kind: 'normal' } })
    expect(res.phase).toBe('finished')
    expect(res.result?.kind).toBe('score')
    if (res.result?.kind === 'score') expect(res.result.winner).toBe('draw')
  })
})
