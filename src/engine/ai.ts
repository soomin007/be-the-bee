// 휴리스틱 AI. 순수 TS, DOM 금지. 절대 throw 하지 않고 항상 합법수를 반환한다.
//
// 이 게임의 승리 조건은 헥스판 5목(Gomoku)과 본질이 같고 분기 계수가 매우 크다.
// 따라서 깊은 minimax 대신: ① 즉시 승리 → ② 상대 즉시 승리 차단 → ③ 1수 휴리스틱 평가.
// 평가는 lines.ts 의 findLines 를 재사용해 2/3/4목 위협을 점수화한다.
// 난이도는 나중에 "깊이"가 아니라 빔 서치로 올린다(Cfg seam만 마련).

import {
  HEX_AXES,
  hex,
  hexAdd,
  hexDistance,
  hexFromKey,
  hexKey,
  hexNeighbors,
  hexSubtract,
  type Hex,
} from './hex'
import { opponent } from './types'
import type { Board, GameState, Move, PiecePlacement, Player } from './types'
import { cellAt, pieceAt, withPiece, withTile } from './state'
import { findLines, type Line } from './lines'
import { totalHiveScores } from './hive'
import { detectWin } from './victory'
import {
  allowedMoveTypes,
  frontierCells,
  isTilePlaceable,
  validateMove,
  validatePiecePlacement,
} from './moves'

// ---- 공개 인터페이스 (난이도 seam) -----------------------------------------

export interface Ai {
  chooseMove(state: GameState): Move
}

export type Difficulty = 'easy' | 'medium' | 'hard'

export interface AiOptions {
  difficulty?: Difficulty
  seed?: number
}

interface Cfg {
  useBlock: boolean
  beamWidth: number // 0 = 1수 평가(현재). >0 = 빔 서치(미래)
  beamDepth: number
  noise: number
  relevanceRadius: number
}

// v1: 셋 다 medium 으로 resolve. 동작은 1종, 배선만 마련.
function cfgFor(_difficulty: Difficulty): Cfg {
  return { useBlock: true, beamWidth: 0, beamDepth: 0, noise: 0, relevanceRadius: 2 }
}

export function createAi(opts: AiOptions = {}): Ai {
  const cfg = cfgFor(opts.difficulty ?? 'medium')
  const rng = makeRng(opts.seed ?? 0xb17)
  return {
    chooseMove(state: GameState): Move {
      try {
        return pickMove(state, cfg, rng)
      } catch {
        return fallbackMove(state)
      }
    },
  }
}

// ---- 평가 가중치(튜닝 노브) -------------------------------------------------

const W = {
  OPEN_4: 100000,
  CLOSED_4: 12000,
  OPEN_3: 2500,
  CLOSED_3: 350,
  OPEN_2: 120,
  CLOSED_2: 20,
  HIVE: 40,
  CENTER: 1,
} as const

const CENTER_HEX: Hex = hex(0, 0)

// ---- 시드 PRNG (동점 tie-break / 재현성) -----------------------------------

function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---- 보드 보조 -------------------------------------------------------------

function ownerPieceMap(board: Board, owner: Player): Map<string, Player> {
  const m = new Map<string, Player>()
  for (const key of Object.keys(board)) {
    const piece = board[key]!.piece
    if (piece && piece.owner === owner) m.set(key, owner)
  }
  return m
}

function ownerTileMap(board: Board, owner: Player): Map<string, Player> {
  const m = new Map<string, Player>()
  for (const key of Object.keys(board)) {
    if (board[key]!.tile.owner === owner) m.set(key, owner)
  }
  return m
}

function pieceHexes(board: Board): Hex[] {
  const out: Hex[] = []
  for (const key of Object.keys(board)) {
    if (board[key]!.piece) out.push(hexFromKey(key))
  }
  return out
}

// 수를 보드에만 적용한 결과(턴 로직 없음). 평가/승리판정용.
function resultBoard(board: Board, move: Move, player: Player): Board {
  switch (move.type) {
    case 'twoTiles':
      return withTile(withTile(board, move.first, player), move.second, player)
    case 'tileAndPiece':
      return withPiece(withTile(board, move.tile, player), move.piece.at, {
        owner: player,
        kind: move.piece.kind,
      })
    case 'pieceOnly':
      return withPiece(board, move.piece.at, { owner: player, kind: move.piece.kind })
  }
}

function isWinningMove(board: Board, move: Move, me: Player): boolean {
  return detectWin(resultBoard(board, move, me)) === me
}

// ---- 평가 -----------------------------------------------------------------

// 런의 한쪽 끝 셀이 한 수로 완성 가능한가(말 없음 + 타일 있거나 놓을 수 있음).
function extendable(board: Board, cell: Hex): boolean {
  if (pieceAt(board, cell) !== undefined) return false
  if (cellAt(board, cell) !== undefined) return true
  return isTilePlaceable(board, cell)
}

function openEnds(board: Board, line: Line<Player>): number {
  const dir = HEX_AXES[line.axis]!
  const first = hexFromKey(line.cells[0]!)
  const last = hexFromKey(line.cells[line.cells.length - 1]!)
  let ends = 0
  if (extendable(board, hexSubtract(first, dir))) ends++
  if (extendable(board, hexAdd(last, dir))) ends++
  return ends
}

function runWeight(len: number, ends: number): number {
  if (len >= 4) return ends >= 2 ? W.OPEN_4 : ends === 1 ? W.CLOSED_4 : W.CLOSED_4 * 0.25
  if (len === 3) return ends >= 2 ? W.OPEN_3 : ends === 1 ? W.CLOSED_3 : 0
  if (len === 2) return ends >= 2 ? W.OPEN_2 : ends === 1 ? W.CLOSED_2 : 0
  return 0
}

function lineScore(board: Board, p: Player): number {
  let s = 0
  for (const line of findLines(ownerPieceMap(board, p), 2)) {
    if (line.cells.length >= 5) {
      s += W.OPEN_4 * 10
      continue
    }
    s += runWeight(line.cells.length, openEnds(board, line))
  }
  return s
}

function centralityPenalty(board: Board, p: Player): number {
  let d = 0
  for (const h of pieceHexes(board)) {
    const cell = board[hexKey(h)]!
    if (cell.piece && cell.piece.owner === p) d += hexDistance(h, CENTER_HEX)
  }
  return d
}

function evaluate(board: Board, me: Player): number {
  const opp = opponent(me)
  let s = lineScore(board, me) - lineScore(board, opp)
  const hs = totalHiveScores(board)
  s += W.HIVE * (hs[me] - hs[opp])
  s -= W.CENTER * centralityPenalty(board, me)
  return s
}

// ---- 위협 셀 (승리/차단) ---------------------------------------------------

// player 의 말을 놓으면 5목이 완성되는 빈 셀들(도달 가능성은 따지지 않음).
// 5목을 만들려면 새 말이 기존 말과 축으로 인접해야 하므로, 후보는 player 말의 이웃뿐.
function completingCells(board: Board, player: Player): Hex[] {
  const out: Hex[] = []
  const seen = new Set<string>()
  for (const ph of pieceHexes(board)) {
    if (board[hexKey(ph)]!.piece!.owner !== player) continue
    for (const n of hexNeighbors(ph)) {
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

// 상대가 다음 한 수로 실제 5목을 완성할 수 있는 셀(도달 가능성 포함).
function opponentWinningCells(board: Board, opp: Player, oppSupply: GameState['supplies'][Player]): Hex[] {
  return completingCells(board, opp).filter((c) => {
    if (cellAt(board, c) !== undefined) {
      return (
        validatePiecePlacement(board, opp, oppSupply, { at: c, kind: 'normal' }).ok ||
        (!oppSupply.queenUsed && validatePiecePlacement(board, opp, oppSupply, { at: c, kind: 'queen' }).ok)
      )
    }
    return oppSupply.tiles >= 1 && isTilePlaceable(board, c)
  })
}

// ---- 이동 생성 -------------------------------------------------------------

interface Candidate {
  move: Move
  at: Hex
}

// 내 타일선을 늘리는/인접/중심 휴리스틱으로 ② 의 부차 타일 1개 선택. (한 턴에 1회 계산해 공용)
function bestDevelopmentTile(board: Board, me: Player): Hex | null {
  const frontier = frontierCells(board)
  if (frontier.length === 0) return null
  const extendCells = new Set<string>()
  for (const line of findLines(ownerTileMap(board, me), 2)) {
    const dir = HEX_AXES[line.axis]!
    extendCells.add(hexKey(hexAdd(hexFromKey(line.cells[line.cells.length - 1]!), dir)))
    extendCells.add(hexKey(hexSubtract(hexFromKey(line.cells[0]!), dir)))
  }
  let best = frontier[0]!
  let bestScore = -Infinity
  for (const f of frontier) {
    let s = extendCells.has(hexKey(f)) ? 100 : 0
    for (const n of hexNeighbors(f)) {
      const c = cellAt(board, n)
      if (c && c.tile.owner === me) s += 5
    }
    s -= hexDistance(f, CENTER_HEX) * 0.1
    if (s > bestScore) {
      bestScore = s
      best = f
    }
  }
  return best
}

function relevantCells(board: Board, me: Player, supply: GameState['supplies'][Player], cfg: Cfg): Hex[] {
  const pieces = pieceHexes(board)
  const relevant = (h: Hex): boolean =>
    pieces.length === 0 || pieces.some((ph) => hexDistance(h, ph) <= cfg.relevanceRadius)

  const result: Hex[] = []
  const seen = new Set<string>()
  const add = (h: Hex): void => {
    const k = hexKey(h)
    if (!seen.has(k)) {
      seen.add(k)
      result.push(h)
    }
  }

  // 빈·합법 기존 타일
  for (const key of Object.keys(board)) {
    if (board[key]!.piece) continue
    const h = hexFromKey(key)
    if (validatePiecePlacement(board, me, supply, { at: h, kind: 'normal' }).ok && relevant(h)) add(h)
  }
  // 프론티어(타일이 있어야 의미)
  if (supply.tiles >= 1) {
    for (const f of frontierCells(board)) if (relevant(f)) add(f)
  }

  // 가지치기로 비었으면(드묾) 가지치기 없이 다시
  if (result.length === 0) {
    for (const key of Object.keys(board)) {
      if (board[key]!.piece) continue
      const h = hexFromKey(key)
      if (validatePiecePlacement(board, me, supply, { at: h, kind: 'normal' }).ok) add(h)
    }
    if (supply.tiles >= 1) for (const f of frontierCells(board)) add(f)
  }
  return result
}

function generateCandidates(state: GameState, cfg: Cfg): Candidate[] {
  const allowed = allowedMoveTypes(state)
  if (allowed.length === 0) return []
  const me = state.turn
  const board = state.board
  const supply = state.supplies[me]
  const canTileAndPiece = allowed.includes('tileAndPiece')
  const canPieceOnly = allowed.includes('pieceOnly')
  const dev = canTileAndPiece ? bestDevelopmentTile(board, me) : null

  const out: Candidate[] = []
  for (const x of relevantCells(board, me, supply, cfg)) {
    const onExistingTile = cellAt(board, x) !== undefined
    const placement: PiecePlacement = { at: x, kind: 'normal' }
    if (onExistingTile) {
      if (canTileAndPiece && dev) out.push({ move: { type: 'tileAndPiece', tile: dev, piece: placement }, at: x })
      else if (canPieceOnly) out.push({ move: { type: 'pieceOnly', piece: placement }, at: x })
    } else if (canTileAndPiece) {
      out.push({ move: { type: 'tileAndPiece', tile: x, piece: { at: x, kind: 'normal' } }, at: x })
    }
  }
  return out.filter((c) => validateMove(state, c.move).ok)
}

// 여왕벌을 셀 C 에 놓는 합법수(승리/차단 전용). 없으면 null.
function queenPlacementMove(state: GameState, c: Hex, me: Player): Move | null {
  const allowed = allowedMoveTypes(state)
  const placement: PiecePlacement = { at: c, kind: 'queen' }
  if (cellAt(state.board, c) !== undefined) {
    if (allowed.includes('tileAndPiece')) {
      const dev = bestDevelopmentTile(state.board, me)
      if (dev) return { type: 'tileAndPiece', tile: dev, piece: placement }
    }
    if (allowed.includes('pieceOnly')) return { type: 'pieceOnly', piece: placement }
    return null
  }
  if (allowed.includes('tileAndPiece') && isTilePlaceable(state.board, c)) {
    return { type: 'tileAndPiece', tile: c, piece: placement }
  }
  return null
}

// ---- 차단 -----------------------------------------------------------------

function findBlock(state: GameState, candidates: Candidate[], me: Player): Move | null {
  const opp = opponent(me)
  const threats = opponentWinningCells(state.board, opp, state.supplies[opp])
  if (threats.length === 0) return null
  const threatKeys = new Set(threats.map(hexKey))

  // 일반 말로 위협 셀을 점유하는 후보 중 평가 최고
  let best: Move | null = null
  let bestScore = -Infinity
  for (const c of candidates) {
    if (!threatKeys.has(hexKey(c.at))) continue
    const s = evaluate(resultBoard(state.board, c.move, me), me)
    if (s > bestScore) {
      bestScore = s
      best = c.move
    }
  }
  if (best) return best

  // 일반 말로 못 막으면(잠긴 칸 등) 여왕벌로 차단 시도
  if (!state.supplies[me].queenUsed) {
    for (const c of threats) {
      const qm = queenPlacementMove(state, c, me)
      if (qm && validateMove(state, qm).ok) return qm
    }
  }
  return null
}

// ---- 메인 선택 -------------------------------------------------------------

function pickMove(state: GameState, cfg: Cfg, rng: () => number): Move {
  const me = state.turn
  const board = state.board
  const supply = state.supplies[me]
  const candidates = generateCandidates(state, cfg)

  // 1) 즉시 승리
  for (const c of candidates) if (isWinningMove(board, c.move, me)) return c.move
  // 1b) 여왕벌로만 가능한 승리(상대 잠금 칸 등)
  if (!supply.queenUsed) {
    for (const c of completingCells(board, me)) {
      const qm = queenPlacementMove(state, c, me)
      if (qm && isWinningMove(board, qm, me) && validateMove(state, qm).ok) return qm
    }
  }

  // 2) 상대 즉시 승리 차단
  if (cfg.useBlock) {
    const block = findBlock(state, candidates, me)
    if (block) return block
  }

  // 3) 평가 최댓값(동점은 시드 RNG)
  let ties: Move[] = []
  let bestScore = -Infinity
  for (const c of candidates) {
    const s = evaluate(resultBoard(board, c.move, me), me)
    if (s > bestScore + 1e-9) {
      bestScore = s
      ties = [c.move]
    } else if (Math.abs(s - bestScore) <= 1e-9) {
      ties.push(c.move)
    }
  }
  if (ties.length > 0) return ties[Math.floor(rng() * ties.length)]!

  // 4) 폴백
  return fallbackMove(state)
}

// 항상 합법수를 반환(throw 안 함). 게임이 진행 중이면 반드시 하나는 존재.
function fallbackMove(state: GameState): Move {
  const allowed = allowedMoveTypes(state)
  const board = state.board
  const frontier = frontierCells(board)

  if (allowed.includes('tileAndPiece')) {
    for (const f of frontier) {
      const m: Move = { type: 'tileAndPiece', tile: f, piece: { at: f, kind: 'normal' } }
      if (validateMove(state, m).ok) return m
    }
    const dev = frontier[0]
    if (dev) {
      for (const key of Object.keys(board)) {
        if (board[key]!.piece) continue
        const m: Move = { type: 'tileAndPiece', tile: dev, piece: { at: hexFromKey(key), kind: 'normal' } }
        if (validateMove(state, m).ok) return m
      }
    }
  }
  if (allowed.includes('pieceOnly')) {
    for (const key of Object.keys(board)) {
      if (board[key]!.piece) continue
      const m: Move = { type: 'pieceOnly', piece: { at: hexFromKey(key), kind: 'normal' } }
      if (validateMove(state, m).ok) return m
    }
  }
  if (allowed.includes('twoTiles') && frontier.length >= 1) {
    const first = frontier[0]!
    for (const second of frontierCells(withTile(board, first, state.turn))) {
      const m: Move = { type: 'twoTiles', first, second }
      if (validateMove(state, m).ok) return m
    }
  }
  // 도달 불가(이론상): 형식상 합법수 형태 하나 반환
  const f = frontier[0] ?? hex(0, 0)
  return { type: 'tileAndPiece', tile: f, piece: { at: f, kind: 'normal' } }
}
