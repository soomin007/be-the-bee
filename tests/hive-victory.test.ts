import { describe, it, expect } from 'vitest'
import { hex, hexKey } from '../src/engine/hex'
import type { Board, Player } from '../src/engine/types'
import { detectHives, hiveScore, totalHiveScores, lockedTiles, hiveCountdowns } from '../src/engine/hive'
import { completingCells, detectWin, winningLine } from '../src/engine/victory'
import { winningCells } from '../src/engine/moves'
import type { PlayerSupply } from '../src/engine/types'

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

  it('winningLine: 이긴 5목의 5칸을 돌려준다', () => {
    const tiles = row(0, 4, 0).map((h) => [h, 'yellow'] as [ReturnType<typeof hex>, Player])
    const pieces = row(0, 4, 0).map((h) => [h, 'brown'] as [ReturnType<typeof hex>, Player])
    const line = winningLine(build(tiles, pieces))
    expect(line?.owner).toBe('brown')
    expect(line?.cells).toHaveLength(5)
  })

  it('타일선과 말선은 독립 — 타일이 5목이어도 말이 없으면 승리 아님', () => {
    const board = build(row(0, 4, 0).map((h) => [h, 'yellow'] as [ReturnType<typeof hex>, Player]))
    expect(detectWin(board)).toBeNull()
    expect(detectHives(board)).toHaveLength(1)
  })
})

describe('완성 가능 칸 (리치/차단 공유)', () => {
  const full: PlayerSupply = { tiles: 30, pieces: 30, queenUsed: false }

  it('completingCells: 말 4목의 빈 양끝을 5목 완성 칸으로 찾는다', () => {
    const tiles = row(0, 4, 0).map((h) => [h, 'yellow'] as [ReturnType<typeof hex>, Player])
    const pieces = [0, 1, 2, 3].map((q) => [hex(q, 0), 'brown'] as [ReturnType<typeof hex>, Player])
    const cells = completingCells(build(tiles, pieces), 'brown')
    const keys = new Set(cells.map(hexKey))
    expect(keys.has(hexKey(hex(4, 0)))).toBe(true)
  })

  it('winningCells: 타일이 남아 있으면 프론티어 끝도 도달 가능 완성 칸', () => {
    // (4,0)에는 타일 없음(프론티어). 타일이 있으면 한 수로 타일+말 → 완성 가능
    const tiles = row(0, 3, 0).map((h) => [h, 'yellow'] as [ReturnType<typeof hex>, Player])
    const pieces = [0, 1, 2, 3].map((q) => [hex(q, 0), 'brown'] as [ReturnType<typeof hex>, Player])
    const board = build(tiles, pieces)
    const reachable = winningCells(board, 'brown', full)
    expect(new Set(reachable.map(hexKey)).has(hexKey(hex(4, 0)))).toBe(true)
    // 타일이 0개면 프론티어 끝은 도달 불가
    const noTiles = winningCells(board, 'brown', { tiles: 0, pieces: 30, queenUsed: false })
    expect(new Set(noTiles.map(hexKey)).has(hexKey(hex(4, 0)))).toBe(false)
  })
})

describe('벌집 초읽기 (hiveCountdowns)', () => {
  // 잠긴 노랑 벌집(타일 5개 일렬) 위에 노랑 말 N개 → movesLeft = 5 − N.
  const hiveTiles = row(0, 4, 0).map((h) => [h, 'yellow'] as [ReturnType<typeof hex>, Player])

  it('말 3개면 2수 뒤 5목(초읽기 2)', () => {
    const board = build(
      hiveTiles,
      [0, 1, 2].map((q) => [hex(q, 0), 'yellow'] as [ReturnType<typeof hex>, Player]),
    )
    const cds = hiveCountdowns(board)
    expect(cds).toHaveLength(1)
    expect(cds[0]!.owner).toBe('yellow')
    expect(cds[0]!.movesLeft).toBe(2)
    expect(cds[0]!.cells).toHaveLength(5)
  })

  it('말 4개면 1수 뒤 5목(초읽기 1)', () => {
    const board = build(
      hiveTiles,
      [0, 1, 2, 3].map((q) => [hex(q, 0), 'yellow'] as [ReturnType<typeof hex>, Player]),
    )
    expect(hiveCountdowns(board)[0]!.movesLeft).toBe(1)
  })

  it('상대 말이 줄 안에 끼면 그 줄은 막혀 카운트다운 없음(잠기기 전 선점)', () => {
    const board = build(hiveTiles, [
      [hex(0, 0), 'yellow'],
      [hex(1, 0), 'yellow'],
      [hex(2, 0), 'brown'], // 갈색이 선점
      [hex(3, 0), 'yellow'],
    ])
    expect(hiveCountdowns(board)).toHaveLength(0)
  })

  it('벌집 위에 내 말이 하나도 없으면 위협 아님', () => {
    expect(hiveCountdowns(build(hiveTiles))).toHaveLength(0)
  })

  it('벌집이 아직 안 잠겼으면(타일 4개) 카운트다운 없음', () => {
    const board = build(
      row(0, 3, 0).map((h) => [h, 'yellow'] as [ReturnType<typeof hex>, Player]),
      [0, 1, 2].map((q) => [hex(q, 0), 'yellow'] as [ReturnType<typeof hex>, Player]),
    )
    expect(hiveCountdowns(board)).toHaveLength(0)
  })
})
