// 초기 상태 생성과 보드 접근/갱신 헬퍼. 모두 순수 함수이며 입력을 변형하지 않는다.

import { hex, hexKey, type Hex } from './hex'
import type { Board, Cell, GameState, Piece, Player, PlayerSupply, Tile } from './types'

/** 각 플레이어 보유 자원(design/rules.md §8.6). 시작 시드 타일은 풀에서 차감하지 않는다. */
export const STARTING_TILES = 30
export const STARTING_PIECES = 30

/** 한 직선이 벌집/승리로 인정되는 최소 길이(design/rules.md §1, §2). */
export const LINE_LENGTH = 5

function freshSupply(): PlayerSupply {
  return { tiles: STARTING_TILES, pieces: STARTING_PIECES, queenUsed: false }
}

/**
 * 초기 보드: 노란 타일 1개와 갈색 타일 1개가 한 변을 맞댄 상태(design/rules.md §3).
 * 노랑을 원점에, 갈색을 동쪽 이웃 hex(1,0) 에 둔다. 말은 아직 없다.
 * 시작 타일은 시드이며 각자 보유 30개에서 차감하지 않는다.
 */
export function createInitialState(): GameState {
  const board: Board = {}
  board[hexKey(hex(0, 0))] = { tile: { owner: 'yellow' } }
  board[hexKey(hex(1, 0))] = { tile: { owner: 'brown' } }
  return {
    board,
    turn: 'yellow',
    supplies: { yellow: freshSupply(), brown: freshSupply() },
    moveNumber: 0,
    phase: 'playing',
  }
}

/** 좌표의 칸(없으면 undefined). */
export function cellAt(board: Board, at: Hex): Cell | undefined {
  return board[hexKey(at)]
}

/** 좌표의 타일(없으면 undefined). */
export function tileAt(board: Board, at: Hex): Tile | undefined {
  return board[hexKey(at)]?.tile
}

/** 좌표의 말(없으면 undefined). */
export function pieceAt(board: Board, at: Hex): Piece | undefined {
  return board[hexKey(at)]?.piece
}

/** 타일을 놓은 새 보드를 반환(원본 불변). 이미 타일이 있으면 호출 측이 검증했어야 한다. */
export function withTile(board: Board, at: Hex, owner: Player): Board {
  return { ...board, [hexKey(at)]: { tile: { owner } } }
}

/** 기존 타일 위에 말을 올린 새 보드를 반환(원본 불변). */
export function withPiece(board: Board, at: Hex, piece: Piece): Board {
  const key = hexKey(at)
  const cell = board[key]
  if (cell === undefined) throw new Error(`타일이 없는 칸에 말을 놓을 수 없음: ${key}`)
  return { ...board, [key]: { tile: cell.tile, piece } }
}
