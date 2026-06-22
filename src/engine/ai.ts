// 휴리스틱 AI. 순수 TS, DOM 금지. 절대 throw 하지 않고 항상 합법수를 반환한다.
//
// 이 게임의 승리 조건은 헥스판 5목(Gomoku)과 본질이 같고 분기 계수가 매우 크다.
// 전폭 minimax 는 부적합하므로 빔 서치(상위 후보 K개만 여러 수 앞)로 탐색한다:
//   ① 즉시 승리 → ② 상대 즉시 승리 차단 → ③ negamax 빔 서치(평가가 리프).
// 평가는 lines.ts 의 findLines 를 재사용해 2/3/4목 위협을 점수화한다.
//
// 설명서 PDF 초보자 전략 TIP 반영:
//  - TIP#3 "말 5목이 전부": 말 라인 가중치 ≫ 벌집(W.HIVE 작게). 벌집은 수단일 뿐.
//  - TIP#1 "허리 끊기": 상대의 열린 3목을 미리 끊기, 1수 평가로는 못 보지만 빔 서치가
//    "안 끊으면 다음 수에 열린 4목 → 패배"를 내다보고 끊는다.
//  - TIP#2 "타일엔 주인 없다": 벌집 완성 전엔 상대 타일 위에도 말을 놓아 선점 가능
//    (validatePiecePlacement 가 이미 허용, 평가는 라인 기여로 자연히 선점을 선호).

import {
  HEX_AXES,
  hex,
  hexAdd,
  hexDistance,
  hexEquals,
  hexFromKey,
  hexKey,
  hexNeighbors,
  hexSubtract,
  type Hex,
} from './hex'
import { opponent } from './types'
import type { Board, GameState, Move, Player } from './types'
import { cellAt, pieceAt, withPiece, withTile } from './state'
import { findLines, type Line } from './lines'
import { totalHiveScores } from './hive'
import { detectWin } from './victory'
import {
  allowedMoveTypes,
  applyMove,
  frontierCells,
  isTilePlaceable,
  validateMove,
  validatePiecePlacement,
  winningCells,
} from './moves'

// ---- 공개 인터페이스 (난이도 seam) -----------------------------------------

export interface Ai {
  chooseMove(state: GameState): Move
}

export type Difficulty = 'easy' | 'medium' | 'hard'

// AI 성향, 같은 난이도라도 "어디에 가치를 두는가"가 달라진다(관전 대결 특색).
//  balanced 균형 / aggressive 공격형 / defensive 수비형 / hive 벌집형.
export type Persona = 'balanced' | 'aggressive' | 'defensive' | 'hive'

export interface AiOptions {
  difficulty?: Difficulty
  persona?: Persona
  seed?: number
}

interface Cfg {
  useBlock: boolean
  beamWidth: number // 0 = 1수 평가(현재). >0 = 빔 서치(미래)
  beamDepth: number
  noise: number
  relevanceRadius: number
  w: Weights // 성향별 평가 가중치
}

function cfgFor(difficulty: Difficulty): Omit<Cfg, 'w'> {
  switch (difficulty) {
    case 'easy':
      return { useBlock: true, beamWidth: 0, beamDepth: 0, noise: 0, relevanceRadius: 2 }
    case 'hard':
      return { useBlock: true, beamWidth: 8, beamDepth: 4, noise: 0, relevanceRadius: 2 }
    case 'medium':
    default:
      return { useBlock: true, beamWidth: 6, beamDepth: 2, noise: 0, relevanceRadius: 2 }
  }
}

export function createAi(opts: AiOptions = {}): Ai {
  const cfg: Cfg = { ...cfgFor(opts.difficulty ?? 'medium'), w: makeWeights(opts.persona ?? 'balanced') }
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

// ---- 평가 가중치(튜닝 노브) + 성향 프로파일 --------------------------------

export interface Weights {
  OPEN_4: number
  CLOSED_4: number
  OPEN_3: number
  CLOSED_3: number
  OPEN_2: number
  CLOSED_2: number
  HIVE: number
  CENTER: number
  CONTEST: number // 상대의 발전 타일선(곧 벌집) 위에 놓은 내 말 = 선점(허리 끊기)
  SEIZE: number // 상대 색 타일 위에 놓은 내 말 = 선점(TIP#2 "타일엔 주인이 없다")
  FORK: number // 동시 위협(살아있는 위협 2개 이상), 상대가 다 못 막음 = 주도권
  attackMul: number // 내 말 라인/포크 점수 배율(공격성)
  defenseMul: number // 상대 말 라인/포크 점수 배율(수비성)
  tileDev: number // 내 타일선(벌집 진행) 보상(벌집형). 기본 0, 말 우선(known_issues)
}

const BASE_WEIGHTS: Weights = {
  OPEN_4: 100000,
  CLOSED_4: 12000,
  OPEN_3: 2500,
  CLOSED_3: 350,
  OPEN_2: 120,
  CLOSED_2: 20,
  HIVE: 40,
  CENTER: 1,
  CONTEST: 130,
  SEIZE: 45,
  FORK: 10000,
  attackMul: 1,
  defenseMul: 1,
  tileDev: 0,
}

// 성향별 오버라이드. 즉시 승리/차단(pickMove·useBlock)은 모든 성향 공통이라 자멸하진 않고,
// 가치 판단(공격 vs 수비 vs 벌집)만 달라져 관전 대결에 특색이 생긴다.
const PERSONA_OVERRIDES: Record<Persona, Partial<Weights>> = {
  balanced: {},
  aggressive: { attackMul: 1.45, defenseMul: 0.7, FORK: 16000 },
  defensive: { attackMul: 0.8, defenseMul: 1.55, CONTEST: 260 },
  hive: { HIVE: 320, tileDev: 32, attackMul: 0.9 },
}

function makeWeights(persona: Persona): Weights {
  return { ...BASE_WEIGHTS, ...PERSONA_OVERRIDES[persona] }
}

const CENTER_HEX: Hex = hex(0, 0)
const WIN_SCORE = 1e7
const MAX_CANDIDATES = 24 // 노드당 후보 상한(서치 분기 제한)

function minDistToPieces(h: Hex, pieces: Hex[]): number {
  let m = Infinity
  for (const ph of pieces) {
    const d = hexDistance(h, ph)
    if (d < m) m = d
  }
  return m
}

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

function runWeight(len: number, ends: number, w: Weights): number {
  // 양끝이 다 막히면 5목으로 못 늘어남 → 거의 무가치(죽은 줄을 물고 늘어지지 않게).
  if (ends === 0) return len >= 4 ? 60 : 0
  if (len >= 4) return ends >= 2 ? w.OPEN_4 : w.CLOSED_4
  if (len === 3) return ends >= 2 ? w.OPEN_3 : w.CLOSED_3
  if (len === 2) return ends >= 2 ? w.OPEN_2 : w.CLOSED_2
  return 0
}

interface SideStats {
  score: number
  threats: number // 살아있는 위협 수(열린 끝 있는 4목, 열린 3목)
}

function sideStats(board: Board, p: Player, w: Weights): SideStats {
  let score = 0
  let threats = 0
  for (const line of findLines(ownerPieceMap(board, p), 2)) {
    const len = line.cells.length
    if (len >= 5) {
      score += w.OPEN_4 * 10
      threats += 2
      continue
    }
    const ends = openEnds(board, line)
    score += runWeight(len, ends, w)
    if (len >= 4 && ends >= 1) threats++
    else if (len === 3 && ends >= 2) threats++
  }
  return { score, threats }
}

// 동시 위협(포크): 위협이 2개 이상이면 상대가 다 못 막는다 → 사실상 주도권/승리.
function forkBonus(threats: number, w: Weights): number {
  return threats >= 2 ? w.FORK * (threats - 1) : 0
}

function centralityPenalty(board: Board, p: Player): number {
  let d = 0
  for (const h of pieceHexes(board)) {
    const cell = board[hexKey(h)]!
    if (cell.piece && cell.piece.owner === p) d += hexDistance(h, CENTER_HEX)
  }
  return d
}

// p 가 상대의 발전 타일선(길이 3·4, 곧 벌집) 위에 놓은 p 의 말 = 선점(허리 끊기) 보너스.
// 벌집이 잠기기 전에 그 타일을 차지하면, 잠금 후에도 내 말이 남고 상대의 그 칸 사용을 막는다.
function contestBonus(board: Board, p: Player, w: Weights): number {
  const enemyTiles = ownerTileMap(board, opponent(p))
  let s = 0
  for (const line of findLines(enemyTiles, 3)) {
    if (line.cells.length >= 5) continue // 이미 벌집(잠김)
    const weight = line.cells.length === 4 ? w.CONTEST : w.CONTEST * 0.5 // 4목 임박일수록 가치↑
    for (const key of line.cells) {
      const piece = board[key]!.piece
      if (piece && piece.owner === p) s += weight
    }
  }
  return s
}

// 설명서 TIP#1 "허리 끊기"·TIP#2 "타일 선점", me 관점, 반대칭.
function hiveContestTerm(board: Board, me: Player, w: Weights): number {
  return contestBonus(board, me, w) - contestBonus(board, opponent(me), w)
}

// 상대 색 타일 위에 놓인 내 말 = 선점(주도권). 같은 색 타일 위 말은 중립. 반대칭.
function seizeScore(board: Board, me: Player, w: Weights): number {
  let s = 0
  for (const key of Object.keys(board)) {
    const cell = board[key]!
    if (!cell.piece || cell.piece.owner === cell.tile.owner) continue
    s += cell.piece.owner === me ? w.SEIZE : -w.SEIZE
  }
  return s
}

// 내 타일선(벌집 진행) 점수, 벌집형 성향(w.tileDev>0)에서만 작동. 기본 0이라 영향 없음.
function tileDevScore(board: Board, p: Player): number {
  let s = 0
  for (const line of findLines(ownerTileMap(board, p), 3)) {
    const len = line.cells.length
    s += len >= 5 ? 100 : len === 4 ? 30 : 10
  }
  return s
}

function evaluate(board: Board, me: Player, w: Weights): number {
  const opp = opponent(me)
  const m = sideStats(board, me, w)
  const o = sideStats(board, opp, w)
  // attackMul/defenseMul 로 공격성·수비성을 성향별로 기울인다.
  let s = w.attackMul * (m.score + forkBonus(m.threats, w)) - w.defenseMul * (o.score + forkBonus(o.threats, w))
  const hs = totalHiveScores(board)
  s += w.HIVE * (hs[me] - hs[opp])
  s += hiveContestTerm(board, me, w)
  s += seizeScore(board, me, w)
  if (w.tileDev > 0) s += w.tileDev * (tileDevScore(board, me) - tileDevScore(board, opp))
  s -= w.CENTER * centralityPenalty(board, me)
  return s
}

// 위협 셀(완성 가능 셀)은 engine/victory(completingCells)·moves(winningCells)에서 공유한다.

// ---- 이동 생성 -------------------------------------------------------------

interface Candidate {
  move: Move
  at: Hex
}

function moveSig(m: Move): string {
  switch (m.type) {
    case 'twoTiles':
      return `2${hexKey(m.first)}|${hexKey(m.second)}`
    case 'tileAndPiece':
      return `t${hexKey(m.tile)}|${hexKey(m.piece.at)}`
    case 'pieceOnly':
      return `p${hexKey(m.piece.at)}`
  }
}

// 타일 놓을 만한 프론티어 칸을 휴리스틱(내 타일선 연장/인접/중심)으로 순위 매겨 상위 limit개.
function rankedTileSpots(board: Board, me: Player, limit: number): Hex[] {
  const frontier = frontierCells(board)
  if (frontier.length === 0) return []
  const extendCells = new Set<string>()
  for (const line of findLines(ownerTileMap(board, me), 2)) {
    const dir = HEX_AXES[line.axis]!
    extendCells.add(hexKey(hexAdd(hexFromKey(line.cells[line.cells.length - 1]!), dir)))
    extendCells.add(hexKey(hexSubtract(hexFromKey(line.cells[0]!), dir)))
  }
  const score = (f: Hex): number => {
    let s = extendCells.has(hexKey(f)) ? 100 : 0
    for (const n of hexNeighbors(f)) {
      const c = cellAt(board, n)
      if (c && c.tile.owner === me) s += 5
    }
    return s - hexDistance(f, CENTER_HEX) * 0.1
  }
  return frontier
    .map((f) => ({ f, s: score(f) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.f)
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

  // 후보가 너무 많으면(흩어진 보드) 액션 근처 가까운 것부터 상한까지
  if (result.length > MAX_CANDIDATES) {
    const withDist = result.map((h) => ({
      h,
      d: pieces.length === 0 ? hexDistance(h, CENTER_HEX) : minDistToPieces(h, pieces),
    }))
    withDist.sort((a, b) => a.d - b.d)
    return withDist.slice(0, MAX_CANDIDATES).map((x) => x.h)
  }
  return result
}

// 다양한 후보를 생성한다. 핵심: 기존(특히 상대) 타일 위 말 = 선점/허리 끊기,
// 타일 2개(①) = 벌집/영역 발전, 게임 특색을 살린다. 여왕벌은 AI 가 쓰지 않는다(확장 모드 전용).
function generateCandidates(state: GameState, cfg: Cfg): Candidate[] {
  const allowed = allowedMoveTypes(state)
  if (allowed.length === 0) return []
  const me = state.turn
  const board = state.board
  const supply = state.supplies[me]
  const canTaP = allowed.includes('tileAndPiece')
  const canPieceOnly = allowed.includes('pieceOnly')
  const canTwo = allowed.includes('twoTiles')

  const out: Candidate[] = []
  const seen = new Set<string>()
  const add = (move: Move, at: Hex): void => {
    const sig = moveSig(move)
    if (!seen.has(sig)) {
      seen.add(sig)
      out.push({ move, at })
    }
  }

  const tileSpots = canTaP || canTwo ? rankedTileSpots(board, me, 8) : []

  // 말 배치 (② 또는 말만)
  for (const p of relevantCells(board, me, supply, cfg)) {
    if (cellAt(board, p) !== undefined) {
      // 기존 타일 위 말(상대 타일이면 선점/허리 끊기), 부차 타일은 최상위 1개(throwaway)
      if (canTaP) {
        const t = tileSpots.find((ts) => !hexEquals(ts, p))
        if (t) add({ type: 'tileAndPiece', tile: t, piece: { at: p, kind: 'normal' } }, p)
      } else if (canPieceOnly) {
        add({ type: 'pieceOnly', piece: { at: p, kind: 'normal' } }, p)
      }
    } else if (canTaP) {
      // 프론티어: 타일 깔고 그 위에 말(선 확장)
      add({ type: 'tileAndPiece', tile: p, piece: { at: p, kind: 'normal' } }, p)
    }
  }

  // 타일 2개 (①), 상위 타일 + (다른 상위 타일 | T1 의 빈 이웃으로 선 잇기)
  if (canTwo) {
    for (const t1 of tileSpots.slice(0, 4)) {
      const seconds: Hex[] = []
      for (const t2 of tileSpots) if (!hexEquals(t1, t2)) seconds.push(t2)
      for (const n of hexNeighbors(t1)) if (cellAt(board, n) === undefined) seconds.push(n)
      for (const t2 of seconds.slice(0, 3)) add({ type: 'twoTiles', first: t1, second: t2 }, t1)
    }
  }

  return out.filter((c) => validateMove(state, c.move).ok)
}

// ---- 승리/차단 (후보 캡과 무관하게 직접 셀 점유) ----------------------------

// 셀에 내 일반 말을 놓는 **합법수**(validateMove 통과)를 반환. 없으면 null.
// (승리·차단용, 후보 생성/캡과 독립.) AI 는 여왕벌을 안 쓰므로, 잠긴 상대 벌집 칸처럼
// 일반 말로 못 두는 칸은 null 을 돌려 호출 측이 그 승리/차단 칸을 건너뛰게 한다.
//, 이 검증이 없으면 winningCells 가 (queen 가능성으로) 반환한 잠긴 벌집 칸을 normal 로
//    두려다 applyMove 가 throw → vs AI 가 "생각 중"에서 멈추는 버그가 났다.
function placementMove(state: GameState, cell: Hex, me: Player): Move | null {
  const allowed = allowedMoveTypes(state)
  const piece = { at: cell, kind: 'normal' as const }
  const candidates: Move[] = []
  if (cellAt(state.board, cell) !== undefined) {
    if (allowed.includes('tileAndPiece')) {
      const dev = rankedTileSpots(state.board, me, 8).find((t) => !hexEquals(t, cell))
      if (dev) candidates.push({ type: 'tileAndPiece', tile: dev, piece })
    }
    if (allowed.includes('pieceOnly')) candidates.push({ type: 'pieceOnly', piece })
  } else if (allowed.includes('tileAndPiece') && isTilePlaceable(state.board, cell)) {
    candidates.push({ type: 'tileAndPiece', tile: cell, piece })
  }
  for (const m of candidates) if (validateMove(state, m).ok) return m
  return null
}

// 상대 즉시 승리 차단, 위협 셀(winningCells, 캡 무관)을 내 말로 점유. 평가 최고 차단을 고른다.
function findBlock(state: GameState, me: Player, w: Weights): Move | null {
  const opp = opponent(me)
  const threats = winningCells(state.board, opp, state.supplies[opp])
  if (threats.length === 0) return null
  let best: Move | null = null
  let bestScore = -Infinity
  for (const cell of threats) {
    const m = placementMove(state, cell, me) // 이미 합법수만 반환(null 이면 못 막는 칸)
    if (!m) continue
    const s = evaluate(resultBoard(state.board, m, me), me, w)
    if (s > bestScore) {
      bestScore = s
      best = m
    }
  }
  return best
}

// ---- 빔 서치 (여러 수 앞) ---------------------------------------------------

// 점수 종료(타일 소진) 리프 값: 점수 승은 5목 승의 절반쯤으로 평가.
function scoreLeaf(state: GameState, me: Player, w: Weights): number {
  const r = state.result
  if (!r || r.kind !== 'score') return 0
  const diff = r.scores[me] - r.scores[opponent(me)]
  const sign = diff > 0 ? 1 : diff < 0 ? -1 : 0
  return sign * (WIN_SCORE / 2) + diff * w.HIVE
}

// 후보를 1수 평가로 정렬해 상위 beamWidth개만 남긴다(분기 제한).
function beamCandidates(state: GameState, cfg: Cfg): Candidate[] {
  const cands = generateCandidates(state, cfg)
  if (cfg.beamWidth <= 0 || cands.length <= cfg.beamWidth) return cands
  const me = state.turn
  return cands
    .map((c) => ({ c, s: evaluate(resultBoard(state.board, c.move, me), me, cfg.w) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, cfg.beamWidth)
    .map((x) => x.c)
}

// negamax + 알파-베타. 반환값은 state.turn(둘 차례) 관점의 점수.
function negamax(state: GameState, depth: number, alpha: number, beta: number, cfg: Cfg): number {
  const me = state.turn
  if (depth <= 0) return evaluate(state.board, me, cfg.w)
  const cands = beamCandidates(state, cfg)
  if (cands.length === 0) return evaluate(state.board, me, cfg.w)
  const ply = cfg.beamDepth - depth // 빠른 승리 선호용
  let best = -Infinity
  for (const c of cands) {
    let next: GameState
    try {
      next = applyMove(state, c.move)
    } catch {
      continue
    }
    let value: number
    if (next.phase === 'finished') {
      value = next.result?.kind === 'win' ? WIN_SCORE - ply : scoreLeaf(next, me, cfg.w)
    } else if (next.turn === me) {
      value = negamax(next, depth - 1, alpha, beta, cfg) // 패스: 같은 사람 → 창 유지
    } else {
      value = -negamax(next, depth - 1, -beta, -alpha, cfg)
    }
    if (value > best) best = value
    if (best > alpha) alpha = best
    if (alpha >= beta) break // 컷오프
  }
  return best
}

// 루트: 상위 후보를 각각 깊이 탐색해 최선의 수(동점은 시드 RNG).
function searchBestMove(
  state: GameState,
  cfg: Cfg,
  rng: () => number,
  candidates: Candidate[],
): Move | null {
  const me = state.turn
  const roots = candidates
    .map((c) => ({ move: c.move, s: evaluate(resultBoard(state.board, c.move, me), me, cfg.w) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, Math.max(cfg.beamWidth, 1))

  let bestVal = -Infinity
  let ties: Move[] = []
  for (const r of roots) {
    let next: GameState
    try {
      next = applyMove(state, r.move)
    } catch {
      continue
    }
    let val: number
    if (next.phase === 'finished') {
      val = next.result?.kind === 'win' ? WIN_SCORE : scoreLeaf(next, me, cfg.w)
    } else if (next.turn === me) {
      val = negamax(next, cfg.beamDepth - 1, -Infinity, Infinity, cfg)
    } else {
      val = -negamax(next, cfg.beamDepth - 1, -Infinity, Infinity, cfg)
    }
    if (val > bestVal + 1e-9) {
      bestVal = val
      ties = [r.move]
    } else if (Math.abs(val - bestVal) <= 1e-9) {
      ties.push(r.move)
    }
  }
  return ties.length > 0 ? ties[Math.floor(rng() * ties.length)]! : null
}

// ---- 메인 선택 -------------------------------------------------------------

function pickMove(state: GameState, cfg: Cfg, rng: () => number): Move {
  const me = state.turn
  const board = state.board
  const supply = state.supplies[me]
  const candidates = generateCandidates(state, cfg)

  // 1) 즉시 승리, 후보 캡과 무관하게 winningCells 로 확실히 찾는다(붐벼도 자기 승리수를 안 놓침)
  for (const cell of winningCells(board, me, supply)) {
    const m = placementMove(state, cell, me)
    if (m && isWinningMove(board, m, me)) return m
  }

  // 2) 상대 즉시 승리 차단
  if (cfg.useBlock) {
    const block = findBlock(state, me, cfg.w)
    if (block) return block
  }

  // 3) 빔 서치(여러 수 앞), medium/hard. 상대 3목 등 한 수 너머의 위협을 본다.
  if (cfg.beamWidth > 0 && cfg.beamDepth > 1) {
    const searched = searchBestMove(state, cfg, rng, candidates)
    if (searched) return searched
  }

  // 3') 1수 평가(easy / 폴백)
  let ties: Move[] = []
  let bestScore = -Infinity
  for (const c of candidates) {
    const s = evaluate(resultBoard(board, c.move, me), me, cfg.w)
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
  // 최후 수단: 일반 말로 둘 곳이 전혀 없는 막다른 위치(빈 칸이 전부 상대 잠긴 벌집인데
  // 타일도 소진) 에서는 canMove 가 여왕벌로 "둘 수 있다"고 보므로, 합법수 계약을 지키려면
  // 여기서만 예외적으로 여왕벌을 쓴다. AI 의 정규 전략은 아니지만 불법수 반환/정지를 막는다.
  if (!state.supplies[state.turn].queenUsed) {
    for (const key of Object.keys(board)) {
      if (board[key]!.piece) continue
      const at = hexFromKey(key)
      if (allowed.includes('pieceOnly')) {
        const m: Move = { type: 'pieceOnly', piece: { at, kind: 'queen' } }
        if (validateMove(state, m).ok) return m
      }
      if (allowed.includes('tileAndPiece')) {
        const m: Move = { type: 'tileAndPiece', tile: at, piece: { at, kind: 'queen' } }
        if (validateMove(state, m).ok) return m
      }
    }
  }
  // 정말 둘 곳이 없으면(이론상 canMove 가 false 인 상황), 형식상 한 수를 반환한다.
  const f = frontier[0] ?? hex(0, 0)
  return { type: 'tileAndPiece', tile: f, piece: { at: f, kind: 'normal' } }
}
