// 승리 판정: 같은 진영의 말 5개 이상이 일렬(docs/design/rules.md §2).
// findLines 를 말 소유자로 호출한다, 벌집과 같은 스캐너, 다른 입력.

import { cellAt, LINE_LENGTH, pieceAt, withPiece, withTile } from './state'
import { HEX_AXES, hexAdd, hexFromKey, hexKey, hexNeighbors, hexSubtract, type Hex } from './hex'
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

/**
 * player 의 "자라는 위협" 줄: 아직 5목은 아니지만(길이 3·4) 한쪽 끝으로 더 연장해 5목까지 갈 여지가
 * 있는(열린 끝) 연속 말 직선들의 칸 목록. 코칭 '강하게' 에서 "상대가 노리는 줄"을 미리 강조하는 데 쓴다.
 * 양끝이 다 막힌(죽은) 줄은 제외한다. 순수 함수(DOM 무관).
 */
export function threatLines(board: Board, player: Player): string[][] {
  const owners = new Map<string, Player>()
  for (const key of Object.keys(board)) {
    const p = board[key]!.piece
    if (p && p.owner === player) owners.set(key, player)
  }
  // 끝 너머 칸으로 연장 가능: 말이 없고(누구든) + 타일이 있거나 타일 옆이라 놓을 수 있음.
  const extendable = (c: Hex): boolean => {
    if (pieceAt(board, c) !== undefined) return false
    if (cellAt(board, c) !== undefined) return true
    return hexNeighbors(c).some((n) => cellAt(board, n) !== undefined)
  }
  const out: string[][] = []
  for (const line of findLines(owners, 3)) {
    if (line.cells.length >= LINE_LENGTH) continue // 이미 5목(승리 판정에서 처리)
    const dir = HEX_AXES[line.axis]!
    const before = hexSubtract(hexFromKey(line.cells[0]!), dir)
    const after = hexAdd(hexFromKey(line.cells[line.cells.length - 1]!), dir)
    if (extendable(before) || extendable(after)) out.push(line.cells.map((c) => c))
  }
  return out
}
