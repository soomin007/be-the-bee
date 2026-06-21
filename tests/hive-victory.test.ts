import { describe, it, expect } from 'vitest'
import { hex, hexKey } from '../src/engine/hex'
import type { Board, Player } from '../src/engine/types'
import { detectHives, hiveScore, totalHiveScores, lockedTiles } from '../src/engine/hive'
import { detectWin } from '../src/engine/victory'

// 헬퍼: 타일/말을 깔아 보드를 만든다.
function build(tiles: Array<[ReturnType<typeof hex>, Player]>, pieces: Array<[ReturnType<typeof hex>, Player]> = []): Board {
  const board: Board = {}
  for (const [h, owner] of tiles) board[hexKey(h)] = { tile: { owner } }
  for (const [h, owner] of pieces) {
    const key = hexKey(h)
    const cell = board[key]
    if (!cell) throw new Error('말은 타일 위에만')
    board[key] = { tile: cell.tile, piece: { owner, kind: 'normal' } }
  }
  return board
}

function row(qFrom: number, qTo: number, r: number): ReturnType<typeof hex>[] {
  const out: ReturnType<typeof hex>[] = []
  for (let q = qFrom; q <= qTo; q++) out.push(hex(q, r))
  return out
}

describe('벌집(hive)', () => {
  it('같은 색 타일 5개 일렬이면 벌집', () => {
    const board = build(row(0, 4, 0).map((h) => [h, 'yellow'] as [ReturnType<typeof hex>, Player]))
    const hives = detectHives(board)
    expect(hives).toHaveLength(1)
    expect(hives[0]!.owner).toBe('yellow')
  })

  it('4개면 벌집 아님', () => {
    const board = build(row(0, 3, 0).map((h) => [h, 'yellow'] as [ReturnType<typeof hex>, Player]))
    expect(detectHives(board)).toHaveLength(0)
  })

  it('점수: 5개=1점, 7개=3점', () => {
    const five = build(row(0, 4, 0).map((h) => [h, 'yellow'] as [ReturnType<typeof hex>, Player]))
    expect(hiveScore(detectHives(five)[0]!)).toBe(1)
    const seven = build(row(0, 6, 0).map((h) => [h, 'yellow'] as [ReturnType<typeof hex>, Player]))
    expect(hiveScore(detectHives(seven)[0]!)).toBe(3)
  })

  it('진영별 점수 합계', () => {
    const board = build([
      ...row(0, 4, 0).map((h) => [h, 'yellow'] as [ReturnType<typeof hex>, Player]),
      ...row(0, 5, 2).map((h) => [h, 'brown'] as [ReturnType<typeof hex>, Player]),
    ])
    expect(totalHiveScores(board)).toEqual({ yellow: 1, brown: 2 })
  })

  it('잠금: 벌집 타일은 주인에게 잠긴다, 비포함 인접 타일은 안 잠김', () => {
    const board = build([
      ...row(0, 4, 0).map((h) => [h, 'yellow'] as [ReturnType<typeof hex>, Player]),
      [hex(0, 1), 'yellow'], // 벌집에 인접하지만 직선에 포함되지 않음
    ])
    const locks = lockedTiles(board)
    expect(locks.get(hexKey(hex(0, 0)))).toBe('yellow')
    expect(locks.get(hexKey(hex(4, 0)))).toBe('yellow')
    expect(locks.has(hexKey(hex(0, 1)))).toBe(false)
  })
})

describe('승리(말 5목)', () => {
  it('말 5개 일렬이면 그 진영 승리', () => {
    const tiles = row(0, 4, 0).map((h) => [h, 'yellow'] as [ReturnType<typeof hex>, Player])
    const pieces = row(0, 4, 0).map((h) => [h, 'brown'] as [ReturnType<typeof hex>, Player])
    expect(detectWin(build(tiles, pieces))).toBe('brown')
  })

  it('4개면 승리 아님', () => {
    const tiles = row(0, 3, 0).map((h) => [h, 'yellow'] as [ReturnType<typeof hex>, Player])
    const pieces = row(0, 3, 0).map((h) => [h, 'brown'] as [ReturnType<typeof hex>, Player])
    expect(detectWin(build(tiles, pieces))).toBeNull()
  })

  it('타일선과 말선은 독립 — 타일이 5목이어도 말이 없으면 승리 아님', () => {
    const board = build(row(0, 4, 0).map((h) => [h, 'yellow'] as [ReturnType<typeof hex>, Player]))
    expect(detectWin(board)).toBeNull()
    expect(detectHives(board)).toHaveLength(1)
  })
})
