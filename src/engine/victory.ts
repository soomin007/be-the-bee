// 승리 판정: 같은 진영의 말 5개 이상이 일렬(design/rules.md §2).
// findLines 를 말 소유자로 호출한다 — 벌집과 같은 스캐너, 다른 입력.

import { LINE_LENGTH } from './state'
import { findLines } from './lines'
import type { Board, Player } from './types'

/**
 * 말 5목을 이룬 진영을 반환(없으면 null). 여왕벌도 소유자의 말로 센다(§8.2).
 * 정상 진행에서는 한 번에 한쪽만 5목이 되지만, 방어적으로 먼저 찾은 쪽을 반환한다.
 */
export function detectWin(board: Board): Player | null {
  const pieceOwners = new Map<string, Player>()
  for (const key of Object.keys(board)) {
    const piece = board[key]!.piece
    if (piece !== undefined) pieceOwners.set(key, piece.owner)
  }
  const lines = findLines(pieceOwners, LINE_LENGTH)
  return lines.length > 0 ? lines[0]!.value : null
}
