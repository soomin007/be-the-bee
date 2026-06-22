// 수의 검증과 적용. 순수 함수 (state, move) => newState. 입력을 변형하지 않는다.
//
// 턴 규칙(design/rules.md §4):
//  - 한 턴에 ① 타일 2개  또는 ② 타일 1개 + 말 1개  중 하나.
//  - 선플레이어(노랑)의 첫 턴은 ②만 가능.
//  - 모든 타일은 기존 타일에 한 변 이상 인접해야 한다(색 무관).
//  - 더 놓을 타일이 없으면 그 턴은 "말 1개만"(pieceOnly) 가능.
//  - 승리(말 5목)는 벌집 처리보다 우선(§8.3).

import { hexEquals, hexFromKey, hexKey, hexNeighbors, type Hex } from './hex'
import { opponent } from './types'
import type {
  Board,
  GameResult,
  GameState,
  Move,
  PiecePlacement,
  Player,
  PlayerSupply,
} from './types'
import { cellAt, withPiece, withTile } from './state'
import { lockedTiles, totalHiveScores } from './hive'
import { completingCells, detectWin } from './victory'

export type ValidationResult = { readonly ok: true } | { readonly ok: false; readonly reason: string }

const ok: ValidationResult = { ok: true }
function fail(reason: string): ValidationResult {
  return { ok: false, reason }
}

/** 타일을 놓을 수 있는가: 빈 칸이면서 기존 타일에 한 변 이상 인접. */
export function isTilePlaceable(board: Board, at: Hex): boolean {
  if (cellAt(board, at) !== undefined) return false
  return hexNeighbors(at).some((n) => cellAt(board, n) !== undefined)
}

/** 주어진 보드/플레이어/자원 기준으로 말 배치가 합법인지. */
export function validatePiecePlacement(
  board: Board,
  player: Player,
  supply: PlayerSupply,
  placement: PiecePlacement,
): ValidationResult {
  const cell = cellAt(board, placement.at)
  if (cell === undefined) return fail('말은 타일 위에만 놓을 수 있습니다')
  if (cell.piece !== undefined) return fail('이미 말이 있는 칸입니다')
  if (supply.pieces <= 0) return fail('남은 말이 없습니다')
  if (placement.kind === 'queen') {
    if (supply.queenUsed) return fail('여왕벌은 게임당 한 번만 쓸 수 있습니다')
    return ok // 여왕벌은 벌집 잠금을 무시한다(§6)
  }
  const lock = lockedTiles(board).get(hexKey(placement.at))
  if (lock !== undefined && lock !== player) {
    return fail('상대 벌집을 이루는 타일에는 말을 놓을 수 없습니다')
  }
  return ok
}

/** 이번 턴에 허용되는 수의 종류. */
export function allowedMoveTypes(state: GameState): Array<Move['type']> {
  if (state.phase === 'finished') return []
  const supply = state.supplies[state.turn]
  if (state.moveNumber === 0) return ['tileAndPiece'] // 선플레이어 첫 턴은 ②만
  if (supply.tiles <= 0) return ['pieceOnly']
  const types: Array<Move['type']> = []
  if (supply.tiles >= 2) types.push('twoTiles')
  if (supply.tiles >= 1) types.push('tileAndPiece')
  return types
}

const MOVE_LABEL: Record<Move['type'], string> = {
  twoTiles: '타일 2개',
  tileAndPiece: '타일 1개 + 말 1개',
  pieceOnly: '말 1개',
}

/** 수가 합법인지 검증(이유 포함). 적용은 applyMove. */
export function validateMove(state: GameState, move: Move): ValidationResult {
  if (state.phase === 'finished') return fail('게임이 이미 끝났습니다')
  const player = state.turn
  const supply = state.supplies[player]
  const board = state.board

  if (!allowedMoveTypes(state).includes(move.type)) {
    return fail(`이번 턴에는 "${MOVE_LABEL[move.type]}"를 할 수 없습니다`)
  }

  switch (move.type) {
    case 'twoTiles': {
      if (hexEquals(move.first, move.second)) return fail('같은 칸에 타일 두 개를 놓을 수 없습니다')
      if (!isTilePlaceable(board, move.first)) return fail('첫 타일은 기존 타일에 인접해야 합니다')
      const board1 = withTile(board, move.first, player)
      if (!isTilePlaceable(board1, move.second)) return fail('둘째 타일은 기존 타일에 인접해야 합니다')
      return ok
    }
    case 'tileAndPiece': {
      if (!isTilePlaceable(board, move.tile)) return fail('타일은 기존 타일에 인접해야 합니다')
      const board1 = withTile(board, move.tile, player)
      return validatePiecePlacement(board1, player, supply, move.piece)
    }
    case 'pieceOnly':
      return validatePiecePlacement(board, player, supply, move.piece)
  }
}

/** 플레이어가 둘 수 있는 수가 하나라도 있는가(종료 판정용). */
function canMove(board: Board, player: Player, supply: PlayerSupply): boolean {
  // 보드에 타일이 있는 한 무한 평면의 인접 빈칸은 항상 존재 → 타일이 있으면 둘 수 있음.
  if (supply.tiles >= 1) return true
  if (supply.pieces <= 0) return false
  const locks = lockedTiles(board)
  for (const key of Object.keys(board)) {
    if (board[key]!.piece !== undefined) continue
    const lock = locks.get(key)
    const canNormal = lock === undefined || lock === player
    const canQueen = !supply.queenUsed
    if (canNormal || canQueen) return true
  }
  return false
}

function scoreResult(board: Board): GameResult {
  const scores = totalHiveScores(board)
  const winner: Player | 'draw' =
    scores.yellow > scores.brown ? 'yellow' : scores.brown > scores.yellow ? 'brown' : 'draw'
  return { kind: 'score', scores, winner }
}

/** 수를 적용한 새 상태를 반환. 불법이면 throw. */
export function applyMove(state: GameState, move: Move): GameState {
  const v = validateMove(state, move)
  if (!v.ok) throw new Error(`잘못된 수: ${v.reason}`)

  const player = state.turn
  const supply = state.supplies[player]
  let board = state.board
  let tilesUsed = 0
  let pieceUsed = false
  let queenUsed = supply.queenUsed

  switch (move.type) {
    case 'twoTiles':
      board = withTile(board, move.first, player)
      board = withTile(board, move.second, player)
      tilesUsed = 2
      break
    case 'tileAndPiece':
      board = withTile(board, move.tile, player)
      tilesUsed = 1
      board = withPiece(board, move.piece.at, { owner: player, kind: move.piece.kind })
      pieceUsed = true
      if (move.piece.kind === 'queen') queenUsed = true
      break
    case 'pieceOnly':
      board = withPiece(board, move.piece.at, { owner: player, kind: move.piece.kind })
      pieceUsed = true
      if (move.piece.kind === 'queen') queenUsed = true
      break
  }

  const infinite = state.infiniteTiles === true
  const newSupply: PlayerSupply = {
    tiles: infinite ? supply.tiles : supply.tiles - tilesUsed, // 무한 모드: 타일 미차감
    pieces: supply.pieces - (pieceUsed ? 1 : 0),
    queenUsed,
  }
  const supplies: Record<Player, PlayerSupply> = { ...state.supplies, [player]: newSupply }
  const moveNumber = state.moveNumber + 1
  const base = { board, supplies, moveNumber, infiniteTiles: state.infiniteTiles }

  // 1) 승리(말 5목) 우선 판정 (§8.3)
  const winner = detectWin(board)
  if (winner !== null) {
    return { ...base, turn: player, phase: 'finished', result: { kind: 'win', winner } }
  }

  const other = opponent(player)
  if (infinite) {
    // 무한 모드(디지털 변형): 타일 소진 종료가 없다. 양쪽 말이 모두 소진되면 더 둘 의미가 없어
    // 벌집 점수로 종료, 아니면 항상 상대 차례(말이 없어도 타일은 둘 수 있어 패스가 없다).
    if (newSupply.pieces <= 0 && supplies[other].pieces <= 0) {
      return { ...base, turn: player, phase: 'finished', result: scoreResult(board) }
    }
    return { ...base, turn: other, phase: 'playing' }
  }

  // 2) 표준 모드: 둘 다 못 두면(타일 소진 등) 벌집 점수로 종료(§9).
  const otherCanMove = canMove(board, other, supplies[other])
  const selfCanMove = canMove(board, player, supplies[player])
  if (!otherCanMove && !selfCanMove) {
    return { ...base, turn: player, phase: 'finished', result: scoreResult(board) }
  }
  // 상대가 못 두면 패스되어 같은 사람이 계속 둔다.
  const turn = otherCanMove ? other : player
  return { ...base, turn, phase: 'playing' }
}

/**
 * player 가 "다음 한 수로" 실제 5목을 완성할 수 있는 셀(도달 가능성 포함).
 * 기존 타일이면 그 위에 말을 놓을 수 있어야 하고(잠금/여왕벌 고려),
 * 빈 프론티어면 타일이 남아 있어야 한다(한 수로 타일+말). 위협/리치 표시·AI 차단에 쓴다.
 */
export function winningCells(board: Board, player: Player, supply: PlayerSupply): Hex[] {
  return completingCells(board, player).filter((c) => {
    if (cellAt(board, c) !== undefined) {
      return (
        validatePiecePlacement(board, player, supply, { at: c, kind: 'normal' }).ok ||
        (!supply.queenUsed && validatePiecePlacement(board, player, supply, { at: c, kind: 'queen' }).ok)
      )
    }
    return supply.tiles >= 1 && isTilePlaceable(board, c)
  })
}

/** 빈 칸 중 기존 타일에 인접한 곳들(UI에서 타일 놓을 자리 표시용). */
export function frontierCells(board: Board): Hex[] {
  const seen = new Set<string>()
  const out: Hex[] = []
  for (const key of Object.keys(board)) {
    for (const n of hexNeighbors(hexFromKey(key))) {
      const k = hexKey(n)
      if (board[k] === undefined && !seen.has(k)) {
        seen.add(k)
        out.push(n)
      }
    }
  }
  return out
}
