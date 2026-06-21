// 게임 도메인 타입. 모두 JSON 직렬화 가능해야 한다(undo/replay/save/netcode 대비).
// 좌표만 Hex 를 쓰고, 보드 저장은 좌표 문자열 키(hexKey)로 한다.

import type { Hex } from './hex'

/** 진영. 선플레이어 = yellow, 후플레이어 = brown. 타일 색 = 말 소유자 색. */
export type Player = 'yellow' | 'brown'

/** 말 종류. 여왕벌(queen)은 게임 중 한 번, 잠긴 벌집도 무시하고 놓을 수 있다. */
export type PieceKind = 'normal' | 'queen'

/** 보드에 놓인 타일. 색 = 소유자. */
export interface Tile {
  readonly owner: Player
}

/** 타일 위에 올라간 말. */
export interface Piece {
  readonly owner: Player
  readonly kind: PieceKind
}

/** 보드의 한 칸: 타일 하나(필수)와 그 위의 말(선택). */
export interface Cell {
  readonly tile: Tile
  readonly piece?: Piece
}

/** 좌표 문자열 키(hexKey) → 칸. 희소 보드. JSON 직렬화 가능. */
export type Board = Record<string, Cell>

/** 완성된 벌집: 같은 색 타일 5개 이상이 한 축을 따라 연속된 직선. */
export interface Hive {
  readonly owner: Player
  /** 직선을 이루는 칸들의 hexKey, 축을 따라 정렬됨. */
  readonly cells: readonly string[]
}

/** 한 플레이어의 보유 자원. */
export interface PlayerSupply {
  readonly tiles: number
  readonly pieces: number
  readonly queenUsed: boolean
}

/** 말을 놓는 한 번의 배치. */
export interface PiecePlacement {
  readonly at: Hex
  readonly kind: PieceKind
}

/**
 * 한 턴에 수행하는 수(이 엔진에서는 턴 전체를 하나의 원자적 Move 로 본다).
 * - twoTiles: 타일 2개 (①). first 를 먼저 놓고, second 는 first 포함 보드에 인접해야 한다.
 * - tileAndPiece: 타일 1개 + 말 1개 (②). 타일을 먼저 놓고, 임의의 타일 위에 말을 올린다.
 * - pieceOnly: 말 1개만. 더 놓을 타일이 없는 플레이어의 턴 한정.
 */
export type Move =
  | { readonly type: 'twoTiles'; readonly first: Hex; readonly second: Hex }
  | { readonly type: 'tileAndPiece'; readonly tile: Hex; readonly piece: PiecePlacement }
  | { readonly type: 'pieceOnly'; readonly piece: PiecePlacement }

/** 게임 종료 결과. */
export type GameResult =
  | { readonly kind: 'win'; readonly winner: Player } // 말 5목
  | {
      // 타일 소진 등으로 더 둘 수 없을 때 벌집 점수로 결정
      readonly kind: 'score'
      readonly scores: Record<Player, number>
      readonly winner: Player | 'draw'
    }

export type Phase = 'playing' | 'finished'

/** 게임 전체 상태. 순수·직렬화 가능. applyMove 가 이 값을 새로 만들어 반환한다. */
export interface GameState {
  readonly board: Board
  readonly turn: Player
  readonly supplies: Record<Player, PlayerSupply>
  /** 적용된 수의 누적 개수. 0 이면 선플레이어의 첫 턴(②만 가능). */
  readonly moveNumber: number
  readonly phase: Phase
  readonly result?: GameResult
}

/** 상대 진영. */
export function opponent(p: Player): Player {
  return p === 'yellow' ? 'brown' : 'yellow'
}
