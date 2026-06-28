// 벌집(hive): 같은 색 타일 5개 이상이 일렬(docs/design/rules.md §5, §7, §8.4).
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

/** 벌집 안에서 안전한 말 5목까지 남은 "초읽기" 위협. */
export interface HiveCountdown {
  /** 그 벌집/줄의 주인(= 곧 승리할 쪽). */
  readonly owner: Player
  /** 안전한 5목까지 더 놓아야 할 owner 의 말 수(1 = 다음 한 수면 승리). */
  readonly movesLeft: number
  /** 그 5칸(hexKey, 축 정렬). 화면 강조용. */
  readonly cells: readonly string[]
}

/**
 * 잠긴 벌집 위에서 "막을 수 없는 말 5목"이 얼마나 임박했는지(엔드게임 초읽기).
 * 벌집(같은 색 타일 5+ 연속, 이미 잠김)의 모든 5칸 창을 보고:
 *  - 창 안에 상대 말이 있으면 그 줄은 5목이 막혀 제외(잠기기 전 선점당한 경우),
 *  - 아니면 movesLeft = 5 − (창 안 owner 말 수). owner 말이 1개 이상인 창만 위협으로 본다.
 * 진영별로 가장 임박한(movesLeft 최소) 위협 하나씩 반환한다. 표준 모드에선 상대가 그 빈칸에
 * 보통 말을 못 놓으므로(§5), 이 카운트다운은 사실상 "확정 패배까지 남은 owner 턴 수"다.
 * (여왕벌 모드면 상대가 여왕벌로 딱 한 칸 막을 수 있어 절대적 확정은 아니다 — 표시 측에서 안내.)
 * 순수 함수, DOM 무관. UI 의 위험 카운트다운 표시·AI 평가 양쪽에서 재사용 가능.
 */
export function hiveCountdowns(board: Board): HiveCountdown[] {
  const byOwner = new Map<Player, HiveCountdown>()
  for (const hive of detectHives(board)) {
    const owner = hive.owner
    for (let i = 0; i + LINE_LENGTH <= hive.cells.length; i++) {
      const window = hive.cells.slice(i, i + LINE_LENGTH)
      let mine = 0
      let blocked = false
      for (const key of window) {
        const piece = board[key]!.piece
        if (piece === undefined) continue
        if (piece.owner === owner) mine++
        else {
          blocked = true // 상대 말이 끼어 그 줄은 5목 불가
          break
        }
      }
      if (blocked || mine < 1) continue
      const movesLeft = LINE_LENGTH - mine
      const prev = byOwner.get(owner)
      if (prev === undefined || movesLeft < prev.movesLeft) {
        byOwner.set(owner, { owner, movesLeft, cells: window })
      }
    }
  }
  return Array.from(byOwner.values())
}
