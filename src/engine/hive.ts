// 벌집(hive): 같은 색 타일 5개 이상이 일렬(design/rules.md §5, §7, §8.4).
// findLines 를 타일 색으로 호출해 탐지한다.

import { LINE_LENGTH } from './state'
import { findLines } from './lines'
import type { Board, Hive, Player } from './types'

/** 보드의 모든 벌집. 각 축의 5+ 연속 직선 1개당 별개 벌집(중복 허용, §8.4). */
export function detectHives(board: Board): Hive[] {
  const tileColors = new Map<string, Player>()
  for (const key of Object.keys(board)) {
    tileColors.set(key, board[key]!.tile.owner)
  }
  return findLines(tileColors, LINE_LENGTH).map((line) => ({
    owner: line.value,
    cells: line.cells,
  }))
}

/** 한 벌집의 점수 = (타일 수 − 4). 5개=1, 6개=2, … (§7, §8.4). */
export function hiveScore(hive: Hive): number {
  return hive.cells.length - (LINE_LENGTH - 1)
}

/** 진영별 벌집 점수 합계. */
export function totalHiveScores(board: Board): Record<Player, number> {
  const scores: Record<Player, number> = { yellow: 0, brown: 0 }
  for (const hive of detectHives(board)) {
    scores[hive.owner] += hiveScore(hive)
  }
  return scores
}

/**
 * 잠긴 타일 → 벌집 주인. 벌집을 이루는 타일에는 주인만 새 말을 놓을 수 있다(§5).
 * 벌집에 포함되지 않은 인접 타일은 잠그지 않는다(§8.5).
 * 한 타일이 여러 벌집에 속해도 모두 같은 색이므로 주인은 유일하다.
 */
export function lockedTiles(board: Board): Map<string, Player> {
  const locks = new Map<string, Player>()
  for (const hive of detectHives(board)) {
    for (const key of hive.cells) locks.set(key, hive.owner)
  }
  return locks
}
