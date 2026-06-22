// 승리 판정: 같은 진영의 말 5개 이상이 일렬(design/rules.md §2).
// findLines 를 말 소유자로 호출한다, 벌집과 같은 스캐너, 다른 입력.

import { cellAt, LINE_LENGTH, pieceAt, withPiece, withTile } from './state'
import { hexFromKey, hexKey, hexNeighbors, type Hex } from './hex'
import { findLines } from './lines'
import type { Board, Player } from './types'

export interface WinningLine {
  readonly owner: Player
  readonly cells: readonly string[] // hexKey, 축 정렬
}

/**
 * 말 5목 라인을 반환(없으면 null). 여왕벌도 소유자의 말로 센다(§8.2).
 * 정상 진행에서는 한 번에 한쪽만 5목이 되지만, 방어적으로 먼저 찾은 라인을 반환한다.
 */
export function winningLine(board: Board): WinningLine | null {
  const pieceOwners = new Map<string, Player>()
  for (const key of Object.keys(board)) {
    const piece = board[key]!.piece
    if (piece !== undefined) pieceOwners.set(key, piece.owner)
  }
  const lines = findLines(pieceOwners, LINE_LENGTH)
  return lines.length > 0 ? { owner: lines[0]!.value, cells: lines[0]!.cells } : null
}

/** 말 5목을 이룬 진영을 반환(없으면 null). */
export function detectWin(board: Board): Player | null {
  return winningLine(board)?.owner ?? null
}

/**
 * player 의 말을 한 수로 5목으로 만들 수 있는 빈 셀들(기하학적, 도달 가능성은 따지지 않음).
 * 5목을 만들려면 새 말이 기존 말과 축으로 인접해야 하므로 후보는 player 말의 이웃뿐.
 * 위협/리치 표시와 AI 차단 양쪽에서 재사용한다.
 */
export function completingCells(board: Board, player: Player): Hex[] {
  const out: Hex[] = []
  const seen = new Set<string>()
  for (const key of Object.keys(board)) {
    const piece = board[key]!.piece
    if (!piece || piece.owner !== player) continue
    for (const n of hexNeighbors(hexFromKey(key))) {
      const k = hexKey(n)
      if (seen.has(k)) continue
      seen.add(k)
      if (pieceAt(board, n) !== undefined) continue
      const tiled = cellAt(board, n) !== undefined ? board : withTile(board, n, player)
      if (detectWin(withPiece(tiled, n, { owner: player, kind: 'normal' })) === player) out.push(n)
    }
  }
  return out
}
