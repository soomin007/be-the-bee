// MCTS 엔진(engine:'mcts', 실험). 합법 플레이 + 잠긴 회랑 공격(잠그기)·방어(예방) 능력.
// MCTS 탐색은 무거우니 it 별 타임아웃을 준다(known_issues 2026-06-27 CI flaky 방지). sims 는
// 테스트가 빠르도록 작게.
import { describe, it, expect } from 'vitest'
import { createAi, applyMove, createInitialState, hex, hexKey, hiveCountdowns } from '../src/engine/index'
import type { Board, GameState, Move, Player } from '../src/engine/index'

function tile(owner: Player): Board[string] {
  return { tile: { owner } }
}
function tilePiece(owner: Player): Board[string] {
  return { tile: { owner }, piece: { owner, kind: 'normal' } }
}
function pieceCell(m: Move): string | null {
  const at = m.type === 'tileAndPiece' ? m.piece.at : m.type === 'pieceOnly' ? m.piece.at : null
  return at ? `${at.q},${at.r}` : null
}

describe('MCTS 엔진', () => {
  it('합법수만 두고 게임을 진행한다 (MCTS vs easy)', () => {
    const mcts = createAi({ difficulty: 'expert', engine: 'mcts', mctsSims: 250, seed: 7 })
    const easy = createAi({ difficulty: 'easy', seed: 11 })
    let state = createInitialState()
    let plies = 0
    for (; plies < 24 && state.phase === 'playing'; plies++) {
      const ai = state.turn === 'yellow' ? mcts : easy
      state = applyMove(state, ai.chooseMove(state)) // 불법수면 throw → 실패
    }
    expect(plies).toBeGreaterThan(4)
  }, 60000)

  it('잠긴 회랑 공격: MCTS 갈색이 회랑을 잠가 막을 수 없는 5목(movesLeft<=2)을 만든다', () => {
    const board: Board = {}
    board[hexKey(hex(2, 0))] = tilePiece('brown')
    board[hexKey(hex(2, -1))] = tilePiece('brown')
    board[hexKey(hex(2, -2))] = tilePiece('brown')
    board[hexKey(hex(2, -3))] = tilePiece('yellow')
    board[hexKey(hex(6, 0))] = tilePiece('yellow')
    board[hexKey(hex(6, 1))] = tile('yellow')
    const state: GameState = {
      board,
      turn: 'brown',
      supplies: {
        yellow: { tiles: 20, pieces: 20, queenUsed: false },
        brown: { tiles: 20, pieces: 20, queenUsed: false },
      },
      moveNumber: 20,
      phase: 'playing',
      infiniteTiles: false,
      queenEnabled: false,
    }
    const ai = createAi({ difficulty: 'expert', engine: 'mcts', mctsSims: 800, seed: 3 })
    const after = applyMove(state, ai.chooseMove(state))
    const cd = hiveCountdowns(after.board).find((c) => c.owner === 'brown')
    expect(cd?.movesLeft ?? 99).toBeLessThanOrEqual(2)
  }, 60000)

  it('잠긴 회랑 예방: 게임1 잠김 직전(4수) MCTS 갈색이 회랑 칸을 선점한다', () => {
    // 사람(노랑) s=0 회랑 (-1,1)(0,0)(1,-1)(2,-2)(3,-3) — 5수에 잠김. 4수가 마지막 예방 기회.
    // expert(search)는 이 회랑을 못 보고 다른 곳을 두지만(backlog #2), MCTS는 회랑 칸에 말을 선점한다.
    const G1 =
      't -1 1 0 0;2 0 1 2 -1;t 1 -1 1 0;t 2 0 2 0;2 2 -2 3 -3;t 1 1 1 1;t -2 2 1 -1'
    const corridor = new Set(['-1,1', '0,0', '1,-1', '2,-2', '3,-3'])
    const moves: Move[] = G1.split(';').map((tok) => {
      const p = tok.trim().split(/\s+/)
      const n = (i: number): number => Number(p[i])
      if (p[0] === '2') return { type: 'twoTiles', first: hex(n(1), n(2)), second: hex(n(3), n(4)) }
      if (p[0] === 't')
        return { type: 'tileAndPiece', tile: hex(n(1), n(2)), piece: { at: hex(n(3), n(4)), kind: 'normal' } }
      return { type: 'pieceOnly', piece: { at: hex(n(1), n(2)), kind: 'normal' } }
    })
    let s = createInitialState()
    for (let i = 0; i < 3; i++) s = applyMove(s, moves[i]!) // 4수 직전(states[3])
    expect(s.turn).toBe('brown')
    const ai = createAi({ difficulty: 'expert', engine: 'mcts', mctsSims: 1500, seed: 5 })
    const cell = pieceCell(ai.chooseMove(s))
    expect(cell !== null && corridor.has(cell)).toBe(true)
  }, 120000)
})
